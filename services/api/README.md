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
