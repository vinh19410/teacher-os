---
title: "Plan 520: Localize class detail tab label and format startDate as dd/mm/yyyy"
date: 2026-11-01
summary: "Validated TDD handover plan for #520 to localize Sessions & practice tab to Buổi học & luyện tập and format cls.startDate as dd/mm/yyyy."
---

# Plan 520: Localize class detail tab label and format startDate as dd/mm/yyyy

## What happened
Created and red-teamed `plans/261101-0428-520-class-detail-vi-date-format/plan.md` for GitHub issue #520 (`apps/web/src/routes/_auth/classes/$classId.tsx`).

## Decision
1. Localize `{ id: "sessions-practice", label: "Buổi học & luyện tập" }` while preserving `id: "sessions-practice"` for URL search parameter compatibility.
2. Format the student stat card subtitle as `sub={cls.startDate.trim() ? \`Từ ${fmtDue(cls.startDate)}\` : undefined}` using `fmtDue` from `@/components/assignments/assignment-status`.
3. Migrate all 18 non-historical callers across unit tests, 13 E2E spec files, `DESIGN.md`, and `.cursor/skills/verify-teacher-os/`.

## Next steps
Commit and push plan + journal via `ak-git cp`, update GitHub issue #520, and execute Phase 1 via `/ak-fix --auto --advice`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
