import { parseArgs } from 'node:util';
import { calculatePrice } from '../src/pricing.js';

try {
  const { values } = parseArgs({ options: {
    'provider-cost-micros': { type: 'string' }, 'overhead-micros': { type: 'string', default: '0' },
    'tao-usd-micros': { type: 'string' }, 'success-bps': { type: 'string' }, 'margin-bps': { type: 'string' },
  } });
  if (!values['provider-cost-micros'] || !values['tao-usd-micros'] || !values['success-bps'] || !values['margin-bps']) throw new Error('Supply --provider-cost-micros, --tao-usd-micros, --success-bps and --margin-bps.');
  const assumptions = { providerCostMicros: values['provider-cost-micros'], overheadMicros: values['overhead-micros']!, taoUsdMicros: values['tao-usd-micros'], successBps: Number(values['success-bps']), marginBps: Number(values['margin-bps']) };
  console.log(JSON.stringify({ assumptions, ...calculatePrice(assumptions), note: 'Planning only. Assumes every attempt incurs the supplied cost, including failures. Include retention costs for storage. Test TAO has no redemption value. No config changes or network calls.' }, null, 2));
} catch (error) { console.error(error instanceof Error ? error.message : 'Invalid pricing assumptions.'); process.exitCode = 1; }
