---
title: CI quality gate for issue 3
date: 2026-08-16
summary: Added GitHub Actions biome + check-types + build on PRs and develop/main
---

# CI quality gate for issue 3

**Date**: 2026-08-16 16:29
**Severity**: Medium
**Component**: GitHub Actions / quality gate (#3)
**Status**: Resolved locally — live Actions run still pending

## What Happened

Issue #3 asked for a gate that never existed. `feat/ci-pipeline` shipped `.github/workflows/ci.yml` (one `quality` job), a Biome ignore for Drizzle meta JSON, and `scripts/ci-workflow.test.mjs` (`node:test`, no new deps). Triggers: every `pull_request`, plus `push` to `develop`/`main`. Job: frozen `pnpm install`, then `pnpm exec biome check .`, `pnpm check-types`, `pnpm build`. Dummy `VITE_SERVER_URL=http://localhost:3000` because `packages/env/src/web.ts` requires `z.url()`.

## The Brutal Truth

This feels too small until the first broken merge reminds you we shipped a monorepo with no `.github/` at all. The annoying part is we almost let generated snapshot JSON dictate our formatter. Fighting `db:generate` would have been a self-inflicted flake factory. Inventing Node 22 because there is no `engines` field would have been cargo-cult. Local is `v24.15.0`. We matched that.

## Technical Details

Pre-unblock, `pnpm exec biome check .` exited **1** on formatter **errors** in `packages/db/src/migrations/meta/{0000_snapshot.json,_journal.json}` — 2-space JSON vs Biome tabs. After `biome.json` added `!**/packages/db/src/migrations/meta`, those paths are ignored.

Local four gates (tester, Node v24.15.0, pnpm 10.33.1), all **exit 0**: `pnpm test:ci-workflow` 0.30s (`✔ ci workflow exists and matches the quality-gate contract`); `pnpm exec biome check .` 1.79s (114 files, 7 warn + 2 info, **0 errors**); `check-types --force` 10.04s; `build --force` 5.26s. Contract test locks triggers, the three commands, no `biome check --write`, no `${{ secrets.`. CI does **not** run that test — local TDD seam only.

## What We Tried

Rejected reformatting the meta JSON — next `db:generate` rewrites spaces and CI flakes. Rejected `pnpm check` (`biome check --write .` in `package.json:18`) — gate must not mutate the tree. Rejected Node 22 and stale majors (`checkout@v5` / `setup-node@v4`). Pinned live majors 2026-08-16: `actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6`. Rejected SHA-pin and dropping `pnpm build` (web `check-types` already vite-builds) — issue named both commands.

## Root Cause Analysis

No workflow file. Merges were a handshake. The biome red was generated kit output colliding with `indentStyle: tab`, not dirty source. Node/action versions were assumption, not measurement.

## Lessons Learned

Ignore generated artifacts the same way we already ignore `dist` / `.turbo` / `routeTree.gen.ts`. Pin CI to the Node we actually ran. Never call `--write` on a gate. `node:test` is enough to lock YAML shape without Vitest.

## Next Steps

- **Owner:** whoever ships the PR. **When:** before merge.
- First GitHub Actions run on the PR is the live proof. Read `gh run view` if it fails; fix the workflow only. **Do not merge until green.**
- Residual, out of scope for #3: branch protection / required check `CI / quality`. A YAML file does not block merge by itself.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
