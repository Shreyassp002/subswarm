import assert from 'node:assert/strict';
import test from 'node:test';
import { readConfig } from '../src/config.js';
import { createExecutor, providerCatalog } from '../src/providers.js';

const unusedNetwork = { available: false, snapshot: async () => { throw new Error('Unexpected chain call.'); } };

test('SayGM discovers an available compatible model and sends bounded bearer-authenticated chat requests', async () => {
  const calls: { url: string; options: RequestInit }[] = [];
  const fetcher = (async (url: string, options: RequestInit) => {
    calls.push({ url, options });
    return Response.json(calls.length === 1 ? { data: [{ id: 'unavailable', available: false }, { id: 'supported-chat', available: true, api_shapes: ['chat.completions'] }] } : { choices: [{ message: { content: 'Gateway answer' } }] });
  }) as typeof fetch;
  const execute = createExecutor({ ...readConfig({}), saygmApiKey: 'test-key' }, unusedNetwork, fetcher);
  const result = await execute({ providerId: 'saygm', prompt: 'hello' });
  assert.equal(result.text, 'Gateway answer');
  assert.equal(result.attribution, undefined);
  assert.match(calls[0].url, /api_shape=chat.completions/);
  assert.equal((calls[1].options.headers as Record<string, string>).Authorization, 'Bearer test-key');
  assert.equal(JSON.parse(calls[1].options.body as string).model, 'supported-chat');
  assert.equal(JSON.parse(calls[1].options.body as string).max_tokens, 1200);
});

test('Desearch uses GET /web with raw key and preserves real source links, including empty results', async () => {
  let called = false;
  const execute = createExecutor({ ...readConfig({}), desearchApiKey: 'test-key' }, unusedNetwork, (async (url: string, options: RequestInit) => {
    assert.equal(new URL(url).pathname, '/web');
    assert.equal(new URL(url).searchParams.get('query'), 'research topic');
    assert.equal((options.headers as Record<string, string>).Authorization, 'test-key');
    called = true;
    return Response.json({ data: [{ title: 'Source', snippet: 'Evidence', link: 'https://example.com/evidence' }] });
  }) as typeof fetch);
  const result = await execute({ providerId: 'desearch', prompt: 'research topic' });
  assert.ok(called);
  assert.deepEqual(result.links, [{ title: 'Source', url: 'https://example.com/evidence' }]);
  const empty = createExecutor({ ...readConfig({}), desearchApiKey: 'test-key' }, unusedNetwork, (async () => Response.json({ data: [] })) as typeof fetch);
  assert.deepEqual((await empty({ providerId: 'desearch', prompt: 'nothing' })).links, []);
});

test('ChronoSeek binds the protocol request and preserves only explicit gateway UID attribution', async () => {
  const execute = createExecutor({ ...readConfig({}), chronoseekUrl: 'http://gateway.invalid' }, unusedNetwork, (async (url: string, options: RequestInit) => {
    assert.equal(url, 'http://gateway.invalid/search');
    const input = JSON.parse(options.body as string);
    assert.equal(input.protocol_version, '2026-04-10');
    assert.equal(input.top_k, 5);
    assert.deepEqual(input.video, { url: 'https://example.com/video.mp4' });
    return Response.json({ protocol_version: input.protocol_version, request_id: input.request_id, status: 'completed', results: [{ start: 2, end: 4, confidence: 0.95 }], miner_metadata: { selected_uids: [4, 7], queried_uids: [1, 4, 7] } });
  }) as typeof fetch);
  const result = await execute({ providerId: 'chronoseek', prompt: 'find moment', videoUrl: 'https://example.com/video.mp4' });
  assert.match(result.text, /2.00s to 4.00s/);
  assert.deepEqual(result.attribution?.uids, [4, 7]);
  assert.match(result.attribution?.note ?? '', /not independent execution verification/);
});

test('provider errors are sanitized and unsupported integrations never become ready from unrelated keys', async () => {
  const config = { ...readConfig({}), saygmApiKey: 'test-key', saygmModel: 'chat' };
  for (const response of [Response.json({ secret: 'private error' }, { status: 401 }), Response.json({ choices: [] })]) {
    const execute = createExecutor(config, unusedNetwork, (async () => response) as typeof fetch);
    await assert.rejects(execute({ providerId: 'saygm', prompt: 'hello' }), (error: Error) => !error.message.includes('private error') && /credentials|documented schema/.test(error.message));
  }
  assert.ok(providerCatalog(config, false).filter((provider) => ['chutes', '404gen', 'attelier', 'everyframe', 'hippius', 'ridges'].includes(provider.id)).every((provider) => provider.status !== 'ready'));
});
