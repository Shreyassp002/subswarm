# Subswarm

Subswarm is a TypeScript pixel village for discovering and using Bittensor services.

- Use npm workspaces. Frontend is Next.js with a client-only Phaser world. API and jobs run in the separate Node service.
- Keep the web export static. Do not add Next route handlers, server actions, or frontend provider credentials.
- Use documented provider HTTP APIs and official Bittensor tooling. Do not host inference models or run a miner fleet as a prerequisite for the game.
- Registered chain participants are residents. Only request-specific provider evidence can attribute an actual response to a miner. Never invent competitors, winners, provider balances, or completed tasks.
- Keep provider keys and session tokens out of committed files and logs. Only placeholder environment examples belong in Git.
- Read-only chain inspection and local/testnet development only. No mainnet transactions or payload signing.
- Keep player jobs and artifacts scoped to their server-owned session. Quota reservations and terminal state transitions must persist across restarts.
- Reuse appropriately licensed assets and keep their notices. Do not import unrelated contracts, pet ownership, or wallet code from source references.
- Use concise conventional commit messages without AI attribution. Do not use Unicode em dashes or arrow characters.
- Run focused tests for backend logic, then one build and browser check for an implementation slice. Avoid duplicate presentation tests.

## World artwork and input

- Never purchase assets. Use appropriately licensed free downloads or generate original artwork.
- Keep town destinations separated by walkable space. Favor connected neighborhoods over fitting every building into one crowded view. Keep colors restrained and avoid sparkling water, dense microtexture and excessive decorative props.
- Set Phaser `input.windowEvents` to `false`. Forwarding DOM overlay clicks to the world can select a building and unmount a quest form before it submits. Keep keyboard movement paused while interacting with inputs or modal dialogs.
