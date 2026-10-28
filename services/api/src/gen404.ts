import { lookup } from 'node:dns/promises';
import { get } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import type { Config } from './config.js';
import { ApiFailure } from './errors.js';
import type { JobExecutor } from './providers.js';

const baseUrl = 'https://api.dns.404.xyz';
const maxImageBytes = 8 * 1024 * 1024;
const maxResultBytes = 32 * 1024 * 1024;
const taskSchema = z.object({ id: z.uuid() });
const statusSchema = z.object({ status: z.string().regex(/^(NoResult|InProgress|Success|Failure|PartialResult\(\d+\))$/) });
const deniedAddresses = new BlockList();
for (const [network, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) {
  deniedAddresses.addSubnet(network, prefix, 'ipv4');
}

function checkResponse(response: Response): void {
  if (response.ok) return;
  void response.body?.cancel();
  const message = response.status === 401 || response.status === 403 ? '404-GEN rejected its configured API key.'
    : response.status === 402 ? 'The 404-GEN account has no available credit.'
      : response.status === 429 ? '404-GEN is rate limited. Try again later.'
        : `404-GEN returned HTTP ${response.status}.`;
  throw new ApiFailure('provider_request_failed', message, 502);
}

async function readBytes(response: Response, limit: number): Promise<Uint8Array> {
  checkResponse(response);
  const reader = response.body?.getReader();
  if (!reader) throw new ApiFailure('invalid_provider_response', '404-GEN returned an empty response.', 502);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ApiFailure('provider_response_too_large', 'The 404-GEN response exceeded the supported download size.', 502);
      }
      chunks.push(value);
    }
    if (!size) throw new ApiFailure('invalid_provider_response', '404-GEN returned an empty response.', 502);
    return new Uint8Array(Buffer.concat(chunks));
  } finally {
    reader.releaseLock();
  }
}

async function request(path: string, key: string, options: RequestInit, fetcher: typeof fetch, timeout = 30_000): Promise<Response> {
  try {
    return await fetcher(`${baseUrl}${path}`, { ...options, headers: { ...options.headers, 'x-api-key': key }, redirect: 'error', signal: AbortSignal.timeout(timeout) });
  } catch {
    throw new ApiFailure('provider_unreachable', '404-GEN could not be reached. An admitted task may still be running; do not resubmit automatically.', 502);
  }
}

async function requestJson<T>(schema: z.ZodType<T>, path: string, key: string, options: RequestInit, fetcher: typeof fetch, timeout?: number): Promise<T> {
  const response = await request(path, key, options, fetcher, timeout);
  try {
    const bytes = await readBytes(response, 64 * 1024);
    return schema.parse(JSON.parse(Buffer.from(bytes).toString('utf8')));
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure('invalid_provider_response', '404-GEN returned an invalid response.', 502);
  }
}

export async function load404Image(value: string, origins: string[], resolveHost: typeof lookup = lookup, requestImage: typeof get = get): Promise<{ bytes: Uint8Array; contentType: string }> {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !origins.includes(url.origin)) {
    throw new ApiFailure('image_origin_not_allowed', 'This image host is not enabled. Use an HTTPS image from a server-approved origin.', 422);
  }
  const addresses = await resolveHost(url.hostname, { all: true, family: 4 }).catch(() => {
    throw new ApiFailure('image_unreachable', 'The image host could not be resolved.', 422);
  });
  if (!addresses.length || addresses.some(({ address }) => isIP(address) !== 4 || deniedAddresses.check(address, 'ipv4'))) {
    throw new ApiFailure('image_origin_not_allowed', 'The image host must resolve to a public IPv4 address.', 422);
  }
  const address = addresses[0].address;
  return new Promise((resolve, reject) => {
    const req = requestImage(url, {
      signal: AbortSignal.timeout(20_000),
      family: 4,
      lookup: (_host, _options, callback) => callback(null, address, 4),
      headers: { Accept: 'image/png,image/jpeg' },
    }, (response) => {
      const contentType = response.headers['content-type']?.split(';')[0].trim();
      if (response.statusCode !== 200 || !['image/png', 'image/jpeg'].includes(contentType ?? '')) {
        response.destroy();
        reject(new ApiFailure('invalid_image', 'The image URL must return a PNG or JPEG directly without a redirect.', 422));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxImageBytes) {
          response.destroy();
          reject(new ApiFailure('image_too_large', 'Reference images must be at most 8 MiB.', 422));
        } else chunks.push(chunk);
      });
      response.on('error', () => reject(new ApiFailure('image_unreachable', 'The image download could not finish.', 422)));
      response.on('end', () => {
        const bytes = Buffer.concat(chunks);
        const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
        if ((contentType === 'image/png' && !png) || (contentType === 'image/jpeg' && !jpeg)) {
          reject(new ApiFailure('invalid_image', 'The image bytes do not match the declared PNG or JPEG format.', 422));
          return;
        }
        resolve({ bytes: new Uint8Array(bytes), contentType: contentType! });
      });
    });
    req.on('error', () => reject(new ApiFailure('image_unreachable', 'The image host could not be reached.', 422)));
  });
}

