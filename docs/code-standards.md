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
| [apps/web/src/lib/repos/kernel.ts](../apps/web/src/lib/repos/kernel.ts) | kernel transport and snapshot-to-UI mapping |
| [apps/web/src/lib/data-provider.tsx](../apps/web/src/lib/data-provider.tsx) | client load gate and store wiring |
| [packages/infra/alchemy.run.ts](../packages/infra/alchemy.run.ts) | dev/deploy runtime bindings |

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

