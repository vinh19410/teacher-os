---
phase: 1
title: "Phase 1: TDD Confirmation Toasts in EnrollStudentModal and NotificationBell, E2E & Changelog"
status: pending
priority: P3
effort: "1h"
dependencies: []
---

# Phase 1: TDD Confirmation Toasts in EnrollStudentModal and NotificationBell, E2E & Changelog

<!-- Updated: Red Team & Validation Session 1 - Reconciled committedToastMessageRef in EnrollStudentModal so reconcileAndFinish only toasts on committed writes (not outcome-unknown), split unit tests into separate it() blocks including whitespace-name fallback, guarded processingId !== null in NotificationBell, asserted exact "Đã tham gia Teacher Alpha" immediately after acceptBtn.click(), and scoped post-enroll roster checks to tbody tr across 11 E2E specs -->

## Goal

Add `sonner` confirmation toasts (`Đã thêm <tên> vào lớp` in `EnrollStudentModal` and `Đã tham gia <tổ chức>` in `NotificationBell`) using a strict TDD Red → Green workflow, verify with unit tests and Playwright E2E tests, and document the fix in `CHANGELOG.md`.

## Overview

1. **`EnrollStudentModal` TDD Red → Green (`apps/web/src/components/modals/enroll-student-modal.test.tsx` & `apps/web/src/components/modals/enroll-student-modal.tsx`)**:
   - Mock `sonner` in `enroll-student-modal.test.tsx` and assert in separate `it(...)` blocks that `toast.success` is called with `"Đã thêm Học viên Hai vào lớp"` in existing-student mode, `"Đã thêm Trần Minh Khôi vào lớp"` in create-student mode, `"Đã thêm học viên vào lớp"` when an existing student's name is whitespace, `"Đã thêm Học viên Hai vào lớp"` after reconciling a `committed` write, and `not.toHaveBeenCalled()` when the server rejects (422), before reconcile completes, or when reconciling an `outcome-unknown` write.
   - Update `EnrollStudentModal` to import `toast` from `"sonner"`, compute `successMessage` at `submit` time before `await run(...)`, invoke `toast.success(successMessage)` on `result?.kind === "refreshed"`, track `committedToastMessageRef.current` only when `result?.kind === "committed"`, and fire `toast.success` after `await reconcile()` in `reconcileAndFinish()` only when `committedToastMessageRef.current` is non-null.
2. **`NotificationBell` TDD Red → Green (`apps/student/test/notification-bell.test.tsx` & `apps/student/src/components/layout/notification-bell.tsx`)**:
   - Mock `sonner` in `notification-bell.test.tsx` and assert that clicking **"Chấp nhận"** calls `toast.success("Đã tham gia Academy 1")` when `orgName` is `"Academy 1"`, calls `toast.success("Đã tham gia tổ chức")` when `orgName` is blank/missing, and does not call `toast.success` when `acceptMutateMock` rejects.
   - Update `NotificationBell` to import `toast` from `"sonner"`, guard `if (processingId !== null) return;` in `handleAccept` and `handleReject` (and `disabled={processingId !== null}` on invitation buttons), capture `orgName` before `await acceptMutation.mutateAsync(id)`, and call `toast.success(orgName ? \`Đã tham gia \${orgName}\` : "Đã tham gia tổ chức")` after `mutateAsync` resolves.
3. **E2E & Changelog (`apps/e2e/specs/*.spec.ts`, `CHANGELOG.md`)**:
   - Assert the visible toast in `enroll-existing-student.spec.ts` and `manual-student-and-trial-grading.spec.ts` (`Đã thêm ${STUDENT_NAME} vào lớp`) and immediately after `await acceptBtn.click()` in `student-org-invitation-and-switcher.spec.ts` (`Đã tham gia Teacher Alpha`).
   - Scope post-enroll `page.getByText(STUDENT_NAME)` roster checks to `page.locator("tbody tr", { hasText: ... })` in the 11 E2E spec files where `EnrollStudentModal` closes right before the roster visibility check so Playwright strict mode never collides with the visible confirmation toast.
   - Add a `### Fixed` bullet for `#522` under `## 2026-11-01` in `CHANGELOG.md`.

## Files to Create / Modify

