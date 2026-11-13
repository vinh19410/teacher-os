# _evidence — attendance

Bằng chứng thô theo hạng mục. Mọi cite dạng `repo-relative/path:line`. Range đã kiểm `wc -l`.

## §Endpoints

| Endpoint | Hành vi | Nguồn |
|---|---|---|
| GET `/api/attendance/daily?date=` | 401 khi thiếu kernelCtx; thiếu date → `vietnamTodayISO()`; date sai → 400 `invalid-date`; parse response qua `dailyAttendanceResponseSchema` trước khi trả | apps/server/src/routes/daily-attendance.ts:306-330 |
| Mount | `kernel.route("/attendance", dailyAttendanceRoutes(deps))` và `kernel.route("/holidays", holidayRoutes(deps))` | apps/server/src/routes/kernel.ts:3510-3512 |
| PUT `/api/classes/:id/sessions/:date/attendance` | parseOccurrenceContext (auth + date strict) → scope/class check 404 → future-session 422 → roster → unknown/incomplete 422 → batch guard → 409 roster-changed / 200 `{updated, recorded:true}` | apps/server/src/routes/kernel.ts:2909-3040 |
| POST `/api/holidays/preview` | auth → readBody (415/400) → buildPlan → 404 class → trả HolidayPreview (không ghi DB) | apps/server/src/routes/holidays.ts:495-505 |
| POST `/api/holidays` | auth → readBody → past-range 422 → buildPlan lại → no-sessions 422 → planHash 409 → batch nguyên tử → notif + holiday_created → `{holidayId, shiftedCount, cancelledCount, classCount}` | apps/server/src/routes/holidays.ts:507-671 |
| DELETE `/api/holidays/:id` | auth → tồn tại? 404 → đã bắt đầu? 422 → kiểm touched → 409 kèm touched[] → batch hoàn tác → `{restoredCount, removedMakeupCount}` | apps/server/src/routes/holidays.ts:673-1009 |

## §Validation

- `parseStartDateStrict`: regex `^\d{4}-\d{2}-\d{2}$` + năm 2000–2100 + roundtrip UTC (2026-02-30 bị chặn) — packages/api/src/skeleton.ts:82-99; dùng cho `?date=`, path param `:date`, holiday `fromDate/toDate` (bản zod mirror: packages/api/src/contracts.ts:3650-3661) ✅.
- `isValidISODate` (web): cùng roundtrip, không bound năm — apps/web/src/lib/week-grid.ts:38-43 ✅; `validateAttendanceSearch` parse non-throw — apps/web/src/routes/_auth/attendance.tsx:52-64; test R1: apps/web/src/routes/_auth/attendance.test.tsx:95-149.
- `sessionAttendanceSaveSchema`: entries ≥1; lessonId min 1; attendance ∈ enum; note trim ≤255 default ""; strict; chặn lessonId trùng — packages/api/src/contracts.ts:1365-1382; test R1: packages/api/src/attendance.test.ts:57-114.
- `holidayDraftSchema`: name trim 2–100; ISO roundtrip 2 đầu; toDate ≥ fromDate; ≤30 ngày (cả hai đầu); scope enum; classIds ≤200 dedupe, bắt buộc ≥1 khi scope classes; mode enum; notify default true — packages/api/src/contracts.ts:3620-3708; test R1: packages/api/src/holiday-contracts.test.ts:21-152.
- `holidayApplySchema` = draft + `planHash` min 1 — packages/api/src/contracts.ts:3710-3714; test: packages/api/src/holiday-contracts.test.ts:138-148.

## §Errors

Toàn bộ wording + payload: xem Error Matrix (Mục 6 spec). Bổ sung kỹ thuật:

- `futureSession` giải thích chọn 422 (không 409 để tránh map "heal stale snapshot") — apps/server/src/routes/kernel.ts:326-333 ✅.
- `isRollbackableConstraintError`: `/UNIQUE|NOT NULL|FOREIGN KEY/i` → 409/hoàn tác tương ứng; lỗi khác phải ném — apps/server/src/routes/holidays.ts:443-448 ✅.
- Client phân loại lỗi PUT qua `DailyAttendanceApiError {status, reason, missing}` đọc `error ?? reason` từ body — apps/web/src/lib/repos/daily-attendance.ts:19-63 ✅.
- Client holiday ném Error mang `holidayErrorCode` = `error` trong body; undo kèm `touched[]` — apps/web/src/lib/repos/holidays.ts:30-45, apps/web/src/lib/repos/holidays.ts:87-120 ✅.

## §Business Rules

