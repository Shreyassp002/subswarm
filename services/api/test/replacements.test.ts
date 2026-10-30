import assert from 'node:assert/strict';
import test from 'node:test';
import { readConfig } from '../src/config.js';
import { parseJobInput } from '../src/validation.js';
import { createExecutor } from '../src/providers.js';
import { createDittoMemory } from '../src/ditto.js';
import { publishedProviders } from '../src/provider-catalog.js';
import { createApp } from '../src/app.js';
import { Store } from '../src/store.js';
import { TESTNET_GENESIS } from '../src/payments.js';

const network = { available: false, snapshot: async (): Promise<never> => { throw new Error('unused'); } };
const memoryId = '74354445-16b4-439d-abfb-f5d685ccad45';
const origin = 'http://localhost:3000';

test('publication excludes unactivated providers even when old keys are present', () => {
  const config = readConfig({ TAO_PAYMENTS_ENABLED: 'true', CHUTES_API_KEY: 'present', TAO_PRICE_CHUTES_RAO: '1000', BITMIND_API_KEY: 'present', ZEUS_API_KEY: 'free_test', DITTO_MCP_API_KEY: 'present', DITTO_SPACE: 'isolated', TAO_PRICE_BITMIND_RAO: '1000', TAO_PRICE_ZEUS_RAO: '1000', TAO_PRICE_DITTO_RAO: '1000' });
  assert.deepEqual(publishedProviders(config, true).map(p => p.id), ['network', 'bitmind', 'zeus', 'ditto']);
  assert.deepEqual(publishedProviders(readConfig({}), false), []);
});

test('weather coordinates, forecast limits and uploaded image bytes are bounded', () => {
  assert.equal(parseJobInput({ providerId: 'zeus', latitude: -90, longitude: 180 }).forecastHours, 6);
  for (const input of [
    { providerId: 'zeus', latitude: 90.01, longitude: 0 },
    { providerId: 'zeus', latitude: 0, longitude: -181 },
    { providerId: 'zeus', latitude: 0, longitude: 0, forecastHours: 25 },
    { providerId: 'zeus', latitude: 0, longitude: 0, forecastHours: 0 },
    { providerId: 'ditto', prompt: ' ' },
    { providerId: 'ditto', prompt: 'note', memoryId },
    { providerId: 'bitmind', fileName: 'image.png', fileBase64: Buffer.from('not an image').toString('base64') },
    { providerId: 'bitmind', fileName: 'image.png', fileBase64: Buffer.alloc(256*1024+1).toString('base64') },
  ]) assert.throws(() => parseJobInput(input));
});

test('Zeus uses the account tier host, converts Kelvin and rejects mismatched arrays without retry', async () => {
  const response = { latitude: 19, longitude: 72.75, reference_time: '2026-10-30T18:00:00Z', hourly_units: { '2t': 'K' }, hourly: { time: ['2026-10-30T18:00:00Z'], '2t': [301] } };
  for (const [key, host] of [['free_test', 'free-api.zeussubnet.com'], ['paid_test', 'api.zeussubnet.com']]) {
    let calls = 0;
    const execute = createExecutor(readConfig({ ZEUS_API_KEY: key }), network, (async (url, options) => {
      calls++; assert.equal(new URL(String(url)).hostname, host); assert.equal((options!.headers as Record<string,string>)['X-API-Key'], key);
      return Response.json(response);
    }) as typeof fetch);
    const result = await execute(parseJobInput({ providerId: 'zeus', latitude: 19, longitude: 72.75, forecastHours: 1 }));
    assert.equal(result.blocks?.[0].type, 'weather');
    assert.match(result.text, /27.9 C/); assert.equal(calls, 1);
  }
  const invalid = createExecutor(readConfig({ ZEUS_API_KEY: 'free_test' }), network, (async () => Response.json({ ...response, hourly: { ...response.hourly, '2t': [300, 301] } })) as typeof fetch);
  await assert.rejects(invalid({ providerId: 'zeus', latitude: 0, longitude: 0 }), /inconsistent/);
});

test('BitMind sends uploaded data to the fixed endpoint and validates confidence', async () => {
  let calls = 0;
  const execute = createExecutor(readConfig({ BITMIND_API_KEY: 'test' }), network, (async (url, options) => {
    calls++; assert.equal(url, 'https://api.bitmind.ai/detect-image'); assert.match(JSON.parse(options!.body as string).image, /^data:image\/png;base64,/);
    return Response.json({ isAI: true, confidence: .8 });
  }) as typeof fetch);
  const input = { providerId: 'bitmind' as const, fileName: 'image.png', fileBase64: Buffer.from([137,80,78,71,13,10,26,10,0]).toString('base64') };
  const result = await execute(parseJobInput(input));
  assert.equal(calls, 1); assert.match(result.text, /80.0%/);
  const bad = createExecutor(readConfig({ BITMIND_API_KEY: 'test' }), network, (async () => Response.json({ isAI: true, confidence: 1.1 })) as typeof fetch);
  await assert.rejects(bad(input), /schema/);
});

