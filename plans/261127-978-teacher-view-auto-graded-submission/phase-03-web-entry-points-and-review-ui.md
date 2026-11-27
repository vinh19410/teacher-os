---
phase: 3
title: "Phase 3: Web Entry Points & Review UI"
status: completed
priority: P1
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: Web Entry Points & Review UI

## Goal

Update the web grading repo, add `"Xem bài làm"` entry points on `ClassAssignmentsTab`, `/students/$studentId` tab **Bài tập**, and `/grading`, and render read-only auto-graded submission review on `/grading/$attemptId` with source-aware back navigation (`?from=`).

## Files to Create / Modify

- Modify: `apps/web/src/lib/repos/grading.ts` & `apps/web/src/lib/repos/grading.test.ts`
- Modify: `apps/web/src/components/classes/class-assignments-tab.tsx` & `apps/web/src/components/classes/class-assignments-tab.test.tsx`
- Modify: `apps/web/src/lib/repos/student-assignments.ts` & `apps/web/src/lib/repos/student-assignments.test.ts`
- Modify: `apps/web/src/routes/_auth/students/$studentId.tsx` & `apps/web/src/routes/_auth/students/$studentId.test.tsx`
- Modify: `apps/web/src/routes/_auth/grading/index.tsx` & `apps/web/src/routes/_auth/grading/index.test.tsx`
- Create: `apps/web/src/components/grading/auto-submission-view.tsx` & `apps/web/src/components/grading/auto-submission-view.test.tsx`
- Modify: `apps/web/src/routes/_auth/grading/$attemptId.tsx`

## Tasks & Steps

### Task 3.1 — Update web grading repo and add TDD unit tests

- **Goal:** Switch `fetchGradingQueue` to `?includeAuto=1` (`GradingQueueV2Response`), `fetchSubmission` to `?v=2` (`TeacherAttemptReview`), and expose `gradingAudioUrl`.
- **Target files and symbols:** `apps/web/src/lib/repos/grading.ts`, `apps/web/src/lib/repos/grading.test.ts`.
- **Steps:**
  1. Update `grading.test.ts` first (fail on old URLs/schemas) then update `grading.ts`.
- **Success criteria:** All `grading.test.ts` assertions pass.
- **Verify:** `CI=1 pnpm --filter web exec vitest run src/lib/repos/grading.test.ts` exits 0.

### Task 3.2 — Enable entry points in `ClassAssignmentsTab` and Student `Bài tập` tab [TDD]

- **Goal:** Allow teachers to open submitted auto-graded attempts from class panels and student assignment rows without nested interactive elements or touching #977 score columns.
- **Target files and symbols:** `class-assignments-tab.tsx`, `class-assignments-tab.test.tsx`, `student-assignments.ts`, `student-assignments.test.ts`, `$studentId.tsx`, `$studentId.test.tsx`.
- **Steps:**
  1. Write/update tests first across `class-assignments-tab.test.tsx`, `student-assignments.test.ts`, and `$studentId.test.tsx` (red phase).
  2. Update `class-assignments-tab.tsx` to render `Xem bài làm` link (`?from=class`) for submitted non-gradable attempts and preserve `TargetGradeActions` (`?from=class`) for gradable/graded attempts.
  3. Update `student-assignments.ts` (`attemptId`, `gradable`) and `$studentId.tsx` (`validateSearch` `?tab=`, `DataTable` `row.onClick` → `/grading/$attemptId?from=student`, static trailing `<span>` action label, preserving columns 0–4).
- **Success criteria:** All selector, class tab, and student detail tests (including #957 Band tests) pass.
- **Verify:** `CI=1 pnpm --filter web exec vitest run src/components/classes/class-assignments-tab.test.tsx src/lib/repos/student-assignments.test.ts 'src/routes/_auth/students/$studentId.test.tsx'` exits 0.

### Task 3.3 — Update `/grading` queue, add `AutoSubmissionView`, and update `/grading/$attemptId` [TDD]

- **Goal:** Support all 6 skills and `Tự chấm` filter on `/grading`, render read-only `AutoSubmissionView` on `/grading/$attemptId` for `kind === "auto"`, and support `?from=grading|class|student` back-navigation.
- **Target files and symbols:** `grading/index.tsx`, `grading/index.test.tsx`, `auto-submission-view.tsx`, `auto-submission-view.test.tsx`, `grading/$attemptId.tsx`.
- **Steps:**
  1. Add failing tests in `auto-submission-view.test.tsx` and `grading/index.test.tsx` (red phase).
  2. Update `grading/index.tsx` (6 skill chips, `Tự chấm` status chip, `awaitingCount` manual-only, `Tự chấm · X/Y` tag, `Xem bài làm` link with `?from=grading`).
  3. Create `auto-submission-view.tsx` (`AttemptScoreCard`, `AttemptCompactList`, `QuizPaper mode="review"` with `answerLabel: "Học viên trả lời"`, `QuizNavigator mode="review"`, audio + transcript).
  4. Update `grading/$attemptId.tsx` (`validateSearch` `?from=`, `kind === "auto"` read-only branch, source-aware back links).
- **Success criteria:** All web unit/component tests, biome check, and workspace typecheck pass.
- **Verify:** `CI=1 pnpm --filter web test && pnpm exec biome check . && VITE_SERVER_URL=http://localhost:8000 pnpm check-types` exits 0.

## Verification

- `CI=1 pnpm --filter web test` exits 0.
- `pnpm exec biome check .` exits 0.
- `VITE_SERVER_URL=http://localhost:8000 pnpm check-types` exits 0.

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
