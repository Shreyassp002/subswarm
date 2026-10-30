"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowUpRight, BookOpen, ChevronRight, Grid2X2, LoaderCircle, Map, RefreshCw, Search, Wallet, X } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { matchesProvider } from "@/lib/provider-search";
import { formatTAO } from "@/lib/money";
import ProviderLogo from "@/components/ProviderLogo";
import TaskPanel from "@/components/TaskPanel";
import Journal from "@/components/Journal";
import WorkspaceOverlay from "@/components/WorkspaceOverlay";
import Mark from "@/components/brand/Mark";
import "@/app/brand.css";
import "@/app/workspace.css";
const WalletPanel = dynamic(() => import("@/components/WalletPanel"), { ssr: false });
const labels = { ready: "Connected", needs_key: "Setup needed", unavailable: "Unavailable", external: "External studio" };

export default function Workspace() {
  const workspace = useWorkspace();
  const { providers, jobs, artifacts, selected, selectedJob, selectedUid, selectProvider, setSelectedProvider, residents, refreshResidents, connection, wallet, payments, busy, submitting, taskError, sendQuest, currentJob, openWallet, walletOpen, setWalletOpen, refreshWallet, openJournal, journalOpen, setJournalOpen, journalJobId, setReload, error } = workspace;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [connectedOnly, setConnectedOnly] = useState(false);
  const categories = ["All", ...new Set(providers.map(provider => provider.category))];
  const filtered = providers.filter(provider => matchesProvider(provider, search) && (category === "All" || provider.category === category) && (!connectedOnly || provider.status === "ready"));
  const visiblePanel = !!selected;
  return <div className="swarm-brand professional">
    <a href="#workspace-main" className="skip-link">Skip to workspace</a>
    <header className="workspace-top"><Link href="/" className="swarm-wordmark"><Mark />SUBSWARM</Link><nav aria-label="Product mode"><span className="mode-current">Workspace</span><Link href="/village/"><Map size={15} />Village</Link></nav><button className="account-button" onClick={openWallet}><Wallet size={16} /><span>{wallet?.address ? `${formatTAO(wallet.availableRao)} test TAO` : "Connect wallet"}</span></button></header>
    <div className="workspace-layout">
      <aside className="workspace-rail" aria-label="Workspace navigation">
        <p className="pixel rail-caption">Your workspace</p>
        <button className="rail-item selected" onClick={() => { setSelectedProvider(null); setSearch(""); setCategory("All"); setConnectedOnly(false); }}><Grid2X2 size={18} />Explore subnets</button>
        <button className="rail-item" onClick={() => openJournal()}><BookOpen size={18} />Your library<span>{artifacts.length}</span></button>
        <button className="rail-item" onClick={openWallet}><Wallet size={18} />Wallet & activity</button>
        <div className="rail-separator" /><p className="pixel rail-caption">Capabilities</p>
        {categories.filter(value => value !== "All").map(value => <button key={value} className={`rail-category ${category === value ? "selected" : ""}`} onClick={() => { setCategory(value); setSelectedProvider(null); }}><span>{value}</span><span>{providers.filter(provider => provider.category === value).length}</span></button>)}
        <Link href="/village/" className="village-invite"><span className="pixel">Take the scenic route</span><strong>Same tools.<br />A different world.</strong><span>Enter the village <ArrowUpRight size={15} /></span></Link>
        <div className="rail-connection"><i className={connection} /><span>{connection === "online" ? "Service connected" : connection === "loading" ? "Connecting" : "Service offline"}</span></div>
      </aside>
      <main id="workspace-main" className={`workspace-main ${visiblePanel ? "with-detail" : ""}`}>
        {connection === "offline" && <div className="workspace-error" role="alert"><span>{error || "Could not reach the service."}</span><button onClick={() => setReload(value => value + 1)}><RefreshCw size={14} />Retry</button></div>}
        {busy && currentJob && <button className="workspace-running" onClick={() => selectProvider(currentJob.providerId)}><LoaderCircle size={16} className="spin" />Your {providers.find(provider => provider.id === currentJob.providerId)?.name || "subnet"} request is running.<span>View request <ChevronRight size={14} /></span></button>}
        <section className="workspace-intro"><div><p className="pixel">Bittensor, within reach</p><h1>What will you<br /><em>make today?</em></h1><p>Find a subnet. Give it a task. Keep what you create.</p></div><div className="intro-art" aria-hidden="true"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-core"><Mark /></div><span className="art-node node-one">Aa</span><span className="art-node node-two">AI</span><span className="art-node node-three">{`{ }`}</span></div></section>
        <div className="workspace-mobile-tools"><button onClick={() => openJournal()}><BookOpen size={16} />Your library</button><button onClick={openWallet}><Wallet size={16} />Wallet & activity</button></div>
        <div className="catalog-toolbar"><label className="subnet-search"><Search size={18} /><span className="sr-only">Search subnets</span><input type="search" placeholder="Search subnets, capabilities or SN number" value={search} onChange={event => setSearch(event.target.value)} />{search && <button aria-label="Clear search" onClick={() => setSearch("")}><X size={15} /></button>}</label><label className="connected-filter"><input type="checkbox" checked={connectedOnly} onChange={event => setConnectedOnly(event.target.checked)} />Connected only</label></div>
        <nav className="category-tabs" aria-label="Filter by capability">{categories.map(value => <button key={value} aria-pressed={category === value} className={category === value ? "selected" : ""} onClick={() => setCategory(value)}>{value}</button>)}</nav>
        <div className="catalog-heading"><h2>{category === "All" ? "Explore the network" : `${category} subnets`}</h2><span>{filtered.length} services</span></div>
        {connection === "loading" && <div className="catalog-loading" role="status"><LoaderCircle className="spin" size={22} />Loading the subnet catalogue...</div>}
        <div className="subnet-grid">{filtered.map(provider => <button key={provider.id} className={`subnet-card ${selected?.id === provider.id ? "selected" : ""}`} onClick={() => selectProvider(provider.id)} aria-label={`Open ${provider.name}`}>
          <div className="subnet-card-top"><ProviderLogo id={provider.id} size={42} /><span className="pixel">{provider.network === "testnet" ? "Testnet " : ""}{provider.netuid === null ? "Network" : `SN ${provider.netuid}`}</span><ArrowUpRight size={17} /></div><div className="subnet-card-title"><h3>{provider.name}</h3><span>{provider.category}</span></div><p>{provider.description}</p><div className="subnet-card-bottom"><span className={`provider-state ${provider.status}`}><i />{labels[provider.status]}</span><span>{provider.taskKind === "network-scan" ? "Free" : provider.status === "external" ? "Visit studio" : payments?.pricesRao[provider.id] ? `${formatTAO(payments.pricesRao[provider.id]!)} test TAO` : "View details"}</span></div>
        </button>)}</div>
        {connection !== "loading" && !filtered.length && <div className="catalog-empty"><Search size={28} /><h3>{connection === "offline" ? "The catalogue could not load" : "No subnets found"}</h3><p>{connection === "offline" ? "Reconnect to see available services." : "Try a name, a subnet number, or a different capability."}</p><button onClick={() => { setSearch(""); setCategory("All"); setConnectedOnly(false); if (connection === "offline") setReload(value => value + 1); }}>{connection === "offline" ? "Retry connection" : "Clear filters"}</button></div>}
        <section className="recent-work"><div className="catalog-heading"><h2>Your recent work</h2><button onClick={() => openJournal()}>Open library <ArrowUpRight size={14} /></button></div>{jobs.length ? jobs.slice(0, 4).map(job => <button className="recent-row" key={job.id} onClick={() => job.status === "completed" ? openJournal(job.id) : selectProvider(job.providerId)}><ProviderLogo id={job.providerId} size={28} /><span><strong>{job.result?.title || providers.find(provider => provider.id === job.providerId)?.name || job.providerId}</strong><small>{new Date(job.createdAt).toLocaleString()}</small></span><span className={`recent-status ${job.status}`}>{job.status}</span><ChevronRight size={15} /></button>) : <div className="library-empty"><BookOpen size={22} /><div><h3>Your next idea starts here.</h3><p>Completed requests and saved files will appear in your library.</p></div></div>}</section>
        <footer className="workspace-footer"><span>Connected means configured. Provider availability is checked when a request runs.</span><Link href="/#how-it-works">How Subswarm works</Link></footer>
      </main>
    </div>
    {selected && <WorkspaceOverlay className="workspace-detail" label={`${selected.name} request`} onClose={() => setSelectedProvider(null)}><div className="detail-surface"><TaskPanel key={`${selected.id}:${selectedUid}`} mode="workspace" provider={selected} residentState={residents[selected.id]} selectedUid={selectedUid} onRefreshResidents={() => refreshResidents(selected.id)} job={selectedJob} busy={busy} submitting={submitting} connected={connection === "online"} error={taskError} wallet={wallet} payments={payments} onOpenWallet={openWallet} onSubmit={sendQuest} onClose={() => setSelectedProvider(null)} onOpenJournal={() => openJournal(selectedJob?.id || null)} /></div></WorkspaceOverlay>}
    {walletOpen && <WorkspaceOverlay className="workspace-wallet" label="Wallet and activity" onClose={() => setWalletOpen(false)}><WalletPanel mode="workspace" onClose={() => setWalletOpen(false)} onChanged={() => void refreshWallet()} /></WorkspaceOverlay>}
    {journalOpen && <Journal mode="workspace" artifacts={artifacts} jobs={jobs} providers={providers} initialJobId={journalJobId} onClose={() => setJournalOpen(false)} onViewQuest={id => { setJournalOpen(false); selectProvider(id); }} />}
  </div>;
}