test('Ditto uses a dedicated space, strips related memories and checks exact returned IDs', async () => {
  const calls: string[] = [];
  const memory = createDittoMemory(readConfig({ DITTO_MCP_API_KEY: 'test', DITTO_SPACE: 'subswarm-space' }), async (name, args) => {
    calls.push(name); assert.equal(args.space, 'subswarm-space');
    if (name === 'save_memory') { assert.equal(args.vendorId, 'server-job'); return { id: memoryId, status: 'saved', relatedMemories: [{ content: 'OTHER USER' }] }; }
    if (name === 'fetch_memories') { assert.deepEqual(args.ids, [memoryId]); return { memories: [{ id: memoryId, content: 'my note' }] }; }
    return { memoryId, status: 'deleted' };
  });
  const result = await memory.execute({ providerId: 'ditto', prompt: 'my note' }, { jobId: 'server-job' });
  assert.ok(!JSON.stringify(result).includes('OTHER USER'));
  assert.equal(await memory.retrieve(memoryId, 'subswarm-space'), 'my note');
  await memory.remove(memoryId, 'subswarm-space');
  assert.deepEqual(calls, ['save_memory','fetch_memories','delete_memory']);
  const invalid = createDittoMemory(readConfig({ DITTO_MCP_API_KEY: 'test', DITTO_SPACE: 'subswarm-space' }), async () => ({ memories: [{ id: 'another', content: 'private' }] }));
  await assert.rejects(invalid.retrieve(memoryId, 'subswarm-space'), /requested note/);
  await assert.rejects(memory.retrieve(memoryId, 'main'), /dedicated/);
});

test('memory routes enforce ownership, delete idempotently and erase local note content', async () => {
  const store = new Store(':memory:'); const owner = store.createSession(); const stranger = store.createSession();
  const config = readConfig({ DITTO_MCP_API_KEY: 'test', DITTO_SPACE: 'subswarm-space' }); let reads=0; let deletes=0;
  const memory = createDittoMemory(config, async (name) => {
    if (name === 'fetch_memories') { reads++; return { memories: [{ id: memoryId, content: 'private note' }] }; }
    deletes++; return { memoryId, status: 'deleted' };
  });
  const { app } = createApp({ config, store, network, memory });
  try {
    const account = `0x${'11'.repeat(32)}`, receiver = `0x${'22'.repeat(32)}`;
    store.bindWallet(owner.session.id, store.createWalletChallenge(owner.session.id, account, origin).id);
    store.creditDeposit(owner.session.id, { genesisHash: TESTNET_GENESIS, blockHash: `0x${'33'.repeat(32)}`, blockNumber: 10, eventIndex: 1, from: account, to: receiver, amountRao: '10' }, receiver, 1);
    const input = { providerId: 'ditto' as const, prompt: 'private note' };
    const quote = store.createQuote(owner.session.id, input, '1');
    const job = store.reserveJob(owner.session.id, input, 'memory', 2, 40, undefined, quote.id);
    store.startJob(owner.session.id, job.id); store.finishJob(owner.session.id, job.id, { title:'Note', text:'private note', memoryId, memorySpace:'subswarm-space', blocks:[{type:'memory',jobId:job.id,text:'private note'}] });
    const path = `/v1/jobs/${job.id}/memory`;
    const headers = (token: string) => ({ Cookie:`subswarm_session=${token}`, Origin:origin, 'Content-Type':'application/json' });
    assert.equal((await app.request(path,{headers:headers(stranger.token)})).status,404);
    assert.equal((await app.request(`${path}/delete`,{method:'POST',headers:headers(stranger.token),body:'{}'})).status,404);
    assert.equal(reads+deletes,0);
    assert.deepEqual(await (await app.request(path,{headers:headers(owner.token)})).json(),{text:'private note'});
    for(let i=0;i<2;i++) assert.equal((await app.request(`${path}/delete`,{method:'POST',headers:headers(owner.token),body:'{}'})).status,200);
    assert.equal(deletes,1); assert.equal(reads,1);
    assert.equal((await app.request(path,{headers:headers(owner.token)})).status,410);
    assert.ok(!JSON.stringify(store.findJob(owner.session.id,job.id)).includes('private note'));
    assert.ok(!JSON.stringify(store.listArtifacts(owner.session.id)).includes('private note'));
  } finally {store.close();}
});
