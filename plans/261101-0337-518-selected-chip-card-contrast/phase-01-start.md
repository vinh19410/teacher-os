---
phase: 1
title: "Phase 1: TDD Selection Contrast Fix & E2E Verification"
status: completed
priority: P2
effort: "1.5h"
dependencies: []
---

# Phase 1: TDD Selection Contrast Fix & E2E Verification

<!-- Updated: Red Team & Validation Session 1 - Added focus-visible ring protection, dark:hover:bg-input/50 on ChipMulti, root-down alpha compositing + 3:1 state contrast in E2E across Steps 1-4 and modals, jsdom + regex selectors in Task 1.1, and DESIGN.md:129 sync -->

## Goal

Replace the indistinguishable `border-transparent` + `bg-muted`/`bg-secondary`/`bg-accent` selection styles in `onboarding-steps.tsx`, `chip-multi.tsx`, and `enroll-student-modal.tsx` with high-contrast design v2 selection treatments (`border-primary bg-primary text-primary-foreground` for standalone chips and `border-primary bg-muted ring-1 ring-primary` + check indicator for option cards/rows), verified via test-first unit tests and Playwright E2E contrast checks across 3 viewports and light/dark themes.

## Overview

1. **`apps/student/src/components/onboarding/onboarding-steps.tsx`**:
   - `OptionButton` (lines 46–86): add `aria-pressed={selected}`, remove the stale v1 orange comment (lines 59–61) and duplicate `rounded-md border`, use base `"flex w-full items-center justify-between rounded-lg border p-4 text-left transition-[color,background-color,border-color,box-shadow] focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0 focus-visible:outline-none"`, `"border-primary bg-muted font-medium text-foreground ring-1 ring-primary"` when `selected` is `true`, and `"border-input bg-transparent text-foreground hover:bg-accent"` when `selected` is `false`. On the right-hand check badge (lines 74–83), add `aria-hidden="true"` and use `"border-input bg-transparent"` when unselected.
   - `TargetScoreStep` (lines 148–169): add `aria-pressed={selected}`, remove duplicate `rounded-md border`, use base `"rounded-lg border p-3.5 text-center transition-[color,background-color,border-color,box-shadow] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"`, `"border-primary bg-primary font-semibold text-primary-foreground"` when `selected` is `true`, and `"border-input bg-transparent text-foreground hover:bg-accent"` when `selected` is `false`.
   - `LearningGoalsStep` (lines 196–223): add `aria-pressed={selected}`, remove duplicate `rounded-md border`, use base `"flex items-center justify-between rounded-lg border p-3 text-left transition-[color,background-color,border-color,box-shadow] focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0 focus-visible:outline-none"`, `"border-primary bg-muted font-medium text-foreground ring-1 ring-primary"` when `selected` is `true`, and `"border-input bg-transparent text-foreground hover:bg-accent"` when `selected` is `false`. On the right-hand check box (lines 211–220), add `aria-hidden="true"` and use `"border-input bg-transparent"` when unselected.
2. **`apps/web/src/components/ui/chip-multi.tsx`**:
   - Move `bg-background` and `dark:bg-input/30` out of the unconditional base class into the unselected branch so `dark:bg-input/30` does not override `bg-primary` in dark mode, and add `dark:hover:bg-input/50` to the unselected branch so `:hover` remains visible in dark mode.
   - Base class: `"inline-flex items-center rounded-md border px-3 py-1.5 font-medium text-xs outline-none transition-[color,background-color,border-color,box-shadow]"` + `"focus-visible:ring-[3px] focus-visible:ring-ring/50"` + `"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"`.
   - Selected branch (`value.includes(option.value)`): `"border-primary bg-primary text-primary-foreground"`.
   - Unselected branch: `"border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50"`.
3. **`apps/web/src/components/modals/enroll-student-modal.tsx`**:
   - Import `Check` from `"lucide-react"` and `cn` from `"@/lib/cn"`.
   - On each `role="option"` button (lines 221–240), add `disabled={saving}`, apply base classes `"flex items-center justify-between rounded-md border px-3 py-2 text-left text-foreground text-sm outline-none transition-[color,background-color,border-color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"`, selected classes `"border-primary bg-muted font-medium ring-1 ring-primary"`, and unselected classes `"border-transparent hover:bg-accent hover:text-accent-foreground"`.
   - Inside the right-hand phone `<span className="flex shrink-0 items-center gap-2 text-muted-foreground text-xs">`, render `<Check aria-hidden="true" className="size-4 shrink-0 text-primary" />` when `selectedStudentId === s.id`.
