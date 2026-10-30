import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { JobInput, JobResult } from '@subswarm/shared';
import type { Config } from './config.js';
import { ApiFailure } from './errors.js';
import type { NetworkReader } from './network.js';
import { createAttelierExecutor } from './attelier.js';
import { createHippiusStorage } from './hippius.js';
import { create404Executor } from './gen404.js';

export { providerCatalog } from './provider-catalog.js';
export { download404Result } from './gen404.js';

const boundedText = z.string().max(100_000);
const safeLink = z.string().url().max(2048).refine((value) => ['https:', 'http:'].includes(new URL(value).protocol));
const chatSchema = z.object({ choices: z.array(z.object({ message: z.object({ content: boundedText.min(1) }) })).min(1).max(20) });
const modelsSchema = z.object({ data: z.array(z.object({
  id: z.string().min(1).max(256), available: z.boolean().optional(), api_shapes: z.array(z.string()).optional(), coming_soon: z.boolean().optional(),
})).max(5000) });
const chutesModelsSchema = z.object({ data: z.array(z.object({
  id: z.string().min(1).max(256),
  input_modalities: z.array(z.string()).optional(),
  output_modalities: z.array(z.string()).optional(),
  max_output_length: z.number().int().positive().safe().optional(),
})).max(5000) });
const searchSchema = z.object({ data: z.array(z.object({ title: z.string().max(1000), snippet: z.string().max(10_000), link: safeLink })).max(100) });
const chronoSchema = z.object({
  protocol_version: z.literal('2026-04-10'),
  request_id: z.string().optional(),
  status: z.enum(['accepted', 'processing', 'completed', 'failed']),
  results: z.array(z.object({ start: z.number().nonnegative().finite(), end: z.number().nonnegative().finite(), confidence: z.number().min(0).max(1) })
    .refine((result) => result.end >= result.start)).max(100),
  miner_metadata: z.object({ selected_uids: z.array(z.number().int().min(0).max(65535)).max(1000).optional(), queried_uids: z.array(z.number().int().min(0).max(65535)).max(1000).optional() }).optional(),
});

export interface JobExecutionContext {
  jobId: string;
  onProviderQuoteCreated?: (id: string) => void;
  onProviderTaskCreated?: (id: string) => void;
}

export type JobExecutor = (input: JobInput, context?: JobExecutionContext) => Promise<JobResult>;

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403 ? 'The provider rejected its configured credentials.'
      : response.status === 402 ? 'The provider account has no available credit.'
        : response.status === 429 ? 'The provider is rate limited. Try again later.'
          : `The provider returned HTTP ${response.status}.`;
    throw new ApiFailure('provider_request_failed', message, 502);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ApiFailure('invalid_provider_response', 'The provider returned an empty response.', 502);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) {
        await reader.cancel();
        throw new ApiFailure('provider_response_too_large', 'The provider response exceeded the supported size.', 502);
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure('invalid_provider_response', 'The provider returned invalid JSON.', 502);
  } finally {
    reader.releaseLock();
  }
}

async function requestJson(url: string, options: RequestInit, fetcher: typeof fetch): Promise<unknown> {
  try {
    return await readJson(await fetcher(url, { ...options, signal: AbortSignal.timeout(60_000), redirect: 'error' }));
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure('provider_unreachable', 'The provider could not be reached or the request timed out.', 502);
  }
}

function parseResponse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ApiFailure('invalid_provider_response', 'The provider response did not match its documented schema.', 502);
  return parsed.data;
}

