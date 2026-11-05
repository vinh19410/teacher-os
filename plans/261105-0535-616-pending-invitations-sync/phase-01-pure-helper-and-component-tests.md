---
title: "Phase 1: Helper kiểm tra và nâng cấp PendingInvitationsList"
status: completed
---

# Phase 1: Helper kiểm tra và nâng cấp PendingInvitationsList

## Overview
Xây dựng hàm kiểm tra thuần `isPendingPortalStudent` để gom logic xác định học viên chưa liên kết cổng vào một chỗ, và nâng cấp `PendingInvitationsList` để hiển thị học viên chưa liên kết cổng bên cạnh các lời mời tổ chức.

## Files to Create / Modify
- Modify: `apps/web/src/lib/repos/students.ts` (export `isPendingPortalStudent`)
- Modify: `apps/web/src/lib/repos/students.test.ts` (unit tests cho `isPendingPortalStudent`)
- Modify: `apps/web/src/components/students/pending-invitations-list.tsx` (nhận prop `pendingStudents`, render hàng học viên, sửa loading/error/empty state)
- Modify: `apps/web/src/components/students/pending-invitations-list.test.tsx` (test cases cho prop `pendingStudents`)

## Tasks & Steps

### Task 1.1 — Export hàm thuần `isPendingPortalStudent` và unit test
- **Goal:** Có hàm kiểm tra chuẩn `isPendingPortalStudent` với 100% test coverage cho các trường hợp edge case.
- **Target files and symbols:**
  - `apps/web/src/lib/repos/students.ts` (`isPendingPortalStudent`)
  - `apps/web/src/lib/repos/students.test.ts`
- **Steps:**
  1. Trong `apps/web/src/lib/repos/students.ts`, export hàm:
     ```ts
     export function isPendingPortalStudent(student: {
       email?: string | null;
       portalLinked?: boolean;
     }): boolean {
       return Boolean(student.email?.trim()) && student.portalLinked === false;
     }
     ```
  2. Trong `apps/web/src/lib/repos/students.test.ts`, viết test suite kiểm tra:
     - Trả về `true` khi `email` hợp lệ và `portalLinked === false`.
     - Trả về `false` khi `email` rỗng / whitespace kể cả khi `portalLinked === false`.
     - Trả về `false` khi `portalLinked === true`.
     - Trả về `false` khi `portalLinked === undefined` (deploy skew safety).
- **Success criteria:** Tất cả các test trong `students.test.ts` đều vượt qua.
- **Verify:** `pnpm --filter web exec vitest run src/lib/repos/students.test.ts` thoát mã 0.

### Task 1.2 — Viết test Đỏ (`jsdom`) cho `PendingInvitationsList` với `pendingStudents`
- **Goal:** Xác lập kỳ vọng hiển thị cho `PendingInvitationsList` khi nhận prop `pendingStudents`.
- **Target files and symbols:**
  - `apps/web/src/components/students/pending-invitations-list.test.tsx`
- **Steps:**
  1. Bổ sung mock cho `useResendStudentInvite` trong test.
  2. Viết test case:
     - Render danh sách học viên từ `pendingStudents`: hiển thị tên/email, badge "Chờ xác nhận", nút "Gửi lại lời mời".
     - Bấm nút "Gửi lại lời mời" trên hàng học viên kích hoạt `useResendStudentInvite().mutateAsync`.
     - Không hiển thị nút "Thu hồi" cho hàng học viên.
     - Khi `pendingStudents` có dữ liệu, kể cả khi `usePendingInvitations` đang `isLoading` hoặc `isError`, các hàng học viên vẫn phải được render (không return early làm biến mất học viên).
     - Khi cả `pendingStudents` và `invitations` đều có dữ liệu với cùng email (khác case chữ hoa/thường), email đó chỉ xuất hiện một lần (ưu tiên hàng học viên).
     - Empty state chỉ hiển thị khi tổng số lượng là 0.
- **Success criteria:** Test chạy thất bại do `PendingInvitationsList` chưa nhận prop hoặc chưa xử lý.
- **Verify:** `pnpm --filter web exec vitest run src/components/students/pending-invitations-list.test.tsx` thoát mã khác 0 với lỗi assertion.

### Task 1.3 — Nâng cấp `PendingInvitationsList` để render hợp nhất
- **Goal:** Component hiển thị trung thực cả học viên chờ xác nhận và lời mời tổ chức.
- **Target files and symbols:**
  - `apps/web/src/components/students/pending-invitations-list.tsx`
- **Steps:**
  1. Mở rộng `PendingInvitationsListProps`:
     ```ts
     export interface PendingInvitationsListProps {
       onInviteClick?: () => void;
       pendingStudents?: Array<{
         id: string;
         name: string;
         email: string;
       }>;
     }
     ```
  2. Chuẩn hóa deduplication theo email:
     ```ts
     const pendingStudentEmails = new Set(
       (pendingStudents ?? [])
         .map((s) => s.email?.trim().toLowerCase())
         .filter(Boolean),
     );
     const filteredInvites = (invitations ?? []).filter(
       (inv) =>
         inv.status === "pending" &&
         !pendingStudentEmails.has(inv.email.trim().toLowerCase()),
     );
     const totalCount = (pendingStudents?.length ?? 0) + filteredInvites.length;
     ```
  3. Cập nhật guard loading / error:
     - Nếu `isLoading && (pendingStudents?.length ?? 0) === 0`: render màn hình loading.
     - Nếu `error && (pendingStudents?.length ?? 0) === 0`: render màn hình error.
  4. Cập nhật guard empty state:
     - Chỉ render empty state khi `totalCount === 0`.
  5. Render danh sách:
     - Duyệt `pendingStudents`: mỗi hàng là `<li>` có tên học viên, email, `<Badge variant="warn" dot>Chờ xác nhận</Badge>`, `<ResendInviteButton target={{ kind: "student", studentId: s.id, recipientLabel: s.email }} compact />`.
     - Duyệt `filteredInvites`: mỗi hàng là `<li>` có email, ngày gửi, `<Badge variant="warn" dot>Đang chờ chấp nhận</Badge>`, `<ResendInviteButton target={{ kind: "invitation", invitationId: inv.id, email: inv.email }} compact />`, và nút "Thu hồi".
- **Success criteria:** Toàn bộ test trong `pending-invitations-list.test.tsx` chuyển sang xanh.
- **Verify:** `pnpm --filter web exec vitest run src/components/students/pending-invitations-list.test.tsx` thoát mã 0.

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