4. **`DESIGN.md`**:
   - Update lines 69–71, 83–86, and 129 to document that standalone selection chips (`ChipMulti`, band chips) use `border-primary bg-primary text-primary-foreground` while selectable cards/listbox options pair `bg-muted` with `border-primary ring-1 ring-primary` + a check indicator (never `border-transparent` with `bg-muted`/`bg-secondary`/`bg-accent` alone), distinguishing `ChipMulti` from `ChipFilter` (which carries an internal `text-muted-foreground` count badge).

## Files to Create / Modify

- Modify: `apps/student/test/onboarding.test.tsx`
- Modify: `apps/student/src/components/onboarding/onboarding-steps.tsx`
- Modify: `apps/web/src/components/ui/chip-multi.test.tsx`
- Modify: `apps/web/src/components/ui/chip-multi.tsx`
- Modify: `apps/web/src/components/modals/enroll-student-modal.test.tsx`
- Modify: `apps/web/src/components/modals/enroll-student-modal.tsx`
- Modify: `apps/e2e/specs/student-portal-onboarding.spec.ts`
- Modify: `apps/e2e/specs/enroll-existing-student.spec.ts`
- Modify: `DESIGN.md`

## Requirements

- [x] Add failing unit tests (TDD Red) in `apps/student/test/onboarding.test.tsx`, `apps/web/src/components/ui/chip-multi.test.tsx`, and `apps/web/src/components/modals/enroll-student-modal.test.tsx` asserting the new selected/unselected contracts and `aria-pressed` / `aria-selected` states.
- [x] Implement the selected-state fixes (TDD Green) in `apps/student/src/components/onboarding/onboarding-steps.tsx`, `apps/web/src/components/ui/chip-multi.tsx`, and `apps/web/src/components/modals/enroll-student-modal.tsx`.
- [x] Add Playwright E2E computed contrast and state distinction assertions in `apps/e2e/specs/student-portal-onboarding.spec.ts` and `apps/e2e/specs/enroll-existing-student.spec.ts` across 3 viewports (`1440×900`, `768×1024`, `375×812`) and both themes (`light`, `dark`), and update `DESIGN.md`.

## Tasks & Steps

### Task 1.1 — Add TDD Red unit tests for Onboarding Steps, `ChipMulti`, and `EnrollStudentModal`
- **Goal**: Write unit tests in `apps/student/test/onboarding.test.tsx`, `apps/web/src/components/ui/chip-multi.test.tsx`, and `apps/web/src/components/modals/enroll-student-modal.test.tsx` that assert the new selected/unselected visual classes and fail against the current code.
- **Target files and symbols**:
  - `apps/student/test/onboarding.test.tsx` (`ExamInterestStep`, `TargetScoreStep`, `LearningGoalsStep`, `StudyHoursStep`)
  - `apps/web/src/components/ui/chip-multi.test.tsx` (`ChipMulti`)
  - `apps/web/src/components/modals/enroll-student-modal.test.tsx` (`EnrollStudentModal`)