- BR-01 ánh xạ D2 + tombstone: packages/api/src/contracts.ts:1326-1358; packages/api/src/attendance.test.ts:17-55; packages/db/src/schema/settings.ts:32; negative-search unexcused_deduct (reverse-gaps OQ-03).
- BR-02 holiday không điểm danh: packages/db/src/schema/lesson.ts:48-57; apps/server/src/routes/kernel.ts:2947-2951, apps/server/src/routes/kernel.ts:3008-3009; apps/server/src/routes/daily-attendance.ts:52-59; test: apps/server/src/routes/holidays.test.ts:1201-1222.
- BR-04 trước-thắng: apps/server/src/routes/holidays.ts:162-183 (`orderBy(asc(createdAt), asc(id))`), packages/api/src/holiday-plan.ts:159-168; test: packages/api/src/holiday-plan.test.ts:167-184.
- BR-05 keptCompleted: packages/api/src/holiday-plan.ts:176-197; test: packages/api/src/holiday-plan.test.ts:185-234, packages/api/src/holiday-plan.test.ts:417-514; E2E: apps/e2e/specs/holiday-skip-and-kept-completed.spec.ts:197-240.
- BR-06 cursor: packages/api/src/holiday-plan.ts:218-262; test: packages/api/src/holiday-plan.test.ts:62-115, packages/api/src/holiday-plan.test.ts:257-310.
- BR-07/BR-08 undo: apps/server/src/routes/holidays.ts:695-704; packages/db/src/schema/organization-holiday.ts:114-121; test: apps/server/src/routes/holidays.test.ts:1844-1960.
- BR-12 legacy xem-chỉ: apps/server/src/routes/daily-attendance.ts:251-281; apps/web/src/components/attendance/attendance-session-row.tsx:137,230-274; test: apps/server/src/routes/daily-attendance.test.ts:196-268; apps/web/src/components/attendance/attendance-session-row.test.tsx:258-300.

## §Entities

- `lesson`: packages/db/src/schema/lesson.ts:29-80 — cột + index (`lesson_class_date_idx` dòng 78 phục vụ bucket theo ngày).
- `organization_holiday` / `_class` / `holiday_session_shift` / `holiday_session_cancel`: packages/db/src/schema/organization-holiday.ts:22-149 — unique indexes dòng 64-68, 100-111, 142-148.
- Migration: packages/db/src/migrations/0045_aspiring_thena.sql:1-2 (2 cột nullable); packages/db/src/migrations/0047_slim_nightmare.sql:1-42 (shift + holiday + class); packages/db/src/migrations/0050_bent_spectrum.sql:1-15 (cancel); test migration: apps/server/src/lesson-attendance-columns-migration.test.ts:66-105.
- Kết quả ghi PUT: `status = lessonStatusForAttendance(attendance)`, `attendance`, `attendanceNote` — apps/server/src/routes/kernel.ts:2993-3000.

## §Cross-repo hops

| Từ | Đến | Bằng chứng |
|---|---|---|
| Màn /attendance (web) | API server | apps/web/src/lib/repos/daily-attendance.ts:65-112 (GET/PUT), apps/web/src/lib/repos/holidays.ts:48-122 (preview/apply/delete) |
| Server route | packages/api contracts (zod) | apps/server/src/routes/daily-attendance.ts:1-11; apps/server/src/routes/holidays.ts:1-14 |
| Server | packages/db schema | apps/server/src/routes/daily-attendance.ts:12-17; apps/server/src/routes/holidays.ts:15-25 |
| Holiday planner | skeleton + vietnam-date (pure) | packages/api/src/holiday-plan.ts:28-33 |
| PUT attendance | hàm ánh xạ D2 + `resolveReminderScope` | apps/server/src/routes/kernel.ts:2916, apps/server/src/routes/kernel.ts:2997; apps/server/src/routes/dashboard-reminders.ts:275-281 |
| Feature schedule | holiday-locked + nhãn shift/cancel | apps/server/src/routes/kernel.ts:1996-2000, apps/server/src/routes/kernel.ts:2206-2210; apps/web/src/lib/repos/holidays.ts:124-182; packages/api/src/contracts.ts:1950-1952 (KernelSnapshot.holidayShifts/holidayCancels — grep) |
| Dashboard | GET /api/dashboard/reminders + CTA /attendance | apps/server/src/routes/dashboard-reminders.ts:80-149; apps/e2e/specs/daily-attendance.spec.ts:59-66, apps/e2e/specs/daily-attendance.spec.ts:180-198 |
| Bootstrap gate | 403 student/admin trên toàn /api kernel | apps/server/src/app.ts:205-237 |

## §Gaps

- GAP-1 i18n: negative-search (reverse-gaps.md) — không catalog; wording literal.
- GAP-2: không test cho 415 holiday (`grep -c 415 holidays.test.ts` = 0).
- GAP-3: không test GET daily cho ngày tương lai (hành vi suy từ code, không có assert thẳng).
- Không tìm thấy test nào cho wording UI (chuỗi literal) ngoài E2E assert chuỗi tại chỗ — R2 chỉ có 1 nguồn mỗi wording (xem GAP-1).