- Modify: `apps/web/src/components/modals/enroll-student-modal.test.tsx`
- Modify: `apps/web/src/components/modals/enroll-student-modal.tsx`
- Modify: `apps/student/test/notification-bell.test.tsx`
- Modify: `apps/student/src/components/layout/notification-bell.tsx`
- Modify: `apps/e2e/specs/enroll-existing-student.spec.ts`
- Modify: `apps/e2e/specs/manual-student-and-trial-grading.spec.ts`
- Modify: `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts`
- Modify: `apps/e2e/specs/create-invoice.spec.ts`
- Modify: `apps/e2e/specs/student-package-validation.spec.ts`
- Modify: `apps/e2e/specs/class-operations.spec.ts`
- Modify: `apps/e2e/specs/global-search.spec.ts`
- Modify: `apps/e2e/specs/projected-sessions.spec.ts`
- Modify: `apps/e2e/specs/student-package-without-class.spec.ts`
- Modify: `apps/e2e/specs/schedule-session-modal.spec.ts`
- Modify: `apps/e2e/specs/session-occurrence.spec.ts`
- Modify: `apps/e2e/specs/teacher-command-search.spec.ts`
- Modify: `CHANGELOG.md`

## Requirements

- [ ] Write failing unit tests (TDD Red) in `apps/web/src/components/modals/enroll-student-modal.test.tsx` and `apps/student/test/notification-bell.test.tsx` for confirmation toasts, fallback copy, `committed` reconcile, and negative failure paths.
- [ ] Implement confirmation toasts in `apps/web/src/components/modals/enroll-student-modal.tsx` and `apps/student/src/components/layout/notification-bell.tsx` (TDD Green).
- [ ] Update E2E specs (`enroll-existing-student.spec.ts`, `manual-student-and-trial-grading.spec.ts`, `student-org-invitation-and-switcher.spec.ts`, plus post-enroll `tbody tr` roster scoping) and `CHANGELOG.md`, and pass all unit, typecheck, lint, and E2E gates.

## Tasks & Steps

### Task 1.1 — Add TDD Red unit tests for `EnrollStudentModal` and `NotificationBell` confirmation toasts
- **Goal**: Add isolated unit test assertions in `apps/web/src/components/modals/enroll-student-modal.test.tsx` and `apps/student/test/notification-bell.test.tsx` that fail before the implementation is added.
- **Target files and symbols**:
  - `apps/web/src/components/modals/enroll-student-modal.test.tsx` (`describe("EnrollStudentModal")`)
  - `apps/student/test/notification-bell.test.tsx` (`describe("NotificationBell — lời mời org (giữ nguyên v1)")`)
- **Steps**:
  1. In `apps/web/src/components/modals/enroll-student-modal.test.tsx`:
     - Mock `sonner` at top of file using `vi.hoisted`:
       ```tsx
       const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
       vi.mock("sonner", () => ({ toast }));
       ```
     - Reset `toast.success.mockReset()` and `toast.error.mockReset()` in `beforeEach`.
     - In `"defaults to create-new mode when org has 0 students..."`, assert `expect(toast.success).toHaveBeenCalledWith("Đã thêm Trần Minh Khôi vào lớp");` and `expect(toast.success).toHaveBeenCalledTimes(1);`.
     - In `"sends activateNow=true in existing mode..."`, assert `expect(toast.success).toHaveBeenCalledWith("Đã thêm Học viên Hai vào lớp");` and `expect(toast.success).toHaveBeenCalledTimes(1);`.
     - Add 4 separate `it(...)` blocks:
       1. Enrolling an existing student whose `name` is whitespace (`"   "`) falls back to `toast.success("Đã thêm học viên vào lớp")`.
       2. When the server rejects with `422` (`definite-failure`), `toast.success` is NOT called.
       3. When the write succeeds (`200`) but the snapshot refresh fails with `503` (`committed`), `toast.success` is NOT called while `KernelSubmitNotice` is shown, and clicking `"Tải lại"` calls `toast.success("Đã thêm Học viên Hai vào lớp")` once after reconcile succeeds.
       4. When the `POST` itself fails with `503` (`outcome-unknown`), clicking `"Tải lại & kiểm tra"` reconciles the snapshot without calling `toast.success`.
  2. In `apps/student/test/notification-bell.test.tsx`:
     - Mock `sonner` at top of file using `vi.hoisted`:
       ```tsx
       const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
       vi.mock("sonner", () => ({ toast }));
       ```
     - Reset `toast.success.mockReset()` in `beforeEach`.
     - In `"hiện lời mời pending và bấm Chấp nhận gọi mutation"`, assert `expect(toast.success).toHaveBeenCalledWith("Đã tham gia Academy 1");` and `expect(toast.success).toHaveBeenCalledTimes(1);`.
     - Add 2 separate `it(...)` blocks:
       1. When `orgName` is empty (`""`), clicking `"Chấp nhận"` calls `toast.success("Đã tham gia tổ chức")` once.
       2. When `acceptMutateMock` rejects, clicking `"Chấp nhận"` does NOT call `toast.success`.
