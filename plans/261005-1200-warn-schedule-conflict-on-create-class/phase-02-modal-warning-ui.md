---
phase: 2
title: "Modal warning UI"
status: pending
---

# Phase 2 — Modal warning UI

## Files
- MODIFY `apps/web/src/components/modals/add-class-modal.tsx`
- MODIFY `apps/web/src/components/modals/add-class-modal.test.tsx`

## Steps
1. Trong `AddClassModal`: `const { classes } = useClasses();` và `useMemo(() => findScheduleConflicts({days, start: startTime, end: endTime, startDate, sessionsTotal: Number(total) || 0}, classes), [...])`.
2. Render ngay dưới khối lịch học (days chips + time pickers) một box warning (`role="status"`, `data-testid="schedule-conflict-warning"`, tông amber theo style cảnh báo hiện có của repo):
   - Tiêu đề: "Lịch bị trùng với lớp đang học"
   - Mỗi dòng: `<tên lớp> · <T2 & T4> · <start–end>` (dùng `dayNames` + format giờ hiện có).
3. Không đổi `submitBlocked`/handler submit — warning không chặn.
4. Đổi `startDate` hoặc `total` cũng phải re-compute (thêm vào deps của `useMemo`).

## Tests
- Store có lớp T2&T4 19:00–20:30 còn buổi (startDate quá khứ, sessionsTotal chưa xong); chọn T2 + 19:00 → warning hiện tên lớp; nút submit vẫn enabled.
- Đổi giờ sang 20:30 → warning biến mất.

## Verify
- `pnpm --filter web test add-class-modal`
- `pnpm check && pnpm check-types`
- Smoke: dev web :8001, mở /classes → Tạo lớp, chọn T2 19:00 → thấy warning.
