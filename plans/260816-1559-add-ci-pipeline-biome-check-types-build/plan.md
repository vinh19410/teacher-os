---
title: "Add CI pipeline Biome check-types build"
description: "Add a GitHub Actions quality gate that runs biome check, check-types, and build on PRs and on develop/main."
status: completed
priority: P1
effort: "3h"
issue: 3
branch: feat/ci-pipeline
tags: [infra, ci, feature]
blockedBy: []
blocks: []
created: 2026-08-16
---

# Add CI pipeline Biome check-types build

Tracking: #3

## Overview

Repo has no `.github/workflows`. Merges are ungated. Issue #3 (from the PR #2 advisory gate) asks for a GitHub Actions workflow that runs `pnpm exec biome check .`, `pnpm check-types`, and `pnpm build` on pull requests and on `develop`/`main`.

This plan adds that gate, plus the smallest unblock so the three commands can pass on current `develop`. A TDD contract test (Node built-in `node:test`, no new deps) locks the workflow shape before the YAML is written.

## Scope Challenge

- Existing: no `.github/`; scripts already exist in root `package.json`; `packageManager` is `pnpm@10.33.1`; biome ignore list already excludes generated dirs (`dist`, `.turbo`, `routeTree.gen.ts`, `open-design`).
- Requested: one workflow, those three commands, PR + `develop`/`main` triggers.
- Complexity: 3-4 files, 0 new services, 2 phases.
- Selected mode: HOLD SCOPE. Fast + `--tdd`.

## Outcome

Every PR and every push to `develop`/`main` runs a required quality job. A failing lint/type/build check is visible in GitHub before merge.

## Non-goals

- Deploy / Alchemy / Cloudflare secrets
- Visual / e2e / Playwright
- Fixing existing Biome *warnings* (unused vars, unused suppressions)
- Changing `pnpm check` (`biome check --write .`) — CI must stay read-only
- Adding Vitest/Playwright or a new test framework

## Verified evidence (2026-08-16, worktree `feat/ci-pipeline`)

| Claim | Result | Source |
|---|---|---|
| No workflows | `.github` absent | worktree listing |
| `pnpm exec biome check .` fails | exit 1; 2 formatter **errors** on drizzle meta JSON | local run |
| `pnpm check-types` passes without env | exit 0 | local run |
| `pnpm build` passes with `VITE_SERVER_URL=http://localhost:3000` | exit 0 | local run |
| Web env schema requires `VITE_SERVER_URL` as URL | `packages/env/src/web.ts:7` | source |
| Root `check` mutates files | `"check": "biome check --write ."` | `package.json:18` |
| No test runner in any `package.json` | no `vitest`/`test` scripts | grep |

## Load-bearing decisions

1. **Unblock biome by ignoring generated drizzle meta**, not by reformatting it. Next `db:generate` rewrites those files with spaces; fighting the generator makes CI flake. Same pattern as existing `!**/dist` / `!**/.turbo` ignores.
2. **CI runs `pnpm exec biome check .`**, never `pnpm check`.
3. **Pin toolchain from live repo + live tags (2026-08-16):** pnpm from `packageManager` (`10.33.1`); Node **24** (no `engines` field; local `node -v` is `v24.15.0`; do not invent Node 22). Action majors verified via `gh api`: `actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6`.
4. **Set `VITE_SERVER_URL=http://localhost:3000` on the job** even though today's check-types passed without it. Schema is `z.url()`; hash of `auth-client` changed when the var was present. Dummy public URL, not a secret.
5. **Contract test uses `node:test`** — no new dependency. Not a fourth product feature; it is the TDD seam for this plan.
6. **Single job, sequential steps.** Issue did not ask for matrix or split jobs.

## Cross-Plan Dependencies

| Relationship | Plan | Status |
|---|---|---|
| None | `260815-1553-convert-open-design-v1-to-react-and-remove-better-t-mock-ui` is completed and does not share files | completed |

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Contract tests and biome unblock](./phase-01-start.md) | Pending |
| 2 | [Implement GitHub Actions workflow](./phase-02-implement-github-actions-workflow.md) | Pending |

## Acceptance Criteria

- [ ] `.github/workflows/ci.yml` exists
- [ ] Triggers: `pull_request` and `push` to `develop` and `main`
- [ ] Job runs `pnpm exec biome check .`, then `pnpm check-types`, then `pnpm build`
- [ ] Job does not run `biome check --write`
- [ ] Job does not require repo secrets
- [ ] `pnpm exec biome check .` exits 0 on this branch after the drizzle-meta ignore
- [ ] `node --test scripts/ci-workflow.test.mjs` exits 0
- [ ] `pnpm check-types` and `pnpm build` exit 0 locally with the same dummy `VITE_SERVER_URL`

## Risks

- First CI run on GitHub can still fail for runner/action-version reasons even if local commands pass. Response: read `gh run view` logs and fix the workflow only.
- Biome 2.5 treats formatter mismatches as errors. Ignoring only `packages/db/src/migrations/meta` keeps real source gated.
- Adding a workflow does not make it a required check. Branch protection is out of scope for #3 (repo settings). Residual: merges stay human-gated until protection is configured later.

## Validation Log

### Session 1 — 2026-08-16
**Trigger:** `/ak:vibe` mandatory `/ak:plan validate` (autonomous; no interview — all material decisions verified from source)
**Questions asked:** 0

#### Verification Results
- **Tier:** Light (2 phases, Fact Checker)
- **Claims checked:** 10
- **Verified:** 10 | **Failed:** 0 | **Unverified:** 0

