---
title: Ship 522 enroll and invite accept toast
date: 2026-11-01
summary: "Completed implementation, unit tests, and E2E verification for #522 confirmation toasts"
---

# Ship 522 enroll and invite accept toast

## What happened
Implemented and verified confirmation toasts for Issue #522 in `EnrollStudentModal` (`apps/web/src/components/modals/enroll-student-modal.tsx`) and `NotificationBell` (`apps/student/src/components/layout/notification-bell.tsx`), plus TDD unit tests, E2E specs, and `CHANGELOG.md`.

## Decision
- `EnrollStudentModal` fires `toast.success("Đã thêm <tên> vào lớp")` (fallback `"Đã thêm học viên vào lớp"`) on `refreshed` and after reconciling a `committed` write via `committedToastMessageRef`, while withholding toast on `422` rejection or `outcome-unknown`.
- `NotificationBell` guards `if (processingId !== null) return;` and fires `toast.success("Đã tham gia <tổ chức>")` (fallback `"Đã tham gia tổ chức"`) on `acceptMutation.mutateAsync` resolution.

## Next steps
Ship beta PR into `develop`, run `/ak-review-pr --fix --reply --advice`, merge into `develop`, and watch `develop` CI to green.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
