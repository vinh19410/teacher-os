---
phase: 1
title: "Phase 1: Auth Hooks & Server Single-Org Provisioning"
status: todo
---

# Phase 1: Auth Hooks & Server Single-Org Provisioning

## Overview

Đưa logic `provisionStudentForUser` dùng chung về `@teacher-os/auth`, bổ sung tra cứu org hoạt động 3 tầng (`TEACHER_EMAILS` -> managed `membership` -> earliest org), tự động chuyển `student_invitation` `pending` -> `accepted`, và gắn hook ngay sau bước tạo/cập nhật/xác thực email trong `createAuth` lẫn fallback trong `/api/student/orgs`.

## Implementation Steps

1. Tạo `packages/auth/src/student-provisioning.ts` với `provisionStudentForUser(db, user, options?: { teacherEmails?: string[] })`.
2. Gắn `maybeProvisionVerifiedStudent` vào `databaseHooks.user.create.after`, `databaseHooks.user.update.after`, và `emailVerification.afterEmailVerification` trong `packages/auth/src/index.ts`.
3. Cập nhật `apps/server/src/student-provisioning.ts` thành wrapper `async function` gọi `@teacher-os/auth/student-provisioning` để giữ tương thích `vi.spyOn` trong `apps/server/src/student.test.ts`.
4. Truyền `teacherEmails?: string[]` qua `StudentRouteDeps` trong `apps/server/src/routes/student.ts`, gọi `provisionStudentForUser` tại `createStudentGuard` và fallback trong `GET /api/student/orgs` khi `studentRows.length === 0`.
5. Cập nhật và bổ sung unit/integration test tại `apps/server/src/student-provisioning.test.ts`, `apps/server/src/routes/student-auth-otp.test.ts`, `packages/auth/src/auth-verification-email.test.ts`, `packages/auth/src/auth-email-otp.test.ts`.

## Tasks

- [ ] Implement `packages/auth/src/student-provisioning.ts` với 3-tier org resolution & auto-accept pending invite
- [ ] Wire `createAuth` hooks (`user.create.after`, `user.update.after`, `afterEmailVerification`) trong `packages/auth/src/index.ts`
- [ ] Update `apps/server/src/student-provisioning.ts` wrapper & `apps/server/src/routes/student.ts` (`createStudentGuard` + `/orgs`)
- [ ] Verify `@teacher-os/auth` tests, `server` tests, và `pnpm check-types`
