---
phase: 4
title: "Đưa attendance vào kernel snapshot và đồng bộ các màn đang đọc lesson.status"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 4: Đồng bộ các reader hiện có

## Goal

Sau khi màn điểm danh ngày bắt đầu ghi `absent` và `attendance`, các màn khác (lịch tuần, trang lớp, cảnh báo rủi ro dashboard, số buổi gói học phí) hiển thị nhất quán và không hiểu sai dữ liệu mới.

## Files to Create / Modify

- Modify: `apps/server/src/routes/snapshot.ts` (khoảng dòng 438). Thêm `attendance`, `attendanceNote` vào row lesson của snapshot.
- Modify: `apps/web/src/lib/mock-data.ts` (`Lesson`) và `apps/web/src/lib/repos/lessons.ts` (`mapLessons`). Mang 2 field mới; giá trị lạ coerce về `null`.
- Modify: `apps/web/src/lib/dashboard-from-kernel.ts`.
  - Lý do rủi ro `absent` tính cả `status === "absent"` lẫn `attendance === "unexcused"` (dòng này `completed` theo D2 nhưng học viên vẫn vắng).
  - Gỡ comment "`absent` has no kernel write path yet" (dòng 110) vì giờ đã có.
- Modify: `apps/web/src/components/schedule/class-session-modal.tsx`. Hiện nhãn trạng thái chi tiết ("Đi muộn", "Vắng không phép"…) khi `attendance` có giá trị, giữ nguyên hành vi cũ khi `NULL`.
- Kiểm (không chắc phải sửa): `apps/web/src/lib/class-sessions.ts`, `apps/web/src/lib/schedule-week.ts`, `apps/web/src/components/class-detail/class-sessions-section.tsx`. Chúng đã coi `absent` là trạng thái đã xử lý trên dòng có ngày. Chỉ sửa nếu test mới cho thấy sai.

## Tasks & Steps

1. Test đỏ ở `dashboard-from-kernel.test.ts`: học viên có dòng `completed` + `unexcused` hôm qua được gắn lý do `absent`.
2. Test đỏ ở `schedule-week` / `class-sessions`: ca có dòng `absent` + dòng `completed` được coi là đã điểm danh (không còn hiện nút "Điểm danh").
3. Test ở server `kernel.test.ts`: snapshot chứa `attendance` và `attendanceNote`; `pkg.done` của enrollment không tăng sau khi lưu `excused`, tăng 1 sau khi lưu `unexcused`.
4. Sửa code cho test xanh. Cập nhật fixture snapshot bị ảnh hưởng.

## Verification

- `pnpm --filter web test -- dashboard-from-kernel class-sessions schedule-week class-session-modal`
- `pnpm --filter server test -- kernel snapshot`
- `pnpm check-types`
- `pnpm check`

## Rủi ro

- Kiểu `status: … | string` ở `KernelLessonRow` cho phép giá trị lạ lọt qua. Mọi so sánh mới dùng hằng enum từ `packages/api`, không viết chuỗi rời.
