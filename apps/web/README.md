# Village frontend

Next.js App Router, TypeScript, Tailwind, and a client-only Phaser world.
Run `npm run dev` from the repository root and open `http://localhost:3000`.

Set `NEXT_PUBLIC_API_URL` in ignored `.env.local` using `.env.example`.
The API must be running and allow the exact frontend origin.

The world fills the viewport. Controls open the directory, task details, and
journal only when needed. Provider readiness, jobs, outputs, and chain residents
come from the API. No credentials or signing keys belong in this workspace.

Final environment artwork is pending. The rejected generated background is
not loaded. Movement, characters, markers, and interactions remain functional.

Build with `npm run build --workspace @subswarm/web`. Output is static files in
`out/`. There are no route handlers, server actions, or frontend Functions.
Provider execution and persistence stay in the separate Node API.
