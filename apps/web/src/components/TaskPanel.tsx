"use client";

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Check, ChevronRight, CircleAlert, Compass, LoaderCircle, ScrollText, Users, PackageOpen, SlidersHorizontal, Wallet, X } from 'lucide-react';
import type { Job, JobInput, Provider, ProviderInputField, PaymentQuote, PaymentSettings, WalletState } from '@subswarm/shared';
import { districts, questRewards } from '@/lib/providers';
import { api, safeUrl } from '@/lib/api';
import { formatTAO } from '@/lib/money';
import ResultEvidence from '@/components/ResultEvidence';
import ResultView from '@/components/ResultView';
import Residents from '@/components/Residents';
import type { ResidentState } from '@/hooks/useResidents';
import { BUILDINGS, WORLD_SCALE } from '@/game/village';

type Fields = Partial<Record<ProviderInputField['key'], string | number>>;
interface Props {
  residentState?: ResidentState; selectedUid: number | null; onRefreshResidents: () => void;
  provider: Provider; job: Job | null; busy: boolean; submitting: boolean; connected: boolean; error: string | null;
  wallet: WalletState | null; payments: PaymentSettings | null;
  onSubmit: (input: JobInput, quoteId?: string) => Promise<void>;
  onClose: () => void; onOpenJournal: () => void; onOpenWallet: () => void;
}

