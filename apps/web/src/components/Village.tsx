"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, ChevronRight, CircleAlert, Compass, HelpCircle, LoaderCircle, Map, RefreshCw, X } from "lucide-react";
import type { Artifact, Job, JobInput, NetworkSnapshot, Provider, ProviderId, Session } from "@subswarm/shared";
import { api } from "@/lib/api";
import { districts, providerOrder, statusLabel } from "@/lib/providers";
import TaskPanel from "@/components/TaskPanel";
import Journal from "@/components/Journal";

const WorldCanvas = dynamic(() => import("@/components/WorldCanvas"), {
  ssr: false,
  loading: () => <div className="world-loading"><LoaderCircle size={22} className="spin" /><span>Unfolding your little world...</span></div>,
});

const names: Record<ProviderId, string> = { saygm: "SayGM", desearch: "Desearch", "404gen": "404 GEN", chutes: "Chutes", everyframe: "EveryFrame", hippius: "Hippius", ridges: "Ridges", attelier: "Attelier", chronoseek: "ChronoSeek", network: "Network" };
const active = (job: Job | null) => job?.status === "queued" || job?.status === "running";

export default function Village() {
  const [session, setSession] = useState<Session | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [snapshot, setSnapshot] = useState<NetworkSnapshot | null>(null);
  const [chainUnavailable, setChainUnavailable] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [connection, setConnection] = useState<"loading" | "online" | "offline">("loading");
  const [error, setError] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reload, setReload] = useState(0);
  const pollingJobId = active(currentJob) ? currentJob?.id : null;

  const refreshRecords = useCallback(async (signal?: AbortSignal) => {
    const [jobData, artifactData] = await Promise.all([
      api<{ jobs: Job[] }>("/v1/jobs", { signal }),
      api<{ artifacts: Artifact[] }>("/v1/artifacts", { signal }),
    ]);
    if (!signal?.aborted) {
      setJobs(jobData.jobs);
      setArtifacts(artifactData.artifacts);
    }
    return jobData.jobs;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setConnection("loading");
      setError(null);
      try {
        const sessionData = await api<{ session: Session }>("/v1/session", { signal: controller.signal });
        const [providerData, savedJobs] = await Promise.all([
          api<{ providers: Provider[] }>("/v1/providers", { signal: controller.signal }),
          refreshRecords(controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setSession(sessionData.session);
        setProviders(providerData.providers);
        setCurrentJob(savedJobs.find((job) => active(job)) || null);
        setConnection("online");
        try {
          const network = await api<NetworkSnapshot>("/v1/networks/testnet/298", { signal: controller.signal });
          if (!controller.signal.aborted) { setSnapshot(network); setChainUnavailable(false); }
        } catch {
          if (!controller.signal.aborted) setChainUnavailable(true);
        }
      } catch (failure) {
        if (controller.signal.aborted) return;
        setConnection("offline");
        setError(failure instanceof Error ? failure.message : "The village API could not be reached.");
      }
    }
    void load();
    return () => controller.abort();
  }, [reload, refreshRecords]);

  useEffect(() => {
    if (!pollingJobId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const data = await api<{ job: Job }>(`/v1/jobs/${encodeURIComponent(pollingJobId!)}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setConnection("online");
        setError(null);
        if (active(data.job)) {
          setCurrentJob(data.job);
          timer = setTimeout(poll, 2000);
        } else {
          await refreshRecords(controller.signal);
          if (controller.signal.aborted) return;
          if (data.job.result?.snapshot) setSnapshot(data.job.result.snapshot);
          setCurrentJob(data.job);
        }
      } catch (failure) {
        if (controller.signal.aborted) return;
        setConnection("offline");
        setError(failure instanceof Error ? failure.message : "The connection was interrupted. Your quest is still saved.");
        timer = setTimeout(poll, 4000);
      }
    }
    timer = setTimeout(poll, 1800);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [pollingJobId, refreshRecords]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { setSelectedProvider(null); setHelpOpen(false); setDirectoryOpen(false); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function selectProvider(id: ProviderId) {
    setSelectedProvider(id);
    setTaskError(null);
    setHelpOpen(false);
    setDirectoryOpen(false);
  }

  async function sendQuest(input: JobInput) {
    if (submitting || active(currentJob) || connection !== "online") return;
    setSubmitting(true);
    setTaskError(null);
    try {
      const data = await api<{ job: Job }>("/v1/jobs", { method: "POST", body: JSON.stringify(input) });
      setCurrentJob(data.job);
      setJobs((previous) => [data.job, ...previous.filter((job) => job.id !== data.job.id)]);
      if (!active(data.job)) {
        await refreshRecords();
        if (data.job.result?.snapshot) setSnapshot(data.job.result.snapshot);
      }
    } catch (failure) {
      setTaskError(failure instanceof Error ? failure.message : "This quest could not be sent. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const selected = providers.find((provider) => provider.id === selectedProvider);
  const selectedJob = currentJob?.providerId === selectedProvider ? currentJob : jobs.find((job) => job.providerId === selectedProvider) || null;
  const busy = active(currentJob);
  return (
    <div className="village-app">
      <a className="skip-link" href="#world-controls">Skip to world controls</a>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Subswarm village home" title={session ? `Exploring as ${session.name}` : "Subswarm"}>subswarm<span>.</span></Link>
        <nav className="world-controls" id="world-controls" aria-label="World controls">
          <button className={`world-action ${directoryOpen ? "active" : ""}`} aria-label="Map" aria-expanded={directoryOpen} aria-controls="district-directory" onClick={() => { setDirectoryOpen((value) => !value); setSelectedProvider(null); setHelpOpen(false); }}><Map size={16} /><span>Map</span></button>
          <button className="world-action" aria-label={`Journal${artifacts.length ? `, ${artifacts.length} saved outputs` : ""}`} onClick={() => { setJournalOpen(true); setDirectoryOpen(false); setHelpOpen(false); }}><BookOpen size={16} /><span>Journal</span>{artifacts.length > 0 && <small>{artifacts.length}</small>}</button>
          <button className={`world-action ${helpOpen ? "active" : ""}`} aria-label="Help" aria-expanded={helpOpen} onClick={() => { setHelpOpen((value) => !value); setDirectoryOpen(false); setSelectedProvider(null); }}><HelpCircle size={16} /><span>Help</span></button>
        </nav>
      </header>
      <main className="world-shell" aria-label="Interactive Subswarm village">
        <div className="world-canvas-layer"><WorldCanvas selectedProvider={selectedProvider} onSelectProvider={selectProvider} participants={snapshot?.participants || []} participantSubnet={snapshot?.netuid} busyProvider={busy ? currentJob?.providerId : null} /></div>
        {directoryOpen && <aside className="directory parchment panel-enter" id="district-directory" aria-labelledby="directory-title">
          <div className="directory-heading"><h2 id="directory-title">Districts</h2><button className="icon-button ink" aria-label="Close map directory" onClick={() => setDirectoryOpen(false)}><X size={17} /></button></div>
          <div className="provider-list">{providerOrder.map((id) => {
            const provider = providers.find((entry) => entry.id === id);
            const display = districts[id];
            const Icon = display.icon;
            return <button key={id} className="provider-row" onClick={() => selectProvider(id)} disabled={!provider} title={provider ? statusLabel[provider.status] : "Waiting for the village API"}><span className="district-number">{display.number}</span><Icon size={16} className="district-icon" /><span className="district-name">{provider?.name || names[id]}</span>{provider?.status === "ready" ? <i className="ready-dot" aria-label="Ready" /> : <ChevronRight size={12} className="district-chevron" />}</button>;
          })}</div>
        </aside>}
        {selected && <TaskPanel key={selected.id} provider={selected} job={selectedJob} busy={busy || connection !== "online"} submitting={submitting} error={taskError} onSubmit={sendQuest} onClose={() => setSelectedProvider(null)} onOpenJournal={() => setJournalOpen(true)} />}
        {connection === "offline" && <div className="offline-message" role="alert"><CircleAlert size={15} /><div><p>{error}</p><button onClick={() => setReload((value) => value + 1)}><RefreshCw size={12} />Reconnect</button></div></div>}
        {helpOpen && <section className="help-panel parchment panel-enter" aria-labelledby="help-title"><div className="help-heading"><Compass size={19} /><h2 id="help-title">Exploring the village</h2><button className="icon-button ink" aria-label="Close explorer guide" onClick={() => setHelpOpen(false)}><X size={17} /></button></div><p>Use WASD or the arrow keys to walk. Click to move, click a district sign to open it, or press E near an entrance.</p><p>Send a quest to a provider and find the saved result in your journal. Town Hall reads the testnet registry without an API key.</p><p className="field-hint">Registered residents are chain participants, not a claim that they served a request. Your session is kept by a browser cookie.</p></section>}
        <div className="world-status" aria-live="polite"><div className="connection-line"><span className={`connection-indicator ${connection}`} /><span>{connection === "online" ? "Connected" : connection === "loading" ? "Connecting..." : "Offline"}</span>{snapshot && <span className="resident-count">/ Testnet {snapshot.netuid} / {snapshot.totalParticipants} registered residents</span>}{chainUnavailable && !snapshot && <span className="resident-count">/ Chain registry unavailable</span>}{busy && <button className="active-quest-link" onClick={() => selectProvider(currentJob!.providerId)}><LoaderCircle size={11} className="spin" />View current quest</button>}</div><p className="keyboard-hint">WASD / arrows to move. Click to walk. E to enter.</p></div>
      </main>
      {journalOpen && <Journal artifacts={artifacts} jobs={jobs} providers={providers} onClose={() => setJournalOpen(false)} />}
    </div>
  );
}
