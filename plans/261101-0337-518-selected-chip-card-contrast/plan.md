---
title: "Fix Selected State Contrast on Onboarding Cards/Chips, ChipMulti, and Enroll Student Rows (#518)"
description: "Restore unmistakable selected-state contrast in light and dark themes across student onboarding steps, teacher ChipMulti (Tạo lớp), and EnrollStudentModal student picker rows, backed by TDD unit tests and Playwright E2E contrast verification."
status: pending
priority: P2
effort: "1.5h"
tags: [student, web, onboarding, classes, ui, accessibility, contrast]
created: 2026-11-01
---

# 518-selected-chip-card-contrast

## Overview

In the design v2 migration (`c308b43`, #378), a mechanical sweep converted v1 orange-accent selection classes (`border-transparent bg-surface text-hot`) to monochrome neutral tokens (`border-transparent bg-muted text-primary` or `border-transparent bg-secondary text-secondary-foreground`). Because `--muted`, `--secondary`, and `--accent` in light mode are `oklch(0.97 0 0)` (only ~1.06:1 against white `--background: oklch(1 0 0)`) and `--primary` is near-black ink (`oklch(0.205 0 0)`), dropping the border (`border-transparent`) left selected chips and cards visually indistinguishable from — or fainter than — unselected items across three user-facing surfaces:

1. **Student Portal Onboarding (`apps/student/src/components/onboarding/onboarding-steps.tsx`)**:
   - `OptionButton` (Steps 1 & 4) and `LearningGoalsStep` (Step 3) replace `border-input` (`oklch(0.556 0 0)`) with `border-transparent bg-muted font-medium text-primary` when selected, losing their card boundary.
   - `TargetScoreStep` (Step 2, e.g. "Band 6.5") replaces `border-input` with `border-transparent bg-muted font-semibold text-primary` and has no check badge at all, making the selected band chip look fainter than unselected chips.
   - None of the selectable buttons in `onboarding-steps.tsx` expose `aria-pressed={selected}`.
2. **Teacher "Tạo lớp mới" (`apps/web/src/components/modals/add-class-modal.tsx` via `apps/web/src/components/ui/chip-multi.tsx`)**:
   - `ChipMulti` switches from `border bg-background` (`oklch(1 0 0)`) to `border-transparent bg-secondary text-secondary-foreground` (`oklch(0.97 0 0)`), losing its border and changing fill by only 1.06:1. In dark mode, unconditional `dark:bg-input/30` on the base class also competes with the selected fill and overrides `:hover` unless `dark:hover:bg-input/50` is specified on the unselected branch.
3. **Teacher "Thêm học viên vào lớp" (`apps/web/src/components/modals/enroll-student-modal.tsx`)**:
   - Each `role="option"` student row uses `bg-accent font-medium` when selected (`oklch(0.97 0 0)` with no border, ring, or check indicator) and dead v1 `hover:bg-line-soft` when unselected.

This plan is authored under the `--advice` handover contract and `--tdd` test-first workflow. Each phase carries explicit task-level mechanical verification and a literal Failure Protocol block.

## Advisor Scope Lock

- **Locked Scope:**
  - `apps/student/src/components/onboarding/onboarding-steps.tsx` (`OptionButton`, `TargetScoreStep`, `LearningGoalsStep`).
  - `apps/student/test/onboarding.test.tsx` (TDD unit tests for selected/unselected classes, check indicator `aria-hidden`/`border-input`, and `aria-pressed`).
  - `apps/web/src/components/ui/chip-multi.tsx` (`ChipMulti` selected and unselected contrast).
  - `apps/web/src/components/ui/chip-multi.test.tsx` (TDD unit tests for per-button selected/unselected classes).
  - `apps/web/src/components/modals/enroll-student-modal.tsx` (`role="option"` student picker rows).
  - `apps/web/src/components/modals/enroll-student-modal.test.tsx` (TDD unit tests for selected/unselected student option styling and check indicator).
  - `apps/e2e/specs/student-portal-onboarding.spec.ts` and `apps/e2e/specs/enroll-existing-student.spec.ts` (real-browser computed WCAG contrast and selection state assertions across 3 viewports and light/dark themes).
  - `DESIGN.md` (document the design v2 selection rule for standalone chips vs selectable cards/rows in lines 69–71, 83–86, and 129).
- **Explicit Non-Goals:**
  - Do NOT modify `packages/ui/src/styles/globals.css` or introduce hex colors or new CSS variables.
  - Do NOT modify `packages/ui/src/components/web-kit/chip-filter.tsx` (which renders an internal `text-muted-foreground` count badge that would lose contrast on a solid `bg-primary` chip), `apps/web/src/components/attendance/attendance-status-picker.tsx`, `packages/ui/src/components/quiz/quiz-question-item.tsx`, or `apps/web/src/components/tuition/revenue-chart.tsx`.
  - Do NOT alter `ChipMulti`'s outer `<div>` role/props signature (avoiding `getByRole("group")` collisions with `ChipFilter` on shared pages).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Update `OptionButton` and `LearningGoalsStep` in `onboarding-steps.tsx` to use `border-primary bg-muted font-medium text-foreground ring-1 ring-primary` when selected (with `focus-visible:ring-0` and `aria-hidden="true"` + `border-input` on the check indicator), `TargetScoreStep` to use `border-primary bg-primary font-semibold text-primary-foreground` when selected, and add `aria-pressed={selected}` to all three | P2 |
| 2 | Update `ChipMulti` (`apps/web/src/components/ui/chip-multi.tsx`) so selected chips use `border-primary bg-primary text-primary-foreground` and unselected chips use `border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50` | P2 |
| 3 | Update `EnrollStudentModal` (`apps/web/src/components/modals/enroll-student-modal.tsx`) so selected `role="option"` rows use `border-primary bg-muted font-medium ring-1 ring-primary` with a trailing `<Check aria-hidden="true" />` icon, keyboard `focus-visible:ring-[3px] focus-visible:ring-ring/50`, and `disabled={saving}`, while unselected rows replace dead `hover:bg-line-soft` with `border-transparent hover:bg-accent hover:text-accent-foreground` | P2 |
| 4 | Verify consumer-visible behavior and WCAG AA contrast (text ≥ 4.5:1, selected boundary/surface ≥ 3:1) in unit tests and Playwright E2E specs across 3 viewports (`1440×900`, `768×1024`, `375×812`) and both themes (`light`, `dark`), and update `DESIGN.md` | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: TDD Selection Contrast Fix & E2E Verification](./phase-01-start.md) | Pending |

