---
phase: 2
title: "API apply Hủy buổi, DELETE kỳ nghỉ (Hoàn tác), kích hoạt enrollment"
status: pending
priority: P1
effort: "5h"
dependencies: ["phase-01"]
---

# Phase 2: Route server

## Files to Modify

- `apps/server/src/routes/holidays.ts` — nhánh apply `cancel`; `DELETE /:id`.
- `apps/server/src/routes/holidays.test.ts`
- `apps/server/src/routes/enrollment-activation.ts` — D7.
- `apps/server/src/lesson-date-integration.test.ts`
- `apps/server/src/routes/snapshot.ts` + kiểu snapshot ở `contracts.ts` — thêm `holidayCancels` (`holidayId`, `classId`, `date`); `holidays` thêm `mode`.

## Luồng

**Apply `mode = "cancel"`** — một `db.batch`: insert `organization_holiday` (+ class); mỗi cancellation `UPDATE lesson SET status='cancelled' WHERE orgId=? AND classId=? AND date=? AND status='upcoming'` + insert `holiday_session_cancel`; `notif` "Lịch nghỉ «X»: hủy N buổi của M lớp". Guard số dòng → 409 `stale-preview`. `cancellations` rỗng → 422 `no-sessions`.

**`DELETE /api/holidays/:id`**:
1. Kỳ nghỉ không thuộc org → 404 `holiday`.
2. `fromDate <= todayISOVietnam()` → 422 `holiday-started` (D3).
3. Đọc shifts + cancels của kỳ nghỉ. Với mỗi shift, đọc lesson tại `(classId, makeupDate)`: có dòng khác `upcoming` → 409 `makeup-touched` + danh sách `{classId, makeupDate}` (D4).
4. Batch (D5): khôi phục buổi gốc / buổi hủy, xóa buổi bù, xóa kỳ nghỉ, `notif`. Guard số dòng → 409.

## Tasks & Steps

1. Test đỏ:
   - Apply cancel: buổi trùng thành `cancelled`, không có lesson mới, `max(date)` của lớp không đổi; có dòng `holiday_session_cancel`; `notif`.
   - Delete kỳ nghỉ shift: buổi gốc `upcoming`, buổi bù bị xóa, các bảng con trống; đếm buổi không-`holiday` theo enrollment bằng trước khi tạo kỳ nghỉ.
   - Delete kỳ nghỉ cancel: chỉ buổi trong `holiday_session_cancel` được khôi phục; buổi GV hủy tay cùng ngày ở lớp khác giữ `cancelled`.
   - Kỳ nghỉ `fromDate = hôm nay` → 422; buổi bù có dòng `completed` → 409, DB không đổi; org khác → 404.
   - Kích hoạt học viên sau kỳ nghỉ cancel → dòng ở ngày hủy là `cancelled`.
   - Snapshot trả `holidayCancels` và `holidays[].mode`.
2. Viết code cho xanh.

## Verification

- `pnpm --filter server test -- holidays lesson-date-integration kernel-occurrence`
- `pnpm check`, `pnpm check-types`
