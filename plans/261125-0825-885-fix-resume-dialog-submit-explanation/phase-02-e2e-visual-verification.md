# Phase 2: Targeted E2E Assertion, Visual Verification & Quality Gates

## Goal

Lock the reload-resume behavior in the targeted practice E2E spec, visually verify `QuizResumeDialog`, `QuizRuntimeHeader`, and real-browser hover `<TooltipContent>` across `1440×900`, `768×1024`, `375×812`, and `320×568` in Light & Dark themes on the unified E2E LMS stack (capturing screenshots for PR & Issue #885 POT), and pass all workspace lint, typecheck, and build gates matching `.github/workflows/quality.yml`.

## Files to Create or Modify

- `apps/e2e/specs/student-practice.spec.ts` (modify — assert `QuizResumeDialog` helper text, `"Nộp bài"` disabled with safe multi-ID `aria-describedby` lookup while open, zero overflow while dialog is open, and `"Nộp bài"` enabled with no `aria-describedby` after clicking `"Tiếp tục"`)
- `plans/reports/885-*.png` (create — visual verification screenshots for PR & Issue #885 POT: desktop light/dark, tablet light, mobile light/dark for `QuizResumeDialog`, plus desktop light hover `<TooltipContent>` on non-modal disabled `"Nộp bài"`)

## Tasks & Steps

### Task 2.1 — Extend reload-resume E2E assertion in `student-practice.spec.ts`
- **Goal:** Verify end-to-end in a real Chromium browser that reloading an in-progress practice attempt displays the explanation in `QuizResumeDialog`, links `"Nộp bài"` via `aria-describedby` while disabled, causes zero horizontal overflow while open, and unlocks `"Nộp bài"` immediately upon clicking `"Tiếp tục"`.
- **Target files and symbols:**
  - `apps/e2e/specs/student-practice.spec.ts` (around lines `222-235`, inside the reload & resume test block)
- **Steps:**
  1. Right after `await expect(page.getByText("Tiếp tục bài làm")).toBeVisible();` (line 224):
     - Locate `const resumeDialog = page.getByRole("alertdialog", { name: "Tiếp tục bài làm" });`.
     - Assert `resumeDialog.getByTestId("quiz-dialog-helper")` is visible and has text `'Hãy chọn "Tiếp tục" để khôi phục bài làm và mở khóa nút "Nộp bài".'`.
     - Locate `const submitBtn = page.getByRole("button", { name: "Nộp bài" });`.
     - Assert `submitBtn` is disabled (`await expect(submitBtn).toBeDisabled()`).
     - Read `const describedBy = await submitBtn.getAttribute("aria-describedby");`, assert it is non-empty, split by whitespace (`describedBy.trim().split(/\s+/)`), and evaluate `page.evaluate((ids) => ids.map((id) => document.getElementById(id)?.textContent?.trim() ?? "").filter(Boolean).join(" "), ids)` (never interpolating raw IDs into a CSS selector) to equal `'Hãy chọn "Tiếp tục" trong hộp thoại để mở khóa nút nộp bài.'`.
     - Verify `document.documentElement.scrollWidth <= document.documentElement.clientWidth` while `resumeDialog` is open.
  2. Immediately after `await page.getByRole("button", { name: "Tiếp tục" }).click();` (line 231):
     - Assert `resumeDialog` is hidden (`await expect(resumeDialog).toBeHidden()`).
     - Assert `submitBtn` is enabled (`await expect(submitBtn).toBeEnabled()`) and `aria-describedby` attribute is absent (`await expect(submitBtn).not.toHaveAttribute("aria-describedby")`).
- **Success criteria:** Targeted E2E spec passes deterministically against real API + unified `apps/lms` preview.
- **Verify:** `E2E_API_PORT=8100 E2E_LMS_PORT=8101 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/student-practice.spec.ts` exits 0 with all tests in `student-practice.spec.ts` passing.

### Task 2.2 — Capture Light/Dark multi-viewport screenshots & verify real-browser hover `<TooltipContent>`
- **Goal:** Visually verify `QuizResumeDialog` + `QuizRuntimeHeader` across `1440×900`, `768×1024`, `375×812`, and `320×568` in both Light and Dark themes (zero horizontal overflow or clipping), AND verify real-browser hover `<TooltipContent>` (first monorepo consumer of `packages/ui/src/components/tooltip.tsx`) on a non-modal disabled `"Nộp bài"` state (Speaking without uploaded media) on the unified E2E LMS stack (`apps/e2e/playwright.config.ts`).
- **Target files and symbols:**
  - `plans/reports/885-resume-dialog-desktop-light.png`
  - `plans/reports/885-resume-dialog-desktop-dark.png`
  - `plans/reports/885-resume-dialog-tablet-light.png`
  - `plans/reports/885-resume-dialog-mobile-light.png`
  - `plans/reports/885-resume-dialog-mobile-dark.png`
  - `plans/reports/885-submit-tooltip-desktop-light.png`
- **Steps:**
  1. Run a temporary Playwright verification spec inside `apps/e2e/specs/` (deleted immediately after capture — never committed!) using `apps/e2e/playwright.config.ts` with `E2E_API_PORT=8100 E2E_LMS_PORT=8101 E2E_WEB_PORT=8101 E2E_PROFILE_PORT=8105` (which boots `boot:api` + unified `apps/lms` with `LMS_REBUILD_PORTALS=1` and `VITE_STUDENT_PRACTICE_ENABLED=true`, and tears down all webServer processes cleanly on exit):
     - Flow A (Practice Reading reload → `QuizResumeDialog` open): assert `scrollWidth <= clientWidth` at `1440×900`, `768×1024`, `375×812`, `320×568` in both Light and Dark themes; save `885-resume-dialog-desktop-light.png` (`1440×900` Light), `885-resume-dialog-desktop-dark.png` (`1440×900` Dark), `885-resume-dialog-tablet-light.png` (`768×1024` Light), `885-resume-dialog-mobile-light.png` (`375×812` Light), and `885-resume-dialog-mobile-dark.png` (`375×812` Dark).
     - Flow B (Speaking assignment with `media === null` → `"Nộp bài"` disabled without modal): hover `[data-testid="submit-disabled-trigger"]` at `1440×900`, assert `[data-slot="tooltip-content"]` is visible with text `"Bạn cần tải file bài nói lên trước khi nộp bài."` and lies completely within viewport bounds (`box.x >= 0 && box.x + box.width <= 1440`), and save `885-submit-tooltip-desktop-light.png`.
  2. Delete the temporary verification spec file immediately after capture.
  3. Visually inspect every saved PNG using `read_file` to confirm crisp contrast, readable helper text & tooltip, clean arrow alignment, and zero clipping/overlap in Light & Dark modes.
  4. Verify no leftover background processes remain on ports `8100–8105`.
- **Success criteria:** All 6 PNG files exist, show clean Light & Dark rendering + real-browser tooltip placement without overflow/clipping, temporary spec is removed, and no orphan processes remain.
- **Verify:** `ls -lh plans/reports/885-*.png` lists all 6 non-empty PNG files, `git status --short apps/e2e/specs/` shows only `student-practice.spec.ts`, and `read_file` visual inspection passes on every image.

### Task 2.3 — Run workspace quality gates
- **Goal:** Confirm zero lint, formatting, type, unit-test, or unified LMS build regressions matching `.github/workflows/quality.yml`.
- **Target files and symbols:** Repository-wide quality gates (`package.json:24-25`, `.github/workflows/quality.yml:48-50`).
- **Steps:**
  1. Run `pnpm exec biome check .` (read-only lint/format check; if formatting drift exists, run `pnpm check:fix` and re-verify with `pnpm exec biome check .`).
  2. Run `VITE_SERVER_URL=http://localhost:8000 pnpm check-types`.
  3. Run `pnpm --filter student test`.
  4. Run `VITE_SERVER_URL=http://localhost:8000 pnpm build` (covers `apps/student` + unified `apps/lms` + all workspace packages, matching `quality.yml:50`).
- **Success criteria:** All 4 commands exit 0 with zero errors or failing tests.
- **Verify:** `pnpm exec biome check . && VITE_SERVER_URL=http://localhost:8000 pnpm check-types && pnpm --filter student test && VITE_SERVER_URL=http://localhost:8000 pnpm build` exits 0.

## Verification

1. `E2E_API_PORT=8100 E2E_LMS_PORT=8101 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/student-practice.spec.ts` exits 0.
2. `ls -lh plans/reports/885-*.png` exits 0 and visual review passes for all 6 screenshots (Light/Dark + real-browser hover Tooltip).
3. `pnpm exec biome check . && VITE_SERVER_URL=http://localhost:8000 pnpm check-types && pnpm --filter student test && VITE_SERVER_URL=http://localhost:8000 pnpm build` exits 0.

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
