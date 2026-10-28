import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { cryptoWaitReady, encodeAddress, sr25519PairFromSeed, sr25519Sign } from '@polkadot/util-crypto';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { accountId, MAX_RAO, rao, TESTNET_GENESIS, TestnetDepositReader } from '../src/payments.js';
import { Store } from '../src/store.js';
import type { ApiPromise } from '@polkadot/api';

const account = `0x${'11'.repeat(32)}`;
const receiver = `0x${'22'.repeat(32)}`;
const blockHash = `0x${'33'.repeat(32)}`;
const input = { providerId: 'saygm', prompt: 'hello' } as const;
const origin = 'http://localhost:3000';
const evidence = (amountRao = '10', eventIndex = 1) => ({ genesisHash: TESTNET_GENESIS, blockHash, blockNumber: 123, eventIndex, from: account, to: receiver, amountRao });

function bind(store: Store, sessionId: string, address = account) {
  const challenge = store.createWalletChallenge(sessionId, address, origin);
  store.bindWallet(sessionId, challenge.id);
}

function funded(store: Store, amount = '10') {
  const session = store.createSession().session;
  bind(store, session.id);
  store.creditDeposit(session.id, evidence(amount), receiver, 100);
  return session.id;
}

function reserve(store: Store, sessionId: string, amount = '6') {
  const quote = store.createQuote(sessionId, input, amount);
  return store.reserveJob(sessionId, input, 'text', 10, 100, { daily: 100, concurrent: 10 }, quote.id);
}

test('rao parsing preserves integer precision and rejects noncanonical, zero-price and overflow amounts', () => {
  assert.equal(rao(MAX_RAO.toString()), MAX_RAO);
  assert.equal(rao('9007199254740993'), 9007199254740993n);
  for (const value of ['', '-1', '1.5', '01', '1e9', (MAX_RAO + 1n).toString()]) assert.throws(() => rao(value));
  const store = new Store(':memory:');
  try {
    const session = funded(store, MAX_RAO.toString());
    assert.throws(() => store.creditDeposit(session, evidence('1', 2), receiver, 100), /balance limit/);
    assert.equal(store.walletState(session).availableRao, MAX_RAO.toString());
    assert.throws(() => store.createQuote(session, input, '0'), /greater than zero/);
  } finally { store.close(); }
});

test('deposits validate wallet, recipient, chain and start height, and credit each event exactly once', () => {
  const store = new Store(':memory:');
  try {
    const session = store.createSession().session.id;
    bind(store, session);
    for (const change of [{ from: receiver }, { to: account }, { genesisHash: blockHash }, { blockNumber: 99 }, { amountRao: '0' }]) {
      assert.throws(() => store.creditDeposit(session, { ...evidence(), ...change }, receiver, 100));
      assert.equal(store.walletState(session).availableRao, '0');
    }
    store.creditDeposit(session, evidence(), receiver, 100);
    const otherSession = store.createSession().session.id;
    bind(store, otherSession, encodeAddress(account, 0));
    assert.equal(store.creditDeposit(otherSession, evidence(), receiver, 100).availableRao, '10');
    assert.equal(store.walletLedger(otherSession).filter(entry => entry.kind === 'deposit').length, 1);
    assert.throws(() => store.creditDeposit(otherSession, evidence('11'), receiver, 100), /conflicts/);
    assert.equal(store.walletState(otherSession).availableRao, '10');
  } finally { store.close(); }
});

test('quotes bind exact input, session and wallet; reservation and terminal accounting are atomic', () => {
  const store = new Store(':memory:');
  try {
    const session = funded(store);
    const quote = store.createQuote(session, input, '6');
    const other = store.createSession().session.id;
    bind(store, other);
    assert.throws(() => store.reserveJob(other, input, 'text', 10, 100, undefined, quote.id), /fresh quote/);
    assert.throws(() => store.reserveJob(session, { ...input, prompt: 'changed' }, 'text', 10, 100, undefined, quote.id), /fresh quote/);
    const job = store.reserveJob(session, input, 'text', 10, 100, undefined, quote.id);
    assert.equal(store.walletState(session).availableRao, '4');
    assert.equal(store.walletState(session).reservedRao, '6');
    assert.throws(() => store.reserveJob(session, input, 'text', 10, 100, undefined, quote.id), /fresh quote/);
    assert.throws(() => reserve(store, other), /balance is too low/);
    assert.equal(store.listJobs(other).length, 0);
    store.startJob(session, job.id);
    store.finishJob(session, job.id, { title: 'Complete', text: 'Result' });
    store.finishJob(session, job.id, { title: 'Duplicate', text: 'Duplicate' });
    store.failJob(session, job.id, 'Late failure');
    assert.equal(store.walletState(session).reservedRao, '0');
    assert.equal(store.walletState(session).availableRao, '4');
    assert.equal(store.listArtifacts(session).length, 1);
    const failed = reserve(store, session, '4');
    store.failJob(session, failed.id, 'Provider failure');
    store.failJob(session, failed.id, 'Duplicate failure');
    assert.equal(store.walletState(session).availableRao, '4');
    assert.equal(store.walletState(session).reservedRao, '0');
  } finally { store.close(); }
});

