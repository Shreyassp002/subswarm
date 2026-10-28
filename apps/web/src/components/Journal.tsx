"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, ChevronRight, Copy, FileText, ScrollText, X } from "lucide-react";
import type { Artifact, Job, Provider } from "@subswarm/shared";
import { districts } from "@/lib/providers";

interface Props {
  artifacts: Artifact[];
  jobs: Job[];
  providers: Provider[];
  onClose: () => void;
}

export default function Journal({ artifacts, jobs, providers, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selectedId, setSelectedId] = useState(artifacts[0]?.id || "");
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"outputs" | "quests">("outputs");
  const selected = artifacts.find((artifact) => artifact.id === selectedId) || artifacts[0];

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.content);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <dialog ref={dialog} className="journal-dialog parchment" aria-labelledby="journal-title" onCancel={onClose} onClose={(event) => { if (!event.currentTarget.open) onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="journal-header"><div className="journal-title"><BookOpen size={24} strokeWidth={1.5} /><div><p className="eyebrow">THINGS YOU HAVE DISCOVERED</p><h2 id="journal-title">Your field journal</h2></div></div><button className="icon-button ink" onClick={onClose} aria-label="Close journal"><X size={20} /></button></div>
      <div className="journal-tabs"><button className={tab === "outputs" ? "active" : ""} onClick={() => setTab("outputs")}>Collected outputs <span>{artifacts.length}</span></button><button className={tab === "quests" ? "active" : ""} onClick={() => setTab("quests")}>Quest history <span>{jobs.length}</span></button></div>
      {tab === "outputs" ? artifacts.length ? <div className="journal-content"><div className="artifact-list" aria-label="Saved outputs">{artifacts.map((artifact) => { const Icon = districts[artifact.providerId].icon; return <button className={`artifact-item ${selected?.id === artifact.id ? "selected" : ""}`} key={artifact.id} onClick={() => { setSelectedId(artifact.id); setCopied(false); }}><Icon size={18} /><span><strong>{artifact.title}</strong><small>{providers.find((provider) => provider.id === artifact.providerId)?.name || artifact.providerId} / {new Date(artifact.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></span><ChevronRight size={13} /></button>; })}</div>{selected && <article className="artifact-detail"><div className="artifact-detail-heading"><span className="eyebrow">{selected.type.replaceAll("-", " ")}</span><button className="icon-button ink" aria-label={copied ? "Output copied" : "Copy output"} title={copied ? "Copied" : "Copy output"} onClick={copy}>{copied ? <Check size={17} /> : <Copy size={17} />}</button></div><h3>{selected.title}</h3><div className="artifact-body">{selected.content}</div></article>}</div> : <div className="journal-empty"><div className="empty-emblem"><FileText size={32} strokeWidth={1.3} /></div><h3>Every adventure leaves a little something.</h3><p>Complete a quest to collect your first output.<br />It will be kept here for your next visit.</p><button className="primary-button" onClick={onClose}>Back to the village<ChevronRight size={15} /></button></div> : <div className="quest-history">{jobs.length ? jobs.map((job) => <div className="history-item" key={job.id}><ScrollText size={19} /><div><strong>{job.result?.title || providers.find((provider) => provider.id === job.providerId)?.name || job.providerId}</strong><p>{job.error || job.input.prompt || `Explore testnet ${job.input.netuid || 298}`}</p><small>{new Date(job.createdAt).toLocaleString()}</small></div><span className={`history-status ${job.status}`}>{job.status}</span></div>) : <div className="journal-empty"><ScrollText size={30} /><h3>A fresh page, a new adventure.</h3><p>Your quests will appear here once you get started.</p></div>}</div>}
      <div className="journal-footer"><span className="tiny-diamond" />Saved to your browser session by the village API.</div>
    </dialog>
  );
}