- **Steps**:
  1. In `apps/student/test/onboarding.test.tsx`, add a test `"Onboarding steps: selected cards and band chips expose aria-pressed and high-contrast selection classes without border-transparent"` that uses `render` from `@testing-library/react` on `ExamInterestStep` (`value="ielts"`), `TargetScoreStep` (`examInterest="ielts"`, `value="6.5"`), `LearningGoalsStep` (`value={["study-abroad"]}`, `note=""`), and `StudyHoursStep` (`value="1-2"`) and asserts:
     - On `ExamInterestStep`: `screen.getByRole("button", { name: /IELTS/ })` has `aria-pressed="true"`, `border-primary`, `bg-muted`, `text-foreground`, `ring-1`, `ring-primary`, `focus-visible:ring-0`, and does NOT have `border-transparent` or `text-primary`; `screen.getByRole("button", { name: /TOEIC/ })` has `aria-pressed="false"`, `border-input`, `bg-transparent`, `hover:bg-accent`, and its right-hand check indicator `<div>` has `aria-hidden="true"`, `border-input`, and does NOT have `border-border`.
     - On `TargetScoreStep`: `screen.getByRole("button", { name: "Band 6.5" })` has `aria-pressed="true"`, `border-primary`, `bg-primary`, `text-primary-foreground`, and does NOT have `border-transparent` or `bg-muted`; `screen.getByRole("button", { name: "Band 6.0" })` has `aria-pressed="false"`, `border-input`, `bg-transparent`, and `hover:bg-accent`.
     - On `LearningGoalsStep`: `screen.getByRole("button", { name: "Du học" })` has `aria-pressed="true"`, `border-primary`, `bg-muted`, `text-foreground`, `ring-1`, `ring-primary`, `focus-visible:ring-0`, and does NOT have `border-transparent` or `text-primary`; `screen.getByRole("button", { name: "Thăng tiến công việc" })` has `aria-pressed="false"`, `border-input`, `bg-transparent`, `hover:bg-accent`, and its right-hand check box `<div>` has `aria-hidden="true"`, `border-input`, and does NOT have `border-border`.
     - On `StudyHoursStep`: `screen.getByRole("button", { name: "1–2 giờ" })` has `aria-pressed="true"`, `border-primary`, `bg-muted`, `ring-1`, `ring-primary`, and does NOT have `border-transparent`; `screen.getByRole("button", { name: "Dưới 1 giờ" })` has `aria-pressed="false"`, `border-input`, and `bg-transparent`.
  2. In `apps/web/src/components/ui/chip-multi.test.tsx`, add `// @vitest-environment jsdom` at line 1, import `{ cleanup, render, screen }` from `"@testing-library/react"` and `afterEach` from `"vitest"`, register `afterEach(() => cleanup())`, and add a test `"applies solid primary fill on selected chips and input border on unselected chips without border-transparent"` that renders `<ChipMulti options={options} value={["Writing"]} onChange={() => undefined} />` and asserts:
     - `const writing = screen.getByRole("button", { name: "Writing" })` has `aria-pressed="true"`, `border-primary`, `bg-primary`, `text-primary-foreground`, and does NOT have `border-transparent`, `bg-secondary`, `bg-background`, or `dark:bg-input/30`.
     - `const speaking = screen.getByRole("button", { name: "Speaking" })` has `aria-pressed="false"`, `border-input`, `bg-background`, `text-foreground`, `hover:bg-accent`, `dark:bg-input/30`, `dark:hover:bg-input/50`, and does NOT have `border-transparent` or `bg-primary`.
  3. In `apps/web/src/components/modals/enroll-student-modal.test.tsx`, add a test `"highlights the selected student option with border-primary, ring-primary, and a check icon while keeping unselected options border-transparent without dead bg-line-soft"` that seeds two students with distinct IDs (`studentRow({ id: "st-1", name: "Học viên Một" })` and `studentRow({ id: "st-2", name: "Học viên Hai" })`), renders `<EnrollStudentModal open onClose={vi.fn()} classId="cl-1" />`, clicks `within(dialog).getByRole("option", { name: /Học viên Hai/ })`, and asserts:
     - `optHai` (`within(dialog).getByRole("option", { name: /Học viên Hai/ })`) has `aria-selected="true"`, `border-primary`, `bg-muted`, `ring-1`, `ring-primary`, `focus-visible:ring-[3px]`, `focus-visible:ring-ring/50`, does NOT have `border-transparent`, and contains `<svg aria-hidden="true">` (`expect(optHai.querySelector('svg[aria-hidden="true"]')).not.toBeNull()`).
     - `optMot` (`within(dialog).getByRole("option", { name: /Học viên Một/ })`) has `aria-selected="false"`, `border-transparent`, `hover:bg-accent`, does NOT have `hover:bg-line-soft` or `border-primary`, and contains no `<svg>` (`expect(optMot.querySelector("svg")).toBeNull()`).
