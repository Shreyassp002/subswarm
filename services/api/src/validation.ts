import { z } from 'zod';
import type { JobInput } from '@subswarm/shared';
import { ApiFailure } from './errors.js';

const publicVideoUrl = z.string().trim().min(1).max(2048).url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    /^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) &&
    !/\.(localhost|local|internal|test|invalid)$/i.test(url.hostname);
}, 'Use a public HTTPS video URL without credentials or a custom port.');

const inputSchema = z.object({
  providerId: z.enum(['network', 'saygm', 'desearch', 'chronoseek', 'chutes', '404gen', 'attelier', 'everyframe', 'hippius', 'ridges']),
  prompt: z.string().trim().min(1).max(4000).optional(),
  videoUrl: publicVideoUrl.optional(),
  netuid: z.number().int().min(0).max(65535).optional(),
}).strict();

export function parseJobInput(raw: unknown): JobInput {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) throw new ApiFailure('invalid_input', parsed.error.issues[0]?.message ?? 'Invalid job input.', 422);
  const input = parsed.data;
  if (input.providerId === 'network') {
    if (input.netuid !== undefined && ![298, 482].includes(input.netuid)) throw new ApiFailure('unsupported_subnet', 'Network scans support testnet subnets 298 and 482.', 422);
    if (input.videoUrl) throw new ApiFailure('invalid_input', 'A network scan does not accept a video URL.', 422);
    return { providerId: input.providerId, netuid: input.netuid ?? 298 };
  }
  if (!input.prompt) throw new ApiFailure('invalid_input', 'A prompt is required for this provider.', 422);
  if (input.providerId === 'chronoseek' && !input.videoUrl) throw new ApiFailure('invalid_input', 'A public HTTPS video URL is required.', 422);
  if (input.providerId !== 'chronoseek' && input.videoUrl) throw new ApiFailure('invalid_input', 'This provider does not accept a video URL.', 422);
  if (input.netuid !== undefined) throw new ApiFailure('invalid_input', 'This provider does not accept a subnet override.', 422);
  return input;
}