## Success Criteria

- [ ] `OptionButton` and `LearningGoalsStep` in `apps/student/src/components/onboarding/onboarding-steps.tsx` render `aria-pressed={selected}`, use `border-primary bg-muted font-medium text-foreground ring-1 ring-primary` when selected and `border-input bg-transparent text-foreground hover:bg-accent` when unselected, include `focus-visible:ring-0` alongside `focus-visible:shadow-[var(--focus-ring)]`, and mark their check indicator `<div>` with `aria-hidden="true"` and `border-input` when unselected (0 occurrences of `border-transparent` in `onboarding-steps.tsx`).
- [ ] `TargetScoreStep` in `apps/student/src/components/onboarding/onboarding-steps.tsx` renders `aria-pressed={selected}` and uses `border-primary bg-primary font-semibold text-primary-foreground` when selected and `border-input bg-transparent text-foreground hover:bg-accent` when unselected.
- [ ] `ChipMulti` in `apps/web/src/components/ui/chip-multi.tsx` uses `border-primary bg-primary text-primary-foreground` when selected and `border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50` when unselected (0 occurrences of `border-transparent` in `chip-multi.tsx`).
- [ ] `EnrollStudentModal` in `apps/web/src/components/modals/enroll-student-modal.tsx` renders `role="option"` rows with base `border`, `outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50`, `disabled={saving}`, `border-primary bg-muted font-medium ring-1 ring-primary` plus `<Check aria-hidden="true" />` inside a `shrink-0` phone container when selected, and `border-transparent hover:bg-accent hover:text-accent-foreground` when unselected (0 occurrences of `bg-line-soft`).
- [ ] Unit tests (`onboarding.test.tsx`, `chip-multi.test.tsx`, `enroll-student-modal.test.tsx`), typechecks, `biome check`, and Playwright E2E specs (`student-portal-onboarding.spec.ts`, `enroll-existing-student.spec.ts`) pass with 0 errors.