- **Success criteria**: All three unit test commands fail on the newly added assertions (TDD Red).
- **Verify**:
  - `pnpm --filter student exec vitest run test/onboarding.test.tsx` exits non-zero with assertion failure (TDD Red).
  - `pnpm --filter web exec vitest run src/components/ui/chip-multi.test.tsx src/components/modals/enroll-student-modal.test.tsx` exits non-zero with assertion failures (TDD Red).

### Task 1.2 — Implement high-contrast selected states in `onboarding-steps.tsx`, `chip-multi.tsx`, and `enroll-student-modal.tsx` (TDD Green)
- **Goal**: Update the three components so every unit test in Task 1.1 passes and zero instances of `border-transparent` (on onboarding/ChipMulti) or `bg-line-soft` (on EnrollStudentModal) remain.
- **Target files and symbols**:
  - `apps/student/src/components/onboarding/onboarding-steps.tsx` (`OptionButton`, `TargetScoreStep`, `LearningGoalsStep`)
  - `apps/web/src/components/ui/chip-multi.tsx` (`ChipMulti`)
  - `apps/web/src/components/modals/enroll-student-modal.tsx` (`EnrollStudentModal`)
- **Steps**:
  1. In `apps/student/src/components/onboarding/onboarding-steps.tsx`:
     - In `OptionButton` (lines 54–84): add `aria-pressed={selected}` to `<button>`, delete the stale comment at lines 59–61, set base class to `"flex w-full items-center justify-between rounded-lg border p-4 text-left transition-[color,background-color,border-color,box-shadow] focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0 focus-visible:outline-none"`, change the `selected` ternary to `selected ? "border-primary bg-muted font-medium text-foreground ring-1 ring-primary" : "border-input bg-transparent text-foreground hover:bg-accent"`, add `aria-hidden="true"` to the check badge `<div>`, and change its unselected class from `"border-border bg-transparent"` to `"border-input bg-transparent"`.
     - In `TargetScoreStep` (lines 152–166): add `aria-pressed={selected}` to `<button>`, set base class to `"rounded-lg border p-3.5 text-center transition-[color,background-color,border-color,box-shadow] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"`, and change the `selected` ternary to `selected ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-input bg-transparent text-foreground hover:bg-accent"`.
     - In `LearningGoalsStep` (lines 199–221): add `aria-pressed={selected}` to `<button>`, set base class to `"flex items-center justify-between rounded-lg border p-3 text-left transition-[color,background-color,border-color,box-shadow] focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0 focus-visible:outline-none"`, change the `selected` ternary to `selected ? "border-primary bg-muted font-medium text-foreground ring-1 ring-primary" : "border-input bg-transparent text-foreground hover:bg-accent"`, add `aria-hidden="true"` to the check box `<div>`, and change its unselected class from `"border-border bg-transparent"` to `"border-input bg-transparent"`.
  2. In `apps/web/src/components/ui/chip-multi.tsx`:
     - Compute `const selected = value.includes(option.value);` inside `options.map`.
     - Change `className` on `<button>` to:
       ```tsx
       className={cn(
         "inline-flex items-center rounded-md border px-3 py-1.5 font-medium text-xs outline-none transition-[color,background-color,border-color,box-shadow]",
         "focus-visible:ring-[3px] focus-visible:ring-ring/50",
         "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60",
         selected
           ? "border-primary bg-primary text-primary-foreground"
           : "border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50",
       )}
       ```
  3. In `apps/web/src/components/modals/enroll-student-modal.tsx`:
     - Add imports `import { Check } from "lucide-react";` and `import { cn } from "@/lib/cn";`.
     - In `filteredStudents.map((s) => ...)` (lines 221–240), compute `const isSelected = selectedStudentId === s.id;` and update the `<button role="option">` to:
       ```tsx
       <button
         key={s.id}
         type="button"
         role="option"
         aria-selected={isSelected}
         disabled={saving}
         className={cn(
           "flex items-center justify-between rounded-md border px-3 py-2 text-left text-foreground text-sm outline-none transition-[color,background-color,border-color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60",
           isSelected
             ? "border-primary bg-muted font-medium ring-1 ring-primary"
             : "border-transparent hover:bg-accent hover:text-accent-foreground",
         )}
         onClick={() => setSelectedStudentId(s.id)}
       >
         <span>{s.name}</span>
         <span className="flex shrink-0 items-center gap-2 text-muted-foreground text-xs">
           <span>{s.phone}</span>
           {isSelected ? (
             <Check
               aria-hidden="true"
               className="size-4 shrink-0 text-primary"
             />
           ) : null}
         </span>
       </button>
       ```
