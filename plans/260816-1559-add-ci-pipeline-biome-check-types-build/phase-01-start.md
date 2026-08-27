---
phase: 1
title: "Contract tests and biome unblock"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Contract tests and biome unblock

## Overview

Write the failing workflow contract test first. Then ignore generated drizzle meta JSON so `pnpm exec biome check .` is a usable red/green gate. Do not add the workflow YAML in this phase.

## Context Links

- Parent: `plan.md`
- Issue: https://github.com/vinh19410/teacher-os/issues/3
- Biome ignore list: `biome.json` `files.includes`
- Root scripts: `package.json`

## Requirements

- Functional: Node built-in test asserts the CI workflow contract; biome check exits 0
- Non-functional: no new npm dependencies; generated drizzle files stay unformatted

## Architecture

`scripts/ci-workflow.test.mjs` reads `.github/workflows/ci.yml` as text and asserts:

- file exists
- `on.pull_request` present
- `on.push.branches` includes `main` and `develop`
- steps include exact strings `pnpm exec biome check .`, `pnpm check-types`, `pnpm build`
- file does **not** contain `biome check --write`
- file does **not** contain `${{ secrets.` (no secret coupling)
- job env or env file sets `VITE_SERVER_URL`

Use `node:test` + `node:assert/strict` + `node:fs`. No YAML parser.

Add root script `"test:ci-workflow": "node --test scripts/ci-workflow.test.mjs"`.

## Related Code Files

- Create: `scripts/ci-workflow.test.mjs`
- Modify: `package.json` (add `test:ci-workflow` only)
- Modify: `biome.json` (`files.includes` add `!**/packages/db/src/migrations/meta`)
- Delete: none
- Do **not** create `.github/workflows/ci.yml` yet

## Tests Before

1. Add `scripts/ci-workflow.test.mjs` with the assertions above.
2. Run `node --test scripts/ci-workflow.test.mjs` — must fail (file missing).
3. Do not create the workflow to make it pass.

## Refactor

1. Add `!**/packages/db/src/migrations/meta` to `biome.json` `files.includes`.
2. Re-run `pnpm exec biome check .` — must exit 0. Existing warnings/infos are allowed.
3. Do not format `packages/db/src/migrations/meta/*.json`.
4. Do not change lint rules to hide warnings.

## Tests After

None in this phase. Workflow file still absent; contract test stays red until phase 2.

## Regression Gate

```bash
pnpm exec biome check .
# expect exit 0
node --test scripts/ci-workflow.test.mjs
# expect fail: workflow missing
```

## Implementation Steps

1. Create the missing `scripts/` directory (it does not exist on `develop`) and write the contract test.
2. Add `test:ci-workflow` script to root `package.json`.
3. Prove the test fails.
4. Ignore drizzle meta in `biome.json`.
5. Prove biome check is green.

## Todo

- [x] Contract test written and failing for missing workflow
- [x] `test:ci-workflow` script added
- [x] Drizzle meta ignored in biome
- [x] `pnpm exec biome check .` exits 0

## Success Criteria

- [x] `node --test scripts/ci-workflow.test.mjs` fails only because `.github/workflows/ci.yml` is missing
- [x] `pnpm exec biome check .` exits 0
- [x] No new production/runtime dependencies

## Risk Assessment

- Ignore glob too wide (`!**/*.json`) would drop real JSON lint. Signal: biome file count drops sharply. Response: keep the ignore scoped to `packages/db/src/migrations/meta`.
- Contract test too brittle (whitespace/order). Signal: YAML reformat fails tests. Response: assert substrings, not full-file snapshot.

## Security Considerations

- Contract test forbids `${{ secrets.` so the workflow cannot silently start depending on missing GitHub secrets.

## Next Steps

Phase 2 writes the workflow that turns the contract test green.
