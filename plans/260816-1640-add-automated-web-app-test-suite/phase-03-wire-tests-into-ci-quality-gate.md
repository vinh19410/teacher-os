---
phase: 3
title: "Wire tests into CI quality gate"
status: pending
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: Wire tests into CI quality gate

## Overview

Make the suite the quality job actually runs. Extend the existing `node:test` CI contract so a missing or hollow test step fails the gate.

## Requirements

- Functional: PRs and pushes to `develop`/`main` run the test command after install.
- Non-functional: no new secrets, no extra CI jobs, keep biome read-only.

## Architecture

Single existing `quality` job. Add one step after biome, before check-types/build:

```yaml
- run: pnpm test
```

Root `package.json`:

```json
"test": "turbo run test && pnpm test:ci-workflow"
```

(`test:ci-workflow` already runs `scripts/ci-workflow.test.mjs`. Do not switch to a glob unless adding more root test files this plan.)

`turbo.json` add:

```json
"test": { "dependsOn": ["^test"] }
```

`apps/web` already has `"test": "vitest run"` from phase 1.

**Verify locally** `turbo run test` with packages that lack a `test` script (`packages/auth` has `scripts: {}`, `packages/config` has no scripts). Same pattern as `check-types`. If turbo errors, add `"test": { "dependsOn": ["^test"] }` only — do not add no-op `test` scripts to other packages.

Root is **not** a workspace member (`pnpm-workspace.yaml` is `apps/*` + `packages/*`). `turbo run test` will not run the root script; the CI step `pnpm test` is what chains turbo + contract.

## Related Code Files

- Modify: `.github/workflows/ci.yml`
- Modify: `package.json` (root `test` script)
- Modify: `turbo.json`
- Modify: `scripts/ci-workflow.test.mjs`

## Tests Before

Extend `scripts/ci-workflow.test.mjs` **before** editing the workflow:

1. YAML command line is exactly `pnpm test`: `/^\s+- run: pnpm test\s*$/m` (must **not** match `pnpm test:ci-workflow`).
2. Root `package.json` `scripts.test` includes `turbo run test` and `test:ci-workflow`.
3. `turbo.json` `tasks.test` exists.
4. `apps/web/package.json` `scripts.test` === `vitest run`.
5. Keep existing `doesNotMatch` for `biome check --write` and `${{ secrets.`.

Confirm `pnpm test:ci-workflow` fails until YAML/scripts exist.

## Refactor

Add the YAML step + root script + turbo task.

## Tests After

`pnpm test:ci-workflow` passes. `pnpm test` runs web Vitest then the contract test.

## Implementation Steps

1. Add the failing contract assertions (YAML + package.json + turbo + web script).
2. Add `test` to `turbo.json`.
3. Add root `"test"` script.
4. Add `- run: pnpm test` to `.github/workflows/ci.yml` (no secrets).
5. Run `turbo run test` once to confirm skip-missing-script. Then `pnpm test:ci-workflow` then `pnpm test`.
6. Confirm biome still has no `--write` and no `${{ secrets.`.

## Success Criteria

- [x] CI YAML step command is exactly `pnpm test`
- [x] Contract asserts YAML line + root script + turbo task + web `vitest run`
- [x] `pnpm test` exit 0 locally
- [x] No new GitHub secrets or extra jobs

## Risk Assessment

- Turbo errors when some packages lack `test`. Signal: `turbo run test` fails. Response: confirm skip; do not add no-op scripts.
- Loose `/pnpm test/` matching `pnpm test:ci-workflow`. Signal: false green. Response: use the anchored regex in Tests Before — that regex **is** the contract, not a later optional risk note.
- Vitest not on PATH on CI. Signal: `vitest: not found`. Response: `vitest run` via package binary after `pnpm install --frozen-lockfile`.

## Regression Gate

`pnpm test` && `pnpm test:ci-workflow` && `pnpm exec biome check .` (or at least the touched files) exit 0.
