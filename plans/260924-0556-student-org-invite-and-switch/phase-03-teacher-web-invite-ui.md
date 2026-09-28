---
title: "Phase 3: Teacher Web App Invite UI"
status: completed
priority: P1
effort: 3h
---

# Phase 3: Teacher Web App Invite UI

## Context Links
- Trang học viên giáo viên: `apps/web/src/routes/_auth/students/index.tsx`
- Modal xếp lớp hiện có làm mẫu UX: `apps/web/src/components/modals/enroll-student-modal.tsx`
- Repository data store: `apps/web/src/lib/data-store.tsx`, `apps/web/src/lib/repos/use-students.ts`

## Overview
Phase 3 hiện thực hoá giao diện người dùng phía giáo viên trong `apps/web`:
1. Thêm nút "Mời học viên" (kèm icon `UserPlus`) tại trang Danh sách học viên (`/students`).
2. Xây dựng modal `InviteStudentModal` cho phép giáo viên nhập email học viên, gửi lời mời và nhận phản hồi tức thì qua Toast.
3. Bổ sung khu vực/tab "Lời mời đang chờ" (Pending Invitations) hiển thị danh sách các lời mời chưa được học viên chấp nhận, cho phép giáo viên kiểm tra thời gian gửi và chủ động thu hồi/huỷ lời mời khi cần.
4. Tích hợp hook và TanStack Query quản lý cache và tự động làm mới danh sách khi có thay đổi.

## Key Insights
- Nút "Thêm học viên" thủ công trước đây đã bị xoá ở PR #257 vì học viên được định hướng đăng ký tự do từ portal. Tuy nhiên, việc giáo viên chủ động gửi lời mời qua email giúp thiết lập sợi dây liên kết chính xác giữa giáo viên và học viên mà không phụ thuộc vào heuristic "tổ chức đầu tiên".
- Modal cần có phản hồi lỗi rõ ràng (Vietnamese error message):
  - "Email này đã là học viên trong tổ chức của bạn."
  - "Đã có lời mời đang chờ gửi tới email này."
  - "Email không đúng định dạng."
- Sau khi gửi lời mời thành công, học viên chưa xuất hiện ngay trong danh sách chính thức (vì chưa chấp nhận), mà sẽ nằm trong danh sách "Lời mời đang chờ". Khi học viên chấp nhận ở portal, học viên sẽ lập tức xuất hiện trong danh sách học viên chính thức.

## Requirements
- [ ] Component `InviteStudentModal` (`apps/web/src/components/modals/invite-student-modal.tsx`):
  - Modal chuẩn theo thiết kế hệ thống (dùng component `Modal`, `Field`, `Input`, `Button` hiện có).
  - Input email với validation trực tiếp.
  - Xử lý trạng thái loading khi đang gửi request.
  - Toast thông báo `toast.success("Đã gửi lời mời tới <email>")` hoặc `toast.error(...)`.
- [ ] Nút kích hoạt modal trên trang `apps/web/src/routes/_auth/students/index.tsx`:
  - Nút "+ Mời học viên" đặt tại góc trên bên phải trang `/students` cạnh tiêu đề hoặc thanh lọc.
- [ ] Quản lý danh sách lời mời đang chờ (`PendingInvitations`):
  - Hiển thị danh sách lời mời có status `pending`: Email, ngày gửi, nút "Thu hồi".
  - Bấm "Thu hồi" hiện xác nhận hoặc gọi huỷ trực tiếp kèm toast thông báo.
- [ ] Hook repository `apps/web/src/lib/repos/invitations.ts`:
  - `usePendingInvitations()`: Query `GET /api/students/invitations`.
  - Mutation `useInviteStudent()`: Gọi `POST /api/students/invite`.
  - Mutation `useCancelInvitation()`: Gọi `DELETE /api/students/invitations/:id`.
- [ ] Test component: `apps/web/src/components/modals/invite-student-modal.test.tsx`.

## Architecture & UI Wireframe

```
+-------------------------------------------------------------------------+
| Học viên                                            [+ Mời học viên]   |
| 4 học viên đang học · 1 lời mời đang chờ                                |
+-------------------------------------------------------------------------+
| [Tất cả] [Sắp hết buổi] [Nợ học phí] ...   | Tabs: [Học viên] [Lời mời] |
+-------------------------------------------------------------------------+
| TABLE HỌC VIÊN CHÍNH THỨC / HOẶC BẢNG LỜI MỜI ĐANG CHỜ                 |
| - alex@gmail.com | Đã gửi 2 ngày trước | [Thu hồi lời mời]             |
+-------------------------------------------------------------------------+
```

