import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePrice } from '../src/pricing.js';
import { configurationReport } from '../src/readiness.js';
import { readConfig } from '../src/config.js';
import { createStorageCleanup } from '../src/storage-retention.js';
import { createApp } from '../src/app.js';
import { Store } from '../src/store.js';
import { TESTNET_GENESIS, MAX_RAO } from '../src/payments.js';

const assumptions = { providerCostMicros: '10000', overheadMicros: '2000', taoUsdMicros: '300000000', successBps: 9000, marginBps: 2000 };
test('pricing covers failed attempts and target margin with upward integer rounding', () => {
  const result = calculatePrice(assumptions);
  assert.equal(result.priceRao, '55556');
  assert.equal(result.costPerSuccessMicros, '13334');
  const needed = 12000n * 10000n * 10000n * 1000000000n;
  const denominator = 9000n * 8000n * 300000000n;
  assert.ok(BigInt(result.priceRao) * denominator >= needed);
  assert.ok((BigInt(result.priceRao) - 1n) * denominator < needed);
  assert.equal(calculatePrice({ ...assumptions, providerCostMicros: '9007199254740993', overheadMicros: '0', taoUsdMicros: '1000000000', successBps: 10000, marginBps: 0 }).priceRao, '9007199254740993');
  for (const override of [{ successBps: 0 }, { successBps: 10001 }, { marginBps: 10000 }, { marginBps: -1 }, { taoUsdMicros: '0' }, { providerCostMicros: '01' }, { overheadMicros: '-1' }, { providerCostMicros: MAX_RAO.toString(), taoUsdMicros: '1' }]) assert.throws(() => calculatePrice({ ...assumptions, ...override }));
});

test('setup reporting exposes missing field names but never credential values or verified claims', () => {
  const config = readConfig({ SAYGM_API_KEY: 'secret-saygm-value', HIPPIUS_ACCESS_KEY_ID: 'secret-hippius-value' });
  const report = configurationReport(config, false);
  const text = JSON.stringify(report);
  assert.ok(!text.includes('secret-'));
  assert.equal(report.providers.find(p => p.id === 'saygm')?.status, 'configured_unverified');
  assert.deepEqual(report.providers.find(p => p.id === 'hippius')?.missing, ['HIPPIUS_SECRET_ACCESS_KEY', 'HIPPIUS_BUCKET']);
  assert.equal(report.providers.find(p => p.id === 'ridges')?.status, 'external_only');
  assert.equal(report.liveVerification, 'not_performed');
  assert.equal(report.payments.enabled, false);
});

test('retention keeps legacy files, denies expired downloads and retries failed deletions without charging again', async () => {
  const store = new Store(':memory:');
  const owner = store.createSession();
  const address = `0x${'11'.repeat(32)}`;
  const receiver = `0x${'22'.repeat(32)}`;
  store.bindWallet(owner.session.id, store.createWalletChallenge(owner.session.id, address, 'http://localhost:3000').id);
  store.creditDeposit(owner.session.id, { genesisHash: TESTNET_GENESIS, blockHash: `0x${'33'.repeat(32)}`, blockNumber: 10, eventIndex: 0, from: address, to: receiver, amountRao: '100' }, receiver, 1);
  const now = new Date();
  function saved(expiresAt?: string) {
    const input = { providerId: 'hippius' as const, fileName: 'note.txt', fileBase64: 'YQ==' };
    const quote = store.createQuote(owner.session.id, input, '1');
    assert.equal(quote.storageRetentionDays, 7);
    const job = store.reserveJob(owner.session.id, input, 'storage', 2, 40, undefined, quote.id);
    store.startJob(owner.session.id, job.id);
    store.finishJob(owner.session.id, job.id, { title: 'note.txt', text: 'Saved', storageSha256: 'a'.repeat(64), storageVersionId: 'pinned-version', storageExpiresAt: expiresAt });
    return job;
  }
  try {
    saved();
    saved(new Date(now.getTime() + 86400000).toISOString());
    const expired = saved(now.toISOString());
    assert.deepEqual(store.expiredStorage(now).map(item => item.job.id), [expired.id]);
    let attempts = 0;
    let fail = true;
    const storage = { execute: async () => { throw new Error('unused'); }, download: async () => { throw new Error('must not download'); }, remove: async (id: string, version?: string) => {
      attempts++;
      assert.equal(id, expired.id);
      assert.equal(version, 'pinned-version');
      if (fail) throw new Error('temporary provider error');
    } };
    const { app } = createApp({ config: readConfig({}), store, storage, network: { available: false, snapshot: async () => { throw new Error('unused'); } } });
    assert.equal((await app.request(`/v1/jobs/${expired.id}/files/storage`, { headers: { Cookie: `subswarm_session=${owner.token}` } })).status, 410);
    const cleanup = createStorageCleanup(store, storage);
    const first = cleanup(now);
    assert.equal(cleanup(now), first);
    assert.deepEqual(await first, { deleted: 0, failed: 1 });
    assert.equal(store.findJob(owner.session.id, expired.id)?.storageDeletedAt, undefined);
    fail = false;
    assert.deepEqual(await cleanup(now), { deleted: 1, failed: 0 });
    assert.deepEqual(await cleanup(now), { deleted: 0, failed: 0 });
    assert.equal(attempts, 2);
    assert.equal(store.walletState(owner.session.id).availableRao, '97');
    assert.equal(store.walletLedger(owner.session.id).filter(e => e.status === 'charged').length, 3);
    assert.match(store.listArtifacts(owner.session.id).find(a => a.jobId === expired.id)!.content, /deleted/);
  } finally { store.close(); }
});
