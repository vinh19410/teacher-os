---
phase: 2
title: "Phase 2: Server Atomic Rescheduler & Route Integration"
status: done
priority: P1
effort: "2.5h"
dependencies: [1]
---

# Phase 2: Server Atomic Rescheduler & Route Integration

## Goal

Xây dựng dịch vụ đồng bộ nguyên tử `applyClassStartDateChange` (D1 `db.batch` + Statement 0 `CAS` guard đầy đủ + unwind `cancels` trước topo-sorted `shifts` + two-phase `CASE WHEN` remap tuân thủ trần `<= 100` binds của D1 + tái áp kỳ nghỉ tôn trọng lớp `paused` + đồng bộ Zoom & `lesson.zoom`) và tích hợp vào cả `PATCH /api/classes/:id` (kèm role gate `ta`) lẫn `POST /api/classes/:id/confirm-opening`.

## Files to Create / Modify

- Modify: `apps/server/src/routes/enrollment-activation.ts` (export `loadClassHolidays`, `loadClassShifts`, `loadClassCancels`)
- Modify: `apps/server/src/lib/zoom/session-zoom-service.ts` (export `syncZoomMeetingsAfterReschedule` hỗ trợ cả `movedMeetings` lẫn `deletedZoomMeetingIds` và truyền `time`/`dur` khi `schedule` đổi trên lớp 0 buổi)
- Create: `apps/server/src/lib/class-start-date-reschedule.ts` (`applyClassStartDateChange`, helper dựng SQL & đo giới hạn bind)
- Modify: `apps/server/src/routes/kernel.ts` (wire `PATCH /api/classes/:id` — kèm role gate `ta` cho `startDateChanged` — và `POST /api/classes/:id/confirm-opening` vào `applyClassStartDateChange`, thêm helper `startDateLockedResponse`)
- Modify: `apps/server/src/edit-class.test.ts` (cập nhật test #5 và bổ sung suite tests toàn diện + test trần `<= 100` binds trên lớp 52 buổi + test phân quyền `ta`)
- Modify: `apps/server/src/confirm-opening.test.ts` (cập nhật test khóa ngày khai giảng và bổ sung tests đổi `startDate` khi lớp chưa bắt đầu đã có `lesson` `upcoming`)

## Tasks & Steps

### Task 2.1 — Write TDD integration tests for `PATCH /api/classes/:id` and `POST /api/classes/:id/confirm-opening` (Red)

- **Goal:** Viết trước integration tests phủ đủ các kịch bản nghiệp vụ, concurrency/CAS, D1 bind limit, phân quyền `ta`, holiday dây chuyền/cancel, Zoom, lớp 0 buổi có auto-Zoom, lớp `manual`, và lớp `paused`.
- **Target files:** `apps/server/src/edit-class.test.ts`, `apps/server/src/confirm-opening.test.ts`.
- **Steps:**
  1. Trong `apps/server/src/edit-class.test.ts`:
     - Cập nhật test 5 (`apps/server/src/edit-class.test.ts:625`): giữ nguyên assertion `409 CLASS_SCHEDULE_LOCKED` cho `schedule` và `sessionsTotal` khi đã có `lesson` hoặc `class_session`; tách assertion khóa `startDate` sang kịch bản lớp **đã bắt đầu** (`completed`, `absent`, `attendance` non-null, hoặc `cancelled` không do holiday) trả về `409 CLASS_START_DATE_LOCKED`.
     - Thêm suite tests mới:
       - **Lớp `auto` chưa bắt đầu có 2 học viên `active`** (kể cả `startDate` cũ ở quá khứ nhưng chưa điểm danh buổi nào): `PATCH /api/classes/:id` đổi `startDate` (cả không gối ngày và gối ngày cũ-mới) trả `200`, cập nhật `class.startDate`, bảo toàn `lesson.id`/`topic`/`zoom`, cập nhật toàn bộ `lesson.date`/`lesson.day` khớp `skeletonOf`, không gửi notification; học viên thứ 3 kích hoạt sau nhận đúng bộ ngày mới.
       - **Dời `lesson_material` và `class_session_meeting` (Zoom) khi gối ngày** (không lỗi PK/UNIQUE), gọi Zoom `updateMeeting` với ngày mới; kiểm tra cả **lớp 0 học viên có auto-provisioned Zoom meetings**: (a) đổi chỉ `startDate` dời 5 meeting, (b) đổi đồng thời `schedule` + `sessionsTotal` (giảm từ 5 xuống 3 hoặc tăng lên 10) + `startDate` dời đúng `min(old, new)` meeting + xóa phần dư + sync `session_package.total`, (c) xóa rỗng `startDate: ""` thành công `200` và xóa 5 meeting cũ trên DB + Zoom API.
       - **Holiday `shift` dây chuyền (`A → B → C`) + `cancel` trên `makeupDate` + `newCancels` Zoom cleanup:** đổi `startDate` tháo `cancels` trước topo-sorted `shifts` không sinh buổi ma, re-mirror `lesson.zoom` khi buổi bù từng có Zoom, và khi ngày mới rơi vào kỳ nghỉ `mode = 'cancel'` thì clear `class_session_meeting` (`zoomMeetingId = null, joinUrl = ""`) + clear `lesson.zoom = ""` + gọi Zoom `deleteMeeting`.
       - **Lớp `manual` có `class_session` (chưa bắt đầu):** đổi `startDate` trả `200`, cập nhật `class.startDate`, giữ nguyên nguyên vẹn ngày `class_session` và `lesson` thủ công.
       - **Validation & lock boundaries:** lớp `auto` có `lesson` từ chối `startDate: ""` (`400`), `startDate < todayVN` (`400`), legacy undated `lesson.date IS NULL` (`409 CLASS_START_DATE_LOCKED`), lệch tập ngày sau `moveDate` giữa 2 học viên (`409 CLASS_START_DATE_LOCKED`), và vừa đổi `startDate` vừa đổi `schedule` (`409 CLASS_SCHEDULE_LOCKED`, không ghi 1 phần).
       - **Phân quyền `ta`:** <!-- Updated: Validation Session 1 & Red-Team RT-4 --> thành viên `membership.role = "ta"` gọi `PATCH /api/classes/:id` đổi `startDate` bị chặn `403 FORBIDDEN` (DB không đổi).
       - **Lớp `paused` chưa bắt đầu:** <!-- Updated: Red-Team RT-8 --> `PATCH /api/classes/:id` đổi `startDate` thành công `200`, dời `lesson` và KHÔNG áp mới kỳ nghỉ `scope = 'org'` được tạo trong lúc lớp đang `paused`.
       - **Lớp 52 buổi kèm `lesson_material` và `class_session_meeting` (D1 bind limit test):** <!-- Updated: Red-Team RT-1 --> đổi `startDate` thành công `200` và assert mọi câu SQL sinh ra trong batch đều có `<= 100` bound parameters.
  2. Trong `apps/server/src/confirm-opening.test.ts`:
     - Cập nhật test dòng 375–476: lớp đã bắt đầu (`lesson` `completed`) bị trả `409 CLASS_START_DATE_LOCKED` khi đổi `startDate` (nhưng vẫn chốt được khi giữ nguyên `startDate`).
     - Thêm test: lớp `auto` đã có học viên `active` (có `lesson` `upcoming` chưa bắt đầu) đổi `startDate` trong `POST /api/classes/:id/confirm-opening` (cả mode `initial` và `all`) trả `200`, cập nhật `class.startDate` + dời `lesson.date` + gửi email HTML chứa đúng ngày khai giảng mới; lớp `manual` có `class_session` chưa bắt đầu đổi `startDate` qua `confirm-opening` chỉ đổi `class.startDate` + gửi email, giữ nguyên `class_session.date`.
  3. Chạy vitest 2 file test để xác nhận fail (red phase).
- **Success criteria:** Các test mới thất bại đúng vì server vẫn khóa `startDate` bằng `hasRealClassSessions`.
- **Verify:** `pnpm --filter server test -- src/edit-class.test.ts src/confirm-opening.test.ts` exits non-zero with assertion failures; passing is a failure.

### Task 2.2 — Export shared holiday loaders & batch Zoom sync helper

- **Goal:** Tái sử dụng `loadClassHolidays` / `loadClassShifts` / `loadClassCancels` từ `enrollment-activation.ts` và thêm `syncZoomMeetingsAfterReschedule` vào `session-zoom-service.ts`.
- **Target files:** `apps/server/src/routes/enrollment-activation.ts` (lines 81–195), `apps/server/src/lib/zoom/session-zoom-service.ts`.
- **Steps:**
  1. Trong `apps/server/src/routes/enrollment-activation.ts`, thêm từ khóa `export` cho `loadClassHolidays`, `loadClassShifts`, `loadClassCancels` (giữ nguyên chữ ký và hành vi).
  2. Trong `apps/server/src/lib/zoom/session-zoom-service.ts`, thêm và export `syncZoomMeetingsAfterReschedule(deps: ZoomServiceDeps, input: { orgId: string; classId: string; className: string; movedMeetings: ReadonlyArray<{ zoomMeetingId: string; newDateISO: string; time: string; dur: number; topic: string }>; deletedZoomMeetingIds: ReadonlyArray<{ zoomMeetingId: string; dateISO: string }> }): Promise<void>`:
     - Với mỗi mục trong `deletedZoomMeetingIds`: gọi `deleteZoomMeetingBestEffort`.
     - Với mỗi mục trong `movedMeetings`: gọi `resolveZoomClient(deps).updateMeeting(m.zoomMeetingId, { topic: buildMeetingTopic(input.className, m.topic), agenda: buildMeetingAgenda(input.className, m.newDateISO, m.time), dateISO: m.newDateISO, time: m.time, durMinutes: m.dur })` bọc `try/catch` log `console.warn` (best-effort, không làm fail HTTP response sau khi DB đã commit).
- **Success criteria:** Không lặp lại logic query holiday; Zoom sync cập nhật và xóa đúng theo kết quả cuối sau batch DB.
- **Verify:** `pnpm --filter server check-types` (chạy cùng kiểm tra sau Task 2.4).

### Task 2.3 — Implement atomic rescheduler `apps/server/src/lib/class-start-date-reschedule.ts`

- **Goal:** Cài đặt `applyClassStartDateChange` an toàn trên Cloudflare D1 (`<= 100` binds/statement, `< 500` statements/batch, CAS chống mọi race, unwind `cancels` trước topo-sorted `shifts`, exact `substr` prefix check, xử lý lớp `paused` và `SCAN_CAP_DAYS`).
- **Target files:** `apps/server/src/lib/class-start-date-reschedule.ts`.
- **Steps:**
  1. Định nghĩa kết quả `ApplyClassStartDateResult`:
     - `{ ok: true; updatedRow: ClassUpdatedRow; zoomSyncPlan: ZoomRescheduleSyncPlan }` (`ClassUpdatedRow` trả đủ `id, name, level, schedule, sessionsTotal, startDate, mode, openingConfirmedAt, openingNote, openingAnnouncementVersion` qua `.returning(...)`). <!-- Updated: Red-Team RT-10 -->
     - `{ ok: false; error: "not-found" | "class-paused" | "opening-version-conflict" | "schedule-locked" | "start-date-locked" | "empty-start-date" | "holiday-scan-cap" | "conflict"; reason?: StartDateLockReason }`.
  2. Trong vòng lặp `for (let attempt = 1; attempt <= 3; attempt += 1)`:
     - **Pre-read tươi:** đọc `cls`, `hasCurriculum = Boolean(await findClassCurriculum(db, classId, orgId))`, `isManual = await isManualClass(...)`, toàn bộ `lessonRows` (`date, status, enrollmentId, attendance, attendanceNote, time, dur, topic, zoom`), `classSessionCount`, `shifts` (`loadClassShifts`), `cancels` (`loadClassCancels`), `allHolidays` (`loadClassHolidays`), `meetings` (`classSessionMeeting` gồm `id, date, joinUrl, zoomMeetingId, recordingUrl`), `materialRows` (count + dates).
     - Kiểm tra `cls` tồn tại (`not-found`), `requireActiveStatus && cls.status !== "active"` (`class-paused`), `expectedOpeningVersion !== undefined && (cls.openingAnnouncementVersion ?? 0) !== expectedOpeningVersion` (`opening-version-conflict`).
     - Kiểm tra `hasRealSessions = lessonRows.length > 0 || classSessionCount > 0`. Nếu `requireNoRealSessionsForOtherFields && hasRealSessions` → trả `{ ok: false, error: "schedule-locked" }`.
     - Kiểm tra `evaluateClassStartDateEditability({ schedule: cls.schedule, sessionsTotal: cls.sessionsTotal, isManual, lessons: lessonRows.map(r => ({ date: r.date, status: r.status, enrollmentKey: r.enrollmentId, attendance: r.attendance, attendanceNote: r.attendanceNote })), holidayCancelDates: cancels.map(c => c.date), holidayShifts: shifts })`. Nếu `!editable` → trả `{ ok: false, error: "start-date-locked", reason }`.
     - Nếu `lessonRows.length > 0 && !isManual && nextStartDate === ""` → trả `{ ok: false, error: "empty-start-date" }`.
     - **Xác định kỳ nghỉ sẽ áp lại (tôn trọng `#694` cho lớp `paused`):** <!-- Updated: Red-Team RT-8 -->
       - Nếu `cls.status === "active"`: `applicableHolidays = allHolidays`.
       - Nếu `cls.status !== "active"`: chỉ giữ lại các kỳ nghỉ vốn đã từng gắn vào lớp trước khi tạm dừng (`existingAppliedIds = new Set([...shifts.map(s => s.holidayId), ...cancels.map(c => c.holidayId)])`, lọc `allHolidays.filter(h => existingAppliedIds.has(h.id))`) — không bao giờ tự áp kỳ nghỉ `scope = 'org'` mới lên lớp đang `paused`.
     - **Chuẩn bị Statement 0 CAS guard đầy đủ:** <!-- Updated: Red-Team RT-3, RT-8 -->
       - Guard trên `classTable` (`id`, `orgId`, `startDate = cls.startDate`, `schedule = cls.schedule`, `sessionsTotal = cls.sessionsTotal`, `schedulingMode = cls.schedulingMode`, `status = cls.status`, `openingAnnouncementVersion = cls.openingAnnouncementVersion` nếu yêu cầu, `syllabus` `EXISTS`/`NOT EXISTS` theo `hasCurriculum`).
       - Guard số dòng thực tế: `lesson count = lessonRows.length`, `class_session count = classSessionCount`, `holiday_session_shift count = shifts.length`, `holiday_session_cancel count = cancels.length`, `class_session_meeting count = meetings.length`, `lesson_material count = materialRows.length`, và số kỳ nghỉ áp dụng `(SELECT count(*) FROM organization_holiday WHERE org_id = ? AND scope = 'org') + (SELECT count(*) FROM organization_holiday_class hc INNER JOIN organization_holiday h ON h.id = hc.holiday_id WHERE h.org_id = ? AND hc.class_id = ?) = allHolidays.length`.
       - Guard `NOT EXISTS` buổi đã bắt đầu/undated (bắt buộc không có dòng `lesson` nào `date IS NULL`, `status IN ('completed', 'absent')`, `attendance IS NOT NULL`, `attendance_note IS NOT NULL AND attendance_note != ''`, hoặc `status = 'cancelled' AND NOT EXISTS (SELECT 1 FROM holiday_session_cancel ...)`).
       - **Guard tập ngày `lesson.date` chống race `moveDate`:** <!-- Updated: Red-Team RT-3 --> Với `expectedLessonDates = [...new Set(lessonRows.map(r => r.date).filter(Boolean))]`: thêm câu guard đảm bảo không có dòng `lesson` nào mang `date` nằm ngoài `expectedLessonDates` (nếu `expectedLessonDates.length > 0`, dùng `chunkDateMappings(expectedLessonDates, 45)` để kiểm tra tổng các `count(*) WHERE date IN (chunk)` bằng `lessonRows.length` trong Statement 0 — tối đa 2 subquery cho 52–60 ngày, giữ tổng bind của Statement 0 `<= 90`!). Nếu tổng bind của Statement 0 vượt 85 (khi lớp 52 buổi + nhiều shift), tách guard tập ngày sang Statement 0b (`UPDATE class SET start_date = CASE WHEN <date-set-guard> THEN ${nextStartDate} ELSE NULL END WHERE id = ${classId} AND org_id = ${orgId}`) chạy ngay sau Statement 0 trong cùng `db.batch`!
     - **Nhánh A — Lớp `manual`, hoặc 0 `lesson` và (`meetings.length === 0 && materialRows.length === 0`):**
       - Statement 0 cập nhật `classTable` (`...classFieldPatch`, `startDate = CASE WHEN (<CAS guard>) THEN ${nextStartDate} ELSE NULL END`) `.returning(...)`.
       - Nếu `syncPackageTotal !== undefined`: nối câu `UPDATE session_package SET total = syncPackageTotal` (giống `kernel.ts:2427-2454`).
       - Thực thi `db.batch(statements)`; kiểm tra `const updatedRow = results[0]?.[0]; if (!updatedRow) return { ok: false, error: "not-found" };` <!-- Updated: Red-Team RT-3 -->.
     - **Nhánh B — Lớp `auto` có `lesson` (`materialized`) hoặc 0 `lesson` có `meetings`/`lesson_material` (`projected`):**
       - Gọi `planUnstartedStartDateShift({ oldSchedule: cls.schedule, newSchedule: nextSchedule ?? cls.schedule, oldStartDate: cls.startDate, newStartDate: nextStartDate, oldSessionsTotal: cls.sessionsTotal, newSessionsTotal: nextSessionsTotal ?? cls.sessionsTotal, existingLessonDates: ..., existingShifts: shifts })`. Nếu `!plan.ok` → `{ ok: false, error: "start-date-locked", reason: "invalid-schedule" }`.
       - Nếu `plan.mode === "materialized"`:
         - Chạy `planHolidayShift` tuần tự trên `applicableHolidays` đối với `plan.newBaseDates` (bọc `try/catch` → nếu ném lỗi `SCAN_CAP_DAYS` trả `{ ok: false, error: "holiday-scan-cap" }`). <!-- Updated: Red-Team RT-8 -->
       - Tính `zoomSyncPlan` (`movedMeetings`, `deletedZoomMeetingIds`) mô phỏng chính xác:
         - Mode `materialized`: Unwind `plan.unwindShiftsDesc` (nếu đụng ngày đã có meeting giữ bản gốc, đẩy `zoomMeetingId` bị ghi đè vào `deletedZoomMeetingIds`) → Bijection `plan.mappings` (nếu orphan meeting ở đích bị Pass 1.5 xóa đè, đẩy `zoomMeetingId` vào `deletedZoomMeetingIds`) → Re-apply `newShifts` → Xử lý `newCancels` (chuyển `zoomMeetingId` tại ngày bị hủy lễ sang `deletedZoomMeetingIds` và loại khỏi `movedMeetings`). <!-- Updated: Red-Team RT-6 -->
         - Mode `projected`: map `plan.mappings` (dùng `newScheduleParsed.start` và `scheduleDurationMinutes(newScheduleParsed)` cho `time`/`dur`), và đưa mọi meeting có `date ∈ plan.surplusOldDates` vào `deletedZoomMeetingIds` + `deleteMeetingDates`. <!-- Updated: Red-Team RT-5 -->
       - **Dựng 1 `db.batch` nguyên tử:**
         - **Statement 0 (+ Statement 0b nếu cần giữ `<= 90` binds):** CAS update `classTable` `.returning(...)`.
         - **Nếu `syncPackageTotal !== undefined`:** nối câu `UPDATE session_package SET total = syncPackageTotal` (dùng chung cho cả Nhánh B!). <!-- Updated: Red-Team RT-5 -->
         - **Step A (Unwind old holidays — chỉ khi `materialized` và có `cancels` / `shifts`):** <!-- Updated: Red-Team RT-2 -->
           1. **Hoàn tác `cancels` TRƯỚC:** với mỗi `cancel` trong `cancels`, `UPDATE lesson SET status = 'upcoming' WHERE org_id = ? AND class_id = ? AND date = cancel.date AND status = 'cancelled'`.
           2. **Hoàn tác `plan.unwindShiftsDesc` SAU (theo thứ tự topological):** với mỗi `shift`, dọn trùng + move `lesson_material` (`makeupDate → originalDate`), dọn trùng + move `class_session_meeting` (`makeupDate → originalDate`), `DELETE FROM lesson WHERE org_id = ? AND class_id = ? AND date = makeupDate AND status = 'upcoming'`, và `UPDATE lesson SET status = 'upcoming' WHERE org_id = ? AND class_id = ? AND date = originalDate AND status = 'holiday'`.
           3. Xóa toàn bộ `holiday_session_shift` và `holiday_session_cancel` của `classId`.
         - **Step B (Two-phase collision-safe remap + exact `substr` prefix check):** <!-- Updated: Red-Team RT-1, RT-5, RT-9 -->
           - Nếu `plan.mode === "projected"` và `plan.surplusOldDates.length > 0`: xóa `class_session_meeting` tại `surplusOldDates` (chunk `<= 50`).
           - Pass 1 (tiền tố `SHIFT_DATE_PREFIX = "__shift__:"`, ghép sẵn chuỗi `SHIFT_DATE_PREFIX + m.newDate` ở JS):
             - Nếu `materialized`: duyệt `chunkDateMappings(plan.mappings, LESSON_REMAP_CHUNK)` (`18` cặp → `<= 92` binds): `UPDATE lesson SET date = CASE date ... END, day = CASE date ... END WHERE org_id = ? AND class_id = ? AND date IN (...)`.
             - Nếu `materialRows.length > 0` và `plan.mappings.length > 0`: duyệt `chunkDateMappings(plan.mappings, DATE_ONLY_REMAP_CHUNK)` (`30` cặp → `<= 92` binds): `UPDATE lesson_material SET date = CASE date ... END WHERE org_id = ? AND class_id = ? AND date IN (...)`.
             - Nếu `meetings.length > 0` và `plan.mappings.length > 0`: duyệt `chunkDateMappings(plan.mappings, DATE_ONLY_REMAP_CHUNK)` (`30` cặp → `<= 92` binds): `UPDATE class_session_meeting SET date = CASE date ... END WHERE org_id = ? AND class_id = ? AND date IN (...)`.
           - Pass 1.5 (dọn đụng khóa với orphan row chưa gắn prefix): dùng `substr(date, 1, 10) != '__shift__:'` và subquery đối chiếu với `substr(date, 11)` của các dòng có `substr(date, 1, 10) = '__shift__:'`.
           - Pass 2 (gỡ tiền tố chính xác bằng `substr`, KHÔNG dùng `LIKE`):
             - `UPDATE <table> SET date = substr(date, 11) WHERE org_id = ? AND class_id = ? AND substr(date, 1, 10) = '__shift__:'` cho từng bảng đã chạm.
         - **Step C (Re-apply holidays — chỉ khi `materialized` và có `newShifts`/`newCancels`):** <!-- Updated: Red-Team RT-3, RT-6 -->
           - Mọi câu `INSERT` vào `holiday_session_shift` / `holiday_session_cancel` đều dùng guard `CASE WHEN EXISTS (SELECT 1 FROM class WHERE id = ? AND org_id = ?) AND EXISTS (SELECT 1 FROM organization_holiday WHERE id = ? AND org_id = ?) THEN <date> ELSE NULL END` (ngăn chèn mồ côi nếu lớp bị xóa hoặc holiday vừa xóa).
           - Cho mỗi `shift` trong `newShifts`: insert `holiday_session_shift`, update `lesson` ở `originalDate` → `'holiday'`, `INSERT INTO lesson ... SELECT` tạo buổi bù tại `makeupDate` (`'holmk-' || lower(hex(randomblob(12)))`), dọn trùng + move `lesson_material` và `class_session_meeting` (`originalDate → makeupDate`).
           - Cho mỗi `cancel` trong `newCancels`: insert `holiday_session_cancel`, update `lesson` ở `cancel.date` (`status = 'upcoming'`) → `status = 'cancelled', zoom = ''`, và cập nhật `class_session_meeting` ở `cancel.date` (`zoomMeetingId = null, joinUrl = '', recordingStatus = CASE WHEN recording_url != '' THEN 'ready' ELSE 'none' END`).
         - **Step D (Re-mirror `lesson.zoom` từ `class_session_meeting.join_url` — chỉ khi `materialized` và `meetings.length > 0`):** <!-- Updated: Red-Team RT-6 -->
           - 1 câu `UPDATE lesson SET zoom = COALESCE((SELECT m.join_url FROM class_session_meeting m WHERE m.org_id = lesson.org_id AND m.class_id = lesson.class_id AND m.date = lesson.date AND m.join_url != '' LIMIT 1), '') WHERE org_id = ? AND class_id = ? AND status = 'upcoming' AND zoom = '' AND EXISTS (SELECT 1 FROM class_session_meeting m WHERE m.org_id = lesson.org_id AND m.class_id = lesson.class_id AND m.date = lesson.date AND m.join_url != '')`.
       - Thực thi `const results = await db.batch(statements)`.
       - Kiểm tra tường minh `const updatedRow = (results[0] as ClassUpdatedRow[] | undefined)?.[0]; if (!updatedRow) return { ok: false, error: "not-found" };` <!-- Updated: Red-Team RT-3 -->.
       - Trả `{ ok: true, updatedRow, zoomSyncPlan }`.
     - Nếu `isRollbackableConstraintError(err)`: re-read trạng thái thực tế để phân biệt lỗi cứng (`not-found`, `class-paused`, `opening-version-conflict`, `schedule-locked`, `start-date-locked`) vs race tạm thời (`activateEnrollment`/`holidays`/`moveDate`/`materials`) — nếu lỗi cứng trả ngay, nếu race tạm thời và `attempt < 3` tiếp tục retry, hết 3 lần trả `{ ok: false, error: "conflict" }`.
- **Success criteria:** Batch nguyên tử 100%, mọi câu SQL `<= 100` binds ngay cả với lớp 52 buổi, không bao giờ đụng PK/UNIQUE hay tạo buổi ma.
- **Verify:** Xem verify tại Task 2.4 (chạy full integration test suite + bind-count assertion).

### Task 2.4 — Wire `PATCH /api/classes/:id` and `POST /api/classes/:id/confirm-opening` in `kernel.ts` (Green)

- **Goal:** Kết nối cả hai route trong `apps/server/src/routes/kernel.ts` vào `applyClassStartDateChange`, bổ sung role gate `ta` cho `startDateChanged`, và kích hoạt `syncZoomMeetingsAfterReschedule` qua `runZoomSyncTask`.
- **Target files:** `apps/server/src/routes/kernel.ts` (lines 2205–2864).
- **Steps:**
  1. Thêm helper `startDateLockedResponse(c: KernelContext)` trả `409` với `{ error: "Lớp đã bắt đầu học hoặc lịch không thể tự động dời nên không thể đổi ngày khai giảng.", code: CLASS_ERROR_CODES.START_DATE_LOCKED }`. Cập nhật thông báo `scheduleLockedResponse` thành `"Lớp đã có buổi học thực tế nên không thể đổi lịch học hoặc số buổi."`.
  2. Trong `PATCH /api/classes/:id` (`kernel.ts:2245–2474`):
     - Tách rõ `touchesStructure = scheduleChanged || nextSessionsTotal !== cls.sessionsTotal` và `startDateChanged = nextStartDate !== cls.startDate`.
     - <!-- Updated: Validation Session 1 & Red-Team RT-4 --> Nếu `startDateChanged && !canManageClassStatusInKernel(ctx.role)`: trả `c.json({ error: "forbidden", code: "FORBIDDEN" }, 403)`.
     - Nếu `!touchesStructure && !startDateChanged`: giữ nguyên fast-path update thông tin chung.
     - Nếu `touchesStructure && !startDateChanged`: giữ nguyên logic CAS cũ (`NOT EXISTS lesson` & `NOT EXISTS class_session` → `409 CLASS_SCHEDULE_LOCKED`).
     - Nếu `startDateChanged`: gọi `applyClassStartDateChange` (với `requireNoRealSessionsForOtherFields: touchesStructure`, `nextSchedule`, `nextSessionsTotal`, `syncPackageTotal: nextSessionsTotal !== cls.sessionsTotal ? nextSessionsTotal : undefined`, truyền toàn bộ `classFieldPatch` gồm `name, type, level, skills, mode, tuitionFee`, và `schedule`/`sessionsTotal` khi `touchesStructure`). Ánh xạ lỗi: `empty-start-date` → `400`, `holiday-scan-cap` → `422`, `schedule-locked` → `scheduleLockedResponse(c)`, `start-date-locked` → `startDateLockedResponse(c)`, `not-found` → `404`, `conflict` → `409`. Nếu thành công và `zoomSyncPlan` có mục cần đồng bộ, gọi `await runZoomSyncTask(deps, () => syncZoomMeetingsAfterReschedule(...))`.
  3. Trong `POST /api/classes/:id/confirm-opening` (`kernel.ts:2544–2864`):
     - Khi `input.mode !== "new_only" && startDateChanged`: gọi `applyClassStartDateChange` (với `requireActiveStatus: true`, `expectedOpeningVersion: currentVersion`, `classFieldPatch: { openingConfirmedAt: now, openingNote: effectiveNote, openingAnnouncementVersion: nextVersion }`).
     - Ánh xạ lỗi: `start-date-locked` → `startDateLockedResponse(c)`, `class-paused` → `classPausedResponse(c)`, `opening-version-conflict` → `409 OPENING_VERSION_CONFLICT`, `holiday-scan-cap` → `422`, `not-found` → `404`, `conflict` → `409`.
     - <!-- Updated: Red-Team RT-10 --> Khi thành công: dùng `updatedRow` (không dùng biến `cls` cũ đọc trước retry) cho cả `confirmedAt`, `announcementVersion`, `persistedStartDate`, `persistedNote` lẫn metadata email (`name`, `schedule`, `mode`, `sessionsTotal`, `level`) truyền vào `classOpeningConfirmedEvents`, chạy `runZoomSyncTask` nếu có `zoomSyncPlan`, rồi tiếp tục `emitNotifications`.
  4. Chạy integration tests `edit-class.test.ts`, `confirm-opening.test.ts`, `class-status.test.ts`, `holidays.test.ts`, `zoom-meeting.test.ts` + typecheck server.
- **Success criteria:** Toàn bộ tests server liên quan đều xanh; không còn nhánh nào để `class.startDate` lệch `lesson.date` hay vượt trần 100 binds của D1.
- **Verify:** `pnpm --filter server test -- src/edit-class.test.ts src/confirm-opening.test.ts src/class-status.test.ts src/routes/holidays.test.ts src/routes/zoom-meeting.test.ts && pnpm --filter server check-types` exits 0 with 0 failures.

## Failure Protocol

If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.

## Verification

- `pnpm --filter server test`
- `pnpm --filter server check-types`
- `pnpm exec biome check apps/server/src/lib/class-start-date-reschedule.ts apps/server/src/routes/kernel.ts apps/server/src/routes/enrollment-activation.ts apps/server/src/lib/zoom/session-zoom-service.ts apps/server/src/edit-class.test.ts apps/server/src/confirm-opening.test.ts`

## Risk & Rollback

- **Risk:** Lỗi đếm bind parameter của Cloudflare D1 hoặc sai độ dài prefix `substr`. Đã chia chunk `18` (`lesson`) và `30` (`material`/`meeting`) bảo đảm `<= 92 < 100` binds/statement, kiểm chứng bằng unit test đo số bind trên lớp 52 buổi, và dùng hằng số `SHIFT_DATE_PREFIX = "__shift__:"` với `substr(date, 1, 10)` thay cho `LIKE`.
- **Rollback:** Revert `kernel.ts`, `enrollment-activation.ts`, `session-zoom-service.ts` và xóa `class-start-date-reschedule.ts`.
