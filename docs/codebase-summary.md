# Codebase Summary

This is the navigation surface for the repository. It points to the owning files instead of restating implementation details.

## Main entry points

- [apps/web/src/routes/_auth/route.tsx](../apps/web/src/routes/_auth/route.tsx) - web auth gate and shell entry
- [apps/web/src/lib/data-provider.tsx](../apps/web/src/lib/data-provider.tsx) - client kernel store and load gate
- [apps/web/src/lib/query-client.ts](../apps/web/src/lib/query-client.ts) - QueryClient defaults and global 401 reauth
- [apps/web/src/lib/repos/kernel.ts](../apps/web/src/lib/repos/kernel.ts) - kernel transport, snapshot query options, and snapshot mapping
- [apps/server/src/app.ts](../apps/server/src/app.ts) - server app composition and bootstrap middleware
- [apps/server/src/routes/kernel.ts](../apps/server/src/routes/kernel.ts) - kernel route tree
- [apps/server/src/routes/snapshot.ts](../apps/server/src/routes/snapshot.ts) - snapshot loader
- [packages/api/src/contracts.ts](../packages/api/src/contracts.ts) - shared API contracts
- [packages/db/src/schema/index.ts](../packages/db/src/schema/index.ts) - database schema barrel
- [packages/infra/alchemy.run.ts](../packages/infra/alchemy.run.ts) - Cloudflare and D1 wiring

## Directory map

- `apps/web` - route files, UI shell, client state, and kernel-facing repository helpers
- `apps/server` - Hono app, auth/session handling, snapshot loaders, and org-scoped kernel routes
- `apps/e2e` - Playwright specs that boot the real server app under Node with a fresh local D1 database
- `packages/api` - Zod request schemas and wire DTOs
- `packages/db` - Drizzle schema definitions and migrations
- `packages/infra` - Alchemy stack definition for local dev and deployment
- `scripts` - node:test contract tests enforcing CI workflow shape and topology consistency
- `open-design/v1` - visual handoff input for the UI
- `plans` - stateful execution records and past implementation plans

## Where to look first

- If you are changing UI state or kernel writes, start in [apps/web/src/lib/repos/kernel.ts](../apps/web/src/lib/repos/kernel.ts) and [apps/server/src/routes/kernel.ts](../apps/server/src/routes/kernel.ts); query-layer behavior (keys, retry, refetch policy) lives in [apps/web/src/lib/query-client.ts](../apps/web/src/lib/query-client.ts).
- If you are changing persistence, start in [packages/db/src/schema/index.ts](../packages/db/src/schema/index.ts) and the individual schema files under `packages/db/src/schema/`.
- If you are changing request bodies or response shapes, start in [packages/api/src/contracts.ts](../packages/api/src/contracts.ts).
- If you are changing deployment or local runtime wiring, start in [packages/infra/alchemy.run.ts](../packages/infra/alchemy.run.ts).
- If you are changing CI gates or workflow triggers, start in `.github/workflows/`; [scripts/ci-workflow.test.mjs](../scripts/ci-workflow.test.mjs) asserts the contract those workflows must keep.

