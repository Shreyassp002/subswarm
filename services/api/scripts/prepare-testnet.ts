import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { Keyring } from '@polkadot/api';
import { cryptoWaitReady, mnemonicGenerate } from '@polkadot/util-crypto';
import { accountId, TESTNET_GENESIS, TESTNET_RPC } from '../src/payments.js';
import { readConfig } from '../src/config.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const envPath = resolve(root, 'services/api/.env');
const keyPath = resolve(root, '.runtime/wallets/testnet-receiver.json');
const source = existsSync(envPath) ? readFileSync(envPath, 'utf8') : readFileSync(resolve(root, 'services/api/.env.example'), 'utf8');
const env = parseEnv(source);
readConfig(env);
if (env.TAO_PAYMENTS_ENABLED === 'true') throw new Error('Payments are already enabled. Leave the existing configuration unchanged.');
async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
  const response = await fetch(TESTNET_RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(15_000), redirect: 'error' });
  if (!response.ok) throw new Error(`Testnet RPC returned HTTP ${response.status}`);
  const body = await response.json() as { result?: unknown; error?: unknown };
  if (body.error || body.result === undefined) throw new Error('Testnet RPC could not verify chain state.');
  return body.result;
}
if (await rpc('chain_getBlockHash', [0]) !== TESTNET_GENESIS) throw new Error('Testnet genesis mismatch. Nothing was changed.');
const head = await rpc('chain_getFinalizedHead');
const header = await rpc('chain_getHeader', [head]) as { number: string };
const start = Number(BigInt(header.number)) + 1;
if (!Number.isSafeInteger(start) || start <= 0 || start > 4_294_967_295) throw new Error('Invalid finalized height.');
await cryptoWaitReady();
let receiver = env.TAO_TESTNET_RECEIVER;
if (!receiver) {
  if (existsSync(keyPath)) {
    const saved = JSON.parse(readFileSync(keyPath, 'utf8')) as { mnemonic: string; address: string; network: string };
    const address = new Keyring({ type: 'sr25519', ss58Format: 42 }).addFromUri(saved.mnemonic).address;
    if (saved.network !== TESTNET_GENESIS || saved.address !== address) throw new Error('Local receiver identity mismatch.');
    receiver = address;
  } else {
    const mnemonic = mnemonicGenerate();
    receiver = new Keyring({ type: 'sr25519', ss58Format: 42 }).addFromUri(mnemonic).address;
    mkdirSync(resolve(root, '.runtime/wallets'), { recursive: true, mode: 0o700 });
    writeFileSync(keyPath, JSON.stringify({ network: TESTNET_GENESIS, address: receiver, mnemonic }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  }
}
accountId(receiver);
const additions: Record<string, string> = { TAO_PAYMENTS_ENABLED: 'false', TAO_TESTNET_RECEIVER: receiver, TAO_DEPOSIT_START_BLOCK: env.TAO_DEPOSIT_START_BLOCK || String(start) };
for (const provider of ['SAYGM', 'CHUTES', 'DESEARCH', 'CHRONOSEEK', '404GEN', 'ATTELIER', 'HIPPIUS']) {
  const name = `TAO_PRICE_${provider}_RAO`;
  additions[name] = env[name] || '1000000';
}
let updated = source;
for (const [name, value] of Object.entries(additions)) {
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  updated = pattern.test(updated) ? updated.replace(pattern, `${name}=${value}`) : `${updated.trimEnd()}\n${name}=${value}\n`;
}
readConfig(parseEnv(updated));
writeFileSync(envPath, updated, { mode: 0o600 });
chmodSync(envPath, 0o600);
console.log(`Prepared testnet receiver: ${receiver}`);
console.log(`Deposit start block: ${additions.TAO_DEPOSIT_START_BLOCK}. Payments remain disabled. No funds moved.`);
console.log('Default quest prices: 0.001 test TAO. Review provider credit budgets before activation.');
