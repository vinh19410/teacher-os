---
phase: 1
title: "Scaffold Vitest runner"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Scaffold Vitest runner

## Overview

Add Vitest ≥ 4.1 to `apps/web` and a stub `data-store-reducer.ts` so `tsc --noEmit` stays green. Invariant tests land in phase 2.

## Requirements

- Functional: `pnpm --filter web test` invokes Vitest and can import `reducer`.
- Non-functional: no Playwright, no Testing Library, no extra Vite plugins, no globals.

## Architecture

- Dev dependency on `web` only: `vitest@^4.1.0`.
- `apps/web/vitest.config.ts` — `defineConfig` from `vitest/config`, `test.environment: "node"` (under the `test` key, not a loose top-level `environment` if Vitest 4 requires nesting). Reuse `resolve.tsconfigPaths: true`.
- Do not fold test config into `vite.config.ts` (PWA + router plugins would load).
- Tests must `import { expect, test, describe } from "vitest"`. `apps/web/tsconfig.json` sets `"types": ["vite/client"]` which **replaces** default type roots — Vitest globals would fail `tsc`.
- **Stub module (required for check-types):** create `apps/web/src/lib/data-store-reducer.ts` that exports `reducer` (and `Action` type re-exported from a type-only duplicate or imported types from `data-store` later). Stub may `throw` if invoked, or return the input state. `typeof reducer === "function"` is enough this phase.
- Do **not** leave a commit/tree tip that imports a missing file. `check-types` = `vite build && tsc --noEmit` and `tsconfig` does not exclude `*.test.ts`.

## Related Code Files

- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/lib/data-store-reducer.ts` (stub)
- Create: `apps/web/src/lib/data-store-reducer.test.ts` (smoke: `typeof reducer === "function"`)
- Modify: `apps/web/package.json` (`test`: `vitest run`, `test:watch`: `vitest`)
- Modify: `pnpm-lock.yaml` (via `pnpm add -D vitest@^4.1.0 --filter web`)

## Tests Before

Write the smoke test importing `{ reducer }` from `./data-store-reducer` and `{ expect, test } from "vitest"`. It fails until the stub exists.

## Refactor

Install Vitest, add config + scripts, add the stub export. Do not move the real reducer yet.

## Tests After

Smoke test green. Invariant tests do not exist yet.

## Implementation Steps

1. `pnpm add -D vitest@^4.1.0 --filter web` from repo root. Confirm resolved version is ≥ 4.1.0.
2. Add `apps/web/vitest.config.ts` with `test.environment: "node"` and `resolve.tsconfigPaths: true`.
3. Add `test` / `test:watch` scripts on `web`.
4. Add stub `data-store-reducer.ts` exporting `reducer`.
5. Add smoke test. Run `pnpm --filter web test` (exit 0).
6. Run `pnpm --filter web check-types` (or root `pnpm check-types`) — must stay green.

## Success Criteria

- [x] `vitest` is a `web` devDependency at ≥ 4.1.0
- [x] `pnpm --filter web test` exits 0 (smoke only)
- [x] `pnpm check-types` still green
- [x] No Playwright / Testing Library packages added

## Risk Assessment

- Vitest 4.0 without 4.1 may mis-resolve Vite 8. Signal: peer warning or config type clash. Response: pin `vitest@^4.1.0`.
- Config key `environment` ignored if not under `test`. Signal: tests run in wrong env. Response: use `test: { environment: "node" }`.
- Missing stub → `tsc` fails on the test import. Signal: `Cannot find module './data-store-reducer'`. Response: stub lands in this phase.

## Regression Gate

`pnpm --filter web test` exit 0 **and** `pnpm check-types` exit 0.
