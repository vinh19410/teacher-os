---
phase: 1
title: "Phase 1: Contracts, DB Migration & Practice Attempt Integrity"
status: done
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Contracts, DB Migration & Practice Attempt Integrity

<!-- Updated: Red Team Session 2026-11-25 - Switched serverNow to X-Server-Now HTTP header for rolling-deploy .strict() safety, renamed migration test file to preserve 0041 suite, strengthened 0090 dedup ranking, shared normalizeTimeLimitSeconds, full getNow() in student.ts, isolated test DB -->

## Goal

Extend `studentQuizDetailSchema` with rolling-deploy-safe timing fields (`timeLimitSeconds` emitted only on timed practice, `attempt.startedAt` inside non-strict `attempt`), expose `X-Server-Now` HTTP response header via CORS `exposeHeaders`, add D1-safe migration `0090` deduplicating and enforcing a single `in_progress` practice attempt per `(org_id, student_id, test_id)`, and harden practice/assignment quiz routes with `getNow()`, `asc` ordering, and unique-conflict recovery.

## Files to Create / Modify

- Modify: `packages/api/src/contracts.ts` (`studentQuizDetailSchema`)
- Modify: `packages/api/src/student-quiz.contracts.test.ts`
- Modify: `packages/db/src/schema/quiz-attempt.ts` (`quizAttempt` table index)
- Create: `packages/db/src/migrations/0090_*.sql` (generated via `drizzle-kit generate` + prepended idempotent content-ranked dedup SQL) and updated `packages/db/src/migrations/meta/_journal.json` + snapshot
- Create: `apps/server/src/quiz-attempt-practice-unique-migration.test.ts` (new file — keep existing `apps/server/src/quiz-attempt-practice-migration.test.ts` for migration `0041` untouched!)
- Modify: `apps/server/src/app.ts` (`corsMiddleware` `exposeHeaders` adding `"X-Server-Now"`)
- Modify: `apps/server/src/routes/student-practice.ts` (`normalizeTimeLimitSeconds`, `toPracticeQuizDetail`, `GET /practice`, `GET /practice/:testId/quiz`, `POST /practice/:testId/attempts`)
- Modify: `apps/server/src/routes/student.ts` (`getNow`, `loadOwnedAttemptWithSkill`, `GET /assignments/:assignmentId/quiz`, `GET /assignments/:assignmentId/audio`, `POST /assignments/:assignmentId/quiz/start`, `PUT /attempts/:attemptId/media`, `POST /attempts/:attemptId/submit`, `loadAttemptForReview`)
- Modify: `apps/server/src/routes/student-practice.test.ts`
- Modify: `apps/server/src/routes/student-quiz.test.ts`

## Tests Before (TDD Red Phase)

### Task 1.1 — Add failing contract tests for `timeLimitSeconds` and `attempt.startedAt`
- **Goal:** Lock the `.strict()` wire contract before editing `packages/api/src/contracts.ts`.
- **Target files and symbols:** `packages/api/src/student-quiz.contracts.test.ts` (`studentQuizDetailSchema`).
- **Steps:**
  1. Add test cases to `packages/api/src/student-quiz.contracts.test.ts` asserting `studentQuizDetailSchema.parse` accepts:
     - positive `timeLimitSeconds` (including `1200`, `600`, and `14400` = 4h matching `libraryTestCreateSchema`),
     - `timeLimitSeconds: null` and omitted `timeLimitSeconds`,
     - `attempt.startedAt` ISO string and omitted `attempt.startedAt`.
  2. Assert `studentQuizDetailSchema.parse` rejects `timeLimitSeconds: 0` and `timeLimitSeconds: -60`.
  3. Keep the existing `.strict()` unrecognized-key rejection test intact.
- **Success criteria:** New assertions fail against current `studentQuizDetailSchema` because `timeLimitSeconds` is unrecognized.
- **Verify:** `pnpm --filter @teacher-os/api exec vitest run src/student-quiz.contracts.test.ts` exits non-zero with Zod unrecognized_keys failure (expected TDD red state; passing before Task 1.2 is a failure).

## Implementation & Refactor