export function create404Executor(config: Config, fetcher: typeof fetch = fetch, runtime = { now: Date.now, sleep: (ms: number) => sleep(ms), loadImage: load404Image }): JobExecutor {
  return async (input, context) => {
    const key = config.gen404ApiKey;
    if (!key) throw new ApiFailure('provider_unavailable', 'A server-side 404-GEN API key is required.', 503);
    if (!context || !z.uuid().safeParse(context.jobId).success) throw new ApiFailure('job_context_required', '404-GEN requires a persisted job before submission.', 500);
    const model = input.model ?? '404-3dgs';
    let options: RequestInit;
    if (input.inputImageUrl) {
      const image = await runtime.loadImage(input.inputImageUrl, config.gen404ImageOrigins ?? []);
      const form = new FormData();
      form.append('image', new Blob([new Uint8Array(image.bytes)], { type: image.contentType }), image.contentType === 'image/png' ? 'reference.png' : 'reference.jpg');
      form.append('model', model);
      options = { method: 'POST', body: form };
    } else {
      options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: input.prompt, model }) };
    }
    const task = await requestJson(taskSchema, '/add_task', key, options, fetcher);
    context.onProviderTaskCreated?.(task.id);
    const deadline = runtime.now() + 180_000;
    while (runtime.now() < deadline) {
      const status = await requestJson(statusSchema, `/get_status?id=${encodeURIComponent(task.id)}`, key, {}, fetcher, Math.min(30_000, Math.max(1, deadline - runtime.now())));
      if (status.status === 'Failure') throw new ApiFailure('generation_failed', '404-GEN reported that generation failed.', 502);
      if (status.status === 'Success') {
        const format = model === '404-mesh' ? 'glb' : 'spz';
        return {
          title: '404-GEN 3D asset', providerTaskId: task.id,
          text: `404-GEN reports that the ${model} task completed. Download the ${format.toUpperCase()} file from this job. Provider task: ${task.id}`,
          blocks: [{ type: 'files', items: [{ title: `Download ${format.toUpperCase()}`, url: `/v1/jobs/${context.jobId}/files/model`, format }] }],
        };
      }
      await runtime.sleep(Math.min(3000, Math.max(0, deadline - runtime.now())));
    }
    throw new ApiFailure('generation_timeout', `404-GEN did not complete within three minutes. Provider task ${task.id} may still be running; do not resubmit automatically.`, 502);
  };
}

export async function download404Result(config: Config, taskId: string, model: '404-3dgs' | '404-mesh', fetcher: typeof fetch = fetch): Promise<Response> {
  if (!config.gen404ApiKey) throw new ApiFailure('provider_unavailable', '404-GEN downloads are not configured.', 503);
  if (!z.uuid().safeParse(taskId).success || !['404-3dgs', '404-mesh'].includes(model)) throw new ApiFailure('invalid_download', 'The stored download reference is invalid.', 422);
  try {
    const response = await request(`/get_result?id=${encodeURIComponent(taskId)}`, config.gen404ApiKey, {}, fetcher);
    const bytes = await readBytes(response, maxResultBytes);
    const format = model === '404-mesh' ? 'glb' : 'spz';
    return new Response(new Uint8Array(bytes), { headers: {
      'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="model.${format}"`,
      'Content-Length': String(bytes.byteLength), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure('download_failed', 'The 404-GEN asset download did not complete. Try downloading again.', 502);
  }
}
