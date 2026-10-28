# API

Hono on Node.js, with SQLite persistence and server-owned provider credentials.
Run `npm run dev:api` from the repository root. Copy `.env.example` to ignored
`.env` for configuration. Default port: 4100.

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/health` | Process liveness |
| GET | `/v1/session` | Create or resume an anonymous cookie session |
| GET | `/v1/providers` | Supported capabilities and configured access |
| GET | `/v1/networks/:network/:netuid` | Read an allowlisted metagraph |
| POST | `/v1/jobs` | Reserve and dispatch a validated request |
| GET | `/v1/jobs` | This session's jobs |
| GET | `/v1/jobs/:id` | This session's job |
| GET | `/v1/artifacts` | This session's saved outputs |

Browser requests include credentials. Mutations require an exact matching
Origin and JSON body. Session tokens are opaque httpOnly cookies; only their
hashes are stored. Client-supplied IDs never grant ownership.

Job reservation and caps are transactional. Completion and its output artifact
are committed together. Interrupted jobs fail after restart rather than
silently repeating potentially billable requests.

Default limits: 40 daily requests and two active jobs per session, plus 20
provider attempts daily and two active provider jobs globally. Failed attempts
count. These are request limits, not a guaranteed USD spending ceiling.

Persist `data/subswarm.sqlite` and its WAL files. This runner supports one API
process, not distributed workers. Anonymous sessions are bounded hackathon
access, not production identity or account recovery. Losing the cookie loses
access to its outputs. Never run concurrent API processes against one database.

See the root README for provider setup and official CLI installation.

## Testnet payment setup

Leave `TAO_PAYMENTS_ENABLED=false` until provider access and the operator's
prepaid-credit policy are ready. Configure only a dedicated Bittensor testnet
receiver under your control, never a mainnet address intended to receive real
value. This service does not need the receiver's private key.

Set `TAO_TESTNET_RECEIVER` to its SS58 address and `TAO_DEPOSIT_START_BLOCK` to
the activation block. Older transfers cannot fund balances. Set each supported
`TAO_PRICE_<PROVIDER>_RAO` to a positive integer price for one request; one TAO
is 1,000,000,000 rao. Prices are fixed per request within its bounded input
limits, not a live TAO/USD exchange rate. Providers without a price cannot run
paid quests. Choose prices and request caps against your actual provider budget.
Only then set `TAO_PAYMENTS_ENABLED=true` and restart the single API process.

Wallet login uses an expiring signed nonce bound to the session and origin.
Deposits credit only successful, finalized native transfers from the verified
wallet to the configured receiver, after the starting block. Genesis is pinned
to testnet, and each transfer event credits once. Balances and quotes use exact
integer rao. Quotes expire after five minutes, bind the normalized inputs and
wallet, and are consumed by exactly one job. Success charges the reservation;
failure or interrupted-job recovery releases it. The operator bears provider
costs when the provider outcome cannot be recovered.

Wallet proof expires after 24 hours. Reconnecting the same wallet recovers its
balance and ledger, but jobs and artifacts remain scoped to the original
cookie session. No withdrawal API or automatic treasury refund exists. This
is prepaid testnet service credit, not a general-purpose custodial wallet.

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/v1/wallet` | Wallet balance and testnet payment settings |
| POST | `/v1/wallet/challenge` | Create a wallet login challenge |
| POST | `/v1/wallet/verify` | Verify the challenge signature |
| POST | `/v1/wallet/disconnect` | Remove the session's wallet binding |
| POST | `/v1/wallet/deposits` | Verify a finalized transfer receipt |
| GET | `/v1/wallet/ledger` | Verified wallet's recent deposits and charges |
| POST | `/v1/quotes` | Quote validated provider inputs |
| POST | `/v1/jobs` | Submit inputs with `quoteId` for paid work |
| GET | `/v1/jobs/:id/files/model` | Owner-only 404-GEN file download |

## Provider-specific execution

SayGM and Chutes accept text with bounded output tokens. Desearch accepts web
queries and result pagination. ChronoSeek needs a reachable gateway and accepts
a public HTTPS video URL, event description and result count. 404-GEN supports
text or image Gaussian splats and image-only meshes through its documented API.

404-GEN task IDs are persisted immediately after admission. Polling stops after
three minutes and never silently resubmits the task. A provider task may remain
running after a timeout; its retained ID allows operator investigation. Image
URLs require exact HTTPS origins in `GEN404_IMAGE_ORIGINS`; private DNS targets,
redirects, oversized images and unsupported content are rejected. Downloads use
server credentials, require the owning session and are capped at 32 MiB.

Attelier, EveryFrame, Hippius and Ridges are discovery-only integrations. Their
media, storage and repository workflows are not represented as working quests.
No API key implies free credits, and configured access is checked against the
provider when a request runs. Live provider results remain unverified until
operator accounts are supplied.
