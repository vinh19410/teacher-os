---
phase: 3
title: "Phase 3: E2E Specs, UI Verification & Quality Gates"
status: todo
priority: P1
effort: "1h"
dependencies: [1, 2]
---

# Phase 3: E2E Specs, UI Verification & Quality Gates

## Goal

Update all 3 affected E2E specs (`student-practice.spec.ts`, `student-history.spec.ts`, `teacher-grade-submission.spec.ts`) so the practice intro flow is verified end-to-end (including zero attempt creation and zero audio streaming before Start, back-navigation to catalog, Listening intro metadata + `"Có file nghe"`, 3-viewport + 320px reflow, and keyboard activation), capture POT screenshots into `plans/reports/`, and pass all local quality gates.

## Files to Create / Modify

- Modify: `apps/e2e/specs/student-practice.spec.ts`
- Modify: `apps/e2e/specs/student-history.spec.ts`
- Modify: `apps/e2e/specs/teacher-grade-submission.spec.ts`
- Create (POT artifacts in `plans/reports/`): `plans/reports/883-practice-intro-desktop-light.png`, `plans/reports/883-practice-intro-desktop-dark.png`, `plans/reports/883-practice-intro-tablet.png`, `plans/reports/883-practice-intro-mobile.png`

## Tests Before / E2E Update

### Task 3.1 — Update all 3 affected E2E specs and run targeted E2E suite
<!-- Updated: Red Team Session 1 - added student-history.spec.ts & teacher-grade-submission.spec.ts; resolved Enter vs click sequence; seeded audio_url on Listening fixture to assert "Có file nghe" and 0 audio requests -->
- **Goal:** Verify end-to-end that clicking a Reading, Listening, or Writing practice card opens `PracticeIntroScreen` without creating an attempt, backing out leaves 0 attempts in DB, and activating `"Bắt đầu làm bài"` starts the attempt and completes downstream flows (Practice, History, Teacher Grading).
- **Target files and symbols:**
  - `apps/e2e/specs/student-practice.spec.ts`
  - `apps/e2e/specs/student-history.spec.ts` (`submitPracticeReading`, lines 77-94)
  - `apps/e2e/specs/teacher-grade-submission.spec.ts` (practice writing test, lines 360-370)
- **Steps:**
  1. In `apps/e2e/specs/student-practice.spec.ts`:
     - Seed a Listening practice test (in addition to existing Reading test `"The Falkirk Wheel"`) with `time_limit_seconds: 600` (`10 phút`), `description: "<p>Nghe kỹ hội thoại và điền đáp án.</p>"`, and `audio_url: "https://example.invalid/listening-sample.mp3"` on its `assignment_prompt` row so `hasAudio: true` is returned by `GET /quiz`.
     - Update the Reading test (`"Luyện tập › Reading: mở màn giới thiệu → quay lại không tạo attempt → bắt đầu → nộp → thấy điểm"`):
       - Track `POST /api/student/practice/.*/attempts` network requests.
       - Click the `"The Falkirk Wheel"` card -> assert URL `/learn/quizzes/practice/...`, assert `data-testid="practice-intro-screen"` is visible, assert `"2 câu hỏi"`, `"1 phần"`, `"20 phút"`, `"IELTS Trainer 2 · TEST 1"`, `"Hướng dẫn chung"`, and `practice-start-btn` (`"Bắt đầu làm bài"`) are visible, assert `navigator-progress` is NOT visible, and assert **0** `POST .../attempts` requests fired and **0** `quiz_attempt` rows exist in `local.db` for that `testId`.
       - Verify keyboard activation on `"Quay lại danh sách"` (focus button -> press `Enter`) -> assert URL returns to `/practice/reading` and still **0** `quiz_attempt` rows exist in `local.db`.
       - Click the card again -> verify 3 viewports (`1440×900`, `768×1024`, `375×812`) plus `320×812` have zero horizontal overflow (`scrollWidth <= clientWidth`), then reset viewport to `1280×720`.
       - Focus `practice-start-btn` (`"Bắt đầu làm bài"`) and press `Enter` (single activation via keyboard) -> assert `POST .../attempts` fired exactly once, `navigator-progress` appears (`"Đã trả lời 0/2 câu"`), answer both questions, submit, assert `attempt-correct-count` is `"2"`.
     - Add a focused test for Listening intro (`"Luyện tập › Listening: mở màn giới thiệu hiển thị thời lượng, mô tả rich-text, chỉ báo file nghe và không tạo attempt/stream audio trước khi bắt đầu"`):
       - Track both `POST /api/student/practice/.*/attempts` and `GET /api/student/practice/.*/audio` requests.
       - Navigate to `/practice/listening`, click seeded Listening card -> assert `practice-intro-screen` displays `"10 phút"`, `"Có file nghe"`, sanitized rich-text description `"Nghe kỹ hội thoại và điền đáp án."` (without raw `<p>` tags), Listening general instructions, **0** `POST .../attempts`, **0** `GET .../audio` requests, and **0** `quiz_attempt` rows in `local.db`.
  2. In `apps/e2e/specs/student-history.spec.ts` (`submitPracticeReading`, lines 77-94):
     - After `await expect(page).toHaveURL(/\/learn\/quizzes\/practice\//);`, click `await page.getByTestId("practice-start-btn").click();` before answering `[data-question="0"]`.
  3. In `apps/e2e/specs/teacher-grade-submission.spec.ts` (lines 360-370):
     - After `await expect(sp).toHaveURL(/\/learn\/quizzes\/practice\//);`, click `await sp.getByTestId("practice-start-btn").click();` before asserting `sp.getByLabel("Bài viết của bạn")`.
