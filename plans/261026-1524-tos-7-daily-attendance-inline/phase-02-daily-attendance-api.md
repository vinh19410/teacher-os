---
phase: 2
title: "API danh sách ca theo ngày + lưu điểm danh cả ca"
status: completed
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
  - Mount `kernel.route("/attendance", dailyAttendanceRoutes(deps))` ở dòng **sau** mount `/dashboard` của TOS-6 — không chen giữa `/grading` và `/dashboard` để giảm conflict rebase.
  - Thêm `kernel.put("/classes/:id/sessions/:date/attendance", …)` cạnh `/check-in` (`kernel.ts:1042`), dùng lại `parseOccurrenceContext`, `findClass`, `futureSession`.
- Dùng chung `ReminderScope` + `resolveReminderScope(ctx)` của TOS-6. Không định nghĩa lại. Nếu TOS-6 chưa export `resolveReminderScope` (WIP 2026-10-26 chưa export), thêm `export` thành **một commit riêng nhỏ** trên nhánh #440 để dễ drop khi TOS-6 tự export.

## Quy tắc `GET /api/attendance/daily?date=YYYY-MM-DD`

0. **Auth trước hết** (kernel auth là per-route, không middleware toàn cục — `app.ts:118-122` chỉ `next()`): thiếu `kernelCtx` → 401 như `grading.ts:553`; session student → 403 `ACCOUNT_STUDENT_ROLE`.
1. `date` sai định dạng → **400 `{ error: "invalid date", reason: "invalid-date" }`** qua `invalidDateResponse` (`kernel.ts:662-664`) — reason `validation` không tồn tại trong repo. Thiếu thì mặc định `vietnamTodayISO()`.
2. **Bucket định danh theo `(classId, date)`** (khớp invariant "one physical session" của `lesson.ts`) — KHÔNG gom theo `(classId, time)`: PUT ghi theo `(classId, date)`, hai định danh khác nhau sẽ làm ca 2 khung giờ không thể lưu. Lớp có ngày: các dòng `lesson` có `date = :date`, join `enrollment` (`status = "active"`) và `student` để lấy tên. `time`/`dur` hiển thị lấy từ dòng trong bucket (diverge hiếm gặp: lấy min).
3. **Lớp legacy:** dòng `date IS NULL` có `day` = thứ của `:date`, cùng quy ước với `computeReminders` của TOS-6. Trả `mode: "legacy"`, `students` lấy từ enrollment active, `attendance: null`. Không trả `lessonId` cho legacy (client không ghi được).
4. Qua `excludeNonTeachingSessions`. Ca mà mọi dòng đều `cancelled` thì biến mất; ca có dòng huỷ lẻ thì chỉ bỏ học viên đó.
5. `recorded = true` khi không còn dòng `upcoming` nào trong bucket. ⚠️ Spec TOS-6 đếm upcoming **không lọc `enrollment.status`** trong khi danh sách này lọc `active` — hai phép đếm chỉ khớp khi không có dòng của enrollment không-active; integration test đối chiếu `computeReminders` (Task 2) là gate bắt drift này khi TOS-6 vào `develop`.
6. Chỉ coerce **hiển thị** `completed + attendance NULL → "present"` (default picker, tuỳ chọn 1-click cũ). Dòng `absent + attendance NULL` trả **`attendance: null`** — UI hiện "Chưa rõ (điểm danh cũ)" và yêu cầu chọn trạng thái trước khi lưu; không bịa `"excused"` cho dữ liệu legacy.
7. Sắp ca theo `time` tăng dần rồi theo tên lớp. Học viên sắp theo tên (`localeCompare` `vi`).
8. `counts` tính sau bước 4.
9. Scope `assigned`: lọc `classId IN classIds` qua **helper chunk-50** giống `D1_IN_ARRAY_CHUNK` của `grading.ts:35-37` (trần bind parameter D1, #366); unit test với >50 classIds.

## Quy tắc `PUT /api/classes/:id/sessions/:date/attendance`

1. **Auth** như GET (401/403). Parse body bằng `readBody` + `sessionAttendanceSaveSchema`, sai → **400 `{ error: "invalid body" }`** (`kernel.ts:145-149`), không dùng 422 cho malformed.
2. Lớp không thuộc org → 404 (giống `/check-in`). Ngày sai định dạng → 400 `invalid-date` qua `parseOccurrenceContext`. Ngày > `vietnamTodayISO()` → 422 `future-session`.
3. Đọc roster (ngoài batch — **D1 không có `.transaction()` tương tác, `db.batch` là precedent nguyên tử duy nhất (`assignments/tests.ts:31`); không đọc/rẽ nhánh giữa batch được**): mọi dòng `lesson` của `(classId, date, orgId)` có status khác `cancelled` và enrollment active. Rỗng → 404 `not-found`.
4. **Đủ sĩ số hai chiều trên tập vừa đọc:** tập `lessonId` gửi lên phải trùng khớp tập dòng vừa đọc (cả thiếu lẫn thừa). Thiếu → 422 `{ reason: "incomplete-roster", missing: [lessonId] }`. Có id lạ → 422 `{ reason: "unknown-lesson" }`.
5. Ghi bằng **một `db.batch`** gồm n UPDATE; WHERE mỗi UPDATE: `id + org_id + class_id + date + status != 'cancelled' + date <= :today` + pairing invariant 2 (mẫu subquery `occurrenceUpdate`, `kernel.ts:776-783`) + **roster-snapshot guard `(SELECT count(*) FROM lesson WHERE class_id = ? AND date = ? AND org_id = ? AND status != 'cancelled' AND enrollment active) = :n`** với n = số entries. Batch nguyên tử: roster đổi giữa đọc và ghi (kích hoạt enrollment muộn thêm dòng — `enrollment-activation.ts:66-70`) làm guard lệch → mọi UPDATE 0 dòng; tổng `meta.changes` ≠ n → rollback trọn batch, 409 `{ reason: "roster-changed" }`.
6. Trả `{ updated: number, recorded: true }`.
7. Đo thời gian handler trong test với ca 30 học viên; mục tiêu < 300ms ở server.

## Tasks & Steps

1. Test đỏ cho `computeDailyAttendance`:
   - (a) Lớp có ngày có 2 dòng `time` khác nhau cùng `date` → **1 ca duy nhất** (bucket `(classId, date)`), không tách 2 ca.
   - (b) Lớp legacy đúng thứ được liệt kê với `mode: "legacy"` và không có `lessonId`.
   - (c) Buổi `cancelled` toàn ca bị loại; huỷ lẻ chỉ bỏ học viên đó.
   - (d) `completed` + `attendance = NULL` trả `"present"`; **`absent` + `attendance = NULL` trả `null`** (không coerce thành `excused`).
   - (e) Enrollment không active bị loại.
   - (f) Cô lập org.
   - (g) Scope `assigned` chỉ trả lớp trong `classIds`; **chunk >50 classIds** không lỗi bind parameter.
   - (h) GET chưa đăng nhập → 401; session student → 403 `ACCOUNT_STUDENT_ROLE`; `date=26-10-2026` → 400 `invalid-date`.
2. Test đỏ cho PUT:
   - Lưu đủ 4 trạng thái → status trong DB đúng bảng ánh xạ, note được lưu.
   - Thiếu 1 học viên → 422 `incomplete-roster`, DB không đổi; **có id lạ** → 422 `unknown-lesson`.
   - **Thêm dòng `upcoming` vào bucket giữa lúc đọc roster và ghi batch → roster-snapshot guard lệch → mọi UPDATE 0 dòng → 409 `roster-changed`, DB không đổi.**
   - Ngày tương lai → 422 `future-session`; ngày sai định dạng → 400 `invalid-date`; body sai schema → 400 `invalid body`.
   - Lưu lại ca đã điểm danh (đổi `present` → `excused`) → status chuyển `completed → absent`.
   - Chưa đăng nhập 401, student 403 `ACCOUNT_STUDENT_ROLE`.
   - **Tích hợp với TOS-6 (gate khi TOS-6 vào `develop`):** gọi `computeReminders` trước và sau PUT cho ca hôm nay → `attendance.pending` giảm 1; test đối chiếu này là nơi bắt drift lọc `enrollment.status` giữa 2 phép đếm.
3. Viết router + endpoint cho test xanh. Response parse lại bằng schema.

## Verification

- `pnpm --filter server test -- daily-attendance kernel`
- `pnpm check-types`
- `pnpm check`

## Rủi ro

- Ngày theo giờ Việt Nam: luôn dùng `vietnamTodayISO()`; thêm test `now` = 23:30 UTC.
- `lesson.date` có comment "UTC-anchored": so khớp chuỗi `yyyy-mm-dd`, không chuyển timezone.
- **Drift phép đếm với TOS-6:** spec TOS-6 đếm upcoming không lọc `enrollment.status`, GET/PUT ở đây lọc `active` (quy tắc 5). Integration test `computeReminders` (Task 2) là gate; nếu drift thật xảy ra, phải thống nhất một hàm đếm dùng chung thay vì vá từng bên.
