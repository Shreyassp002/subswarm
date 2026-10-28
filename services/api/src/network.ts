import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { NetworkSnapshot } from '@subswarm/shared';
import { ApiFailure } from './errors.js';

export const allowedNetworks: Record<NetworkSnapshot['network'], readonly number[]> = {
  testnet: [298, 482],
  mainnet: [28, 22, 64, 17, 126, 117, 75, 62],
};

const metagraphSchema = z.object({
  netuid: z.number().int().min(0).max(65535),
  block: z.number().int().nonnegative().safe(),
  name: z.string().max(256).optional().nullable(),
  num_uids: z.number().int().min(0).max(65536),
  uids: z.array(z.number().int().min(0).max(65535)).optional(),
  hotkeys: z.array(z.string().min(1).max(128)).max(65536),
  validator_permit: z.array(z.boolean()).max(65536),
  active: z.array(z.boolean()).max(65536),
  axons: z.array(z.object({
    ip: z.union([z.number().nonnegative(), z.string().max(128)]),
    port: z.number().int().min(0).max(65535),
  })).max(65536),
});

export function assertKnownNetwork(network: string, netuid: number): asserts network is NetworkSnapshot['network'] {
  if (!Object.hasOwn(allowedNetworks, network) || !allowedNetworks[network as NetworkSnapshot['network']].includes(netuid)) {
    throw new ApiFailure('unsupported_network', 'This network and subnet are not configured.', 422);
  }
}

export function parseMetagraph(raw: unknown, network: NetworkSnapshot['network'], netuid: number, now = new Date()): NetworkSnapshot {
  const parsed = metagraphSchema.safeParse(raw);
  if (!parsed.success) throw new ApiFailure('invalid_chain_response', 'The chain response did not match the metagraph schema.', 502);
  const data = parsed.data;
  const count = data.hotkeys.length;
  if (data.netuid !== netuid || data.num_uids !== count || data.validator_permit.length !== count || data.active.length !== count || data.axons.length !== count || (data.uids && (data.uids.length !== count || new Set(data.uids).size !== count))) {
    throw new ApiFailure('invalid_chain_response', 'The chain response contained inconsistent participant records.', 502);
  }
  return {
    network,
    netuid,
    name: data.name ?? null,
    block: data.block,
    fetchedAt: now.toISOString(),
    source: 'live-chain',
    totalParticipants: count,
    participants: data.hotkeys.map((hotkey, index) => ({
      uid: data.uids?.[index] ?? index,
      hotkey,
      role: data.validator_permit[index] ? 'validator' : 'miner',
      active: data.active[index],
      endpointAdvertised: data.axons[index].port > 0 && !['0', '0.0.0.0', '::', ''].includes(String(data.axons[index].ip)),
    })),
  };
}

export interface NetworkReader {
  available: boolean;
  snapshot(network: NetworkSnapshot['network'], netuid: number): Promise<NetworkSnapshot>;
}

function executableExists(binary: string): boolean {
  const candidates = binary.includes('/') ? [binary] : (process.env.PATH ?? '').split(delimiter).map((directory) => join(directory, binary));
  return candidates.some((candidate) => {
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

const runFile = promisify(execFile);

export class BtcliNetworkReader implements NetworkReader {
  readonly available: boolean;
  private readonly cached = new Map<string, { expiresAt: number; snapshot: NetworkSnapshot }>();
  private readonly pending = new Map<string, Promise<NetworkSnapshot>>();

  constructor(private readonly binary: string) {
    this.available = executableExists(binary);
  }

  async snapshot(network: NetworkSnapshot['network'], netuid: number): Promise<NetworkSnapshot> {
    assertKnownNetwork(network, netuid);
    if (!this.available) throw new ApiFailure('network_unavailable', 'The read-only chain CLI is not installed or configured.', 503);
    const key = `${network}:${netuid}`;
    const cached = this.cached.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.snapshot;
    const running = this.pending.get(key);
    if (running) return running;
    const request = this.query(network, netuid).then((snapshot) => {
      this.cached.set(key, { snapshot, expiresAt: Date.now() + 90_000 });
      return snapshot;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }

  private async query(network: NetworkSnapshot['network'], netuid: number): Promise<NetworkSnapshot> {
    try {
      const { stdout } = await runFile(this.binary, ['-n', network === 'testnet' ? 'test' : 'finney', '--json', 'query', 'metagraph', '--netuid', String(netuid)], {
        timeout: 45_000,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
        env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8', NO_COLOR: '1', BT_RETRY_FOREVER: 'false', BT_WALLET_PATH: resolve('data/read-only-wallets') },
      });
      return parseMetagraph(JSON.parse(stdout), network, netuid);
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      throw new ApiFailure('network_query_failed', 'The read-only chain query failed or timed out. Try again shortly.', 502);
    }
  }
}