## Related Code Files
- **Modify:** `apps/web/src/routes/_auth/students/index.tsx`
- **Create:** `apps/web/src/components/modals/invite-student-modal.tsx`
- **Create:** `apps/web/src/components/students/pending-invitations-list.tsx`
- **Create:** `apps/web/src/lib/repos/invitations.ts`
- **Create:** `apps/web/src/components/modals/invite-student-modal.test.tsx`

## Implementation Steps
1. Tạo file `apps/web/src/lib/repos/invitations.ts`:
   - Định nghĩa hàm fetch `getPendingInvitations()`, `sendInvitation(email)`, `cancelInvitation(id)`.
   - Bọc các hàm bằng TanStack Query: `usePendingInvitations()`, `useInviteStudent()`, `useCancelInvitation()`.
   - Tự động invalidate query key `["students", "invitations"]` khi mutation thành công.
2. Xây dựng component `InviteStudentModal` trong `apps/web/src/components/modals/invite-student-modal.tsx`:
   - Props: `{ open: boolean, onOpenChange: (open: boolean) => void }`.
   - State `email`, state `isSubmitting`, `errorMessage`.
   - Form submit: Validate email -> gọi `inviteMutation.mutateAsync({ email })` -> toast success -> đóng modal và reset form.
   - Bắt lỗi HTTP 409 hoặc lỗi mạng để hiển thị thông báo thân thiện.
3. Xây dựng component `PendingInvitationsList` trong `apps/web/src/components/students/pending-invitations-list.tsx`:
   - Hiển thị danh sách card hoặc hàng bảng:
     - Avatar chữ cái đầu của email.
     - Email người nhận, thời gian gửi tương đối (e.g., "Hôm qua", "2 ngày trước").
     - Badge màu vàng cam "Đang chờ chấp nhận".
     - Nút "Huỷ lời mời" (ghost/destructive variant).
   - Empty state nếu không có lời mời nào đang chờ.
4. Tích hợp vào `apps/web/src/routes/_auth/students/index.tsx`:
   - Thêm nút `+ Mời học viên` (icon `UserPlus`) mở `InviteStudentModal`.
   - Thêm tab phụ hoặc chip toggle giữa "Danh sách học viên" và "Lời mời đang chờ ({count})".
   - Tự động cập nhật tiêu đề phụ: `${students.length} học viên đang học · ${pendingInvites.length} lời mời đang chờ`.
5. Viết unit test trong `apps/web/src/components/modals/invite-student-modal.test.tsx`:
   - Render modal khi `open={true}`.
   - Nhập email không hợp lệ -> chặn submit và báo lỗi.
   - Nhập email hợp lệ -> submit -> kiểm tra gọi đúng endpoint và toast thông báo.

## Todo List
- [ ] Tạo module `apps/web/src/lib/repos/invitations.ts`
- [ ] Tạo component `InviteStudentModal`
- [ ] Tạo component `PendingInvitationsList`
- [ ] Gắn nút mời và danh sách lời mời vào `students/index.tsx`
- [ ] Viết test component cho modal và kiểm tra giao diện

## Success Criteria
- [ ] Giáo viên có thể bấm "Mời học viên", nhập email và gửi thành công.
- [ ] Danh sách lời mời đang chờ hiển thị đúng các lời mời chưa được chấp nhận.
- [ ] Bấm huỷ lời mời lập tức loại bỏ lời mời khỏi danh sách.
- [ ] Component tests pass sạch không có cảnh báo (`pnpm --filter web test`).

## Risk Assessment
- **Rủi ro:** Giáo viên gửi nhầm email học viên.
- **Giảm thiểu:** Cung cấp sẵn nút "Thu hồi / Huỷ" để giáo viên có thể huỷ lời mời bất kỳ lúc nào trước khi học viên chấp nhận.

## Security Considerations
- Client không gửi bất kỳ dữ liệu nhạy cảm nào ngoài email học viên.
- Mọi request đều kèm credential Better-Auth của giáo viên, server xác thực quyền sở hữu tổ chức trước khi thực thi.
