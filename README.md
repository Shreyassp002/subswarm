# Subswarm

A workspace and a playable world for discovering Bittensor services, submitting
requests, and keeping useful outputs in one shared library.

Live site: https://subswarm.vercel.app

Deployment and operations: [AWS API and static Vercel frontend](deployments/README.md).

## Run locally

Use Node.js 22 or newer and npm. From the repository root:

```bash
npm ci
cp apps/web/.env.example apps/web/.env.local
cp services/api/.env.example services/api/.env
```

Start these in separate terminals:

```bash
npm run dev:api
npm run dev
```

Landing: `http://localhost:3000/`. Workspace: `http://localhost:3000/app/`.
Village: `http://localhost:3000/village/`. API: `http://localhost:4100`.
Local environment files are already prepared in this checkout.

Walk with WASD, arrows, or click a destination. Select a district sign or press
E near its entrance. The directory, task details, and journal open on demand.
Three connected neighborhoods fill a 3360 by 1888 world with an original
evening background, open paths, clickable buildings, collision-aware walking,
registered residents and an open fountain plaza.
Use FIT to toggle the whole-map view; small screens follow the player.
The Map menu provides keyboard-accessible access to every district.

## Two ways to use Subswarm

The landing and professional workspace share a blue, white, pink and yellow
visual identity. The village retains its separate pixel-art theme. Both use the
same API session, provider catalogue, request forms, wallet and saved outputs.
Switching modes does not create a second account or payment balance.

The workspace supports subnet search by name, number or capability, category
filters, connection status, provider-specific inputs, participant rosters,
request progress, private outputs, file controls, wallet activity and receipt
recovery. The village directory has the same search. Provider deep links use
`/app/?subnet=chutes` or `/village/?subnet=chutes`.

The directory covers the integrated catalogue, not every Bittensor subnet.
Connected status means configured, not a guarantee of provider credit or uptime.
External-only integrations remain labelled. Decorative landing animation does
not represent live traffic or provider location.

## Integration status

| District | Implemented access | Configuration |
| --- | --- | --- |
| Network Explorer | Read-only testnet scans | Official `btcli` executable |
| SayGM | Text-generation adapter | `SAYGM_API_KEY`, optional `SAYGM_MODEL` |
| Desearch | Web-search adapter | `DESEARCH_API_KEY` |
| ChronoSeek | Video-search adapter | Reachable `CHRONOSEEK_URL`, optional key |
| Chutes | Text-generation adapter | `CHUTES_API_KEY`, optional `CHUTES_MODEL` |
| 404-GEN | Text/image to SPZ or image to GLB | `GEN404_API_KEY`, image host allowlist |
| Attelier | Quote-bounded image/video/audio generation | Inference key, model ID and model parameters |
| Hippius | Private small files with seven-day storage, download and delete | S3 key pair and existing private bucket |
| EveryFrame | External studio link | No documented customer generation API |
| Ridges | External coding service link | Documented API requires Base mainnet payments |

Keys belong only in `services/api/.env`. No provider account is assumed to have
free credit. Authenticated provider calls have not been verified without keys.
Each house has Quest and Residents tabs. Its roster is read from that provider's
configured network and subnet. Search by UID, hotkey or role, or click a resident
in the world. Registry reads have a separate refresh budget and do not spend
your daily quest allowance.

Registered residents are chain participants, not evidence that a miner served
a request or won a competition. Character animation never fabricates results.

## Quests and testnet payments

Each house presents the provider's supported input fields. Results render as
text, search links, video time ranges, downloadable 3D files, media previews,
private stored files, or a participant roster. Jobs and outputs persist in the journal. Animated couriers gather when
a request runs; they are decorative and do not imply miners competed for it.

Paid quests use a prepaid service balance denominated in test TAO. Connect a
Talisman, SubWallet or Polkadot.js extension wallet, sign a login message, review a testnet deposit,
then confirm a fixed quote for a request. The service reserves that quote
atomically, charges after saving a successful result, and releases it on
failure. The operator separately supplies provider API credits. Providers do
not automatically accept TAO. The live demo uses operator-funded SayGM and
Desearch credits, with test TAO used only for the request payment flow.

