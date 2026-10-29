import { MAX_RAO } from './payments.js';

export interface PricingAssumptions {
  providerCostMicros: string;
  overheadMicros: string;
  taoUsdMicros: string;
  successBps: number;
  marginBps: number;
}

const amount = (value: string): bigint => {
  if (!/^(0|[1-9][0-9]{0,19})$/.test(value) || BigInt(value) > MAX_RAO) throw new Error('Costs and exchange rate must be bounded integer USD micros.');
  return BigInt(value);
};
const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d;

export function calculatePrice(input: PricingAssumptions) {
  const cost = amount(input.providerCostMicros) + amount(input.overheadMicros);
  const exchange = amount(input.taoUsdMicros);
  if (cost === 0n || exchange === 0n) throw new Error('Total cost and exchange rate must be positive.');
  if (!Number.isInteger(input.successBps) || input.successBps < 1 || input.successBps > 10000) throw new Error('Success rate must be 1 through 10000 basis points.');
  if (!Number.isInteger(input.marginBps) || input.marginBps < 0 || input.marginBps >= 10000) throw new Error('Gross margin must be 0 through 9999 basis points.');
  const success = BigInt(input.successBps);
  const retained = BigInt(10000 - input.marginBps);
  const priceRao = ceil(cost * 10000n * 10000n * 1000000000n, success * retained * exchange);
  if (priceRao > MAX_RAO) throw new Error('Calculated price exceeds the supported rao amount.');
  return { priceRao: priceRao.toString(), costPerSuccessMicros: ceil(cost * 10000n, success).toString(), targetRevenueMicros: ceil(cost * 10000n * 10000n, success * retained).toString() };
}
