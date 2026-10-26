---
phase: 2
title: "API danh sách ca theo ngày + lưu điểm danh cả ca"
status: pending
priority: P1
effort: "6h"
dependencies: [1, "TOS-6 phase 1"]
---

# Phase 2: `GET /api/attendance/daily` và `PUT /api/classes/:id/sessions/:date/attendance`

## Goal

Server trả danh sách ca học của một ngày (đã loại buổi huỷ, đi qua điểm cắm nghỉ lễ), và ghi điểm danh cả ca trong một transaction ≤ 2 giây.

## Files to Create / Modify

- Create: `apps/server/src/routes/daily-attendance.ts`.
  - Router Hono đọc `kernelCtx` theo mẫu `grading.ts` / `dashboard-reminders.ts` (TOS-6).
  - Hàm thuần `computeDailyAttendance(db, orgId, scope, dateISO)` tách riêng để test.
  - Hàm `excludeNonTeachingSessions(rows, ctx)`: hiện chỉ bỏ `cancelled`. Comment nêu đây là điểm cắm Lịch nghỉ chung (FR-007).
- Create: `apps/server/src/routes/daily-attendance.test.ts`.
- Modify: `apps/server/src/routes/kernel.ts`.
  - Mount `kernel.route("/attendance", dailyAttendanceRoutes(deps))` cạnh `/dashboard`.
  - Thêm `kernel.put("/classes/:id/sessions/:date/attendance", …)` cạnh `/check-in` (`kernel.ts:1042`), dùng lại `parseOccurrenceContext`, `findClass`, `futureSession`.
- Dùng chung `ReminderScope` + `resolveReminderScope(ctx)` của TOS-6. Không định nghĩa lại.

## Quy tắc `GET /api/attendance/daily?date=YYYY-MM-DD`

1. `date` sai định dạng → 422 (`validation`). Thiếu thì mặc định `vietnamTodayISO()`.
2. **Lớp có ngày:** lấy các dòng `lesson` có `date = :date`, join `enrollment` (`status = "active"`) và `student` để lấy tên. Gom theo `(classId, time)`.
3. **Lớp legacy:** dòng `date IS NULL` có `day` = thứ của `:date`, cùng quy ước với `computeReminders` của TOS-6. Trả `mode: "legacy"`, `students` lấy từ enrollment active, `attendance: null`. Không trả `lessonId` cho legacy (client không ghi được).
4. Qua `excludeNonTeachingSessions`. Ca mà mọi dòng đều `cancelled` thì biến mất; ca có dòng huỷ lẻ thì chỉ bỏ học viên đó.
5. `recorded = true` khi không còn dòng `upcoming` nào trong ca. Định nghĩa này khớp cách TOS-6 đếm "ca chưa điểm danh", nên lưu xong một ca thì bộ đếm dashboard giảm đúng 1.
6. Dòng `completed` có `attendance = NULL` (điểm danh 1-click cũ) trả `attendance: "present"` để UI không bị trống. Dòng `absent` có `attendance = NULL` trả `"excused"`.
7. Sắp ca theo `time` tăng dần rồi theo tên lớp. Học viên sắp theo tên (`localeCompare` `vi`).
8. `counts` tính sau bước 4.
9. Scope `assigned`: lọc `classId IN classIds` (chưa dùng, test bằng unit).

## Quy tắc `PUT /api/classes/:id/sessions/:date/attendance`

1. Parse body bằng `sessionAttendanceSaveSchema`. Sai → 422.
2. Lớp không thuộc org → 404 (giống `/check-in`). Ngày > `vietnamTodayISO()` → 422 `future-session`.
3. Đọc mọi dòng `lesson` của `(classId, date, orgId)` có status khác `cancelled` và enrollment active. Rỗng → 404 `not-found`.
4. **Đủ sĩ số:** tập `lessonId` gửi lên phải trùng khớp tập dòng ở bước 3. Thiếu → 422 `{ reason: "incomplete-roster", missing: [lessonId] }`. Có id lạ → 422 `{ reason: "unknown-lesson" }`.
5. Trong 1 transaction, mỗi entry `UPDATE lesson SET status = lessonStatusForAttendance(a), attendance = a, attendance_note = note WHERE id = ? AND org_id = ? AND class_id = ? AND date = ? AND status != 'cancelled'`. Bất kỳ update nào ảnh hưởng 0 dòng → rollback, 409 `{ reason: "roster-changed" }`.
6. Trả `{ updated: number, recorded: true }`.
7. Đo thời gian handler trong test với ca 30 học viên; mục tiêu < 300ms ở server.

## Tasks & Steps

1. Test đỏ cho `computeDailyAttendance`:
   - (a) Lớp có ngày, 2 khung giờ cùng ngày → 2 ca, sắp theo giờ.
   - (b) Lớp legacy đúng thứ được liệt kê với `mode: "legacy"` và không có `lessonId`.
   - (c) Buổi `cancelled` toàn ca bị loại; huỷ lẻ chỉ bỏ học viên đó.
   - (d) `completed` + `attendance = NULL` trả `"present"`.
   - (e) Enrollment không active bị loại.
   - (f) Cô lập org.
   - (g) Scope `assigned` chỉ trả lớp trong `classIds`.
2. Test đỏ cho PUT:
   - Lưu đủ 4 trạng thái → status trong DB đúng bảng ánh xạ, note được lưu.
   - Thiếu 1 học viên → 422 `incomplete-roster`, DB không đổi.
   - Ngày tương lai → 422 `future-session`.
   - Lưu lại ca đã điểm danh (đổi `present` → `excused`) → status chuyển `completed → absent`.
   - Chưa đăng nhập 401, student 403 `ACCOUNT_STUDENT_ROLE`.
   - **Tích hợp với TOS-6:** gọi `computeReminders` trước và sau PUT cho ca hôm nay → `attendance.pending` giảm 1.
3. Viết router + endpoint cho test xanh. Response parse lại bằng schema.

## Verification

- `pnpm --filter server test -- daily-attendance kernel`
- `pnpm check-types`
- `pnpm check`

## Rủi ro

- Ngày theo giờ Việt Nam: luôn dùng `vietnamTodayISO()`; thêm test `now` = 23:30 UTC.
- `lesson.date` có comment "UTC-anchored": so khớp chuỗi `yyyy-mm-dd`, không chuyển timezone.