- **Success criteria:** All 3 targeted E2E specs pass against the local e2e stack on isolated ports `8100/8101/8103/8104/8105` (NEVER run full E2E suite locally per `AGENTS.md`).
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/student-practice.spec.ts specs/student-history.spec.ts specs/teacher-grade-submission.spec.ts` exits 0 and all tests pass.

## UI Verification & POT Screenshots

### Task 3.2 — Capture 3-viewport + light/dark POT screenshots and inspect visually
- **Goal:** Verify light/dark contrast, layout polish, focus ring visibility, and zero horizontal overflow on `PracticeIntroScreen` across `1440×900` (light & dark), `768×1024`, and `375×812`, saving clean screenshots into `plans/reports/` for the PR and issue #883 POT comment.
- **Target files and symbols:** `plans/reports/883-practice-intro-*.png`.
- **Steps:**
  1. Using a temporary Playwright capture script (stored in scratch dir, never committed) against the e2e stack (ports 8100–8105, cleaning up all spawned processes afterwards), capture screenshots of `PracticeIntroScreen` at:
     - `1440×900` light (`plans/reports/883-practice-intro-desktop-light.png`)
     - `1440×900` dark (`plans/reports/883-practice-intro-desktop-dark.png`)
     - `768×1024` light (`plans/reports/883-practice-intro-tablet.png`)
     - `375×812` light (`plans/reports/883-practice-intro-mobile.png`)
  2. Read the captured PNG files via `read_file` to visually inspect typography, spacing, contrast, badges, buttons, and absence of clipping/overlap/hardcoded light backgrounds in dark mode.
  3. Confirm no background servers or Playwright processes remain running (`ss -ltnp` / `ps`).
- **Success criteria:** All 4 screenshots exist, look visually clean in both light and dark themes with clear focus/contrast, and contain no secrets or personal data.
- **Verify:** `ls -lh plans/reports/883-practice-intro-*.png` exits 0 showing 4 non-empty PNG files and visual inspection confirms zero defects.

## Whole-Repo Quality Gates

### Task 3.3 — Run lint, typecheck, and unit test gates
- **Goal:** Ensure full compliance with repo quality gates before code review and beta ship.
- **Target files and symbols:** Workspace root.
- **Steps:**
  1. Run `pnpm exec biome check .` (fix with `pnpm check:fix` if needed, then re-verify read-only `pnpm exec biome check .`).
  2. Run `pnpm run check-types`.
  3. Run unit/integration tests for all affected packages (`@teacher-os/api`, `server`, `student`).
- **Success criteria:** Every gate exits 0 with zero warnings/failures.
- **Verify:** `pnpm exec biome check . && pnpm run check-types && pnpm --filter @teacher-os/api test && pnpm --filter server test && pnpm --filter student test` exits 0.

## Todo

- [x] Task 3.1: Update `student-practice.spec.ts`, `student-history.spec.ts`, and `teacher-grade-submission.spec.ts` and run all 3 targeted E2E specs on ports 8100–8105
- [x] Task 3.2: Capture and visually inspect 3-viewport + light/dark POT screenshots in `plans/reports/`
- [x] Task 3.3: Run workspace lint, typecheck, and affected test suites

## Success Criteria

- All 3 targeted E2E specs (`student-practice.spec.ts`, `student-history.spec.ts`, `teacher-grade-submission.spec.ts`) pass with Reading + Listening intro screen coverage and DB/network assertions proving 0 attempts and 0 audio requests before Start.
- Visual review across 1440×900 (light & dark), 768×1024, and 375×812 confirms `DESIGN.md` and `REVIEW.md` compliance.
- `pnpm exec biome check .`, `pnpm run check-types`, and all affected unit/server tests pass.

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