- **Success criteria**: Both test files fail on the new `expect(toast.success)` assertions because production components do not call `toast.success` yet.
- **Verify**:
  - `pnpm --filter web exec vitest run src/components/modals/enroll-student-modal.test.tsx` exits non-zero with assertion failure (`expected "spy" to be called with arguments: [ 'Đã thêm Trần Minh Khôi vào lớp' ]`; passing test is a failure).
  - `pnpm --filter student exec vitest run test/notification-bell.test.tsx` exits non-zero with assertion failure (`expected "spy" to be called with arguments: [ 'Đã tham gia Academy 1' ]`; passing test is a failure).

### Task 1.2 — Implement `toast.success` in `EnrollStudentModal` and `NotificationBell` (TDD Green)
- **Goal**: Add `toast.success` calls in `apps/web/src/components/modals/enroll-student-modal.tsx` and `apps/student/src/components/layout/notification-bell.tsx` so all unit tests in Task 1.1 pass.
- **Target files and symbols**:
  - `apps/web/src/components/modals/enroll-student-modal.tsx` (`EnrollStudentModal`, `submit`, `reconcileAndFinish`)
  - `apps/student/src/components/layout/notification-bell.tsx` (`NotificationBell`, `handleAccept`, `handleReject`)
- **Steps**:
  1. In `apps/web/src/components/modals/enroll-student-modal.tsx`:
     - Import `toast` from `"sonner"`.
     - Add `const committedToastMessageRef = useRef<string | null>(null);` and clear `committedToastMessageRef.current = null;` inside the `useEffect` reset when `open` transitions from `false` to `true`.
     - In `submit` when `mode === "existing"`:
       Capture `const selectedStudentName = data.students.find((s) => s.id === selectedStudentId)?.name.trim();` and `const successMessage = selectedStudentName ? \`Đã thêm \${selectedStudentName} vào lớp\` : "Đã thêm học viên vào lớp";` before `await run(...)`.
       When `result?.kind === "refreshed"`, set `committedToastMessageRef.current = null;`, call `toast.success(successMessage);`, reset `selectedStudentId` and `filter`, and call `onClose()`.
       Else set `committedToastMessageRef.current = result?.kind === "committed" ? successMessage : null;`.
     - In `submit` when `mode === "create"`:
       Compute `const successMessage = \`Đã thêm \${trimmedName} vào lớp\`;` before `await run(...)`.
       When `result?.kind === "refreshed"`, set `committedToastMessageRef.current = null;`, call `toast.success(successMessage);`, reset form fields, and call `onClose()`.
       Else set `committedToastMessageRef.current = result?.kind === "committed" ? successMessage : null;`.
     - In `reconcileAndFinish()`:
       Capture `const pendingToastMessage = committedToastMessageRef.current;` before `if (await reconcile())`.
       Inside `if (await reconcile())`, set `committedToastMessageRef.current = null;`, call `if (pendingToastMessage) { toast.success(pendingToastMessage); }`, reset `selectedStudentId`, `filter`, `name`, `phone`, `email`, `parentName`, and `parentPhone`, and call `onClose()`.
  2. In `apps/student/src/components/layout/notification-bell.tsx`:
     - Import `toast` from `"sonner"`.
     - In `handleAccept(id: string)`:
       Guard `if (processingId !== null) return;` at the start.
       Capture `const orgName = pendingNotifications.find((n) => n.id === id)?.orgName?.trim();` before `setProcessingId(id)`.
       Inside `try`, after `await acceptMutation.mutateAsync(id);`, call:
       ```tsx
       toast.success(
         orgName ? `Đã tham gia ${orgName}` : "Đã tham gia tổ chức",
       );
       ```
     - In `handleReject(id: string)`:
       Guard `if (processingId !== null) return;` at the start.
     - On the `"Chấp nhận"` and `"Từ chối"` buttons inside `pendingNotifications.map`, use `disabled={processingId !== null}` so concurrent invitation mutations cannot race.
- **Success criteria**: Both unit test suites (`enroll-student-modal.test.tsx` and `notification-bell.test.tsx`) and existing route/shell suites (`$classId.test.tsx`, `student-shell.test.tsx`) pass.
- **Verify**:
  - `pnpm --filter web exec vitest run src/components/modals/enroll-student-modal.test.tsx 'src/routes/_auth/classes/$classId.test.tsx'` exits 0.
  - `pnpm --filter student exec vitest run test/notification-bell.test.tsx test/student-shell.test.tsx` exits 0.

