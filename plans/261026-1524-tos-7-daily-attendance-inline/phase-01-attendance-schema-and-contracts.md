---
phase: 1
title: "Migration 2 cột điểm danh + contract zod + ánh xạ trạng thái"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Lưu trạng thái điểm danh trên `lesson`

## Goal

Mỗi dòng `lesson` (1 học viên × 1 buổi) lưu được 1 trong 4 trạng thái điểm danh chuẩn và ghi chú học vụ. Có một hàm thuần duy nhất quyết định `lesson.status` từ trạng thái điểm danh, dùng chung cho server và test.

## Files to Create / Modify

- Modify: `packages/db/src/schema/lesson.ts`.
  - Thêm `attendance: text("attendance")` (nullable). `NULL` nghĩa là chưa ghi trạng thái chi tiết (dòng cũ hoặc điểm danh 1-click).
  - Thêm `attendanceNote: text("attendance_note")` (nullable).
  - Cập nhật doc comment: nêu ánh xạ D2 và quy ước `NULL + completed` hiển thị như "Có mặt".
- Create: migration `packages/db/src/migrations/0045_*.sql` sinh bằng `pnpm --filter @teacher-os/db db:generate`. Chỉ `ALTER TABLE lesson ADD COLUMN` × 2, không backfill. Kiểm `meta/_journal.json` có entry mới.
- Modify: `packages/api/src/contracts.ts`.
  - `attendanceStatusSchema = z.enum(["present", "late", "excused", "unexcused"])`.
  - `UNEXCUSED_CONSUMES_SESSION = true` kèm comment: khớp giá trị mặc định cũ "Có, trừ 1 buổi"; bảng `workspace_settings` là tombstone (#321) nên không đọc; cấu hình theo tổ chức cần bảng preference mới.
  - Hàm thuần `lessonStatusForAttendance(a: AttendanceStatus): "completed" | "absent"`.
  - `sessionAttendanceSaveSchema`: `{ entries: Array<{ lessonId: string, attendance: AttendanceStatus, note: string (trim, max 255) }> }`, `.strict()`, `entries` tối thiểu 1 phần tử, `lessonId` không trùng (refine).
  - `dailyAttendanceResponseSchema` (dùng ở Phase 2):
    - `date`: yyyy-mm-dd.
    - `sessions`: mảng `{ classId, className, time, dur, mode: "dated" | "legacy", recorded: boolean, students: Array<{ lessonId, studentId, studentName, attendance: AttendanceStatus | null, note: string }> }`.
    - `counts`: `{ all, pending, completed }` cho badge chip.
  - Thêm `attendance` và `attendanceNote` (nullable) vào `KernelLessonRow`.
- Create: `packages/api/src/attendance.test.ts`. Test bảng ánh xạ và schema.

## Tasks & Steps

1. Viết test đỏ trước:
   - `present`, `late` → `completed`; `excused` → `absent`; `unexcused` → `completed` khi hằng số là `true`.
   - Schema từ chối: note 256 ký tự, `attendance` lạ, `lessonId` trùng, thêm field lạ, `entries` rỗng.
   - Note toàn khoảng trắng được trim thành chuỗi rỗng.
2. Sửa schema DB, sinh migration, chạy test DB hiện có để chắc không vỡ.
3. Viết contract + hàm ánh xạ cho test xanh.

## Verification

- `pnpm --filter @teacher-os/api test -- attendance`
- `pnpm --filter @teacher-os/db test`
- `pnpm check-types`
- `pnpm check`

## Rủi ro

- Thêm field vào `KernelLessonRow` làm vỡ fixture snapshot ở test web/server. Cập nhật fixture với `attendance: null, attendanceNote: null`, không nới type thành optional.
- **Rollback:** migration chỉ thêm cột nullable; revert code là đủ, cột thừa không ảnh hưởng reader cũ.
