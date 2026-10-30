import type { ApiPromise } from "@polkadot/api";
import type { PaymentSettings, WalletState } from "@subswarm/shared";
import { api } from "@/lib/api";
import { parseTAO } from "@/lib/money";

export const TESTNET_GENESIS = "0x8f9cf856bf558a14440e75569c9e58594757048d7b3a84b5d25f6bd978263105";
const TESTNET_RPC = "wss://test.finney.opentensor.ai:443";
const PENDING_KEY = "subswarm.testnet.deposit.v1";

export interface WalletAccount {
  address: string;
  name: string;
  source: WalletSource;
}

export interface DepositPreview {
  address: string;
  receiver: string;
  amountRao: string;
  feeRao: string;
  freeRao: string;
  keepAliveRao: string;
}

export interface PendingDeposit {
  address: string;
  receiver: string;
  amountRao: string;
  txHash: string;
  startBlock: number;
  blockHash?: string;
  eventIndex?: number;
}

interface ChainEvent {
  phase: { isApplyExtrinsic: boolean; asApplyExtrinsic: { toNumber(): number } };
  event: { section: string; method: string; data: { toString(): string }[] };
}

function requireTestnet(settings: PaymentSettings): asserts settings is PaymentSettings & { receiver: string } {
  if (!settings.enabled || !settings.receiver) throw new Error(settings.reason || "Testnet deposits are not configured.");
  if (settings.network !== "testnet" || settings.genesisHash !== TESTNET_GENESIS || settings.rpcUrl !== TESTNET_RPC) {
    throw new Error("The payment network is not the supported Bittensor testnet.");
  }
}

