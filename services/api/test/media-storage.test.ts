import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { readConfig } from '../src/config.js';
import { createAttelierExecutor, downloadAttelierResult } from '../src/attelier.js';
import { createHippiusStorage } from '../src/hippius.js';
import { parseJobInput } from '../src/validation.js';
import { createApp } from '../src/app.js';
import { Store } from '../src/store.js';
import { TESTNET_GENESIS } from '../src/payments.js';

const jobId = '123e4567-e89b-42d3-a456-426614174000';
const taskId = '123e4567-e89b-42d3-a456-426614174001';
const quoteId = '123e4567-e89b-42d3-a456-426614174002';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const bytes = Buffer.from('test file');
const output = { url: `https://inference.attelier.ai/v1/requests/${taskId}/content`, kind: 'image' as const, mimeType: 'image/png', sha256: hash(bytes), authentication: 'Bearer' as const };
const config = readConfig({ ATTELIER_API_KEY: 'test-key', ATTELIER_MODEL: 'fixture/model', HIPPIUS_ACCESS_KEY_ID: 'test-key', HIPPIUS_SECRET_ACCESS_KEY: 'test-secret', HIPPIUS_BUCKET: 'test-bucket' });

test('media binds a bounded quote to a durable idempotent request and private result', async () => {
  const recorded: string[] = [];
  const execute = createAttelierExecutor(config, (async (url: string, init: RequestInit) => {
    assert.equal((init.headers as Record<string,string>).Authorization, 'Bearer test-key');
    assert.equal(init.redirect, 'error');
    const path = new URL(url).pathname;
    if (path === '/v1/models') return Response.json({ data: [{ id: 'fixture/model', available: true }] });
    if (path === '/v1/quotes') return Response.json({ id: quoteId, model: 'fixture/model', parameters: { prompt: 'A village' }, expiresAt: Date.now() + 60000, price: { currency: 'USD', maximumMicros: 1000000, estimatedMicros: 500000 } });
    if (path === '/v1/requests') {
      assert.deepEqual(recorded, [quoteId]);
      assert.equal((init.headers as Record<string,string>)['Idempotency-Key'], jobId);
      assert.deepEqual(JSON.parse(init.body as string), { quoteId });
      return Response.json({ id: taskId, quoteId, status: 'succeeded' });
    }
    assert.deepEqual(recorded, [quoteId, taskId]);
    return Response.json({ id: taskId, quoteId, status: 'succeeded', outputs: [output] });
  }) as typeof fetch);
  const result = await execute({ providerId: 'attelier', prompt: 'A village' }, { jobId, onProviderQuoteCreated: id => { recorded.push(id); }, onProviderTaskCreated: id => { recorded.push(id); } });
  assert.equal(result.blocks?.[0].type, 'media');
  assert.equal(result.attribution, undefined);
  assert.ok(JSON.stringify(result.blocks).includes(`/v1/jobs/${jobId}/files/media/0`));
});

test('invalid media quotes never spend provider credit', async () => {
  for (const change of [{ price: { currency: 'USD', amountMicros: 1000001 } }, { expiresAt: 0 }, { model: 'other' }, { parameters: { prompt: 'different' } }]) {
    let admissions = 0;
    const execute = createAttelierExecutor(config, (async (url: string) => {
      if (url.endsWith('/models')) return Response.json({ data: [{ id: 'fixture/model', available: true }] });
      if (url.endsWith('/quotes')) return Response.json({ id: quoteId, model: 'fixture/model', parameters: { prompt: 'A village' }, expiresAt: Date.now() + 60000, price: { currency: 'USD', amountMicros: 1 }, ...change });
      admissions++; throw new Error('unexpected admission');
    }) as typeof fetch);
    await assert.rejects(execute({ providerId: 'attelier', prompt: 'A village' }, { jobId, onProviderQuoteCreated: () => {}, onProviderTaskCreated: () => {} }), /quote/);
    assert.equal(admissions, 0);
  }
});

test('media download enforces request location, MIME and digest before releasing bytes', async () => {
  let fetched = 0;
  const fetcher = (async () => { fetched++; return new Response(bytes, { headers: { 'Content-Type': 'image/png' } }); }) as typeof fetch;
  const response = await downloadAttelierResult(config, taskId, output, fetcher);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  await assert.rejects(downloadAttelierResult(config, taskId, { ...output, url: 'https://evil.example/content' }, fetcher));
  assert.equal(fetched, 1);
  await assert.rejects(downloadAttelierResult(config, taskId, { ...output, sha256: '0'.repeat(64) }, fetcher), /hash/);
});

