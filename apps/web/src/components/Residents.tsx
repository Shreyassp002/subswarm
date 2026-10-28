"use client";

import { useState } from 'react';
import { RefreshCw, Search, Users } from 'lucide-react';
import type { Provider } from '@subswarm/shared';
import type { ResidentState } from '@/hooks/useResidents';

interface Props {
  provider: Provider;
  state?: ResidentState;
  selectedUid: number | null;
  onRefresh: () => void;
}

export default function Residents({ provider, state, selectedUid, onRefresh }: Props) {
  const [query, setQuery] = useState(selectedUid === null ? '' : String(selectedUid));
  const snapshot = state?.snapshot;
  const needle = query.trim().toLowerCase();
  const people = snapshot?.participants.filter(person => !needle || String(person.uid) === needle || person.hotkey.toLowerCase().includes(needle) || person.role.includes(needle)) ?? [];
  const validators = snapshot?.participants.filter(person => person.role === 'validator').length ?? 0;

  return <div className="resident-panel">
    <div className="resident-intro"><div><h3>People of this house</h3><p>Registered on {provider.network === 'mainnet' ? 'mainnet' : 'testnet'} / SN {provider.netuid}</p></div><button type="button" className="icon-button ink" aria-label="Refresh residents" disabled={state?.loading} onClick={onRefresh}><RefreshCw size={16} className={state?.loading ? 'spin' : ''} /></button></div>
    {state?.error && <p className="error-note" role="status">{state.error}{snapshot ? ' Showing the last successful snapshot.' : ''}</p>}
    {!snapshot && !state?.error && <div className="illustrated-empty"><Users size={30} /><h4>Gathering the roster</h4><p>Reading this house&apos;s public registry.</p></div>}
    {snapshot && <>
      <div className="resident-stats"><div><span className="pixel-person" aria-hidden="true" /><div><strong>{snapshot.totalParticipants - validators}</strong><span>Miners</span></div></div><div><span className="pixel-person validator" aria-hidden="true" /><div><strong>{validators}</strong><span>Validator permits</span></div></div></div>
      <label className="resident-search"><Search size={16} /><span className="sr-only">Find a resident by UID, hotkey or role</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a resident..." autoComplete="off" /></label>
      <div className="house-roster">{people.map(person => <details key={person.hotkey} className={person.uid === selectedUid ? 'selected-resident' : ''} open={person.uid === selectedUid ? true : undefined}>
        <summary><span className={`pixel-person ${person.role === 'validator' ? 'validator' : ''}`} aria-hidden="true" /><span><strong>Resident #{person.uid}</strong><small>{person.role === 'validator' ? 'Validator permit' : 'Miner'}</small></span><span className="resident-shortkey">{person.hotkey.slice(0, 4)}...{person.hotkey.slice(-4)}</span></summary>
        <div className="resident-identity"><code>{person.hotkey}</code><dl><dt>Chain active flag</dt><dd>{person.active ? 'Yes' : 'No'}</dd><dt>Advertised endpoint</dt><dd>{person.endpointAdvertised ? 'Yes' : 'No'}</dd></dl></div>
      </details>)}</div>
      {!people.length && <div className="illustrated-empty"><Users size={24} /><p>{snapshot.totalParticipants ? 'No residents match this search.' : 'No registered participants yet.'}</p></div>}
      <details className="quiet-details"><summary>About this roster</summary><p>These are registered participants, not confirmed responders to your quest. Registry flags do not prove someone is online. Up to three residents walk near each house.</p><p>Block {snapshot.block.toLocaleString()} / {new Date(snapshot.fetchedAt).toLocaleString()}{snapshot.name ? ` / ${snapshot.name}` : ''}</p></details>
    </>}
  </div>;
}
