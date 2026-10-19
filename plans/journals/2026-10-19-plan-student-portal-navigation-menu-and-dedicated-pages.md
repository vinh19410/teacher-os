---
title: Plan student portal navigation menu and dedicated pages
date: 2026-10-19
summary: "Planned top header navigation menu in StudentShell and dedicated /classes, /assignments, /tuition pages for student portal (#365)"
---

# Plan student portal navigation menu and dedicated pages

## What happened

- Scoped and planned the student portal navigation menu (`plans/261019-0648-student-portal-nav-menu/plan.md`) and filed GitHub issue #365 with labels `ai-handle` and `ready to review`.
- Audited all routes in `apps/student/src/routes/_auth/` and E2E specs in `apps/e2e/specs/` to ensure backward compatibility with existing overview flows (`/`).

## Decision

- Selected a horizontal navigation bar (`StudentNav`) inside `StudentShell` header (`flex-wrap lg:flex-nowrap`) with 5 destinations: Tổng quan (`/`), Lớp học (`/classes`), Bài tập (`/assignments`), Từ vựng (`/vocab`), and Học phí (`/tuition`).
- Standardized invoice query keys under `["student", "invoices"]` (`useStudentInvoices`) so `OrgSwitcher` invalidates invoices on organization switch, and introduced a shared `StudentPageGate` for `NOT_LINKED` / `onboarding` checks.
- Scoped `tuition-bank-transfer.spec.ts:265` invoice link click to `page.getByRole("main")` in Phase 3 to avoid colliding with the new header `"Học phí"` link.

## Next steps

- Run `/ak:cook /Users/vinhtran/Documents/project/personal/teacher-os/plans/261019-0648-student-portal-nav-menu/plan.md` to implement Phases 1–3.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
