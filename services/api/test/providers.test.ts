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
  const result = await execute({ providerId: 'saygm', prompt: 'hello', maxTokens: 250 });
  assert.equal(result.text, 'Gateway answer');
  assert.deepEqual(result.blocks, [{ type: 'text', text: 'Gateway answer', model: 'supported-chat' }]);
  assert.equal(result.attribution, undefined);
  assert.match(calls[0].url, /api_shape=chat.completions/);
  assert.equal((calls[1].options.headers as Record<string, string>).Authorization, 'Bearer test-key');
  assert.equal(JSON.parse(calls[1].options.body as string).model, 'supported-chat');
  assert.equal(JSON.parse(calls[1].options.body as string).max_tokens, 250);
});

test('Desearch uses GET /web with raw key and preserves real source links, including empty results', async () => {
  let called = false;
  const execute = createExecutor({ ...readConfig({}), desearchApiKey: 'test-key' }, unusedNetwork, (async (url: string, options: RequestInit) => {
    assert.equal(new URL(url).pathname, '/web');
    assert.equal(new URL(url).searchParams.get('query'), 'research topic');
    assert.equal(new URL(url).searchParams.get('start'), '10');
    assert.equal((options.headers as Record<string, string>).Authorization, 'test-key');
    called = true;
    return Response.json({ data: [{ title: 'Source', snippet: 'Evidence', link: 'https://example.com/evidence' }] });
  }) as typeof fetch);
  const result = await execute({ providerId: 'desearch', prompt: 'research topic', start: 10 });
  assert.ok(called);
  assert.deepEqual(result.links, [{ title: 'Source', url: 'https://example.com/evidence' }]);
  assert.deepEqual(result.blocks, [{ type: 'search-results', items: [{ title: 'Source', snippet: 'Evidence', url: 'https://example.com/evidence' }] }]);
  const empty = createExecutor({ ...readConfig({}), desearchApiKey: 'test-key' }, unusedNetwork, (async () => Response.json({ data: [] })) as typeof fetch);
  assert.deepEqual((await empty({ providerId: 'desearch', prompt: 'nothing' })).links, []);
});

test('ChronoSeek binds the protocol request and preserves only explicit gateway UID attribution', async () => {
  const execute = createExecutor({ ...readConfig({}), chronoseekUrl: 'http://gateway.invalid' }, unusedNetwork, (async (url: string, options: RequestInit) => {
    assert.equal(url, 'http://gateway.invalid/search');
    const input = JSON.parse(options.body as string);
    assert.equal(input.protocol_version, '2026-04-10');
    assert.equal(input.top_k, 3);
    assert.deepEqual(input.video, { url: 'https://example.com/video.mp4' });
    return Response.json({ protocol_version: input.protocol_version, request_id: input.request_id, status: 'completed', results: [{ start: 2, end: 4, confidence: 0.95 }], miner_metadata: { selected_uids: [4, 7], queried_uids: [1, 4, 7] } });
  }) as typeof fetch);
  const result = await execute({ providerId: 'chronoseek', prompt: 'find moment', videoUrl: 'https://example.com/video.mp4', topK: 3 });
  assert.match(result.text, /2.00s to 4.00s/);
  assert.match(result.text, /Source video: https:\/\/example\.com\/video\.mp4/);
  assert.deepEqual(result.attribution?.uids, [4, 7]);
  assert.deepEqual(result.blocks, [{ type: 'video-moments', sourceUrl: 'https://example.com/video.mp4', items: [{ start: 2, end: 4, confidence: 0.95 }] }]);
  assert.match(result.attribution?.note ?? '', /not independent execution verification/);
});

test('malformed links and video intervals never become structured result blocks', async () => {
  const search = createExecutor({ ...readConfig({}), desearchApiKey: 'test-key' }, unusedNetwork, (async () => Response.json({
    data: [{ title: 'Unsafe source', snippet: 'Do not render', link: 'javascript:alert(1)' }],
  })) as typeof fetch);
  await assert.rejects(search({ providerId: 'desearch', prompt: 'topic' }), /documented schema/);
  const video = createExecutor({ ...readConfig({}), chronoseekUrl: 'http://gateway.invalid' }, unusedNetwork, (async () => Response.json({
    protocol_version: '2026-04-10', status: 'completed', results: [{ start: 5, end: 4, confidence: 0.9 }],
  })) as typeof fetch);
  await assert.rejects(video({ providerId: 'chronoseek', prompt: 'moment', videoUrl: 'https://example.com/video.mp4' }), /documented schema/);
});

test('completed video searches preserve empty matches and queried UIDs do not imply serving attribution', async () => {
  const execute = createExecutor({ ...readConfig({}), chronoseekUrl: 'http://gateway.invalid' }, unusedNetwork, (async () => Response.json({
    protocol_version: '2026-04-10', status: 'completed', results: [], miner_metadata: { queried_uids: [7] },
  })) as typeof fetch);
  const result = await execute({ providerId: 'chronoseek', prompt: 'moment', videoUrl: 'https://example.com/video.mp4' });
  assert.deepEqual(result.blocks, [{ type: 'video-moments', sourceUrl: 'https://example.com/video.mp4', items: [] }]);
  assert.equal(result.attribution, undefined);
});

test('provider errors are sanitized and unsupported integrations never become ready from unrelated keys', async () => {
  const config = { ...readConfig({}), saygmApiKey: 'test-key', saygmModel: 'chat' };
  for (const response of [Response.json({ secret: 'private error' }, { status: 401 }), Response.json({ choices: [] })]) {
    const execute = createExecutor(config, unusedNetwork, (async () => response) as typeof fetch);
    await assert.rejects(execute({ providerId: 'saygm', prompt: 'hello' }), (error: Error) => !error.message.includes('private error') && /credentials|documented schema/.test(error.message));
  }
  assert.ok(providerCatalog(config, false).filter((provider) => ['chutes', '404gen', 'attelier', 'everyframe', 'hippius', 'ridges'].includes(provider.id)).every((provider) => provider.status !== 'ready'));
});
