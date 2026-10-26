---
phase: 1
title: "Migration 2 cột điểm danh + contract zod + ánh xạ trạng thái"
status: completed
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
  - Thêm `attendanceNote: text("attendance_note")` (nullable). Doc comment: **teacher-only**, không chiếu vào `/api/student`.
  - Cập nhật doc comment: nêu ánh xạ D2 và quy ước `NULL + completed` hiển thị như "Có mặt".
- Create: migration `packages/db/src/migrations/0045_*.sql` sinh bằng `pnpm --filter @teacher-os/db db:generate`. Chỉ `ALTER TABLE lesson ADD COLUMN` × 2, không backfill. Kiểm `meta/_journal.json` có entry mới.
- Create: `apps/server/src/lesson-attendance-columns-migration.test.ts` theo pattern `library-test-migration.test.ts` (cùng thư mục `apps/server/src/`, quy ước `<subject>-migration.test.ts`): áp 0045 lên DB có sẵn dòng `lesson` cũ → 2 cột mới NULL, mọi reader cũ không đổi; DDL chỉ là `ALTER TABLE lesson ADD COLUMN` × 2. Kernel tests migrate DB rỗng nên không bắt được lớp lỗi này.
- Modify: `apps/server/src/routes/readiness.ts` — probe hiện **derive tables+indexes** từ schema nên cột mới chưa được cover (0006 thêm index nên được bắt). Mở rộng derive thêm **tổng số cột** của mọi bảng (`pragma_table_info`, một probe gộp) theo đúng triết lý "derived, not hardcoded" của file: DB đứng trước migration (thiếu cột) phải 503 ở `/readyz` thay vì 500 "no such column" giữa giờ điểm danh.
- Create: `apps/server/src/routes/student-projection-lock.test.ts` — snapshot tập cột mà `student.ts` chiếu từ bảng `lesson`; fail khi thêm `attendance`/`attendanceNote` vào surface học viên.
- Modify: `packages/api/src/contracts.ts` — **đặt schema attendance ngay vùng schema lesson (`lessonActionSchema` ~:1059-1074), KHÔNG đặt sau `gradingQueueResponseSchema` (~:2053): vùng đó là điểm chèn của TOS-6 (#439), đặt cùng chỗ sẽ conflict merge chắc chắn**.
  - `attendanceStatusSchema = z.enum(["present", "late", "excused", "unexcused"])`.
  - `UNEXCUSED_CONSUMES_SESSION = true` kèm comment: **chính sách mới** do user chốt ở Validation Session 1 — vắng không phép trừ 1 buổi, vắng có phép không trừ; bảng `workspace_settings` là tombstone (#321) nên không đọc, và setting cũ `unexcused_deduct` chưa từng được enforce (chỉ echo ở form Cài đặt, commit `603e05b3`); cấu hình theo tổ chức cần bảng preference mới.
  - Hàm thuần `lessonStatusForAttendance(a: AttendanceStatus): "completed" | "absent"`.
  - `sessionAttendanceSaveSchema`: `{ entries: Array<{ lessonId: string, attendance: AttendanceStatus, note: string (trim, max 255) }> }`, `.strict()`, `entries` tối thiểu 1 phần tử, `lessonId` không trùng (refine).
  - `dailyAttendanceResponseSchema` (dùng ở Phase 2):
    - `date`: yyyy-mm-dd.
    - `sessions`: mảng `{ classId, className, time, dur, mode: "dated" | "legacy", recorded: boolean, students: Array<{ lessonId, studentId, studentName, attendance: AttendanceStatus | null, note: string }> }` — bucket định danh theo **`(classId, date)`** (khớp invariant "one physical session" của schema); `time`/`dur` là field hiển thị lấy từ các dòng trong bucket.
    - `counts`: `{ all, pending, completed }` cho badge chip.
  - Thêm `attendance` và `attendanceNote` (nullable, **required trong type** — không nới optional) vào `KernelLessonRow` (`contracts.ts:1285`).
  - Doc comment cột `attendance_note`: **teacher-only** — không bao giờ chiếu vào `/api/student` (projection lesson của student portal ở `apps/server/src/routes/student.ts:910-918` phải giữ nguyên tập cột).
- Create: `packages/api/src/attendance.test.ts`. Test bảng ánh xạ và schema.

## Tasks & Steps

1. Viết test đỏ trước:
   - `present`, `late` → `completed`; `excused` → `absent`; `unexcused` → `completed` khi hằng số là `true`.
   - Schema từ chối: note 256 ký tự, `attendance` lạ, `lessonId` trùng, thêm field lạ, `entries` rỗng.
   - Note toàn khoảng trắng được trim thành chuỗi rỗng.
2. Sửa schema DB, sinh migration; viết existing-data test 0045 + pin `/readyz` + `student-projection-lock.test.ts`; chạy test DB hiện có để chắc không vỡ.
3. Viết contract + hàm ánh xạ cho test xanh; cập nhật fixture theo danh sách ở Rủi ro.

## Verification

- `pnpm --filter @teacher-os/api test -- attendance`
- `pnpm --filter @teacher-os/db test`
- `pnpm --filter server test -- lesson-attendance-columns-migration readiness student-projection-lock`
- `pnpm check-types`
- `pnpm check`

## Rủi ro

- Thêm field required vào `KernelLessonRow`/`Lesson` làm vỡ **~20 literal site qua ~10 file** (scope audit 2026-10-26). Cập nhật fixture với `attendance: null, attendanceNote: null`, không nới type thành optional. Danh sách đã biết:
  - `apps/web/test/fixtures/mock-data.ts:70,83,96`
  - `apps/web/src/lib/repos/lessons.test.ts:66,79,92,105`
  - `apps/web/src/routes/_auth/schedule.test.tsx:62,71,246`
  - `apps/web/src/lib/class-sessions.test.ts:31,266`
  - `apps/web/src/lib/dashboard-from-kernel.test.ts:58`
  - `apps/web/src/test/kernel-harness.tsx:134`
  - literal `KernelLessonRow` ở `apps/web/src/lib/repos/kernel.test.ts`
  - exact-shape assert server (snapshot/kernel test) — chạy `pnpm check-types` để dò nốt.
- **Rollback:** migration chỉ thêm cột nullable; revert code là đủ, cột thừa không ảnh hưởng reader cũ. Chiều deploy thuận được bảo vệ bởi existing-data test + pin `/readyz` (mục Files).