### Task 1.2 — Extend `studentQuizDetailSchema` with optional `timeLimitSeconds` and `attempt.startedAt`
- **Goal:** Accept optional `timeLimitSeconds` (no artificial `.max(3 * 3600)` cap) and `attempt.startedAt` on `studentQuizDetailSchema`; do NOT add top-level `serverNow` to JSON (delivered via `X-Server-Now` HTTP header to protect rolling deploys).
- **Target files and symbols:** `packages/api/src/contracts.ts` (`studentQuizDetailSchema`, lines 3148–3192).
- **Steps:**
  1. Add `timeLimitSeconds: z.number().int().positive().nullable().optional()` to `studentQuizDetailSchema`. Do NOT add `.max(3 * 3600)`.
  2. Add `startedAt: z.string().optional()` inside `studentQuizDetailSchema.shape.attempt` object (which intentionally has no `.strict()`, so old bundles strip it harmlessly).
- **Success criteria:** All tests in `packages/api/src/student-quiz.contracts.test.ts` pass, including legacy payloads without the new keys and `.strict()` unknown-key rejection.
- **Verify:** `pnpm --filter @teacher-os/api exec vitest run src/student-quiz.contracts.test.ts` exits 0.

### Task 1.3 — Add `quiz_attempt_practice_in_progress_uq` index and D1-safe content-ranked dedup migration `0090`
- **Goal:** Guarantee at most one `in_progress` practice attempt per `(org_id, student_id, test_id)` while preserving the richest existing student work and `MIN(started_at)` across `in_progress` duplicates.
- **Target files and symbols:** `packages/db/src/schema/quiz-attempt.ts` (`quizAttempt`), `packages/db/src/migrations/0090_*.sql`, `packages/db/src/migrations/meta/_journal.json`, `apps/server/src/quiz-attempt-practice-unique-migration.test.ts`.
- **Steps:**
  1. In `packages/db/src/schema/quiz-attempt.ts`, add `uniqueIndex("quiz_attempt_practice_in_progress_uq").on(table.orgId, table.studentId, table.testId).where(sql\`${table.mode} = 'practice' and ${table.status} = 'in_progress' and ${table.testId} is not null\`)` to the table index array.
  2. Run `pnpm --filter @teacher-os/db run db:generate` to generate migration `0090_*.sql` and update Drizzle meta snapshot/journal. Verify the generated SQL contains ONLY `CREATE UNIQUE INDEX` (no `DROP TABLE` rebuild).
  3. Prepend two idempotent dedup SQL statements (separated by `--> statement-breakpoint`) before `CREATE UNIQUE INDEX IF NOT EXISTS` in `0090_*.sql`:
     - Rank rows within each duplicate `(org_id, student_id, test_id)` group (`mode = 'practice' AND status = 'in_progress' AND test_id IS NOT NULL`) deterministically by:
       1. `CASE WHEN media_key IS NOT NULL THEN 1 ELSE 0 END DESC` (protect uploaded Speaking R2 media!),
       2. `CASE WHEN json_valid(answers) = 1 AND json_type(answers) = 'object' THEN (SELECT count(*) FROM json_each(answers) WHERE trim(CAST(value AS TEXT)) <> '') ELSE 0 END DESC` (count genuinely non-empty answers; ignores `{"0":""}`, `"{ }"`, malformed JSON),
       3. `length(trim(essay)) DESC` (preserve richer Writing essay),
       4. `rowid DESC` (immutable across `started_at` update; preserves the row pre-fix `GET /quiz` served).
     - **Statement 1 (`UPDATE`):** Update `started_at` on each group's winning row to `MIN(started_at)` computed strictly across rows where `mode = 'practice' AND status = 'in_progress' AND test_id IS NOT NULL` in the same `(org_id, student_id, test_id)` group.
     - **Statement 2 (`DELETE`):** Delete all other `mode = 'practice' AND status = 'in_progress' AND test_id IS NOT NULL` rows whose `id` is not the group's winning `id`.
     - **Statement 3 (`CREATE UNIQUE INDEX IF NOT EXISTS`):** Create `quiz_attempt_practice_in_progress_uq`.
  4. Create NEW file `apps/server/src/quiz-attempt-practice-unique-migration.test.ts` (do NOT modify or overwrite `apps/server/src/quiz-attempt-practice-migration.test.ts`!) testing:
     - Case A: Row 1 earlier + empty `{}` vs Row 2 later + real answers → Row 2 survives with Row 1's earlier `started_at`.
     - Case B: Row 1 earlier + 2 real answers vs Row 2 later + cleared answer `{"0":""}` or whitespace `"{ }"` → Row 1 survives (real work NOT deleted!).
     - Case C: Row 1 earlier + 2 real answers vs Row 2 later + 1 real answer → Row 1 survives (richer work wins!).
     - Case D: Row 1 earlier + `media_key` set (Speaking) vs Row 2 later + empty → Row 1 survives (no R2 orphan!).
     - Case E: An older `submitted` practice attempt for the same `(org_id, student_id, test_id)` stays untouched and does NOT pull `MIN(started_at)` backward!
     - Case F: An `in_progress` practice row with `test_id IS NULL` stays untouched; re-running `0090` is idempotent; inserting a second `in_progress` row for the same `(org_id, student_id, test_id)` throws UNIQUE error; inserting a second `submitted` row succeeds; `PRAGMA foreign_key_check` is empty.
