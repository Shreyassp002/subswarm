"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, ChevronRight, Copy, ExternalLink, FileText, ScrollText, X } from "lucide-react";
import type { Artifact, Job, Provider, ProviderId } from "@subswarm/shared";
import { districts } from "@/lib/providers";
import { safeUrl } from "@/lib/api";
import ResultView from "@/components/ResultView";
import ResultEvidence from "@/components/ResultEvidence";
import MarkdownText from "@/components/MarkdownText";

interface Props {
  mode?: "village" | "workspace";
  artifacts: Artifact[];
  jobs: Job[];
  providers: Provider[];
  initialJobId: string | null;
  onClose: () => void;
  onViewQuest: (providerId: ProviderId) => void;
}

export default function Journal({ mode = "village", artifacts, jobs, providers, initialJobId, onClose, onViewQuest }: Props) {
  const professional = mode === "workspace";
  const dialog = useRef<HTMLDialogElement>(null);
  const [selectedId, setSelectedId] = useState(artifacts.find((artifact) => artifact.jobId === initialJobId)?.id || artifacts[0]?.id || "");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [tab, setTab] = useState<"outputs" | "quests">("outputs");
  const selected = artifacts.find((artifact) => artifact.id === selectedId) || artifacts[0];
  const selectedJob = jobs.find((job) => job.id === selected?.jobId);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    if (copyStatus === "idle") return;
    const timer = setTimeout(() => setCopyStatus("idle"), 3000);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  async function copy() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.content);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <dialog ref={dialog} className="journal-dialog parchment" aria-labelledby="journal-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
      <div className="journal-header"><div className="journal-title"><BookOpen size={24} strokeWidth={1.5} /><div><p className="eyebrow">{professional ? "YOUR SAVED WORK" : "THINGS YOU HAVE DISCOVERED"}</p><h2 id="journal-title">{professional ? "Your library" : "Your field journal"}</h2></div></div><button className="icon-button ink" onClick={onClose} aria-label="Close journal"><X size={20} /></button></div>
      <div className="journal-tabs"><button aria-pressed={tab === "outputs"} className={tab === "outputs" ? "active" : ""} onClick={() => setTab("outputs")}>Collected outputs <span>{artifacts.length}</span></button><button aria-pressed={tab === "quests"} className={tab === "quests" ? "active" : ""} onClick={() => setTab("quests")}>{professional ? "Request history" : "Quest history"} <span>{jobs.length}</span></button></div>
      {tab === "outputs" ? artifacts.length ? (
        <div className="journal-content">
          <div className="artifact-list" aria-label="Saved outputs">{artifacts.map((artifact) => {
            const Icon = districts[artifact.providerId].icon;
            return <button aria-pressed={selected?.id === artifact.id} className={`artifact-item ${selected?.id === artifact.id ? "selected" : ""}`} key={artifact.id} onClick={() => { setSelectedId(artifact.id); setCopyStatus("idle"); }}><Icon size={18} /><span><strong>{artifact.title}</strong><small>{providers.find((provider) => provider.id === artifact.providerId)?.name || artifact.providerId} / {new Date(artifact.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></span><ChevronRight size={13} /></button>;
          })}</div>
          {selected && <article className="artifact-detail">
            <div className="artifact-detail-heading"><span className="eyebrow">{selected.type.replaceAll("-", " ")}</span><button className="icon-button ink" aria-label={copyStatus === "copied" ? "Output copied" : "Copy output"} title={copyStatus === "copied" ? "Copied" : "Copy output"} onClick={copy}>{copyStatus === "copied" ? <Check size={17} /> : <Copy size={17} />}</button></div>
            {copyStatus !== "idle" && <p className="field-hint" role="status">{copyStatus === "copied" ? "Copied to clipboard." : "Clipboard unavailable. Select the output text to copy it."}</p>}
            <h3>{selected.title}</h3>
            <>{selectedJob?.result ? <ResultView result={selectedJob.result} /> : <MarkdownText>{selected.content}</MarkdownText>}</>
            {(!selectedJob?.result?.blocks?.length ? selectedJob?.result?.links : undefined)?.map((link, index) => {
              const url = safeUrl(link.url);
              return url ? <a className="result-link" key={`${url}-${index}`} href={url} target="_blank" rel="noopener noreferrer">{link.title}<ExternalLink size={12} /></a> : null;
            })}
            {selectedJob?.result && <ResultEvidence result={selectedJob.result} />}
          </article>}
        </div>
      ) : <div className="journal-empty"><div className="empty-emblem"><FileText size={32} strokeWidth={1.3} /></div><h3>{professional ? "Your work belongs here." : "Every adventure leaves a little something."}</h3><p>Complete a request to save your first output.<br />It will be kept here for your next visit.</p><button className="primary-button" onClick={onClose}>{professional ? "Back to workspace" : "Back to the village"}<ChevronRight size={15} /></button></div> : (
        <div className="quest-history">{jobs.length ? jobs.map((job) => {
          const artifact = artifacts.find((entry) => entry.jobId === job.id);
          return <div className="history-item" key={job.id}><ScrollText size={19} /><div><strong>{job.result?.title || providers.find((provider) => provider.id === job.providerId)?.name || job.providerId}</strong><p title={job.error || job.input.fileName || job.input.prompt}>{job.error || job.input.fileName || job.input.prompt || (job.providerId === 'zeus' ? `Forecast for ${job.input.latitude}, ${job.input.longitude}` : job.memoryDeletedAt ? 'Note deleted' : `Explore testnet ${job.input.netuid || 298}`)}</p><small>{new Date(job.createdAt).toLocaleString()}</small>{artifact ? <button className="text-button" onClick={() => { setSelectedId(artifact.id); setCopyStatus("idle"); setTab("outputs"); }}>Read result<ChevronRight size={14} /></button> : providers.some(provider => provider.id === job.providerId) ? <button className="text-button" onClick={() => onViewQuest(job.providerId)}>{professional ? "Open subnet" : "Visit district"}<ChevronRight size={14} /></button> : <small>This service is no longer in the public catalogue.</small>}</div><span className={`history-status ${job.status}`}>{job.status}</span></div>;
        }) : <div className="journal-empty"><ScrollText size={30} /><h3>A fresh page, a new adventure.</h3><p>Your requests will appear here once you get started.</p></div>}</div>
      )}
      <div className="journal-footer"><span className="tiny-diamond" />Saved by Subswarm. This browser&apos;s session cookie gives you access.</div>
    </dialog>
  );
}
