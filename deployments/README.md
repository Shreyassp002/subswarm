# Deployment

The frontend is a static Next.js export on Vercel. The API, provider jobs and
SQLite database run as one isolated service on AWS. No Vercel Functions,
middleware, server actions or hosted database are required.

## Current endpoints

- Site: https://subswarm.vercel.app
- Backend: https://subswarm.15-135-178-84.sslip.io
- Health: https://subswarm.15-135-178-84.sslip.io/health

Vercel's static configuration forwards `/v1/*` to AWS. Browser sessions use
the site's origin, so they do not require third-party cookies. Normal Vercel
CDN, request and bandwidth usage still applies.

## Frontend releases

Use the existing owner's Vercel project `subswarm`. Verify `vercel whoami` and
the linked project's team before deploying. Do not create a project in a
different account. The local `.vercel` directory is ignored.

The existing Vercel project is connected to
https://github.com/Shreyassp002/subswarm with `main` as its production branch.
Pushes to `main` publish the frontend automatically; AWS backend releases remain
separate. Keep the Vercel GitHub app authorized for this private repository.

The root `vercel.json` supports a source build with `NEXT_PUBLIC_API_URL=/`.
It installs only frontend and shared workspace dependencies. Node.js is pinned
to the same major version used for local builds.
The initial release instead uploaded only the locally built static output:

```bash
NEXT_PUBLIC_API_URL=/ npm run build --workspace @subswarm/web
```

Stage `apps/web/out` in an ignored release directory. Copy the existing
`.vercel/project.json` there. Use the root configuration's rewrites with
`framework: null`, `buildCommand: null`, `installCommand: null` and
`outputDirectory: "."` in the staged `vercel.json`. Deploy that directory with
`vercel deploy <directory> --prod --scope <verified-owner-team>`.

Only static files and routing configuration belong in this upload. Provider
keys, API source, SQLite files and wallet material never belong there.

## AWS service

The dedicated `subswarm` user runs `subswarm-api.service`, listening on
`127.0.0.1:4500`. Caddy terminates HTTPS and forwards API requests. Add only
the host block in `aws/Caddyfile` to the shared configuration; never replace
existing host blocks. Validate the complete configuration before a graceful
Caddy reload.

| Path | Purpose |
| --- | --- |
| `/opt/subswarm/releases/<release>` | Versioned application files |
| `/opt/subswarm/current` | Active release symlink |
| `/opt/subswarm/btcli/bin/btcli` | Isolated Bittensor CLI 11.3.0 |
| `/etc/subswarm/api.env` | Root-only runtime environment |
| `/var/lib/subswarm/subswarm.sqlite` | Persistent application database |
| `/var/lib/subswarm/backups` | Daily SQLite snapshots |
| `/var/cache/subswarm` | Service-owned caches |

Build `@subswarm/api` locally. A backend release contains root package and
lockfiles, `services/api/package.json`, `services/api/dist`, the shared
workspace manifest and source, and `deployments/aws`. Install production
dependencies on the instance so native SQLite matches its ARM architecture:

```bash
npm ci --omit=dev --workspace @subswarm/api --workspace @subswarm/shared --no-audit --no-fund
```

Keep credentials outside releases. Set `PORT=4500`,
`WEB_ORIGIN=https://subswarm.vercel.app`,
`DATABASE_PATH=/var/lib/subswarm/subswarm.sqlite`, and the absolute `BTCLI_BIN`.
Update the release symlink and restart only `subswarm-api.service`. Check its
status and HTTPS health. Roll back the symlink if a release fails; database
schema compatibility must be checked before rolling back application code.

Environment changes require restarting this service. Do not run a second
API against an independent database copy using the same storage bucket:
retention jobs could delete files still referenced by the other copy.

## Backups and recovery

`subswarm-backup.timer` runs daily at 03:30 UTC with up to five minutes of
jitter. The SQLite backup API creates consistent snapshots and retains seven.
These snapshots are on the same instance, not off-instance disaster recovery.

To restore, stop only `subswarm-api.service`, preserve the current database
and its WAL/SHM companions, and copy a selected snapshot into the database
path. Restore ownership to `subswarm` with mode 600, then restart the service.
Never overlay a snapshot while SQLite is running.

```bash
sudo systemctl status subswarm-api.service
sudo systemctl list-timers subswarm-backup.timer
sudo systemctl start subswarm-backup.service
sudo journalctl -u subswarm-api.service --since '10 minutes ago'
```

Review logs locally without publishing credentials or user content.

## Activation boundaries

The public demo enables test-TAO deposits and SayGM, Desearch, BitMind, Zeus and Ditto requests.
Each completed request costs 1,000 rao (0.000001 test TAO). SayGM uses
`gpt-oss-20b`, with a default output limit of 256 tokens. The shared limit remains
20 provider attempts per UTC day and two concurrent provider jobs to protect
prepaid API credits. These limits apply to all visitors combined, including failed
attempts. The API holds only the receiver's public address, never its private key.

Only activated providers have `TAO_PRICE_<PROVIDER>_RAO` set. When payments
are enabled, a provider without a price remains unavailable even if its key
exists. To activate another integration, verify its access and credit, configure
its required settings and a positive test-TAO price, then restart only the API.
Keep unverified provider credentials private without enabling their prices.

The public allowlist is `network,saygm,desearch,bitmind,zeus,ditto`.
Set `BITMIND_API_KEY`, `ZEUS_API_KEY`, `DITTO_MCP_API_KEY`, `DITTO_SPACE` and
`TAO_PRICE_BITMIND_RAO`, `TAO_PRICE_ZEUS_RAO`, `TAO_PRICE_DITTO_RAO` on AWS.
Ditto requires a dedicated storage space; do not use `main`. Zeus free keys use
the free API host automatically. Unverified integrations and external-only links
are omitted from the public catalogue. Historical jobs and downloads remain.
No mainnet transactions are enabled.


## Sponsored first request

After connecting, users click `Claim free request` to receive 1,000 rao of internal
request credit once per verified wallet, enough for one completed SayGM or Desearch
request at the current demo price. No on-chain TAO or network fee is needed for
that first request. Connecting never grants credit automatically. The wallet must sign its login challenge; a supplied address alone earns nothing.
Credits appear as `Sponsored demo credit`, separately from real deposits.
Reconnects, new browser sessions, alternate SS58 encodings and restarts do not
reissue the grant. Failed requests release the reservation for another attempt.

`TAO_DEMO_CREDIT_RAO=1000` and `DEMO_MAX_DAILY_WALLETS=20` enable this demo
allocation. Zero credit disables it. At most 20 wallets are credited per UTC day;
the separate shared provider cap remains 20 attempts per UTC day. This is a
wallet-level demo allowance, not proof that wallets belong to distinct people.
After the credit is spent, users may add a small prepaid test-TAO balance.

Claims use authenticated `POST /v1/wallet/demo-credit` with an empty JSON body.
Repeated claims return the current balance without issuing credit again.
