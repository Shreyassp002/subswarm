"use client";

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Check, ChevronRight, CircleAlert, Compass, LoaderCircle, ScrollText, Wallet, X } from 'lucide-react';
import type { Job, JobInput, Provider, ProviderInputField, PaymentQuote, PaymentSettings, WalletState } from '@subswarm/shared';
import { districts, statusLabel } from '@/lib/providers';
import { api, safeUrl } from '@/lib/api';
import { formatTAO } from '@/lib/money';
import ResultEvidence from '@/components/ResultEvidence';
import ResultView from '@/components/ResultView';

type Fields = Partial<Record<ProviderInputField['key'], string | number>>;
interface Props {
  provider: Provider; job: Job | null; busy: boolean; submitting: boolean; connected: boolean; error: string | null;
  wallet: WalletState | null; payments: PaymentSettings | null;
  onSubmit: (input: JobInput, quoteId?: string) => Promise<void>;
  onClose: () => void; onOpenJournal: () => void; onOpenWallet: () => void;
}

export default function TaskPanel({ provider, job, busy, submitting, connected, error, wallet, payments, onSubmit, onClose, onOpenJournal, onOpenWallet }: Props) {
  const panel = useRef<HTMLElement>(null);
  const [values, setValues] = useState<Fields>(() => Object.fromEntries(provider.inputs.filter(field => field.defaultValue !== undefined).map(field => [field.key, field.defaultValue])));
  const [quote, setQuote] = useState<PaymentQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const display = districts[provider.id];
  const Icon = display.icon;
  const isScan = provider.taskKind === 'network-scan';
  const ready = provider.status === 'ready' && !!provider.taskKind;
  const working = job?.status === 'queued' || job?.status === 'running';
  const website = safeUrl(provider.website);
  const price = payments?.pricesRao[provider.id];
  const insufficient = !!quote && BigInt(wallet?.availableRao ?? '0') < BigInt(quote.amountRao);

  useEffect(() => { panel.current?.focus({ preventScroll: true }); }, []);

  function change(key: ProviderInputField['key'], value: string | number) {
    setValues(previous => ({ ...previous, [key]: value }));
    setQuote(null); setQuoteError(null);
  }

  function input(): JobInput {
    const fields = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '').map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
    return { ...fields, providerId: provider.id } as JobInput;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy || submitting || quoting || !connected) return;
    if (isScan) { await onSubmit(input()); return; }
    if (!wallet?.address) { onOpenWallet(); return; }
    setQuoteError(null);
    if (!quote || Date.parse(quote.expiresAt) <= Date.now()) {
      setQuoting(true);
      try { setQuote((await api<{ quote: PaymentQuote }>('/v1/quotes', { method: 'POST', body: JSON.stringify(input()) })).quote); }
      catch (failure) { setQuoteError(failure instanceof Error ? failure.message : 'Could not price this quest.'); }
      finally { setQuoting(false); }
      return;
    }
    if (!insufficient) { await onSubmit(input(), quote.id); setQuote(null); }
  }

  return <aside ref={panel} tabIndex={-1} className="task-panel parchment panel-enter" aria-labelledby="provider-title">
    <div className="task-topline"><span>HOUSE {display.number} / {provider.category}</span><button className="icon-button ink" onClick={onClose} aria-label="Close district details"><X size={17} /></button></div>
    <div className="provider-heading"><div className="provider-emblem" style={{ background: display.color }}><Icon size={24} strokeWidth={1.7} /></div><div><p className="eyebrow">{display.district}</p><h2 id="provider-title">{provider.name}</h2></div></div>
    <p className="provider-description">{provider.description}</p>
    <div className="provider-meta"><span className={`availability ${provider.status}`}><i />{statusLabel[provider.status]}</span>{provider.netuid !== null && <span>SN {provider.netuid}</span>}</div>
    <div className="panel-rule" />
    {provider.taskKind ? <form className="quest-form" onSubmit={submit}>
      <div className="section-caption"><ScrollText size={15} /><h3>{isScan ? 'Meet the residents' : 'Your quest'}</h3></div>
      <p className="field-hint">{provider.inputDescription}</p>
      {provider.exampleInput && !isScan && <button type="button" className="text-button" disabled={busy || quoting} onClick={() => {
        const { providerId: _provider, ...example } = provider.exampleInput!;
        void _provider; setValues(previous => ({ ...previous, ...example })); setQuote(null);
      }}>Try an example<ChevronRight size={12} /></button>}
      {provider.inputs.map(field => {
        const id = `quest-${field.key}`;
        const props = { id, name: field.key, required: field.required, disabled: busy || submitting || quoting, value: values[field.key] ?? '', 'aria-describedby': field.description ? `${id}-hint` : undefined };
        return <div className={`quest-field field-${field.type}`} key={field.key}><label htmlFor={id}>{field.label}{!field.required && <span> optional</span>}</label>
          {field.type === 'textarea' ? <textarea {...props} rows={3} maxLength={field.maxLength} placeholder={field.placeholder} onChange={event => change(field.key, event.target.value)} />
            : field.type === 'select' ? <select {...props} onChange={event => {
              const option = field.options?.find(item => String(item.value) === event.target.value);
              change(field.key, option?.value ?? event.target.value);
            }}>{field.options?.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
              : <input {...props} type={field.type === 'number' ? 'number' : 'url'} min={field.min} max={field.max} step={field.type === 'number' ? 1 : undefined} maxLength={field.maxLength} placeholder={field.placeholder} onChange={event => change(field.key, field.type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)} />}
          {field.description && <p id={`${id}-hint`} className="field-hint">{field.description}</p>}
        </div>;
      })}
      <div className="quest-delivery"><span>YOU RECEIVE</span><p>{provider.outputDescription}</p></div>
      {!ready && <p className="connection-note request-unavailable">{provider.reason || 'This provider is not connected yet.'} No payment will be taken.</p>}
      <div className="quest-price"><span>{isScan ? 'Registry quest' : 'Quest price'}</span><strong>{isScan ? 'Free' : quote ? `${formatTAO(quote.amountRao)} test TAO` : price ? `${formatTAO(price)} test TAO` : 'Not configured'}</strong></div>
      {!isScan && quote && <p className="field-hint">Fixed price for these inputs. Reserved when sent, charged only after the result is saved. Quote expires at {new Date(quote.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</p>}
      {insufficient && <button className="text-button" type="button" onClick={onOpenWallet}><Wallet size={14} />Add test TAO to continue</button>}
      <button className="primary-button" type="submit" disabled={!ready || busy || submitting || quoting || !connected || insufficient || (!isScan && !payments?.enabled)}>
        {submitting || working || quoting ? <><LoaderCircle size={16} className="spin" />{quoting ? 'Getting your quote' : job?.status === 'queued' ? 'Quest queued' : 'Working on your quest'}</>
          : <><Compass size={16} />{!ready ? 'Provider not connected' : isScan ? 'Explore the network' : !wallet?.address ? 'Connect wallet' : quote ? `Confirm ${formatTAO(quote.amountRao)} test TAO` : 'Review quest price'}<ChevronRight size={16} /></>}
      </button>
      {!isScan && !payments?.enabled && ready && <p className="field-hint">Testnet payments are not configured yet. No funds can be sent.</p>}
      {!connected && <p className="field-hint">Reconnect to the village before sending a quest.</p>}
      {busy && !working && <p className="field-hint">Another quest is underway. You can keep exploring while it finishes.</p>}
    </form> : <div className="connection-note"><div className="section-caption"><Compass size={17} /><h3>Explore this service</h3></div><div className="quest-delivery"><span>INPUT</span><p>{provider.inputDescription}</p><span>OUTPUT</span><p>{provider.outputDescription}</p></div><p>{provider.reason}</p>{website && <a className="secondary-button" href={website} target="_blank" rel="noopener noreferrer">Visit {provider.name}<ArrowUpRight size={15} /></a>}</div>}
    {(error || quoteError) && <div className="error-note" role="alert"><CircleAlert size={16} /><span>{error || quoteError}</span></div>}
    {job && <div className={`job-result ${job.status}`} aria-live="polite">
      {working && <><div className="section-caption"><LoaderCircle className="spin" size={15} /><h3>{job.status === 'queued' ? 'Quest queued' : 'Quest in progress'}</h3></div><p>Your couriers are waiting at {provider.name}. They represent the request, not a claim about which miner is responding.</p><div className="working-track"><span /></div></>}
      {job.status === 'failed' && <><div className="section-caption"><CircleAlert size={16} /><h3>The quest hit a snag</h3></div><p>{job.error || 'The provider could not complete this request.'}</p></>}
      {job.status === 'completed' && job.result && <><div className="section-caption"><Check size={17} /><h3>Quest complete</h3></div><h4>{job.result.title}</h4><ResultView result={job.result} compact /><ResultEvidence result={job.result} /><button className="text-button" onClick={onOpenJournal}>Read in your journal<ChevronRight size={14} /></button></>}
    </div>}
    <div className="panel-footnote"><span className="tiny-diamond" />{isScan ? 'Read-only testnet exploration' : 'Provider results are saved in your journal'}</div>
  </aside>;
}
