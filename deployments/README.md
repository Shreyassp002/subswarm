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

The Git repository is https://github.com/Shreyassp002/subswarm. Connect it in
the existing Vercel project's Git settings and select `main` as the production
branch. Pushes to `main` then publish the frontend automatically; AWS backend
releases remain separate. The Vercel GitHub app must have access to this private
repository before automatic deployment can start.

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

The deployment keeps test-TAO deposits disabled. Connecting a wallet and
signing a login message work independently of deposits. The API holds only
the deposit receiver's public address, not a fund-owning private key.

Configured provider adapters still need funded or free-credit request checks.
ChronoSeek requires gateway access; Attelier requires a selected model;
404-GEN image URLs require an approved host allowlist. EveryFrame and Ridges
remain external links. Deployment does not imply these integrations have
passed live execution checks. No mainnet transactions are enabled.
