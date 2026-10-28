import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { Artifact, Job, JobInput, JobResult, Session, TaskKind, WalletState, PaymentQuote, PaymentLedgerEntry } from '@subswarm/shared';
import { ApiFailure } from './errors.js';
import { accountId, inputHash, MAX_RAO, rao, TESTNET_GENESIS, walletAddress } from './payments.js';
import type { DepositEvidence } from './payments.js';

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
      CREATE TABLE IF NOT EXISTS payment_accounts (
        account TEXT PRIMARY KEY,
        available TEXT NOT NULL,
        reserved TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS wallet_bindings (
        session_id TEXT PRIMARY KEY,
        account TEXT NOT NULL REFERENCES payment_accounts(account),
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS wallet_challenges (
        session_id TEXT PRIMARY KEY,
        id TEXT NOT NULL UNIQUE,
        account TEXT NOT NULL,
        message TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS payment_deposits (
        event_id TEXT PRIMARY KEY,
        account TEXT NOT NULL REFERENCES payment_accounts(account),
        amount TEXT NOT NULL,
        evidence TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS payment_quotes (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        account TEXT NOT NULL REFERENCES payment_accounts(account),
        input_hash TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        amount TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        job_id TEXT UNIQUE,
        state TEXT NOT NULL CHECK(state IN ('quoted', 'reserved', 'settled', 'released'))
      );
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
      CREATE TABLE IF NOT EXISTS registry_usage (
        session_id TEXT PRIMARY KEY REFERENCES sessions(id),
        window INTEGER NOT NULL,
        count INTEGER NOT NULL
      );
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

  reserveJob(sessionId: string, input: JobInput, kind: TaskKind, concurrentLimit: number, dailyLimit: number, paidLimits: { daily: number; concurrent: number } = { daily: 20, concurrent: 2 }, quoteId?: string): Job {
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
      if (input.providerId !== 'network') this.reservePayment(sessionId, job.id, input, quoteId);
      this.db.prepare('INSERT INTO jobs (id, session_id, status, created_at, data) VALUES (?, ?, ?, ?, ?)')
        .run(job.id, sessionId, job.status, now, JSON.stringify(job));
      return job;
    }).immediate();
  }

  consumeRequest(sessionId: string, dailyLimit: number): void {
    this.db.transaction(() => this.consumeDailyRequest(sessionId, dailyLimit)).immediate();
  }

  consumeRegistryRead(sessionId: string): void {
    this.db.transaction(() => {
      const window = Math.floor(Date.now() / 60_000);
      const row = this.db.prepare('SELECT window, count FROM registry_usage WHERE session_id = ?').get(sessionId) as { window: number; count: number } | undefined;
      const count = row?.window === window ? row.count : 0;
      if (count >= 60) throw new ApiFailure('registry_limit', 'The resident registry refresh limit was reached. Try again in a minute.', 429);
      this.db.prepare('INSERT INTO registry_usage (session_id, window, count) VALUES (?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET window=excluded.window, count=excluded.count')
        .run(sessionId, window, count + 1);
    }).immediate();
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

  recordProviderTask(sessionId: string, id: string, providerTaskId: string): void {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(providerTaskId)) throw new Error('Invalid provider task identifier');
    this.db.transaction(() => {
      const job = this.findJob(sessionId, id);
      if (!job || !['queued', 'running'].includes(job.status)) return;
      if (job.providerTaskId && job.providerTaskId !== providerTaskId) throw new Error('Provider task identity cannot change');
      job.providerTaskId = providerTaskId;
      job.updatedAt = new Date().toISOString();
      this.db.prepare('UPDATE jobs SET data = ? WHERE id = ?').run(JSON.stringify(job), id);
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
        type: job.kind === '3d' ? '3d' : job.kind === 'network-scan' ? 'network-report' : job.kind === 'video-search' ? 'video' : job.kind === 'search' ? 'search' : 'text',
        createdAt: now,
      };
      this.finishPayment(id, true);
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
      this.finishPayment(id, false);
      this.db.prepare("UPDATE jobs SET status = 'failed', data = ? WHERE id = ?").run(JSON.stringify(job), id);
    }).immediate();
  }

  listArtifacts(sessionId: string): Artifact[] {
    return (this.db.prepare('SELECT data FROM artifacts WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT 100')
      .all(sessionId) as JobRow[]).map((row) => JSON.parse(row.data) as Artifact);
  }

  walletAccount(sessionId: string): string | undefined {
    const row = this.db.prepare('SELECT account FROM wallet_bindings WHERE session_id = ? AND expires_at > ?')
      .get(sessionId, Date.now()) as { account: string } | undefined;
    return row?.account;
  }

  walletState(sessionId: string): WalletState {
    const account = this.walletAccount(sessionId);
    if (!account) return { address: null, availableRao: '0', reservedRao: '0' };
    const row = this.db.prepare('SELECT available, reserved FROM payment_accounts WHERE account = ?').get(account) as { available: string; reserved: string };
    return { address: walletAddress(account), availableRao: row.available, reservedRao: row.reserved };
  }

  createWalletChallenge(sessionId: string, address: string, origin: string) {
    const account = accountId(address);
    const id = randomUUID();
    const expires = Date.now() + 5 * 60_000;
    const message = `Subswarm wallet login\nOrigin: ${origin}\nNetwork: Bittensor testnet\nGenesis: ${TESTNET_GENESIS}\nAddress: ${walletAddress(account)}\nSession: ${sessionId}\nNonce: ${randomBytes(32).toString('hex')}\nExpires: ${new Date(expires).toISOString()}\nThis signs in only. It does not authorize a transfer.`;
    this.db.prepare('INSERT INTO wallet_challenges (session_id, id, account, message, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET id=excluded.id, account=excluded.account, message=excluded.message, expires_at=excluded.expires_at')
      .run(sessionId, id, account, message, expires);
    return { id, message, expiresAt: new Date(expires).toISOString() };
  }

  walletChallenge(sessionId: string, id: string) {
    const row = this.db.prepare('SELECT account, message FROM wallet_challenges WHERE session_id = ? AND id = ? AND expires_at > ?')
      .get(sessionId, id, Date.now()) as { account: string; message: string } | undefined;
    if (!row) throw new ApiFailure('challenge_invalid', 'The wallet challenge expired or was already used. Connect again.', 401);
    return row;
  }

  bindWallet(sessionId: string, challengeId: string): WalletState {
    return this.db.transaction(() => {
      const { account } = this.walletChallenge(sessionId, challengeId);
      this.db.prepare('DELETE FROM wallet_challenges WHERE session_id = ?').run(sessionId);
      this.db.prepare("INSERT OR IGNORE INTO payment_accounts (account, available, reserved) VALUES (?, '0', '0')").run(account);
      this.db.prepare('INSERT INTO wallet_bindings (session_id, account, expires_at) VALUES (?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET account=excluded.account, expires_at=excluded.expires_at')
        .run(sessionId, account, Date.now() + 24 * 60 * 60_000);
      return this.walletState(sessionId);
    }).immediate();
  }

  disconnectWallet(sessionId: string): WalletState {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM wallet_bindings WHERE session_id = ?').run(sessionId);
      this.db.prepare('DELETE FROM wallet_challenges WHERE session_id = ?').run(sessionId);
    }).immediate();
    return this.walletState(sessionId);
  }

  creditDeposit(sessionId: string, evidence: DepositEvidence, receiver: string, startBlock: number): WalletState {
    return this.db.transaction(() => {
      const account = this.walletAccount(sessionId);
      if (!account) throw new ApiFailure('wallet_required', 'Connect and verify your wallet first.', 401);
      if (evidence.genesisHash !== TESTNET_GENESIS || evidence.blockNumber < startBlock || accountId(evidence.from) !== account || accountId(evidence.to) !== accountId(receiver)) {
        throw new ApiFailure('deposit_mismatch', 'The transfer does not match this wallet, receiver, or testnet deposit window.', 422);
      }
      const amount = rao(evidence.amountRao);
      if (amount === 0n) throw new ApiFailure('invalid_amount', 'A deposit must be greater than zero.', 422);
      const eventId = `${evidence.genesisHash}:${evidence.blockHash}:${evidence.eventIndex}`;
      const existing = this.db.prepare('SELECT account, amount FROM payment_deposits WHERE event_id = ?').get(eventId) as { account: string; amount: string } | undefined;
      if (existing) {
        if (existing.account !== account || existing.amount !== evidence.amountRao) throw new ApiFailure('deposit_mismatch', 'The receipt conflicts with an already credited transfer.', 409);
        return this.walletState(sessionId);
      }
      const state = this.walletState(sessionId);
      if (rao(state.availableRao) + rao(state.reservedRao) + amount > MAX_RAO) throw new ApiFailure('balance_overflow', 'This deposit exceeds the supported balance limit.', 422);
      this.db.prepare('UPDATE payment_accounts SET available = ? WHERE account = ?').run((rao(state.availableRao) + amount).toString(), account);
      this.db.prepare('INSERT INTO payment_deposits (event_id, account, amount, evidence) VALUES (?, ?, ?, ?)').run(eventId, account, evidence.amountRao, JSON.stringify({ ...evidence, creditedAt: new Date().toISOString() }));
      return this.walletState(sessionId);
    }).immediate();
  }

  walletLedger(sessionId: string): PaymentLedgerEntry[] {
    const account = this.walletAccount(sessionId);
    if (!account) return [];
    const deposits = this.db.prepare("SELECT event_id, amount, evidence FROM payment_deposits WHERE account = ? ORDER BY json_extract(evidence, '$.creditedAt') DESC LIMIT 50")
      .all(account) as { event_id: string; amount: string; evidence: string }[];
    const requests = this.db.prepare("SELECT id, provider_id, job_id, amount, expires_at, state FROM payment_quotes WHERE account = ? AND state != 'quoted' ORDER BY expires_at DESC LIMIT 50")
      .all(account) as { id: string; provider_id: string; job_id: string; amount: string; expires_at: number; state: 'reserved' | 'settled' | 'released' }[];
    return [
      ...deposits.map((row): PaymentLedgerEntry => {
        const data = JSON.parse(row.evidence) as DepositEvidence & { creditedAt?: string };
        return { id: row.event_id, kind: 'deposit', status: 'credited', amountRao: row.amount, createdAt: data.creditedAt ?? '', blockHash: data.blockHash };
      }),
      ...requests.map((row): PaymentLedgerEntry => ({ id: row.id, kind: 'request', status: row.state === 'settled' ? 'charged' : row.state,
        amountRao: row.amount, createdAt: new Date(row.expires_at - 5 * 60_000).toISOString(), providerId: row.provider_id, jobId: row.job_id })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
  }

  createQuote(sessionId: string, input: JobInput, amountRao: string): PaymentQuote {
    return this.db.transaction(() => {
      const account = this.walletAccount(sessionId);
      if (!account) throw new ApiFailure('wallet_required', 'Connect and verify your wallet before requesting paid work.', 401);
      if (rao(amountRao) === 0n) throw new ApiFailure('invalid_amount', 'A paid request price must be greater than zero.', 422);
      const expires = Date.now() + 5 * 60_000;
      const quote = { id: randomUUID(), providerId: input.providerId, amountRao, expiresAt: new Date(expires).toISOString() };
      this.db.prepare("DELETE FROM payment_quotes WHERE state = 'quoted' AND expires_at <= ?").run(Date.now());
      this.db.prepare("INSERT INTO payment_quotes (id, session_id, account, input_hash, provider_id, amount, expires_at, state) VALUES (?, ?, ?, ?, ?, ?, ?, 'quoted')")
        .run(quote.id, sessionId, account, inputHash(input), input.providerId, amountRao, expires);
      return quote;
    }).immediate();
  }

  private reservePayment(sessionId: string, jobId: string, input: JobInput, quoteId?: string): void {
    const account = this.walletAccount(sessionId);
    if (!account) throw new ApiFailure('wallet_required', 'Connect and verify your wallet before requesting paid work.', 401);
    const quote = quoteId ? this.db.prepare("SELECT amount FROM payment_quotes WHERE id = ? AND session_id = ? AND account = ? AND input_hash = ? AND expires_at > ? AND state = 'quoted'")
      .get(quoteId, sessionId, account, inputHash(input), Date.now()) as { amount: string } | undefined : undefined;
    if (!quote) throw new ApiFailure('quote_invalid', 'Request a fresh quote for this exact job before submitting it.', 409);
    const state = this.walletState(sessionId);
    const amount = rao(quote.amount);
    if (rao(state.availableRao) < amount) throw new ApiFailure('insufficient_balance', 'Your testnet TAO balance is too low for this request.', 402);
    this.db.prepare('UPDATE payment_accounts SET available = ?, reserved = ? WHERE account = ?')
      .run((rao(state.availableRao) - amount).toString(), (rao(state.reservedRao) + amount).toString(), account);
    this.db.prepare("UPDATE payment_quotes SET state = 'reserved', job_id = ? WHERE id = ?").run(jobId, quoteId);
  }

  private finishPayment(jobId: string, completed: boolean): void {
    const quote = this.db.prepare("SELECT id, account, amount FROM payment_quotes WHERE job_id = ? AND state = 'reserved'").get(jobId) as { id: string; account: string; amount: string } | undefined;
    if (!quote) return;
    const state = this.db.prepare('SELECT available, reserved FROM payment_accounts WHERE account = ?').get(quote.account) as { available: string; reserved: string };
    const reserved = rao(state.reserved) - rao(quote.amount);
    if (reserved < 0n) throw new Error('Payment reservation invariant failed');
    this.db.prepare('UPDATE payment_accounts SET available = ?, reserved = ? WHERE account = ?')
      .run((rao(state.available) + (completed ? 0n : rao(quote.amount))).toString(), reserved.toString(), quote.account);
    this.db.prepare('UPDATE payment_quotes SET state = ? WHERE id = ?').run(completed ? 'settled' : 'released', quote.id);
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
