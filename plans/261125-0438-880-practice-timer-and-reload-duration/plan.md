---
title: "Fix practice take-screen timer and reload/resume duration integrity (#880)"
description: "Expose test time limits and server-anchored attempt start timestamps, render a zero-rerender countdown timer with soft expiry on the take screen, and enforce single active practice attempt integrity across reloads."
status: completed
priority: P1
effort: "4h"
tags: [practice, timer, quiz-attempt, bugfix, issue-880]
created: 2026-11-25
---

# Fix Practice Take-Screen Timer & Reload Duration Integrity (#880)

## Overview

Address both parts of issue [#880](https://github.com/vinh19410/teacher-os/issues/880) under `kongming` advisory supervision (`--advice`) and TDD:

1. **Missing take-screen countdown timer (confirmed gap):** Practice tests carry `assignment_test.time_limit_seconds` (exposed as `durationMin` in catalog), but `GET /api/student/practice/:testId/quiz` omits `timeLimitSeconds` and `attempt.startedAt`, no `X-Server-Now` clock header is exposed, and `QuizTakeView` / `QuizRuntimeHeader` render no timer.
2. **Reload/resume duration integrity (audited & hardened):** Full-stack audit confirmed `quiz_attempt.started_at` is never overwritten on single-row reloads or submits; however, practice mode lacked a partial unique index for active `in_progress` rows, lacked a synchronous double-click lock on `PracticeSkillPage`, selected duplicates via `DESC` instead of `ASC`, and hardcoded `new Date()` instead of `deps.now`.

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - Optional `timeLimitSeconds` (emitted ONLY on practice `/quiz` when positive) and `attempt.startedAt` (inside non-strict `attempt` object) on `studentQuizDetailSchema`; rolling-deploy-safe `X-Server-Now` HTTP response header (exposed in CORS `exposeHeaders`) for client clock-skew sync (ZERO new top-level JSON keys on production assignment `/quiz`!).
  - D1-safe migration `0090` deduplicating any existing duplicate `in_progress` practice rows (scoring content richness: `media_key`, count of non-empty `json_each(answers)` values, `length(trim(essay))`, `rowid DESC`; preserving `MIN(started_at)` strictly over `in_progress` rows) and adding partial unique index `quiz_attempt_practice_in_progress_uq`.
  - Server route hardening (`student-practice.ts`, `student.ts`): shared `normalizeTimeLimitSeconds`, `getNow()` via `deps.now` (including `visibleAssignmentFilter` and `availableAt` gates), `asc(startedAt), asc(id)`, and unique-conflict re-read fallback.
  - Isolated leaf component `<QuizTimerBadge>` (`MM:SS`, `data-testid="quiz-timer-badge"`, neutral / warn `<= min(300, floor(limit * 0.2))` / expired `00:00` stopping its interval at `0` and firing one-shot `onExpiredChange` so `QuizPaper`/`DOMPurify` never re-render every second), server-clock sync via `X-Server-Now` header (immune to `setQuizDetailMedia` cache updates), continuous tick behind `QuizResumeDialog`, wrapped `QuizReadingSplitLayout fillParent` (`flex-1 min-h-0` inside `lg:h-svh`), `h-14 shrink-0` header tightened for `320px` reflow, and synchronous `useRef` + state click lock in `PracticeSkillPage`.
  - Targeted unit, migration (new file preserving `0041` test), integration, and single-spec E2E (`student-practice.spec.ts` with real Reading `passage` split-pane) verification + 3-viewport Light/Dark POT screenshots.
- **Explicit Non-Goals:**
  - No auto-submit on timer expiry (soft-expiry matching `placement-test-runner.tsx`).
  - No countdown on untimed practice (`timeLimitSeconds === null`) or class assignments (`class_assignment` has no `timeLimitSeconds` column).
  - No active-only paused duration tracker in `localStorage` (wall-clock `submittedAt - startedAt` remains the single source of truth).
  - No intro screen before practice start (tracked separately in #883) or resume-dialog submit tooltip (tracked separately in #885).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Expose `timeLimitSeconds` (practice), `attempt.startedAt`, and `X-Server-Now` header cleanly without breaking rolling deploys or leaking banned keys | P1 |
| 2 | Enforce single `in_progress` practice attempt invariant in DB, server routes, and catalog click handler with deterministic reload/resume duration tests | P1 |
| 3 | Render an accurate, zero-parent-rerender countdown timer with soft expiry, split-pane height safety, and 320px-safe responsive header | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Contracts, DB Migration & Practice Attempt Integrity](./phase-01-start.md) | Done |
| 2 | [Phase 2: Student Practice Countdown Timer & Header Reflow](./phase-02-student-timer-ui.md) | Done |
| 3 | [Phase 3: E2E Verification, Responsive/Theme Audit & POT](./phase-03-e2e-visual-verification.md) | Done |

## Success Criteria

- [x] `GET /api/student/practice/:testId/quiz` emits `X-Server-Now` header, `attempt.startedAt`, and (when positive) `timeLimitSeconds`; `GET /api/student/assignments/:assignmentId/quiz` emits `X-Server-Now` header and `attempt.startedAt` with zero new top-level JSON keys; zero banned keys leaked.
- [x] Migration `0090` deduplicates pre-existing duplicate `in_progress` practice attempts using content-richness ranking (`media_key`, non-empty answer count, essay length, `rowid DESC`) + `MIN(started_at)` strictly on `in_progress` rows, and enforces `quiz_attempt_practice_in_progress_uq` cleanly on libsql/D1; existing migration `0041` test file remains intact.
- [x] Concurrent `POST /api/student/practice/:testId/attempts` resolves to one canonical `attemptId`, and stepping `deps.now` across start → answer → reload → resume → submit proves summary `submittedAt - startedAt` includes pre-reload + post-resume time.
- [x] `<QuizTimerBadge>` displays a live server-synced `MM:SS` countdown when `timeLimitSeconds > 0`, compensates for client clock skew via `X-Server-Now` (unaffected by `setQuizDetailMedia`), keeps ticking during `QuizResumeDialog`, stops ticking at `00:00` after firing `onExpiredChange(true)` without re-rendering `QuizPaper` every second, and hides when `timeLimitSeconds` is `null`/absent.
- [x] `QuizRuntimeHeader` maintains exact `h-14 shrink-0` on desktop, Reading split-pane (`lg:h-svh` + `flex-1 min-h-0` wrapper around `QuizReadingSplitLayout fillParent`) keeps `document.scrollingElement.scrollTop === 0` even with the expiry banner visible, and `320×568` (including `saving` + 3-digit timer), `375×812`, `768×1024`, and `1440×900` have zero horizontal overflow in both light and dark themes.
- [x] `pnpm exec biome check .`, `pnpm check-types`, targeted Vitest suites, `student-practice.spec.ts`, and `student-quiz-take-review.spec.ts` (ports `8100–8105`) all exit 0.

## Red Team Review

### Session — 2026-11-25
**Reviewers:** 3 independent adversarial `code-reviewer` agents (Security Adversary / Fact Checker, Assumption Destroyer / Contract Verifier, Failure Mode Analyst / Flow Tracer)
**Findings:** 10 deduplicated (3 Critical, 3 High, 4 Medium — 10 accepted, 0 rejected)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Rolling-deploy `.strict()` crash from top-level `serverNow` on assignment `/quiz` | Critical | Accept | Phase 1 (`X-Server-Now` header, zero new top-level keys on assignment `/quiz`, omit `timeLimitSeconds` when null) |
| 2 | Plan marked existing `quiz-attempt-practice-migration.test.ts` (0041 tests) as `Create` | Critical | Accept | Phase 1 & Phase 3 (new file `quiz-attempt-practice-unique-migration.test.ts`) |
| 3 | `QuizReadingSplitLayout fillParent` directly under `lg:h-svh` overflows by `3.5rem` (+ banner) and `QuizRuntimeHeader` lacks `shrink-0` | Critical | Accept | Phase 2 (`shrink-0` on header + `flex-1 min-h-0` wrapper around `fillParent`) |
| 4 | Migration `0090` binary dedup check fooled by `{"0":""}`/`"{ }"` & could drop richer work or R2 `media_key` | High | Accept | Phase 1 (content-richness ranking + `in_progress`-scoped `MIN(started_at)` + expanded migration tests) |
| 5 | `setQuizDetailMedia` bumps `dataUpdatedAt` without updating `serverNow`, resetting Speaking timer | High | Accept | Phase 2 (`X-Server-Now` captured at HTTP fetch in `server-clock.ts` + preserve `updatedAt` in `setQuizDetailMedia`) |
| 6 | 1s `setInterval` in `QuizTakeView` re-renders 1,133-line `QuizPaper` & uncached `DOMPurify.sanitize()` every second | High | Accept | Phase 2 (isolated leaf `<QuizTimerBadge>` stopping interval at `00:00`, one-shot `onExpiredChange`) |
| 7 | `seedPracticeTest()` lacks `passage` (never tests Reading split-pane) + 10s wall-clock regex flake in E2E | High | Accept | Phase 3 (add real `passage`, test split-pane + expiry banner, parse `MM:SS` with generous range) |
| 8 | Double-click guard using only `startPractice.isPending` misses same-tick click & post-POST loader window | Medium | Accept | Phase 2 (synchronous `useRef` lock + `openingTestId` spanning `POST` through `await navigate`) |
| 9 | `normalizeTimeLimitSeconds` mismatch on catalog vs take, incomplete `deps.now` in `student.ts`, shared DB mutation in `student-practice.test.ts` | Medium | Accept | Phase 1 (shared normalizer, full `getNow()` in `student.ts`, isolated `describe` DB) |
| 10 | `320px` header overflow risk under `"Đang lưu…"` + 3-digit timer (`240:00`) | Medium | Accept | Phase 2 & Phase 3 (hide `<Clock>` `< sm`, tighter `px-2`, verify `320px` with `saving` + 3-digit timer) |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-student-timer-ui.md`, `phase-03-e2e-visual-verification.md`
- Decision deltas checked: 10
- Reconciled stale references: 10 (`serverNow` JSON → `X-Server-Now` header, `quiz-attempt-practice-migration.test.ts` → `quiz-attempt-practice-unique-migration.test.ts`, `QuizTimerBadge` leaf extraction, `fillParent` wrapper, `openingRef`, `getNow()`, `passage` in E2E)
- Unresolved contradictions: 0

## Validation Log

### Verification Results
- **Tier:** Standard (3 phases — Fact Checker + Contract Verifier + Flow Tracer)
- **Claims checked:** 30+ (across all 3 red-team verification roles)
- **Verified:** All reconciled file paths, symbols, schemas, migrations, and test files verified against codebase
- **Failed:** 0 remaining after red-team reconciliation | **Unverified:** 0
- **CLI Check:** `ak plan validate` → `valid: true`

<!-- slug: 880-practice-timer-and-reload-duration -->
