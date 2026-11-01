---
title: Plan 522 enroll and invite accept toast
date: 2026-11-01
summary: "Validated and red-teamed plan for #522 confirmation toasts in EnrollStudentModal and NotificationBell"
---

# Plan 522 enroll and invite accept toast

## What happened
Created and red-teamed plan `261101-0600-522-enroll-and-invite-accept-toast` for Issue #522 (missing confirmation toasts after enrolling a student in `EnrollStudentModal` and after accepting an organization invitation in `NotificationBell`).

## Decision
- Track `committedToastMessageRef` in `EnrollStudentModal` so `reconcileAndFinish` only fires `toast.success` when reconciling a `committed` write (never on `outcome-unknown`).
- Guard `if (processingId !== null) return;` in `NotificationBell.handleAccept` and `handleReject` and capture `orgName` before `await acceptMutation.mutateAsync(id)`.
- Scope post-enroll `page.getByText(...)` roster checks to `page.locator("tbody tr", { hasText: ... })` across 11 E2E specs so Playwright strict mode does not collide with the new `[data-sonner-toast]`.

## Next steps
Commit and push plan (`ak-git cp`), update Issue #522 with plan metadata and labels, and execute `/ak-fix --auto --advice`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
