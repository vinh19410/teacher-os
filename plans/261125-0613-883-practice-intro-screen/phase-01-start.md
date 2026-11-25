---
phase: 1
title: "Phase 1: Contract & Server Practice Detail Metadata"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Contract & Server Practice Detail Metadata

## Goal

Extend `studentQuizDetailSchema` with 5 optional practice-metadata fields and populate them safely in `GET /api/student/practice/:testId/quiz` (while aligning catalog `durationMin` sanitization) so the student intro screen has authoritative question count, parts count, duration, collection/group, and rich-text description from a single endpoint without breaking assignments or strict schema guarantees.

## Files to Create / Modify

- Modify: `packages/api/src/student-quiz.contracts.test.ts`
- Modify: `packages/api/src/contracts.ts`
- Modify: `apps/server/src/routes/student-practice.test.ts`
- Modify: `apps/server/src/routes/student-practice.ts`

## Tests Before (TDD Red Phase)

### Task 1.1 — Add failing contract tests for practice intro metadata on `studentQuizDetailSchema`
- **Goal:** Lock the schema contract for `timeLimitSeconds`, `partsCount`, `collection`, `testGroup`, and `description` (valid values, nullable/omitted backward compatibility, invalid `timeLimitSeconds <= 0` / non-integer / `partsCount < 1`, and `.strict()` unknown-key rejection).
- **Target files and symbols:** `packages/api/src/student-quiz.contracts.test.ts` (`describe("studentQuizDetailSchema — ...")`).
- **Steps:**
  1. Add a new `describe("studentQuizDetailSchema — practice intro metadata (#883)")` block in `packages/api/src/student-quiz.contracts.test.ts`.
  2. Add tests asserting:
     - `studentQuizDetailSchema.parse` accepts `timeLimitSeconds: 1200`, `partsCount: 3`, `collection: "IELTS Trainer 2"`, `testGroup: "TEST 1"`, `description: "<p>Mô tả đề</p>"` and preserves those exact values.
     - `studentQuizDetailSchema.parse` accepts `timeLimitSeconds: null`, `collection: null`, `testGroup: null`, `description: null` and accepts `timeLimitSeconds: 4 * 3600` (matching listening library max).
     - `studentQuizDetailSchema.parse` accepts legacy/assignment payloads omitting all 5 fields (returning `undefined` for each).
     - `studentQuizDetailSchema.parse` rejects `timeLimitSeconds: 0`, `timeLimitSeconds: -60`, `timeLimitSeconds: 12.5`, `partsCount: 0`, and unrecognized keys.
- **Success criteria:** New tests fail because `studentQuizDetailSchema` currently rejects the 5 new keys under `.strict()`.
- **Verify:** `pnpm --filter @teacher-os/api test -- student-quiz.contracts.test.ts` exits non-zero with Zod `unrecognized_keys` assertion failure (expected red state; exiting 0 here is a failure).

### Task 1.2 — Add failing server route tests for `GET /api/student/practice/:testId/quiz` metadata and duration sanitization
<!-- Updated: Red Team Session 1 - fixed shared-DB test ordering (test-read-1 is already in_progress at line 536) and added catalog durationMin=0 alignment -->
- **Goal:** Assert that `GET /api/student/practice/:testId/quiz` returns `timeLimitSeconds`, `partsCount`, `collection`, `testGroup`, and `description` both BEFORE start (`attempt: null`, fresh `buildMergedQuestions` branch) and AFTER start (`attempt.status === "in_progress"`), and safely normalizes non-positive or non-integer `timeLimitSeconds` to `null` in both `/quiz` and catalog `durationMin`.
- **Target files and symbols:** `apps/server/src/routes/student-practice.test.ts` (`beforeAll` fixture, `describe("GET /api/student/practice/:testId/quiz — take payload")`).
- **Steps:**
  1. In `beforeAll` of `apps/server/src/routes/student-practice.test.ts`:
     - Add `description: "<p>Đọc kỹ đề.</p>"` on existing `"test-read-1"` (does NOT alter `GET /api/student/practice` catalog keys or `reading` `total: 2`).
     - Seed two dedicated `skill: "listening"` ready tests (with listening prompts + parts, so `skill=reading` catalog count stays strictly `2`):
       - `"test-listen-meta"`: `timeLimitSeconds: 1800`, `collection: "Cambridge 19"`, `testGroup: "TEST 2"`, `description: "<p>Nghe kỹ băng.</p>"`, 2 parts (fresh, never posted to `/attempts`, so `attempt` is strictly `null` at line 536!).
       - `"test-listen-zero"`: `timeLimitSeconds: 0`, `collection: null`, `testGroup: "SECTION 1"`, `description: null`, 1 part.
  2. In `describe("GET /api/student/practice/:testId/quiz — take payload")`:
     - Assert `test-writ-1` BEFORE `studentPost` returns `attempt: null`, `timeLimitSeconds: null`, `partsCount: 2`, `collection: null`, `testGroup: null`, `description: null`.
     - Assert fresh `test-listen-meta` returns `attempt: null`, `timeLimitSeconds: 1800`, `partsCount: 2`, `collection: "Cambridge 19"`, `testGroup: "TEST 2"`, `description: "<p>Nghe kỹ băng.</p>"`, and merged `questions` from both parts.
     - Assert `test-read-1` (which ALREADY has an `in_progress` attempt created at line 439) returns `attempt.status === "in_progress"`, `timeLimitSeconds: 3600`, `partsCount: 2`, `collection: "IELTS Trainer 2"`, `testGroup: "TEST 1"`, `description: "<p>Đọc kỹ đề.</p>"`, and `questions` length `3`.
     - Assert `test-listen-zero` returns HTTP `200` (not `404`) with `timeLimitSeconds: null`, `partsCount: 1`, `collection: null`, `testGroup: "SECTION 1"`, and that `GET /api/student/practice?skill=listening` returns `durationMin: null` (not `0`) for `test-listen-zero`.
