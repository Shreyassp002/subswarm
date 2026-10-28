export type ProviderId = 'network' | 'saygm' | 'desearch' | 'chronoseek' | 'chutes' | '404gen' | 'attelier' | 'everyframe' | 'hippius' | 'ridges';
export type TaskKind = 'network-scan' | 'text' | 'search' | 'video-search';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface Provider {
  id: ProviderId;
  name: string;
  netuid: number | null;
  network: 'mainnet' | 'testnet' | null;
  category: string;
  description: string;
  status: 'ready' | 'needs_key' | 'unavailable' | 'external';
  taskKind: TaskKind | null;
  attribution: 'none' | 'registered-participants' | 'query-uids';
  website: string;
  reason?: string;
}

export interface Participant {
  uid: number;
  hotkey: string;
  role: 'validator' | 'miner';
  active: boolean;
  endpointAdvertised: boolean;
}

export interface NetworkSnapshot {
  network: 'testnet' | 'mainnet';
  netuid: number;
  name: string | null;
  block: number;
  fetchedAt: string;
  source: 'live-chain';
  totalParticipants: number;
  participants: Participant[];
}

export interface JobInput {
  providerId: ProviderId;
  prompt?: string;
  videoUrl?: string;
  netuid?: number;
}

export interface JobResult {
  title: string;
  text: string;
  links?: { title: string; url: string }[];
  snapshot?: NetworkSnapshot;
  attribution?: { kind: 'registered-participants' | 'query-uids'; uids: number[]; note: string };
}

export interface Job {
  id: string;
  providerId: ProviderId;
  kind: TaskKind;
  input: JobInput;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  result: JobResult | null;
  error: string | null;
}

export interface Artifact {
  id: string;
  jobId: string;
  providerId: ProviderId;
  title: string;
  content: string;
  type: 'text' | 'network-report' | 'search' | 'video';
  createdAt: string;
}

export interface Session {
  id: string;
  name: string;
}

export interface ApiError {
  error: { code: string; message: string };
}
