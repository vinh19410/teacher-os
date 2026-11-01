---
title: "Ship 520: Localize class detail tab label and format startDate as dd/mm/yyyy"
date: 2026-11-01
summary: "Shipped fix for #520 into develop with TDD unit tests and 3-viewport Playwright E2E verification."
---

# Ship 520: Localize class detail tab label and format startDate as dd/mm/yyyy

## What happened
Implemented and verified the fix for GitHub issue #520 on branch `fix/520-class-detail-vi-date-format`.
- Localized default tab label in `apps/web/src/routes/_auth/classes/$classId.tsx` from `"Sessions & practice"` to `"Buổi học & luyện tập"` while preserving `id: "sessions-practice"`.
- Formatted the student stat card subtitle as `sub={cls.startDate.trim() ? \`Từ ${fmtDue(cls.startDate)}\` : undefined}`.
- Migrated all 18 non-historical callers across unit tests, 13 E2E spec files, `DESIGN.md`, and `.cursor/skills/verify-teacher-os/`.

## Decision
Scoped `sessionRow` in `$classId.sessions.test.tsx` to `screen.getAllByTestId("session-row")` per Kongming Failure Protocol counsel so the newly formatted stat card subtitle `"Từ 12/10/2026"` does not collide with session row text matching.

## Next steps
Open PR into `develop`, run `/ak-review-pr --fix --reply --advice`, merge into `develop`, and watch `develop` CI to green.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
