---
title: "Fix Student Portal Notification and Profile UI"
date: "2026-09-24"
author: "Assistant"
tags: ["student-portal", "ui", "notification", "avatar-menu", "layout", "cors"]
---

# Fix Student Portal Notification and Profile UI

## Symptom
Trong giao diện cổng học viên (`apps/student`), popover thông báo (`NotificationBell`) và menu hồ sơ (`AvatarMenu`) khi mở trên desktop sidebar bị tràn màn hình (overflow):
- Popover thông báo bị tràn ra ngoài mép trái trình duyệt (bị cắt mất ~80px phần đầu nội dung do đặt `right-0` bên trong thanh sidebar rộng 256px với chiều rộng popover 320px).
- Popover bị tràn xuống mép dưới màn hình (do đặt `mt-2` ở chân sidebar `100vh`).
- Phần hồ sơ học viên ở chân sidebar bị ép sát icon chuông (`justify-between`), không hiển thị email học viên và thiếu cấu trúc card rõ ràng.
- Khi student portal (`http://localhost:8003`) gửi request API lên server (`http://localhost:8000`), trình duyệt báo lỗi CORS do header `x-student-org-id` không được chấp nhận trong preflight response.


## Root Cause
1. `NotificationBell`: Cấu hình vị trí `absolute right-0 mt-2` gắn với button chuông ở góc dưới bên phải thanh sidebar dẫn tới popover mở lệch sang trái ra ngoài viewport và trôi xuống dưới đáy màn hình.
2. `AvatarMenu`: Cấu hình vị trí `absolute right-0 mt-2` tương tự, khiến menu mở xuống dưới mép màn hình và bị cắt cạnh trái. Đồng thời giao diện trigger chỉ hiển thị avatar tròn và tên, không có email.
3. `StudentShell`: Footer sidebar desktop gom cả AvatarMenu và NotificationBell vào chung 1 hàng `flex items-center justify-between` thay vì phân lớp rõ ràng theo đúng thiết kế Phase 4 (chuông thông báo thành hàng riêng phía trên hồ sơ học viên).
4. `CORS Middleware`: Cấu hình `allowHeaders` trong `apps/server/src/app.ts` chỉ có `["Content-Type", "Authorization"]`, thiếu header tùy chỉnh `x-student-org-id` mà `apps/student` gửi kèm trong các request API. Trình duyệt gửi preflight `OPTIONS` với `Access-Control-Request-Headers: x-student-org-id`, server không trả `x-student-org-id` trong `Access-Control-Allow-Headers` nên trình duyệt chặn request.


## Solution
1. **`NotificationBell`**:
   - Bổ sung prop `variant?: "sidebar" | "compact"` (mặc định `"compact"` cho mobile).
   - Với `variant="sidebar"`: Render thành một hàng đầy đủ chiều rộng sidebar gồm icon chuông, nhãn "Thông báo" và huy hiệu số lượng lời mời đang chờ (`pending`).
   - Cập nhật vị trí popover trên desktop sang dạng flyout panel neo cố định bên phải sidebar (`fixed bottom-5 left-[268px] w-[360px]`), loại bỏ hoàn toàn hiện tượng tràn mép trái và mép dưới.
   - Bổ sung phím tắt `Escape` để đóng popover dễ dàng và icon trực quan cho card lời mời.
2. **`AvatarMenu`**:
   - Bổ sung prop `variant?: "sidebar" | "compact"` (mặc định `"compact"` cho mobile).
   - Với `variant="sidebar"`: Render card hồ sơ đầy đủ gồm avatar chữ cái đầu, họ tên học viên, email và icon điều hướng `ChevronsUpDown`.
   - Cập nhật vị trí menu trên desktop mở ngược lên trên (`absolute bottom-full left-0 mb-2 w-full`), hiển thị thông tin học viên, chip role "Học viên" và nút "Đăng xuất".
   - Bổ sung phím tắt `Escape` để đóng menu.
3. **`StudentShell`**:
   - Mobile header: Giữ `NotificationBell` và `AvatarMenu` ở chế độ `variant="compact"`.
   - Desktop sidebar: Tách footer thành 2 hàng tinh gọn theo chiều dọc (`border-line-soft border-t pt-3 space-y-1`), lần lượt là `NotificationBell variant="sidebar"` và `AvatarMenu variant="sidebar"`.

4. **`CORS Middleware` (`apps/server/src/app.ts`)**:
   - Thêm `"x-student-org-id"` vào danh sách `allowHeaders` của `cors()` middleware.
   - Cập nhật test preflight trong `apps/server/src/student.test.ts` để kiểm chứng header này luôn được server cho phép.

## Verification
- Unit tests: `pnpm --filter student test` chạy thành công toàn bộ 6 test suites (39 tests passed).
- Type check & build: `pnpm --filter student check-types` (`vite build && tsc --noEmit`) đạt 100% không lỗi.
- Đảm bảo tương thích hoàn toàn với các E2E test contracts (`aria-label="Thông báo"`, `data-testid="notification-badge"`, `mời bạn tham gia tổ chức`, `Chấp nhận`).
- Server tests: `pnpm --filter server test` chạy thành công toàn bộ 21 test suites (322 tests passed).
- Live preflight verification: Curl kiểm tra preflight `OPTIONS http://localhost:8000/api/student/me` với `Access-Control-Request-Headers: x-student-org-id` trả về `204 No Content` và `Access-Control-Allow-Headers: Content-Type,Authorization,x-student-org-id`.
