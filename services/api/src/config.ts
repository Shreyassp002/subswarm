import { resolve } from 'node:path';
import { z } from 'zod';
import { accountId, rao } from './payments.js';
import type { PaymentConfig } from './payments.js';

export interface Config {
  payments?: PaymentConfig;
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
  gen404ApiKey?: string;
  gen404ImageOrigins?: string[];
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
  const pricesRao: Record<string, string> = {};
  for (const id of ['saygm', 'chutes', 'desearch', 'chronoseek', '404gen']) {
    const price = env[`TAO_PRICE_${id.toUpperCase()}_RAO`]?.trim();
    if (price) {
      if (rao(price) === 0n) throw new Error('Paid request prices must be greater than zero.');
      pricesRao[id] = price;
    }
  }
  const receiver = env.TAO_TESTNET_RECEIVER?.trim() || undefined;
  const gen404ImageOrigins = (env.GEN404_IMAGE_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  for (const value of gen404ImageOrigins) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password || url.port || !/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) {
      throw new Error('GEN404_IMAGE_ORIGINS must contain comma-separated exact public HTTPS origins without ports or paths.');
    }
  }
  if (receiver) accountId(receiver);
  if (env.TAO_PAYMENTS_ENABLED && !['true', 'false'].includes(env.TAO_PAYMENTS_ENABLED)) throw new Error('TAO_PAYMENTS_ENABLED must be true or false.');
  return {
    payments: { enabled: env.TAO_PAYMENTS_ENABLED === 'true', receiver, pricesRao,
      startBlock: env.TAO_DEPOSIT_START_BLOCK ? positiveInteger(env.TAO_DEPOSIT_START_BLOCK, 1, 4_294_967_295) : undefined },
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
    gen404ApiKey: env.GEN404_API_KEY?.trim() || undefined,
    gen404ImageOrigins,
    maxConcurrentJobs: positiveInteger(env.MAX_CONCURRENT_JOBS, 2, 10),
    maxDailyRequests: positiveInteger(env.MAX_DAILY_REQUESTS, 40, 1000),
    maxPaidDailyRequests: positiveInteger(env.MAX_PAID_DAILY_REQUESTS, 20, 1000),
    maxPaidConcurrentJobs: positiveInteger(env.MAX_PAID_CONCURRENT_JOBS, 2, 10),
  };
}
