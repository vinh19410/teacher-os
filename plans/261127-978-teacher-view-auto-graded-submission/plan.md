---
title: "Allow teachers to open and review auto-graded student submissions (#978)"
description: "Add opt-in v2 review/queue endpoints on /api/grading, Listening audio streaming, and teacher entry points across ClassAssignmentsTab, Student detail Bài tập tab, and /teacher/grading while preserving v1 strict contracts and #977 boundaries."
status: completed
priority: P1
effort: "6h"
tags: [bugfix, server, web, grading, contracts, ui, issue-978]
created: 2026-11-27
---

# Allow teachers to open and review auto-graded student submissions (#978)

## Overview

Teachers cannot currently inspect a student's submitted auto-graded attempt (`reading`, `listening`, `grammar`, `vocabulary`) from any surface:
1. `ClassAssignmentsTab` only renders `TargetGradeActions` when `hasGradableTask(prompt)` is true, leaving submitted auto-graded rows with no link even though `KernelSnapshot` already emits `target.attemptId`.
2. `/teacher/students/$studentId` tab **Bài tập** drops `target.attemptId` in `studentAssignmentRows` and renders non-clickable rows (`onClick: undefined`).
3. `/teacher/grading` and `GET /api/grading/:attemptId` filter strictly to `writing` / `speaking` (plus hybrid `writingPart IS NOT NULL`) and reject pure auto-graded attempts with `400 SKILL_NOT_GRADABLE`.

This plan follows the TDD handover contract (`--tdd --advice`) with `kongming` advisory supervision and strict opt-in API versioning (`?includeAuto=1` and `?v=2`) so v1 `.strict()` contracts and live deploy-skew behavior stay intact.

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - `packages/api/src/contracts.ts` (+ `packages/api/src/grading-review.contracts.test.ts`): add `teacherAutoSubmissionSchema` (`kind: "auto"`), `teacherAttemptReviewSchema` (`union`), `gradingQueueAutoScoreSchema`, `gradingQueueItemV2Schema` (6 skills + optional `autoScore`), and `gradingQueueV2ResponseSchema` while keeping `teacherSubmissionSchema`, `gradingQueueItemSchema`, and `gradingQueueResponseSchema` untouched.
  - `packages/ui/src/components/quiz/quiz-review-item.tsx` (+ test): add optional `answerLabel?: string` defaulting to `"Bạn trả lời"`.
  - `apps/server`: extract shared pure review evaluation helper in `apps/server/src/lib/quiz-review.ts`; add `?includeAuto=1` on `GET /api/grading` (2-bucket SQL priority, `isNull(classAssignment.classStudyPackId)`, SQLite JSON1 `totalCount`), `?v=2` on `GET /api/grading/:attemptId`, `GET /api/grading/:attemptId/audio`, and CORP/Referrer-Policy registration in `apps/server/src/app.ts`; keep all write/annotation/media routes rejecting pure auto-graded attempts with `400 SKILL_NOT_GRADABLE`.
  - `apps/web`: update `apps/web/src/lib/repos/grading.ts`, `ClassAssignmentsTab`, `student-assignments.ts`, `/students/$studentId.tsx` (clickable `DataTable` row + static action column + `?tab=`), `/grading/index.tsx` (6 skills + `Tự chấm` filter + `awaitingCount` excluding auto-graded), `apps/web/src/components/grading/auto-submission-view.tsx`, and `/grading/$attemptId.tsx` (`?from=` back-nav + read-only `AutoSubmissionView`).
  - `apps/e2e/specs/teacher-auto-graded-review.spec.ts` + targeted `specs/teacher-grade-submission.spec.ts` verification + 3-viewport × 2-theme POT screenshots.
- **Explicit Non-Goals:**
  - Do NOT display raw `X/Y` auto-graded scores on `ClassAssignmentsTab`, columns 0–4 of `$studentId.tsx` tab **Bài tập**, or Dashboard cards (tracked separately in #977).
  - Do NOT modify `apps/server/src/routes/snapshot.ts`, `apps/server/src/routes/dashboard-reminders.ts`, `ClassStudyPackSection`, or add per-question MC breakdown to Hybrid (`writingPart !== null`) submissions.
  - Do NOT add Drizzle migrations or teacher override/edit endpoints for MC scores.
  - Do NOT run the full E2E suite locally (`AGENTS.md`).

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Expose opt-in `?includeAuto=1` and `?v=2` + `/audio` on `/api/grading` with v1 `.strict()` preservation and 2-bucket ungraded-first ordering | P1 |
| 2 | Enable teacher entry points on `ClassAssignmentsTab`, `/students/$studentId` tab Bài tập, and `/grading` with proper back-navigation (`?from=`) | P1 |
| 3 | Render full read-only review UI (score card, compact list, `QuizPaper mode="review"`, `QuizNavigator`, audio + transcript) for auto-graded submissions | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: Contracts and Shared Quiz UI](./phase-01-contracts-and-shared-ui.md) | Pending |
| 2 | [Phase 2: Server Grading Review & Audio API](./phase-02-server-grading-review-api.md) | Pending |
| 3 | [Phase 3: Web Entry Points & Review UI](./phase-03-web-entry-points-and-review-ui.md) | Pending |
| 4 | [Phase 4: E2E, Visual POT, Review & Beta Ship](./phase-04-e2e-visual-pot-and-ship.md) | Pending |

## Success Criteria

- [ ] Teachers can open submitted auto-graded attempts (`reading`, `listening`, `grammar`, `vocabulary`, both `assignment` and `practice`) from `ClassAssignmentsTab`, `/students/$studentId` tab **Bài tập**, and `/grading`.
- [ ] Teachers see questions, student answers (`Học viên trả lời:`), correct keys, explanations, audio/transcript (for Listening), and `X/Y` score card without manual grading controls.
- [ ] V1 `GET /api/grading` and `GET /api/grading/:attemptId` (without `?includeAuto=1` / `?v=2`) plus all write routes continue to pass all existing v1 tests unchanged.
- [ ] All local quality gates (`biome check`, `check-types`, `@teacher-os/api`, `@teacher-os/ui`, `server`, `web`), targeted E2E (`teacher-auto-graded-review.spec.ts`, `teacher-grade-submission.spec.ts`), and 3-viewport × 2-theme visual checks pass, with POT posted on #978 and beta PR merged to `develop` with green CI.

## Red Team Review

### Session — 2026-11-27
- Verified base branch `origin/develop` (`87ca6f25`); issue #977 remains `OPEN` (`in progress`), confirming no merge conflict on `develop` at start of work.
- Confirmed `quizAttemptItemSchema`, `studentQuizQuestionSchema`, `studentQuizGroupSchema`, and `QUIZ_VERDICTS` appear after `teacherSubmissionSchema` in `packages/api/src/contracts.ts`, so new auto-submission schemas must be placed after `quizAttemptDetailSchema` to avoid TDZ runtime errors.
- Confirmed `DataTable` attaches `tabIndex={0}`, `onClick`, and `onKeyDown` on `<tr>`, requiring static `<span>` in the trailing action column rather than a nested `<Link>`.

## Validation Log

- Plan authored with `kongming` Checkpoint #1 approval (`Go`).

<!-- slug: 978-teacher-view-auto-graded-submission -->