- **Success criteria**: The unit tests in `apps/student/test/onboarding.test.tsx`, `apps/web/src/components/ui/chip-multi.test.tsx`, `apps/web/src/components/modals/enroll-student-modal.test.tsx`, `apps/web/src/components/modals/add-class-modal.test.tsx`, `apps/web/src/components/modals/add-class-modal.form.test.tsx`, and `apps/web/src/routes/_auth/classes/$classId.test.tsx` all pass.
- **Verify**: `pnpm --filter student exec vitest run test/onboarding.test.tsx && pnpm --filter web exec vitest run src/components/ui/chip-multi.test.tsx src/components/modals/enroll-student-modal.test.tsx src/components/modals/add-class-modal.test.tsx src/components/modals/add-class-modal.form.test.tsx src/routes/_auth/classes/\$classId.test.tsx` exits 0.

### Task 1.3 — Add Playwright E2E contrast/selection assertions, update `DESIGN.md`, and run full verification gates
- **Goal**: Prove in real Chromium across 3 viewports (`1440×900`, `768×1024`, `375×812`) and both themes (`light`, `dark`) that selected items in Onboarding, Tạo lớp (`ChipMulti`), and Thêm học viên vào lớp (`EnrollStudentModal`) satisfy WCAG AA text contrast (≥ 4.5:1) and non-text state distinction (≥ 3:1 border or fill contrast), and sync `DESIGN.md`.
- **Target files and symbols**:
  - `apps/e2e/specs/student-portal-onboarding.spec.ts`
  - `apps/e2e/specs/enroll-existing-student.spec.ts`
  - `DESIGN.md`
- **Steps**:
  1. In `apps/e2e/specs/student-portal-onboarding.spec.ts`:
     - Upgrade the contrast helper to resolve `backdrop` by collecting ancestors from `el.parentElement` up to `document.documentElement` and alpha-compositing from top-most ancestor down to `el`, and wrap the viewport × theme loop in `try { ... } finally { await page.evaluate(() => document.documentElement.classList.remove("dark")); await page.setViewportSize({ width: 1280, height: 720 }); }`.
     - Add a helper `assertOptionCardOrChipDistinctionAcrossThemesAndViewports` that across all 3 viewports and `["light", "dark"]` verifies:
       - On Step 1 after clicking `IELTS`: `IELTS` has `aria-pressed="true"`, `TOEIC` has `aria-pressed="false"`, `IELTS` text contrast (and description contrast) is `>= 4.5`, `IELTS` `borderTopColor` contrast against its ancestor card backdrop is `>= 3.0`, and the check badge fill contrast against `bg-muted` is `>= 3.0`.
       - On Step 2 after clicking `Band 6.5`: `Band 6.5` has `aria-pressed="true"`, `Band 6.0` has `aria-pressed="false"`, `Band 6.5` text contrast is `>= 4.5`, and `Band 6.5` composited background luminance contrast against unselected `Band 6.0`'s composited background is `>= 3.0`.
       - On Step 3 after clicking `Du học` and `Giao tiếp tự tin`: both have `aria-pressed="true"` and unselected `Thăng tiến công việc` has `aria-pressed="false"`.
       - On Step 4 after clicking `1–2 giờ`: `1–2 giờ` has `aria-pressed="true"` and unselected `Dưới 1 giờ` has `aria-pressed="false"`.
  2. In `apps/e2e/specs/enroll-existing-student.spec.ts`:
     - Add a helper that iterates `[{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 375, height: 812 }]` and `["light", "dark"]` (restoring light mode and `{ width: 1280, height: 720 }` in `finally`), alpha-compositing each element's `backgroundColor` and `borderTopColor` over its root-down ancestor backdrop chain (so `dark:bg-input/30` with `alpha = 0.3` is properly blended over `--card`).
     - In `"class detail → picker enroll học viên có sẵn → roster + KPI tăng"`:
       - Inside `+ Tạo lớp` modal after clicking `"Writing"`, `"T2"`, and `"T4"`: assert `"Writing"` and `"T2"` (`aria-pressed="true"`) achieve `>= 4.5` text contrast and `>= 3.0` composited background luminance contrast against unselected `"Speaking"` and `"T3"` (`aria-pressed="false"`) across all 3 viewports and both themes.
       - Inside `+ Thêm học viên vào lớp` modal: before clicking `option` (`STUDENT_NAME`), assert `await expect(option).toHaveAttribute("aria-selected", "false")` and `await expect(option.locator("svg")).toHaveCount(0)`; after clicking `option`, assert `await expect(option).toHaveAttribute("aria-selected", "true")`, `await expect(option.locator("svg")).toBeVisible()`, and across all 3 viewports and both themes assert `>= 4.5` text contrast and `>= 3.0` `borderTopColor` luminance contrast against the modal backdrop.
  3. In `DESIGN.md`:
     - Update lines 69–71, 83–86, and 129 to record that standalone selectable chips (`ChipMulti`, band chips) use `border-primary bg-primary text-primary-foreground` when selected, `ChipFilter` (with internal `text-muted-foreground` count badges) keeps its filter chip styling, and selectable cards/listbox rows (`OptionButton`, `LearningGoalsStep`, `EnrollStudentModal`) use `border-primary bg-muted ring-1 ring-primary` plus a check icon (never `border-transparent` + `bg-muted`/`bg-secondary`/`bg-accent` alone).
  4. Run `pnpm exec biome check --write .`, then run `pnpm exec biome check .`, `pnpm check-types`, unit tests, and Playwright E2E specs `student-portal-onboarding.spec.ts` and `enroll-existing-student.spec.ts`.
