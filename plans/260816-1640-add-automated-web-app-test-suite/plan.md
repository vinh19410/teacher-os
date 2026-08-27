---
title: "Add automated web app test suite"
description: "Add Vitest and lock the mock data-store reducer plus cross-view numeric consistency invariants, then run the suite in CI."
status: completed
priority: P1
effort: "4h"
issue: 4
branch: feat/web-app-test-suite
tags: [feature, frontend, infra, testing]
blockedBy: []
blocks: []
created: 2026-08-16
---

# Add automated web app test suite

Tracking: #4

## Overview

Issue #4 (from the PR #2 advisory gate) asks for an automated test runner starting with the in-memory data-store reducer and the cross-view numeric consistency invariants (check-in ↔ student package counts ↔ tuition remaining; mark-paid; grading; syllabus CRUD totals).

No Vitest/Playwright exists. `apps/web/src/lib/data-store.tsx` owns an unexported `reducer`. CI (issue #3) runs biome + check-types + build only.

## Scope Challenge

- Existing: CI quality job; `scripts/ci-workflow.test.mjs` (`node:test`); unexported `reducer` in `data-store.tsx` (376 lines); views read the same store.
- Requested: a runner + tests for the reducer and cross-view numeric invariants.
- Complexity: ~8 files, 0 new product services, 3 phases.
- Selected mode: HOLD SCOPE. Fast + `--tdd`.

## Outcome

`pnpm test` runs a Vitest suite that fails if the reducer drifts from **current** store behavior: check-in package math, mark-paid invoice fields, raw grade scores, syllabus create/mutate totals. CI runs that command on PRs and on `develop`/`main`.

This is a characterization suite of the mock store. It does **not** prove every on-screen number updates (several StatCards and alerts are hardcoded) and it does **not** lock financial/authz integrity.

## Non-goals

- Playwright / Testing Library / browser e2e
- Testing search UI (`topbar.tsx` reads `data.students`, no dispatch)
- Rewriting hardcoded numbers: dashboard weekly StatCards (`7.5`, `6.2tr`, `2.0tr`, `2`), dashboard "Cần xử lý" list, tuition StatCards (`21.0tr`, `1.9tr`, `2`), reports/notif copy
- Changing reducer behavior, seed data, or view copy — including known gaps (`sessionsDone` not incremented; check-in of `cancelled`/`absent` still +1; no authz)
- Moving score validation (0–9) from `GradeModal` into the reducer
- Auth, server, DB, deploy; this store is an in-memory demo after login, not a payment control

## Verified evidence (2026-08-16, worktree `feat/web-app-test-suite`)

| Claim | Result | Source |
|---|---|---|
| No web test runner | `apps/web/package.json` has no `test` / vitest | source |
| Root has only CI contract test | `"test:ci-workflow": "node --test scripts/ci-workflow.test.mjs"` | `package.json` |
| CI has no test step | biome, check-types, build only | `.github/workflows/ci.yml` |
| `reducer` is unexported | `function reducer` | `apps/web/src/lib/data-store.tsx:131` |
| Check-in updates lesson + `pkg.done`/`remaining` only | no `classes.sessionsDone` write | `data-store.tsx:133-147` |
| Dashboard risk **membership** is tags/`atRisk`, not remaining | filter at `:20-25`; remaining/debt cells only for those rows | `dashboard.tsx:20-25`, `:160-166`, `:181` |
| Invoice **sum** exists in one view cell | unpaid+overdue reduce | `dashboard.tsx:160-166` only |
| Students list remaining | `{remaining} / {total}` — no `done`, no invoice | `students/index.tsx:68-69` |
| Tuition package table | `pkg.done/total` + `pkg.remaining` | `tuition.tsx:76-87` |
| Tuition money StatCards hardcoded | `"21.0tr"`, `"1.9tr"`, `"2"` | `tuition.tsx:40-50` |
| Weekly StatCards hardcoded | `"7.5"`, `"6.2tr"`, `"2.0tr"`, `"2"` | `dashboard.tsx:136-147` |
| Class progress uses `sessionsDone` | check-in does not write it | `classes/index.tsx:51-54,84`; `classes/$classId.tsx:98-99` |
| `LessonStatus` has no `"scheduled"` | `completed \| upcoming \| cancelled \| absent` | `mock-data.ts:31` |
| Vitest 4.1 supports Vite 8 | vitest.dev 2026-03-12 | current docs |

## Load-bearing decisions

1. **Vitest ≥ 4.1 in `apps/web`**, not Playwright. Issue names both as examples; starting surface is a pure reducer. Vitest 4.1 is the first line that supports installed Vite 8.
2. **Extract `reducer` + `Action` to `apps/web/src/lib/data-store-reducer.ts`.** File already exceeds 200 lines; tests must not import a React component module. Behavior stays byte-equivalent.
3. **Always `export type { Action } from "./data-store-reducer"` in `data-store.tsx`.** Named public export stays even though no current caller imports it.
4. **Do not add `@testing-library/*`.** No component tests. Tests `import { expect, test, describe } from "vitest"` (no globals — `tsconfig` `types` is only `vite/client`).
5. **Characterization, not "every view in sync".** Lock store fields that listed views already read. Explicitly lock the `sessionsDone` gap (check-in leaves `classes` unchanged). Hardcoded StatCards are out of suite.
6. **Search stays out.** `topbar.tsx:28-38` does not dispatch.
7. **CI runs `pnpm test`.** Contract asserts the exact YAML line `run: pnpm test`, root script contains `turbo run test` and `test:ci-workflow`, `turbo.json` has `test`, `apps/web` script is `vitest run`.
8. **`uid()` stays `crypto.randomUUID`.** Never assert generated ids. Prefix `/^(s|c|m|l)-/` only for actions that call `uid`. `add-syllabus` asserts `id === payload.id`.
9. **Root `test` script** = `turbo run test && pnpm test:ci-workflow`. Web: `vitest run`. Verify `turbo run test` locally (packages without `test` must skip, same as `check-types` vs empty `packages/auth` scripts).
10. **Demo store, no authz.** Tests comment that any session can dispatch any id; when the mock is replaced by an API those tests may be deleted. Do not add `actorId`.
11. **Phase 1 lands a stub `data-store-reducer.ts`** so `tsc --noEmit` never sees a missing module. Invariant tests stay red until the extract.

## Cross-Plan Dependencies

| Relationship | Plan | Status |
|---|---|---|
| Extends CI contract | `260816-1559-add-ci-pipeline-biome-check-types-build` (completed; this plan adds the test step that plan explicitly deferred) | completed |
| None blocking | `260815-1553-convert-open-design-v1-to-react-and-remove-better-t-mock-ui` | completed |

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Scaffold Vitest runner](./phase-01-start.md) | Completed |
| 2 | [Extract reducer and lock invariants](./phase-02-extract-reducer-and-lock-invariants.md) | Completed |
| 3 | [Wire tests into CI quality gate](./phase-03-wire-tests-into-ci-quality-gate.md) | Completed |