| Claim | Result |
|---|---|
| No `.github/workflows` | VERIFIED (directory absent) |
| `"check": "biome check --write ."` | VERIFIED (`package.json:18`) |
| `packageManager` `pnpm@10.33.1` | VERIFIED (`package.json:33`) |
| `VITE_SERVER_URL: z.url()` | VERIFIED (`packages/env/src/web.ts:7`) |
| Web `check-types` runs `vite build && tsc --noEmit` | VERIFIED (`apps/web/package.json:10`) |
| Biome ignore uses `!**/dist` style | VERIFIED (`biome.json:13`) |
| Drizzle meta files exist | VERIFIED (`packages/db/src/migrations/meta/0000_snapshot.json`, `_journal.json`) |
| No `scripts/` dir yet | VERIFIED (listing) |
| Latest action tags | VERIFIED (`checkout` v7.0.1, `setup-node` v7.0.0, `pnpm/action-setup` v6.0.10) |
| Local Node | VERIFIED (`v24.15.0`) |

#### Confirmed Decisions
- Unblock biome by ignore glob, not reformatting generated JSON
- CI command is `pnpm exec biome check .`, never `pnpm check`
- Node 24 + current action majors
- Dummy `VITE_SERVER_URL=http://localhost:3000` on the job
- Contract test is TDD seam only; issue's three commands remain the product gate
- Branch protection not in this issue

#### Action Items
- None beyond accepted red-team edits already applied to phase 2

#### Impact on Phases
- Phase 2 YAML sketch updated to Node 24 and live action majors

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-start.md, phase-02-implement-github-actions-workflow.md
- Decision deltas checked: 3 (Node 24, action majors, scripts/ must be created)
- Reconciled stale references: Node 22 / checkout@v5 / setup-node@v4 removed
- Unresolved contradictions: 0

## Red Team Review

### Session — 2026-08-16
**Findings:** 6 (3 accepted, 3 rejected)
**Severity breakdown:** 0 Critical, 2 High, 4 Medium
**Note:** Hostile `code-reviewer` subagents were spawned then cancelled after ~8 min / 90 tool calls with no report file. Adjudication below is from orchestrator Fact Checker + Security / Assumption lenses against the same plan files and live `gh api` tags.

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | YAML sketch pins stale action majors (checkout@v5) | High | Accept | Phase 2 |
| 2 | Node 22 was assumed; local/runtime is Node 24 | High | Accept | Plan + Phase 2 |
| 3 | `scripts/` does not exist yet | Medium | Accept | Phase 1 (already said create) |
| 4 | Floating action tags (not SHA) | Medium | Reject | — |
| 5 | `check-types` already builds web; `build` is duplicate | Medium | Reject | — |
| 6 | Workflow is not a required GitHub check | Medium | Reject | residual risk only |

### Finding 1: Stale action majors — HIGH
**Reviewer:** Assumption Destroyer
**Location:** Phase 2, Architecture
**Flaw:** Sketch used `actions/checkout@v5`, `actions/setup-node@v4`, `pnpm/action-setup@v4`.
**Failure scenario:** First GitHub run 404s on a removed major, or silently uses an old major with different `cache:` semantics.
**Evidence:** `gh api` latest tags 2026-08-16: checkout `v7.0.1`, setup-node `v7.0.0`, pnpm/action-setup `v6.0.10`.
**Disposition:** Accept
**Rationale:** Load-bearing. Updated sketch to `@v7` / `@v7` / `@v6`.

### Finding 2: Node 22 is unverified — HIGH
**Reviewer:** Assumption Destroyer
**Location:** plan.md Load-bearing decision 3
**Flaw:** Plan invented Node 22 because no `engines` field.
**Failure scenario:** CI on 22 passes while local Node 24 (v24.15.0) is what we actually ran `check-types`/`build` on; inverse also possible.
**Evidence:** `node -v` → `v24.15.0`; no `engines` in `package.json`.
**Disposition:** Accept
**Rationale:** Match the verified local toolchain.

### Finding 3: scripts/ missing — MEDIUM
**Reviewer:** Fact Checker
**Location:** Phase 1, Related Code Files
**Flaw:** Create path `scripts/ci-workflow.test.mjs` but `scripts/` is absent.
**Evidence:** `ls scripts` → no such directory.
**Disposition:** Accept
**Rationale:** Phase 1 already says create `scripts/` if needed. Keep explicit.

### Finding 4: SHA-pin actions — MEDIUM
**Reviewer:** Security Adversary
**Location:** Phase 2, Architecture
**Flaw:** Mutable tags can be retargeted.
**Evidence:** Plan pins majors only.
**Disposition:** Reject
**Rationale:** No existing SHA-pin convention in repo (no workflows). Issue asked for a quality gate, not a supply-chain program. Majors are enough. Revisit if the repo later adopts pin-by-SHA.

### Finding 5: Duplicate vite build — MEDIUM
**Reviewer:** Scope Critic
**Location:** Phase 2, required commands
**Flaw:** `apps/web/package.json:10` already runs `vite build` inside `check-types`.
**Disposition:** Reject
**Rationale:** Issue #3 explicitly names both `pnpm check-types` and `pnpm build`. HOLD SCOPE. Do not drop `build`.

### Finding 6: Not a required check — MEDIUM
**Reviewer:** Security Adversary
**Location:** plan.md Outcome
**Flaw:** A workflow file does not block merge by itself.
**Disposition:** Reject (as in-scope work)
**Rationale:** Branch protection is a repo-settings change, not requested. Recorded as residual risk.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-start.md, phase-02-implement-github-actions-workflow.md
- Decision deltas checked: 3
- Reconciled stale references: Node 22, checkout@v5, setup-node@v4, pnpm/action-setup@v4
- Unresolved contradictions: 0