test('expired and changed-wallet quotes fail and restart releases interrupted requests once', () => {
  const directory = mkdtempSync(join(tmpdir(), 'subswarm-payments-'));
  const path = join(directory, 'state.sqlite');
  let store = new Store(path);
  const originalNow = Date.now;
  try {
    const session = funded(store);
    const quote = store.createQuote(session, input, '6');
    const challenge = store.createWalletChallenge(session, account, origin);
    const now = Date.now();
    Date.now = () => now + 5 * 60_000;
    assert.throws(() => store.walletChallenge(session, challenge.id), /expired or was already used/);
    assert.throws(() => store.reserveJob(session, input, 'text', 10, 100, undefined, quote.id), /fresh quote/);
    Date.now = () => now + 24 * 60 * 60_000;
    assert.equal(store.walletState(session).address, null);
    Date.now = originalNow;
    bind(store, session, receiver);
    assert.throws(() => store.reserveJob(session, input, 'text', 10, 100, undefined, quote.id), /fresh quote/);
    bind(store, session);
    const job = reserve(store, session);
    store.startJob(session, job.id);
    store.close();
    store = new Store(path);
    assert.equal(store.findJob(session, job.id)?.status, 'failed');
    assert.equal(store.walletState(session).availableRao, '10');
    assert.equal(store.walletState(session).reservedRao, '0');
    assert.equal(store.creditDeposit(session, evidence(), receiver, 100).availableRao, '10');
    store.close();
    store = new Store(path);
    assert.equal(store.walletState(session).availableRao, '10');
  } finally { Date.now = originalNow; store.close(); rmSync(directory, { recursive: true, force: true }); }
});

function chainFixture(options: { genesis?: string; finalized?: number; canonical?: string; sender?: string; failed?: boolean; success?: boolean; signed?: boolean; transfer?: boolean } = {}) {
  const number = (n: number) => ({ toBigInt: () => BigInt(n), toNumber: () => n, toString: () => String(n) });
  const phase = { isApplyExtrinsic: true, asApplyExtrinsic: number(0) };
  const event = { section: 'balances', method: options.transfer === false ? 'Deposit' : 'Transfer', data: [account, receiver, '10'] };
  const events = [{ phase, event }, ...(options.success === false ? [] : [{ phase, event: { section: 'system', method: 'ExtrinsicSuccess' } }]), ...(options.failed ? [{ phase, event: { section: 'system', method: 'ExtrinsicFailed' } }] : [])];
  const is = (section: string, method: string) => ({ is: (value: { section: string; method: string }) => value.section === section && value.method === method });
  return {
    isReadyOrError: Promise.resolve(), genesisHash: { toHex: () => options.genesis ?? TESTNET_GENESIS },
    rpc: { chain: {
      getHeader: async (hash: unknown) => ({ number: number(hash === 'final' ? options.finalized ?? 123 : 123) }),
      getFinalizedHead: async () => 'final', getBlockHash: async () => ({ toHex: () => options.canonical ?? blockHash }),
      getBlock: async () => ({ block: { extrinsics: [{ isSigned: options.signed ?? true, signer: options.sender ?? account }] } }),
    } },
    at: async () => ({ query: { system: { events: async () => events } } }),
    events: { balances: { Transfer: is('balances', 'Transfer') }, system: { ExtrinsicSuccess: is('system', 'ExtrinsicSuccess'), ExtrinsicFailed: is('system', 'ExtrinsicFailed') } },
    disconnect: async () => {},
  } as unknown as ApiPromise;
}

