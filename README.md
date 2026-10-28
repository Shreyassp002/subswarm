# Subswarm

A playable world for discovering Bittensor services, submitting requests, and
collecting useful outputs in a persistent journal.

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

Village: `http://localhost:3000`. API: `http://localhost:4100`.
Local environment files are already prepared in this checkout.

Walk with WASD, arrows, or click a destination. Select a district sign or press
E near its entrance. The directory, task details, and journal open on demand.
Three connected neighborhoods fill a 3360 by 1888 world with an original
evening background, open paths, clickable buildings, collision-aware walking,
registered residents and an open fountain plaza.
Use FIT to toggle the whole-map view; small screens follow the player.
The Map menu provides keyboard-accessible access to every district.

## Integration status

| District | Implemented access | Configuration |
| --- | --- | --- |
| Network Explorer | Read-only testnet scans | Official `btcli` executable |
| SayGM | Text-generation adapter | `SAYGM_API_KEY`, optional `SAYGM_MODEL` |
| Desearch | Web-search adapter | `DESEARCH_API_KEY` |
| ChronoSeek | Video-search adapter | Reachable `CHRONOSEEK_URL`, optional key |
| Chutes | Text-generation adapter | `CHUTES_API_KEY`, optional `CHUTES_MODEL` |
| 404-GEN | Text/image to SPZ or image to GLB | `GEN404_API_KEY`, image host allowlist |
| Attelier, EveryFrame, Hippius | Discovery links | Execution not integrated |
| Ridges | Discoverable district | Execution unavailable |

Keys belong only in `services/api/.env`. No provider account is assumed to have
free credit. Authenticated provider calls have not been verified without keys.
Registered residents are chain participants, not evidence that a miner served
a request or won a competition. Character animation never fabricates results.

## Quests and testnet payments

Each house presents the provider's supported input fields. Results render as
text, search links, video time ranges, downloadable 3D files, or a participant
roster. Jobs and outputs persist in the journal. Animated couriers gather when
a request runs; they are decorative and do not imply miners competed for it.

Paid quests use a prepaid service balance denominated in test TAO. Connect a
Substrate extension wallet, sign a login message, review a testnet deposit,
then confirm a fixed quote for a request. The service reserves that quote
atomically, charges after saving a successful result, and releases it on
failure. The operator separately supplies provider API credits. Providers do
not automatically accept TAO, and no provider credits have been provisioned
in this checkout.

Deposits are disabled until a dedicated testnet receiver, starting block and
integer-rao prices are configured. No mainnet transactions are supported.
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
