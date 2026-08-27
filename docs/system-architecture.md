# System Architecture

Teacher OS is a three-layer monorepo: a React web app, a Hono server, and shared packages for API contracts, persistence, and deployment wiring. The runtime contract is snapshot-driven: the browser reads a kernel snapshot, sends POST commands, and refreshes the snapshot after each write. Browser E2E coverage lives in [apps/e2e/playwright.config.ts](../apps/e2e/playwright.config.ts), which boots the real server app under Node against a fresh local D1 database so these flows run without Cloudflare credentials.

## Current request flow

1. The auth route in [apps/web/src/routes/_auth/route.tsx](../apps/web/src/routes/_auth/route.tsx) blocks unauthenticated users and sends them to login.
2. [apps/web/src/lib/data-provider.tsx](../apps/web/src/lib/data-provider.tsx) subscribes to the shared TanStack Query `['kernel']` entry (`GET /api/kernel`) and waits for it before rendering children; kernel writes refetch that same entry through the command bus.
3. [apps/web/src/lib/repos/kernel.ts](../apps/web/src/lib/repos/kernel.ts) maps UI actions to POST requests and maps kernel snapshots into the legacy UI shape.
4. [apps/server/src/app.ts](../apps/server/src/app.ts) installs CORS, the bootstrap middleware, and the `/api` router chain.
5. [apps/server/src/routes/kernel.ts](../apps/server/src/routes/kernel.ts) enforces origin and JSON checks for POSTs, then executes org-scoped reads and writes.
6. [apps/server/src/routes/snapshot.ts](../apps/server/src/routes/snapshot.ts) assembles the snapshot from the canonical database tables.
7. [packages/db/src/schema/index.ts](../packages/db/src/schema/index.ts) is the persistence owner, and [packages/api/src/contracts.ts](../packages/api/src/contracts.ts) is the wire contract owner.

## Boundary map

| Boundary | Current owner |
| --- | --- |
| Browser shell and route guard | [apps/web/src/routes/_auth/route.tsx](../apps/web/src/routes/_auth/route.tsx) |
| Client kernel store and bus | [apps/web/src/lib/data-provider.tsx](../apps/web/src/lib/data-provider.tsx) and [apps/web/src/lib/repos/kernel.ts](../apps/web/src/lib/repos/kernel.ts) |
| App bootstrap and org creation | [apps/server/src/app.ts](../apps/server/src/app.ts) |
| Kernel reads/writes and CSRF checks | [apps/server/src/routes/kernel.ts](../apps/server/src/routes/kernel.ts) |
| Snapshot assembly | [apps/server/src/routes/snapshot.ts](../apps/server/src/routes/snapshot.ts) |
| Persistent rows and constraints | [packages/db/src/schema/index.ts](../packages/db/src/schema/index.ts) |
| Kernel DTOs and request bodies | [packages/api/src/contracts.ts](../packages/api/src/contracts.ts) |
| Cloudflare worker and D1 wiring | [packages/infra/alchemy.run.ts](../packages/infra/alchemy.run.ts) |

## Architectural rules

- Keep org scoping on the server; do not move it into client headers.
- Keep the bootstrap rule idempotent so a new authenticated teacher always lands in a usable workspace.
- Keep the snapshot contract stable for the web adapter; if the server shape changes, the adapter and contracts change with it.
- Keep scheduled lesson actions separate from curriculum lessons.
- Keep entitlement state on `session_package` keyed by `enrollment`, not on the student row.
- Keep deployment wiring in the infra package, not in app code.