test('storage bounds canonical uploads and uses only the configured bucket and job key', async () => {
  const operations: string[] = [];
  const client = { send: async (command: PutObjectCommand | GetObjectCommand | DeleteObjectCommand) => {
    assert.equal(command.input.Bucket, 'test-bucket');
    assert.equal(command.input.Key, `subswarm/${jobId}`);
    operations.push(command.constructor.name);
    if (command instanceof PutObjectCommand) {
      assert.deepEqual(command.input.Body, bytes);
      assert.equal(command.input.ACL, undefined);
      assert.equal(command.input.Metadata?.sha256, hash(bytes));
      return { VersionId: 'stored-version' };
    }
    assert.equal(command.input.VersionId, 'stored-version');
    if (command instanceof GetObjectCommand) return { Body: Readable.from([bytes]) };
    return {};
  } } as unknown as S3Client;
  const storage = createHippiusStorage(config, client);
  const result = await storage.execute(parseJobInput({ providerId: 'hippius', fileName: 'note.txt', fileBase64: bytes.toString('base64') }), { jobId });
  assert.equal(result.storageSha256, hash(bytes));
  assert.equal(result.storageVersionId, 'stored-version');
  assert.equal(result.blocks?.[0].type, 'stored-file');
  assert.deepEqual(Buffer.from(await (await storage.download(jobId, 'note.txt', hash(bytes), result.storageVersionId)).arrayBuffer()), bytes);
  await storage.remove(jobId, result.storageVersionId);
  assert.deepEqual(operations, ['PutObjectCommand', 'GetObjectCommand', 'DeleteObjectCommand']);
  for (const file of ['', Buffer.alloc(256 * 1024 + 1).toString('base64'), 'YQ']) assert.throws(() => parseJobInput({ providerId: 'hippius', fileName: 'note.txt', fileBase64: file }));
  assert.throws(() => parseJobInput({ providerId: 'hippius', fileName: '../note.txt', fileBase64: 'YQ==' }));
  await assert.rejects(storage.download(jobId, 'note.txt', '0'.repeat(64), result.storageVersionId), /verified/);
});

test('private media and storage routes enforce ownership, redact uploads and make deletion idempotent', async () => {
  const store = new Store(':memory:');
  let removals = 0;
  let downloads = 0;
  const { app } = createApp({ config, store, network: { available: false, snapshot: async () => { throw new Error('unused'); } }, storage: {
    execute: async () => { throw new Error('unused'); }, download: async () => { downloads++; return new Response('file'); }, remove: async () => { removals++; },
  }, downloadMedia: async () => { downloads++; return new Response('media'); } });
  try {
    const owner = store.createSession();
    const stranger = store.createSession();
    const address = `0x${'11'.repeat(32)}`;
    const receiver = `0x${'22'.repeat(32)}`;
    store.bindWallet(owner.session.id, store.createWalletChallenge(owner.session.id, address, 'http://localhost:3000').id);
    store.creditDeposit(owner.session.id, { genesisHash: TESTNET_GENESIS, blockHash: `0x${'33'.repeat(32)}`, blockNumber: 10, eventIndex: 0, from: address, to: receiver, amountRao: '10' }, receiver, 1);
    for (const providerId of ['hippius', 'attelier'] as const) {
      const input = providerId === 'hippius' ? { providerId, fileName: 'note.txt', fileBase64: bytes.toString('base64') } : { providerId, prompt: 'A village' };
      const quote = store.createQuote(owner.session.id, input, '1');
      const job = store.reserveJob(owner.session.id, input, providerId === 'hippius' ? 'storage' : 'media', 2, 40, undefined, quote.id);
      store.startJob(owner.session.id, job.id);
      store.recordProviderQuote(owner.session.id, job.id, quoteId);
      assert.throws(() => store.recordProviderQuote(owner.session.id, job.id, taskId), /identity/);
      store.finishJob(owner.session.id, job.id, { title: 'Saved', text: 'Saved', storageSha256: hash(bytes), mediaOutputs: [output], providerTaskId: taskId });
      assert.equal(store.findJob(owner.session.id, job.id)?.input.fileBase64, undefined);
      const path = `/v1/jobs/${job.id}/files/${providerId === 'hippius' ? 'storage' : 'media/0'}`;
      const headers = { Cookie: `subswarm_session=${owner.token}`, Origin: 'http://localhost:3000', 'Content-Type': 'application/json' };
      assert.equal((await app.request(path, { headers: { Cookie: `subswarm_session=${stranger.token}` } })).status, 404);
      assert.equal(downloads, providerId === 'hippius' ? 0 : 1);
      assert.equal((await app.request(path, { headers })).status, 200);
      if (providerId === 'hippius') {
        assert.equal((await app.request(`${path}/delete`, { method: 'POST', headers: { ...headers, Cookie: `subswarm_session=${stranger.token}` }, body: '{}' })).status, 404);
        for (let i = 0; i < 2; i++) assert.equal((await app.request(`${path}/delete`, { method: 'POST', headers, body: '{}' })).status, 200);
        assert.equal(removals, 1);
        assert.match(store.listArtifacts(owner.session.id).find(item => item.jobId === job.id)!.content, /deleted/);
        assert.equal((await app.request(path, { headers })).status, 404);
      }
    }
  } finally { store.close(); }
});
