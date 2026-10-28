import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import type { Session } from '@subswarm/shared';
import type { Config } from './config.js';
import { readConfig } from './config.js';
import { ApiFailure } from './errors.js';
import { assertKnownNetwork, BtcliNetworkReader } from './network.js';
import type { NetworkReader } from './network.js';
import { createExecutor, providerCatalog } from './providers.js';
import type { JobExecutor } from './providers.js';
import { Store } from './store.js';
import { parseJobInput } from './validation.js';

interface AppOptions {
  config?: Config;
  store?: Store;
  network?: NetworkReader;
  execute?: JobExecutor;
}

export function createApp(options: AppOptions = {}) {
  const config = options.config ?? readConfig();
  const store = options.store ?? new Store(config.databasePath);
  const network = options.network ?? new BtcliNetworkReader(config.btcliBin);
  const execute = options.execute ?? createExecutor(config, network);
  const pending = new Set<Promise<void>>();
  const cookieName = 'subswarm_session';
  const app = new Hono<{ Variables: { session: Session } }>();

  app.use('/v1/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    const origin = c.req.header('Origin');
    if ((origin && origin !== config.webOrigin) || (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && origin !== config.webOrigin)) {
      throw new ApiFailure('origin_rejected', 'This origin is not allowed to access the workspace.', 403);
    }
    await next();
  });
  app.use('/v1/*', cors({ origin: config.webOrigin, credentials: true, allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type'], maxAge: 600 }));
  app.use('/v1/*', bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: { code: 'body_too_large', message: 'Request bodies must be at most 16 KiB.' } }, 413) }));

  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/v1/session', (c) => {
    const existing = store.findSession(getCookie(c, cookieName));
    if (existing) return c.json({ session: existing });
    const { session, token } = store.createSession();
    setCookie(c, cookieName, token, { httpOnly: true, secure: config.webOrigin.startsWith('https:'), sameSite: 'Strict', path: '/v1', maxAge: 30 * 24 * 60 * 60 });
    return c.json({ session });
  });
  app.get('/v1/providers', (c) => c.json({ providers: providerCatalog(config, network.available) }));
  app.use('/v1/*', async (c, next) => {
    const session = store.findSession(getCookie(c, cookieName));
    if (!session) throw new ApiFailure('session_required', 'Open a workspace session before continuing.', 401);
    c.set('session', session);
    await next();
  });

  app.get('/v1/jobs', (c) => c.json({ jobs: store.listJobs(c.get('session').id) }));
  app.get('/v1/jobs/:id', (c) => {
    const job = store.findJob(c.get('session').id, c.req.param('id'));
    if (!job) throw new ApiFailure('job_not_found', 'This job was not found in your workspace.', 404);
    return c.json({ job });
  });
  app.post('/v1/jobs', async (c) => {
    if (!c.req.header('Content-Type')?.toLowerCase().startsWith('application/json')) throw new ApiFailure('invalid_content_type', 'Use an application/json request body.', 400);
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new ApiFailure('invalid_json', 'The request body must be valid JSON.', 400);
    }
    const input = parseJobInput(raw);
    const provider = providerCatalog(config, network.available).find((item) => item.id === input.providerId)!;
    if (provider.status !== 'ready' || !provider.taskKind) throw new ApiFailure('provider_unavailable', provider.reason ?? 'This provider is not available.', 503);
    const sessionId = c.get('session').id;
    const job = store.reserveJob(sessionId, input, provider.taskKind, config.maxConcurrentJobs, config.maxDailyRequests, { daily: config.maxPaidDailyRequests, concurrent: config.maxPaidConcurrentJobs });
    const run = Promise.resolve().then(async () => {
      if (!store.startJob(sessionId, job.id)) return;
      try {
        store.finishJob(sessionId, job.id, await execute(input));
      } catch (error) {
        store.failJob(sessionId, job.id, error instanceof ApiFailure ? error.message : 'The job failed unexpectedly. Submit a new job to retry.');
      }
    }).catch((error) => {
      console.error('Job persistence failed:', error instanceof Error ? error.name : 'Unknown error');
    });
    pending.add(run);
    void run.finally(() => pending.delete(run));
    return c.json({ job }, 202);
  });
  app.get('/v1/artifacts', (c) => c.json({ artifacts: store.listArtifacts(c.get('session').id) }));
  app.get('/v1/networks/:network/:netuid', async (c) => {
    const networkName = c.req.param('network');
    const uid = c.req.param('netuid');
    if (!/^\d{1,5}$/.test(uid)) throw new ApiFailure('invalid_subnet', 'The subnet identifier must be a bounded integer.', 422);
    const netuid = Number(uid);
    assertKnownNetwork(networkName, netuid);
    store.consumeRequest(c.get('session').id, config.maxDailyRequests);
    return c.json(await network.snapshot(networkName, netuid));
  });
  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'This API route does not exist.' } }, 404));
  app.onError((error, c) => {
    if (error instanceof ApiFailure) return c.json({ error: { code: error.code, message: error.message } }, error.status);
    console.error('API request failed:', error.name);
    return c.json({ error: { code: 'internal_error', message: 'The server could not complete this request.' } }, 500);
  });
  return { app, store, async drain() { await Promise.allSettled([...pending]); } };
}
