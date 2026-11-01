---
phase: 1
title: "Phase 1: TDD Fix & Contrast Verification"
status: todo
priority: P2
effort: "1h"
dependencies: []
---

# Phase 1: TDD Fix & Contrast Verification

<!-- Updated: Red Team & Validation Session 1 - Added transition-safe expect.poll, ancestor backdrop + group opacity compositing, 3-viewport x 2-theme loop, e2e check-types, and Step 1-4 hover/transition assertions -->

## Goal

Fix the unreadable CTA buttons ("Tiếp tục" and "Hoàn thành") in `OnboardingWizard` by replacing the removed v1 `text-bg` class with `text-primary-foreground` and removing double-fading `opacity-50` on the disabled "Tiếp tục" state, backed by test-first unit and Playwright E2E contrast checks.

## Overview

`apps/student/src/components/onboarding/onboarding-wizard.tsx` renders the 4-step student onboarding wizard plus a step-5 summary confirmation screen:
- Lines 222–236 render the **"Tiếp tục"** button (`step < 4`). When `isCurrentStepValid` is `true`, line 230 applies `"cursor-pointer bg-primary text-bg hover:bg-primary hover:text-primary-foreground"`. When `isCurrentStepValid` is `false`, line 231 applies `"cursor-not-allowed rounded-md bg-muted text-muted-foreground opacity-50"`.
- Lines 238–252 render the **"Hoàn thành"** button (`step === 4`). Line 242 applies `"inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 font-medium text-bg text-sm transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"`.

## Files to Create / Modify

- Modify: `apps/student/test/onboarding.test.tsx`
- Modify: `apps/student/src/components/onboarding/onboarding-wizard.tsx`
- Modify: `apps/e2e/specs/student-portal-onboarding.spec.ts`

## Requirements

- [ ] Write a failing unit test in `apps/student/test/onboarding.test.tsx` (TDD Red) exercising `OnboardingWizard` across disabled and enabled states on Steps 1–4 ("Tiếp tục") and Step 5 ("Hoàn thành"), asserting that neither CTA uses the non-existent `text-bg` or `hover:bg-primary` utilities, both active CTAs carry `bg-primary`, `text-primary-foreground`, and `hover:bg-primary/90`, and the disabled "Tiếp tục" button uses `bg-muted` + `text-muted-foreground` without `opacity-50`.
- [ ] Update `apps/student/src/components/onboarding/onboarding-wizard.tsx` (TDD Green) at lines 230–231 and 242 to use `text-primary-foreground hover:bg-primary/90` and remove `opacity-50` from the disabled "Tiếp tục" state.
- [ ] Add real-browser WCAG contrast assertions (`>= 4.5`) in `apps/e2e/specs/student-portal-onboarding.spec.ts` for the "Tiếp tục" (disabled and enabled) and "Hoàn thành" buttons across light and dark themes and 3 viewports (`1440×900`, `768×1024`, `375×812`).

## Tasks & Steps

### Task 1.1 — Add TDD Red test for `OnboardingWizard` CTA button states and contrast tokens
- **Goal**: Add a DOM interaction test in `apps/student/test/onboarding.test.tsx` that walks `OnboardingWizard` from initial disabled Step 1 through enabled Steps 1–4 to Step 5 ("Hoàn thành") and fails against the current `text-bg` / `opacity-50` implementation.
- **Target files and symbols**: `apps/student/test/onboarding.test.tsx` (`describe("OnboardingStep Components")`, `OnboardingWizard`).
- **Steps**:
  1. Add `// @vitest-environment jsdom` at line 1 of `apps/student/test/onboarding.test.tsx` and import `{ cleanup, fireEvent, render, screen }` from `@testing-library/react` and `afterEach` from `vitest`.
  2. Register `afterEach(() => cleanup())`.
  3. Add a test `"OnboardingWizard: transitions Tiếp tục from disabled muted contrast to enabled primary-foreground contrast and renders readable Hoàn thành CTA"` that:
     - Renders `<OnboardingWizard onCompleted={vi.fn()} />` wrapped in `<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>`.
     - Defines two assertion helpers for `<button>` elements:
       - `assertDisabledContinue(btn)`: asserts `btn.disabled === true`, `btn.classList.contains("bg-muted")`, `btn.classList.contains("text-muted-foreground")`, `!btn.classList.contains("opacity-50")`, and `!btn.classList.contains("text-bg")`.
       - `assertEnabledPrimaryCta(btn)`: asserts `btn.disabled === false`, `btn.classList.contains("bg-primary")`, `btn.classList.contains("text-primary-foreground")`, `btn.classList.contains("hover:bg-primary/90")`, `!btn.classList.contains("text-bg")`, and `!btn.classList.contains("hover:bg-primary")`.
     - Step 1 (`Bước 1/4`): queries `screen.getByRole("button", { name: "Tiếp tục" })`, calls `assertDisabledContinue`, clicks `screen.getByRole("button", { name: /IELTS/i })`, calls `assertEnabledPrimaryCta`, and clicks "Tiếp tục".
     - Step 2 (`Bước 2/4`): calls `assertDisabledContinue`, clicks `screen.getByRole("button", { name: "Band 6.5" })`, calls `assertEnabledPrimaryCta`, and clicks "Tiếp tục".
     - Step 3 (`Bước 3/4`): calls `assertDisabledContinue`, clicks `screen.getByRole("button", { name: "Du học" })`, calls `assertEnabledPrimaryCta`, and clicks "Tiếp tục".
     - Step 4 (`Bước 4/4`): calls `assertDisabledContinue`, clicks `screen.getByRole("button", { name: "1–2 giờ" })`, calls `assertEnabledPrimaryCta`, and clicks "Tiếp tục".
     - Step 5 (`Xác nhận thông tin của bạn`): queries `screen.getByRole("button", { name: "Hoàn thành" })` and calls `assertEnabledPrimaryCta`.
