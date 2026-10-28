import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { Artifact, Job, JobInput, JobResult, Session, TaskKind } from '@subswarm/shared';
import { ApiFailure } from './errors.js';

type JobRow = { data: string };

export class Store {
  private readonly db: Database.Database;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed')),
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS jobs_owner_status ON jobs(session_id, status);
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id),
        session_id TEXT NOT NULL REFERENCES sessions(id),
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS artifacts_owner ON artifacts(session_id);
      CREATE TABLE IF NOT EXISTS daily_usage (
        session_id TEXT NOT NULL REFERENCES sessions(id),
        day TEXT NOT NULL,
        count INTEGER NOT NULL,
        PRIMARY KEY(session_id, day)
      );
    `);
    this.recoverInterruptedJobs();
  }

  createSession(): { session: Session; token: string } {
    const token = randomBytes(32).toString('base64url');
    const session = { id: randomUUID(), name: 'My workspace' };
    this.db.prepare('INSERT INTO sessions (id, token_hash, expires_at) VALUES (?, ?, ?)')
      .run(session.id, this.hashToken(token), Date.now() + 30 * 24 * 60 * 60 * 1000);
    return { session, token };
  }

  findSession(token: string | undefined): Session | undefined {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
    const row = this.db.prepare('SELECT id FROM sessions WHERE token_hash = ? AND expires_at > ?')
      .get(this.hashToken(token), Date.now()) as { id: string } | undefined;
    return row ? { id: row.id, name: 'My workspace' } : undefined;
  }

  listJobs(sessionId: string): Job[] {
    return (this.db.prepare('SELECT data FROM jobs WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT 100')
      .all(sessionId) as JobRow[]).map((row) => JSON.parse(row.data) as Job);
  }

  findJob(sessionId: string, id: string): Job | undefined {
    const row = this.db.prepare('SELECT data FROM jobs WHERE session_id = ? AND id = ?')
      .get(sessionId, id) as JobRow | undefined;
    return row ? JSON.parse(row.data) as Job : undefined;
  }

  reserveJob(sessionId: string, input: JobInput, kind: TaskKind, concurrentLimit: number, dailyLimit: number, paidLimits: { daily: number; concurrent: number } = { daily: 20, concurrent: 2 }): Job {
    return this.db.transaction(() => {
      const { count } = this.db.prepare("SELECT count(*) AS count FROM jobs WHERE session_id = ? AND status IN ('queued','running')")
        .get(sessionId) as { count: number };
      if (count >= concurrentLimit) throw new ApiFailure('concurrency_limit', 'Wait for an active job to finish before starting another.', 429);
      if (input.providerId !== 'network') {
        const paid = this.db.prepare("SELECT count(*) AS count FROM jobs WHERE json_extract(data, '$.providerId') != 'network' AND status IN ('queued','running')")
          .get() as { count: number };
        if (paid.count >= paidLimits.concurrent) throw new ApiFailure('provider_concurrency_limit', 'The shared provider queue is busy. Try again after an active job finishes.', 429);
        const daily = this.db.prepare("SELECT count(*) AS count FROM jobs WHERE json_extract(data, '$.providerId') != 'network' AND created_at >= ?")
          .get(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`) as { count: number };
        if (daily.count >= paidLimits.daily) throw new ApiFailure('provider_daily_limit', 'The shared provider request limit has been reached for today.', 429);
      }
      this.consumeDailyRequest(sessionId, dailyLimit);
      const now = new Date().toISOString();
      const job: Job = {
        id: randomUUID(), providerId: input.providerId, kind, input, status: 'queued',
        createdAt: now, updatedAt: now, result: null, error: null,
      };
      this.db.prepare('INSERT INTO jobs (id, session_id, status, created_at, data) VALUES (?, ?, ?, ?, ?)')
        .run(job.id, sessionId, job.status, now, JSON.stringify(job));
      return job;
    }).immediate();
  }

  consumeRequest(sessionId: string, dailyLimit: number): void {
    this.db.transaction(() => this.consumeDailyRequest(sessionId, dailyLimit)).immediate();
  }

  startJob(sessionId: string, id: string): Job | undefined {
    return this.db.transaction(() => {
      const job = this.findJob(sessionId, id);
      if (!job || job.status !== 'queued') return undefined;
      job.status = 'running';
      job.updatedAt = new Date().toISOString();
      this.db.prepare("UPDATE jobs SET status = 'running', data = ? WHERE id = ? AND status = 'queued'")
        .run(JSON.stringify(job), id);
      return job;
    }).immediate();
  }

  finishJob(sessionId: string, id: string, result: JobResult): void {
    this.db.transaction(() => {
      const job = this.findJob(sessionId, id);
      if (!job || job.status !== 'running') return;
      const now = new Date().toISOString();
      job.status = 'completed';
      job.updatedAt = now;
      job.result = result;
      const artifact: Artifact = {
        id: randomUUID(), jobId: id, providerId: job.providerId,
        title: result.title, content: result.text,
        type: job.kind === 'network-scan' ? 'network-report' : job.kind === 'video-search' ? 'video' : job.kind === 'search' ? 'search' : 'text',
        createdAt: now,
      };
      this.db.prepare("UPDATE jobs SET status = 'completed', data = ? WHERE id = ?").run(JSON.stringify(job), id);
      this.db.prepare('INSERT INTO artifacts (id, job_id, session_id, created_at, data) VALUES (?, ?, ?, ?, ?)')
        .run(artifact.id, id, sessionId, now, JSON.stringify(artifact));
    }).immediate();
  }

  failJob(sessionId: string, id: string, message: string): void {
    this.db.transaction(() => {
      const job = this.findJob(sessionId, id);
      if (!job || !['queued', 'running'].includes(job.status)) return;
      job.status = 'failed';
      job.updatedAt = new Date().toISOString();
      job.error = message;
      this.db.prepare("UPDATE jobs SET status = 'failed', data = ? WHERE id = ?").run(JSON.stringify(job), id);
    }).immediate();
  }

  listArtifacts(sessionId: string): Artifact[] {
    return (this.db.prepare('SELECT data FROM artifacts WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT 100')
      .all(sessionId) as JobRow[]).map((row) => JSON.parse(row.data) as Artifact);
  }

  close(): void {
    this.db.close();
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private consumeDailyRequest(sessionId: string, limit: number): void {
    const day = new Date().toISOString().slice(0, 10);
    const row = this.db.prepare('SELECT count FROM daily_usage WHERE session_id = ? AND day = ?')
      .get(sessionId, day) as { count: number } | undefined;
    if ((row?.count ?? 0) >= limit) throw new ApiFailure('daily_limit', 'This workspace has reached its daily request limit. Try again tomorrow.', 429);
    this.db.prepare('INSERT INTO daily_usage (session_id, day, count) VALUES (?, ?, 1) ON CONFLICT(session_id, day) DO UPDATE SET count = count + 1')
      .run(sessionId, day);
  }

  private recoverInterruptedJobs(): void {
    this.db.transaction(() => {
      const rows = this.db.prepare("SELECT id, session_id FROM jobs WHERE status IN ('queued','running')")
        .all() as { id: string; session_id: string }[];
      for (const row of rows) this.failJob(row.session_id, row.id, 'The server restarted before this job completed. Submit a new job to retry.');
    }).immediate();
  }
}
