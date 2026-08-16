---
phase: 2
title: "Implement GitHub Actions workflow"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Implement GitHub Actions workflow

## Overview

Add `.github/workflows/ci.yml` so the phase-1 contract test passes, then prove the three issue commands succeed locally with the same env the runner will use.

## Context Links

- Parent: `plan.md`
- Depends on: phase 1 (biome green + failing contract test)
- Toolchain: `package.json` `packageManager` = `pnpm@10.33.1`; local Node `v24.15.0`; live action majors 2026-08-16: checkout v7, setup-node v7, pnpm/action-setup v6
- Web env: `packages/env/src/web.ts` (`VITE_SERVER_URL: z.url()`)
- Do **not** use root `pnpm check` (`biome check --write .`)

## Requirements

- Functional: workflow runs on PRs and on push to `develop`/`main`; job installs with frozen lockfile; job runs the three commands
- Non-functional: no secrets; contents: read; cancel stale runs; timeout set

## Architecture

One workflow, one job, sequential steps:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main, develop]

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  quality:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      VITE_SERVER_URL: http://localhost:3000
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
        with:
          version: 10.33.1
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec biome check .
      - run: pnpm check-types
      - run: pnpm build
```

Notes:

- pnpm v10 → `pnpm/action-setup` (not `pnpm/setup`, which is v11+).
- Majors verified 2026-08-16 via `gh api`: checkout `v7.0.1`, setup-node `v7.0.0`, pnpm/action-setup `v6.0.10`. If a tag 404s at implement time, re-query live tags; do not invent versions.
- Node 24 matches the verified local toolchain (`v24.15.0`). Do not switch back to 22 without new evidence.
- `VITE_SERVER_URL` is a dummy public URL, not a secret.
- Optional: run `pnpm test:ci-workflow` as the first `run` step after install. Allowed; does not replace the three required commands.

## Related Code Files

- Create: `.github/workflows/ci.yml`
- Modify: none unless action majors need a documented pin tweak
- Delete: none

## Tests Before

Re-run `node --test scripts/ci-workflow.test.mjs` — still failing (workflow missing). Do not weaken assertions.

## Refactor

Write `.github/workflows/ci.yml` to satisfy the contract. Keep YAML minimal. No deploy jobs. No extra linters.

## Tests After

1. `node --test scripts/ci-workflow.test.mjs` exits 0
2. `pnpm exec biome check .` exits 0
3. `VITE_SERVER_URL=http://localhost:3000 pnpm check-types` exits 0
4. `VITE_SERVER_URL=http://localhost:3000 pnpm build` exits 0

## Regression Gate

```bash
pnpm test:ci-workflow
pnpm exec biome check .
VITE_SERVER_URL=http://localhost:3000 pnpm check-types
VITE_SERVER_URL=http://localhost:3000 pnpm build
```

All four must exit 0 before ship.

## Implementation Steps

1. Create `.github/workflows/ci.yml` from the sketch above.
2. Run the contract test; fix YAML until green.
3. Run the three local commands with the dummy env.
4. Confirm no secrets, no `--write`, no extra jobs.

## Todo

- [x] Workflow file added
- [x] Contract test green
- [x] Three local commands green
- [x] No secrets referenced

## Success Criteria

- [x] Contract test passes
- [x] Triggers include `pull_request` and push to `main` + `develop`
- [x] Job runs the three issue commands in that order
- [x] Local biome / check-types / build pass

## Risk Assessment

- Action major 404 on GitHub. Signal: first Actions run fails on `uses:`. Response: re-query live tags and bump; do not invent a custom installer.
- `--frozen-lockfile` fails if someone edits `package.json` without lockfile. That is desired.
- Turbo remote cache is off by default; no TURBO_TOKEN needed. Signal: build asks for a token. Response: leave remote cache disabled.

## Security Considerations

- `permissions.contents: read` only
- Dummy `VITE_SERVER_URL` is public localhost
- No `BETTER_AUTH_*`, Google OAuth, or Cloudflare tokens in the workflow
- Frozen lockfile reduces supply-chain drift on the runner

## Next Steps

Ship to `develop` via `/ak:ship beta`. First GitHub run is the live proof; if it fails, fix the workflow only.
