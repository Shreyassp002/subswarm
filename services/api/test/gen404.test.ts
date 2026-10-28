import assert from 'node:assert/strict';
import test from 'node:test';
import type { lookup } from 'node:dns/promises';
import { EventEmitter } from 'node:events';
import type { get } from 'node:https';
import { PassThrough } from 'node:stream';
import { readConfig } from '../src/config.js';
import { create404Executor, download404Result, load404Image } from '../src/gen404.js';
import { parseJobInput } from '../src/validation.js';

const jobId = '123e4567-e89b-42d3-a456-426614174000';
const taskId = '123e4567-e89b-42d3-a456-426614174001';
const config = readConfig({ GEN404_API_KEY: 'server-test-key', GEN404_IMAGE_ORIGINS: 'https://images.example.com' });
const noImage = async (): Promise<never> => { throw new Error('Unexpected image request.'); };

test('404-GEN submits text once, persists the task ID, polls documented states and returns an owned download link', async () => {
  const paths: string[] = [];
  const persisted: string[] = [];
  const statuses = ['NoResult', 'InProgress', 'PartialResult(1)', 'Success'];
  const execute = create404Executor(config, (async (url: string, options: RequestInit) => {
    const parsed = new URL(url);
    paths.push(parsed.pathname);
    assert.equal(parsed.origin, 'https://api.dns.404.xyz');
    assert.equal((options.headers as Record<string, string>)['x-api-key'], 'server-test-key');
    assert.equal(options.redirect, 'error');
    if (parsed.pathname === '/add_task') {
      assert.deepEqual(JSON.parse(options.body as string), { prompt: 'A chest', model: '404-3dgs' });
      return Response.json({ id: taskId });
    }
    assert.deepEqual(persisted, [taskId]);
    assert.equal(parsed.searchParams.get('id'), taskId);
    return Response.json({ status: statuses.shift(), worker_id: 'not-a-miner-identity' });
  }) as typeof fetch, { now: () => 0, sleep: async () => {}, loadImage: noImage });
  const result = await execute(parseJobInput({ providerId: '404gen', prompt: 'A chest' }), { jobId, onProviderTaskCreated: (id) => { persisted.push(id); } });
  assert.equal(paths.filter((path) => path === '/add_task').length, 1);
  assert.deepEqual(result.blocks, [{ type: 'files', items: [{ title: 'Download SPZ', url: `/v1/jobs/${jobId}/files/model`, format: 'spz' }] }]);
  assert.equal(result.providerTaskId, taskId);
  assert.equal(result.attribution, undefined);
  assert.ok(!JSON.stringify(result).includes('server-test-key'));
});

test('404-GEN image requests use multipart image-only input and the documented mesh model', async () => {
  let calls = 0;
  const execute = create404Executor(config, (async (_url: string, options: RequestInit) => {
    if (++calls === 1) {
      assert.ok(options.body instanceof FormData);
      assert.equal(options.body.get('model'), '404-mesh');
      assert.equal(options.body.get('prompt'), null);
      const file = options.body.get('image') as File;
      assert.equal(file.type, 'image/png');
      assert.equal(file.name, 'reference.png');
      assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array([1, 2, 3]));
      return Response.json({ id: taskId });
    }
    return Response.json({ status: 'Success' });
  }) as typeof fetch, { now: () => 0, sleep: async () => {}, loadImage: async (url, origins) => {
    assert.equal(url, 'https://images.example.com/chest.png');
    assert.deepEqual(origins, ['https://images.example.com']);
    return { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' };
  } });
  const result = await execute(parseJobInput({ providerId: '404gen', model: '404-mesh', inputImageUrl: 'https://images.example.com/chest.png' }), { jobId });
  assert.equal(result.blocks?.[0].type, 'files');
  assert.match(JSON.stringify(result.blocks), /glb/);
});

test('404-GEN rejects unsupported model/input combinations before submission', () => {
  for (const input of [
    { providerId: '404gen' },
    { providerId: '404gen', model: '404-mesh', prompt: 'A chest' },
    { providerId: '404gen', model: 'invented-model', prompt: 'A chest' },
    { providerId: '404gen', prompt: 'A chest', inputImageUrl: 'https://images.example.com/chest.png' },
    { providerId: '404gen', inputImageUrl: 'http://localhost/chest.png' },
  ]) assert.throws(() => parseJobInput(input));
});

