"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, CircleAlert, ExternalLink, LoaderCircle, Wallet, X } from "lucide-react";
import type { PaymentLedgerEntry, PaymentSettings, WalletState } from "@subswarm/shared";
import { api } from "@/lib/api";
import { formatTAO, parseTAO } from "@/lib/money";
import { claimDeposit, connectWallet, listWalletAccounts, loadPendingDeposit, prepareDeposit, recoverDeposit, sendDeposit, type DepositPreview, type PendingDeposit, type WalletAccount } from "@/lib/wallet";

interface Props {
  onClose: () => void;
  onChanged: () => void;
}

export default function WalletPanel({ onClose, onChanged }: Props) {
  const panel = useRef<HTMLElement>(null);
  const operation = useRef(false);
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [payments, setPayments] = useState<PaymentSettings | null>(null);
  const [entries, setEntries] = useState<PaymentLedgerEntry[]>([]);
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<DepositPreview | null>(null);
  const [pending, setPending] = useState<PendingDeposit | null>(null);
  const [invalidPending, setInvalidPending] = useState(false);
  const [blockHash, setBlockHash] = useState("");
  const [eventIndex, setEventIndex] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    let cancelled = false;
    Promise.all([
      api<{ wallet: WalletState; payments: PaymentSettings }>("/v1/wallet"),
      api<{ entries: PaymentLedgerEntry[] }>("/v1/wallet/ledger"),
    ]).then(([state, ledger]) => {
      if (cancelled) return;
      setWallet(state.wallet);
      setPayments(state.payments);
      setEntries(ledger.entries);
      try { setPending(loadPendingDeposit()); }
      catch (error) { setInvalidPending(true); setError(error instanceof Error ? error.message : "Unable to read the saved deposit."); }
    }).catch((error: unknown) => { if (!cancelled) setError(error instanceof Error ? error.message : "Unable to load your wallet."); });
    return () => { cancelled = true; };
  }, []);

  async function refresh() {
    const [state, ledger] = await Promise.all([
      api<{ wallet: WalletState; payments: PaymentSettings }>("/v1/wallet"),
      api<{ entries: PaymentLedgerEntry[] }>("/v1/wallet/ledger"),
    ]);
    setWallet(state.wallet);
    setPayments(state.payments);
    setEntries(ledger.entries);
    setPending(loadPendingDeposit());
    onChanged();
  }

  async function run(label: string, action: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(label);
    setError(null);
    setNotice(null);
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : "The wallet request failed."); }
    finally {
      try { setPending(loadPendingDeposit()); }
      catch { setInvalidPending(true); }
      operation.current = false;
      setBusy("");
    }
  }

  function chooseWallet() {
    void run("Opening wallet", async () => {
      const choices = await listWalletAccounts();
      setAccounts(choices);
      setAddress(choices[0].address);
    });
  }

  function verifyWallet() {
    void run("Confirm the connection message in your wallet", async () => {
      setWallet(await connectWallet(address));
      setAccounts([]);
      setPreview(null);
      await refresh();
      setNotice("Wallet connected. The signed message does not transfer funds.");
    });
  }

  function reviewDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet?.address || !payments) return;
    void run("Checking testnet balance and fee", async () => {
      setPreview(null);
      if (parseTAO(amount) > BigInt(payments.maxDepositRao) - BigInt(wallet.availableRao) - BigInt(wallet.reservedRao)) throw new Error("This deposit would exceed your village balance limit.");
      setPreview(await prepareDeposit(wallet.address!, payments, amount));
    });
  }

  async function creditReceipt(receipt: PendingDeposit) {
    if (receipt.blockHash === undefined || receipt.eventIndex === undefined) throw new Error("The deposit receipt is not finalized yet.");
    setPending(receipt);
    setBlockHash(receipt.blockHash);
    setEventIndex(String(receipt.eventIndex));
    const result = await claimDeposit(receipt.blockHash, receipt.eventIndex);
    setWallet(result.wallet);
    setPreview(null);
    setAmount("");
    await refresh();
    setNotice(`Deposit verified: ${formatTAO(result.creditedRao)} test TAO. Your balance is ready for quests.`);
  }

  function confirmDeposit() {
    if (!preview || !payments) return;
    void run("Confirm in your wallet, then wait for testnet finality", async () => {
      const receipt = await sendDeposit(preview, payments, setPending);
      await creditReceipt(receipt);
    });
  }

  function checkPending() {
    if (!pending || !payments || !wallet?.address) return;
    void run("Looking for your finalized deposit", async () => {
      await creditReceipt(await recoverDeposit(pending, payments, wallet.address!));
    });
  }

  function verifyReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run("Verifying the finalized transfer", async () => {
      if (!/^\d+$/.test(eventIndex)) throw new Error("Enter the zero-based transfer event index shown in the finalized block.");
      if (pending && payments && wallet?.address) {
        const receipt = await recoverDeposit({ ...pending, blockHash: blockHash.trim() }, payments, wallet.address);
        if (receipt.eventIndex !== Number(eventIndex)) throw new Error("This event index does not match your pending transfer.");
        await creditReceipt(receipt);
        return;
      }
      const result = await claimDeposit(blockHash.trim(), Number(eventIndex));
      setWallet(result.wallet);
      await refresh();
      setNotice(`Receipt verified: ${formatTAO(result.creditedRao)} test TAO credited.`);
    });
  }

  return (
    <aside ref={panel} tabIndex={-1} className="task-panel wallet-panel parchment panel-enter" aria-labelledby="wallet-title" aria-busy={!!busy}>
      <div className="task-topline"><span>VILLAGE WALLET</span><button className="icon-button ink" onClick={onClose} disabled={!!busy} aria-label="Close wallet"><X size={17} /></button></div>
      <div className="provider-heading"><div className="provider-emblem"><Wallet size={24} /></div><div><p className="eyebrow">BITTENSOR TESTNET</p><h2 id="wallet-title">Your quest purse</h2></div></div>
      <p className="provider-description">Prepay for village quests with test TAO. Your balance pays for requests here; provider credits are handled by the village operator.</p>
      <p className="field-hint">Test tokens only. Unused prepaid funds stay in your village balance; on-chain withdrawals are not available.</p>
      {wallet && <div className="balance-grid"><div><span>Available</span><strong>{formatTAO(wallet.availableRao)} <small>test TAO</small></strong></div><div><span>Reserved for quests</span><strong>{formatTAO(wallet.reservedRao)} <small>test TAO</small></strong></div></div>}
      {payments && !payments.enabled && <div className="connection-note"><h3>Deposits are not open yet</h3><p>{payments.reason || "The village operator has not configured a testnet deposit account."}</p></div>}
      {!wallet && !error && <p className="field-hint">Loading your wallet...</p>}
      {wallet?.address ? <div className="wallet-connection"><p className="eyebrow">CONNECTED ACCOUNT</p><code className="wallet-address">{wallet.address}</code><button className="text-button" disabled={!!busy} onClick={() => void run("Disconnecting wallet", async () => { await api("/v1/wallet/disconnect", { method: "POST", body: "{}" }); setPreview(null); await refresh(); })}>Disconnect wallet</button></div> : wallet && <div className="quest-form">
        <p className="field-hint">Connect a Substrate wallet and sign a message to prove it belongs to you. Your keys stay in the extension.</p>
        {accounts.length ? <><label htmlFor="wallet-account">Choose an account</label><select id="wallet-account" value={address} onChange={(event) => setAddress(event.target.value)} disabled={!!busy}>{accounts.map((account) => <option key={account.address} value={account.address}>{account.name} - {account.address.slice(0, 8)}...{account.address.slice(-6)}</option>)}</select><button className="primary-button" disabled={!!busy || !address} onClick={verifyWallet}>Sign connection message</button></> : <button className="primary-button" disabled={!!busy} onClick={chooseWallet}><Wallet size={16} />Connect wallet</button>}
        <p className="field-hint">Need an extension? <a href="https://polkadot.js.org/extension/" target="_blank" rel="noopener noreferrer">Polkadot wallet <ExternalLink size={12} /></a>. Share a testnet or all-network account.</p>
      </div>}
      {pending && <div className="connection-note"><h3>Deposit awaiting verification</h3><p>{formatTAO(pending.amountRao)} test TAO. Check this transaction before sending another deposit.</p><code className="wallet-address">{pending.txHash}</code><button className="secondary-button" disabled={!!busy || !wallet?.address || !payments?.enabled} onClick={checkPending}>Check pending deposit</button><p className="field-hint">If you return later, this browser keeps the transaction reference. Connect the same wallet to recover it.</p></div>}
      {wallet?.address && payments?.enabled && !pending && !invalidPending && <form className="quest-form" onSubmit={reviewDeposit}>
        <div className="panel-rule" /><h3>Add test TAO</h3><label htmlFor="deposit-amount">Amount in test TAO</label><input id="deposit-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => { setAmount(event.target.value); setPreview(null); }} placeholder="0.1" disabled={!!busy} required maxLength={30} />
        <p className="field-hint">Maximum {formatTAO(payments.maxDepositRao)} test TAO per deposit. The network fee is paid separately.</p>
        <button className="secondary-button" type="submit" disabled={!!busy || !amount.trim()}>Review deposit</button>
        {preview && <div className="deposit-review"><h3>Review testnet transfer</h3><dl><dt>Amount</dt><dd>{formatTAO(preview.amountRao)} test TAO</dd><dt>Estimated network fee</dt><dd>{formatTAO(preview.feeRao)} test TAO</dd><dt>Wallet free balance</dt><dd>{formatTAO(preview.freeRao)} test TAO</dd><dt>Minimum balance to retain</dt><dd>{formatTAO(preview.keepAliveRao)} test TAO</dd><dt>Recipient</dt><dd><code className="wallet-address">{preview.receiver}</code></dd></dl><p className="field-hint">Bittensor testnet only. Confirming opens your wallet to sign and send this transfer. Credit arrives after finality and server verification.</p><button className="primary-button" type="button" onClick={confirmDeposit} disabled={!!busy}>Confirm testnet deposit</button></div>}
      </form>}
      {wallet?.address && payments?.enabled && <details className="receipt-recovery"><summary>Verify an existing deposit receipt</summary><p className="field-hint">Already sent test TAO from this wallet to the village recipient? Enter its finalized block hash and the zero-based balances.Transfer event index. This only verifies a receipt and never sends another transfer.</p><code className="wallet-address">{payments.receiver}</code><form className="quest-form" onSubmit={verifyReceipt}><label htmlFor="receipt-block">Finalized block hash</label><input id="receipt-block" value={blockHash} onChange={(event) => setBlockHash(event.target.value)} placeholder="0x..." required disabled={!!busy} /><label htmlFor="receipt-event">Transfer event index</label><input id="receipt-event" inputMode="numeric" value={eventIndex} onChange={(event) => setEventIndex(event.target.value)} placeholder="0" required disabled={!!busy} /><button className="secondary-button" disabled={!!busy} type="submit">Verify receipt</button></form></details>}
      {busy && <p className="wallet-status" role="status"><LoaderCircle size={16} className="spin" />{busy}</p>}
      {error && <div className="error-note" role="alert"><CircleAlert size={16} /><span>{error}</span></div>}
      {notice && <div className="wallet-status" role="status"><Check size={16} /><span>{notice}</span></div>}
      {wallet && <section className="wallet-ledger" aria-labelledby="ledger-title"><div className="panel-rule" /><h3 id="ledger-title">Recent activity</h3>{entries.length ? <ul className="ledger-list">{entries.map((entry) => <li key={entry.id}><div><strong>{entry.kind === "deposit" ? "Testnet deposit" : `${entry.providerId || "Provider"} quest`}</strong><span>{entry.status} - {new Date(entry.createdAt).toLocaleString()}</span></div><span>{formatTAO(entry.amountRao)} test TAO</span></li>)}</ul> : <p className="field-hint">Deposits and paid quests will appear here.</p>}</section>}
      <div className="panel-footnote"><span className="tiny-diamond" />Test tokens. Real provider requests.</div>
    </aside>
  );
}
