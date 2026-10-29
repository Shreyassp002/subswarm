export type ProviderId = 'network' | 'saygm' | 'desearch' | 'chronoseek' | 'chutes' | '404gen' | 'attelier' | 'everyframe' | 'hippius' | 'ridges';
export type TaskKind = 'network-scan' | 'text' | 'search' | 'video-search' | '3d' | 'media' | 'storage';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ProviderInputField {
  key: 'prompt' | 'videoUrl' | 'netuid' | 'maxTokens' | 'topK' | 'start' | 'model' | 'inputImageUrl' | 'fileName' | 'fileBase64';
  type: 'textarea' | 'url' | 'number' | 'select' | 'text' | 'file';
  label: string;
  description?: string;
  required: boolean;
  defaultValue?: string | number;
  placeholder?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  options?: { label: string; value: string | number }[];
}

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
  docsUrl?: string;
  inputs: ProviderInputField[];
  inputDescription: string;
  outputDescription: string;
  exampleInput?: JobInput;
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
  maxTokens?: number;
  topK?: number;
  start?: number;
  model?: '404-3dgs' | '404-mesh';
  inputImageUrl?: string;
  fileName?: string;
  fileBase64?: string;
}

export type ResultBlock =
  | { type: 'stored-file'; name: string; bytes: number; sha256: string; jobId: string; expiresAt?: string }
  | { type: 'media'; items: { title: string; url: string; kind: 'image' | 'video' | 'audio'; mimeType: string }[] }
  | { type: 'text'; text: string; model?: string }
  | { type: 'search-results'; items: { title: string; snippet: string; url: string }[] }
  | { type: 'video-moments'; sourceUrl: string; items: { start: number; end: number; confidence: number }[] }
  | { type: 'participants'; snapshot: NetworkSnapshot }
  | { type: 'files'; items: { title: string; url: string; format: 'spz' | 'glb' | 'file' }[] };

export interface JobResult {
  storageSha256?: string;
  storageVersionId?: string;
  storageExpiresAt?: string;
  mediaOutputs?: { url: string; kind: 'image' | 'video' | 'audio'; mimeType: string; sha256: string; authentication: 'Bearer' }[];
  title: string;
  text: string;
  blocks?: ResultBlock[];
  providerTaskId?: string;
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
  providerTaskId?: string;
  error: string | null;
  providerQuoteId?: string;
  storageDeletedAt?: string;
}

export interface Artifact {
  id: string;
  jobId: string;
  providerId: ProviderId;
  title: string;
  content: string;
  type: 'text' | 'network-report' | 'search' | 'video' | '3d' | 'media' | 'storage';
  createdAt: string;
}

export interface Session {
  id: string;
  name: string;
}

export interface ApiError {
  error: { code: string; message: string };
}

export type { WalletState, PaymentSettings, PaymentQuote, PaymentLedgerEntry } from './payments';
