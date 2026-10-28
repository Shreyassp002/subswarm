import { resolve } from 'node:path';
import { z } from 'zod';

export interface Config {
  port: number;
  webOrigin: string;
  databasePath: string;
  btcliBin: string;
  saygmApiKey?: string;
  saygmModel?: string;
  chutesApiKey?: string;
  chutesModel?: string;
  desearchApiKey?: string;
  chronoseekUrl?: string;
  chronoseekApiKey?: string;
  maxConcurrentJobs: number;
  maxDailyRequests: number;
  maxPaidDailyRequests: number;
  maxPaidConcurrentJobs: number;
}

const positiveInteger = (value: string | undefined, fallback: number, max: number) =>
  z.coerce.number().int().min(1).max(max).parse(value ?? fallback);

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const origin = new URL(env.WEB_ORIGIN ?? 'http://localhost:3000');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== (env.WEB_ORIGIN ?? 'http://localhost:3000')) {
    throw new Error('WEB_ORIGIN must be an exact http or https origin without a trailing slash.');
  }
  const chronoseekUrl = env.CHRONOSEEK_URL?.trim() || undefined;
  if (chronoseekUrl && !['http:', 'https:'].includes(new URL(chronoseekUrl).protocol)) {
    throw new Error('CHRONOSEEK_URL must use http or https.');
  }
  return {
    port: positiveInteger(env.PORT, 4100, 65535),
    webOrigin: origin.origin,
    databasePath: env.DATABASE_PATH ?? resolve('data/subswarm.sqlite'),
    btcliBin: env.BTCLI_BIN ?? 'btcli',
    saygmApiKey: env.SAYGM_API_KEY?.trim() || undefined,
    saygmModel: env.SAYGM_MODEL?.trim() || undefined,
    chutesApiKey: env.CHUTES_API_KEY?.trim() || undefined,
    chutesModel: env.CHUTES_MODEL?.trim() ? z.string().max(256).parse(env.CHUTES_MODEL.trim()) : undefined,
    desearchApiKey: env.DESEARCH_API_KEY?.trim() || undefined,
    chronoseekUrl,
    chronoseekApiKey: env.CHRONOSEEK_API_KEY?.trim() || undefined,
    maxConcurrentJobs: positiveInteger(env.MAX_CONCURRENT_JOBS, 2, 10),
    maxDailyRequests: positiveInteger(env.MAX_DAILY_REQUESTS, 40, 1000),
    maxPaidDailyRequests: positiveInteger(env.MAX_PAID_DAILY_REQUESTS, 20, 1000),
    maxPaidConcurrentJobs: positiveInteger(env.MAX_PAID_CONCURRENT_JOBS, 2, 10),
  };
}
