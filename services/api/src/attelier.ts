import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import type { Config } from './config.js';
import { ApiFailure } from './errors.js';
import type { JobExecutor } from './providers.js';

const base = 'https://inference.attelier.ai';
const integer = z.number().int().nonnegative().safe();
const price = z.union([
  z.object({ currency: z.literal('USD'), maximumMicros: integer, estimatedMicros: integer }).refine(p => p.estimatedMicros <= p.maximumMicros),
  z.object({ currency: z.literal('USD'), amountMicros: integer }),
]);
const quoteSchema = z.object({ id: z.uuid(), model: z.string(), parameters: z.record(z.string(), z.unknown()), price, expiresAt: integer });
const requestSchema = z.object({ id: z.uuid(), quoteId: z.uuid().optional(), status: z.enum(['queued', 'submitting', 'running', 'cancelling', 'reconciling', 'succeeded', 'failed', 'cancelled']) });
const outputSchema = z.object({ url: z.string().max(2048), kind: z.enum(['image', 'video', 'audio']), mimeType: z.string().max(100), sha256: z.string().regex(/^[0-9a-f]{64}$/i), authentication: z.literal('Bearer') });
const resultSchema = requestSchema.extend({ outputs: z.array(outputSchema).min(1).max(8) });
export type MediaOutput = z.infer<typeof outputSchema>;
const mediaTypes: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' };

