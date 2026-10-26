---
phase: 3
title: "API preview/apply Lịch nghỉ chung + áp shift khi kích hoạt enrollment"
status: pending
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

**Preview** — `readBody(holidayDraftSchema)` → loader → `planHolidayShift` → trả `PlanResult` + `affectedClassCount`. Không ghi gì.

**Apply** — validate lại, chạy loader + planner từ DB (D7). `shifts` rỗng → 422 `no-sessions`. Một `db.batch`:
1. Insert `organization_holiday` (+ `organization_holiday_class` khi scope lớp).
2. Mỗi shift: `UPDATE lesson SET status='holiday' WHERE orgId=? AND classId=? AND date=? AND status='upcoming'`; insert `holiday_session_shift`; insert một `lesson` `upcoming` cho mỗi `enrollmentId` tại `makeupDate` (`day = isoToLessonWeekday(makeupDate)`, `time`, `dur`, `type` lấy theo dòng gốc).
3. `notify = true` → insert `notif` (`text`: "Lịch nghỉ «{name}»: dời {N} buổi của {M} lớp", `channel: "schedule"`, `dot: "warn"`).
4. Sau batch, so số dòng UPDATE với tổng `enrollmentIds`; lệch (có người vừa điểm danh) → dùng guard trong batch giống `rosterCountGuard` ở `kernel.ts:1178` để cả batch fail, trả 409 `stale-preview`.
5. Unique `(classId, originalDate)` vi phạm (kỳ nghỉ chồng lên buổi đã dời) không xảy ra vì planner bỏ buổi `holiday`; nếu vẫn bắt được → 409.

**Kích hoạt enrollment (D6)** — sau khi `generateScheduleLessons` sinh dòng, đọc `holiday_session_shift` của lớp: dòng có `date = originalDate` → `status = "holiday"`; với mỗi shift thêm 1 dòng `upcoming` tại `makeupDate` cùng `time/dur`. Tất cả vẫn trong batch hiện có của `activateEnrollment`.

## Tasks & Steps

1. Test route đỏ:
   - Preview: org có 2 lớp, khoảng nghỉ trúng 1 buổi mỗi lớp → 2 shift, ngày bù đúng; không ghi DB.
   - Preview `scope = "classes"` chỉ lớp A → chỉ lớp A.
   - Apply: buổi gốc toàn `holiday`, buổi bù có đúng số dòng `upcoming` bằng sĩ số; `holiday_session_shift` 1 dòng; `notif` 1 dòng.
   - BR-003: đếm `completed` và tổng không-`holiday` theo enrollment trước/sau apply bằng nhau; `session_package` không đổi.
   - Apply khi không trúng buổi nào → 422.
   - Race: đổi 1 dòng sang `completed` giữa preview và apply → buổi đó vào `keptCompleted`, không bị dời. Race trong batch → 409, DB không đổi.
   - Org khác gọi với `classIds` của org này → 404, không rò dữ liệu (NFR-005).
   - Kích hoạt học viên sau khi apply → lesson ở ngày gốc là `holiday`, có lesson ở ngày bù.
   - `/attendance/daily` ngày nghỉ không còn ca của lớp đã dời.
2. Viết route + loader, xanh test.

## Verification

- `pnpm --filter server test -- holidays daily-attendance lesson-date-integration`
- `pnpm check`, `pnpm check-types`
