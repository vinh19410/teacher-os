---
title: "Warn schedule conflict on create class"
description: "Modal Tạo lớp hiển thị cảnh báo (không chặn) khi lịch đang chọn trùng thứ + giao giờ + giao khoảng ngày với lớp đã tạo trước đó."
status: completed
priority: P2
effort: "0.5d"
branch: feat/warn-schedule-conflict-on-create-class
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

1. `parseStoredSchedule(c.schedule)` khác null (legacy free-text bỏ qua); parsed `c.end <= c.start` (legacy qua đêm — parseStoredSchedule chỉ chặn `start === end`, xem contracts.ts:63-65) → bỏ qua: false-negative có chủ ý, không chuẩn hoá cross-midnight,
2. có ít nhất 1 thứ chung,
3. khoảng giờ giao nhau: `start < c.end && c.start < end` (so chuỗi `HH:MM`; chạm mép 19:00–20:30 vs 20:30–22:00 **không** tính trùng),
4. khoảng ngày giao nhau — khoảng chạy của lớp `c` là `[c.startDate, ngàyOccurrenceThứN(c.schedule, c.startDate, c.sessionsTotal)]`; ngày cuối lấy bằng `skeletonOf` (rồi max các date trong map) từ `packages/api/src/skeleton.ts`. `parseStartDateStrict(c.startDate) === null` (rỗng/legacy) → coi như vẫn chạy (không có mốc kết thúc để loại),
5. khoảng ngày của lớp mới (tính tương tự từ `startDate` + `sessionsTotal` trong modal) giao với khoảng của `c`: `newStart <= cEnd && cStart <= newEnd`.

**Không** filter theo `c.status === "active"` nữa: status chỉ được ghi `"active"` một lần lúc tạo (`apps/server/src/routes/kernel.ts:862`) và không route nào cập nhật — filter này không loại được lớp đã kết thúc (false warning). "Lớp đang chạy" được suy ra từ khoảng ngày (điều kiện 4–5) thay vì cột status.

Draft guard: trả `[]` nếu `days` rỗng, `start`/`end` không khớp `TIME_REGEX` (contracts.ts:31; `<input type="time">` trả `""` khi user xoá trường), hoặc `end <= start` (schema sẽ reject, không cần warning).

Dữ liệu org-scoped theo kernel snapshot (`where orgId = …`) — cảnh báo chỉ thấy lớp cùng org, không có ranh giới per-teacher (schema class không có cột teacher).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Conflict helper](phase-01-conflict-helper.md) | completed |
| 2 | [Modal warning UI](phase-02-modal-warning-ui.md) | completed |

## Acceptance

- Chọn T2 + 19:00–20:30 khi đã có lớp T2&T4 19:00–20:30 còn buổi chưa kết thúc → hiện warning nêu tên lớp + thứ trùng; nút Tạo lớp vẫn bấm được.
- Bỏ chọn thứ trùng hoặc dời giờ không giao → warning biến mất.
- Lớp legacy free-text, lớp đã hết buổi (ngày cuối < startDate lớp mới), hoặc khoảng ngày không giao không gây warning.
- Lớp có `startDate` rỗng vẫn được xét (coi như còn chạy).
- `pnpm check`, `pnpm check-types`, `pnpm --filter web test` xanh.

## Red Team Review

### Session — 2026-10-05
**Findings:** 10 (9 accept, 1 reject) — 2 reviewer độc lập (Security Adversary, Assumption Destroyer), Light tier Fact Checker. Bản revision rule 5 điều kiện (date-window, bỏ status filter) do user cập nhật song song trong lúc red-team chạy — finding "status active vacuous" được resolve bằng chính revision đó.
**Severity breakdown:** 3 Critical (1 cặp trùng), 4 High, 3 Medium.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `status === "active"` vacuous — lớp kết thúc vẫn active, warning nhiễu | Critical | Accept — resolve bằng date-window rule 4–5 của user revision (không dùng predicate sessionsDone) | plan.md (đã có) |
| 2 | Test hiện có crash (useData throw không provider) + interaction test bất khả thi trong node/renderToStaticMarkup | Critical | Accept: mock `use-classes` ở file test hiện có + file jsdom mới `add-class-modal.conflict.test.tsx` | phase-02 |
| 3 | Import `@teacher-os/api` bare không resolve (exports chỉ `./*`) | High | Accept: `@teacher-os/api/skeleton` | phase-01 |
| 4 | Legacy qua đêm (`end < start`) parse được nhưng rule giờ false-negative | High | Accept: skip + document + test | plan.md rule 1, phase-01 |
| 5 | Draft time `""`/malformed → warning bắn nhảm | High | Accept: guard `TIME_REGEX` | plan.md, phase-01 |
| 6 | Ambiguity: hiển thị shared days hay full days của lớp | Medium | Accept (clarify): sharedDays qua `dayNames` + giờ `start–end` của lớp (parsed) | phase-02 |
| 7 | Danh sách không cap; tên lớp dài không wrap; org-scope không ghi | Medium | Accept: cap 3 + "+N lớp khác"; `break-words`; note org-scope | plan.md, phase-02 |
| 8 | Tên lớp free-text — cần rule render escape | Medium | Accept: chỉ JSX text children; assertion escape trong test | phase-02 |
| 9 | Self-conflict flash sau submit (optimistic store chứa lớp vừa tạo) | Medium | Accept: ẩn warning khi `saving \|\| notice` | phase-02 |
| 10 | Loại thêm lớp startDate tương lai bằng predicate riêng | — | Reject: rule 4–5 date-window đã bao phủ | — |

### Whole-Plan Consistency Sweep
- Đối chiếu lại rule/guard/acceptance với phase-01 + phase-02 sau khi áp: số điều kiện, guard TIME_REGEX, overnight skip, org-scope note, và spec render đồng nhất; không còn mâu thuẫn chưa xử lý.
