---
title: Fix 518 Selected Chip and Card Contrast
date: 2026-11-01
summary: "Implemented TDD fix for selected chip/card contrast across student onboarding, ChipMulti, and EnrollStudentModal with 3-viewport x 2-theme E2E verification"
---

# Fix 518 Selected Chip and Card Contrast

## What happened
Executed Phase 1 of `plans/261101-0337-518-selected-chip-card-contrast/plan.md` via `/ak-fix --auto --advice`:
- Added TDD Red unit tests in `apps/student/test/onboarding.test.tsx`, `apps/web/src/components/ui/chip-multi.test.tsx`, and `apps/web/src/components/modals/enroll-student-modal.test.tsx` and verified expected failures.
- Updated `OptionButton`, `TargetScoreStep`, and `LearningGoalsStep` in `apps/student/src/components/onboarding/onboarding-steps.tsx`, `ChipMulti` in `apps/web/src/components/ui/chip-multi.tsx`, and `EnrollStudentModal` in `apps/web/src/components/modals/enroll-student-modal.tsx`.
- Added real-browser contrast and selection distinction assertions across 3 viewports (`1440×900`, `768×1024`, `375×812`) and both themes (`light`, `dark`) in `apps/e2e/specs/student-portal-onboarding.spec.ts` and `apps/e2e/specs/enroll-existing-student.spec.ts`, and updated `DESIGN.md`.

## Decision
During `e2e:check-types`, `Locator.evaluate` typed `selEl` as `HTMLElement | SVGElement`, causing `TS2345` against `resolveBackdrop(node: HTMLElement)`. Per the Failure Protocol, escalated to Kongming and widened `resolveBackdrop`'s parameter to `Element`. All 8 workspace typechecks, 42 student test files (386 tests), web modal/chip unit tests (26 tests), and 4 Playwright E2E scenarios passed.

## Next steps
Run local code review (`/ak-code-review --pending --advice`), ship beta PR into `develop`, review/fix PR, merge, and watch `develop` CI to green.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