async function request(path: string, key: string, fetcher: typeof fetch, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try { response = await fetcher(`${base}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30_000), redirect: 'error' }); }
  catch { throw new ApiFailure('provider_unreachable', 'Attelier could not be reached. An admitted request may still be running.', 502); }
  if (!response.ok) {
    void response.body?.cancel();
    throw new ApiFailure('provider_request_failed', `Attelier returned HTTP ${response.status}. Check provider access, credit and model configuration.`, 502);
  }
  return response;
}

async function readBytes(response: Response, limit: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new ApiFailure('invalid_provider_response', 'Attelier returned no content.', 502);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new ApiFailure('provider_response_too_large', 'Attelier exceeded the supported download size.', 502); }
      chunks.push(next.value);
    }
    return new Uint8Array(Buffer.concat(chunks));
  } finally { reader.releaseLock(); }
}

async function json<T>(schema: z.ZodType<T>, path: string, key: string, fetcher: typeof fetch, init?: RequestInit): Promise<T> {
  try { return schema.parse(JSON.parse(Buffer.from(await readBytes(await request(path, key, fetcher, init), 2 * 1024 * 1024)).toString())); }
  catch (error) { if (error instanceof ApiFailure) throw error; throw new ApiFailure('invalid_provider_response', 'Attelier returned an unsupported response.', 502); }
}

function outputPath(taskId: string, output: MediaOutput): string {
  const url = new URL(output.url, base);
  if (!z.uuid().safeParse(taskId).success || url.origin !== base || url.username || url.password || url.pathname !== `/v1/requests/${taskId}/content` || !mediaTypes[output.mimeType] || !output.mimeType.startsWith(`${output.kind}/`)) {
    throw new ApiFailure('invalid_provider_response', 'Attelier returned an unsupported media location or format.', 502);
  }
  return `${url.pathname}${url.search}`;
}

export function createAttelierExecutor(config: Config, fetcher: typeof fetch = fetch, runtime = { now: Date.now, sleep: (ms: number) => sleep(ms) }): JobExecutor {
  return async (input, context) => {
    const key = config.attelierApiKey;
    const model = config.attelierModel;
    if (!key || !model) throw new ApiFailure('provider_unavailable', 'Configure the Attelier key and model first.', 503);
    if (!context?.onProviderQuoteCreated || !context.onProviderTaskCreated || !z.uuid().safeParse(context.jobId).success) throw new ApiFailure('job_context_required', 'Media generation requires a persisted job.', 500);
    const catalog = await json(z.object({ data: z.array(z.object({ id: z.string(), available: z.boolean() })).max(5000) }), '/v1/models', key, fetcher);
    if (!catalog.data.some(item => item.id === model && item.available)) throw new ApiFailure('model_unavailable', 'The configured Attelier model is not currently available.', 503);
    const parameters = { ...config.attelierParameters, prompt: input.prompt };
    const quote = await json(quoteSchema, '/v1/quotes', key, fetcher, { method: 'POST', body: JSON.stringify({ model, parameters, fallback: false }) });
    const maximum = 'maximumMicros' in quote.price ? quote.price.maximumMicros : quote.price.amountMicros;
    if (maximum > config.attelierMaxUsdMicros || quote.expiresAt <= runtime.now() || quote.model !== model || !isDeepStrictEqual(quote.parameters, parameters)) throw new ApiFailure('provider_quote_rejected', 'The media quote exceeds the spending limit, expired, or changed the requested configuration.', 422);
    context.onProviderQuoteCreated(quote.id);
    const admitted = await json(requestSchema, '/v1/requests', key, fetcher, { method: 'POST', headers: { 'Idempotency-Key': context.jobId }, body: JSON.stringify({ quoteId: quote.id }) });
    context.onProviderTaskCreated(admitted.id);
    if (admitted.quoteId && admitted.quoteId !== quote.id) throw new ApiFailure('invalid_provider_response', 'The media request returned a different quote.', 502);
    const deadline = runtime.now() + 600_000;
    let status = admitted;
    while (runtime.now() < deadline) {
      if (status.id !== admitted.id || (status.quoteId && status.quoteId !== quote.id)) throw new ApiFailure('invalid_provider_response', 'The media status returned a different request.', 502);
      if (status.status === 'failed' || status.status === 'cancelled') throw new ApiFailure('generation_failed', `Attelier reported ${status.status}. Your quest reservation is released.`, 502);
      if (status.status === 'succeeded') {
        const result = await json(resultSchema, `/v1/requests/${admitted.id}/result`, key, fetcher);
        if (result.id !== admitted.id || result.status !== 'succeeded' || (result.quoteId && result.quoteId !== quote.id)) throw new ApiFailure('invalid_provider_response', 'The media result did not match the completed request.', 502);
        for (const output of result.outputs) outputPath(admitted.id, output);
        return { title: 'Attelier creation', text: `${result.outputs.length} media output(s) generated with ${model}.`, providerTaskId: admitted.id,
          mediaOutputs: result.outputs,
          blocks: [{ type: 'media', items: result.outputs.map((output, index) => ({ title: `${output.kind} ${index + 1}`, url: `/v1/jobs/${context.jobId}/files/media/${index}`, kind: output.kind, mimeType: output.mimeType })) }] };
      }
      await runtime.sleep(3000);
      status = await json(requestSchema, `/v1/requests/${admitted.id}`, key, fetcher);
    }
    throw new ApiFailure('generation_timeout', `Attelier request ${admitted.id} is still unresolved after ten minutes. Do not resubmit automatically.`, 502);
  };
}

export async function downloadAttelierResult(config: Config, taskId: string, raw: MediaOutput, fetcher: typeof fetch = fetch): Promise<Response> {
  if (!config.attelierApiKey) throw new ApiFailure('provider_unavailable', 'Media downloads are not configured.', 503);
  const output = outputSchema.parse(raw);
  const response = await request(outputPath(taskId, output), config.attelierApiKey, fetcher);
  if (response.headers.get('content-type')?.split(';')[0].trim() !== output.mimeType) {
    void response.body?.cancel();
    throw new ApiFailure('invalid_provider_response', 'The media content type changed.', 502);
  }
  const bytes = await readBytes(response, 64 * 1024 * 1024);
  if (createHash('sha256').update(bytes).digest('hex') !== output.sha256.toLowerCase()) throw new ApiFailure('media_integrity_failed', 'The downloaded media does not match its published hash.', 502);
  return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': output.mimeType, 'Content-Disposition': `attachment; filename="creation.${mediaTypes[output.mimeType]}"`, 'Content-Length': String(bytes.length), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
