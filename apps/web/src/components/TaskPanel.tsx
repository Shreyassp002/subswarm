"use client";

import { useState, type FormEvent } from "react";
import { ArrowUpRight, Check, ChevronRight, CircleAlert, Compass, ExternalLink, KeyRound, LoaderCircle, ScrollText, X } from "lucide-react";
import type { Job, JobInput, Provider } from "@subswarm/shared";
import { districts, statusLabel } from "@/lib/providers";
import { safeUrl } from "@/lib/api";

interface Props {
  provider: Provider;
  job: Job | null;
  busy: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: JobInput) => Promise<void>;
  onClose: () => void;
  onOpenJournal: () => void;
}

export default function TaskPanel({ provider, job, busy, submitting, error, onSubmit, onClose, onOpenJournal }: Props) {
  const [prompt, setPrompt] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [netuid, setNetuid] = useState(298);
  const display = districts[provider.id];
  const Icon = display.icon;
  const isScan = provider.taskKind === "network-scan";
  const ready = provider.status === "ready" && !!provider.taskKind;
  const working = job?.status === "queued" || job?.status === "running";
  const website = safeUrl(provider.website);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy || submitting) return;
    await onSubmit({ providerId: provider.id, ...(isScan ? { netuid } : { prompt: prompt.trim(), ...(provider.taskKind === "video-search" ? { videoUrl: videoUrl.trim() } : {}) }) });
  }

  return (
    <aside className="task-panel parchment panel-enter" aria-labelledby="provider-title">
      <div className="task-topline"><span>DISTRICT {display.number}</span><button className="icon-button ink" onClick={onClose} aria-label="Close district details"><X size={17} /></button></div>
      <div className="provider-heading"><div className="provider-emblem" style={{ background: display.color }}><Icon size={24} strokeWidth={1.7} /></div><div><p className="eyebrow">{display.district}</p><h2 id="provider-title">{provider.name}</h2></div></div>
      <p className="provider-description">{provider.description}</p>
      <div className="provider-meta"><span className={`availability ${provider.status}`}><i />{statusLabel[provider.status]}</span>{provider.netuid !== null && <span>SN {provider.netuid}</span>}</div>
      <div className="panel-rule" />
      {ready ? (
        <form className="quest-form" onSubmit={submit}>
          <div className="section-caption"><ScrollText size={15} /><h3>{isScan ? "Meet the residents" : "Give them a quest"}</h3></div>
          {isScan ? <><p className="field-hint">Explore the live participant registry. No wallet or API key needed.</p><label htmlFor="subnet">Choose a testnet subnet</label><select id="subnet" value={netuid} onChange={(event) => setNetuid(Number(event.target.value))} disabled={busy}><option value={298}>Testnet 298</option><option value={482}>Testnet 482</option></select></> : <>
            <label htmlFor="quest-prompt">{provider.taskKind === "search" ? "What are you looking for?" : provider.taskKind === "video-search" ? "What should we find in the video?" : "What would you like to create?"}</label>
            <textarea id="quest-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={provider.taskKind === "search" ? "Find the latest research on..." : provider.taskKind === "video-search" ? "Find the moment when..." : "A little idea goes a long way..."} rows={4} required minLength={1} maxLength={4000} disabled={busy} />
            {provider.taskKind === "video-search" && <><label htmlFor="video-url">Video URL</label><input id="video-url" type="url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="https://..." required disabled={busy} /></>}
            <p className="field-hint">Sent to {provider.name}. Results are saved in your journal.</p>
          </>}
          <button className="primary-button" type="submit" disabled={busy || submitting || (!isScan && !prompt.trim())}>{submitting || working ? <><LoaderCircle size={16} className="spin" />{job?.status === "queued" ? "Quest queued" : "Working on your quest"}</> : <><Compass size={16} />{isScan ? "Explore the network" : "Send quest"}<ChevronRight size={16} /></>}</button>
          {busy && !working && <p className="field-hint">Another quest is underway. It will finish before you can send the next.</p>}
        </form>
      ) : (
        <div className="connection-note"><div className="section-caption">{provider.status === "needs_key" ? <KeyRound size={17} /> : <Compass size={17} />}<h3>{provider.status === "needs_key" ? "One connection away" : provider.status === "external" ? "Continue the adventure" : "Taking a little rest"}</h3></div><p>{provider.reason || (provider.status === "needs_key" ? "Add this provider's API key to the API service environment, restart the service, then reconnect the village. Keys stay on the server." : provider.status === "external" ? "This district is an external provider. Visit their site to explore what they offer." : "This provider is not available for quests right now.")}</p>{provider.status === "needs_key" && <p className="field-hint">You can explore Town Hall without a key.</p>}{website && <a className="secondary-button" href={website} target="_blank" rel="noopener noreferrer">Visit {provider.name}<ArrowUpRight size={15} /></a>}</div>
      )}
      {error && <div className="error-note" role="alert"><CircleAlert size={16} /><span>{error}</span></div>}
      {job && <div className={`job-result ${job.status}`} aria-live="polite">
        {working && <><div className="section-caption"><LoaderCircle className="spin" size={15} /><h3>{job.status === "queued" ? "Your quest is in the queue" : "A little intelligence at work"}</h3></div><p>The request is with {provider.name}. You can keep exploring while we wait.</p><div className="working-track"><span /></div></>}
        {job.status === "failed" && <><div className="section-caption"><CircleAlert size={16} /><h3>The quest hit a snag</h3></div><p>{job.error || "The provider could not complete this request. You can try again."}</p></>}
        {job.status === "completed" && job.result && <><div className="section-caption"><Check size={17} /><h3>Quest complete</h3></div><h4>{job.result.title}</h4><p className="result-preview">{job.result.text}</p>{job.result.snapshot && <div className="snapshot-stat"><strong>{job.result.snapshot.totalParticipants}</strong><span>registered residents<br />Testnet {job.result.snapshot.netuid} / block {job.result.snapshot.block.toLocaleString()}</span></div>}{job.result.links?.slice(0, 3).map((link, index) => { const url = safeUrl(link.url); return url ? <a className="result-link" key={`${url}-${index}`} href={url} target="_blank" rel="noopener noreferrer">{link.title}<ExternalLink size={12} /></a> : null; })}<button className="text-button" onClick={onOpenJournal}>Read in your journal<ChevronRight size={14} /></button></>}
      </div>}
      <div className="panel-footnote"><span className="tiny-diamond" />Real providers. Real possibilities.</div>
    </aside>
  );
}