test('RPC evidence requires approved genesis, canonical finality, native transfer and successful matching signer', async () => {
  const accepted = await new TestnetDepositReader(() => chainFixture()).verify(blockHash, 0);
  assert.deepEqual(accepted, { ...evidence(), eventIndex: 0 });
  for (const options of [{ genesis: blockHash }, { finalized: 122 }, { canonical: TESTNET_GENESIS }, { sender: receiver }, { failed: true }, { success: false }, { signed: false }, { transfer: false }]) {
    await assert.rejects(new TestnetDepositReader(() => chainFixture(options)).verify(blockHash, 0));
  }
  await assert.rejects(new TestnetDepositReader(() => chainFixture()).verify(blockHash, 99), /not a native TAO transfer/);
});

test('wallet signatures, nonce replay, session binding and paid job boundary work end to end without provider calls', async () => {
  await cryptoWaitReady();
  const pair = sr25519PairFromSeed(new Uint8Array(32).fill(7));
  const address = encodeAddress(pair.publicKey, 42);
  const config = readConfig({ SAYGM_API_KEY: 'test-only', TAO_PAYMENTS_ENABLED: 'true', TAO_TESTNET_RECEIVER: receiver, TAO_DEPOSIT_START_BLOCK: '100', TAO_PRICE_SAYGM_RAO: '6', MAX_DAILY_REQUESTS: '100' });
  let calls = 0;
  const store = new Store(':memory:');
  const { app, drain } = createApp({ config, store, network: { available: false, snapshot: async () => { throw new Error('Unused'); } },
    deposits: { verify: async () => ({ ...evidence(), from: accountId(address) }) },
    execute: async () => { calls++; return { title: 'Paid result', text: 'Fixture response' }; } });
  const session = await app.request('/v1/session');
  const cookie = session.headers.get('set-cookie')!.split(';')[0];
  const post = (path: string, data: unknown, owner = cookie) => app.request(path, { method: 'POST', headers: { Cookie: owner, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  try {
    assert.equal((await post('/v1/jobs', input)).status, 401);
    const { challenge } = await (await post('/v1/wallet/challenge', { address })).json();
    const signature = `0x${Buffer.from(sr25519Sign(new TextEncoder().encode(`<Bytes>${challenge.message}</Bytes>`), pair)).toString('hex')}`;
    const stranger = (await app.request('/v1/session')).headers.get('set-cookie')!.split(';')[0];
    assert.equal((await post('/v1/wallet/verify', { challengeId: challenge.id, signature }, stranger)).status, 401);
    assert.equal((await post('/v1/wallet/verify', { challengeId: challenge.id, signature: `0x${'00'.repeat(64)}` })).status, 401);
    assert.equal((await post('/v1/wallet/verify', { challengeId: challenge.id, signature })).status, 200);
    assert.equal((await post('/v1/wallet/verify', { challengeId: challenge.id, signature })).status, 401);
    const { quote } = await (await post('/v1/quotes', input)).json();
    assert.equal((await post('/v1/jobs', { ...input, quoteId: quote.id })).status, 402);
    assert.equal((await post('/v1/wallet/deposits', { blockHash, eventIndex: 1 })).status, 200);
    const results = await Promise.all([post('/v1/jobs', { ...input, quoteId: quote.id }), post('/v1/jobs', { ...input, quoteId: quote.id })]);
    assert.deepEqual(results.map((r) => r.status).sort(), [202, 409]);
    await drain();
    assert.equal(calls, 1);
    const ledger = await app.request('/v1/wallet/ledger', { headers: { Cookie: cookie } });
    const entries = (await ledger.json()).entries;
    assert.deepEqual(entries.map((entry: { status: string }) => entry.status).sort(), ['charged', 'credited']);
    assert.ok(entries.every((entry: { createdAt: string }) => Number.isFinite(Date.parse(entry.createdAt))));
    const strangerLedger = await app.request('/v1/wallet/ledger', { headers: { Cookie: stranger } });
    assert.deepEqual((await strangerLedger.json()).entries, []);
    const walletResponse = await app.request('/v1/wallet', { headers: { Cookie: cookie } });
    assert.equal((await walletResponse.json()).wallet.availableRao, '4');
    const repeatedDeposit = await post('/v1/wallet/deposits', { blockHash, eventIndex: 1 });
    assert.equal(repeatedDeposit.status, 200);
    assert.equal((await repeatedDeposit.json()).wallet.availableRao, '4');
    assert.equal((await post('/v1/wallet/disconnect', {})).status, 200);
    assert.equal((await post('/v1/quotes', input)).status, 401);
  } finally { await drain(); store.close(); }
});