- **Success criteria:** Both the new `0090` migration test AND the existing `0041` migration test pass cleanly on in-memory libsql.
- **Verify:** `pnpm --filter server exec vitest run src/quiz-attempt-practice-unique-migration.test.ts src/quiz-attempt-practice-migration.test.ts` exits 0.

### Task 1.4 — Expose `X-Server-Now` header, emit normalized timing fields, thread `getNow()`, switch to `asc` ordering, and recover unique races
- **Goal:** Expose `X-Server-Now` response header via CORS `exposeHeaders`, emit `timeLimitSeconds` (practice only when positive) and `attempt.startedAt`, normalize `timeLimitSeconds` identically in catalog and take routes, thread `deps.now` consistently through `student-practice.ts` and `student.ts`, pick earliest `in_progress` practice row (`asc`), and recover unique constraint races on `POST /practice/:testId/attempts`.
- **Target files and symbols:** `apps/server/src/app.ts` (`corsMiddleware`), `apps/server/src/routes/student-practice.ts` (`normalizeTimeLimitSeconds`, `toPracticeQuizDetail`, `GET /practice`, `GET /practice/:testId/quiz`, `POST /practice/:testId/attempts`), `apps/server/src/routes/student.ts` (`getNow`, `loadOwnedAttemptWithSkill`, `GET /assignments/:assignmentId/quiz`, `GET /assignments/:assignmentId/audio`, `POST /assignments/:assignmentId/quiz/start`, `PUT /attempts/:attemptId/media`, `POST /attempts/:attemptId/submit`, `loadAttemptForReview`).
- **Steps:**
  1. In `apps/server/src/app.ts:418`, add `"X-Server-Now"` to `exposeHeaders` on `corsMiddleware`.
  2. In `apps/server/src/routes/student-practice.ts`:
     - Add helper `function normalizeTimeLimitSeconds(raw: number | null): number | null { return raw !== null && Number.isInteger(raw) && raw > 0 ? raw : null; }`.
     - Use `normalizeTimeLimitSeconds(row.timeLimitSeconds)` in catalog `GET /practice` (`durationMin: normalized === null ? null : Math.round(normalized / 60)`).
     - Define `const getNow = () => (deps.now ? deps.now() : new Date());` inside `studentPracticeRoutes`.
     - In `toPracticeQuizDetail`, compute `const timeLimitSeconds = normalizeTimeLimitSeconds(loaded.test.timeLimitSeconds);`, include `...(timeLimitSeconds !== null ? { timeLimitSeconds } : {})`, and inside `attempt`: `startedAt: attempt.startedAt.toISOString()`.
     - In `GET /practice/:testId/quiz`, change `.orderBy(desc(quizAttempt.startedAt), desc(quizAttempt.id))` to `.orderBy(asc(quizAttempt.startedAt), asc(quizAttempt.id))`, and set `c.header("X-Server-Now", getNow().toISOString())` before returning `c.json(verified)`.
     - In `POST /practice/:testId/attempts`:
       - Change `.orderBy(desc(quizAttempt.startedAt), desc(quizAttempt.id))` to `.orderBy(asc(quizAttempt.startedAt), asc(quizAttempt.id))`.
       - Pass `startedAt: getNow()` on insert.
       - Wrap `db.insert(quizAttempt)` in `try/catch`: on error, re-query `practiceFilter` ordered by `asc(quizAttempt.startedAt), asc(quizAttempt.id)` limit 1; if `raced` exists, return `c.json(startPracticeResponseSchema.parse({ attemptId: raced.id }), 200)`; otherwise rethrow.
  3. In `apps/server/src/routes/student.ts`:
     - Define `const getNow = () => (deps.now ? deps.now() : new Date());` inside `studentRoutes` (never shadowing existing local `const now` bindings).
     - Use `getNow()` in `loadOwnedAttemptWithSkill` (`row.availableAt.getTime() > getNow().getTime()`), `visibleAssignmentFilter(getNow())` at quiz/audio/start/review routes (`1765, 1906, 1962, 2648`), `POST /assignments/:assignmentId/quiz/start` (`startedAt: getNow()`), `PUT /attempts/:attemptId/media` (`uploadedAt = getNow()`), and `POST /attempts/:attemptId/submit` (single `const submittedAt = getNow()` used for both `quizAttempt.submittedAt` and `classAssignmentTarget.submittedAt: submittedAt.toISOString()`).
     - In `GET /assignments/:assignmentId/quiz`: set `c.header("X-Server-Now", getNow().toISOString())` and include `startedAt: attempt.startedAt.toISOString()` inside `attempt` when `attempt` exists. Do NOT add any new top-level JSON key (`serverNow` or `timeLimitSeconds`) to assignment `/quiz`!
