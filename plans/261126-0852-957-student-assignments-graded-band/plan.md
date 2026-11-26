---
title: "Fix graded Band display on student Bài tập tab (#957)"
description: "Propagate validated target.band and target.gradedAt through studentAssignmentRows and render graded Band + Đã chấm status on /teacher/students/$studentId tab Bài tập, matching /teacher/grading."
status: completed
priority: P1
effort: "2h"
tags: [bugfix, web, grading, students, issue-957]
created: 2026-11-26
---

# Fix graded Band display on student Bài tập tab (#957)

## Overview

<!-- Updated: Red-Team Session 1 - clarify classStudyPackId === null scope -->
When a teacher grades a submitted regular class assignment (`classStudyPackId === null` — Writing, Speaking, or hybrid Writing) via `/teacher/grading`, the server snapshot (`apps/server/src/routes/snapshot.ts:527,545,554-610`) and client mapper (`apps/web/src/lib/repos/class-assignments.ts:18-24`) already populate `target.band` and `target.gradedAt` on `data.classAssignments[].targets[]`, and saving a grade already invalidates `kernelQueryKey` (`apps/web/src/routes/_auth/grading/$attemptId.tsx:131-134`).

However, two client files written before `#319` were never updated:
1. `apps/web/src/lib/repos/student-assignments.ts` drops `target.band` and `target.gradedAt` when projecting `kind: "class"` rows into `StudentAssignmentRow`.
2. `apps/web/src/routes/_auth/students/$studentId.tsx` hardcodes `"—"` in column 3 (`Band`) for every `row.kind === "class"` row inside `assignmentRowCells`.

This plan follows the TDD handover contract (`--tdd --advice`).

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - `apps/web/src/lib/repos/student-assignments.ts` + `apps/web/src/lib/repos/student-assignments.test.ts`: add `band: number | null` and `gradedAt: string | null` to `StudentAssignmentRow` and map them from `target` for `kind: "class"` rows using domain validation (`isBandStep` + finite `Date.parse(gradedAt)`), returning `null` for `kind: "grading"` rows.
  - `apps/web/src/routes/_auth/students/$studentId.tsx` + `apps/web/src/routes/_auth/students/$studentId.test.tsx`: render `formatBand(row.band)` in the Band column and `<StatusTag tone="ok">Đã chấm</StatusTag>` in the Trạng thái column whenever a `class` row has a valid graded band and timestamp (including `band === 0` and flip-first `submittedAt === null`).
  - `apps/e2e/specs/teacher-grade-submission.spec.ts`: extend the Writing grading end-to-end test using SPA navigation (sidebar `Học viên` → student row → `role="tab"` `Bài tập`) to verify live cache invalidation and rendered Band (`6.5`) + `Đã chấm` (plus unsubmitted Speaking row still showing `"—"` + `"Chưa nộp"`), with opt-in `CAPTURE_POT_ISSUE=957` screenshot/320px/keyboard verification wrapped in `try/finally`.
- **Explicit Non-Goals:**
  - Do not modify `apps/server/src/routes/snapshot.ts`, `apps/server/src/routes/grading.ts`, `packages/api/src/contracts.ts`, `apps/web/src/components/assignments/assignment-status.ts`, or legacy `kind: "grading"` row rendering.
  - Do not include `mode === "practice"` or `classStudyPackId !== null` rows in tab `Bài tập`.
  - Do not add `<Link to="/grading/$attemptId">` or migrate `$studentId` tab state from `useState` to URL search params in this bugfix PR.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Propagate validated `band` (`isBandStep`) and `gradedAt` (parseable timestamp) from `classAssignments[].targets[]` into `StudentAssignmentRow` without breaking legacy fixtures or leaking across students | P1 |
| 2 | Render `formatBand(row.band)` and `<StatusTag tone="ok">Đã chấm</StatusTag>` for graded `class` rows on `/teacher/students/$studentId` tab `Bài tập` with full unit, component, E2E SPA, and `REVIEW.md` UI verification | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Propagate graded Band in selector](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Render Band & status and verify E2E](./phase-02-render-band-status-and-verify-e2e.md) | Completed |

## Success Criteria

