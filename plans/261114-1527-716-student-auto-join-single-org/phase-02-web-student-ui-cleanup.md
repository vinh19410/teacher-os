---
phase: 2
title: "Phase 2: Web & Student UI Single-Org Cleanup"
status: completed
---

# Phase 2: Web & Student UI Single-Org Cleanup

## Overview

Gỡ bỏ giao diện "Mời học viên vào tổ chức" khỏi danh sách `/students`, chi tiết `/students/$studentId`, `AddStudentModal` trên `apps/web`, và phần lời mời tổ chức khỏi `NotificationBell` trên `apps/student`, đồng thời bảo toàn luồng ghi danh theo lớp (`class-roster-tab.tsx`).

## Implementation Steps

1. Cập nhật `apps/web/src/routes/_auth/students/index.tsx`: bỏ nút `"Mời học viên"`, `InviteStudentModal`, `Tabs` (`Học viên` / `Lời mời đang chờ`), `PendingInvitationsList`, badge `"Chờ xác nhận"`, và `ResendInviteButton`; cập nhật kicker `${students.length} học viên` và empty-state giữ cụm `"student portal"`.
2. Cập nhật `apps/web/src/routes/_auth/students/$studentId.tsx`: bỏ nút `ResendInviteButton` cấp tổ chức khỏi `PageHead`.
3. Cập nhật `apps/web/src/components/modals/add-student-modal.tsx`: bỏ `PendingInviteCallout` khi trùng email tổ chức và bỏ nhắc `"bấm Gửi lại lời mời trong danh sách học viên"` ở warning toast.
4. Cập nhật `apps/student/src/components/layout/notification-bell.tsx`: gỡ section `"Lời mời"` (`useStudentNotifications`, `useAcceptInvitation`, `useRejectInvitation`), chỉ giữ `useStudentInbox` & `useMarkInboxRead`.
5. Cập nhật component test tại `apps/web/src/routes/_auth/students/index.test.tsx` và `apps/student/test/notification-bell.test.tsx`.

## Tasks

- [x] Clean up `apps/web/src/routes/_auth/students/index.tsx`, `$studentId.tsx`, và `add-student-modal.tsx`
- [x] Clean up `apps/student/src/components/layout/notification-bell.tsx`
- [x] Update & pass `apps/web` và `apps/student` unit/component tests + `pnpm check-types`
