import { z } from 'zod';
import type { JobInput } from '@subswarm/shared';
import { ApiFailure } from './errors.js';

const publicVideoUrl = z.string().trim().min(1).max(2048).url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    /^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) &&
    !/\.(localhost|local|internal|test|invalid)$/i.test(url.hostname);
}, 'Use a public HTTPS URL without credentials or a custom port.');

const prompt = z.string().trim().min(1).max(4000);
const chatFields = { prompt, maxTokens: z.number().int().min(1).max(1200).optional() };
const inputSchema = z.discriminatedUnion('providerId', [
  z.object({ providerId: z.literal('attelier'), prompt }).strict(),
  z.object({ providerId: z.literal('hippius'),
    fileName: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9][a-zA-Z0-9._ -]*$/),
    fileBase64: z.string().min(4).max(349528).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
      .refine(value => { const bytes = Buffer.from(value, 'base64'); return bytes.length > 0 && bytes.length <= 256 * 1024 && bytes.toString('base64') === value; }, 'Upload a nonempty file no larger than 256 KiB.'),
  }).strict(),
  z.object({ providerId: z.literal('network'), netuid: z.union([z.literal(298), z.literal(482)]).default(298) }).strict(),
  z.object({ providerId: z.literal('saygm'), ...chatFields }).strict(),
  z.object({ providerId: z.literal('chutes'), ...chatFields }).strict(),
  z.object({ providerId: z.literal('desearch'), prompt, start: z.number().int().min(0).max(100).optional() }).strict(),
  z.object({ providerId: z.literal('chronoseek'), prompt, videoUrl: publicVideoUrl, topK: z.number().int().min(1).max(20).optional() }).strict(),
  z.object({ providerId: z.literal('404gen'), prompt: prompt.optional(), inputImageUrl: publicVideoUrl.optional(), model: z.enum(['404-3dgs', '404-mesh']).default('404-3dgs') }).strict()
    .refine((input) => Boolean(input.prompt) !== Boolean(input.inputImageUrl), 'Supply either a text prompt or an image URL, but not both.')
    .refine((input) => input.model !== '404-mesh' || Boolean(input.inputImageUrl), 'The 404-mesh model requires a reference image.'),
]);

export function parseJobInput(raw: unknown): JobInput {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) throw new ApiFailure('invalid_input', parsed.error.issues[0]?.message ?? 'Invalid job input.', 422);
  return parsed.data;
}