- **Success criteria:** Practice `/quiz` emits `X-Server-Now`, `attempt.startedAt`, and positive `timeLimitSeconds`; assignment `/quiz` emits `X-Server-Now` and `attempt.startedAt` with zero new top-level JSON keys; concurrent practice starts return one `attemptId`.
- **Verify:** No verification needed yet; immediately verified in Task 1.5.

## Tests After

### Task 1.5 — Add isolated server integration tests for timing fields, `X-Server-Now`, concurrent start, and cross-reload duration
- **Goal:** Prove server timing contract, non-positive limit normalization across catalog & take, concurrency recovery, and exact pre-reload + post-resume duration using injected `deps.now` without disturbing existing shared-DB assertions.
- **Target files and symbols:** `apps/server/src/routes/student-practice.test.ts`, `apps/server/src/routes/student-quiz.test.ts`.
- **Steps:**
  1. In `apps/server/src/routes/student-practice.test.ts`, add a NEW isolated `describe("practice timer, clock header, concurrency & cross-reload duration (#880)", ...)` block with its own in-memory libsql DB and mutable `nowMs` injected into `buildApp({ ..., now: () => new Date(nowMs) })`:
     - Timed test (`timeLimitSeconds: 1200`): `GET /quiz` returns `timeLimitSeconds: 1200`, `X-Server-Now` header equal to `new Date(nowMs).toISOString()`, CORS `Access-Control-Expose-Headers` includes `X-Server-Now`, and (once started) `attempt.startedAt`.
     - Untimed test (`timeLimitSeconds: null`) and non-positive legacy test (`timeLimitSeconds: 0`): catalog returns `durationMin: null` and `GET /quiz` returns `200` with `timeLimitSeconds` omitted (NOT 404, NOT `"0 phút"`).
     - Concurrent `Promise.all([postStart, postStart])` on a fresh test: both succeed (201/200) with the exact same `attemptId` and exactly 1 `in_progress` row in DB.
     - Cross-reload duration trace:
       - `T0 = 2026-11-24T10:00:00.000Z`: `POST /attempts` → creates `attemptId`.
       - `T0 + 2m30s`: `PATCH /answer` saves Q0.
       - `T0 + 3m00s`: simulated reload `GET /quiz` returns SAME `attemptId`, `attempt.startedAt === T0`, `X-Server-Now === T0 + 3m00s`, `timeLimitSeconds === 1200`.
       - `T0 + 3m05s`: `POST /attempts` (re-click from catalog) returns `200` SAME `attemptId`, `startedAt` unchanged.
       - `T0 + 4m44s`: `PATCH /answer` saves Q1, then `POST /submit`.
       - `GET /attempts/:attemptId` returns `startedAt === T0` and `submittedAt === T0 + 4m44s` (delta `284s` = `4 phút 44 giây`).
  2. In `apps/server/src/routes/student-quiz.test.ts`, assert `GET /api/student/assignments/:id/quiz` emits `X-Server-Now` header, `attempt.startedAt`, and omits both `timeLimitSeconds` and top-level `serverNow`.
- **Success criteria:** All new and existing API/server tests pass cleanly with zero flaky sleeps.
- **Verify:** `pnpm --filter @teacher-os/api exec vitest run src/student-quiz.contracts.test.ts && pnpm --filter server exec vitest run src/quiz-attempt-practice-unique-migration.test.ts src/quiz-attempt-practice-migration.test.ts src/routes/student-practice.test.ts src/routes/student-quiz.test.ts src/routes/student-practice-library-sync.test.ts src/routes/student-history.test.ts` exits 0.

## Regression Gate

- `pnpm --filter @teacher-os/api check-types && pnpm --filter @teacher-os/db check-types && pnpm --filter server check-types` exits 0.

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
