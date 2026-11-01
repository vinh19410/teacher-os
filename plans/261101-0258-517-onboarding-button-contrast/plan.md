---
title: "Fix Student Onboarding Wizard CTA Button Contrast (#517)"
description: "Replace removed v1 text-bg utility with text-primary-foreground on enabled 'Tiếp tục' and 'Hoàn thành' buttons, remove double-fading opacity-50 on disabled 'Tiếp tục' button, and verify WCAG AA contrast in unit and Playwright E2E tests."
status: pending
priority: P2
effort: "1h"
tags: [student, onboarding, ui, accessibility, contrast]
created: 2026-11-01
---

# 517-onboarding-button-contrast

## Overview

In the Student Portal onboarding wizard (`apps/student/src/components/onboarding/onboarding-wizard.tsx`), the primary action buttons (**"Tiếp tục"** when enabled at steps 1–4 and **"Hoàn thành"** at the final confirmation step) use `bg-primary text-bg hover:bg-primary hover:text-primary-foreground`. Because `--color-bg` (`text-bg`) was removed in the design v2 migration (`c308b43`, #378), Tailwind v4 emits no `color` rule for `text-bg`. The buttons inherit `color: var(--foreground)` (`oklch(0.145 0 0)` in light mode, `oklch(0.985 0 0)` in dark mode) on `background-color: var(--primary)` (`oklch(0.205 0 0)` in light mode, `oklch(0.922 0 0)` in dark mode), producing ~1.14:1 contrast (near-black text on near-black background in light mode). Additionally, the disabled state of **"Tiếp tục"** stacks `opacity-50` on top of `bg-muted text-muted-foreground`, washing out the already-muted `4.94:1` light-mode (`5.86:1` dark-mode) token pair to ~1.95:1 contrast.

This plan is authored under the `--advice` handover contract and `--tdd` test-first workflow. Each phase carries explicit task-level mechanical verification and a literal Failure Protocol block.

## Advisor Scope Lock

- **Locked Scope:**
  - `apps/student/src/components/onboarding/onboarding-wizard.tsx` (lines 230–231 for "Tiếp tục" enabled/disabled states; line 242 for "Hoàn thành" confirmation button).
  - `apps/student/test/onboarding.test.tsx` (interactive step progression + CTA token/disabled state assertions across Steps 1–4 and confirmation Step 5).
  - `apps/e2e/specs/student-portal-onboarding.spec.ts` (real-browser computed WCAG contrast assertions on disabled "Tiếp tục", enabled "Tiếp tục", and enabled "Hoàn thành" across light/dark themes and 3 viewports).
- **Explicit Non-Goals:**
  - Do NOT modify `apps/student/src/components/onboarding/onboarding-steps.tsx` (chip/card selected state contrast is tracked separately in Issue #518).
  - Do NOT modify unrelated components outside onboarding (`class-card.tsx`, `quiz-runtime-header.tsx`, `vocab-suggestion-list.tsx`) or global CSS tokens (`packages/ui/src/styles/globals.css`).
  - Keep `disabled:cursor-not-allowed disabled:opacity-50` on the "Hoàn thành" button (`onboarding-wizard.tsx:242`) unchanged, matching canonical `packages/ui/src/components/button.tsx:6` for transient in-flight mutation state.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Replace `text-bg hover:bg-primary hover:text-primary-foreground` with `text-primary-foreground hover:bg-primary/90` on enabled "Tiếp tục" and "Hoàn thành" buttons in `OnboardingWizard` | P2 |
| 2 | Remove redundant `opacity-50` from the disabled "Tiếp tục" branch (`bg-muted text-muted-foreground`) so disabled text preserves calibrated muted contrast | P2 |
| 3 | Prove consumer-visible behavior and WCAG AA (≥ 4.5:1) contrast via TDD unit test (`apps/student/test/onboarding.test.tsx`) and Playwright E2E spec (`apps/e2e/specs/student-portal-onboarding.spec.ts`) across light/dark themes and 3 viewports (`1440×900`, `768×1024`, `375×812`) | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: TDD Fix & Contrast Verification](./phase-01-start.md) | Pending |

## Success Criteria

- [ ] Enabled **"Tiếp tục"** and **"Hoàn thành"** buttons in `apps/student/src/components/onboarding/onboarding-wizard.tsx` use `bg-primary text-primary-foreground hover:bg-primary/90` (no `text-bg`), achieving ≥ 4.5:1 WCAG AA contrast in both light and dark themes.
- [ ] Disabled **"Tiếp tục"** button uses `cursor-not-allowed rounded-md bg-muted text-muted-foreground` without `opacity-50`, preserving the calibrated ≥ 4.5:1 contrast of `--muted-foreground` on `--muted` in both light and dark themes.
- [ ] `pnpm --filter student exec vitest run test/onboarding.test.tsx`, `pnpm --filter student check-types`, `pnpm --filter e2e check-types`, `pnpm exec biome check .`, and Playwright E2E `student-portal-onboarding.spec.ts` pass with 0 errors.

## Red Team Review

### Session — 2026-11-01
**Findings:** 6 (5 accepted, 1 rejected)
**Severity breakdown:** 2 Critical, 2 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | CSS `transition-colors` race condition on `getComputedStyle(el)` causes mid-transition contrast crossover in E2E | Critical | Accept | Phase 1 (Task 1.3) |
| 2 | `measureButtonContrast` 1×1 canvas helper must clear canvas, walk up to opaque ancestor backdrop, and composite both `fg` and `bg` on `opacity < 1` | Critical | Accept | Phase 1 (Task 1.3) |
| 3 | Task 1.3 steps must explicitly include light/dark theme toggle and 3-viewport (`1440×900`, `768×1024`, `375×812`) checks | High | Accept | Phase 1 (Task 1.3) |
| 4 | Include `pnpm --filter e2e check-types` and `pnpm --filter student exec vitest run test/onboarding.test.tsx` in verification gates | High | Accept | Phase 1 (Tasks 1.1–1.3) |
| 5 | Task 1.1 unit test should assert `hover:bg-primary/90` and disabled-to-enabled transitions across Steps 1–4 | Medium | Accept | Phase 1 (Task 1.1) |
| 6 | Replace `disabled:opacity-50` on "Hoàn thành" during `submitMutation.isPending` | Medium | Reject (keep canonical `button.tsx` transient pending pattern per Kongming counsel) | Plan Non-Goals |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`
- Decision deltas checked: 6
- Reconciled stale references: 5
- Unresolved contradictions: 0

## Validation Log

### Verification Results
- **Tier:** Light (1 phase)
- **Claims checked:** 7
- **Verified:** 7 | **Failed:** 0 | **Unverified:** 0
- **Key decisions confirmed:**
  1. Scope locked to `apps/student/src/components/onboarding/onboarding-wizard.tsx`, `apps/student/test/onboarding.test.tsx`, and `apps/e2e/specs/student-portal-onboarding.spec.ts` (`onboarding-steps.tsx` stays untouched for #518).
  2. `measureButtonContrast` uses `expect.poll` and full ancestor backdrop + group-opacity compositing across light/dark themes and 3 viewports (`1440×900`, `768×1024`, `375×812`).
  3. All verification commands (`vitest run test/onboarding.test.tsx`, `student check-types`, `e2e check-types`, `biome check`, Playwright E2E) are mechanical and unambiguous.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`
- Decision deltas checked: 6
- Reconciled stale references: 0
- Unresolved contradictions: 0

<!-- slug: 517-onboarding-button-contrast -->
