import { spawnSync } from 'node:child_process';
import { readConfig } from '../src/config.js';
import { configurationReport } from '../src/readiness.js';

try {
  const config = readConfig();
  const cli = spawnSync(config.btcliBin, ['--version'], { timeout: 5000, stdio: 'ignore' });
  console.log(JSON.stringify(configurationReport(config, cli.status === 0), null, 2));
} catch {
  console.error('Invalid local configuration. Check .env.example for supported URL formats, integer limits and JSON model settings. No credentials were printed.');
  process.exitCode = 1;
}
