---
title: "Phase 4: Student Portal Bell & Org Switcher"
status: todo
priority: P1
effort: 4h
---

# Phase 4: Student Portal Bell & Org Switcher

## Context Links
- Layout chính của học viên: `apps/student/src/components/layout/student-shell.tsx`
- Menu tài khoản: `apps/student/src/components/layout/avatar-menu.tsx`
- Client API & repos: `apps/student/src/lib/repos/student.ts`
- Màn hình lỗi / empty state: `apps/student/src/components/overview/student-error-view.tsx`, `empty-state.tsx`

## Overview
Phase 4 triển khai các trải nghiệm quan trọng nhất phía học viên trong `apps/student`:
1. **Icon Chuông thông báo (`NotificationBell`):**
   - Đặt tại thanh điều hướng trên mobile và sidebar trên desktop.
   - Hiển thị badge số lượng lời mời đang chờ (`pending`).
   - Bấm vào mở popover hiển thị danh sách lời mời từ các giáo viên/tổ chức kèm 2 nút hành động: "Chấp nhận" và "Từ chối".
   - Khi bấm "Chấp nhận": Học viên tự động gia nhập tổ chức, hệ thống tự động đổi tổ chức hiện tại sang tổ chức mới và làm mới dữ liệu tổng quan.
2. **Bộ chuyển đổi tổ chức (`OrgSwitcher`):**
   - Đặt nổi bật bên dưới logo trung tâm ở thanh điều hướng.
   - Hiển thị tên tổ chức đang hoạt động. Bấm vào mở dropdown liệt kê toàn bộ các tổ chức mà học viên đã tham gia.
   - Chọn tổ chức khác sẽ lưu `active_student_org_id` và tự động làm mới giao diện bài tập/lớp học của tổ chức tương ứng mà không cần đăng nhập lại.
3. **Quản lý ngữ cảnh `x-student-org-id` trên Client:**
   - Client tự động đính kèm header `x-student-org-id` trong mọi request gọi lên `/api/student/*` (đọc từ `localStorage` hoặc state của TanStack Query).
4. **Màn hình chào mừng cho học viên chưa có tổ chức:**
   - Nếu học viên mới đăng ký tài khoản tự do và chưa thuộc bất kỳ tổ chức nào: Hiển thị hướng dẫn trực quan mời học viên bấm vào icon Chuông để xem lời mời từ giáo viên.

## Key Insights
- Trải nghiệm đa tổ chức (Multi-Org) cần phải cực kỳ liền mạch: học viên không bao giờ bị văng ra trang login hay thấy màn hình lỗi 403 `STUDENT_AMBIGUOUS` nữa.
- Lưu trữ tổ chức active:
  - Sử dụng `localStorage.getItem("active_student_org_id")`.
  - Khởi tạo lần đầu: Nếu chưa có trong `localStorage`, client gọi `GET /api/student/orgs`, lấy org đầu tiên (`isCurrent = true`) và lưu vào `localStorage`.
  - Khi học viên bấm Chấp nhận một lời mời mới: Tự động chuyển `active_student_org_id` sang ID của tổ chức vừa chấp nhận để học viên thấy ngay kết quả.
- Icon Chuông thông báo hỗ trợ auto-refresh (polling nhẹ hoặc refetch on window focus) để khi giáo viên vừa bấm mời ở web app, học viên mở portal sẽ thấy ngay số đỏ thông báo.

## Requirements
- [ ] Component `NotificationBell` (`apps/student/src/components/layout/notification-bell.tsx`):
  - Icon `Bell` từ `lucide-react`.
  - Huy hiệu badge đỏ hiển thị số đếm (chỉ hiện khi count > 0).
  - Popover dropdown với thiết kế ấm áp, đồng bộ thiết kế chung của hệ thống.
  - Mỗi mục thông báo gồm:
    - Tiêu đề: "Giáo viên **[Tên GV]** đã mời bạn tham gia **[Tên Org]**".
    - Thời gian tương đối (relative date, ví dụ: "Vừa xong", "15 phút trước").
    - Nút "Chấp nhận" (Primary, màu xanh/thương hiệu) và "Từ chối" (Ghost/Muted).
    - Trạng thái loading khi đang xử lý action.
  - Empty state khi không có thông báo: "Không có thông báo mới".
