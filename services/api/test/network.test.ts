import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseMetagraph } from '../src/network.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/metagraph.json', import.meta.url), 'utf8'));

test('metagraph parallel arrays preserve UIDs, roles, activity and endpoint observations independently', () => {
  const snapshot = parseMetagraph(fixture, 'testnet', 298, new Date('2026-10-28T00:00:00Z'));
  assert.equal(snapshot.totalParticipants, 3);
  assert.equal(snapshot.fetchedAt, '2026-10-28T00:00:00.000Z');
  assert.deepEqual(snapshot.participants, [
    { uid: 0, hotkey: 'registered-validator', role: 'validator', active: false, endpointAdvertised: false },
    { uid: 1, hotkey: 'registered-miner-a', role: 'miner', active: true, endpointAdvertised: true },
    { uid: 2, hotkey: 'registered-miner-b', role: 'miner', active: false, endpointAdvertised: false },
  ]);
  assert.deepEqual(parseMetagraph({ ...fixture, uids: [3, 5, 8] }, 'testnet', 298).participants.map((p) => p.uid), [3, 5, 8]);
});

test('metagraph fails closed on mismatched arrays, domain, duplicate UIDs or invalid fields; empty subnets are valid', () => {
  for (const data of [
    { ...fixture, netuid: 22 },
    { ...fixture, active: [] },
    { ...fixture, num_uids: 4 },
    { ...fixture, uids: [0, 0, 1] },
    { ...fixture, block: -1 },
    { ...fixture, validator_permit: [1, 0, 0] },
  ]) assert.throws(() => parseMetagraph(data, 'testnet', 298), /chain response/i);
  const empty = parseMetagraph({ netuid: 298, block: 0, num_uids: 0, hotkeys: [], axons: [], active: [], validator_permit: [] }, 'testnet', 298);
  assert.equal(empty.totalParticipants, 0);
  assert.deepEqual(empty.participants, []);
});
