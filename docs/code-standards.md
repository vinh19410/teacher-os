# Code Standards

These are the repo conventions that show up in the live codebase and should stay stable unless the owning code changes with them.

## Tooling baseline

- TypeScript monorepo with `pnpm` workspaces and Turborepo.
- Biome owns formatting and linting.
- Root validation scripts live in [`package.json`](../package.json).

## Ownership rules

| Surface | Owns |
| --- | --- |
| [packages/api/src/contracts.ts](../packages/api/src/contracts.ts) | request schemas, snapshot row contracts, and shared wire types |
| [packages/db/src/schema/index.ts](../packages/db/src/schema/index.ts) | persistent schema boundaries |
| [apps/server/src/app.ts](../apps/server/src/app.ts) | auth/bootstrap middleware, CORS, and app composition |
| [apps/server/src/routes/kernel.ts](../apps/server/src/routes/kernel.ts) | kernel mutations and org-scoped reads |
| [apps/server/src/routes/snapshot.ts](../apps/server/src/routes/snapshot.ts) | snapshot assembly and loader projections |
| [packages/api/src/skeleton.ts](../packages/api/src/skeleton.ts) | occurrence-identity skeleton: schedule/date parsing, conformance, and backfill planning (issue #98) |
| [apps/web/src/lib/repos/kernel.ts](../apps/web/src/lib/repos/kernel.ts) | kernel transport, snapshot query options, and snapshot-to-UI mapping |
| [apps/web/src/lib/data-provider.tsx](../apps/web/src/lib/data-provider.tsx) | client load gate and store wiring |
| [apps/web/src/lib/query-client.ts](../apps/web/src/lib/query-client.ts) | QueryClient defaults, kernel query retry policy, and global 401 reauth |
| [packages/infra/alchemy.run.ts](../packages/infra/alchemy.run.ts) | dev/deploy runtime bindings |

### Persist-vs-derive carve-out ("derived-until-user-mutable")

A value stays derived-only while no user action can change it. Once ANY user
flow writes it, it becomes a persisted fact on the owning row — not a place to
re-heuristics at render time (precedent chain: `lesson.topic`, then `lesson.date`
as occurrence identity in issue #98). Consequences:

- mutable facts get a real column + docblock naming the user action that writes them;
- render paths may still fall back to a frozen heuristic for rows predating the fact;
- syllabus titles REMAIN derived display-only — never written back into facts.

## Writing conventions

- Treat `packages/api` as the shared contract surface; change the server and web together when a contract changes.
- Keep POST writes JSON-only and org-scoped.
- Keep CSRF and content-type checks in the server route layer that owns the mutation.
- Keep derived UI fields derived in adapters, not persisted as extra source-of-truth columns.
- Keep route guards and bootstraps in the owning app layer, not in random feature modules.
- Keep generated or stateful artifacts out of evergreen docs unless they are the actual owner of the behavior.

## Validation

Use the root scripts in [`package.json`](../package.json) for normal checks:

- `check`
- `test`
- `check-types`