## Acceptance Criteria

- [x] `apps/web` has Vitest ≥ 4.1 and `pnpm --filter web test` exits 0
- [x] `reducer` is a named export from `data-store-reducer.ts`; `data-store.tsx` re-exports `Action` and uses that same `reducer` in `useReducer`
- [x] Tests cover: check-in `l3` (`upcoming`) package math; completed `l1` no-op (`toBe` same ref); cancelled `l9` current hole (+1); mark-paid; grade raw scores; syllabus create vs mutate totals; cancel-lesson / add-student / add-class / update-class-notes shape
- [x] After check-in `l3`, `s1.pkg.done += 1` and `remaining = max(0, total - done)`; `classes` (incl. `sessionsDone`) unchanged. Same next-state fields are what students list (`:68`), student detail (`:139-140`), class roster (`:139`), and tuition package table (`:76-87`) render — not StatCards
- [x] CI YAML has a step whose entire command is `pnpm test`; contract also asserts web `vitest run` + turbo `test` task
- [x] Finished tree: `pnpm exec biome check .` and `pnpm check-types` stay green (no missing-module intermediate on the branch tip)

Shipped 2026-08-16 (issue #4). Wave 0 later moved runtime off `useReducer`; reducer + tests remain as historical fixtures. Wave 4 made check-in derive-only (pkg counters no longer written in the reducer).

## Ship

- Mode: beta → `develop`
- Route: feature via `/ak:cook --tdd --auto`
- Branch: `feat/web-app-test-suite`

## Red Team Review

### Session — 2026-08-16
**Findings:** 15 unique after dedup (11 accepted, 4 rejected)
**Severity breakdown:** 2 Critical, 8 High, 5 Medium (pre-dedup 27 across 3 reviewers)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Outcome "every view" / phantom citations | Critical | Accept | plan.md Outcome/AC; phase-02 #9 |
| 2 | `"scheduled"` is not a `LessonStatus` | High | Accept | plan.md AC; phase-02 fixtures `l3` |
| 3 | Phase 1 missing module vs `check-types` green | High | Accept | phase-01 stub module |
| 4 | `add-syllabus` total vs recompute-to-0 | High | Accept | phase-02 #7 |
| 5 | Dashboard risk is tags, invoice sum is one cell | High | Accept | plan.md evidence; phase-02 #9 |
| 6 | CI `/pnpm test/` hollow contract | High | Accept | phase-03 Tests Before |
| 7 | Lock `sessionsDone` gap; outcome was inverted | High | Accept | plan.md Outcome; phase-02 #1 |
| 8 | Unknown-id `toBe` only for check-in | Medium | Accept | phase-02 #5 |
| 9 | `uid` prefix vs `add-syllabus` `sy-` | Medium | Accept | plan.md #8; phase-02 #7 |
| 10 | Must re-export `Action` | Medium | Accept | plan.md #3; phase-02 |
| 11 | Four live actions untested | High | Accept | phase-02 #8 (shape only) |
| 12 | Zero-authz / IDOR as product hole to "fix" | High | Reject | threat model: demo store; comment only |
| 13 | Move 0–9 grade validation into reducer | High | Reject | would change product; UI stays owner |
| 14 | Reject duplicate syllabus ids | High | Reject | behavior change; not requested |
| 15 | CI contract must grep invariant names / `cache: false` | High | Reject | YAML+scripts enough; not a security control |

**Reject rationale (12–15):** Issue #4 asks for a runner + reducer/invariant tests on a client mock store. There is no invoice API (`apps/server` mounts `/api/auth/*` only). Hardening authz or moving validation would reverse "lock current behavior". CI contract asserting test *file contents* is gold-plating beyond the quality-gate pattern already in `ci-workflow.test.mjs`.

Reports: `reports/red-team-security-adversary.md`, `reports/red-team-assumption-destroyer.md`, `reports/red-team-failure-mode-analyst.md`.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-start.md, phase-02-extract-reducer-and-lock-invariants.md, phase-03-wire-tests-into-ci-quality-gate.md
- Decision deltas checked: 11 accepted
- Reconciled stale references: "scheduled", invoice-sum citations, `/pnpm test/` Tests Before vs Risk, Action re-export, check-types vs missing module, Outcome "every view"
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-08-16
**Trigger:** `/ak:vibe` autonomous plan gates (validate after red-team). User already chose issue #4 + `--ship --beta`; no remaining user fork.
**Questions asked:** 0 live (decisions taken from issue text + verified source; red-team applied)

#### Confirmed Decisions
- Runner: Vitest ≥ 4.1, not Playwright — issue says "starting with the data-store reducer"
- No Testing Library this plan
- Characterization of current reducer, not a rewrite of hardcoded StatCards
- Search UI out (no dispatch)
- CI step in scope ("automated")
- Demo store: no authz tests-as-product

#### Verification Results
- **Tier:** Standard (3 phases; Fact Checker + Contract Verifier)
- **Claims checked:** 18
- **Verified:** 16 | **Failed:** 2 (fixed) | **Unverified:** 0

Failed-then-fixed:
1. `tuition.tsx:77-87` is package counts, not invoice sums — citations rewritten
2. `"scheduled"` does not exist — fixtures now `upcoming` / `l3`

#### Whole-Plan Consistency Sweep
- Files reread after validation recording: plan.md + 3 phases
- Decision deltas checked: same 11 accepted findings
- Reconciled stale references: 0 remaining
- Unresolved contradictions: 0

<!-- slug: add-automated-web-app-test-suite -->

