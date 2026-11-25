---
phase: 3
title: "Phase 3: E2E Verification, Responsive/Theme Audit & POT"
status: done
priority: P1
effort: "1h"
dependencies: [1, 2]
---

# Phase 3: E2E Verification, Responsive/Theme Audit & POT

<!-- Updated: Red Team Session 2026-11-25 - Added real Reading passage to seedPracticeTest for split-pane E2E & POT, replaced tight 10s regexes with parsed-second range checks + scoped DB UPDATE, added split-pane expired-banner zero-scroll check and 320px saving + 3-digit timer check -->

## Goal

Extend the targeted Playwright spec `apps/e2e/specs/student-practice.spec.ts` (including a real Reading `passage` to exercise split-pane layout) to verify the countdown timer, cross-reload duration continuity, soft-expiry zero-document-scroll on split-pane, and zero horizontal overflow across `320px`, `375px`, `768px`, and `1440px` in light and dark themes; capture 3-viewport Light/Dark POT screenshots in `plans/reports/`; and pass all local lint, typecheck, and targeted test gates.

## Files to Create / Modify

- Modify: `apps/e2e/specs/student-practice.spec.ts`
- Create: `plans/reports/880-practice-timer-*.png` (3 viewports `1440x900`, `768x1024`, `375x812` in light + dark mode on Reading split-pane with live countdown timer for issue #880 POT)

## Tests Before (TDD Red Phase)

### Task 3.1 — Add targeted E2E assertions for practice timer, Reading split-pane, reload/resume duration, soft expiry, and 320px–1440px responsive layout
- **Goal:** Verify the real end-to-end flow (browser + Hono API + SQLite) covering both symptoms of issue #880, split-pane desktop scroll invariant, and `REVIEW.md` viewports without CI timing flake.
- **Target files and symbols:** `apps/e2e/specs/student-practice.spec.ts` (`seedPracticeTest` + test cases).
- **Steps:**
  1. Update `seedPracticeTest()` in `apps/e2e/specs/student-practice.spec.ts` to populate `passage` with a multi-paragraph Reading passage (so `isReadingSplitPane("reading", passage)` is `true`!) and return `testId`. Keep `time_limit_seconds = 1200` (20 minutes).
  2. Add a small `parseClockSeconds(text: string): number` helper (`MM:SS` -> total seconds).
  3. In `"Luyện tập › Reading: mở đề seed → nộp → thấy điểm"`:
     - After opening the practice test, assert `reading-passage-pane`, `reading-work-pane`, and `quiz-timer-badge` are visible.
     - Parse initial badge text (`initialSec`) and assert `initialSec >= 1140 && initialSec <= 1200` (generous 60s window for cold CI).
     - Answer Q1, wait for `save-state` to reach `saved`.
     - Execute a scoped SQL `UPDATE quiz_attempt SET started_at = started_at - 180000 WHERE org_id = ? AND test_id = ? AND mode = 'practice' AND status = 'in_progress'` on `apps/e2e/local.db` to deterministically simulate 3 minutes elapsed before reload.
     - Reload (`await page.reload()`):
       - Assert `QuizResumeDialog` (`"Tiếp tục bài làm"`) is visible.
       - Assert `quiz-timer-badge` is visible while the resume dialog is open, with parsed `resumedSec` satisfying `resumedSec >= 900 && resumedSec <= 1020` and `initialSec - resumedSec >= 170` (proving timer resumed at ~17m instead of resetting to 20:00).
       - Click `"Tiếp tục"`, answer Q2, wait for `saved`.
       - Verify responsive zero-horizontal-overflow (`scrollWidth <= clientWidth`) at `1440×900`, `768×1024`, `375×812`, and `320×568` in both light and dark modes (via `document.documentElement.classList.toggle("dark", ...)`), plus desktop `1440×900` split-pane `document.scrollingElement.scrollTop === 0`.
       - Click `"Nộp bài"` and verify summary URL + `2/2` correct + summary text matches `/hoàn thành trong [34] phút/` (proving pre-reload 3 minutes + post-resume seconds are both counted!).
  4. Also verify soft-expiry behavior in a second retake (or dedicated test in `student-practice.spec.ts`): backdate `started_at` by `1_260_000` ms (21 minutes > 20m limit) with scoped `WHERE`, reload, assert `quiz-timer-badge` has `data-state="expired"` and text `"00:00"`, `quiz-time-expired-banner` is visible, `1440×900` split-pane keeps `document.scrollingElement.scrollTop === 0`, and `Nộp bài` remains enabled and submits cleanly.
- **Success criteria:** Single-spec E2E passes cleanly with port overrides `8100–8105` (NEVER run full E2E locally per `AGENTS.md`).
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e student-practice.spec.ts` exits 0.

## Implementation & Verification

### Task 3.2 — Capture 3-viewport Light & Dark POT screenshots and run targeted `student-quiz-take-review` regression spec
- **Goal:** Produce crisp visual proof for issue #880 POT (`plans/reports/880-practice-timer-*.png`) on real Reading split-pane + timer + summary duration, and verify existing quiz take/review split-pane & leak-guard spec stays 100% green.
- **Target files and symbols:** `plans/reports/880-practice-timer-{1440,768,375}-{light,dark}.png`.
- **Steps:**
  1. Run a temporary Playwright capture script (stored in scratch directory, not committed) against the E2E stack (ports `8100–8105`) to capture Reading practice split-pane with the live countdown timer at `1440×900`, `768×1024`, and `375×812` in both light and dark themes. Save PNGs under `plans/reports/880-practice-timer-*.png`.
  2. Visually inspect the captured PNGs using `read_file` to verify zero clipping, zero overlap, clean contrast, and strict `DESIGN.md` token compliance.
  3. Stop all temporary E2E/dev processes cleanly (verify ports `8100–8105` free).
  4. Run `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e student-quiz-take-review.spec.ts` (targeted regression spec for split-pane scroll invariant and zero leaked keys).
- **Success criteria:** All screenshots visually verified clean; both targeted E2E specs pass with 0 failures; zero ghost processes remain.
- **Verify:** Both targeted E2E specs exit 0 and `ls plans/reports/880-practice-timer-*.png` lists all 6 viewport/theme PNGs.

### Task 3.3 — Run full workspace lint, typecheck, and affected unit/integration suites
- **Goal:** Confirm zero regressions across the monorepo before local code review and shipping.
- **Target files and symbols:** Workspace-wide.
- **Steps:**
  1. Run `pnpm exec biome check .` (fix with `pnpm check` if needed and re-check).
  2. Run `pnpm check-types`.
  3. Run `pnpm --filter @teacher-os/api test && pnpm --filter @teacher-os/db test && pnpm --filter student test && pnpm --filter server exec vitest run src/quiz-attempt-practice-unique-migration.test.ts src/quiz-attempt-practice-migration.test.ts src/routes/student-practice.test.ts src/routes/student-practice-library-sync.test.ts src/routes/student-quiz.test.ts src/routes/student-history.test.ts`.
- **Success criteria:** All commands exit 0 with zero failures.
- **Verify:** Chained check command exits 0.

## Regression Gate

- `pnpm exec biome check . && pnpm check-types` exits 0.

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
