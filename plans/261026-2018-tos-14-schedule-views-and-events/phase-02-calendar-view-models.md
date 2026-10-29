---
phase: 2
title: "View-model thuần cho view Tháng/Ngày, màu lớp, URL"
status: completed
priority: P1
effort: "4h"
dependencies: []
---

# Phase 2: View-model thuần

Toán ngày theo quy ước `week-grid.ts` (chuỗi `yyyy-mm-dd` neo UTC).

## Files to Create / Modify

- Modify: `apps/web/src/lib/week-grid.ts` — `startOfMonth`, `addMonths`, `monthGridDates(iso)` (42 ngày từ Thứ Hai), `addDays`, `formatMonthLabel`, `formatDayLabel`.
- Create: `apps/web/src/lib/schedule-view.ts` — `parseScheduleSearch(raw)` → `{view, date}` (D1, đọc cả `?week=` cũ, trả cờ cần scrub); `shiftAnchor(view, date, ±1)`.
- Create: `apps/web/src/lib/schedule-month.ts` — `buildMonthCells(data, anchor)`: mỗi ô `{date, inMonth, isToday, items[], overflow}`; item là ca học (gom theo lớp như `schedule-week.ts`, bỏ buổi `cancelled` khỏi đếm) hoặc sự kiện, `kind: "lesson" | "event"` (kỳ nghỉ ghép ở follow-up, không định nghĩa type ở đây). Tái dùng `selectWeekColumnSessions`/`resolveWeekColumnEntries`/`selectProjectedWeekBlocks` thay vì viết lại.
- Create: `apps/web/src/lib/schedule-day.ts` — `buildDayAgenda(data, date)` sắp theo giờ.
- Create: `apps/web/src/lib/class-color.ts` — `classColorIndex(classId)` hash ổn định → 1..8 (D2).
- Tests: `week-grid.test.ts` (bổ sung), `schedule-view.test.ts`, `schedule-month.test.ts`, `schedule-day.test.ts`, `class-color.test.ts`.

## Tasks & Steps

1. Test đỏ:
   - `monthGridDates("2026-11-15")` bắt đầu 2026-10-26 (Thứ Hai), 42 ngày.
   - `parseScheduleSearch({week:"2026-10-26"})` → `{view:"week", date:"2026-10-26", scrub:true}`; `view` rác → mặc định + scrub.
   - Ô tháng: lớp có 4 ca + 1 sự kiện → 3 item + `overflow = 2`; lớp lịch legacy (không `date`) hiện theo thứ như view tuần.
   - Day agenda gồm ca học và sự kiện, theo giờ tăng dần.
   - `classColorIndex` ổn định giữa các lần gọi, phân bố đều trên 1..8 với 100 id ngẫu nhiên cố định seed.
   - 50 lớp × 24 buổi: `buildMonthCells` < 50ms (ngưỡng đơn vị, phục vụ D6).
2. Code cho xanh.

## Verification

- `pnpm --filter web test -- week-grid schedule-view schedule-month schedule-day class-color`
- `pnpm check-types`
