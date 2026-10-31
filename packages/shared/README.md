# Shared API contracts

[Project overview](../../README.md) · [Frontend](../../apps/web/README.md) · [API](../../services/api/README.md)

`@subswarm/shared` contains the TypeScript contracts used by the frontend and API. It is a private, type-only workspace, not a published SDK or an HTTP client.

## Contents

| File | Types |
| --- | --- |
| `src/index.ts` | Providers, input fields, participants, network snapshots, job inputs, results, jobs, artifacts, sessions and API errors |
| `src/payments.ts` | Wallet state, payment settings, quotes and ledger entries |

Import types through the workspace package:

```ts
import type { Job, Provider, WalletState } from '@subswarm/shared';
```

The package exports its TypeScript source through the `types` field. It has no runtime dependencies or independent build command; consumer typechecks validate its use.

## Contract boundaries

- **Identity:** `ProviderId` names supported adapter identities, including historical integrations. Membership does not mean a provider is published, configured or currently usable.
- **Discovery:** `Provider` describes capabilities, inputs, readiness and attribution. Public availability is decided by the API's allowlist and configuration.
- **Execution:** `JobInput` captures supported inputs. `JobStatus` is `queued`, `running`, `completed` or `failed`.
- **Outputs:** discriminated `ResultBlock` types drive rendering for text, links, weather, detection, memory, files and participants.
- **Money:** rao amounts cross the API as decimal strings. Keep them exact; do not convert payment arithmetic to floating-point numbers.
- **Provenance:** a `NetworkSnapshot` records network, subnet, block and fetch time. Registered participants and request-specific attribution are distinct.

Kova and TALOS are frontend discovery previews. Their building IDs do not create backend provider adapters or belong in `ProviderId` until execution support exists.

These are compile-time types, not runtime validation or authorization. The API validates inputs, verifies signatures, checks ownership and controls which stored fields it returns. Never serialize internal result metadata merely because a field exists in a shared type.

## Changing a contract

Update the API validation and response mapping, then the frontend consumer. Keep existing saved outputs readable and preserve the difference between unavailable services and historical artifacts. A new result kind needs both backend handling and frontend rendering.

Run consumer typechecks from the repository root:

```bash
npm run typecheck
```

Backend behavior tests belong in `services/api/test`; this package does not duplicate them.
