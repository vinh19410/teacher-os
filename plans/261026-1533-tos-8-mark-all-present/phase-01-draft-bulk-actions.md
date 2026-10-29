---
phase: 1
title: "markAllPresent() trong reducer nháp điểm danh"
status: pending
priority: P2
effort: "1.5h"
dependencies: ["TOS-7 phase 3"]
---

# Phase 1: Thao tác hàng loạt trong reducer nháp

> **Cập nhật 2026-10-26 (red-team #1, #2):** action `{ type: "markAllPresent" }` đã tồn tại sẵn trong code TOS-7 (`attendance-draft.ts:25,122-133`) — phase này là **pin test cho action đã có + sửa case + thêm pure helper**, không phải "thêm action mới". Tên hàm thật là `missingAttendanceLessonIds()` (không có `missing()`).

## Goal

Chốt hành vi của thao tác điền hàng loạt bằng test, và sửa hai điểm lệch giữa code thật và thiết kế: (1) case luôn tạo state mới kể cả khi không có dòng nào đổi, (2) thiếu helper thuần để confirm modal tính entries mà không phụ thuộc vòng render (cấm dispatch-then-read).

## Files to Create / Modify

- Modify: `apps/web/src/lib/attendance-draft.ts`:
  - Export pure helper `markAllPresentState(state: AttendanceDraftState): AttendanceDraftState` — với mỗi lessonId trong `order` có `attendance === null` thì đặt `present`; không đổi dòng đã có trạng thái, không đổi `note`; **trả về đúng tham chiếu `state` nếu không có dòng nào đổi**.
  - Case `markAllPresent` của `attendanceDraftReducer` gọi lại helper này (sửa thành early-return cùng tham chiếu — đây là Modify hành vi đã landed của TOS-7, có test hồng trước khi đổi).
- Modify: `apps/web/src/lib/attendance-draft.test.ts`.

## Tasks & Steps

1. Test cho action + helper (đỏ trước khi sửa case):
   - Nháp 4 học viên, 1 người đã chọn `excused`: sau `markAllPresent` có 3 `present`, người kia vẫn `excused`.
   - Ghi chú đã nhập không bị xoá.
   - `missingAttendanceLessonIds` trả mảng rỗng sau action.
   - Gọi trên nháp đã đủ trạng thái (và trên nháp rỗng) trả về **đúng tham chiếu cũ**.
   - `markAllPresentState(draft)` deep-equal kết quả `attendanceDraftReducer(draft, { type: "markAllPresent" })`.
2. Viết helper + sửa case reducer cho test xanh (reducer ủy quyền helper, không nhân bản logic).

## Verification

- `pnpm --filter web test -- attendance-draft`
- `pnpm check-types`
