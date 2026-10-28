import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import type { Session } from '@subswarm/shared';
import type { Config } from './config.js';
import { readConfig } from './config.js';
import { ApiFailure } from './errors.js';
import { assertKnownNetwork, BtcliNetworkReader } from './network.js';
import type { NetworkReader } from './network.js';
import { createExecutor, download404Result, providerCatalog } from './providers.js';
import type { JobExecutor } from './providers.js';
import { Store } from './store.js';
import { parseJobInput } from './validation.js';
import { z } from 'zod';
import { paymentSettings, TestnetDepositReader, verifyWalletSignature } from './payments.js';
import type { DepositReader } from './payments.js';

interface AppOptions {
  config?: Config;
  store?: Store;
  network?: NetworkReader;
  execute?: JobExecutor;
  deposits?: DepositReader;
  downloadModel?: typeof download404Result;
}

export function createApp(options: AppOptions = {}) {
  const config = options.config ?? readConfig();
  const store = options.store ?? new Store(config.databasePath);
  const network = options.network ?? new BtcliNetworkReader(config.btcliBin);
  const execute = options.execute ?? createExecutor(config, network);
  const downloadModel = options.downloadModel ?? download404Result;
  const deposits = options.deposits ?? new TestnetDepositReader();
  const payment = paymentSettings(config.payments);
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

  const parseBody = async (c: Context) => {
    if (!c.req.header('Content-Type')?.toLowerCase().startsWith('application/json')) throw new ApiFailure('invalid_content_type', 'Use an application/json request body.', 400);
    try { return await c.req.json(); } catch { throw new ApiFailure('invalid_json', 'The request body must be valid JSON.', 400); }
  };
  const validate = <T>(schema: z.ZodType<T>, raw: unknown): T => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new ApiFailure('invalid_input', 'The request fields are invalid.', 422);
    return parsed.data;
  };
  const requirePayments = () => {
    if (!payment.enabled) throw new ApiFailure('payments_unavailable', payment.reason!, 503);
  };
  app.get('/v1/wallet', (c) => c.json({ wallet: store.walletState(c.get('session').id), payments: payment }));
  app.get('/v1/wallet/ledger', (c) => c.json({ entries: store.walletLedger(c.get('session').id) }));
  app.post('/v1/wallet/challenge', async (c) => {
    const { address } = validate(z.object({ address: z.string().min(1).max(128) }).strict(), await parseBody(c));
    store.consumeRequest(c.get('session').id, config.maxDailyRequests);
    return c.json({ challenge: store.createWalletChallenge(c.get('session').id, address, config.webOrigin) });
  });
  app.post('/v1/wallet/verify', async (c) => {
    const { challengeId, signature } = validate(z.object({ challengeId: z.uuid(), signature: z.string().regex(/^0x[0-9a-fA-F]{128,132}$/) }).strict(), await parseBody(c));
    const sessionId = c.get('session').id;
    const challenge = store.walletChallenge(sessionId, challengeId);
    if (!await verifyWalletSignature(challenge.message, signature, challenge.account)) throw new ApiFailure('signature_invalid', 'The wallet signature did not match this login challenge.', 401);
    return c.json({ wallet: store.bindWallet(sessionId, challengeId) });
  });
  app.post('/v1/wallet/disconnect', (c) => c.json({ wallet: store.disconnectWallet(c.get('session').id) }));
  app.post('/v1/wallet/deposits', async (c) => {
    requirePayments();
    const { blockHash, eventIndex } = validate(z.object({ blockHash: z.string().regex(/^0x[0-9a-f]{64}$/), eventIndex: z.number().int().min(0).max(100_000) }).strict(), await parseBody(c));
    const sessionId = c.get('session').id;
    const account = store.walletAccount(sessionId);
    if (!account) throw new ApiFailure('wallet_required', 'Connect and verify your wallet first.', 401);
    store.consumeRequest(sessionId, config.maxDailyRequests);
    const evidence = await deposits.verify(blockHash, eventIndex);
    if (account !== store.walletAccount(sessionId)) throw new ApiFailure('wallet_changed', 'The connected wallet changed during verification. Retry this deposit.', 409);
    return c.json({ wallet: store.creditDeposit(sessionId, evidence, config.payments!.receiver!, config.payments!.startBlock!), creditedRao: evidence.amountRao });
  });
  app.post('/v1/quotes', async (c) => {
    requirePayments();
    const input = parseJobInput(await parseBody(c));
    const provider = providerCatalog(config, network.available).find((item) => item.id === input.providerId)!;
    if (provider.status !== 'ready' || !provider.taskKind) throw new ApiFailure('provider_unavailable', provider.reason ?? 'This provider is not available.', 503);
    const price = payment.pricesRao[input.providerId];
    if (!price) throw new ApiFailure('price_unavailable', 'No paid request price is configured for this provider.', 503);
    store.consumeRequest(c.get('session').id, config.maxDailyRequests);
    return c.json({ quote: store.createQuote(c.get('session').id, input, price) });
  });

  app.get('/v1/jobs', (c) => c.json({ jobs: store.listJobs(c.get('session').id) }));
  app.get('/v1/jobs/:id', (c) => {
    const job = store.findJob(c.get('session').id, c.req.param('id'));
    if (!job) throw new ApiFailure('job_not_found', 'This job was not found in your workspace.', 404);
    return c.json({ job });
  });
  app.get('/v1/jobs/:id/files/model', async (c) => {
    const job = store.findJob(c.get('session').id, c.req.param('id'));
    if (!job || job.status !== 'completed' || job.providerId !== '404gen' || !job.result?.providerTaskId) {
      throw new ApiFailure('artifact_not_found', 'This generated file was not found in your workspace.', 404);
    }
    store.consumeRequest(c.get('session').id, config.maxDailyRequests);
    return downloadModel(config, job.result.providerTaskId, job.input.model === '404-mesh' ? '404-mesh' : '404-3dgs');
  });
  app.post('/v1/jobs', async (c) => {
    if (!c.req.header('Content-Type')?.toLowerCase().startsWith('application/json')) throw new ApiFailure('invalid_content_type', 'Use an application/json request body.', 400);
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new ApiFailure('invalid_json', 'The request body must be valid JSON.', 400);
    }
    let quoteId: string | undefined;
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'quoteId' in raw) {
      const { quoteId: supplied, ...rest } = raw;
      quoteId = validate(z.uuid(), supplied);
      raw = rest;
    }
    const input = parseJobInput(raw);
    const provider = providerCatalog(config, network.available).find((item) => item.id === input.providerId)!;
    if (provider.status !== 'ready' || !provider.taskKind) throw new ApiFailure('provider_unavailable', provider.reason ?? 'This provider is not available.', 503);
    if (input.providerId !== 'network') {
      requirePayments();
      if (!payment.pricesRao[input.providerId]) throw new ApiFailure('price_unavailable', 'No paid request price is configured for this provider.', 503);
    }
    const sessionId = c.get('session').id;
    const job = store.reserveJob(sessionId, input, provider.taskKind, config.maxConcurrentJobs, config.maxDailyRequests, { daily: config.maxPaidDailyRequests, concurrent: config.maxPaidConcurrentJobs }, quoteId);
    const run = Promise.resolve().then(async () => {
      if (!store.startJob(sessionId, job.id)) return;
      try {
        store.finishJob(sessionId, job.id, await execute(input, { jobId: job.id, onProviderTaskCreated: (id) => store.recordProviderTask(sessionId, job.id, id) }));
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
