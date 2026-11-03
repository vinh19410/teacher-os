---
title: Plan 518 Selected Chip and Card Contrast
date: 2026-11-01
summary: "Authored, red-teamed, and validated TDD handover plan for #518 selected chip/card contrast across onboarding, ChipMulti, and EnrollStudentModal"
---

# Plan 518 Selected Chip and Card Contrast

## What happened
Investigated GitHub Issue #518 where selected states across Student Portal Onboarding (`onboarding-steps.tsx`), Teacher "Tạo lớp mới" (`chip-multi.tsx`), and Teacher "Thêm học viên vào lớp" (`enroll-student-modal.tsx`) became visually indistinguishable from unselected items after the design v2 neutral migration (#378) replaced orange `--hot` with `border-transparent` + `bg-muted`/`bg-secondary`/`bg-accent` (1.06:1 against white).

## Decision
Authored a 1-phase TDD handover plan (`plans/261101-0337-518-selected-chip-card-contrast/plan.md`) under Kongming advisory supervision and 2-reviewer red-team gate:
- Standalone chips (`ChipMulti`, `TargetScoreStep`) use `border-primary bg-primary text-primary-foreground` when selected.
- Option cards and listbox rows (`OptionButton`, `LearningGoalsStep`, `EnrollStudentModal`) use `border-primary bg-muted ring-1 ring-primary` plus a check icon and protected `:focus-visible` ring.

## Next steps
Commit and push the plan via `ak-git cp`, update GitHub issue #518, and execute Phase 1 via `/ak-fix --auto --advice`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
