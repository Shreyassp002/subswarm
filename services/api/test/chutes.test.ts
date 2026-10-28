import assert from 'node:assert/strict';
import test from 'node:test';
import { readConfig } from '../src/config.js';
import { createExecutor, providerCatalog } from '../src/providers.js';

const unusedNetwork = { available: false, snapshot: async () => { throw new Error('Unexpected chain call.'); } };
const liveCatalogShape = {
  object: 'list',
  data: [{
    id: 'google/gemma-4-31B-turbo-TEE', object: 'model', owned_by: 'sglang',
    input_modalities: ['text', 'image'], output_modalities: ['text'], max_output_length: 65536,
  }],
};

test('Chutes discovers a real text model and sends bearer auth with a bounded nonstreaming chat request', async () => {
  const config = readConfig({ CHUTES_API_KEY: 'cpk_test_key' });
  const calls: { url: string; options: RequestInit }[] = [];
  const execute = createExecutor(config, unusedNetwork, (async (url: string, options: RequestInit) => {
    calls.push({ url, options });
    return Response.json(calls.length === 1 ? {
      ...liveCatalogShape, data: [{ id: 'image-only', input_modalities: ['text'], output_modalities: ['image'] }, ...liveCatalogShape.data],
    } : { choices: [{ message: { role: 'assistant', content: 'Actual mocked gateway response' } }] });
  }) as typeof fetch);
  const result = await execute({ providerId: 'chutes', prompt: 'Describe this task.' });
  assert.equal(calls[0].url, 'https://llm.chutes.ai/v1/models');
  assert.equal(calls[0].options.headers, undefined);
  assert.equal(calls[1].url, 'https://llm.chutes.ai/v1/chat/completions');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal((calls[1].options.headers as Record<string, string>).Authorization, 'Bearer cpk_test_key');
  assert.deepEqual(JSON.parse(calls[1].options.body as string), {
    model: 'google/gemma-4-31B-turbo-TEE', messages: [{ role: 'user', content: 'Describe this task.' }], max_tokens: 1200, stream: false,
  });
  assert.equal(result.text, 'Actual mocked gateway response');
  assert.deepEqual(result.blocks, [{ type: 'text', text: 'Actual mocked gateway response', model: 'google/gemma-4-31B-turbo-TEE' }]);
  assert.equal(result.attribution, undefined);
  assert.equal(providerCatalog(config, false).find((provider) => provider.id === 'chutes')?.status, 'ready');
  assert.equal(providerCatalog(readConfig({}), false).find((provider) => provider.id === 'chutes')?.status, 'needs_key');
});

test('Chutes validates configured models and responses before exposing a result', async () => {
  const config = readConfig({ CHUTES_API_KEY: 'cpk_test_key', CHUTES_MODEL: 'configured-text' });
  let completions = 0;
  const execute = createExecutor(config, unusedNetwork, (async (url: string, options: RequestInit) => {
    if (url.endsWith('/models')) return Response.json({ data: [
      ...liveCatalogShape.data,
      { id: 'configured-text', input_modalities: ['text'], output_modalities: ['text'], max_output_length: 500 },
    ] });
    completions++;
    const body = JSON.parse(options.body as string);
    assert.equal(body.model, 'configured-text');
    assert.equal(body.max_tokens, 500);
    return Response.json({ choices: [] });
  }) as typeof fetch);
  await assert.rejects(execute({ providerId: 'chutes', prompt: 'hello' }), /documented schema/);
  assert.equal(completions, 1);
  const unknown = createExecutor(config, unusedNetwork, (async () => Response.json(liveCatalogShape)) as typeof fetch);
  await assert.rejects(unknown({ providerId: 'chutes', prompt: 'hello' }), /no matching text model/);
  const missingKey = createExecutor(readConfig({}), unusedNetwork, (async () => { throw new Error('Unexpected dispatch.'); }) as typeof fetch);
  await assert.rejects(missingKey({ providerId: 'chutes', prompt: 'hello' }), /not available/);
});
