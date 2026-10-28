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
The final environment artwork is undecided. The rejected generated background
has been removed; interaction geometry and characters remain functional.

## Integration status

| District | Implemented access | Configuration |
| --- | --- | --- |
| Network Explorer | Read-only testnet scans | Official `btcli` executable |
| SayGM | Text-generation adapter | `SAYGM_API_KEY`, optional `SAYGM_MODEL` |
| Desearch | Web-search adapter | `DESEARCH_API_KEY` |
| ChronoSeek | Video-search adapter | Reachable `CHRONOSEEK_URL`, optional key |
| Chutes | Text-generation adapter | `CHUTES_API_KEY`, optional `CHUTES_MODEL` |
| 404-GEN, Attelier, EveryFrame, Hippius | Discovery links | Execution not integrated |
| Ridges | Discoverable district | Execution unavailable |

Keys belong only in `services/api/.env`. No provider account is assumed to have
free credit. Authenticated provider calls have not been verified without keys.
Registered residents are chain participants, not evidence that a miner served
a request or won a competition. Character animation never fabricates results.

## Chain tooling

The API uses the official Bittensor CLI, not a custom chain codec. Install it in
an isolated environment and set `BTCLI_BIN` to its executable if needed:

```bash
uv venv .runtime/btcli
uv pip install --python .runtime/btcli/bin/python bittensor==11.3.0
```

Only fixed, allowlisted read-only queries are issued. No wallet, signer, chain
transaction, new subnet, or hosted inference fleet is required.

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
