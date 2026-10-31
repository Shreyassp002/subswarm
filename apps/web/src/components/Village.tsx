"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, ChevronRight, CircleAlert, Compass, Grid2X2, HelpCircle, LoaderCircle, Map, RefreshCw, Wallet, X } from "lucide-react";
import type { ProviderId } from "@subswarm/shared";
import { useWorkspace } from "@/hooks/useWorkspace";
import ProviderLogo from "@/components/ProviderLogo";
import { matchesProvider } from "@/lib/provider-search";
import { districts, providerOrder, statusLabel } from "@/lib/providers";
import TaskPanel from "@/components/TaskPanel";
import Journal from "@/components/Journal";
import { formatTAO } from "@/lib/money";
import { UPCOMING_BUILDINGS, type VillageBuildingId } from "@/game/village";
const WalletPanel = dynamic(() => import("@/components/WalletPanel"), { ssr: false });

const WorldCanvas = dynamic(() => import("@/components/WorldCanvas"), {
  ssr: false,
  loading: () => <div className="world-loading"><LoaderCircle size={22} className="spin" /><span>Unfolding your little world...</span></div>,
});

const names: Record<ProviderId, string> = { bitmind: "BitMind", zeus: "Zeus", ditto: "Ditto", saygm: "SayGM", desearch: "Desearch", "404gen": "404 GEN", chutes: "Chutes", everyframe: "EveryFrame", hippius: "Hippius", ridges: "Ridges", attelier: "Attelier", chronoseek: "ChronoSeek", network: "Network" };

