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

Attelier uses its [inference API](https://docs.attelier.ai/inference/), not the
separate app wallet. Set `ATTELIER_API_KEY`, choose an available model ID from
`GET https://inference.attelier.ai/v1/models`, and set any required model settings
in `ATTELIER_PARAMETERS_JSON`. The quest supplies `prompt`. Prices are checked
before admission against `ATTELIER_MAX_USD_MICROS` (default 1,000,000 = $1).
Fallback routing is disabled. Quote and request identities persist; admission
uses the job ID as its idempotency key. Polling stops after ten minutes. Downloads
are session-owned, restricted to request-bound provider URLs, capped at 64 MiB,
and checked against the provider's SHA-256. Provider billing remains separate
from test-TAO quest accounting. Unsupported output formats fail closed.

Hippius uses the official AWS S3 SDK against `https://s3.hippius.com`, region
`decentralized`, with path-style addressing. Configure `HIPPIUS_ACCESS_KEY_ID`,
`HIPPIUS_SECRET_ACCESS_KEY` and `HIPPIUS_BUCKET` for an existing private bucket.
Use a bucket-scoped provider credential where available. The API stores files
up to 256 KiB at server-assigned job keys; downloads verify the recorded digest.
The owner can delete a file from its result card. Receipts remain in the journal.
New uploads include seven days of storage, disclosed before payment and saved
with the result. The API denies downloads at expiry. A single-process worker
deletes expired objects every minute, pins their recorded version where present,
and retries failures without charging users again. Deletion can be delayed by
provider outages. Previously saved files without an expiry keep their original
until-deleted policy. This is not a backup or an unlimited-retention promise. A lost upload acknowledgement can leave an
unreferenced object at `subswarm/<job-id>`; operators can reconcile these against
failed/interrupted jobs. Do not configure a public-read bucket or lifecycle
policy that contradicts the advertised retention. See [Hippius docs](https://docs.hippius.com/).

EveryFrame and Ridges remain external services. EveryFrame's
[FAQ](https://docs.everyframe.studio/studio/faq/) says there is no public generation
API. Ridges' documented [x402 API](https://docs.ridges.ai/ridgeline/x402) requires
USDC on Base mainnet. Neither limitation is bypassed in this testnet project.
No API key implies free credits, and configured access is checked against the
provider when a request runs. Live provider results remain unverified until
operator accounts are supplied.


| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/v1/jobs/:id/files/media/:index` | Owner-only, hash-verified Attelier media |
| GET | `/v1/jobs/:id/files/storage` | Owner-only Hippius file download |
| POST | `/v1/jobs/:id/files/storage/delete` | Delete an owned file; preserve receipt |

## Local preparation

Run `npm run prepare:testnet --workspace @subswarm/api` from the root. It verifies
the pinned testnet genesis using read-only RPC, prepares an sr25519 receiver in
ignored `.runtime/wallets/testnet-receiver.json` (mode 0600), and updates only
payment fields in the ignored API env. Existing receiver, prices and activation
height are preserved. It refuses to modify an already enabled setup. Default
prices are 1,000,000 rao (0.001 test TAO) per quest, not a USD conversion or a
statement of provider cost. The API never loads the receiver key. No transfer,
provider key provisioning, provider purchase or deployment occurs.

Authenticated provider calls, browser wallet signatures and funded deposits
still require operator access and live verification before public activation.


## Setup status without spending credits

Run `npm run check:setup --workspace @subswarm/api`. It checks local configuration
and the CLI executable. It does not call providers, inspect their balances,
create jobs, touch the database or print credential values. `configured_unverified`
means the required fields exist, not that a provider works. Add credentials only
to the ignored API `.env`, then restart the API when ready for live verification.
Do not enable payments merely because this report shows configured fields.

## Pricing policy

The public demo tariff for SayGM and Desearch is 0.000001 test TAO per completed
request, fixed within each provider's input/output limits. Other providers stay
unavailable until access is verified and a price is activated. New storage quests include seven days and
at most 256 KiB. Test TAO has no redemption value; this tariff demonstrates the
payment flow and does not finance real provider usage. Provider costs come from
the operator's separate credit budget. Request limits cap attempts, not USD cost.
Attelier additionally checks its provider quote against a configured USD ceiling.

For a future real-value service, estimate the full provider cost of an attempt,
including failed attempts, infrastructure overhead and any included storage term.
Use a measured success rate and a chosen gross margin. With cost C, success
fraction p, margin m and TAO price X, revenue per successful quest is C/(p*(1-m));
convert to rao using X and round upward once. Our calculator uses exact integers.
It is a planning tool, not an oracle, exchange or automatic repricing service:

```bash
npm run price:quest --workspace @subswarm/api -- \
  --provider-cost-micros 10000 --overhead-micros 2000 \
  --tao-usd-micros 300000000 --success-bps 9000 --margin-bps 2000
```

These are illustrative assumptions, not current market/provider prices. This
example returns 55,556 rao. One USD is 1,000,000 USD micros. A basis point is
1/10,000. The calculation assumes each attempt incurs the supplied full cost,
including failures, and charges only successes. Change the assumptions using
observed bills; no formula guarantees profitability under unknown costs or
exchange-rate movements. The command never writes env files or submits payments.

Completed means a supported result was saved, not a guarantee of correctness or
satisfaction. A failed or interrupted quest releases the reservation to the
internal balance; it does not send an on-chain refund. Downloads and storage
expiry do not cause additional user charges. Provider billing can still occur
when Subswarm releases a quest reservation, and remains the operator's cost.


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

## Published providers

`PUBLISHED_PROVIDERS` is an explicit allowlist. Public catalogue, quote and job
routes require an allowlisted provider with complete configuration and a request
price. Disabled historical adapters remain available only for existing artifacts.

- BitMind accepts a PNG or JPEG up to 256 KiB. File signatures are checked before sending image bytes to its fixed endpoint; arbitrary remote image fetching is not exposed.
- Zeus selects `free-api.zeussubnet.com` for `free_` keys and the paid host for other keys. Forecasts retain their original timestamps and convert Kelvin to Celsius for display.
- Ditto uses the official MCP SDK and a dedicated `DITTO_SPACE`, never the account's main memory. Save IDs are bound to server-owned jobs. Retrieval and deletion require the same session's completed job; client-supplied memory IDs and arbitrary tool calls are not accepted. Shared-account search and related-memory results are never exposed. Notes are held in platform-managed provider storage, not end-to-end encrypted storage.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/v1/jobs/:id/memory` | Retrieve the owner's saved Ditto note |
| POST | `/v1/jobs/:id/memory/delete` | Delete the provider note and clear local output content |

Deletion retains the request and billing receipt. Failed provider operations do not
settle a reserved request charge. New integrations do not increase the shared
provider request quota.
