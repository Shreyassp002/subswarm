# Subswarm frontend

Next.js App Router, TypeScript, Tailwind, and a client-only Phaser world.
Run `npm run dev` from the repository root and open `http://localhost:3000`.

Set `NEXT_PUBLIC_API_URL` in ignored `.env.local` using `.env.example`.
The API must be running and allow the exact frontend origin.

Routes:

- `/`: branded landing with workspace and village entry points.
- `/app/`: searchable professional workspace, requests, participant rosters, wallet and library.
- `/village/`: full-screen pixel world with searchable district directory.

`useWorkspace` shares session and request lifecycle logic across both modes.
Task, wallet and journal components share their functional behavior and use
mode-specific presentation. The professional theme is scoped to `.swarm-brand`
and `.professional`; village styles retain their existing appearance. Provider
marks are local files with sources retained in the root third-party notices.

The world fills the viewport. Controls open the directory, task details, and
journal only when needed. Provider readiness, jobs, outputs, and chain residents
come from the API. No credentials or signing keys belong in this workspace.

The original evening town spans three connected neighborhoods. Licensed CC0
characters walk with directional sprite frames. House signs use wooden boards;
forms and the journal use a matching parchment and pixel-font theme.

The wallet panel lazily loads the official Polkadot extension and API libraries.
Connecting signs only a login message. A deposit is a separate explicit wallet
confirmation, pinned to Bittensor testnet. Provider forms request a server quote
before spending prepaid credit. No API keys or private keys enter the frontend.

Build with `npm run build --workspace @subswarm/web`. Output is static files in
`out/`, with a directory index for each route. There are no route handlers, server actions, or frontend Functions.
Provider execution and persistence stay in the separate Node API.
