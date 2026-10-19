---
title: Cook & ship student portal navigation menu and dedicated pages (#365)
date: 2026-10-19
summary: "Implemented StudentNav in StudentShell, dedicated /classes, /assignments, /tuition pages, StudentPageGate, and standardized invoice query keys (#365)"
---

# Cook & ship student portal navigation menu and dedicated pages (#365)

## What happened

- Added `StudentNav` (`apps/student/src/components/layout/student-nav.tsx`) with 5 destinations (`Tổng quan`, `Lớp học`, `Bài tập`, `Từ vựng`, `Học phí`) using `neu-in text-hot` + `■` (`aria-hidden="true"`) active state per `DESIGN.md`, and wired it into `StudentShell` (`flex-wrap lg:flex-nowrap`).
- Standardized student invoice query keys under `["student", "invoices"]` (`useStudentInvoices`) and `["student", "invoice-payment", ...]` so `OrgSwitcher` invalidates invoices when switching organizations.
- Added `StudentPageGate` (`apps/student/src/components/layout/student-page-gate.tsx`) and dedicated routes `/classes`, `/assignments` (with `?status=` URL filter sync and `aria-hidden="true"` on tab count badges), and `/tuition` (with empty state), plus wrapped `/tuition/$invoiceId` in `StudentPageGate` with a `← Học phí` back link.
- Added unit tests in `apps/student/test/student-nav.test.tsx` and E2E coverage in `apps/e2e/specs/student-class-detail.spec.ts` & `apps/e2e/specs/tuition-bank-transfer.spec.ts`, verifying 3 viewports (`1440×900`, `768×1024`, `375×812`) and keyboard focus.

## Decision

- Replaced `overflow-x-auto` on `StudentNav` with `flex-wrap ... lg:flex-nowrap` after visual inspection of the 3-viewport screenshots revealed `overflow-x-auto` clipped the top/bottom of `--focus-ring` and hid the 5th link on 375px.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