- **Success criteria**: Running the student unit test file fails specifically on the new test because `OnboardingWizard` currently outputs `opacity-50` on disabled "Tiếp tục" and `text-bg` (missing `text-primary-foreground` and `hover:bg-primary/90`) on enabled "Tiếp tục" and "Hoàn thành".
- **Verify**: `pnpm --filter student exec vitest run test/onboarding.test.tsx` exits non-zero with an assertion failure in the new `OnboardingWizard` test (TDD Red state; a passing test at this step is a failure).

### Task 1.2 — Fix CTA button classes in `OnboardingWizard` (TDD Green)
- **Goal**: Replace `text-bg` with `text-primary-foreground` (and `hover:bg-primary hover:text-primary-foreground` with `hover:bg-primary/90`) on the enabled "Tiếp tục" and "Hoàn thành" buttons, and remove `opacity-50` from the disabled "Tiếp tục" button in `apps/student/src/components/onboarding/onboarding-wizard.tsx`.
- **Target files and symbols**: `apps/student/src/components/onboarding/onboarding-wizard.tsx` (function `OnboardingWizard`, lines 229–232 and 242).
- **Steps**:
  1. In `apps/student/src/components/onboarding/onboarding-wizard.tsx` at lines 229–232 ("Tiếp tục" button):
     - Replace `"cursor-pointer bg-primary text-bg hover:bg-primary hover:text-primary-foreground"` with `"cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"`.
     - Replace `"cursor-not-allowed rounded-md bg-muted text-muted-foreground opacity-50"` with `"cursor-not-allowed rounded-md bg-muted text-muted-foreground"`.
  2. In `apps/student/src/components/onboarding/onboarding-wizard.tsx` at line 242 ("Hoàn thành" button):
     - Replace `"inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 font-medium text-bg text-sm transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"` with `"inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"`.
- **Success criteria**: `test/onboarding.test.tsx` passes all unit tests, and `grep` finds 0 occurrences of `text-bg` in `apps/student/src/components/onboarding/onboarding-wizard.tsx`.
- **Verify**: `pnpm --filter student exec vitest run test/onboarding.test.tsx` exits 0 and prints `2 passed`.

