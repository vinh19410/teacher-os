---
phase: 1
title: "Phase 1: Propagate graded Band in selector"
status: completed
priority: P1
effort: "45m"
dependencies: []
---

# Phase 1: Propagate graded Band in selector

## Goal

Extend `StudentAssignmentRow` and `studentAssignmentRows` in `apps/web/src/lib/repos/student-assignments.ts` so `kind: "class"` rows faithfully propagate domain-validated `band` and `gradedAt` from the matching student's `classAssignments[].targets[]` entry while coalescing omitted/invalid fields to `null` and keeping `kind: "grading"` rows at `null`.

## Files to Create / Modify

- Modify: `apps/web/src/lib/repos/student-assignments.test.ts`
- Modify: `apps/web/src/lib/repos/student-assignments.ts`

## Tasks & Steps

### Task 1.1 — Add failing TDD selector tests for `band` and `gradedAt` propagation

<!-- Updated: Red-Team Session 1 - add domain boundary tests and multi-student isolation -->
- **Goal:** Establish failing unit tests covering graded class targets (`5.5`, `6.5`, `0`), legacy targets missing optional grading fields, malformed/partial/out-of-range grade values, multi-student target isolation, and legacy `grading` rows.
- **Target files and symbols:** `apps/web/src/lib/repos/student-assignments.test.ts` (`describe("studentAssignmentRows (#317)", ...)`).
- **Steps:**
  1. Add test cases to `apps/web/src/lib/repos/student-assignments.test.ts`:
     - Class targets with `{ studentId: "s-1", submittedAt: "2026-11-20T10:00:00.000Z", attemptId: "att-1", gradedAt: "2026-11-21T08:00:00.000Z", band: 5.5 }` and a second assignment with `band: 6.5` yield exact `band` (`5.5`, `6.5`) and `gradedAt`.
     - Class target with `band: 0` and valid ISO `gradedAt` preserves `band: 0` (never coerced to `null` by truthiness).
     - Class target omitting optional `band`/`gradedAt` fields (legacy fixture `{ studentId: "s-1", submittedAt: null }`) yields explicit `band: null` and `gradedAt: null` (not `undefined`).
     - Malformed/incomplete grade targets all normalize to `band: null` and `gradedAt: null`:
       - `band: 6.5, gradedAt: null`
       - `band: 6.5, gradedAt: "   "` (whitespace)
       - `band: 6.5, gradedAt: "not-a-date"` (unparseable timestamp)
       - `band: null, gradedAt: "2026-11-21T08:00:00.000Z"` (reverse partial)
       - `band: Number.NaN`, `band: Number.POSITIVE_INFINITY`, `band: -0.5`, `band: 9.5`, `band: 6.3` (outside IELTS 0–9 0.5-step domain) with valid `gradedAt`.
     - Multi-student isolation: on one `classAssignment` whose `targets` has `s-other` graded (`band: 8.0`, valid `gradedAt`) and `s-1` ungraded (`band: null`, `gradedAt: null`), `studentAssignmentRows(data, "s-1")[0]` returns `band: null` and `gradedAt: null` (no cross-student grade leak).
     - Legacy `kind: "grading"` row yields `band: null` and `gradedAt: null` alongside its existing `scores`.
  2. Do not edit `student-assignments.ts` yet.
- **Success criteria:** New tests fail because `StudentAssignmentRow` does not yet expose `band` and `gradedAt`.
- **Verify:** `pnpm --filter web exec vitest run src/lib/repos/student-assignments.test.ts` exits non-zero with assertion failure on `band`/`gradedAt` (passing test is a failure in red phase).

### Task 1.2 — Implement validated `band` and `gradedAt` propagation in `studentAssignmentRows`

<!-- Updated: Red-Team Session 1 - validate with isBandStep and Date.parse -->
- **Goal:** Add `band: number | null` and `gradedAt: string | null` to `StudentAssignmentRow` and populate them with IELTS domain and timestamp validation in `studentAssignmentRows`.
- **Target files and symbols:** `apps/web/src/lib/repos/student-assignments.ts` (`StudentAssignmentRow`, `studentAssignmentRows`, import `isBandStep` from `@teacher-os/api/lib/ielts-band`).
- **Steps:**
  1. Import `isBandStep` from `@teacher-os/api/lib/ielts-band`.
  2. Add two fields to `StudentAssignmentRow`:
     - `band: number | null;` — graded overall IELTS band (`0..9`, `0.5` step) for `class` rows when accompanied by a parseable `gradedAt`; `null` otherwise and on `grading` rows.
     - `gradedAt: string | null;` — parseable ISO grading timestamp for `class` rows when accompanied by a valid `band`; `null` otherwise and on `grading` rows.
  3. In `studentAssignmentRows`, inside the `ca.targets` loop (after `if (target.studentId !== studentId) continue;`), validate:
     ```ts
     const hasGrade =
     	typeof target.band === "number" &&
     	isBandStep(target.band) &&
     	typeof target.gradedAt === "string" &&
     	target.gradedAt.trim().length > 0 &&
     	Number.isFinite(Date.parse(target.gradedAt));
     ```
     and set `band: hasGrade ? target.band : null` and `gradedAt: hasGrade ? target.gradedAt : null`.
  4. In the `data.assignments` loop (`kind: "grading"`), set `band: null` and `gradedAt: null`.
- **Success criteria:** All existing and new selector unit tests pass, `band: 0` is preserved, cross-student targets stay isolated, and omitted/partial/out-of-range/unparseable fixtures normalize to `null`.
- **Verify:** `pnpm --filter web exec vitest run src/lib/repos/student-assignments.test.ts` exits 0 and prints all tests passed.

## Verification

- `pnpm --filter web exec vitest run src/lib/repos/student-assignments.test.ts` exits 0.
- `pnpm --filter web run check-types` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
