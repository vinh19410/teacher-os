---
title: "Plan #521: Enable Sắp xếp buổi with empty-state curriculum CTA"
date: 2026-11-01
summary: "TDD handover plan for issue #521 to enable Sắp xếp buổi and show curriculum tab CTA in ClassSessionsManageModal when class has no syllabus."
---

# Plan #521: Enable Sắp xếp buổi with empty-state curriculum CTA

## What happened
- Investigated Issue #521 where the "Sắp xếp buổi" button in `apps/web/src/routes/_auth/classes/$classId.tsx` was rendered with `disabled={!sy}` without explanation when a class had no curriculum.
- Found that `ClassSessionsManageModal` (`apps/web/src/components/class-detail/class-sessions-manage-modal.tsx`) already had a `!sy` fallback branch that was unreachable because the header button was disabled.
- Authored and validated TDD handover plan `plans/261101-0509-521-class-detail-schedule-disabled-hint/` under `--advice` (`kongming`) and ran a 2-persona Red Team review.

## Decision
- Keep "Sắp xếp buổi" enabled when `!sy`, only switch `tab` to `sessions-practice` on click when `sy` is present, and upgrade the `!sy` empty state in `ClassSessionsManageModal` with `"Gắn giáo trình cho lớp để sắp xếp buổi."` plus a required `"Mở tab Giáo trình"` CTA (`onOpenCurriculum`).

## Next steps
- Update GitHub issue #521 with plan metadata and `ready to cook` label.
- Execute Phase 1 via `/ak-fix --auto --advice`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