- [ ] Component `OrgSwitcher` (`apps/student/src/components/layout/org-switcher.tsx`):
  - Menu Dropdown đặt dưới logo trên sidebar desktop và trên header mobile.
  - Hiển thị tên Org đang active kèm icon `ChevronsUpDown`.
  - Danh sách các Org đã tham gia (`useStudentOrgs()`), có icon check ở Org hiện tại.
  - Bấm chọn Org khác: Cập nhật active org, kích hoạt refetch toàn bộ query keys `["student"]`.
- [ ] Tích hợp Header client:
  - Cập nhật hàm fetcher trong `apps/student/src/lib/repos/student.ts` tự động chèn header `x-student-org-id` từ `localStorage`.
- [ ] Cập nhật `StudentShell` (`apps/student/src/components/layout/student-shell.tsx`):
  - Nhúng `NotificationBell` vào cả mobile header và desktop sidebar.
  - Nhúng `OrgSwitcher` vào vị trí trung tâm.
- [ ] Empty State chào mừng:
  - Cập nhật `empty-state.tsx` hoặc `student-error-view.tsx` để xử lý trường hợp tài khoản đã verify nhưng chưa tham gia org nào (mở chuông để nhận lớp).
- [ ] Test component:
  - `apps/student/test/notification-bell.test.tsx`
  - `apps/student/test/org-switcher.test.tsx`

## Architecture & UI Layout

```
DESKTOP SIDEBAR:
+------------------------------------+
| [Logo] Teacher OS · Học viên       |
|                                    |
| [Tổ chức: IELTS Thầy Vinh v]  <-- OrgSwitcher
|                                    |
| - Tổng quan                        |
| - Lớp học                          |
| - Bài tập                          |
|                                    |
|------------------------------------|
| [Chuông (1)] Thông báo        <-- NotificationBell
| [Avatar] Nguyễn Văn A              |
+------------------------------------+

NOTIFICATION POPOVER:
+---------------------------------------------------+
| Thông báo                                         |
|---------------------------------------------------|
| [Org Icon] Lời mời tham gia lớp học               |
| Giáo viên Vinh Trần mời bạn vào tổ chức           |
| "IELTS Foundation" · 5 phút trước                 |
|                                                   |
| [ Chấp nhận ]          [ Từ chối ]                |
+---------------------------------------------------+
```

## Related Code Files
- **Modify:** `apps/student/src/components/layout/student-shell.tsx`
- **Modify:** `apps/student/src/lib/repos/student.ts`
- **Modify:** `apps/student/src/components/overview/student-error-view.tsx`
- **Create:** `apps/student/src/components/layout/notification-bell.tsx`
- **Create:** `apps/student/src/components/layout/org-switcher.tsx`
- **Create:** `apps/student/test/notification-bell.test.tsx`
- **Create:** `apps/student/test/org-switcher.test.tsx`

## Implementation Steps
1. Sửa `apps/student/src/lib/repos/student.ts`:
   - Định nghĩa các hooks:
     - `useStudentNotifications()`: Query `GET /api/student/notifications`.
     - `useAcceptInvitation()`: Mutation `POST /api/student/invitations/:id/accept`.
     - `useRejectInvitation()`: Mutation `POST /api/student/invitations/:id/reject`.
     - `useStudentOrgs()`: Query `GET /api/student/orgs`.
   - Cập nhật `fetchStudentApi()` (hoặc helper gọi API student): đọc `activeOrgId = localStorage.getItem("active_student_org_id")`, nếu có thì đính kèm `headers["x-student-org-id"] = activeOrgId`.
