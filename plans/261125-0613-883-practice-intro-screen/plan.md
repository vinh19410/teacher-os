---
title: "Practice Intro Screen Before Starting Attempt (#883)"
description: "Add an inline intro screen at /learn/quizzes/practice/$testId showing test metadata, duration, and general instructions before creating an attempt or starting timing."
status: in-progress
priority: P1
effort: "4h"
tags: [practice, student, ux, tdd, advice]
created: 2026-11-25
---

# Practice Intro Screen Before Starting Attempt (#883)

## Overview

Clicking a test card on `/practice/$skill` (`reading`, `listening`, `writing`, `speaking`) currently fires `POST /api/student/practice/:testId/attempts` immediately before navigating, which creates an `in_progress` row with `startedAt` and jumps straight into the test paper. This plan removes eager attempt creation on card click, extends `studentQuizDetailSchema` and `GET /api/student/practice/:testId/quiz` with practice test metadata (`timeLimitSeconds`, `partsCount`, `collection`, `testGroup`, `description`), and renders a dedicated inline `PracticeIntroScreen` inside `QuizTakeView` when `source.kind === "practice" && attempt === null`, while keeping the assignment `QuizStartDialog` modal untouched.

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - Card click on `/practice/$skill` navigates directly to `/learn/quizzes/practice/$testId` without calling `POST /api/student/practice/:testId/attempts`; delete unused `startPractice` / `useStartPractice` helpers in `apps/student/src/lib/repos/student.ts`.
  - Add 5 optional metadata fields (`timeLimitSeconds`, `partsCount`, `collection`, `testGroup`, `description`) to `studentQuizDetailSchema` (preserving `.strict()`) and populate sanitized values in `toPracticeQuizDetail` (and align catalog `durationMin` integer-positive sanitization).
  - Render inline `PracticeIntroScreen` in `QuizTakeView` when `source.kind === "practice" && attempt === null` for all 4 practice skills (`reading`, `listening`, `writing`, `speaking`), showing question/task metadata, parts count, duration, rich-text `description` via `RichTextBody` (with DOMPurify-backed non-empty check), skill-specific general instructions, `"Bắt đầu làm bài"` CTA, and `"Quay lại danh sách"` back button — never showing `Band`.
  - Keep `useStartQuizAttempt.onSuccess` pending until `GET /quiz` refetches (`return queryClient.invalidateQueries(...)`), fix practice route loader staleness (`fetchQuery` with `staleTime: 0`, clean essay mirror on submitted redirect), key `<QuizTakeView>` by `testId`/`assignmentId`, snapshot one-shot `attempt: null -> in_progress` hydration baseline without breaking active autosave stores on subsequent refetches, handle `403 STUDENT_ORG_MISMATCH`/`404`/refetch errors on Start, and route practice exit/cancel navigation back to `/practice/$skill` (fallback `/practice`).
  - Update unit tests, server tests, contract tests, and all 3 affected E2E specs (`apps/e2e/specs/student-practice.spec.ts`, `apps/e2e/specs/student-history.spec.ts`, `apps/e2e/specs/teacher-grade-submission.spec.ts` — run only these targeted specs locally per `AGENTS.md`); verify UI across 3 viewports + 320px + light/dark per `REVIEW.md`.
- **Trust Boundary Note:**
  - Pre-start read endpoints (`GET /api/student/practice/:testId/quiz` and `GET /api/student/practice/:testId/audio`) remain readable by authenticated org students before attempt creation (same trust boundary as `GET /api/student/assignments/:assignmentId/quiz` and required by `attempt/$attemptId.detail.tsx` review chrome and `student-practice-library-sync.test.ts:291-353`). The intro gate prevents UI rendering of questions/passage and prevents the browser from initiating audio streaming or creating an attempt until the student clicks `"Bắt đầu làm bài"`.
  - Concurrent multi-tab `POST /api/student/practice/:testId/attempts` TOCTOU protection via a D1 partial unique index migration is deferred out of #883 to avoid schema migration risk in a UI/contract feature PR; client double-click/pending-refetch protection is enforced by returning the invalidation promise in `useStartQuizAttempt`.
