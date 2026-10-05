---
title: "Warn schedule conflict on create class"
description: "Modal Tạo lớp hiển thị cảnh báo (không chặn) khi lịch đang chọn trùng thứ + giao giờ + giao khoảng ngày với lớp đã tạo trước đó."
status: pending
priority: P2
effort: "0.5d"
branch: develop
tags: [frontend, ux]
blockedBy: []
blocks: []
created: 2026-10-05
---

# Warn schedule conflict on create class

## Overview

Hiện `AddClassModal` cho tạo lớp có lịch trùng lớp khác mà không báo gì (vd `[TEST] Foundation` T2&T4 19:00–20:30 và `[TEST] Foundation 2` T2&T4&T6 19:00–20:30). Thêm cảnh báo inline, realtime khi user chọn thứ/giờ, liệt kê lớp bị trùng. **Cảnh báo, không chặn submit** (giáo viên có thể cố ý dạy song song/trợ giảng).

## Scope Challenge

- Existing: `ClassGroup.schedule` (raw JSON `{days,start,end}` hoặc legacy free-text), `parseStoredSchedule` (`packages/api/src/skeleton.ts`) đã parse + guard legacy; `useClasses()` đọc store sẵn; modal đã có state `days/startTime/endTime`.
- Requested: warning khi tạo lớp trùng lịch. Không thêm server validation, không chặn, không check khi sửa lịch/lesson-edit.
- Complexity: 1 helper thuần + 1 chỗ render trong modal. 2 phase, chỉ `apps/web`.
- Mode: fast.

## Conflict rule

Lớp `c` trùng với lịch mới khi CẢ năm điều kiện:

1. `parseStoredSchedule(c.schedule)` khác null (legacy free-text bỏ qua),
2. có ít nhất 1 thứ chung,
3. khoảng giờ giao nhau: `start < c.end && c.start < end` (so chuỗi `HH:MM`; chạm mép 19:00–20:30 vs 20:30–22:00 **không** tính trùng),
4. khoảng ngày giao nhau — khoảng chạy của lớp `c` là `[c.startDate, ngàyOccurrenceThứN(c.schedule, c.startDate, c.sessionsTotal)]`; ngày cuối lấy bằng `skeletonOf` (rồi max các date trong map) từ `packages/api/src/skeleton.ts`. `parseStartDateStrict(c.startDate) === null` (rỗng/legacy) → coi như vẫn chạy (không có mốc kết thúc để loại),
5. khoảng ngày của lớp mới (tính tương tự từ `startDate` + `sessionsTotal` trong modal) giao với khoảng của `c`: `newStart <= cEnd && cStart <= newEnd`.

**Không** filter theo `c.status === "active"` nữa: status chỉ được ghi `"active"` một lần lúc tạo (`apps/server/src/routes/kernel.ts:862`) và không route nào cập nhật — filter này không loại được lớp đã kết thúc (false warning). "Lớp đang chạy" được suy ra từ khoảng ngày (điều kiện 4–5) thay vì cột status.

Draft trong modal đang có `end <= start` thì trả `[]` (schema sẽ reject, không cần warning).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Conflict helper](phase-01-conflict-helper.md) | pending |
| 2 | [Modal warning UI](phase-02-modal-warning-ui.md) | pending |

## Acceptance

- Chọn T2 + 19:00–20:30 khi đã có lớp T2&T4 19:00–20:30 còn buổi chưa kết thúc → hiện warning nêu tên lớp + thứ trùng; nút Tạo lớp vẫn bấm được.
- Bỏ chọn thứ trùng hoặc dời giờ không giao → warning biến mất.
- Lớp legacy free-text, lớp đã hết buổi (ngày cuối < startDate lớp mới), hoặc khoảng ngày không giao không gây warning.
- Lớp có `startDate` rỗng vẫn được xét (coi như còn chạy).
- `pnpm check`, `pnpm check-types`, `pnpm --filter web test` xanh.
