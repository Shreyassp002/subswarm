import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Store } from '../src/store.js';
import { TESTNET_GENESIS } from '../src/payments.js';

test('paid provider attempts and concurrency remain globally capped across distinct sessions and failed jobs', () => {
  const store = new Store(':memory:');
  try {
    const a = store.createSession().session.id;
    const b = store.createSession().session.id;
    const account = `0x${'11'.repeat(32)}`;
    const receiver = `0x${'22'.repeat(32)}`;
    store.bindWallet(a, store.createWalletChallenge(a, account, 'http://localhost:3000').id);
    store.creditDeposit(a, { genesisHash: TESTNET_GENESIS, blockHash: `0x${'33'.repeat(32)}`, blockNumber: 1, eventIndex: 0, from: account, to: receiver, amountRao: '10' }, receiver, 1);
    const quote = store.createQuote(a, { providerId: 'saygm', prompt: 'hello' }, '1');
    const job = store.reserveJob(a, { providerId: 'saygm', prompt: 'hello' }, 'text', 2, 40, { daily: 1, concurrent: 1 }, quote.id);
    assert.throws(() => store.reserveJob(b, { providerId: 'saygm', prompt: 'hello' }, 'text', 2, 40, { daily: 1, concurrent: 1 }), /queue is busy/);
    store.failJob(a, job.id, 'Provider failed.');
    assert.throws(() => store.reserveJob(b, { providerId: 'desearch', prompt: 'hello' }, 'search', 2, 40, { daily: 1, concurrent: 1 }), /limit has been reached/);
    assert.equal(store.reserveJob(b, { providerId: 'network' }, 'network-scan', 2, 40).status, 'queued');
  } finally {
    store.close();
  }
});

test('restart marks queued and running jobs failed while retaining completed artifacts and sessions', () => {
  const directory = mkdtempSync(join(tmpdir(), 'subswarm-api-'));
  const path = join(directory, 'state.sqlite');
  let store = new Store(path);
  try {
    const { session, token } = store.createSession();
    const queued = store.reserveJob(session.id, { providerId: 'network' }, 'network-scan', 3, 40);
    const running = store.reserveJob(session.id, { providerId: 'network' }, 'network-scan', 3, 40);
    store.startJob(session.id, running.id);
    const completed = store.reserveJob(session.id, { providerId: 'network' }, 'network-scan', 3, 40);
    store.startJob(session.id, completed.id);
    store.finishJob(session.id, completed.id, { title: 'Complete', text: 'Persisted report' });
    store.close();
    store = new Store(path);
    assert.equal(store.findSession(token)?.id, session.id);
    assert.equal(store.findJob(session.id, queued.id)?.status, 'failed');
    assert.equal(store.findJob(session.id, running.id)?.status, 'failed');
    assert.match(store.findJob(session.id, running.id)?.error ?? '', /server restarted/);
    assert.equal(store.findJob(session.id, completed.id)?.status, 'completed');
    assert.equal(store.listArtifacts(session.id)[0].content, 'Persisted report');
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