### Task 1.3 — Update E2E specs and `CHANGELOG.md`, and run quality gates
- **Goal**: Assert the confirmation toasts in Playwright E2E specs (`enroll-existing-student.spec.ts`, `manual-student-and-trial-grading.spec.ts`, and `student-org-invitation-and-switcher.spec.ts`), scope post-enroll roster checks to `tbody tr` in the 11 affected E2E specs, update `CHANGELOG.md`, and run typecheck, lint, unit tests, and E2E verification.
- **Target files and symbols**:
  - `apps/e2e/specs/enroll-existing-student.spec.ts`
  - `apps/e2e/specs/manual-student-and-trial-grading.spec.ts`
  - `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts`
  - `apps/e2e/specs/create-invoice.spec.ts`
  - `apps/e2e/specs/student-package-validation.spec.ts`
  - `apps/e2e/specs/class-operations.spec.ts`
  - `apps/e2e/specs/global-search.spec.ts`
  - `apps/e2e/specs/projected-sessions.spec.ts`
  - `apps/e2e/specs/student-package-without-class.spec.ts`
  - `apps/e2e/specs/schedule-session-modal.spec.ts`
  - `apps/e2e/specs/session-occurrence.spec.ts`
  - `apps/e2e/specs/teacher-command-search.spec.ts`
  - `CHANGELOG.md` (`## 2026-11-01` → `### Fixed`)
- **Steps**:
  1. In `apps/e2e/specs/enroll-existing-student.spec.ts`, after clicking `dialog.getByRole("button", { name: "Lưu", exact: true }).click()` and `await expect(dialog).toBeHidden()` (around line 240), assert:
     ```ts
     await expect(
       page
         .locator("[data-sonner-toast]")
         .filter({ hasText: `Đã thêm ${STUDENT_NAME} vào lớp` }),
     ).toBeVisible();
     ```
     and scope line 243 to `await expect(page.locator("tbody tr", { hasText: STUDENT_NAME })).toBeVisible();`.
  2. In `apps/e2e/specs/manual-student-and-trial-grading.spec.ts`, after `await expect(enrollDialog).toBeHidden()` (line 62), assert:
     ```ts
     await expect(
       page
         .locator("[data-sonner-toast]")
         .filter({ hasText: `Đã thêm ${STUDENT_NAME} vào lớp` }),
     ).toBeVisible();
     ```
     and scope line 65 to `await expect(page.locator("tbody tr", { hasText: STUDENT_NAME })).toBeVisible();`.
  3. Scope the post-enroll `await expect(page.getByText(...)).toBeVisible()` checks to `await expect(page.locator("tbody tr", { hasText: ... })).toBeVisible()` in:
     - `apps/e2e/specs/create-invoice.spec.ts` (lines 46 and 234)
     - `apps/e2e/specs/student-package-validation.spec.ts` (line 104)
     - `apps/e2e/specs/class-operations.spec.ts` (lines 67 and 199)
     - `apps/e2e/specs/global-search.spec.ts` (line 93)
     - `apps/e2e/specs/projected-sessions.spec.ts` (line 123)
     - `apps/e2e/specs/student-package-without-class.spec.ts` (line 65)
     - `apps/e2e/specs/schedule-session-modal.spec.ts` (line 29)
     - `apps/e2e/specs/session-occurrence.spec.ts` (lines 48 and 115)
     - `apps/e2e/specs/teacher-command-search.spec.ts` (line 81)
  4. In `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts`, immediately after `await acceptBtn.click()` (line 103) and before `await expect(studentPage).toHaveURL(/\/onboarding/, { timeout: 10_000 })`, assert:
     ```ts
     await expect(
       studentPage
         .locator("[data-sonner-toast]")
         .filter({ hasText: "Đã tham gia Teacher Alpha" }),
     ).toBeVisible();
     ```
  5. In `CHANGELOG.md`, add a bullet under `## 2026-11-01` → `### Fixed` describing the new confirmation toasts in `EnrollStudentModal` and `NotificationBell` (`#522`).
- **Success criteria**: Typecheck, Biome lint, unit tests, and E2E specs pass with 0 errors.
- **Verify**:
  - `pnpm check-types && pnpm exec biome check .` exits 0.
  - `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/enroll-existing-student.spec.ts specs/manual-student-and-trial-grading.spec.ts specs/student-org-invitation-and-switcher.spec.ts` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.

## Verification

- `pnpm --filter web exec vitest run src/components/modals/enroll-student-modal.test.tsx 'src/routes/_auth/classes/$classId.test.tsx'` exits 0.
- `pnpm --filter student exec vitest run test/notification-bell.test.tsx test/student-shell.test.tsx` exits 0.
- `pnpm check-types && pnpm exec biome check .` exits 0.
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/enroll-existing-student.spec.ts specs/manual-student-and-trial-grading.spec.ts specs/student-org-invitation-and-switcher.spec.ts` exits 0.