export default function TaskPanel({ residentState, selectedUid, onRefreshResidents, provider, job, busy, submitting, connected, error, wallet, payments, onSubmit, onClose, onOpenJournal, onOpenWallet }: Props) {
  const panel = useRef<HTMLElement>(null);
  const [values, setValues] = useState<Fields>(() => Object.fromEntries(provider.inputs.filter(field => field.defaultValue !== undefined).map(field => [field.key, field.defaultValue])));
  const [quote, setQuote] = useState<PaymentQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [tab, setTab] = useState<'quest' | 'residents'>(selectedUid === null ? 'quest' : 'residents');
  const display = districts[provider.id];
  const house = BUILDINGS.find(building => building.id === provider.id)!;
  const centerX = (house.bounds.x + house.bounds.width / 2) / WORLD_SCALE;
  const centerY = (house.bounds.y + house.bounds.height / 2) / WORLD_SCALE;
  const Icon = display.icon;
  const isScan = provider.taskKind === 'network-scan';
  const ready = provider.status === 'ready' && !!provider.taskKind;
  const working = job?.status === 'queued' || job?.status === 'running';
  const website = safeUrl(provider.website);
  const price = payments?.pricesRao[provider.id];
  const isPrimaryField = (field: ProviderInputField) => isScan || field.required || field.type === 'textarea' || field.type === 'url';
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
    if (!ready || busy || submitting || quoting || readingFile || !connected) return;
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

  async function chooseFile(file?: File) {
    setQuote(null); setQuoteError(null);
    setValues(previous => ({ ...previous, fileName: '', fileBase64: '' }));
    if (!file) return;
    if (!file.size || file.size > 256 * 1024 || !/^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,119}$/.test(file.name)) {
      setQuoteError('Choose a non-empty file up to 256 KiB. Use a filename with letters, numbers, spaces, dots, underscores or hyphens.');
      return;
    }
    setReadingFile(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      setValues(previous => ({ ...previous, fileName: file.name, fileBase64: btoa(binary) }));
    } catch { setQuoteError('The file could not be read. Please choose it again.'); }
    finally { setReadingFile(false); }
  }

  function renderField(field: ProviderInputField) {
    const id = `quest-${field.key}`;
    const props = { id, name: field.key, required: field.required, disabled: busy || submitting || quoting || readingFile, value: values[field.key] ?? '', 'aria-describedby': field.description ? `${id}-hint` : undefined };
    return <div className={`quest-field field-${field.type}`} key={field.key}><label htmlFor={id}>{field.label}{!field.required && <span> optional</span>}</label>
      {field.type === 'file' ? <div className="file-picker"><input id={id} name={field.key} type="file" required={field.required} disabled={busy || submitting || quoting || readingFile} aria-describedby={`${id}-hint`} onChange={event => void chooseFile(event.target.files?.[0])} /><small>{readingFile ? 'Reading your file...' : values.fileName ? `${values.fileName} is ready to store privately.` : 'Choose a file from your device'}</small></div>
        : field.type === 'textarea' ? <textarea {...props} rows={3} maxLength={field.maxLength} placeholder={field.placeholder} onChange={event => change(field.key, event.target.value)} />
        : field.type === 'select' ? <select {...props} onChange={event => {
          const option = field.options?.find(item => String(item.value) === event.target.value);
          change(field.key, option?.value ?? event.target.value);
        }}>{field.options?.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
          : <input {...props} type={field.type === 'number' ? 'number' : field.type === 'text' ? 'text' : 'url'} min={field.min} max={field.max} step={field.type === 'number' ? 1 : undefined} maxLength={field.maxLength} placeholder={field.placeholder} onChange={event => change(field.key, field.type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)} />}
      {field.description && <p id={`${id}-hint`} className="field-hint">{field.description}</p>}
    </div>;
  }

  return <aside ref={panel} tabIndex={-1} className="task-panel house-panel parchment panel-enter" aria-labelledby="provider-title">
    <div className="house-header"><div className="house-scene" style={{ backgroundPosition: `calc(50% + ${756 - centerX * .9}px) calc(50% + ${424.8 - centerY * .9}px)` }}>
      <span className="house-scene-label">HOUSE {display.number} / {provider.category}</span>
      <button className="scene-close icon-button" onClick={onClose} aria-label="Close district details"><X size={18} /></button>
      <span className="house-scene-number">{display.number}</span>
    </div>
    <div className="house-identity"><div className="provider-emblem" style={{ background: display.color }}><Icon size={25} strokeWidth={1.7} /></div><div><p className="eyebrow">{display.district}</p><h2 id="provider-title">{provider.name}</h2></div><span className="house-netuid">{provider.netuid === null ? 'TAO' : `SN ${provider.netuid}`}</span></div>
    <p className="provider-description">{provider.description}</p>
    </div>
    {!isScan && <div className="house-tabs" role="tablist" aria-label="House sections">
      <button id="quest-tab" role="tab" aria-selected={tab === 'quest'} aria-controls="quest-view" onClick={() => setTab('quest')}><ScrollText size={16} />Quest</button>
      <button id="residents-tab" role="tab" aria-selected={tab === 'residents'} aria-controls="residents-view" onClick={() => setTab('residents')}><Users size={16} />Residents{residentState?.snapshot && <small>{residentState.snapshot.totalParticipants}</small>}</button>
    </div>}
    <div className="house-body">
    {!isScan && tab === 'residents' && <section id="residents-view" role="tabpanel" aria-labelledby="residents-tab"><Residents key={`${provider.id}:${selectedUid}`} provider={provider} state={residentState} selectedUid={selectedUid} onRefresh={onRefreshResidents} /></section>}
    <section id="quest-view" role={!isScan ? 'tabpanel' : undefined} aria-labelledby={!isScan ? 'quest-tab' : undefined} hidden={!isScan && tab !== 'quest'}>
    {provider.taskKind ? <form id="house-quest" className="quest-form" onSubmit={submit}>
      <div className="section-caption"><h3>{isScan ? 'Explore the registry' : provider.taskKind === 'storage' ? 'What shall we keep?' : provider.category === 'Search' || provider.id === 'chronoseek' ? 'What shall we find?' : 'What shall we make?'}</h3></div>
      {provider.exampleInput && !isScan && <button type="button" className="text-button" disabled={busy || quoting} onClick={() => {
        const { providerId: _provider, ...example } = provider.exampleInput!;
        void _provider; setValues(previous => ({ ...previous, ...example })); setQuote(null);
      }}>Try an example<ChevronRight size={12} /></button>}
      {provider.inputs.filter(isPrimaryField).map(renderField)}
      {!isScan && provider.inputs.some(field => !isPrimaryField(field)) && <details className="quest-options"><summary><SlidersHorizontal size={14} />Quest settings</summary>{provider.inputs.filter(field => !isPrimaryField(field)).map(renderField)}</details>}
      <div className="quest-reward"><PackageOpen size={22} /><div><span>YOUR REWARD</span><p>{questRewards[provider.id]}</p></div></div>
      {!isScan && !payments?.enabled && ready && <p className="field-hint">Testnet payments are not configured yet. No funds can be sent.</p>}
      {!connected && <p className="field-hint">Reconnect to the village before sending a quest.</p>}
      {busy && !working && <p className="field-hint">Another quest is underway. You can keep exploring while it finishes.</p>}
    </form> : <div className="connection-note"><div className="section-caption"><Compass size={17} /><h3>Explore this service</h3></div><div className="quest-delivery"><span>INPUT</span><p>{provider.inputDescription}</p><span>OUTPUT</span><p>{provider.outputDescription}</p></div><p>{provider.reason}</p>{website && <a className="secondary-button" href={website} target="_blank" rel="noopener noreferrer">Visit {provider.name}<ArrowUpRight size={15} /></a>}</div>}
    {(error || quoteError) && <div className="error-note" role="alert"><CircleAlert size={16} /><span>{error || quoteError}</span></div>}
    {job && <div className={`job-result ${job.status}`} aria-live="polite">
      {working && <><div className="section-caption"><LoaderCircle className="spin" size={15} /><h3>{job.status === 'queued' ? 'Quest queued' : 'Quest in progress'}</h3></div><p>Your quest is with {provider.name}. The couriers will bring back the result.</p><details className="quiet-details"><summary>About the couriers</summary><p>Couriers represent the request, not the miners responding to it.</p></details><div className="working-track"><span /></div></>}
      {job.status === 'failed' && <><div className="section-caption"><CircleAlert size={16} /><h3>The quest hit a snag</h3></div><p>{job.error || 'The provider could not complete this request.'}</p></>}
      {job.status === 'completed' && job.result && <><div className="section-caption"><Check size={17} /><h3>Quest complete</h3></div><h4>{job.result.title}</h4><ResultView result={job.result} compact /><ResultEvidence result={job.result} /><button className="text-button" onClick={onOpenJournal}>Read in your journal<ChevronRight size={14} /></button></>}
    </div>}
    </section>
    </div>
    {tab === 'quest' && provider.taskKind && <div className="quest-checkout">      {!ready && <details className="house-access"><summary>Quests opening soon <span>Details</span></summary><p>{provider.reason || 'This house is not connected yet.'} No payment will be taken.</p></details>}
      <div className="quest-price"><span>{isScan ? 'Registry quest' : 'Quest price'}</span><strong>{isScan ? 'Free' : quote ? `${formatTAO(quote.amountRao)} test TAO` : price ? `${formatTAO(price)} test TAO` : 'Coming soon'}</strong></div>
      {!isScan && quote && <p className="field-hint">Fixed price for these inputs. Reserved when sent, charged only after the result is saved. Quote expires at {new Date(quote.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</p>}
      {insufficient && <button className="text-button" type="button" onClick={onOpenWallet}><Wallet size={14} />Add test TAO to continue</button>}
      <button className="primary-button" form="house-quest" type="submit" disabled={!ready || busy || submitting || quoting || readingFile || (provider.taskKind === 'storage' && !values.fileBase64) || !connected || insufficient || (!isScan && !payments?.enabled)}>
        {submitting || working || quoting ? <><LoaderCircle size={16} className="spin" />{quoting ? 'Getting your quote' : job?.status === 'queued' ? 'Quest queued' : 'Working on your quest'}</>
          : <><Compass size={16} />{!ready ? 'Quests opening soon' : isScan ? 'Explore the network' : !wallet?.address ? 'Connect wallet' : quote ? `Confirm ${formatTAO(quote.amountRao)} test TAO` : 'Review quest price'}<ChevronRight size={16} /></>}
      </button>
    </div>}

  </aside>;
}
