---
phase: 1
title: "Phase 1: Contracts and Shared Quiz UI"
status: completed
priority: P1
effort: "45m"
dependencies: []
---

# Phase 1: Contracts and Shared Quiz UI

## Goal

Define opt-in v2 grading review and queue schemas in `packages/api/src/contracts.ts` without breaking v1 `.strict()` contracts, and add configurable `answerLabel` to `QuizReviewItem` in `packages/ui/src/components/quiz/quiz-review-item.tsx`.

## Files to Create / Modify

- Create: `packages/api/src/grading-review.contracts.test.ts`
- Modify: `packages/api/src/contracts.ts`
- Modify: `packages/ui/src/components/quiz/quiz-review-item.tsx`
- Create: `packages/ui/src/components/quiz/quiz-review-item.test.tsx`

## Tasks & Steps

### Task 1.1 — Add failing contract tests for v2 grading review and queue schemas

- **Goal:** Establish failing TDD tests asserting strict v1 isolation and strict v2 validation for `teacherAutoSubmissionSchema`, `teacherAttemptReviewSchema`, `gradingQueueItemV2Schema`, and `gradingQueueV2ResponseSchema`.
- **Target files and symbols:** `packages/api/src/grading-review.contracts.test.ts`.
- **Steps:**
  1. Write unit tests verifying v1 `teacherSubmissionSchema` and `gradingQueueItemSchema` still reject `skill: "grammar"`, `kind: "auto"`, and `autoScore`.
  2. Write unit tests verifying `teacherAutoSubmissionSchema` and `teacherAttemptReviewSchema` accept valid auto-graded submissions (`reading`, `listening`, `grammar`, `vocabulary`) and `TeacherSubmission` items, while rejecting unknown keys (`.strict()`).
  3. Write unit tests verifying `gradingQueueV2ResponseSchema` accepts all 6 skills and `autoScore: { correctCount, totalCount } | null | undefined`, while rejecting unknown keys.
- **Success criteria:** Test run fails because the new v2 schemas are not exported yet.
- **Verify:** `pnpm --filter @teacher-os/api test src/grading-review.contracts.test.ts` exits non-zero.

### Task 1.2 — Implement v2 contracts in `packages/api/src/contracts.ts`

- **Goal:** Export `teacherAutoSubmissionQuestionSchema`, `teacherAutoSubmissionDetailSchema`, `teacherAutoSubmissionSchema`, `teacherAttemptReviewSchema`, `gradingQueueAutoScoreSchema`, `gradingQueueItemV2Schema`, `gradingQueueV2ResponseSchema`, and their inferred TypeScript types.
- **Target files and symbols:** `packages/api/src/contracts.ts` (placed after `quizAttemptDetailSchema` to avoid TDZ issues).
- **Steps:**
  1. Ensure `AUTO_GRADABLE_SKILLS` is imported from `./lib/ielts-band`.
  2. Define `teacherAutoSubmissionQuestionSchema`, `teacherAutoSubmissionDetailSchema`, `teacherAutoSubmissionSchema`, and `teacherAttemptReviewSchema` strictly after `quizAttemptDetailSchema`.
  3. Define `gradingQueueAutoScoreSchema`, `gradingQueueItemV2Schema`, and `gradingQueueV2ResponseSchema`.
  4. Keep `teacherSubmissionSchema`, `gradingQueueItemSchema`, and `gradingQueueResponseSchema` unchanged.
- **Success criteria:** All contract tests pass.
- **Verify:** `pnpm --filter @teacher-os/api test` exits 0.

### Task 1.3 — Add `answerLabel?: string` to `QuizReviewItem` [TDD]

- **Goal:** Allow teacher review screens to display `"Học viên trả lời:"` while keeping `"Bạn trả lời:"` as default for student review screens.
- **Target files and symbols:** `packages/ui/src/components/quiz/quiz-review-item.tsx` (`QuizReviewInfo`, `QuizReviewItem`), `packages/ui/src/components/quiz/quiz-review-item.test.tsx`.
- **Steps:**
  1. Write failing test in `packages/ui/src/components/quiz/quiz-review-item.test.tsx` asserting default `"Bạn trả lời:"` and custom `answerLabel: "Học viên trả lời"` rendering `"Học viên trả lời:"`.
  2. Update `QuizReviewInfo` and `QuizReviewItem` to use `{info.answerLabel ?? "Bạn trả lời"}: `.
- **Success criteria:** Both default and custom `answerLabel` tests pass.
- **Verify:** `pnpm --filter @teacher-os/ui test` exits 0.

## Verification

- `pnpm --filter @teacher-os/api test` exits 0.
- `pnpm --filter @teacher-os/ui test` exits 0.

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