- [x] `studentAssignmentRows` exposes `band: number | null` and `gradedAt: string | null` on `StudentAssignmentRow` (including `band: 0`, missing optional target fields coalesced to `null`, invalid/out-of-range/partial/non-parseable grades normalized to `null`, multi-student target isolation, and `grading` rows returning `null`).
- [x] On `/teacher/students/$studentId` → tab **Bài tập**, graded `class` assignments display `formatBand(row.band)` (e.g. `5.5`, `6.5`, `0.0`) in the Band column with `font-semibold text-primary tabular-nums` and `<StatusTag tone="ok">Đã chấm</StatusTag>` in the Trạng thái column.
- [x] Ungraded submitted assignments (Writing/Speaking awaiting grading and auto-graded Reading/Listening/Grammar/Vocab), unsubmitted assignments, other students' grades on the same assignment, and malformed/partial grade fields continue to display `"—"` in the Band column and their `studentSubmissionStatus` tag.
- [x] Flip-first edge case (`submittedAt: null` on a past-due assignment while valid `band` and `gradedAt` are present) displays the graded Band and `"Đã chấm"`, never `"Chưa nộp · quá hạn"`.
- [x] Legacy `kind: "grading"` rows preserve existing link, Band, and status behavior.
- [x] `CI=1 pnpm --filter web test` (217/217 files, 2484/2484 tests), `pnpm check` (0 errors), `VITE_SERVER_URL=http://localhost:8000 pnpm check-types`, 5 root script suites (incl. `pnpm test:design-compare`), and single-spec E2E `specs/teacher-grade-submission.spec.ts` (ports 8100–8105, SPA flow, `#383` PNGs clean) all pass, with 6 visually verified POT screenshots across 3 viewports × 2 themes + 320px reflow + keyboard focus. (`node scripts/design-compare/capture.mjs --screens t-student-detail` waived per Kongming Option 1 due to pre-existing `capture.mjs` `settle()` race tracked in follow-up issue #987; `t-student-detail` only captures the unchanged `Hồ sơ` tab while `.state/debug/` confirmed full render.)

## Red Team Review

### Session — 2026-11-26
**Findings:** 8 deduplicated (8 accepted, 0 rejected) from 2 adversarial lenses (Security Adversary + Assumption Destroyer)
**Severity breakdown:** 0 Critical, 5 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `Tabs` uses `role="tab"` (not `button`) and `"Bài tập"` collides with sidebar/table header | High | Accept | Phase 2 (Tasks 2.1, 2.3) |
| 2 | Unpinned `Date.now()` in `$studentId.test.tsx` risks time-rot and phantom flip-first test | High | Accept | Phase 2 (Task 2.1) |
| 3 | `snapshotFixture` wire types (`studentId`, 21-field prompt, 5-field target) & `beforeEach` reset requirements | High | Accept | Phase 2 (Task 2.1) |
| 4 | `teacherPage.goto` bypasses SPA `kernelQueryKey` invalidation & spec overwrites 6 tracked `#383` PNGs | High | Accept | Phase 2 (Task 2.3) |
| 5 | Missing `pnpm design:compare` gate (`REVIEW.md`) & unsafe screenshot capture without opt-in/`try/finally` | High | Accept | Plan, Phase 2 (Task 2.3, Verification) |
| 6 | Validate IELTS band domain (`isBandStep` 0–9 step 0.5) & parseable `gradedAt` + add boundary unit tests (`NaN`/`Infinity`/`-0.5`/`9.5`/`6.3`/`"   "`/`"not-a-date"`/reverse partial) | Medium | Accept | Phase 1 (Tasks 1.1, 1.2), Phase 2 (Tasks 2.1, 2.2) |
| 7 | Missing multi-student grade isolation test on shared `classAssignments[].targets[]` + unsubmitted Speaking assertion in E2E | Medium | Accept | Phase 1 (Task 1.1), Phase 2 (Tasks 2.1, 2.3) |
| 8 | Overview overstated `snapshot.ts` coverage of Study Pack assignments (`classStudyPackId !== null`) | Medium | Accept | Plan Overview |

## Validation Log

### Session 1 — 2026-11-26
- **CLI format validation:** `ak plan validate plans/261126-0852-957-student-assignments-graded-band --json` → `valid: true`, `errors: null`.
- **Verification Results:**
  - Verified: 12 claims (`snapshot.ts:527,545,554-610`, `class-assignments.ts:18-24`, `grading/$attemptId.tsx:131-134`, `tabs.tsx:25-38`, `ielts-band.ts:129-152`, `student-assignments.ts:44-108`, `$studentId.tsx:79-148`, `kernel-harness.tsx:20-141`, `contracts.ts:2000-2189`, `teacher-grade-submission.spec.ts:149-178,259-262,449-488`, `REVIEW.md:43-46`, `screens.json:108-116`).
  - Failed: 0 (all 8 red-team discrepancies resolved inline prior to execution).
  - Unverified: 0.
- **Whole-Plan Consistency Sweep:** All links (`phase-01-start.md`, `phase-02-render-band-status-and-verify-e2e.md`), frontmatter fields, handover task fields, mechanical Verify commands, and literal `## Failure Protocol` blocks match across `plan.md` and both phase files.

<!-- slug: 957-student-assignments-graded-band -->
