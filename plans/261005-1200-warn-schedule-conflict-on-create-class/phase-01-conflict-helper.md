---
phase: 1
title: "Conflict helper"
status: completed
---

# Phase 1 — Conflict helper

## Files
- CREATE `apps/web/src/lib/schedule-conflicts.ts`
- CREATE `apps/web/src/lib/schedule-conflicts.test.ts`

## Steps
1. Export `findScheduleConflicts(draft: {days:number[]; start:string; end:string; startDate:string; sessionsTotal:number}, classes: ClassGroup[]): {cls: ClassGroup; sharedDays: number[]}[]`.
2. Trả `[]` nếu `draft.days` rỗng, `draft.start`/`draft.end` không khớp `TIME_REGEX` (import từ `@teacher-os/api/contracts`; `<input type="time">` trả `""` khi user xoá), hoặc `draft.end <= draft.start` (schema sẽ reject anyway).
3. Áp dụng rule 5 điều kiện trong plan.md; dùng `parseStoredSchedule` + `skeletonOf` + `parseStartDateStrict` từ `@teacher-os/api/skeleton` (package chỉ export subpath `./*` — bare `@teacher-os/api` không resolve; theo import hiện có của `class-sessions.ts`). Bỏ qua lớp có parsed `c.end <= c.start` (legacy qua đêm, false-negative có chủ ý).
4. Helper nội bộ `lastSessionDate(schedule, startISO, total)`: `skeletonOf(...)` → max của mọi date trong map values; `skeletonOf` trả null (total ≤ 0/lỗi) → coi như không có mốc kết thúc (vẫn được xét).
5. `sharedDays` sort tăng dần (0 = T2) để render bằng `dayNames`.

## Tests (boundary)
- Trùng thứ + giao giờ + giao khoảng ngày → có; trùng thứ, chạm mép giờ → không; khác thứ → không.
- Lớp đã hết buổi (last session date < draft.startDate) → không warning dù trùng thứ + giờ.
- Lớp `startDate` rỗng → vẫn được xét (coi như còn chạy).
- Schedule legacy free-text → bỏ qua; schedule legacy qua đêm (`end <= start` sau parse) → bỏ qua.
- Giao giờ một phần (19:30–21:00 vs 19:00–20:30) → có.
- Khoảng ngày giao một phần (draft bắt đầu trước khi lớp cũ kết thúc) → có.
- Draft `start: ""` (user xoá trường giờ) → `[]`, không warning.

## Verify
`pnpm --filter web test schedule-conflicts`