- **Success criteria:** Server test fails because `toPracticeQuizDetail` does not populate the 5 new fields and catalog `durationMin` currently returns `0` for `timeLimitSeconds: 0`.
- **Verify:** `pnpm --filter server test -- student-practice.test.ts` exits non-zero with assertion failure on the new metadata / `durationMin` fields (expected red state; exiting 0 here is a failure).

## Refactor / Implementation (TDD Green Phase)

### Task 1.3 — Extend `studentQuizDetailSchema` in `@teacher-os/api`
- **Goal:** Add the 5 optional metadata fields to `studentQuizDetailSchema` while keeping `.strict()` intact.
- **Target files and symbols:** `packages/api/src/contracts.ts` (`studentQuizDetailSchema`, lines 3148-3193).
- **Steps:**
  1. Inside `studentQuizDetailSchema` in `packages/api/src/contracts.ts`, add:
     - `timeLimitSeconds: z.number().int().positive().nullable().optional(),`
     - `partsCount: z.number().int().min(1).optional(),`
     - `collection: z.string().nullable().optional(),`
     - `testGroup: z.string().nullable().optional(),`
     - `description: z.string().nullable().optional(),`
  2. Do NOT relax `.strict()` and do NOT add `.max(3 * 3600)` so listening tests up to `4 * 3600` pass validation.
- **Success criteria:** All `student-quiz.contracts.test.ts` tests pass.
- **Verify:** `pnpm --filter @teacher-os/api test -- student-quiz.contracts.test.ts` exits 0 and all tests pass.

### Task 1.4 — Populate sanitized practice metadata in `toPracticeQuizDetail` and align catalog `durationMin`
<!-- Updated: Red Team Session 1 - use shared normalizeTimeLimitSeconds integer-positive sanitizer in both /quiz and catalog -->
- **Goal:** Return sanitized `timeLimitSeconds`, `partsCount`, `collection`, `testGroup`, and `description` from `GET /api/student/practice/:testId/quiz` and use the same sanitizer for catalog `durationMin`.
- **Target files and symbols:** `apps/server/src/routes/student-practice.ts` (`normalizeTimeLimitSeconds`, `toPracticeQuizDetail`, catalog handler `GET /practice`).
- **Steps:**
  1. Add a small local helper in `apps/server/src/routes/student-practice.ts`:
     ```ts
     function normalizeTimeLimitSeconds(raw: number | null | undefined): number | null {
       return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : null;
     }
     ```
  2. In `toPracticeQuizDetail`, include on the returned `StudentQuizDetail` object:
     - `timeLimitSeconds: normalizeTimeLimitSeconds(loaded.test.timeLimitSeconds),`
     - `partsCount: loaded.parts.length,`
     - `collection: loaded.test.collection ?? null,`
     - `testGroup: loaded.test.testGroup ?? null,`
     - `description: loaded.test.description ?? null,`
  3. In `GET /practice` catalog mapping (`student-practice.ts:354-357`), derive `durationMin` using `normalizeTimeLimitSeconds(row.timeLimitSeconds)` (`normalized === null ? null : Math.max(1, Math.round(normalized / 60))` or `Math.round(normalized / 60)` when `>= 60` — wait: keep `Math.round(normalized / 60)` for positive values consistent with existing catalog contract, so `timeLimitSeconds: 0` cleanly produces `null` instead of `0`).
  4. Keep `assertValidDetail` unchanged so malformed payloads continue to fail closed.
- **Success criteria:** All `student-practice.test.ts` tests pass, including fresh/resumed/zero-limit cases.
- **Verify:** `pnpm --filter server test -- student-practice.test.ts` exits 0 and all tests pass.

## Tests After & Regression Gate

### Task 1.5 — Run contract and server regression checks
- **Goal:** Confirm zero regressions in API contracts and server practice/quiz routes.
- **Target files and symbols:** `packages/api`, `apps/server`.
- **Steps:**
  1. Run `@teacher-os/api` tests and server practice/quiz tests plus typecheck on both packages.
- **Success criteria:** All suites pass with exit code 0 and zero TypeScript errors.
- **Verify:** `pnpm --filter @teacher-os/api test && pnpm --filter server test -- student-practice.test.ts student-practice-library-sync.test.ts student-quiz.test.ts && pnpm --filter @teacher-os/api check-types && pnpm --filter server check-types` exits 0.

## Todo

- [x] Task 1.1: Write failing contract tests in `packages/api/src/student-quiz.contracts.test.ts`
- [x] Task 1.2: Write failing server route tests in `apps/server/src/routes/student-practice.test.ts`
- [x] Task 1.3: Add 5 optional fields to `studentQuizDetailSchema` in `packages/api/src/contracts.ts`
- [x] Task 1.4: Populate sanitized metadata in `toPracticeQuizDetail` and align catalog `durationMin` in `apps/server/src/routes/student-practice.ts`
- [x] Task 1.5: Run Phase 1 regression gate

## Success Criteria

- `studentQuizDetailSchema` accepts all 5 optional fields, rejects invalid values (including non-integer/non-positive `timeLimitSeconds`) and unknown keys under `.strict()`, and preserves assignment payload compatibility.
- `GET /api/student/practice/:testId/quiz` returns accurate metadata both before start (`attempt: null`) and after start (`attempt.status === "in_progress"`) without breaking `GET /api/student/practice` catalog contracts.

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
