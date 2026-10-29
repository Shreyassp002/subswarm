import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { parseMetagraph } from '../src/network.js';
import { Store } from '../src/store.js';

const origin = 'http://localhost:3000';
const snapshot = parseMetagraph(JSON.parse(readFileSync(new URL('./fixtures/metagraph.json', import.meta.url), 'utf8')), 'testnet', 298);

function harness(overrides: Partial<Parameters<typeof createApp>[0]> = {}) {
  const store = new Store(':memory:');
  return createApp({ config: readConfig({}), store, network: { available: true, snapshot: async () => snapshot }, execute: async () => ({ title: 'Report', text: 'Actual adapter result.' }), ...overrides });
}

async function openSession(app: ReturnType<typeof createApp>['app']) {
  const response = await app.request('/v1/session', { headers: { Origin: origin } });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  return cookie.split(';')[0];
}

function submit(app: ReturnType<typeof createApp>['app'], cookie: string, input: unknown, requestOrigin = origin) {
  return app.request('/v1/jobs', { method: 'POST', headers: { Cookie: cookie, Origin: requestOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
}

test('sessions own jobs and artifacts; result persistence is atomic and idempotent', async () => {
  const { app, store, drain } = harness();
  try {
    const owner = await openSession(app);
    const stranger = await openSession(app);
    const created = await submit(app, owner, { providerId: 'network', netuid: 298 });
    assert.equal(created.status, 202);
    const { job } = await created.json();
    await drain();
    const owned = await app.request(`/v1/jobs/${job.id}`, { headers: { Cookie: owner } });
    assert.equal((await owned.json()).job.status, 'completed');
    const denied = await app.request(`/v1/jobs/${job.id}`, { headers: { Cookie: stranger } });
    assert.equal(denied.status, 404);
    const strangerJobs = await app.request('/v1/jobs', { headers: { Cookie: stranger } });
    assert.deepEqual((await strangerJobs.json()).jobs, []);
    const artifacts = await app.request('/v1/artifacts', { headers: { Cookie: owner } });
    assert.equal((await artifacts.json()).artifacts.length, 1);
    const strangerArtifacts = await app.request('/v1/artifacts', { headers: { Cookie: stranger } });
    assert.deepEqual((await strangerArtifacts.json()).artifacts, []);
    const ownerSession = store.findSession(owner.split('=')[1])!;
    store.finishJob(ownerSession.id, job.id, { title: 'duplicate', text: 'duplicate' });
    assert.equal(store.listArtifacts(ownerSession.id).length, 1);
    assert.equal((await app.request('/v1/jobs')).status, 401);
    assert.equal((await app.request('/v1/jobs', { headers: { Cookie: 'subswarm_session=forged' } })).status, 401);
  } finally {
    store.close();
  }
});

test('input validation, origin policy, and configured provider availability reject before dispatch', async () => {
  let dispatches = 0;
  const { app, store, drain } = harness({ execute: async () => { dispatches++; return { title: 'ok', text: 'ok' }; } });
  try {
    const cookie = await openSession(app);
    for (const input of [
      { providerId: 'network', netuid: -1 },
      { providerId: 'network', netuid: 28 },
      { providerId: 'network', netuid: 65536 },
      { providerId: 'network', netuid: 298.5 },
      { providerId: 'network', owner: 'other' },
      { providerId: 'saygm', prompt: '' },
      { providerId: 'saygm', prompt: 'x'.repeat(4001) },
      { providerId: 'chronoseek', prompt: 'find moment', videoUrl: 'http://localhost/video.mp4' },
      { providerId: 'chronoseek', prompt: 'find moment', videoUrl: 'https://127.0.0.1/video.mp4' },
    ]) assert.equal((await submit(app, cookie, input)).status, 422);
    assert.equal((await submit(app, cookie, { providerId: 'saygm', prompt: 'hello' })).status, 503);
    assert.equal((await submit(app, cookie, { providerId: 'chutes', prompt: 'hello' })).status, 503);
    assert.equal((await submit(app, cookie, { providerId: 'network' }, 'https://untrusted.example')).status, 403);
    assert.equal((await app.request('/v1/jobs', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{"providerId":"network"}' })).status, 403);
    const cors = await app.request('/v1/providers', { headers: { Origin: origin } });
    assert.equal(cors.headers.get('access-control-allow-origin'), origin);
    assert.equal(cors.headers.get('access-control-allow-credentials'), 'true');
    assert.equal((await app.request('/v1/session', { headers: { Origin: 'https://untrusted.example' } })).status, 403);
    const oversized = await submit(app, cookie, { providerId: 'saygm', prompt: 'x'.repeat(370_000) });
    assert.equal(oversized.status, 413);
    assert.equal(dispatches, 0);
    await drain();
  } finally {
    store.close();
  }
});

test('concurrent reservations and daily attempt caps are enforced without consuming rejected reservations', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const { app, store, drain } = harness({ config: { ...readConfig({}), maxConcurrentJobs: 1, maxDailyRequests: 1 }, execute: async () => { await gate; return { title: 'ok', text: 'ok' }; } });
  try {
    const cookie = await openSession(app);
    assert.equal((await submit(app, cookie, { providerId: 'network' })).status, 202);
    const concurrent = await submit(app, cookie, { providerId: 'network' });
    assert.equal(concurrent.status, 429);
    assert.equal((await concurrent.json()).error.code, 'concurrency_limit');
    release();
    await drain();
    const daily = await submit(app, cookie, { providerId: 'network' });
    assert.equal(daily.status, 429);
    assert.equal((await daily.json()).error.code, 'daily_limit');
  } finally {
    release();
    await drain();
    store.close();
  }
});

test('registry reads reject unsupported identifiers, have their own budget, and preserve quest quota', async () => {
  const { app, store, drain } = harness({ config: { ...readConfig({}), maxDailyRequests: 1 } });
  try {
    const cookie = await openSession(app);
    for (const path of ['/v1/networks/testnet/123', '/v1/networks/other/298', '/v1/networks/__proto__/298', '/v1/networks/testnet/298.5']) {
      assert.equal((await app.request(path, { headers: { Cookie: cookie } })).status, 422);
    }
    const read = await app.request('/v1/networks/testnet/298', { headers: { Cookie: cookie } });
    assert.equal(read.status, 200);
    assert.equal((await read.json()).source, 'live-chain');
    for (let index = 1; index < 60; index++) assert.equal((await app.request('/v1/networks/testnet/298', { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await app.request('/v1/networks/testnet/298', { headers: { Cookie: cookie } })).status, 429);
    assert.equal((await submit(app, cookie, { providerId: 'network' })).status, 202);
    await drain();
  } finally {
    store.close();
  }
});

test('generated file downloads enforce job ownership and retain the admitted provider task reference', async () => {
  let downloads = 0;
  const taskId = '0f6af6c5-b20b-491f-928a-6c3c42e465d7';
  const { app, store } = harness({ downloadModel: async (_config, id, model) => {
    assert.equal(id, taskId);
    assert.equal(model, '404-3dgs');
    downloads++;
    return new Response('fixture model', { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="model.ply"' } });
  } });
  try {
    const owner = await openSession(app);
    const stranger = await openSession(app);
    const sessionId = store.findSession(owner.split('=')[1])!.id;
    const address = `0x${'11'.repeat(32)}`;
    const receiver = `0x${'22'.repeat(32)}`;
    store.bindWallet(sessionId, store.createWalletChallenge(sessionId, address, origin).id);
    store.creditDeposit(sessionId, { genesisHash: '0x8f9cf856bf558a14440e75569c9e58594757048d7b3a84b5d25f6bd978263105', blockHash: `0x${'33'.repeat(32)}`, blockNumber: 1, eventIndex: 0, from: address, to: receiver, amountRao: '10' }, receiver, 1);
    const input = { providerId: '404gen', prompt: 'A wooden house', model: '404-3dgs' } as const;
    const quote = store.createQuote(sessionId, input, '1');
    const job = store.reserveJob(sessionId, input, '3d', 2, 40, undefined, quote.id);
    store.startJob(sessionId, job.id);
    store.recordProviderTask(sessionId, job.id, taskId);
    assert.throws(() => store.recordProviderTask(sessionId, job.id, '4b8a1ca3-4154-4c20-9331-941938b13702'), /cannot change/);
    const url = `/v1/jobs/${job.id}/files/model`;
    assert.equal((await app.request(url, { headers: { Cookie: owner } })).status, 404);
    store.finishJob(sessionId, job.id, { title: '3D model', text: 'Provider result', providerTaskId: taskId });
    assert.equal(store.findJob(sessionId, job.id)?.providerTaskId, taskId);
    assert.equal((await app.request(url, { headers: { Cookie: stranger } })).status, 404);
    const response = await app.request(url, { headers: { Cookie: owner } });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'fixture model');
    assert.equal(response.headers.get('Content-Disposition'), 'attachment; filename="model.ply"');
    assert.equal(downloads, 1);
  } finally { store.close(); }
});

test('resident endpoints bind each house to its own network and reject mismatched rosters', async () => {
  const requests: string[] = [];
  const { app, store } = harness({ network: { available: true, snapshot: async (network, netuid) => {
    requests.push(`${network}:${netuid}`);
    return { ...snapshot, network, netuid };
  } } });
  try {
    const cookie = await openSession(app);
    for (const [id, network, netuid] of [['saygm', 'mainnet', 28], ['chronoseek', 'testnet', 298], ['chutes', 'mainnet', 64]] as const) {
      const response = await app.request(`/v1/providers/${id}/residents`, { headers: { Cookie: cookie } });
      assert.equal(response.status, 200);
      const roster = await response.json();
      assert.equal(roster.network, network);
      assert.equal(roster.netuid, netuid);
    }
    assert.deepEqual(requests, ['mainnet:28', 'testnet:298', 'mainnet:64']);
    assert.equal((await app.request('/v1/providers/unknown/residents', { headers: { Cookie: cookie } })).status, 404);
    assert.equal((await app.request('/v1/providers/chutes/residents')).status, 401);
  } finally { store.close(); }
  const wrong = harness();
  try {
    const cookie = await openSession(wrong.app);
    assert.equal((await wrong.app.request('/v1/providers/chutes/residents', { headers: { Cookie: cookie } })).status, 502);
  } finally { wrong.store.close(); }
});