async function connectChain(): Promise<ApiPromise> {
  const { ApiPromise, WsProvider } = await import("@polkadot/api");
  const provider = new WsProvider(TESTNET_RPC, false);
  const chain = new ApiPromise({ provider, noInitWarn: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      provider.connect().then(() => chain.isReadyOrError),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("The testnet connection timed out. Try again later.")), 20_000); }),
    ]);
    if (chain.genesisHash.toHex() !== TESTNET_GENESIS) throw new Error("Network identity mismatch. Signing is disabled.");
    return chain;
  } catch (error) {
    await chain.disconnect();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const WALLET_OPTIONS = [
  { id: "talisman", name: "Talisman", url: "https://www.talisman.xyz/", detail: "Recommended" },
  { id: "subwallet-js", name: "SubWallet", url: "https://www.subwallet.app/", detail: "Browser extension" },
  { id: "polkadot-js", name: "Polkadot.js", url: "https://polkadot.js.org/extension/", detail: "Developer signer" },
] as const;
export type WalletSource = typeof WALLET_OPTIONS[number]["id"];
type Extension = Awaited<ReturnType<typeof import("@polkadot/extension-dapp").web3FromSource>>;
type InjectedWallet = Pick<Extension, "accounts" | "signer">;
const CONNECTION_KEY = "subswarm.wallet.connection.v1";

export function installedWallets(): WalletSource[] {
  if (typeof window === "undefined") return [];
  const injected = (window as unknown as { injectedWeb3?: Record<string, unknown> }).injectedWeb3;
  return WALLET_OPTIONS.filter(({ id }) => !!injected?.[id]).map(({ id }) => id);
}

export function savedWallet(): WalletAccount | null {
  try {
    const saved = JSON.parse(localStorage.getItem(CONNECTION_KEY) || "null") as WalletAccount | null;
    return saved && typeof saved.address === "string" && typeof saved.name === "string" && WALLET_OPTIONS.some(({ id }) => id === saved.source) ? saved : null;
  } catch { return null; }
}

export async function savedWalletFor(address: string | null): Promise<WalletAccount | null> {
  const saved = savedWallet();
  if (!saved || !address) return null;
  const { decodeAddress, isAddress } = await import("@polkadot/util-crypto");
  const { u8aEq } = await import("@polkadot/util");
  return isAddress(saved.address) && isAddress(address) && u8aEq(decodeAddress(saved.address), decodeAddress(address)) ? saved : null;
}

export function forgetWallet() {
  localStorage.removeItem(CONNECTION_KEY);
}

async function enableWallet(source: WalletSource): Promise<InjectedWallet> {
  const option = WALLET_OPTIONS.find(({ id }) => id === source);
  const injected = (window as unknown as { injectedWeb3?: Record<string, { enable: (name: string) => Promise<InjectedWallet> }> }).injectedWeb3;
  if (!option || !injected?.[source]) throw new Error(`Install or unlock ${option?.name || "your wallet"}, then refresh this page.`);
  try { return await injected[source].enable("Subswarm testnet"); }
  catch { throw new Error(`Connection was not approved in ${option.name}. Unlock the extension and allow Subswarm to access your account.`); }
}

export async function listWalletAccounts(source: WalletSource): Promise<WalletAccount[]> {
  const extension = await enableWallet(source);
  const accounts = (await extension.accounts.get()).filter(account => (!account.genesisHash || account.genesisHash === TESTNET_GENESIS) && account.type !== "ethereum");
  if (!accounts.length) throw new Error("No compatible accounts are shared. Create or share a Substrate account enabled for Bittensor testnet or all networks.");
  return accounts.map(account => ({ address: account.address, name: account.name || "My account", source }));
}

async function accountSigner(account: WalletAccount) {
  const extension = await enableWallet(account.source);
  const { decodeAddress, isAddress } = await import("@polkadot/util-crypto");
  const { u8aEq } = await import("@polkadot/util");
  const accounts = await extension.accounts.get();
  if (!isAddress(account.address) || !accounts.some(candidate => candidate.type !== "ethereum" && (!candidate.genesisHash || candidate.genesisHash === TESTNET_GENESIS) && isAddress(candidate.address) && u8aEq(decodeAddress(candidate.address), decodeAddress(account.address)))) {
    throw new Error("This account is no longer shared by the selected wallet. Reconnect and choose your account again.");
  }
  return extension.signer;
}

export async function connectWallet(account: WalletAccount): Promise<WalletState> {
  const signer = await accountSigner(account);
  const { stringToHex } = await import("@polkadot/util");
  if (!signer.signRaw) throw new Error("This account cannot sign a login message. Use a software Substrate account with message signing enabled.");
  const { address } = account;
  const { challenge } = await api<{ challenge: { id: string; message: string; expiresAt: string } }>("/v1/wallet/challenge", {
    method: "POST", body: JSON.stringify({ address }),
  });
  let signature: string;
  try { ({ signature } = await signer.signRaw({ address, data: stringToHex(challenge.message), type: "bytes" })); }
  catch { throw new Error("The connection message was not signed. You can try again; no funds moved."); }
  const { wallet } = await api<{ wallet: WalletState }>("/v1/wallet/verify", {
    method: "POST", body: JSON.stringify({ challengeId: challenge.id, signature }),
  });
  localStorage.setItem(CONNECTION_KEY, JSON.stringify(account));
  return wallet;
}

async function previewOnChain(chain: ApiPromise, address: string, settings: PaymentSettings, amountRao: string): Promise<DepositPreview> {
  requireTestnet(settings);
  if (BigInt(amountRao) <= BigInt(0) || BigInt(amountRao) > BigInt(settings.maxDepositRao)) throw new Error("This amount exceeds the testnet deposit limit.");
  const transfer = chain.tx.balances.transferKeepAlive(settings.receiver, amountRao);
  const [info, account] = await Promise.all([transfer.paymentInfo(address), chain.query.system.account(address)]);
  const data = (account as unknown as { data: { free: { toString(): string }; frozen?: { toString(): string }; miscFrozen?: { toString(): string }; feeFrozen?: { toString(): string } } }).data;
  const free = BigInt(data.free.toString());
  const fee = BigInt(info.partialFee.toString());
  const keepAlive = BigInt(chain.consts.balances.existentialDeposit.toString());
  const frozen = [data.frozen, data.miscFrozen, data.feeFrozen].reduce<bigint>((max, value) => value && BigInt(value.toString()) > max ? BigInt(value.toString()) : max, BigInt(0));
  const minimum = frozen > keepAlive ? frozen : keepAlive;
  if (free - BigInt(amountRao) - fee < minimum) throw new Error("Insufficient transferable test TAO for this deposit, its network fee, and the keep-alive balance.");
  return { address, receiver: settings.receiver, amountRao, feeRao: fee.toString(), freeRao: free.toString(), keepAliveRao: minimum.toString() };
}

export async function prepareDeposit(address: string, settings: PaymentSettings, amount: string): Promise<DepositPreview> {
  requireTestnet(settings);
  const amountRao = parseTAO(amount).toString();
  const chain = await connectChain();
  try { return await previewOnChain(chain, address, settings, amountRao); }
  finally { await chain.disconnect(); }
}

export function loadPendingDeposit(): PendingDeposit | null {
  const value = localStorage.getItem(PENDING_KEY);
  if (!value) return null;
  const pending = JSON.parse(value) as PendingDeposit;
  if (!pending || !/^0x[0-9a-f]{64}$/i.test(pending.txHash) || !Number.isSafeInteger(pending.startBlock) || pending.startBlock < 0 || !/^\d+$/.test(pending.amountRao) || typeof pending.address !== "string" || typeof pending.receiver !== "string") {
    throw new Error("The saved deposit receipt is invalid. Verify your existing transaction before starting another deposit.");
  }
  return pending;
}

function savePending(pending: PendingDeposit) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

async function findReceipt(chain: ApiPromise, pending: PendingDeposit, blockHash: string): Promise<PendingDeposit> {
  const [{ block }, at, finalizedHash] = await Promise.all([chain.rpc.chain.getBlock(blockHash), chain.at(blockHash), chain.rpc.chain.getFinalizedHead()]);
  const finalized = await chain.rpc.chain.getHeader(finalizedHash);
  if (BigInt(block.header.number.toString()) > BigInt(finalized.number.toString()) || (await chain.rpc.chain.getBlockHash(block.header.number.toString())).toHex().toLowerCase() !== blockHash.toLowerCase()) throw new Error("The deposit block is not finalized on the canonical testnet chain yet.");
  const txIndex = block.extrinsics.findIndex((tx) => tx.hash.toHex() === pending.txHash);
  if (txIndex < 0) throw new Error("The saved transaction was not found in this block.");
  const events = await at.query.system.events() as unknown as ChainEvent[];
  const txEvents = events.filter(({ phase }) => phase.isApplyExtrinsic && phase.asApplyExtrinsic.toNumber() === txIndex);
  if (txEvents.some(({ event }) => event.section === "system" && event.method === "ExtrinsicFailed")) {
    localStorage.removeItem(PENDING_KEY);
    throw new Error("The finalized deposit transaction failed onchain. No deposit was credited; its network fee may have been charged. You can review a new deposit.");
  }
  if (!txEvents.some(({ event }) => event.section === "system" && event.method === "ExtrinsicSuccess")) throw new Error("The finalized transaction has no success event. Keep its reference for review.");
  const { decodeAddress } = await import("@polkadot/util-crypto");
  const { u8aEq } = await import("@polkadot/util");
  const eventIndex = events.findIndex(({ phase, event }) => phase.isApplyExtrinsic && phase.asApplyExtrinsic.toNumber() === txIndex && event.section === "balances" && event.method === "Transfer" && u8aEq(decodeAddress(event.data[0].toString()), decodeAddress(pending.address)) && u8aEq(decodeAddress(event.data[1].toString()), decodeAddress(pending.receiver)) && event.data[2].toString() === pending.amountRao);
  if (eventIndex < 0) throw new Error("The finalized transaction has no matching deposit transfer.");
  const receipt = { ...pending, blockHash, eventIndex };
  savePending(receipt);
  return receipt;
}

export async function sendDeposit(preview: DepositPreview, settings: PaymentSettings, onPending: (pending: PendingDeposit) => void): Promise<PendingDeposit> {
  requireTestnet(settings);
  if (loadPendingDeposit()) throw new Error("Verify your pending deposit before starting another transfer.");
  if (preview.receiver !== settings.receiver) throw new Error("The deposit recipient changed. Review the deposit again.");
  const chain = await connectChain();
  try {
    const latest = await previewOnChain(chain, preview.address, settings, preview.amountRao);
    if (BigInt(latest.feeRao) > BigInt(preview.feeRao)) throw new Error("The estimated network fee changed. Review the deposit again.");
    const selected = savedWallet();
    const { decodeAddress } = await import("@polkadot/util-crypto");
    const { u8aEq } = await import("@polkadot/util");
    if (!selected || !u8aEq(decodeAddress(selected.address), decodeAddress(preview.address))) throw new Error("Reconnect your wallet before signing this deposit.");
    const signer = await accountSigner(selected);
    const head = await chain.rpc.chain.getFinalizedHead();
    const header = await chain.rpc.chain.getHeader(head);
    const transfer = chain.tx.balances.transferKeepAlive(preview.receiver, preview.amountRao);
    if (loadPendingDeposit()) throw new Error("Another deposit is pending. Verify it before signing a new transfer.");
    await transfer.signAsync(preview.address, { signer, era: 64 });
    if (loadPendingDeposit()) throw new Error("Another deposit was started while this one was signing. This transfer was not broadcast.");
    const pending: PendingDeposit = { address: preview.address, receiver: preview.receiver, amountRao: preview.amountRao, txHash: transfer.hash.toHex(), startBlock: header.number.toNumber() };
    savePending(pending);
    onPending(pending);
    const blockHash = await new Promise<string>((resolve, reject) => {
      let unsubscribe: (() => void) | undefined;
      let settled = false;
      const finish = (error?: Error, hash?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe?.();
        if (error) reject(error); else resolve(hash!);
      };
      const timer = setTimeout(() => finish(new Error("Finality is taking longer than expected. Your transaction is saved. Use Check pending deposit; do not send it again.")), 90_000);
      transfer.send((result) => {
        if (result.status.isFinalized) finish(undefined, result.status.asFinalized.toHex());
        else if (result.status.isInvalid || result.status.isDropped || result.status.isUsurped) finish(new Error("The transfer was not confirmed. Check the saved transaction before making another deposit."));
      }).then((unsub) => { unsubscribe = unsub; if (settled) unsub(); }).catch((error: unknown) => finish(error instanceof Error ? error : new Error("Unable to confirm the transfer. Your pending transaction is saved.")));
    });
    return await findReceipt(chain, pending, blockHash);
  } finally { await chain.disconnect(); }
}

export async function recoverDeposit(pending: PendingDeposit, settings: PaymentSettings, address: string): Promise<PendingDeposit> {
  requireTestnet(settings);
  const { decodeAddress } = await import("@polkadot/util-crypto");
  const { u8aEq } = await import("@polkadot/util");
  if (!u8aEq(decodeAddress(address), decodeAddress(pending.address)) || !u8aEq(decodeAddress(settings.receiver), decodeAddress(pending.receiver))) throw new Error("Connect the wallet used for this pending deposit and keep its original recipient configured.");
  const chain = await connectChain();
  try {
    if (pending.blockHash) return await findReceipt(chain, pending, pending.blockHash);
    const finalizedHash = await chain.rpc.chain.getFinalizedHead();
    const latest = (await chain.rpc.chain.getHeader(finalizedHash)).number.toNumber();
    const end = Math.min(latest, pending.startBlock + 256);
    for (let number = pending.startBlock; number <= end; number++) {
      const blockHash = await chain.rpc.chain.getBlockHash(number);
      const { block } = await chain.rpc.chain.getBlock(blockHash);
      if (block.extrinsics.some((tx) => tx.hash.toHex() === pending.txHash)) return await findReceipt(chain, pending, blockHash.toHex());
    }
    throw new Error("The deposit was not found in finalized blocks yet. Try later, or use the finalized block hash and transfer event index below. Do not send the transfer again.");
  } finally { await chain.disconnect(); }
}

export async function claimDeposit(blockHash: string, eventIndex: number): Promise<{ wallet: WalletState; creditedRao: string }> {
  if (!/^0x[0-9a-f]{64}$/i.test(blockHash) || !Number.isSafeInteger(eventIndex) || eventIndex < 0 || eventIndex > 100_000) throw new Error("Enter a valid finalized block hash and zero-based transfer event index.");
  const result = await api<{ wallet: WalletState; creditedRao: string }>("/v1/wallet/deposits", { method: "POST", body: JSON.stringify({ blockHash: blockHash.toLowerCase(), eventIndex }) });
  const pending = loadPendingDeposit();
  if (pending?.blockHash?.toLowerCase() === blockHash.toLowerCase() && pending.eventIndex === eventIndex) localStorage.removeItem(PENDING_KEY);
  return result;
}
