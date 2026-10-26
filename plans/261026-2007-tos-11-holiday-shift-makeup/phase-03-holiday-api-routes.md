---
phase: 3
title: "API preview/apply Lịch nghỉ chung + áp shift khi kích hoạt enrollment"
status: completed
priority: P1
effort: "5h"
dependencies: ["phase-02"]
---

# Phase 3: Route server

## Goal

`POST /api/holidays/preview` trả bảng xem trước; `POST /api/holidays` áp dụng nguyên tử; học viên kích hoạt sau vẫn nhận đúng lịch đã dời (D6).

## Files to Create / Modify

- Create: `apps/server/src/routes/holidays.ts` — `holidayRoutes(deps)` theo mẫu `dailyAttendanceRoutes` (Hono con, đọc `kernelCtx`, 401 khi thiếu).
- Create: `apps/server/src/routes/holidays.test.ts`
- Modify: `apps/server/src/routes/kernel.ts` — `kernel.route("/holidays", holidayRoutes(deps))` cạnh dòng `/attendance`; export `isoToLessonWeekday` (đang là hàm nội bộ `kernel.ts:674`) sang `@teacher-os/api/skeleton` để route mới và activation dùng chung.
- Modify: `apps/server/src/routes/enrollment-activation.ts` — áp shift (D6).
- Modify: `apps/server/src/lesson-date-integration.test.ts` (test kích hoạt + sinh lesson có `date` hiện có).
- Modify: `apps/server/src/routes/daily-attendance.ts` — `excludeNonTeachingSessions` bỏ thêm `status === "holiday"`; cập nhật comment điểm cắm.

## Luồng

**Loader chung** `loadPlanInput(db, orgId, draft)`:
1. Lớp áp dụng: `scope = "org"` → mọi lớp `status = active` của org; `scope = "classes"` → `classIds` phải thuộc org (lớp lạ → 404 `class`).
2. Lesson của các lớp đó (chỉ `date`, `status`, `enrollmentId`), một query `inArray`.
3. Kỳ nghỉ hiện có của org giao với từng lớp (scope org hoặc có dòng trong `organization_holiday_class`) → tập ngày theo lớp.

**Preview** — `readBody(holidayDraftSchema)` → loader → `planHolidayShift` → trả `PlanResult` + `affectedClassCount` + `planHash` (hash ổn định SHA-256 của danh sách shift sắp xếp theo classId/originalDate). Không ghi gì.

**Apply** — validate lại (`fromDate < vietnamTodayISO()` → 422 `past-range`), chạy loader + planner từ DB (D7). `shifts` rỗng → 422 `no-sessions`. Số câu lệnh vượt ngưỡng ~500 → 422 `too-large` (không cắt bớt âm thầm, I5). **`planHash` trong body lệch với hash vừa tính lại → 409 `stale-preview`** (I7 — client bắt buộc xem lại bảng; bỏ kịch bản "apply vẫn 200 khi có buổi đổi giữa preview và apply"). Một `db.batch` (D1 batch chỉ rollback khi có lỗi, không rollback khi UPDATE khớp 0 dòng — guard UPDATE kiểu `rosterCountGuard` không cứu được INSERT, red-team C1):

1. Insert `organization_holiday` (+ `organization_holiday_class` khi scope lớp).
2. **Mỗi shift (thứ tự trong batch)**:
   a. **Guard INSERT có thể làm batch fail** kiểu `payments/ingest-transaction.ts:117-125` — insert `holiday_session_shift` với `originalDate` rơi về `NULL` khi điều kiện lệch:
      `original_date = CASE WHEN (SELECT count(*) FROM lesson WHERE org_id=? AND class_id=? AND date=:orig AND status='upcoming') = :n AND (SELECT count(*) FROM lesson WHERE org_id=? AND class_id=? AND date=:makeup)=0 AND (SELECT count(*) FROM holiday_session_shift WHERE class_id=? AND makeup_date=:makeup)=0 THEN :orig ELSE NULL END`.
      Cột `originalDate` là NOT NULL → vi phạm làm **toàn batch rollback**; route bắt lỗi, đọc lại trạng thái, trả 409 `stale-preview`. unique `(classId, originalDate)` + uniqueIndex `(classId, makeupDate)` là lớp bảo vệ thứ hai (C3).
   b. `UPDATE lesson SET status='holiday' WHERE orgId=? AND classId=? AND date=:orig AND status='upcoming'`.
   c. Sinh buổi bù cho **mọi dòng `holiday` vừa tạo** bằng một câu `INSERT INTO lesson (org_id, class_id, enrollment_id, day, time, dur, date, type, status) SELECT org_id, class_id, enrollment_id, :day, :time, :dur, :makeup, type, 'upcoming' FROM lesson WHERE org_id=? AND class_id=? AND date=:orig AND status='holiday'` — ~3 câu/shift thay vì N học viên (I5).
