import assert from 'node:assert/strict';
import test from 'node:test';
import { parseJobInput } from '../src/validation.js';

test('provider-specific inputs preserve typed limits and reject unrelated controls', () => {
  assert.deepEqual(parseJobInput({ providerId: 'network' }), { providerId: 'network', netuid: 298 });
  assert.deepEqual(parseJobInput({ providerId: 'saygm', prompt: '  Explain this.  ', maxTokens: 1 }), { providerId: 'saygm', prompt: 'Explain this.', maxTokens: 1 });
  assert.equal(parseJobInput({ providerId: 'chutes', prompt: 'hello', maxTokens: 1200 }).maxTokens, 1200);
  assert.equal(parseJobInput({ providerId: 'desearch', prompt: 'topic', start: 100 }).start, 100);
  assert.equal(parseJobInput({ providerId: 'chronoseek', prompt: 'door opens', videoUrl: 'https://example.com/video.mp4', topK: 20 }).topK, 20);
  for (const input of [
    { providerId: 'network', prompt: 'ignored' },
    { providerId: 'saygm', prompt: 'hello', maxTokens: 0 },
    { providerId: 'saygm', prompt: 'hello', maxTokens: 1201 },
    { providerId: 'saygm', prompt: 'hello', maxTokens: 2.5 },
    { providerId: 'chutes', prompt: 'hello', topK: 5 },
    { providerId: 'desearch', prompt: 'topic', maxTokens: 100 },
    { providerId: 'desearch', prompt: 'topic', start: -1 },
    { providerId: 'desearch', prompt: 'topic', start: 101 },
    { providerId: 'chronoseek', prompt: 'door opens', videoUrl: 'https://example.com/video.mp4', topK: 0 },
    { providerId: 'chronoseek', prompt: 'door opens', videoUrl: 'https://example.com/video.mp4', topK: 21 },
    { providerId: 'saygm', prompt: ' ' },
    { providerId: 'saygm', prompt: 'x'.repeat(4001) },
  ]) assert.throws(() => parseJobInput(input));
});

test('discovery providers cannot be submitted through the execution API', () => {
  for (const providerId of ['attelier', 'everyframe', 'hippius', 'ridges']) {
    assert.throws(() => parseJobInput({ providerId, prompt: 'Run a task' }));
  }
});

test('video inputs require a public HTTPS source without embedded credentials or a custom port', () => {
  for (const videoUrl of ['https://localhost/video', 'http://example.com/video', 'https://127.0.0.1/video', 'https://[::1]/video', 'https://example.internal/video', 'https://user:secret@example.com/video', 'https://example.com:8443/video']) {
    assert.throws(() => parseJobInput({ providerId: 'chronoseek', prompt: 'door opens', videoUrl }));
  }
});
