"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Artifact, Job, JobInput, NetworkSnapshot, Provider, ProviderId, Session, WalletState, PaymentSettings } from "@subswarm/shared";
import { api } from "@/lib/api";
import { useResidents } from "@/hooks/useResidents";

const active = (job: Job | null) => job?.status === "queued" || job?.status === "running";

export function useWorkspace() {
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [walletOpen, setWalletOpen] = useState(false);
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [payments, setPayments] = useState<PaymentSettings | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [snapshot, setSnapshot] = useState<NetworkSnapshot | null>(null);
  const [chainUnavailable, setChainUnavailable] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [journalJobId, setJournalJobId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [connection, setConnection] = useState<"loading" | "online" | "offline">("loading");
  const [error, setError] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reload, setReload] = useState(0);
  const { residents, refresh: refreshResidents } = useResidents(providers, !!session);
  const residentSnapshots = useMemo(() => Object.fromEntries(Object.entries(residents).filter(([, state]) => !!state.snapshot).map(([id, state]) => [id, state.snapshot!])) as Partial<Record<ProviderId, NetworkSnapshot>>, [residents]);
  const pollingJobId = active(currentJob) ? currentJob?.id : null;

  const refreshWallet = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await api<{wallet: WalletState; payments: PaymentSettings}>("/v1/wallet", {signal});
      if (!signal?.aborted) { setWallet(data.wallet); setPayments(data.payments); }
    } catch { if (!signal?.aborted) { setWallet(null); setPayments(null); } }
  }, []);

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
        const requested = new URL(window.location.href).searchParams.get("subnet");
        if (providerData.providers.some(provider => provider.id === requested)) setSelectedProvider(requested as ProviderId);
        setCurrentJob(savedJobs.find((job) => active(job)) || null);
        setConnection("online");
        void refreshWallet(controller.signal);
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
  }, [reload, refreshRecords, refreshWallet]);

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
          setJobs((previous) => previous.map((job) => job.id === data.job.id ? data.job : job));
          timer = setTimeout(poll, 2000);
        } else {
          await refreshRecords(controller.signal);
          if (controller.signal.aborted) return;
          if (data.job.result?.snapshot) { setSnapshot(data.job.result.snapshot); setChainUnavailable(false); }
          setCurrentJob(data.job);
          void refreshWallet(controller.signal);
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
  }, [pollingJobId, refreshRecords, refreshWallet]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Escape") { setSelectedProvider(null); setHelpOpen(false); setDirectoryOpen(false); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function selectProvider(id: ProviderId) {
    setSelectedUid(null);
    setWalletOpen(false);
    setSelectedProvider(id);
    setTaskError(null);
    setHelpOpen(false);
    setDirectoryOpen(false);
  }

  function selectResident(id: ProviderId, uid: number) {
    selectProvider(id);
    setSelectedUid(uid);
  }

  function openWallet() {
    setWalletOpen(true); setSelectedProvider(null); setDirectoryOpen(false); setHelpOpen(false);
  }

  function openJournal(jobId: string | null = null) {
    setWalletOpen(false);
    setJournalJobId(jobId);
    setJournalOpen(true);
    setDirectoryOpen(false);
    setHelpOpen(false);
  }

  async function sendQuest(input: JobInput, quoteId?: string) {
    if (submitting || active(currentJob) || connection !== "online") return;
    setSubmitting(true);
    setTaskError(null);
    try {
      const data = await api<{ job: Job }>("/v1/jobs", { method: "POST", body: JSON.stringify({ ...input, ...(quoteId ? { quoteId } : {}) }) });
      setCurrentJob(data.job);
      void refreshWallet();
      setJobs((previous) => [data.job, ...previous.filter((job) => job.id !== data.job.id)]);
      if (!active(data.job)) {
        await refreshRecords();
        if (data.job.result?.snapshot) { setSnapshot(data.job.result.snapshot); setChainUnavailable(false); }
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
  return { selectedUid, walletOpen, setWalletOpen, wallet, payments, session, providers, jobs, artifacts, snapshot, chainUnavailable, selectedProvider, setSelectedProvider, directoryOpen, setDirectoryOpen, journalOpen, setJournalOpen, journalJobId, helpOpen, setHelpOpen, currentJob, connection, error, taskError, submitting, setReload, residents, refreshResidents, residentSnapshots, refreshWallet, selectProvider, selectResident, openWallet, openJournal, sendQuest, selected, selectedJob, busy };
}
