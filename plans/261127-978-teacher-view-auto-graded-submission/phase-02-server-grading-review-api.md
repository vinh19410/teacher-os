---
phase: 2
title: "Phase 2: Server Grading Review & Audio API"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Server Grading Review & Audio API

## Goal

Support opt-in `?includeAuto=1` on `GET /api/grading`, opt-in `?v=2` on `GET /api/grading/:attemptId`, and `GET /api/grading/:attemptId/audio` with full IDOR, study-pack exclusion, 2-bucket ungraded-first ordering, and v1 strict backward compatibility.

## Files to Create / Modify

- Create: `apps/server/src/lib/quiz-review.ts`
- Modify: `apps/server/src/routes/grading.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/routes/grading.test.ts`

## Tasks & Steps

### Task 2.1 — Add failing server integration tests for v2 queue, review, and audio

- **Goal:** Establish failing TDD tests covering `?includeAuto=1`, `?v=2`, `/audio`, study-pack exclusion, `branchLimit` 2-bucket preservation, IDOR, 409/400/404 guards, and v1 write-route rejection.
- **Target files and symbols:** `apps/server/src/routes/grading.test.ts`.
- **Steps:**
  1. Add tests for `GET /api/grading?includeAuto=1` (includes reading/listening/grammar/vocabulary assignment & practice, includes `autoScore`, excludes `classStudyPackId !== null` & `in_progress`, preserves awaiting manual items when total exceeds `branchLimit`).
  2. Add tests for `GET /api/grading/:attemptId?v=2` (returns `TeacherAutoSubmission` with `items`, `questions`, `detail`, `groups`, `transcript`, `hasAudio`, explanation fallback; preserves `TeacherSubmission` for Writing/Speaking/Hybrid; returns 404/409/400 appropriately).
  3. Add tests verifying `POST /grade`, `PATCH /draft`, `POST /ai-retry`, `POST /annotations` still return `400 SKILL_NOT_GRADABLE` for auto-graded attempts.
  4. Add tests for `GET /api/grading/:attemptId/audio` (200 stream + `CORP: same-site` + `Referrer-Policy: no-referrer` for assignment & practice, 401/403/404/409).
- **Success criteria:** New tests fail because v2 endpoints/params and `/audio` are not yet implemented.
- **Verify:** `pnpm --filter server test src/routes/grading.test.ts` exits non-zero on new assertions.

### Task 2.2 — Extract shared review builder and implement grading v2 + audio routes

- **Goal:** Implement `apps/server/src/lib/quiz-review.ts`, update `apps/server/src/routes/grading.ts`, and register `/api/grading/:attemptId/audio` in `apps/server/src/app.ts`.
- **Target files and symbols:** `apps/server/src/lib/quiz-review.ts`, `apps/server/src/routes/grading.ts`, `apps/server/src/app.ts`.
- **Steps:**
  1. Create `apps/server/src/lib/quiz-review.ts` with `parseStudentQuizGroups` and `buildQuizReviewEvaluation`.
  2. Update `loadGradingQueue` in `grading.ts`: add `isNull(classAssignment.classStudyPackId)`, support `{ includeAuto?: boolean }`, 2-bucket SQL & JS ordering (`Chờ chấm` = 0 before `Đã chấm` + `Tự chấm` = 1), and SQLite JSON1 object-count query for `totalCount`.
  3. Update `GET /:attemptId` to branch on `c.req.query("v") === "2"` and return `TeacherAutoSubmission` for pure auto-graded attempts while preserving `TeacherSubmission` for gradable/hybrid attempts and v1 `400 SKILL_NOT_GRADABLE` when `v !== "2"`.
  4. Add `GET /:attemptId/audio` using `serveStudyPackAudio` and register `"/api/grading/:attemptId/audio"` in `apps/server/src/app.ts`.
- **Success criteria:** All tests in `grading.test.ts` and `hybrid-assignment.test.ts` pass.
- **Verify:** `pnpm --filter server test src/routes/grading.test.ts src/routes/hybrid-assignment.test.ts` exits 0.

## Verification

- `pnpm --filter server test src/routes/grading.test.ts src/routes/hybrid-assignment.test.ts` exits 0.
- `pnpm --filter server run check-types` exits 0.

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
