---
title: "Add Confirmation Toasts for Student Class Enrollment and Org Invitation Acceptance (#522)"
description: "Display a confirmation toast ('Đã thêm <tên> vào lớp') when a teacher enrolls or creates a student in EnrollStudentModal, and display a confirmation toast ('Đã tham gia <tổ chức>') when a student accepts an organization invitation in NotificationBell."
status: pending
priority: P3
effort: "1h"
tags: [web, student, ux, toast, e2e, bugfix]
created: 2026-11-01
---

# 522-enroll-and-invite-accept-toast

## Overview

In Issue #522, user testing and staging QA identified two high-signal confirmation gaps where mutations succeed silently without firing a `sonner` toast:

1. **Teacher App — `EnrollStudentModal` (`apps/web/src/components/modals/enroll-student-modal.tsx`):**
   - When a teacher opens a class detail page (`/classes/$classId`), switches to the **"Học viên"** tab, clicks **"+ Thêm học viên vào lớp"**, selects an existing student (or creates a new student inline) and clicks **"Lưu"**, `EnrollStudentModal.submit` awaits `run({ type: "enroll-student", ... })` or `run({ type: "add-student", ... })`. When `result?.kind === "refreshed"` (or when `reconcileAndFinish` reconciles a `committed` write), the modal resets its state and calls `onClose()`, but never calls `toast.success(...)`.
   - Fix: Import `toast` from `"sonner"` in `apps/web/src/components/modals/enroll-student-modal.tsx`. Capture the student's display name at `submit` time before awaiting `run(...)` (from `data.students.find((s) => s.id === selectedStudentId)?.name.trim()` in `"existing"` mode, and `trimmedName` in `"create"` mode) and compute `const successMessage = studentName ? \`Đã thêm \${studentName} vào lớp\` : "Đã thêm học viên vào lớp"`. When `result?.kind === "refreshed"`, clear `committedToastMessageRef.current`, call `toast.success(successMessage)`, reset form state, and call `onClose()`. When `result?.kind === "committed"`, store `committedToastMessageRef.current = successMessage` (otherwise `null`). In `reconcileAndFinish()`, capture `const pendingToastMessage = committedToastMessageRef.current` before `await reconcile()`; when `await reconcile()` resolves `true`, clear `committedToastMessageRef.current`, call `if (pendingToastMessage) toast.success(pendingToastMessage)`, reset both existing-mode and create-mode state fields, and call `onClose()`. Never fire a success toast on `definite-failure`, on un-reconciled `committed`/`unknown` notices, or when reconciling an `outcome-unknown` write where the `POST` itself may not have landed.

2. **Student Portal — `NotificationBell` (`apps/student/src/components/layout/notification-bell.tsx`):**
   - When a student opens the notification bell popover and clicks **"Chấp nhận"** on a pending organization invitation, `handleAccept(id)` awaits `acceptMutation.mutateAsync(id)` and invalidates `["student"]` queries (which redirects un-onboarded students to `/onboarding` via `StudentPageGate` / `StudentOverviewPage`), but never calls `toast.success(...)`.
   - Fix: Import `toast` from `"sonner"` in `apps/student/src/components/layout/notification-bell.tsx`. Guard `if (processingId !== null) return;` at the start of `handleAccept` and `handleReject` (and set `disabled={processingId !== null}` on the invitation action buttons) to prevent concurrent invitation mutations from racing. In `handleAccept(id)`, read `const orgName = pendingNotifications.find((n) => n.id === id)?.orgName?.trim();` before `await acceptMutation.mutateAsync(id)`. Immediately after `await acceptMutation.mutateAsync(id)` resolves inside the `try` block, call `toast.success(orgName ? \`Đã tham gia \${orgName}\` : "Đã tham gia tổ chức")`. Because `<Toaster />` is mounted at the root layout (`apps/student/src/routes/__root.tsx:40`), the toast persists cleanly across the `/onboarding` redirect. Never fire a success toast when `acceptMutation.mutateAsync` rejects.

This plan is authored under the `--advice` handover contract and `--tdd` test-first workflow. Each phase carries explicit task-level mechanical verification and a literal Failure Protocol block.

## Advisor Scope Lock