Run `npm run prepare:testnet --workspace @subswarm/api` to prepare a dedicated
local receiver, verify testnet genesis and set a deposit start block plus default
quest prices. It never submits a transaction or enables payments. Back up the
ignored `.runtime/wallets/testnet-receiver.json` privately. Deposits stay disabled
until the operator activates payments after configuring provider access. No mainnet transactions are supported.
The wallet selector opens only the chosen extension and preserves its identity for
signing deposits. Account access is checked again before signing. Missing
extensions link to their official installation sites. Connecting does not require
TAO; a deposit requires test TAO for its amount, fee and account keep-alive balance.

This application needs fund-owning accounts (coldkeys in Bittensor terminology),
not miner or validator hotkeys. Keep the operator deposit receiver separate from
the browser demo account. The API needs only the receiver's public address and
verifies finalized transfers without its signing key. A coldkey imported into a
browser extension is an online wallet, not offline cold storage.

Unused credit remains in the service balance; on-chain withdrawals are not
implemented. Wallet signatures and funded deposits still need a live browser
check with a test account before public activation. See the
[API payment setup](services/api/README.md#testnet-payment-setup).

## Chain tooling

The API uses the official Bittensor CLI, not a custom chain codec. Install it in
an isolated environment and set `BTCLI_BIN` to its executable if needed:

```bash
uv venv .runtime/btcli
uv pip install --python .runtime/btcli/bin/python bittensor==11.3.0
```

Only fixed, allowlisted read-only queries are issued. A registry scan needs no wallet, chain transaction, new subnet, or hosted
inference fleet. Optional prepaid quest payments use a browser wallet on testnet.

## Workspaces

```text
apps/web          Static Next.js frontend and client-only Phaser world
services/api      Hono Node API, provider requests, SQLite persistence
packages/shared   TypeScript API contracts
```

## Build and check

```bash
npm run build
npm run typecheck
npm run check:setup --workspace @subswarm/api
npm run lint --workspace @subswarm/web
npm test --workspace @subswarm/api
```

The web build exports `apps/web/out`; host those as static files. No frontend
Functions or server actions are used. Run the Node API separately and persist
its `data/` directory. One API process owns this SQLite-backed job runner.

Set `WEB_ORIGIN` to the frontend's exact origin. Set `NEXT_PUBLIC_API_URL` before
building the frontend. Keep both services on the same site when deploying so
sessions do not depend on third-party cookies.

See [third-party notices](THIRD_PARTY_NOTICES.md) for reused code and artwork.


The public demo tariff for SayGM and Desearch is 0.000001 test TAO per completed request, a demonstration price
rather than a real-value exchange rate. New Hippius files include seven days
of storage with automatic expiry cleanup. See the API README for the offline
cost calculator, failed-request economics and setup report. Provider credentials,
account access, live provider/wallet verification and deployment remain separate
from local implementation checks. EveryFrame and Ridges remain external services
until compatible customer access is available.


## Sponsored first request

The public demo grants 1,000 rao of internal request credit once per verified
wallet, enough for one completed SayGM or Desearch request at the current demo
price. No on-chain TAO or network fee is needed for that first request. The
wallet must sign its login challenge; a supplied address alone earns nothing.
Credits appear as `Sponsored demo credit`, separately from real deposits.
Reconnects, new browser sessions, alternate SS58 encodings and restarts do not
reissue the grant. Failed requests release the reservation for another attempt.

`TAO_DEMO_CREDIT_RAO=1000` and `DEMO_MAX_DAILY_WALLETS=20` enable this demo
allocation. Zero credit disables it. At most 20 wallets are credited per UTC day;
the separate shared provider cap remains 20 attempts per UTC day. This is a
wallet-level demo allowance, not proof that wallets belong to distinct people.
After the credit is spent, users may add a small prepaid test-TAO balance.