test('404-GEN polling stops on failure, malformed response or deadline without replaying admission', async () => {
  for (const status of ['Failure', 'UnknownState', 'InProgress']) {
    let clock = 0;
    let admissions = 0;
    const execute = create404Executor(config, (async (url: string) => {
      if (url.endsWith('/add_task')) { admissions++; return Response.json({ id: taskId }); }
      return Response.json({ status, reason: 'private account details' });
    }) as typeof fetch, { now: () => clock, sleep: async (ms) => { clock += ms; }, loadImage: noImage });
    await assert.rejects(execute({ providerId: '404gen', prompt: 'A chest' }, { jobId }), (error: Error) => {
      assert.ok(!error.message.includes('private account details'));
      if (status === 'InProgress') assert.match(error.message, /may still be running; do not resubmit automatically/);
      return true;
    });
    assert.equal(admissions, 1);
    assert.ok(clock <= 180_000);
  }
});

test('404-GEN image fetching rejects unknown origins and private DNS before HTTP access', async () => {
  let resolved = false;
  const privateLookup = (async () => { resolved = true; return [{ address: '127.0.0.1', family: 4 }]; }) as unknown as typeof lookup;
  await assert.rejects(load404Image('https://evil.example/image.png', ['https://images.example.com'], privateLookup), /server-approved origin/);
  assert.equal(resolved, false);
  await assert.rejects(load404Image('https://images.example.com/image.png', ['https://images.example.com'], privateLookup), /public IPv4/);
  assert.equal(resolved, true);
  for (const origin of ['http://images.example.com', 'https://images.example.com/path', 'https://images.example.com:8443', 'https://user:secret@images.example.com']) {
    assert.throws(() => readConfig({ GEN404_IMAGE_ORIGINS: origin }));
  }
});

test('404-GEN image retrieval pins the approved address and bounds the actual image bytes', async () => {
  const publicLookup = (async () => [{ address: '8.8.8.8', family: 4 }]) as unknown as typeof lookup;
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const responseFor = (status: number, bytes: Uint8Array) => ((url: URL, options: { lookup: (...args: unknown[]) => void; family: number; headers: unknown }, callback: (response: PassThrough) => void) => {
    assert.equal(url.hostname, 'images.example.com');
    assert.equal(options.family, 4);
    options.lookup(url.hostname, {}, (_error: unknown, address: string, family: number) => {
      assert.equal(address, '8.8.8.8');
      assert.equal(family, 4);
    });
    assert.deepEqual(options.headers, { Accept: 'image/png,image/jpeg' });
    const response = Object.assign(new PassThrough(), { statusCode: status, headers: { 'content-type': 'image/png' } });
    queueMicrotask(() => { callback(response); response.end(bytes); });
    return new EventEmitter();
  }) as unknown as typeof get;
  const args = ['https://images.example.com/image.png', ['https://images.example.com'], publicLookup] as const;
  assert.deepEqual((await load404Image(...args, responseFor(200, png))).bytes, png);
  await assert.rejects(load404Image(...args, responseFor(302, png)), /without a redirect/);
  await assert.rejects(load404Image(...args, responseFor(200, new Uint8Array([1, 2, 3]))), /do not match/);
  await assert.rejects(load404Image(...args, responseFor(200, new Uint8Array(8 * 1024 * 1024 + 1))), /at most 8 MiB/);
});

test('404-GEN downloads use server authentication, bounded bytes and attachment-only responses', async () => {
  const response = await download404Result(config, taskId, '404-mesh', (async (url: string, options: RequestInit) => {
    assert.equal(url, `https://api.dns.404.xyz/get_result?id=${taskId}`);
    assert.equal((options.headers as Record<string, string>)['x-api-key'], 'server-test-key');
    return new Response(new Uint8Array([0x67, 0x6c, 0x54, 0x46]), { headers: { 'Content-Type': 'text/html', 'Set-Cookie': 'provider-private' } });
  }) as typeof fetch);
  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="model.glb"');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('x-api-key'), null);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
  let cancelled = false;
  await assert.rejects(download404Result(config, taskId, '404-3dgs', (async () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
    cancel() { cancelled = true; },
  }))) as typeof fetch), /exceeded/);
  assert.equal(cancelled, true);
  await assert.rejects(download404Result(config, taskId, '404-3dgs', (async () => Response.json({ secret: 'private-details' }, { status: 401 })) as typeof fetch), (error: Error) => /API key/.test(error.message) && !error.message.includes('private-details'));
});
