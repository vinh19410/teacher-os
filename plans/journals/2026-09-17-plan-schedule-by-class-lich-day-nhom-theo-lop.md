---
title: "Plan schedule-by-class: lich day nhom theo lop"
date: 2026-09-17
summary: "Lap plan chuyen /schedule tu block theo hoc vien sang block theo buoi lop, kem ClassSessionModal per-student actions; issue #162"
---

# Plan schedule-by-class: lich day nhom theo lop

# Plan: Lịch dạy hiển thị theo lớp (issue #162)

## Bối cảnh
`/schedule` đang render mỗi lesson row (mỗi enrollment) thành một block theo tên học viên. Yêu cầu: block = buổi của lớp.

## Phát hiện chính khi scout
- `lesson` đã có `classId` NOT NULL + `enrollmentId`; nhiều enrollment cùng lớp sinh nhiều row cùng `(classId, date)` → gom thuần client-side, không đổi DB/API.
- Pattern gom buổi theo lớp đã có sẵn: `class-sessions.ts` (`buildClassSessions`, `sessionRowTargets`) chạy ở tab "Buổi học" của trang lớp.
- `LessonModal` còn 5 consumer khác → giữ nguyên, viết `ClassSessionModal` mới (additive).
- e2e ảnh hưởng: chỉ `class-operations.spec.ts` locate block thật theo STUDENT_NAME; `projected-sessions.spec.ts` đã assert theo CLASS_NAME (QC #121) và `session-occurrence.spec.ts` chạy ở tab lớp.

## Thiết kế
- Phase 1: `selectWeekColumnSessions` + `findSessionRows` + `sessionKeyOf` trong `schedule-week.ts` (dated gom `(classId, date)`, legacy gom `(classId, day, time)`); `weekSlotCount` đổi input sang session entries.
- Phase 2: `schedule.tsx` render block lớp (tên lớp primary, `n HV` khi >1), modal derive rows live từ store qua `findSessionRows`, action per-lessonId giữ modal mở.
- Phase 3: sửa e2e + regression (`pnpm --filter web test`, playwright specs, `pnpm test`).

## Quyết định mặc định (đã ghi trong plan, chờ user revised)
1. Giữ lưới tuần 7 cột; 2. Không đổi server; 3. Legacy gom theo (classId, day, time); 4. Modal giữ mở sau điểm danh từng học viên.

## Kết quả
- Plan: `plans/260917-0523-schedule-by-class/` (3 phases, 33 tasks, validate OK, verification 12/12 claims)
- Issue: vinh19410/teacher-os#162 (label `ready to review`)
- Bước tiếp: `/ak:cook plans/260917-0523-schedule-by-class/plan.md` trên branch `feat/schedule-by-class`

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
