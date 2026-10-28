import { createHash } from 'node:crypto';
import { ApiPromise, HttpProvider } from '@polkadot/api';
import type { EventRecord } from '@polkadot/types/interfaces';
import type { Vec } from '@polkadot/types-codec';
import { cryptoWaitReady, decodeAddress, encodeAddress, signatureVerify } from '@polkadot/util-crypto';
import type { JobInput, PaymentSettings } from '@subswarm/shared';
import { ApiFailure } from './errors.js';

export const TESTNET_GENESIS = '0x8f9cf856bf558a14440e75569c9e58594757048d7b3a84b5d25f6bd978263105';
export const MAX_RAO = (1n << 64n) - 1n;
export const TESTNET_RPC = 'https://test.finney.opentensor.ai';

export interface PaymentConfig {
  enabled: boolean;
  receiver?: string;
  startBlock?: number;
  pricesRao: Record<string, string>;
}

export function rao(value: string): bigint {
  if (!/^(0|[1-9][0-9]{0,19})$/.test(value) || BigInt(value) > MAX_RAO) {
    throw new ApiFailure('invalid_amount', 'Amounts must be bounded integer rao strings.', 422);
  }
  return BigInt(value);
}

export function accountId(address: string): string {
  try {
    const bytes = decodeAddress(address);
    if (bytes.length !== 32) throw new Error('Invalid account');
    return `0x${Buffer.from(bytes).toString('hex')}`;
  } catch {
    throw new ApiFailure('invalid_wallet', 'Use a valid Substrate AccountId32 wallet address.', 422);
  }
}

export function walletAddress(account: string): string {
  return encodeAddress(account, 42);
}

export function inputHash(input: JobInput): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export async function verifyWalletSignature(message: string, signature: string, account: string): Promise<boolean> {
  await cryptoWaitReady();
  try {
    return signatureVerify(message, signature, account).isValid;
  } catch {
    return false;
  }
}

export function paymentSettings(config?: PaymentConfig): PaymentSettings {
  const enabled = Boolean(config?.enabled && config.receiver && config.startBlock && Object.keys(config.pricesRao).length);
  return {
    enabled, network: 'testnet', receiver: enabled ? walletAddress(accountId(config!.receiver!)) : null,
    genesisHash: TESTNET_GENESIS, rpcUrl: 'wss://test.finney.opentensor.ai:443', maxDepositRao: MAX_RAO.toString(), pricesRao: enabled ? config!.pricesRao : {},
    ...(!enabled ? { reason: 'Testnet TAO payments need a receiver, deposit start block, and request prices configured by the operator.' } : {}),
  };
}

export interface DepositEvidence {
  genesisHash: string;
  blockHash: string;
  blockNumber: number;
  eventIndex: number;
  from: string;
  to: string;
  amountRao: string;
}

export interface DepositReader {
  verify(blockHash: string, eventIndex: number): Promise<DepositEvidence>;
}

export class TestnetDepositReader implements DepositReader {
  constructor(private readonly connect: () => ApiPromise = () => new ApiPromise({ provider: new HttpProvider(TESTNET_RPC, {}, 15_000), noInitWarn: true, throwOnConnect: true })) {}

  async verify(blockHash: string, eventIndex: number): Promise<DepositEvidence> {
    const api = this.connect();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.read(api, blockHash, eventIndex),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ApiFailure('chain_unavailable', 'Testnet verification timed out. Try again later.', 503)), 30_000); }),
      ]);
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      throw new ApiFailure('chain_unavailable', 'The testnet node could not verify this transfer. Try again later.', 503);
    } finally {
      if (timer) clearTimeout(timer);
      await api.disconnect();
    }
  }

  private async read(api: ApiPromise, blockHash: string, eventIndex: number): Promise<DepositEvidence> {
    await api.isReadyOrError;
    if (api.genesisHash.toHex() !== TESTNET_GENESIS) throw new ApiFailure('wrong_chain', 'The payment node is not the approved Bittensor testnet.', 503);
    const [header, finalizedHash] = await Promise.all([api.rpc.chain.getHeader(blockHash), api.rpc.chain.getFinalizedHead()]);
    const finalized = await api.rpc.chain.getHeader(finalizedHash);
    if (header.number.toBigInt() > finalized.number.toBigInt() || (await api.rpc.chain.getBlockHash(header.number.toString())).toHex() !== blockHash) {
      throw new ApiFailure('transfer_unfinalized', 'The transfer must be in the finalized canonical testnet chain.', 422);
    }
    const at = await api.at(blockHash);
    const [rawEvents, block] = await Promise.all([at.query.system.events(), api.rpc.chain.getBlock(blockHash)]);
    const events = rawEvents as Vec<EventRecord>;
    const record = events[eventIndex];
    if (!record || !record.phase.isApplyExtrinsic || !api.events.balances.Transfer.is(record.event)) {
      throw new ApiFailure('invalid_transfer', 'This event is not a native TAO transfer.', 422);
    }
    const index = record.phase.asApplyExtrinsic.toNumber();
    const extrinsic = block.block.extrinsics[index];
    const relevant = events.filter((item) => item.phase.isApplyExtrinsic && item.phase.asApplyExtrinsic.toNumber() === index);
    const [from, to, amount] = record.event.data;
    if (!extrinsic?.isSigned || accountId(extrinsic.signer.toString()) !== accountId(from.toString()) ||
        !relevant.some((item) => api.events.system.ExtrinsicSuccess.is(item.event)) ||
        relevant.some((item) => api.events.system.ExtrinsicFailed.is(item.event))) {
      throw new ApiFailure('invalid_transfer', 'The transfer must belong to a successful extrinsic signed by its sender.', 422);
    }
    return { genesisHash: TESTNET_GENESIS, blockHash, blockNumber: header.number.toNumber(), eventIndex,
      from: accountId(from.toString()), to: accountId(to.toString()), amountRao: amount.toString() };
  }
}
