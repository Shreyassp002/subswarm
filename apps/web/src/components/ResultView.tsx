"use client";

import { useState } from 'react';
import Image from 'next/image';
import type { JobResult, ResultBlock } from '@subswarm/shared';
import { Download, ExternalLink, Film, Trash2, Cloud } from 'lucide-react';
import { api, downloadUrl, safeUrl } from '@/lib/api';

function timestamp(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

function StoredFile({ block }: { block: Extract<ResultBlock, { type: 'stored-file' }> }) {
  const [state, setState] = useState<'ready' | 'confirm' | 'deleting' | 'deleted'>('ready');
  const [error, setError] = useState('');
  const url = downloadUrl(`/v1/jobs/${block.jobId}/files/storage`);
  async function remove() {
    setState('deleting'); setError('');
    try {
      await api(`/v1/jobs/${block.jobId}/files/storage/delete`, { method: 'POST', body: '{}' }, 65_000);
      setState('deleted');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Deletion failed.'); setState('confirm'); }
  }
  if (state === 'deleted') return <p role="status">This file was deleted from storage.</p>;
  return <section className="stored-file"><Cloud size={24} /><div><strong>{block.name}</strong><small>{block.bytes < 1024 ? `${block.bytes} bytes` : `${(block.bytes / 1024).toFixed(1)} KiB`} / Private storage</small></div>
    {url && <a className="file-download" href={url}><Download size={16} />Download file</a>}
    <details className="quiet-details"><summary>File fingerprint</summary><code>{block.sha256}</code></details>
    {state === 'ready' ? <button className="text-button" onClick={() => setState('confirm')}><Trash2 size={14} />Delete stored file</button> : <div className="storage-confirm"><p>Delete this file? Its journal receipt will remain.</p><button className="secondary-button" disabled={state === 'deleting'} onClick={() => void remove()}>{state === 'deleting' ? 'Deleting...' : 'Delete permanently'}</button><button className="text-button" disabled={state === 'deleting'} onClick={() => setState('ready')}>Keep file</button></div>}
    {error && <p role="alert" className="error-note">{error}</p>}
  </section>;
}

export default function ResultView({ result, compact = false }: { result: JobResult; compact?: boolean }) {
  if (!result.blocks?.length) return <div className={compact ? 'result-preview artifact-body' : 'artifact-body'}>{result.text}</div>;
  return <div className="result-blocks">{result.blocks.map((block, index) => {
    if (block.type === 'stored-file') return <StoredFile key={block.jobId} block={block} />;
    if (block.type === 'media') return <section key={index} className="media-results">{block.items.map((item, i) => {
      const url = downloadUrl(item.url);
      if (!url) return <p key={i}>This media link is unavailable.</p>;
      return <figure key={url}>{item.kind === 'image' ? <Image src={url} alt={item.title} width={640} height={480} unoptimized /> : item.kind === 'video' ? <video src={url} controls preload="none" /> : <audio src={url} controls preload="none" />}<figcaption><a href={url} className="text-button"><Download size={14} />Download {item.title}</a></figcaption></figure>;
    })}</section>;
    if (block.type === 'text') return <section key={index}>{block.model && <p className="result-model">{block.model}</p>}<div className={compact ? 'result-preview artifact-body' : 'artifact-body'}>{block.text}</div></section>;
    if (block.type === 'search-results') return <section key={index} className="search-results">{!block.items.length && <p>No matching pages were found.</p>}{block.items.slice(0, compact ? 3 : undefined).map((item, i) => {
      const url = safeUrl(item.url);
      return <article key={`${item.url}-${i}`}><h4>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{item.title}<ExternalLink size={12} /></a> : item.title}</h4><p>{item.snippet}</p>{url && <small>{new URL(url).hostname}</small>}</article>;
    })}</section>;
    if (block.type === 'video-moments') {
      const source = safeUrl(block.sourceUrl);
      return <section key={index} className="video-moments">{source && <a className="text-button" href={source} target="_blank" rel="noopener noreferrer"><Film size={14} />Open source video<ExternalLink size={12} /></a>}{!block.items.length && <p>No matching moments were found.</p>}{block.items.map((item, i) => <div className="video-moment" key={i}><strong>{timestamp(item.start)} - {timestamp(item.end)}</strong><span>{Math.round(item.confidence * 100)}% confidence</span></div>)}</section>;
    }
    if (block.type === 'participants') return <section key={index}><div className="registry-summary"><strong>{block.snapshot.totalParticipants}</strong><span>registered residents<br />Testnet {block.snapshot.netuid} / block {block.snapshot.block.toLocaleString()}</span></div>{!compact && <div className="resident-roster">{block.snapshot.participants.map(person => <div key={person.uid}><strong>UID {person.uid}</strong><span>{person.role}</span><code title={person.hotkey}>{person.hotkey.slice(0, 9)}...{person.hotkey.slice(-6)}</code></div>)}</div>}</section>;
    if (block.type === 'files') return <section key={index} className="file-results">{block.items.map((file, i) => {
      const url = downloadUrl(file.url);
      return url ? <a key={i} href={url} className="file-download"><Download size={20} /><span><strong>{file.title}</strong><small>{file.format.toUpperCase()} file</small></span></a> : <p key={i}>This file link is unavailable.</p>;
    })}</section>;
    return null;
  })}</div>;
}
