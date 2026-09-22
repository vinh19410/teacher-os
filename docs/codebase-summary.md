# Codebase Summary

This is the navigation surface for the repository. It points to the owning files instead of restating implementation details.

## Main entry points

- [apps/web/src/routes/_auth/route.tsx](../apps/web/src/routes/_auth/route.tsx) - web auth gate and shell entry
- [apps/web/src/lib/data-provider.tsx](../apps/web/src/lib/data-provider.tsx) - client kernel store and load gate
- [apps/web/src/lib/query-client.ts](../apps/web/src/lib/query-client.ts) - QueryClient defaults and global 401 reauth
- [apps/web/src/lib/repos/kernel.ts](../apps/web/src/lib/repos/kernel.ts) - kernel transport, snapshot query options, and snapshot mapping
- [apps/web/src/worker.ts](../apps/web/src/worker.ts) - web asset worker entry: static assets, SPA routes, and branded HTTP 404
- [apps/landing/public/index.html](../apps/landing/public/index.html) - static marketing landing page entry (zero-framework, served at apex)
- [apps/server/src/app.ts](../apps/server/src/app.ts) - server app composition and bootstrap middleware
- [apps/server/src/routes/kernel.ts](../apps/server/src/routes/kernel.ts) - kernel route tree
- [apps/server/src/routes/assignments/index.ts](../apps/server/src/routes/assignments/index.ts) - assignment-prompt bank create and per-student grading routes, mounted inside the kernel tree
- [apps/server/src/routes/snapshot.ts](../apps/server/src/routes/snapshot.ts) - snapshot loader
- [packages/api/src/contracts.ts](../packages/api/src/contracts.ts) - shared API contracts
- [packages/db/src/schema/index.ts](../packages/db/src/schema/index.ts) - database schema barrel
- [packages/infra/alchemy.run.ts](../packages/infra/alchemy.run.ts) - Cloudflare and D1 wiring

## Directory map

- `apps/web` - route files, UI shell, client state, and kernel-facing repository helpers
- `apps/landing` - static landing page, zero-framework, public/index.html from Open Design design, build = copy, serve.mjs :8002, zero dependencies
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
- If you are changing syllabus import formats or rules, start in [apps/web/src/lib/syllabus-import.ts](../apps/web/src/lib/syllabus-import.ts) (client-side parser); the overwrite import endpoint it feeds is `POST /api/syllabi/:id/replace-content` in [apps/server/src/routes/kernel.ts](../apps/server/src/routes/kernel.ts).
- If you are changing assignment creation, the prompt bank, or the IELTS answer key, start in [apps/web/src/routes/_auth/assignments/new.tsx](../apps/web/src/routes/_auth/assignments/new.tsx) and the 4-skill catalog in [apps/web/src/components/assignments/assignment-presets.ts](../apps/web/src/components/assignments/assignment-presets.ts); the create endpoint is `POST /api/assignments/prompts` in [apps/server/src/routes/assignments/index.ts](../apps/server/src/routes/assignments/index.ts), and the student preview round-trip hands its draft through sessionStorage ([apps/web/src/lib/assignment-preview-draft.ts](../apps/web/src/lib/assignment-preview-draft.ts)) to [apps/web/src/routes/_auth/assignments/preview.tsx](../apps/web/src/routes/_auth/assignments/preview.tsx).
- If a UI cluster is missing (e.g., the parent-reports section), check the static flags in [apps/web/src/lib/features.ts](../apps/web/src/lib/features.ts) first; `PARENT_REPORTS_ENABLED = false` hides the whole cluster and redirects `/reports` to `/dashboard` without touching backend or schema.
- If you are adding or renaming web routes, keep [apps/web/src/routes-matcher.ts](../apps/web/src/routes-matcher.ts) in sync; the drift-guard test [apps/web/src/routes-matcher.test.ts](../apps/web/src/routes-matcher.test.ts) fails when a route in `routeTree.gen.ts` is missing from the matcher.
- If you are changing deployment or local runtime wiring, start in [packages/infra/alchemy.run.ts](../packages/infra/alchemy.run.ts); topology derivation (origins, cookie domain, auth cookie namespace prefix) lives in [packages/infra/src/topology.ts](../packages/infra/src/topology.ts) with its validation in [packages/auth/src/topology.ts](../packages/auth/src/topology.ts).
- If you are changing CI gates or workflow triggers, start in `.github/workflows/`; [scripts/ci-workflow.test.mjs](../scripts/ci-workflow.test.mjs) asserts the contract those workflows must keep.