export default function Village() {
  const { selectedUid, walletOpen, setWalletOpen, wallet, payments, session, providers, jobs, artifacts, snapshot, chainUnavailable, selectedProvider, setSelectedProvider, directoryOpen, setDirectoryOpen, journalOpen, setJournalOpen, journalJobId, helpOpen, setHelpOpen, currentJob, connection, error, taskError, submitting, setReload, residents, refreshResidents, residentSnapshots, refreshWallet, selectProvider, selectResident, openWallet, openJournal, sendQuest, selected, selectedJob, busy } = useWorkspace();
  const [search, setSearch] = useState("");
  const [previewHouse, setPreviewHouse] = useState<"kova" | "talos" | null>(null);
  useEffect(() => {
    if (!previewHouse) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setPreviewHouse(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [previewHouse]);
  const upcoming = UPCOMING_BUILDINGS.find(building => building.id === (previewHouse ?? selectedProvider));
  function selectHouse(id: VillageBuildingId) {
    setPreviewHouse(null);
    if (id !== "kova" && id !== "talos") { selectProvider(id); return; }
    setSelectedProvider(null);
    setDirectoryOpen(false);
    setHelpOpen(false);
    setWalletOpen(false);
    setPreviewHouse(id);
  }
  function closePreview() { setPreviewHouse(null); setSelectedProvider(null); }
  const upcomingMatches = UPCOMING_BUILDINGS.filter(building => `${building.name} ${building.ability} ${building.comingSoon?.netuid ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <div className="village-app">
      <a className="skip-link" href="#world-controls">Skip to world controls</a>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Subswarm village home" title={session ? `Exploring as ${session.name}` : "Subswarm"}>subswarm<span>.</span></Link>
        <nav onClick={() => setPreviewHouse(null)} className="world-controls" id="world-controls" aria-label="World controls">
          <Link className="world-action" href="/app/" aria-label="Open workspace"><Grid2X2 size={16} /><span>Workspace</span></Link>
          <button className={`world-action ${directoryOpen ? "active" : ""}`} aria-label="Map" aria-expanded={directoryOpen} aria-controls="district-directory" onClick={() => { setDirectoryOpen((value) => !value); setSelectedProvider(null); setHelpOpen(false); setWalletOpen(false); }}><Map size={16} /><span>Map</span></button>
          <button className="world-action" aria-label={`Journal${artifacts.length ? `, ${artifacts.length} saved outputs` : ""}`} onClick={() => openJournal()}><BookOpen size={16} /><span>Journal</span>{artifacts.length > 0 && <small>{artifacts.length}</small>}</button>
          <button className={`world-action ${helpOpen ? "active" : ""}`} aria-label="Help" aria-expanded={helpOpen} onClick={() => { setHelpOpen((value) => !value); setDirectoryOpen(false); setSelectedProvider(null); setWalletOpen(false); }}><HelpCircle size={16} /><span>Help</span></button>
          <button className={`world-action ${walletOpen ? "active" : ""}`} aria-label="Wallet" onClick={openWallet}><Wallet size={16} /><span>{wallet?.address ? `${formatTAO(wallet.availableRao)} test TAO` : "Wallet"}</span></button>
        </nav>
      </header>
      <main className="world-shell" aria-label="Interactive Subswarm village">
        <div className="world-canvas-layer"><WorldCanvas selectedProvider={previewHouse ?? selectedProvider} onSelectProvider={selectHouse} residents={residentSnapshots} onSelectResident={selectResident} busyProvider={busy ? currentJob?.providerId : null} /></div>
        {directoryOpen && <aside className="directory parchment panel-enter" id="district-directory" aria-labelledby="directory-title">
          <div className="directory-heading"><h2 id="directory-title">Districts</h2><button className="icon-button ink" aria-label="Close map directory" onClick={() => setDirectoryOpen(false)}><X size={17} /></button></div>
          <label className="directory-search">Find a subnet<input type="search" placeholder="Name, number or capability" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <div className="provider-list">{providerOrder.filter(id => { const provider = providers.find(item => item.id === id); return provider ? matchesProvider(provider, search) : false; }).map((id) => {
            const provider = providers.find((entry) => entry.id === id);
            const display = districts[id];
            return <button key={id} className="provider-row" onClick={() => selectProvider(id)} disabled={!provider} title={provider ? statusLabel[provider.status] : "Waiting for the village API"}><span className="district-number">{display.number}</span><ProviderLogo id={id} size={22} /><span className="district-name">{provider?.name || names[id]}</span>{provider?.status === "ready" ? <i className="ready-dot" aria-label="Ready" /> : <ChevronRight size={12} className="district-chevron" />}</button>;
          })}
          {upcomingMatches.length > 0 && <p className="directory-section-label">Coming to the village</p>}
          {upcomingMatches.map(building => <button key={building.id} className="provider-row" onClick={() => selectHouse(building.id)} aria-label={`${building.name}, coming soon`}><span className="district-number">{building.number}</span><ProviderLogo id={building.id} size={22} /><span className="district-name">{building.name}</span><span className="district-coming-soon">Soon</span></button>)}
          {search && !providers.some(provider => matchesProvider(provider, search)) && !upcomingMatches.length && <p className="directory-empty">No matching district.</p>}</div>
        </aside>}
        {selected && !upcoming && <TaskPanel key={`${selected.id}:${selectedUid}`} provider={selected} residentState={residents[selected.id]} selectedUid={selectedUid} onRefreshResidents={() => refreshResidents(selected.id)} job={selectedJob} busy={busy} submitting={submitting} connected={connection === "online"} error={taskError} wallet={wallet} payments={payments} onOpenWallet={openWallet} onSubmit={sendQuest} onClose={() => setSelectedProvider(null)} onOpenJournal={() => openJournal(selectedJob?.id || null)} />}
        {walletOpen && <WalletPanel onClose={() => setWalletOpen(false)} onChanged={() => void refreshWallet()} />}
        {upcoming?.comingSoon && <aside className="task-panel parchment panel-enter upcoming-house" aria-labelledby="upcoming-house-title">
          <div className="task-topline"><span>DISTRICT {upcoming.number}{upcoming.comingSoon.netuid !== undefined && ` / SN ${upcoming.comingSoon.netuid}`}</span><button className="icon-button ink" onClick={closePreview} aria-label="Close district details"><X size={17} /></button></div>
          <div className="provider-heading"><ProviderLogo id={upcoming.id} size={48} /><div><p className="eyebrow">{upcoming.ability}</p><h2 id="upcoming-house-title">{upcoming.name}</h2></div></div>
          <p className="provider-description">{upcoming.comingSoon.description}</p>
          <div className="upcoming-house-notice"><span>Coming soon</span><p>This house is not open for quests yet. Explore the village&apos;s active houses while we prepare this integration.</p></div>
          {upcoming.comingSoon.website && <a className="upcoming-house-link" href={upcoming.comingSoon.website} target="_blank" rel="noopener noreferrer">Visit {upcoming.name}&apos;s website<ChevronRight size={14} /></a>}
        </aside>}
        {selectedProvider && !selected && !upcoming && <aside className="task-panel parchment panel-enter" aria-labelledby="pending-provider-title"><div className="task-topline"><span>DISTRICT {districts[selectedProvider].number}</span><button className="icon-button ink" onClick={() => setSelectedProvider(null)} aria-label="Close district details"><X size={17} /></button></div><h2 id="pending-provider-title">{names[selectedProvider]}</h2><p className="provider-description">{connection === "loading" ? "Connecting to the village to check this provider..." : "Connect to the village to check this provider and send quests."}</p></aside>}
        {connection === "offline" && <div className="offline-message" role="alert"><CircleAlert size={15} /><div><p>{error}</p><button onClick={() => setReload((value) => value + 1)}><RefreshCw size={12} />Reconnect</button></div></div>}
        {helpOpen && <section className="help-panel parchment panel-enter" aria-labelledby="help-title"><div className="help-heading"><Compass size={19} /><h2 id="help-title">Exploring the village</h2><button className="icon-button ink" aria-label="Close explorer guide" onClick={() => setHelpOpen(false)}><X size={17} /></button></div><p>Use WASD or the arrow keys to walk. Click to move, click a district sign to open it, or press E near an entrance.</p><p>Send a quest to a provider and find the saved result in your journal. Town Hall reads the testnet registry without an API key.</p><p className="field-hint">House residents come from each house&apos;s public subnet registry. Hover to see their role. Click one to inspect its UID and hotkey. Couriers animate requests; they do not identify competing miners. Your session is kept by a browser cookie.</p></section>}
        <div className="world-status" aria-live="polite"><div className="connection-line"><span className={`connection-indicator ${connection}`} /><span>{connection === "online" ? "Connected" : connection === "loading" ? "Connecting..." : "Offline"}</span>{snapshot && <span className="resident-count">/ Testnet registry {snapshot.netuid} / {Object.keys(residentSnapshots).length} house rosters loaded</span>}{chainUnavailable && !snapshot && <span className="resident-count">/ Chain registry unavailable</span>}{!busy && currentJob && <button className="active-quest-link" onClick={() => currentJob.status === "completed" ? openJournal(currentJob.id) : selectProvider(currentJob.providerId)}>{currentJob.status === "completed" ? "Quest complete: read result" : "Quest failed: view details"}<ChevronRight size={12} /></button>}{busy && <button className="active-quest-link" onClick={() => selectProvider(currentJob!.providerId)}><LoaderCircle size={11} className="spin" />View current quest</button>}</div><p className="keyboard-hint">WASD / arrows to move. Click to walk. E to enter.</p></div>
      </main>
      {journalOpen && <Journal artifacts={artifacts} jobs={jobs} providers={providers} initialJobId={journalJobId} onClose={() => setJournalOpen(false)} onViewQuest={(id) => { setJournalOpen(false); selectProvider(id); }} />}
    </div>
  );
}