export function createExecutor(config: Config, network: NetworkReader, fetcher: typeof fetch = fetch): JobExecutor {
  const executeAttelier = createAttelierExecutor(config, fetcher);
  const storage = createHippiusStorage(config);
  const execute404 = create404Executor(config, fetcher);
  return async (input, context) => {
    if (input.providerId === 'attelier') return executeAttelier(input, context);
    if (input.providerId === 'hippius') return storage.execute(input, context);
    if (input.providerId === '404gen') return execute404(input, context);
    if (input.providerId === 'network') {
      const snapshot = await network.snapshot('testnet', input.netuid ?? 298);
      const validators = snapshot.participants.filter((participant) => participant.role === 'validator').length;
      const advertised = snapshot.participants.filter((participant) => participant.endpointAdvertised).length;
      return {
        title: `${snapshot.name ?? 'Subnet'} - testnet ${snapshot.netuid}`,
        text: [
          `Bittensor testnet subnet ${snapshot.netuid}${snapshot.name ? ` (${snapshot.name})` : ''}`,
          `Observed at block ${snapshot.block} on ${snapshot.fetchedAt}.`,
          `${snapshot.totalParticipants} registered participants: ${validators} validators and ${snapshot.totalParticipants - validators} miners.`,
          `${advertised} advertise endpoints. ${snapshot.participants.filter((participant) => participant.active).length} are marked active on chain.`,
          'Registration, validator permission, and advertised endpoints do not prove a participant served a request.',
          '',
          ...snapshot.participants.map((participant) => `UID ${participant.uid} | ${participant.role} | active: ${participant.active} | endpoint advertised: ${participant.endpointAdvertised} | ${participant.hotkey}`),
        ].join('\n'),
        blocks: [{ type: 'participants', snapshot }],
        snapshot,
        attribution: { kind: 'registered-participants', uids: snapshot.participants.map((participant) => participant.uid), note: 'Registered on-chain participants only. No inference request was sent to these participants.' },
      };
    }
    if (input.providerId === 'saygm' && config.saygmApiKey) {
      let model = config.saygmModel;
      if (!model) {
        const catalog = parseResponse(modelsSchema, await requestJson('https://api.saygm.com/v1/models?api_shape=chat.completions', {}, fetcher));
        model = catalog.data.find((entry) => entry.available === true && !entry.coming_soon && (!entry.api_shapes || entry.api_shapes.includes('chat.completions')))?.id;
      }
      if (!model) throw new ApiFailure('no_model_available', 'SayGM has no available chat model. Configure a supported model and retry.', 503);
      const data = parseResponse(chatSchema, await requestJson('https://api.saygm.com/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${config.saygmApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: input.prompt }], max_tokens: input.maxTokens ?? 256, stream: false }),
      }, fetcher));
      return { title: 'SayGM response', text: data.choices[0].message.content, blocks: [{ type: 'text', text: data.choices[0].message.content, model }] };
    }
    if (input.providerId === 'chutes' && config.chutesApiKey) {
      const catalog = parseResponse(chutesModelsSchema, await requestJson('https://llm.chutes.ai/v1/models', {}, fetcher));
      const model = catalog.data.find((entry) => entry.input_modalities?.includes('text') && entry.output_modalities?.includes('text') && (!config.chutesModel || entry.id === config.chutesModel));
      if (!model) throw new ApiFailure('no_model_available', 'Chutes has no matching text model in its current catalog. Check the configured model and retry.', 503);
      const data = parseResponse(chatSchema, await requestJson('https://llm.chutes.ai/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${config.chutesApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model.id, messages: [{ role: 'user', content: input.prompt }], max_tokens: Math.min(input.maxTokens ?? 1200, model.max_output_length ?? 1200), stream: false }),
      }, fetcher));
      return { title: 'Chutes response', text: data.choices[0].message.content, blocks: [{ type: 'text', text: data.choices[0].message.content, model: model.id }] };
    }
    if (input.providerId === 'desearch' && config.desearchApiKey) {
      const url = new URL('https://api.desearch.ai/web');
      url.searchParams.set('query', input.prompt!);
      url.searchParams.set('start', String(input.start ?? 0));
      const data = parseResponse(searchSchema, await requestJson(url.toString(), { headers: { Authorization: config.desearchApiKey } }, fetcher));
      return {
        title: 'Desearch web results',
        text: data.data.length ? data.data.map((hit) => `${hit.title}\n${hit.snippet}\n${hit.link}`).join('\n\n') : 'No web results were returned for this query.',
        links: data.data.map((hit) => ({ title: hit.title, url: hit.link })),
        blocks: [{ type: 'search-results', items: data.data.map((hit) => ({ title: hit.title, snippet: hit.snippet, url: hit.link })) }],
      };
    }
    if (input.providerId === 'chronoseek' && config.chronoseekUrl) {
      const requestId = randomUUID();
      const data = parseResponse(chronoSchema, await requestJson(`${config.chronoseekUrl.replace(/\/$/, '')}/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(config.chronoseekApiKey ? { Authorization: `Bearer ${config.chronoseekApiKey}` } : {}) },
        body: JSON.stringify({ protocol_version: '2026-04-10', request_id: requestId, video: { url: input.videoUrl }, query: input.prompt, top_k: input.topK ?? 5 }),
      }, fetcher));
      if (data.request_id && data.request_id !== requestId) throw new ApiFailure('invalid_provider_response', 'The video gateway returned a different request identifier.', 502);
      if (data.status !== 'completed') throw new ApiFailure('video_search_incomplete', `The video gateway returned ${data.status}; no completed result is available.`, 502);
      const uids = data.miner_metadata?.selected_uids;
      return {
        title: 'ChronoSeek video moments',
        text: [
          data.results.length ? data.results.map((hit, index) => `${index + 1}. ${hit.start.toFixed(2)}s to ${hit.end.toFixed(2)}s | confidence ${(hit.confidence * 100).toFixed(1)}%`).join('\n') : 'The video gateway returned no matching moments.',
          '',
          `Source video: ${input.videoUrl}`,
        ].join('\n'),
        links: [{ title: 'Source video', url: input.videoUrl! }],
        blocks: [{ type: 'video-moments', sourceUrl: input.videoUrl!, items: data.results }],
        ...(uids?.length ? { attribution: { kind: 'query-uids' as const, uids: [...new Set(uids)], note: 'Participant UIDs reported by the configured gateway for this request. This is gateway attribution, not independent execution verification.' } } : {}),
      };
    }
    throw new ApiFailure('provider_unavailable', 'This provider is not available for execution.', 503);
  };
}