- **Locked Scope:**
  - `apps/web/src/components/modals/enroll-student-modal.tsx` (import `toast` from `"sonner"`; call `toast.success` on `result?.kind === "refreshed"` in both `"existing"` and `"create"` modes with `Đã thêm <tên> vào lớp` / fallback `"Đã thêm học viên vào lớp"`, and on `await reconcile()` in `reconcileAndFinish` when reconciling a `committed` write using the `committedToastMessageRef` captured at `submit` time while resetting all form fields).
  - `apps/web/src/components/modals/enroll-student-modal.test.tsx` (separate TDD unit tests verifying `toast.success` is called with the student's name in `"existing"` and `"create"` modes, fallback `"Đã thêm học viên vào lớp"` when the student name is whitespace, `"Đã thêm Học viên Hai vào lớp"` after reconciling a `committed` write, and is NOT called on 422 server rejection, before reconcile completes, or when reconciling an `outcome-unknown` write).
  - `apps/student/src/components/layout/notification-bell.tsx` (import `toast` from `"sonner"`; guard `if (processingId !== null) return;` in `handleAccept` / `handleReject` and `disabled={processingId !== null}` on invitation buttons; capture `orgName` before `await acceptMutation.mutateAsync(id)` and call `toast.success(orgName ? \`Đã tham gia \${orgName}\` : "Đã tham gia tổ chức")` on resolution).
  - `apps/student/test/notification-bell.test.tsx` (TDD unit tests verifying `toast.success("Đã tham gia Academy 1")` on accept with `orgName`, fallback `"Đã tham gia tổ chức"` when `orgName` is empty/missing, and no toast when `acceptMutation.mutateAsync` rejects).
  - `apps/e2e/specs/enroll-existing-student.spec.ts`, `apps/e2e/specs/manual-student-and-trial-grading.spec.ts`, and `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts` (assert visible `[data-sonner-toast]` confirmation copy `"Đã thêm ... vào lớp"` and `"Đã tham gia Teacher Alpha"` in real browser flows), plus scoping post-enroll `page.getByText(STUDENT_NAME)` roster checks to `page.locator("tbody tr", { hasText: ... })` in `enroll-existing-student.spec.ts`, `manual-student-and-trial-grading.spec.ts`, `create-invoice.spec.ts`, `student-package-validation.spec.ts`, `class-operations.spec.ts`, `global-search.spec.ts`, `projected-sessions.spec.ts`, `student-package-without-class.spec.ts`, `schedule-session-modal.spec.ts`, `session-occurrence.spec.ts`, and `teacher-command-search.spec.ts` so Playwright strict mode does not collide with the visible enrollment toast.
  - `CHANGELOG.md` (record bugfix `#522` under `## 2026-11-01` → `### Fixed`).
- **Explicit Non-Goals:**
  - Do NOT add error toasts to `EnrollStudentModal` (which uses inline `role="alert"` and `KernelSubmitNotice`) or `NotificationBell`.
  - Do NOT add a toast to `handleReject` in `NotificationBell`.
  - Do NOT modify shared hooks (`useKernelFormSubmit`, `useAcceptInvitation`) or `<Toaster />` mounts.
  - Do NOT alter the `/onboarding` redirect logic in `StudentPageGate` or `StudentOverviewPage`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Show confirmation toast `Đã thêm <tên> vào lớp` (or fallback `"Đã thêm học viên vào lớp"`) when `EnrollStudentModal` completes a class enrollment or inline student creation (or reconciles a `committed` write) | P3 |
| 2 | Show confirmation toast `Đã tham gia <tổ chức>` (or fallback `"Đã tham gia tổ chức"`) when `NotificationBell` accepts an organization invitation | P3 |
| 3 | Verify with TDD unit tests (`apps/web` & `apps/student`), Playwright E2E specs (`enroll-existing-student.spec.ts`, `manual-student-and-trial-grading.spec.ts`, `student-org-invitation-and-switcher.spec.ts`, plus post-enroll roster locator scoping), and update `CHANGELOG.md` | P3 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: TDD Confirmation Toasts in EnrollStudentModal and NotificationBell, E2E & Changelog](./phase-01-start.md) | Pending |

## Success Criteria

- [ ] `apps/web/src/components/modals/enroll-student-modal.tsx` calls `toast.success(\`Đã thêm \${studentName} vào lớp\`)` (fallback `"Đã thêm học viên vào lớp"`) when `run(...)` resolves with `kind === "refreshed"` in both `"existing"` and `"create"` modes, calls `toast.success(pendingToastMessage)` when `reconcile()` resolves `true` in `reconcileAndFinish()` after a `committed` write, and never calls `toast.success` on `definite-failure`, un-reconciled `committed`/`unknown` outcomes, or `outcome-unknown` reconcile.
- [ ] `apps/student/src/components/layout/notification-bell.tsx` guards `if (processingId !== null) return;`, captures `inv.orgName` before `await acceptMutation.mutateAsync(id)`, and calls `toast.success(orgName ? \`Đã tham gia \${orgName}\` : "Đã tham gia tổ chức")` only when `acceptMutation.mutateAsync(id)` resolves.
- [ ] Unit tests in `apps/web/src/components/modals/enroll-student-modal.test.tsx` and `apps/student/test/notification-bell.test.tsx` pass and cover positive, fallback, `committed` reconcile, and negative (rejection / un-reconciled / `outcome-unknown`) cases in isolated `it(...)` blocks.
- [ ] Playwright E2E specs `apps/e2e/specs/enroll-existing-student.spec.ts`, `apps/e2e/specs/manual-student-and-trial-grading.spec.ts`, and `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts` assert the rendered confirmation toasts (`Đã thêm ${STUDENT_NAME} vào lớp` and `Đã tham gia Teacher Alpha`) and pass alongside scoped `tbody tr` roster checks, and `CHANGELOG.md` is updated under `## 2026-11-01` → `### Fixed`.

