---
phase: 2
title: "Route khung /attendance + mục sidebar"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 2: Route khung `/attendance`

## Goal

Đích điều hướng `[2] daily-attendance` tồn tại với hợp đồng search param ổn định (`date`, `status`). TOS-7 sẽ dựng nội dung lên route này mà không đổi URL.

## Files to Create / Modify

- Create: `apps/web/src/routes/_auth/attendance.tsx`.
  - `validateSearch`: `date` hợp lệ dạng `YYYY-MM-DD`, nếu không thì mặc định `vietnamTodayISO()`; `status` thuộc `"all" | "pending" | "completed"`, mặc định `"all"`.
  - `validateSearch` không throw và không redirect, theo mẫu `tuition/index.tsx`.
- Create: `apps/web/src/routes/_auth/attendance.test.tsx`. Test cho parse search hợp lệ / sai định dạng / thiếu.
- Modify: `apps/web/src/components/layout/sidebar.tsx` (+ `sidebar.test.tsx`). Thêm mục "Điểm danh ngày" ngay dưới "Bảng điều khiển", theo wireframe.
- `apps/web/src/routeTree.gen.ts` được TanStack Router tự sinh lại, không sửa tay.

## Tasks & Steps

1. Test đỏ cho hàm `validateAttendanceSearch` (export riêng để test thuần).
2. Viết route: `PageHead` tiêu đề "Điểm danh tổng theo ngày", kicker là ngày đang chọn. Phần thân là empty state trung tính "Danh sách ca học trong ngày sẽ hiển thị tại đây." Không có nút hay dữ liệu giả.
3. Thêm mục sidebar và cập nhật test sidebar.
4. Đọc `DESIGN.md` và kiểm token. Không hard-code màu.

## Verification

- `pnpm --filter web test -- attendance sidebar`
- `pnpm check-types`
- `pnpm check`

## Ghi chú bàn giao cho TOS-7

Hợp đồng URL `?date=YYYY-MM-DD&status=all|pending|completed` đã chốt ở phase này. TOS-7 được thêm `q` và `teacher` nhưng không đổi nghĩa 2 param trên.