2. Xây dựng component `NotificationBell` (`apps/student/src/components/layout/notification-bell.tsx`):
   - Sử dụng hook `useStudentNotifications()` lấy danh sách.
   - Render icon `Bell` với badge số lượng màu đỏ (absolute top-right dot hoặc số).
   - Render Popover/Dropdown khi bấm:
     - Hiển thị danh sách card lời mời.
     - Khi bấm "Chấp nhận":
       - Gọi `acceptMutation.mutateAsync(invitationId)`.
       - Nhận response `{ ok: true, orgId }` -> lưu `orgId` vào `localStorage.setItem("active_student_org_id", orgId)`.
       - Toast: "Đã gia nhập tổ chức!".
       - Invalidate queries: `["student"]`.
     - Khi bấm "Từ chối":
       - Gọi `rejectMutation.mutateAsync(invitationId)`.
       - Invalidate notifications query.
3. Xây dựng component `OrgSwitcher` (`apps/student/src/components/layout/org-switcher.tsx`):
   - Sử dụng hook `useStudentOrgs()` lấy danh sách các org đã tham gia.
   - Lấy org hiện tại (khớp với `active_student_org_id` hoặc org có `isCurrent: true`).
   - Nếu học viên chỉ có 1 org: Hiển thị tên Org (không cần mở dropdown hoặc dropdown chỉ có 1 item).
   - Nếu học viên có >= 2 orgs: Hiển thị tên Org kèm mũi tên xuống. Bấm vào mở danh sách, bấm chọn org mới -> `localStorage.setItem("active_student_org_id", selectedOrgId)` -> invalidate queries `["student"]`.
4. Cập nhật `apps/student/src/components/layout/student-shell.tsx`:
   - Chèn `OrgSwitcher` vào đầu sidebar desktop (dưới logo) và trên header mobile.
   - Chèn `NotificationBell` vào cạnh `AvatarMenu` ở cả mobile header và bottom sidebar desktop.
5. Cập nhật màn hình chào mừng / empty state:
   - Nếu API trả lỗi hoặc không có org (`orgs.length === 0`):
     - Hiển thị màn hình onboarding thân thiện:
       "Chào mừng bạn đến với TeacherOS! Hiện tại bạn chưa tham gia lớp học của giáo viên nào. Vui lòng bấm vào biểu tượng Chuông thông báo ở góc trên để chấp nhận lời mời từ giáo viên của bạn."
6. Viết tests:
   - `notification-bell.test.tsx`: Test render badge khi có lời mời, click mở danh sách, test tương tác bấm chấp nhận và từ chối.
   - `org-switcher.test.tsx`: Test hiển thị đúng danh sách tổ chức, click đổi tổ chức cập nhật đúng `localStorage` và trigger refetch.

## Todo List
- [ ] Thêm các query hooks và cấu hình header `x-student-org-id` trong `lib/repos/student.ts`
- [ ] Xây dựng component `NotificationBell` kèm popover tương tác
- [ ] Xây dựng component `OrgSwitcher` chuyển đổi tổ chức linh hoạt
- [ ] Tích hợp cả hai component vào `StudentShell`
- [ ] Xử lý màn hình onboarding chào mừng khi chưa có org
- [ ] Viết unit tests cho `NotificationBell` và `OrgSwitcher`

## Success Criteria
- [ ] Icon chuông hiển thị badge đỏ chính xác số lượng lời mời đang chờ.
- [ ] Bấm chấp nhận lời mời lập tức đưa học viên vào tổ chức và hiển thị dữ liệu lớp học của giáo viên đó.
- [ ] Học viên tham gia 2 tổ chức có thể chuyển đổi qua lại mượt mà qua OrgSwitcher.
- [ ] Không xuất hiện bất kỳ lỗi 403 `STUDENT_AMBIGUOUS` nào.

## Risk Assessment
- **Rủi ro:** Khi chuyển đổi org, dữ liệu bài tập hoặc lớp học của org cũ có thể bị flash (hiển thị thoáng qua) trước khi dữ liệu org mới tải xong.
- **Giảm thiểu:** Reset state query hoặc sử dụng TanStack Query transition/loading placeholder khi `activeOrgId` thay đổi.

## Security Considerations
- Header `x-student-org-id` được server kiểm tra nghiêm ngặt: Server chỉ chấp nhận `orgId` nếu email của học viên thực sự có record `student` hợp lệ trong `orgId` đó (không thể giả mạo header để xem trộm dữ liệu tổ chức khác).