### Task 1.3 — Add computed WCAG contrast verification in Playwright E2E spec and verify gates
- **Goal**: Assert in `apps/e2e/specs/student-portal-onboarding.spec.ts` that the rendered "Tiếp tục" (disabled & enabled) and "Hoàn thành" buttons achieve WCAG AA contrast (≥ 4.5:1) in real Chromium across light and dark themes and 3 viewports (`1440×900`, `768×1024`, `375×812`), and run lint, typecheck, unit tests, and Playwright E2E.
- **Target files and symbols**: `apps/e2e/specs/student-portal-onboarding.spec.ts` (test `"happy-path: signup -> verify email -> redirect to /onboarding -> complete wizard -> overview + db assert + reverse gate"`).
- **Steps**:
  1. In `apps/e2e/specs/student-portal-onboarding.spec.ts`, add a helper `measureButtonContrast(locator: Locator): Promise<number>` that evaluates on the button element `el`:
     - Creates a 1×1 `<canvas>` with `getContext("2d", { willReadFrequently: true })`.
     - Defines `parseRgba(cssColor: string): [number, number, number, number]` which calls `ctx.clearRect(0, 0, 1, 1)`, sets `ctx.fillStyle = "#010203"`, sets `ctx.fillStyle = cssColor`, calls `ctx.fillRect(0, 0, 1, 1)`, reads `const data = ctx.getImageData(0, 0, 1, 1).data`, and returns `[data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, (data[3] ?? 0) / 255]`.
     - Walks `let anc: HTMLElement | null = el.parentElement` upward until finding an ancestor whose `parseRgba(getComputedStyle(anc).backgroundColor)[3] > 0` (falling back to `[255, 255, 255, 1]`), storing that ancestor RGB as `backdrop`.
     - Reads `const style = getComputedStyle(el)`, parses `fgRaw = parseRgba(style.color)` and `bgRaw = parseRgba(style.backgroundColor)`, and reads `const opacity = Number.parseFloat(style.opacity || "1")`.
     - If `bgRaw[3] === 0`, returns `0` (so a missing `bg-*` utility cannot masquerade as opaque black).
     - Composites `bg` over `backdrop` using `bgRaw[3]`, composites `fg` over `bg` using `fgRaw[3]`, and if `opacity < 1`, composites **both** `fg` and `bg` over `backdrop` via `c = opacity * c + (1 - opacity) * backdrop`.
     - Computes WCAG 2.1 relative luminance $L = 0.2126 R + 0.7152 G + 0.0722 B$ (where $C = s \le 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055)^{2.4}$ for $s = c / 255$) and returns `(Math.max(Lfg, Lbg) + 0.05) / (Math.min(Lfg, Lbg) + 0.05)`.
  2. Add a helper `assertButtonContrastAcrossThemesAndViewports(page: Page, button: Locator)` that iterates viewports `[{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 375, height: 812 }]` and themes `["light", "dark"]` (toggling `await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), theme === "dark")`), and at each combination asserts `await expect(button).toBeVisible()` and `await expect.poll(() => measureButtonContrast(button)).toBeGreaterThanOrEqual(4.5)`, then restores light mode (`document.documentElement.classList.remove("dark")`) and `{ width: 1280, height: 720 }`.
  3. In the `happy-path` test at Step 1:
     - Before clicking `IELTS`, assert `await expect(continueBtn).toBeDisabled()` and call `await assertButtonContrastAcrossThemesAndViewports(page, continueBtn)`.
     - After clicking `IELTS`, assert `await expect(continueBtn).toBeEnabled()` and call `await assertButtonContrastAcrossThemesAndViewports(page, continueBtn)`.
  4. On the confirmation screen (`Xác nhận thông tin của bạn`), before clicking `Hoàn thành`, call `await assertButtonContrastAcrossThemesAndViewports(page, page.getByRole("button", { name: "Hoàn thành" }))`.
  5. Run `pnpm exec biome check --write apps/student/src/components/onboarding/onboarding-wizard.tsx apps/student/test/onboarding.test.tsx apps/e2e/specs/student-portal-onboarding.spec.ts`, then run `pnpm exec biome check .`, `pnpm --filter student check-types`, `pnpm --filter e2e check-types`, `pnpm --filter student test`, and the E2E spec `student-portal-onboarding.spec.ts`.
- **Success criteria**: Biome check, student + e2e typechecks, student unit tests, and Playwright E2E `student-portal-onboarding.spec.ts` all pass with 0 errors and measured contrast ≥ 4.5:1 across all 3 viewports and both themes.
- **Verify**: `pnpm exec biome check . && pnpm --filter student check-types && pnpm --filter e2e check-types && pnpm --filter student test` exits 0, and `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e -- specs/student-portal-onboarding.spec.ts` exits 0 with 2 passed tests.

## Implementation Steps

1. Complete Task 1.1 (TDD Red unit test in `apps/student/test/onboarding.test.tsx`).
2. Complete Task 1.2 (TDD Green fix in `apps/student/src/components/onboarding/onboarding-wizard.tsx`).
3. Complete Task 1.3 (Playwright E2E WCAG contrast assertion in `apps/e2e/specs/student-portal-onboarding.spec.ts` + full verification gates).

## Todo

- [ ] Task 1.1: Add TDD Red test for `OnboardingWizard` CTA button states and contrast tokens
- [ ] Task 1.2: Fix CTA button classes in `OnboardingWizard` (TDD Green)
- [ ] Task 1.3: Add computed WCAG contrast verification in Playwright E2E spec and verify gates

## Verification

- `pnpm --filter student exec vitest run test/onboarding.test.tsx` exits 0.
- `pnpm --filter student check-types` exits 0.
- `pnpm --filter e2e check-types` exits 0.
- `pnpm exec biome check .` exits 0.
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e -- specs/student-portal-onboarding.spec.ts` exits 0.

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

## Success Criteria

All 3 tasks pass their mechanical Verify conditions with 0 lint, type, unit, or E2E failures.