3. `notify = true` → insert `notif` (`text`: "Lịch nghỉ «{name}»: dời {N} buổi của {M} lớp", `channel: "schedule"`, `dot: "warn"`, `time` điền theo pattern các nơi insert `notif` hiện có — M4); set `organization_holiday.notifiedAt` khi nào TOS-19 gửi xong mới set, không set ở đây.
4. Sau batch, đọc lại số dòng UPDATE; nếu batch đã fail ở (2a) → 409. Viết **test rollback thật trên runtime test (miniflare/D1)**: đổi 1 dòng `upcoming` thành `completed` giữa preview và apply → apply trả 409 và DB không có dòng nào của kỳ nghỉ (C1).

**Kích hoạt enrollment (D6, tổng quát hóa theo I2b/I3/I6)** — sau khi `generateScheduleLessons` sinh dòng, với **mỗi lớp có hiệu lực kỳ nghỉ** (scope org hoặc có dòng trong `organization_holiday_class`):
- **Lớp đã có dòng shift:** lấy `holiday_session_shift` theo `createdAt ASC`, áp tuần tự lên **tập dòng cộng dồn** sau mỗi shift (I3): dòng rơi vào `originalDate` của shift thứ k → `status = "holiday"`; chèn dòng `upcoming` tại `makeupDate` của shift k — kể cả khi ngày đó là `makeupDate` của một shift trước (chuỗi 2 kỳ nghỉ nối nhau).
- **Lớp chưa có dòng shift nào nhưng có kỳ nghỉ hiệu lực** (lớp chưa từng có học viên lúc apply, hoặc lớp tạo sau — I6): chạy `planHolidayShift` trên tập dòng vừa sinh với `range` của từng kỳ nghỉ; nếu ra shift thì insert `holiday_session_shift` + biến đổi dòng ngay trong batch (dùng chung guard CASE như apply; nếu guard lệch do race với một apply đang chạy → retry đọc lại shift tối đa 3 lần, I2b).
- **Guard chống lệch đọc:** câu insert `sessionPackage`/lesson kèm điều kiện `CASE (SELECT count(*) FROM holiday_session_shift WHERE class_id=?) = :số-đọc-được` — lệch nghĩa là có apply mới commit giữa lúc đọc và ghi; đọc lại shift rồi dựng lại batch, tối đa 3 lần (I2b). Tất cả vẫn trong batch hiện có của `activateEnrollment`.

## Tasks & Steps

1. Test route đỏ:
   - Preview: org có 2 lớp, khoảng nghỉ trúng 1 buổi mỗi lớp → 2 shift, ngày bù đúng; không ghi DB; `planHash` ổn định, đổi danh sách shift → hash đổi (I7).
   - Preview `scope = "classes"` chỉ lớp A → chỉ lớp A.
   - Apply: buổi gốc toàn `holiday`, buổi bù có đúng số dòng `upcoming` bằng sĩ số (1 câu `INSERT…SELECT`, I5); `holiday_session_shift` 1 dòng; `notif` 1 dòng.
   - **Rollback thật (C1):** đổi 1 dòng `upcoming` → `completed` giữa preview và apply (lưu ý: buổi đổi sang `completed` sẽ vào `keptCompleted` khi apply tính lại — test race trong batch dùng cách khác: sửa trực tiếp 1 dòng `upcoming` khác thành `completed` ngay trước khi batch chạy, ví dụ qua hook test, để guard lệch) → apply 409 và DB **không có** dòng `organization_holiday`/`holiday_session_shift`/lesson bù nào.
   - BR-003: đếm `completed` và tổng không-`holiday` theo enrollment trước/sau apply bằng nhau; `session_package` không đổi.
   - Apply khi không trúng buổi nào → 422; `fromDate` trong quá khứ → 422 `past-range` (I2); `planHash` sai → 409 `stale-preview` (I7).
   - Race: đổi 1 dòng sang `completed` giữa preview và apply → buổi đó vào `keptCompleted`, không bị dời (planHash lệch → 409 trước khi ghi).
   - Org khác gọi với `classIds` của org này → 404, không rò dữ liệu (NFR-005).
   - Kích hoạt học viên sau khi apply → lesson ở ngày gốc là `holiday`, có lesson ở ngày bù.
   - **Chuỗi 2 kỳ nghỉ nối nhau (I3):** makeup của kỳ 1 nằm trong kỳ 2; học viên kích hoạt sau có buổi gốc kỳ 2 = `holiday` và đủ buổi bù; tổng không-`holiday` = `sessionsTotal`.
   - **Lớp chưa có học viên lúc apply (I6):** kích hoạt học viên đầu tiên sau đó → không có buổi vào ngày nghỉ, shift được sinh trong activation.
   - `/attendance/daily` ngày nghỉ không còn ca của lớp đã dời.
2. Viết route + loader, xanh test.

## Verification

- `pnpm --filter server test -- holidays daily-attendance lesson-date-integration`
- `pnpm check`, `pnpm check-types`
