# SubSwarm deployment and operations

[Project overview](../README.md) · [API configuration](../services/api/README.md) · [Frontend](../apps/web/README.md)

The frontend is a static Next.js export on Vercel. The API, provider jobs and
SQLite database run as one isolated service on AWS. No Vercel Functions,
middleware, server actions or hosted database are required.

## Current endpoints

Deployment snapshot: 31 October 2026. The live provider response is authoritative for availability.

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
separate. Keep the Vercel GitHub app authorized for this repository.

The root `vercel.json` supports a source build with `NEXT_PUBLIC_API_URL=/`.
It installs only frontend and shared workspace dependencies. Node.js is pinned
to the same major version used for local builds.

<details>
<summary>Optional manual static-output release</summary>

To upload a locally built static export instead of using the normal Git release:

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

</details>

## AWS service

The dedicated `subswarm` user runs `subswarm-api.service`, listening on
`127.0.0.1:4500`. Caddy terminates HTTPS and forwards API requests. Add only
the host block in [aws/Caddyfile](aws/Caddyfile) to the shared configuration; never replace
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


## Sponsored requests and limits

Sponsored credit is an internal ledger allocation, not a transfer of TAO. Users
must verify their wallet and explicitly claim it. The standard 1,000-rao grant
covers one completed request at the current demo tariff. Claims are limited to
20 wallets per UTC day, independently of the shared provider-attempt cap.
Connecting never grants credit automatically.

See the [API payment guide](../services/api/README.md#testnet-payment-setup) for
custody, receipt verification, grant idempotency and the distinction between the
preparation script's defaults and the live demo price.

## Release checks

1. Check the changed component: static frontend, Node API or environment only.
2. Keep API keys and wallet material outside Git, release uploads and the web build.
3. For frontend releases, confirm the intended Vercel project and `/v1/*` rewrite.
4. For backend releases, take a consistent database backup, install native
   dependencies on the target architecture and restart only the SubSwarm service.
5. Confirm `/health`, then read `/v1/providers` through the frontend origin.
   Health indicates process liveness; a provider listed as configured is not a
   credit-balance check or proof that a paid request will succeed.

Read-only release checks do not spend provider credits or test TAO. A paid
smoke request is a separate operation and must fit the approved provider and
wallet budgets. Never turn a deployment check into an automatic series of paid
retries. No mainnet writes are part of this release process.