- **Success criteria**: Biome check, workspace typechecks, unit tests, and Playwright E2E specs (`student-portal-onboarding.spec.ts` and `enroll-existing-student.spec.ts`) exit 0 with all assertions green.
- **Verify**: `pnpm exec biome check . && pnpm check-types && pnpm --filter student test && pnpm --filter web exec vitest run src/components/ui/chip-multi.test.tsx src/components/modals/enroll-student-modal.test.tsx src/components/modals/add-class-modal.test.tsx src/components/modals/add-class-modal.form.test.tsx` exits 0, and `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e -- specs/student-portal-onboarding.spec.ts specs/enroll-existing-student.spec.ts` exits 0.

## Implementation Steps

1. Complete Task 1.1 (TDD Red unit tests in `onboarding.test.tsx`, `chip-multi.test.tsx`, and `enroll-student-modal.test.tsx`).
2. Complete Task 1.2 (TDD Green implementation in `onboarding-steps.tsx`, `chip-multi.tsx`, and `enroll-student-modal.tsx`).
3. Complete Task 1.3 (Playwright E2E contrast/selection verification in `student-portal-onboarding.spec.ts` and `enroll-existing-student.spec.ts`, `DESIGN.md` update, and full verification gates).

## Todo

- [x] Task 1.1: Add TDD Red unit tests for Onboarding Steps, `ChipMulti`, and `EnrollStudentModal`
- [x] Task 1.2: Implement high-contrast selected states in `onboarding-steps.tsx`, `chip-multi.tsx`, and `enroll-student-modal.tsx` (TDD Green)
- [x] Task 1.3: Add Playwright E2E contrast/selection assertions, update `DESIGN.md`, and run full verification gates

## Verification

- `pnpm --filter student exec vitest run test/onboarding.test.tsx` exits 0.
- `pnpm --filter web exec vitest run src/components/ui/chip-multi.test.tsx src/components/modals/enroll-student-modal.test.tsx src/components/modals/add-class-modal.test.tsx src/components/modals/add-class-modal.form.test.tsx` exits 0.
- `pnpm check-types` exits 0.
- `pnpm exec biome check .` exits 0.
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e -- specs/student-portal-onboarding.spec.ts specs/enroll-existing-student.spec.ts` exits 0.

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
