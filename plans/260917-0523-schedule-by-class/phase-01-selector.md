---
title: "Phase 1: Session selector thuần + unit tests"
status: pending
priority: P1
effort: 2h
dependencies: []
---

# Phase 1: Session selector thuần + unit tests

## Context Links

- Code liên quan: `apps/web/src/lib/schedule-week.ts`, `apps/web/src/lib/class-sessions.ts` (tham khảo pattern `(classId, date)`), `apps/web/src/lib/mock-data.ts` (type `Lesson`)
- Plan cũ liên quan: `plans/260821-1845-schedule-ui-real-weekly-sessions-and-nav/` (nguồn ngữ nghĩa tuần QC #121)

## Overview

- **Priority**: P1
- **Status**: pending
- Thêm selector thuần gom lesson rows thành block buổi **theo lớp** cho lưới tuần `/schedule`, thay cho `selectWeekColumnLessons` (mỗi enrollment một entry). Pure functions, không React — unit-test được như các selector hiện tại (convention QC #121).

## Key Insights

- `lesson` đã mang `classId` (NOT NULL) + `enrollmentId`; nhiều enrollment cùng lớp sinh nhiều row cùng `(classId, date)` — gom là thuần client-side, không đụng DB/API.
- Occurrence identity đã chuẩn hóa (#98): rows share `(classId, date)` = 1 buổi vật lý. `date: null` là legacy/divergent → giữ hành vi template tuần, gom theo `(classId, day, time)`.
- `weekSlotCount` hiện đã dedupe theo `day|time` nên header "N buổi" giữ nguyên ngữ nghĩa, nhưng cần đổi input sang session entries để bỏ slot của session đã hủy toàn bộ.

## Requirements

- [x] `selectWeekColumnSessions(lessons, day, dates): WeekSessionEntry[]` — lọc cột thứ `day` đúng ngữ nghĩa tuần hiện tại (dated: `dates.includes(l.date)`; undated: theo weekday), rồi gom nhóm
- [x] Grouping: dated rows theo key `d:{classId}:{date}`; undated legacy rows theo `l:{classId}:{day}:{time}`
- [x] `WeekSessionEntry`: `{ key, classId, dateISO: string | null, day, time, rows: Lesson[], status, type, topic }`; `rows` sort theo `id` (ổn định render)
- [x] Status rollup: tất cả `cancelled` → `cancelled`; tất cả `completed` → `completed`; còn lại `upcoming` (gồm mixed và `absent`)
- [x] `type`/`topic` lấy từ row đầu (sort theo `id`); `topic` cắt 30 ký tự là việc của UI, selector trả nguyên văn
- [x] `findSessionRows(lessons, ref: { classId, dateISO: string | null, day, time }): Lesson[]` — lookup live rows cho modal (Phase 2 dùng, tránh giữ state rows cũ sau mutation)
- [x] `weekSlotCount` nhận cột session entries + projected blocks; không đếm session `cancelled` toàn bộ

## Implementation Steps

1. Trong `apps/web/src/lib/schedule-week.ts`: thêm type `WeekSessionEntry` + hàm `selectWeekColumnSessions` (tái dùng logic lọc của `selectWeekColumnLessons` nội bộ; kiểm tra consumer trước khi xóa export cũ).
2. Thêm `findSessionRows` dùng chung predicate grouping với bước 1 (extract helper `sessionKeyOf(l)` để 2 hàm không drift).
3. Đổi chữ ký `weekSlotCount(columns: WeekSessionEntry[][], projectedBlocks)`; bỏ slot khi toàn bộ rows của entry `cancelled`.
4. Cập nhật JSDoc đầu file (ghi rõ ngữ nghĩa mới "block = buổi lớp").
5. Viết/sửa unit tests trong `apps/web/src/lib/schedule-week.test.ts`.

## Todo List

- [x] Thêm `WeekSessionEntry` + `selectWeekColumnSessions` vào `schedule-week.ts`
- [x] Thêm `findSessionRows` + helper `sessionKeyOf` dùng chung
- [x] Refactor `weekSlotCount` sang input session entries
- [x] Test: lớp 1:2 hai enrollment cùng `(classId, date)` → 1 entry, `rows.length === 2`
- [x] Test: hai lớp khác nhau cùng `day|time` → 2 entry riêng
- [x] Test: legacy undated cùng lớp 2 enrollment → 1 entry theo `(classId, day, time)`
- [x] Test: rollup status (all cancelled / all completed / mixed)
- [x] Test: `weekSlotCount` không đếm session cancelled; slot 1:2 multi-enrollment đếm 1 lần

## Success Criteria

- `pnpm --filter web test -- schedule-week` pass toàn bộ (test mới + cũ)
- Không còn export chết: `selectWeekColumnLessons` bị xóa hoặc còn 0 consumer ngoài tests

## Risk Assessment

- **Drift predicate giữa selector và modal lookup** → khắc phục bằng `sessionKeyOf` dùng chung + test cả 2 hàm trên cùng fixture.
- **Legacy rows đã dời day/time per row (lesson-edit)** → grouping `(classId, day, time)` tự nhiên tách slot đã dời thành entry riêng; chấp nhận vì hiển thị trung thành dữ liệu, ghi chú trong JSDoc.

## Security Considerations

- Không đổi auth/data access; selector thuần client-side, không thêm fetch.

## Next Steps

- Phase 2 tiêu thụ selector này trong `schedule.tsx` + modal buổi lớp.