## Red Team Review

### Session — 2026-11-01
**Findings:** 7 (6 accepted, 1 rejected)
**Severity breakdown:** 1 Critical, 3 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `ring-1` (`@layer utilities`) overrides `@layer base :focus-visible` on `EnrollStudentModal` options and collides with `--focus-ring` on `OptionButton`/`LearningGoalsStep`; missing `box-shadow` transition and `shrink-0` on phone span | Critical | Accept | Phase 1 (Tasks 1.1 & 1.2) |
| 2 | E2E contrast checks must verify `>= 3:1` background contrast between selected `"Band 6.5"` and unselected `"Band 6.0"`, `>= 3:1` border & check-badge contrast on Step 1 `"IELTS"`, `aria-pressed` on Steps 3 & 4, root-down alpha compositing for `dark:bg-input/30`, and viewport/theme reset in `finally` | High | Accept | Phase 1 (Task 1.3) |
| 3 | `@custom-variant dark` causes `dark:bg-input/30` to override `hover:bg-accent` in dark mode on unselected `ChipMulti` unless `dark:hover:bg-input/50` is added | High | Accept | Phase 1 (Tasks 1.1 & 1.2) |
| 4 | Handover precision in Task 1.1: regex accessible names (`/IELTS/`, `/TOEIC/`, `/Học viên Hai/`), distinct `id: "st-1"`/`"st-2"`, `StudyHoursStep` assertions, check badge `aria-hidden`/`border-input` assertions, and `// @vitest-environment jsdom` in `chip-multi.test.tsx` | High | Accept | Phase 1 (Task 1.1) |
| 5 | `DESIGN.md:129` (`## Don't`) must be updated alongside lines 69–71 and 83–86, and `ChipMulti` must be distinguished from `ChipFilter` | Medium | Accept | Phase 1 (Task 1.3) |
| 6 | Document `quiz-question-item.tsx` and `revenue-chart.tsx` in `Explicit Non-Goals` to keep the 3-surface scope boundary explicit | Medium | Accept | Plan Non-Goals |
| 7 | Add `role="group"` and `Field` label cloning props to `ChipMulti` outer `<div>` | Medium | Reject (avoids altering `getByRole("group")` queries across existing specs; out of scope for #518 contrast fix) | Plan Non-Goals |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`
- Decision deltas checked: 7
- Reconciled stale references: 6
- Unresolved contradictions: 0

## Validation Log

### Verification Results
- **Tier:** Light (1 phase)
- **Claims checked:** 8
- **Verified:** 8 | **Failed:** 0 | **Unverified:** 0
- **Key decisions confirmed:**
  1. Scope locked to the 3 reported surfaces (`onboarding-steps.tsx`, `chip-multi.tsx`, `enroll-student-modal.tsx`), their unit tests, E2E specs (`student-portal-onboarding.spec.ts`, `enroll-existing-student.spec.ts`), and `DESIGN.md`.
  2. Standalone chips (`ChipMulti`, `TargetScoreStep`) use `border-primary bg-primary text-primary-foreground`; option cards/rows (`OptionButton`, `LearningGoalsStep`, `EnrollStudentModal`) use `border-primary bg-muted ring-1 ring-primary` + check indicator.
  3. All verification commands (`vitest`, `check-types`, `biome check`, Playwright E2E) have exact mechanical pass conditions.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`
- Decision deltas checked: 7
- Reconciled stale references: 0
- Unresolved contradictions: 0

<!-- slug: 518-selected-chip-card-contrast -->