- **Explicit Non-Goals:**
  - No live countdown timer or resume duration accounting changes on the take screen (owned by #880).
  - No changes to `QuizResumeDialog` submit-lock UX or tooltip (owned by #885).
  - No changes to `QuizStartDialog` modal or `"/"` exit link for `source.kind === "assignment"`.
  - No changes to `/practice/vocabulary/*`, no DB migrations, and no stripping of `passage`/`questions`/`audio` on server pre-start GET endpoints.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Expose practice test metadata (`timeLimitSeconds`, `partsCount`, `collection`, `testGroup`, `description`) on `GET /api/student/practice/:testId/quiz` via strict Zod contract | P1 |
| 2 | Navigate directly from `/practice/$skill` cards to `/learn/quizzes/practice/$testId` and display an accessible inline `PracticeIntroScreen` before creating an attempt or mounting audio playback | P1 |
| 3 | Ensure fresh server state on re-entry, safe one-shot `null -> in_progress` answer hydration without mid-session store disposal, and full unit + targeted E2E (all 3 specs) + 3-viewport light/dark verification | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Contract & Server Practice Detail Metadata](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Student Practice Intro Screen, Navigation & Hydration](./phase-02-student-practice-intro-ui.md) | Pending |
| 3 | [Phase 3: E2E Specs, UI Verification & Quality Gates](./phase-03-e2e-and-ui-verification.md) | Pending |

## Success Criteria

- [ ] Clicking any Reading/Listening/Writing/Speaking card on `/practice/$skill` navigates to `/learn/quizzes/practice/$testId`, displays `PracticeIntroScreen` (question/task summary, parts count, duration, optional rich-text description, general instructions, `"Bắt đầu làm bài"` button, `"Quay lại danh sách"` button), and triggers **0** `POST /api/student/practice/:testId/attempts` requests and **0** browser audio requests before clicking Start.
- [ ] Clicking `"Quay lại danh sách"` or header `"Thoát"` returns to `/practice/$skill` without creating a `quiz_attempt` row.
- [ ] Clicking `"Bắt đầu làm bài"` sends `POST /api/student/practice/:testId/attempts`, keeps Start/Back disabled until `GET /quiz` settles, transitions cleanly into the take screen, safely hydrates answers once if another tab already started and answered, and does NOT dispose the store or pop `QuizResumeDialog` on subsequent refetches.
- [ ] `detail.band` never renders on `PracticeIntroScreen`; class assignment flow (`source.kind === "assignment"`) still shows `QuizStartDialog` (`role="alertdialog"`) with `"/"` exit link.
- [ ] `pnpm exec biome check .`, `pnpm run check-types`, targeted unit/server/contract tests, and all 3 affected E2E specs (`student-practice.spec.ts`, `student-history.spec.ts`, `teacher-grade-submission.spec.ts` on ports 8100–8105) pass, plus 3-viewport + light/dark visual verification per `REVIEW.md`.

## Red Team Review

### Session — 2026-11-25
**Reviewers:** Security Adversary, Assumption Destroyer, Failure Mode Analyst (3 parallel `code-reviewer` agents, Standard tier: Fact Checker + Contract Verifier + Flow Tracer)
**Findings:** 11 unique (2 Critical, 6 High, 3 Medium — 9 accepted, 2 accepted-modified, 0 rejected)
**Severity breakdown:** 2 Critical, 6 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Missing 2 E2E specs (`student-history.spec.ts`, `teacher-grade-submission.spec.ts`) clicking `practice-test-card` and expecting take screen immediately | Critical | Accept | `plan.md`, Phase 3 |
| 2 | Dynamic `effectiveServerAnswers` on `initialDetailHasAttemptRef === false` flips `needsResumeDialog` & disposes active `useQuizAttemptStore` on mid-session refetch; `isWriting` ordering + unit test `store === null` false pass | Critical | Accept | `plan.md`, Phase 2 |
| 3 | `useStartQuizAttempt.onSuccess` uses `void invalidateQueries` (unlocks Start/Back before `GET /quiz` finishes); concurrent multi-tab POST TOCTOU | High | Accept (modified) | `plan.md`, Phase 2 (`quiz.ts` return promise; DB migration deferred & documented) |
| 4 | `<QuizTakeView>` lacks `key={testId}` / `key={assignmentId}`, leaking local refs/state across direct route switches | High | Accept | Phase 2 |
| 5 | `GET /practice/:testId/audio` & `GET /quiz` readable before Start (UI-only trust boundary vs misleading server claim) | High | Accept (modified) | `plan.md`, Phase 2 (documented trust boundary + accurate Listening copy) |
| 6 | `handleStartAttempt` undefined in Task 2.4 + `403 STUDENT_ORG_MISMATCH`/`404` error handling + stale cached intro when `attempt === null && quizQuery.isError` | High | Accept | Phase 2 |
| 7 | `test-read-1` is already `in_progress` (not fresh) at line 536 of `student-practice.test.ts` due to shared DB state from line 439 | High | Accept | Phase 1 |
| 8 | Single `<Link to={exitTarget.to} params={...}>` breaks strict TanStack Router TS types; `Link` test mocks ignore `params` | High | Accept | Phase 2 |
| 9 | Importing `PRACTICE_SKILL_LABELS` from `skill-catalog.tsx` pulls `@/lib/repos/student` -> `@teacher-os/env/web` into `jsdom` tests without `VITE_SERVER_URL` | Medium | Accept | Phase 2 |
| 10 | Non-integer `timeLimitSeconds` -> 404 fail-closed + catalog `"0 phút"` mismatch + `collection: null` renders `"null · TEST 6"` + XSS & `<script>`-only `description` edge case | Medium | Accept | Phase 1, Phase 2 |
| 11 | Missing `// @vitest-environment jsdom` in `practice-intro-screen.test.tsx`; Phase 3 `Enter` vs click contradiction + missing `audio_url` on Listening fixture | Medium | Accept | Phase 2, Phase 3 |

## Validation Log

### Session 1 — 2026-11-25
**Trigger:** Automated pre-implementation validation gate (`/ak-plan validate` under `/ak-vibe --ship --beta --advice`)
**Questions asked:** 0 (all engineering defects resolved deterministically via codebase evidence and `kongming` scope lock; zero unresolved product decisions)

### Verification Results
- **Tier:** Standard (3 phases: Fact Checker + Contract Verifier + Flow Tracer)
- **Claims checked:** 34 (file paths, symbols, schema definitions, all `practice-test-card` E2E consumers, TanStack Router/Query lifecycle, Vitest environment defaults, DOMPurify/rich-text helpers)
- **Verified:** 34 | **Failed:** 0 | **Unverified:** 0

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-student-practice-intro-ui.md`, `phase-03-e2e-and-ui-verification.md`
- Decision deltas checked: 11 (all Red Team findings)
- Reconciled stale references: 11
- Unresolved contradictions: 0

## Handover Note (`--advice`)

This plan is handover-ready: every phase contains ordered, self-contained tasks with exact target files/symbols, mechanical `Verify` conditions (including TDD red-phase pass conditions), and a materialized `## Failure Protocol` block so any verification failure stops and escalates to `kongming` before further code edits.

<!-- slug: 883-practice-intro-screen -->