## Red Team Review

### Session — 2026-11-01
**Findings:** 6 deduplicated (6 accepted, 0 rejected)
**Severity breakdown:** 2 Critical, 2 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Unscoped `page.getByText(STUDENT_NAME)` in `enroll-existing-student.spec.ts:243` and 10 other E2E specs matches both the roster cell and the new `[data-sonner-toast]` (`Đã thêm ${STUDENT_NAME} vào lớp`), causing Playwright strict-mode violations | Critical | Accept | Plan Advisor Scope Lock, Success Criteria, Phase 1 (Files, Task 1.3 Step 1 & Verify) |
| 2 | Internal contradiction between `plan.md` and `phase-01-start.md` on `reconcileAndFinish()` toast copy, lazy reading of mutable state while `notice` is visible, and missing unit test for `"Đã thêm học viên vào lớp"` fallback | Critical | Accept | Plan Overview, Scope Lock, Success Criteria, Phase 1 (Tasks 1.1 & 1.2) |
| 3 | `reconcileAndFinish()` fires a false-positive `toast.success` when `notice.kind === "unknown"` (5xx/network error on `POST` where the write never landed) | High | Accept | Plan Overview, Scope Lock, Success Criteria, Phase 1 (Tasks 1.1 & 1.2) |
| 4 | E2E assertion in `student-org-invitation-and-switcher.spec.ts` waits for `/onboarding` navigation (up to 10s) before checking a 4s auto-dismissing toast and uses `/Đã tham gia/` instead of `"Đã tham gia Teacher Alpha"` | High | Accept | Plan Scope Lock, Success Criteria, Phase 1 (Task 1.3 Step 2) |
| 5 | Combining 422 rejection and 503 reconcile into a single `it(...)` block in `enroll-student-modal.test.tsx` collides on mounted dialogs without explicit `cleanup()` | Medium | Accept | Plan Scope Lock, Success Criteria, Phase 1 (Task 1.1 Step 1) |
| 6 | Missing re-entrancy guard in `NotificationBell.handleAccept` / `handleReject` allows concurrent invitation clicks to race `setActiveStudentOrgId` and emit duplicate toasts | Medium | Accept | Plan Overview, Scope Lock, Success Criteria, Phase 1 (Task 1.2 Step 2) |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`
- Decision deltas checked: 6
- Reconciled stale references: 6
- Unresolved contradictions: 0

## Validation Log

### Verification Results
- **Tier:** Light (1 phase)
- **Claims checked:** 6
- **Verified:** 6 | **Failed:** 0 | **Unverified:** 0
- **Key decisions confirmed:**
  1. `EnrollStudentModal` (`apps/web/src/components/modals/enroll-student-modal.tsx`) captures the student display name at `submit` time (`"Đã thêm <tên> vào lớp"` or fallback `"Đã thêm học viên vào lớp"`), fires `toast.success` on `result?.kind === "refreshed"`, and stores `committedToastMessageRef.current` only when `result?.kind === "committed"` so `reconcileAndFinish()` toasts only for reconciled `committed` writes (never `outcome-unknown`).
  2. `NotificationBell` (`apps/student/src/components/layout/notification-bell.tsx`) guards `if (processingId !== null) return;` in `handleAccept` and `handleReject`, disables invitation action buttons while `processingId !== null`, captures `orgName` before `await acceptMutation.mutateAsync(id)`, and fires `toast.success(orgName ? \`Đã tham gia \${orgName}\` : "Đã tham gia tổ chức")` on resolution.
  3. Unit tests in `apps/web/src/components/modals/enroll-student-modal.test.tsx` and `apps/student/test/notification-bell.test.tsx` use separate `it(...)` blocks covering positive, fallback, `committed` reconcile, and negative (422 rejection, un-reconciled, `outcome-unknown`) cases.
  4. E2E specs assert the visible `[data-sonner-toast]` in `enroll-existing-student.spec.ts`, `manual-student-and-trial-grading.spec.ts`, and `student-org-invitation-and-switcher.spec.ts` (`"Đã tham gia Teacher Alpha"` immediately after `acceptBtn.click()`), and scope post-enroll roster assertions to `page.locator("tbody tr", { hasText: ... })` across all 11 affected E2E spec files.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`
- Decision deltas checked: 6
- Reconciled stale references: 0
- Unresolved contradictions: 0

<!-- slug: 522-enroll-and-invite-accept-toast -->
