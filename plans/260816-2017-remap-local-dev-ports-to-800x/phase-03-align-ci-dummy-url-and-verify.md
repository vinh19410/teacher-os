---
phase: 3
title: "Align CI dummy URL and verify"
status: completed
priority: P1
effort: "0.5h"
dependencies: [2]
---

# Phase 3: Align CI dummy URL and verify

## Overview

Point the CI job dummy `VITE_SERVER_URL` at `http://localhost:8000`. Then prove existing tests, biome, and check-types still pass. No new test framework. No historical plan rewrites.

## Context Links

- Parent: `plan.md`
- Depends on: phase 2 binds/docs
- `.github/workflows/ci.yml:19-20` `VITE_SERVER_URL: http://localhost:3000`
- `scripts/ci-workflow.test.mjs:36` asserts key `VITE_SERVER_URL` only
- `packages/env/src/web.ts:7` `VITE_SERVER_URL: z.url()`
- Root `"test": "turbo run test && pnpm test:ci-workflow"` (`package.json:19`)
- Accepted contract overrides researcher “leave CI at 3000”

## Requirements

- Functional: CI dummy origin is `http://localhost:8000`; quality commands still exit 0
- Non-functional: no secrets; contract test assertions unchanged; no `biome --write`

## Architecture

CI does **not** bind ports. The job env only satisfies `z.url()` for web `check-types` / `build`. Changing `3000` → `8000` is a consistency edit so live docs and the dummy match.

```yaml
# .github/workflows/ci.yml jobs.quality.env
VITE_SERVER_URL: http://localhost:8000
```

Do not add `CORS_ORIGIN` or `BETTER_AUTH_URL` to CI. Do not add `${{ secrets.`.

`scripts/ci-workflow.test.mjs` must stay:

```js
assert.match(yaml, /VITE_SERVER_URL/, "must set dummy VITE_SERVER_URL");
```

Do not assert `:8000` in the contract test (not requested; current test is key-only).

### Test matrix

| Layer | What | Command / check |
|---|---|---|
| Unit | existing web reducer suite | `pnpm test` (turbo `vitest run` + contract) |
| Contract | workflow still has `VITE_SERVER_URL` key | included in `pnpm test` via `test:ci-workflow` |
| Types | schema + tsc, web `vite build` inside check-types | `VITE_SERVER_URL=http://localhost:8000 pnpm check-types` |
| Lint | read-only biome | `pnpm exec biome check .` |
| E2E / browser | none | out of scope |
| Bind smoke | `pnpm run dev` on 8000/8001 | optional local; not a CI gate |

## Related Code Files

- Create: none
- Modify: `.github/workflows/ci.yml` (`env.VITE_SERVER_URL` value only)
- Delete: none
- Do **not** modify: `scripts/ci-workflow.test.mjs`, phase 2 files, historical `plans/**`

## Implementation Steps

1. In `.github/workflows/ci.yml`, change line 20 from `http://localhost:3000` to `http://localhost:8000`.
2. Run `pnpm test`. Must exit 0. Contract test still only checks the key exists.
3. Run `pnpm exec biome check .`. Must exit 0 (existing warnings/infos allowed; no new errors).
4. Run `VITE_SERVER_URL=http://localhost:8000 pnpm check-types`. Must exit 0.
5. Confirm `git diff` for this phase is only `ci.yml` (plus already-approved phase 2 tracked files). No `.env`, no old plans.

## Todo

- [x] CI dummy URL is `http://localhost:8000`
- [x] `pnpm test` exit 0
- [x] `pnpm exec biome check .` exit 0
- [x] `pnpm check-types` exit 0 with dummy `http://localhost:8000`
- [x] Contract test file unchanged
- [x] Historical plans/journals unchanged

## Success Criteria

- [x] `.github/workflows/ci.yml:20` is `VITE_SERVER_URL: http://localhost:8000`
- [x] `scripts/ci-workflow.test.mjs` diff is empty
- [x] `pnpm test` exits 0
- [x] `pnpm exec biome check .` exits 0
- [x] `VITE_SERVER_URL=http://localhost:8000 pnpm check-types` exits 0
- [x] Plan acceptance checklist in `plan.md` can be marked done after these gates (leave unchecked until implement)

## Risk Assessment

| Risk | LxI | Signal | Response |
|---|---|---|---|
| Someone “helps” by asserting `:8000` in the contract test | L x L | extra assertion, out of scope | Do not add it |
| Dummy URL omitted → `z.url()` fail | L x H | check-types/build fail on missing env | Keep the key; only change the port |
| Researcher leftover “leave CI at 3000” | — | stale research note | Ignored; user contract wins |
| `pnpm build` not listed as a gate | — | CI job still runs build on GitHub | Local gate is test + biome + check-types as accepted. Optional extra: `VITE_SERVER_URL=http://localhost:8000 pnpm build` if desired; not required |

## Security Considerations

- Dummy URL is public localhost. Not a secret.
- Workflow must still contain no `${{ secrets.` (`ci-workflow.test.mjs:31-34`).

## Rollback

Restore `.github/workflows/ci.yml` line 20 to `http://localhost:3000`. Independent of phase 2 revert. Contract test still passes either value.

To revert the whole remap: roll back phase 3 then phase 2 (tracked files + `.env` URLs). No data migration.

## Next Steps

Human: add Google Console localhost:8000 redirect (and JS origin 8001 if used). Keep 3000 URI during transition. Then `/ak:cook` this plan when approved.
