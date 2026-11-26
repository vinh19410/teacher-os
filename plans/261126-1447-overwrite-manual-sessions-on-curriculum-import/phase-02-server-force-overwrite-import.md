---
phase: 2
title: "Phase 2: Server Force-Overwrite Import"
status: pending
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: Server Force-Overwrite Import

## Goal

Cập nhật `POST /api/classes/:id/curriculum/import` trong `apps/server/src/routes/syllabus.ts` để báo cáo chi tiết buổi thủ công trùng ngày / khác ngày kèm `overwriteHash`, kiểm tra RBAC (`canManageClassStatus`), chặn buổi đã điểm danh/hoàn thành và lớp thiếu lịch/ngày khai giảng hợp lệ, đồng thời thực hiện ghi đè nguyên tử khi `overwriteManualSessions: true` kèm upsert link Zoom thủ công vào `class_session_meeting`, bảo toàn `recordingUrl`, đồng bộ Zoom Cloud (`updateMeeting` + `deleteMeeting`), và khóa CAS đầy đủ chống mọi race condition.

## Files to Create / Modify

- Modify: `apps/server/src/routes/syllabus.ts`
- Modify: `apps/server/src/lib/syllabus-curriculum.ts` (chunk `findExistingMaterialIds` theo lô 50 dưới trần 100 bind params của Cloudflare D1 — <!-- Red Team RT-8 -->)
- Modify: `apps/server/src/manual-sessions.test.ts` (thêm bộ test TDD cho force-overwrite, RBAC `ta`, `overwriteHash`, completed guard, legacy schedule/startDate, materials/Zoom/recording, holidays, race conditions, và bảo vệ lớp auto cũ)

> Lưu ý (<!-- Red Team RT-2 -->): **Không cần sửa `enrollment-activation.ts`** vì link Zoom dán thủ công (`class_session.zoom`) được upsert trực tiếp vào `class_session_meeting` ngay trong cùng `db.batch` nguyên tử — `materializeScheduleForEnrollment` tự đọc nhất quán cho mọi học viên hiện tại, học viên mới, lớp `paused` resume sau và nhánh self-heal #670.

## Tests Before (TDD)

Thêm nhóm test mới vào `apps/server/src/manual-sessions.test.ts` (red trước khi sửa code):
1. **Phát hiện trùng ngày & `overwriteHash` (`overwriteManualSessions` không truyền / `false`):**
   - Lớp manual có 2 buổi thủ công: 1 buổi trùng ngày dạy hiệu lực của giáo trình (`startMonday`), 1 buổi ở ngày không trùng (`startMonday + 1`).
   - Gọi `POST /api/classes/:id/curriculum/import` với `{ templateId }` → `409` với `code: "MANUAL_SESSIONS_EXIST"`, `reason: "has-manual-sessions"`, `conflictingDates: [startMonday]`, `otherManualDates: [startMonday + 1]`, `manualSessionCount: 2`, và `overwriteHash` (chuỗi không rỗng). DB không đổi.
   - Gọi `{ templateId, overwriteManualSessions: true }` thiếu `overwriteHash` hoặc sai `overwriteHash` (hoặc sau khi có thêm buổi thủ công mới) → `409 MANUAL_SESSIONS_EXIST` kèm tập ngày và `overwriteHash` mới nhất (chống cross-request TOCTOU — <!-- Red Team RT-3 -->).
2. **RBAC chặn vai trò `ta` thực hiện destructive overwrite (`403 FORBIDDEN`) (<!-- Red Team RT-1 -->):**
   - Thành viên org có `role = "ta"` gửi `{ templateId, overwriteManualSessions: true, overwriteHash }` → `403 { code: "FORBIDDEN" }`; toàn bộ `class_session`, `lesson_material`, `class_session_meeting` giữ nguyên.
3. **Ghi đè thành công trên lớp 0 học viên + bảo toàn Zoom (cả Zoom API lẫn link Zoom dán tay) + bảo toàn `recordingUrl` (<!-- Red Team RT-2, RT-4, RT-7 -->):**
   - Lớp manual có:
     - Buổi trùng ngày `startMonday` có `class_session_meeting` (`zoomMeetingId: "zm-keep"`, `joinUrl: "https://zoom.us/j/keep"`) lúc `14:00` / `60p` / topic `"Buổi nháp"` (khác lịch lớp `19:00–20:30` 90p).
     - Buổi trùng ngày thứ 2 (`startMonday + 7`) có link Zoom dán tay trong `class_session.zoom = "https://zoom.us/j/manual"` (không có dòng `class_session_meeting`).
     - Buổi ngày khác `startMonday + 1` có `class_session_meeting` (`zoomMeetingId: "zm-del"`, `recordingUrl: ""`) và `lesson_material` gắn riêng.
     - Buổi ngày khác `startMonday + 2` có `class_session_meeting` (`zoomMeetingId: "zm-rec"`, `recordingUrl: "https://zoom.us/rec/share/1"`).
     - 1 `class_material` (tài liệu chung của lớp).
   - Gọi với `{ templateId, overwriteManualSessions: true, overwriteHash }` → `201 { id: copyId }`.
   - Kiểm tra DB & Zoom mock:
     - `class.schedulingMode === "auto"`, `class.sessionsTotal === 3`, `class.syllabusId === copyId`, `class_session` = 0 dòng, `lesson_material` = 0 dòng, `class_material` còn nguyên.
     - `class_session_meeting` tại `startMonday` còn nguyên; mock Zoom client nhận `updateMeeting("zm-keep", ...)` với giờ `19:00` và thời lượng `90` phút!
     - `class_session_meeting` tại `startMonday + 7` được upsert với `joinUrl === "https://zoom.us/j/manual"`, `zoomMeetingId === null` (nên 0-student UI và học viên ghi danh sau đều thấy link này!).
     - `class_session_meeting` tại `startMonday + 1` bị xóa khỏi DB và mock Zoom client nhận `deleteMeeting("zm-del")`.
     - `class_session_meeting` tại `startMonday + 2` KHÔNG bị xóa dòng recording: `recordingUrl` giữ nguyên, `zoomMeetingId === null`, `joinUrl === ""`, `recordingStatus === "ready"`, và mock Zoom client nhận `deleteMeeting("zm-rec")`.
4. **Ghi đè thành công trên lớp có học viên `active` + kỳ nghỉ lễ `mode: "shift"` + dọn `makeupDate` cũ (<!-- Red Team RT-4 -->):**
   - Lớp manual có 2 học viên `active`, buổi thủ công ở `startMonday` + buổi trùng ở `startMonday + 7` + kỳ nghỉ lễ org `mode: "shift"` vào `startMonday` (dời buổi 1 sang `startMonday + 21`), cộng thêm 1 dòng `class_session_meeting` nằm ở `makeupDate` cũ không thuộc `activeDates`.
   - Kiểm tra `409 MANUAL_SESSIONS_EXIST`: `startMonday` (ngày nghỉ lễ đã dời) KHÔNG nằm trong `conflictingDates` (nằm ở `otherManualDates`), chỉ ngày dạy hiệu lực `startMonday + 7` nằm trong `conflictingDates` và được giữ Zoom; `class_session_meeting` ở `startMonday` (ngày `holiday`) và ở `makeupDate` cũ đều được dọn sạch, không kẹt trên buổi `holiday`.
   - Sau overwrite: mỗi học viên có 3 buổi hiệu lực + 1 buổi `holiday` tại `startMonday` + buổi bù tại `startMonday + 21`, `session_package.total = [3, 3]`, `lesson.topic === ""`, `lesson.zoom` ở `startMonday + 7` nhận `joinUrl` được giữ lại.
5. **Chặn buổi thủ công đã điểm danh / hoàn thành (`MANUAL_SESSIONS_COMPLETED`), kể cả `date: null` (<!-- Red Team RT-8 -->):**
   - Buổi thủ công đã `check-in` (`status = "completed"`) hoặc đã chấm vắng (`attendance = "excused"`, `status = "absent"`), và ca biên có `lesson` `status = "completed", date = null`.
   - Gọi cả `{ templateId }` LẪN `{ templateId, overwriteManualSessions: true, overwriteHash }` → `409` với `code: "MANUAL_SESSIONS_COMPLETED"`, `reason: "has-completed-manual-sessions"`, `completedDates`. DB giữ nguyên 100%.
6. **Chặn lỗi biên template & lớp legacy (`422`) (<!-- Red Team RT-5, RT-6 -->):**
   - Template 0 bài với `overwriteManualSessions: true` → `422 CURRICULUM_EMPTY_TEMPLATE`.
   - Template 53 bài → `422 CURRICULUM_TOO_MANY_LESSONS`.
   - Template có link tài liệu bị xóa (kể cả khi template có >100 links khác nhau — kiểm chứng chunking D1) → `422 CURRICULUM_MATERIAL_NOT_FOUND`.
   - Lớp manual có `schedule` legacy (`"T2 19:00"`) hoặc `startDate: ""` / `"01/09"` → `422 CURRICULUM_INVALID_CLASS_SCHEDULE` (không xóa buổi thủ công).
   - Tổ chức có kỳ nghỉ lễ phủ kín 364 ngày → `422 CURRICULUM_HOLIDAY_SCAN_CAP` (không 500).
7. **Bảo vệ lớp `auto` đã có `lesson` thật (0 `class_session`):**
   - Lớp `auto` có học viên + 3 `lesson` thật → gỡ giáo trình → gọi `curriculum/import` với `{ templateId: tpl5Id, overwriteManualSessions: true }` → `201`, giữ nguyên 3 `lesson` cũ và `sessionsTotal = 3`.
8. **Lớp đang `paused` có buổi thủ công chưa điểm danh (cả link Zoom dán tay) (<!-- Red Team RT-2, RT-4 -->):**
   - Gọi `{ templateId, overwriteManualSessions: true, overwriteHash }` trên lớp `paused` (không áp mới `scope = 'org'` holiday lúc tính conflict) → `201`, xóa buổi thủ công, upsert link Zoom dán tay vào `class_session_meeting`, đặt `auto` / `sessionsTotal = 3`, `session_package.total = 0`, chưa backfill khi đang paused; khi resume (`POST /classes/:id/status` → `"active"`), `backfillStuckEnrollments` tự sinh đủ 3 `lesson` (mang đúng link Zoom đã upsert) + `session_package.total = 3`.
9. **Chống race condition nguyên tử (<!-- Red Team RT-3, RT-8 -->):**
   - Race A (`check-in` vs `overwrite`): hoặc `overwrite` thắng sạch, hoặc `check-in` thắng và `overwrite` rollback trả `409 MANUAL_SESSIONS_COMPLETED`; không mất điểm danh, không trạng thái lai.
   - Race B (`POST /sessions` hoặc `moveDate` vs `overwrite`): CAS phát hiện thay đổi tập ngày `class_session`, rollback trả `409 MANUAL_SESSIONS_EXIST` kèm danh sách ngày và `overwriteHash` mới nhất.
   - Race C (`DELETE /sessions/:date` xóa buổi cuối về `0` vs `overwrite`): CAS rollback, nhánh `catch` thấy `currentCs.length === 0` trả `409 CLASS_STATE_CHANGED` (không 500, không `manualSessionCount: 0`).
   - Race D (`POST /sessions` chen vào lúc lớp 0 buổi gọi `curriculum/import` không có `overwriteManualSessions`): nhánh `catch` `raceCs` trả `409 MANUAL_SESSIONS_EXIST` **đầy đủ** `conflictingDates`, `otherManualDates`, `manualSessionCount`, `overwriteHash`.

## Refactor / Implementation

1. Trong `apps/server/src/lib/syllabus-curriculum.ts` (<!-- Red Team RT-8 -->):
   - Chunk truy vấn `inArray(material.id, chunk)` trong `findExistingMaterialIds` theo kích thước lô `50` (tránh vượt trần 100 bind params của D1 khi template có >98 link tài liệu).
2. Trong `apps/server/src/routes/syllabus.ts`:
   - Mở rộng chữ ký `syllabusRoutes(deps: ZoomRouteDeps)` (`kernel.ts:5075` đã truyền đủ `deps`).
   - Thêm helper `canManageClassStatusInKernel(role: string | undefined)` (khớp `kernel.ts:286-288`: `role === undefined ? true : canManageClassStatus(role)`) (<!-- Red Team RT-1 -->).
   - Mở rộng `findClassRow` select thêm `name`, `schedule`, `startDate`.
   - Xây dựng helper `computeOverwriteHash(input: { classId: string; templateId: string; startDate: string; schedule: string; manualDates: readonly string[] }): Promise<string>` dùng `crypto.subtle.digest("SHA-256", ...)` xuất hex (<!-- Red Team RT-3 -->).
   - Xây dựng helper dùng chung `loadApplicableHolidaysForImport(db, orgId, cls)` (nếu `cls.status === "paused"`, lọc giữ chỉ các kỳ nghỉ đã từng áp lên lớp theo `holiday_session_shift`/`holiday_session_cancel` giống `class-start-date-reschedule.ts:391-402`; nếu `active`, lấy đủ `loadClassHolidays`) (<!-- Red Team RT-4 -->).
   - Xây dựng helper dùng chung `buildManualConflictReply(...)` để trả `409 MANUAL_SESSIONS_COMPLETED` (kiểm tra `settledLessons.length > 0`, kể cả `date: null`), `422 CURRICULUM_INVALID_CLASS_SCHEDULE`, `422 CURRICULUM_HOLIDAY_SCAN_CAP`, hoặc `409 MANUAL_SESSIONS_EXIST` kèm đủ `conflictingDates`, `otherManualDates`, `manualSessionCount`, `overwriteHash` — dùng chung cho pre-check, `catch` nhánh overwrite, VÀ `catch` `raceCs` nhánh 0 buổi (<!-- Red Team RT-3, RT-4, RT-5, RT-6, RT-8 -->).
   - Trong `importCurriculumHandler`:
     - Đọc đầy đủ `existingCs` (`id`, `date`, `time`, `dur`, `topic`, `zoom`) và `existingLessons` (`id`, `date`, `status`, `attendance`, `attendanceNote`).
     - Khi `existingCs.length > 0`:
       1. Nếu `body.data.overwriteManualSessions === true && !canManageClassStatusInKernel(ctx.role)` → trả `403 { error: "Chỉ giáo viên phụ trách hoặc quản trị viên mới có quyền ghi đè buổi học thủ công.", code: "FORBIDDEN" }` (<!-- Red Team RT-1 -->).
       2. Kiểm tra `lessonCount > 52` (`422 CURRICULUM_TOO_MANY_LESSONS`), `lessonCount === 0` (`422 CURRICULUM_EMPTY_TEMPLATE`), và `findMissingLinkedMaterial(db, ctx.orgId, tree.links)` (`422 CURRICULUM_MATERIAL_NOT_FOUND`).
       3. Kiểm tra `settledLessons = existingLessons.filter(isManualLessonSettled)` → nếu `settledLessons.length > 0`, trả `409 MANUAL_SESSIONS_COMPLETED` kèm `completedDates` (các `date` non-null distinct sorted).
       4. Tính `projection = projectCurriculumDates({ schedule: cls.schedule, startDate: cls.startDate, lessonCount, holidays: applicableHolidays, todayISO: vietnamTodayISO() })`:
          - Nếu `!projection.ok`:
            - `holiday-scan-cap` → `422 CURRICULUM_HOLIDAY_SCAN_CAP`.
            - `invalid-schedule` / `invalid-start-date` → `422 CURRICULUM_INVALID_CLASS_SCHEDULE`.
          - Tính `{ conflictingDates, otherManualDates } = classifyManualSessionDates(manualDates, projection.activeDates)` và `expectedHash = await computeOverwriteHash(...)`.
       5. Nếu `!body.data.overwriteManualSessions || body.data.overwriteHash !== expectedHash`:
          - Trả `409 MANUAL_SESSIONS_EXIST` kèm `conflictingDates`, `otherManualDates`, `manualSessionCount: existingCs.length`, `overwriteHash: expectedHash`.
       6. Khi `body.data.overwriteManualSessions === true && body.data.overwriteHash === expectedHash`:
          - Đọc toàn bộ `existingMeetings` của lớp (`SELECT id, date, zoomMeetingId, joinUrl, recordingUrl FROM class_session_meeting WHERE org_id = ? AND class_id = ?` — chỉ 2 bind params) (<!-- Red Team RT-4, RT-8 -->).
          - Phân loại `existingMeetings` theo `activeDateSet = new Set(projection.activeDates)`:
            - `keptMeetings`: `activeDateSet.has(m.date)` → giữ nguyên dòng DB; nếu `m.zoomMeetingId` khác null thì thêm vào `zoomSyncPlan.movedMeetings` kèm lịch mới (`parsedSchedule.start`, `scheduleDurationMinutes(parsedSchedule)`, `topic` bài giáo trình theo ordinal) để `syncZoomMeetingsAfterReschedule` đồng bộ Zoom Cloud (<!-- Red Team RT-7 -->).
            - `meetingsToDeleteRows`: `!activeDateSet.has(m.date) && m.recordingUrl === ""` → `DELETE` trong batch + đưa `zoomMeetingId` vào `zoomSyncPlan.deletedZoomMeetingIds`.
            - `meetingsToClearJoinOnly`: `!activeDateSet.has(m.date) && m.recordingUrl !== ""` → `UPDATE SET zoomMeetingId = null, joinUrl = '', recordingStatus = 'ready'` trong batch + đưa `zoomMeetingId` vào `zoomSyncPlan.deletedZoomMeetingIds` (bảo toàn `recordingUrl` — <!-- Red Team RT-4 -->).
          - Với các `cs` thuộc `conflictingDates` có `cs.zoom.trim() !== ""`: chuẩn bị câu `INSERT INTO class_session_meeting (...) VALUES (...) ON CONFLICT (class_id, date) DO UPDATE SET join_url = CASE WHEN class_session_meeting.join_url = '' THEN excluded.join_url ELSE class_session_meeting.join_url END` trong cùng batch (<!-- Red Team RT-2 -->).
          - Dựng 1 `db.batch(statements)` nguyên tử duy nhất theo đúng thứ tự:
            1. `buildImportBatch(...)`
            2. `UPDATE classTable` set `syllabusId = copyId`, `sessionsTotal = lessonCount`, `schedulingMode = CASE WHEN <CAS_GUARD> THEN 'auto' ELSE NULL END`, trong đó `<CAS_GUARD>` kiểm tra đồng thời (<!-- Red Team RT-3 -->):
               - `class.start_date = cls.startDate AND class.schedule = cls.schedule AND class.status = cls.status`
               - `NOT EXISTS (settled lesson for orgId & classId)`
               - `(SELECT count(*) FROM class_session WHERE orgId & classId) = existingCs.length` AND tổng số dòng khớp các lô `date IN (...)` (chunk ≤ 50) bằng `existingCs.length` (chống `moveDate` & `DELETE+POST`!)
               - `(SELECT count(*) FROM class_session_meeting WHERE orgId & classId) = existingMeetings.length`
            3. `DELETE FROM lesson WHERE org_id = ... AND class_id = ...`
            4. `DELETE FROM class_session WHERE org_id = ... AND class_id = ...`
            5. `DELETE FROM lesson_material WHERE org_id = ... AND class_id = ...`
            6. `DELETE FROM holiday_session_shift WHERE org_id = ... AND class_id = ...`
            7. `DELETE FROM holiday_session_cancel WHERE org_id = ... AND class_id = ...`
            8. Xóa `meetingsToDeleteRows` (chunk theo `DATE_ONLY_REMAP_CHUNK` = 30), cập nhật `meetingsToClearJoinOnly` (chunk theo 30), và upsert `manualZoomToPreserve` vào `class_session_meeting` (tạo mới hoặc giữ `joinUrl` sẵn có).
            9. `UPDATE session_package SET total = 0 WHERE org_id = ... AND enrollment_id IN (SELECT id FROM enrollment WHERE org_id = ... AND class_id = ...)`
          - Trong `catch` khi `isRollbackableConstraintError(err)`:
            - Giữ check FK missing material, `CURRICULUM_ALREADY_EXISTS`.
            - Đọc tươi `clsLatest`, `latestCs`, `latestLessons`:
              - Nếu `latestLessons.some(isManualLessonSettled)` → trả `409 MANUAL_SESSIONS_COMPLETED` kèm `completedDates`.
              - Nếu `latestCs.length > 0` → trả `buildManualConflictReply(...)` (kèm `overwriteHash` mới nhất).
              - Nếu `latestCs.length === 0` → trả `409 CLASS_STATE_CHANGED` (không 500, không `manualSessionCount: 0` — <!-- Red Team RT-3 -->).
          - Sau khi batch thành công:
            - Chạy best-effort `runZoomSyncTask(deps, () => syncZoomMeetingsAfterReschedule(zoomDepsFrom(deps), zoomSyncPlan))` nếu có meeting cần xóa/cập nhật (<!-- Red Team RT-7 -->).
            - Nếu `clsAfter?.status === "active" && lessonCount > 0`: gọi `backfillStuckEnrollments(db, ctx.orgId, classId)`.
            - Trả `201 { id: copyId }`.
     - Khi `existingCs.length === 0`: giữ nguyên nhánh non-destructive #670 (không bao giờ xóa `lesson` của lớp `auto`), nhưng cập nhật nhánh `catch` `raceCs` gọi `buildManualConflictReply(...)` để trả đủ metadata + `overwriteHash` (<!-- Red Team RT-8 -->).
   - Củng cố `backfillStuckEnrollments` (`apps/server/src/routes/syllabus.ts:80-94`): bắt lỗi từng học viên (trừ `class-paused` thì `break`) và retry tối đa 1 lần cho lỗi tạm thời để giảm rủi ro học viên bị bỏ sót giữa vòng lặp (<!-- Red Team RT-9 -->).

## Tests After

Chạy toàn bộ test suite server (`manual-sessions.test.ts`, `class-status.test.ts`, `kernel.test.ts`, `sync-curriculum.test.ts`, toàn bộ `apps/server`) và kiểm tra typecheck server.

## Todo

- [x] Chunk `findExistingMaterialIds` trong `apps/server/src/lib/syllabus-curriculum.ts`
- [x] Thêm 9 nhóm test TDD vào `apps/server/src/manual-sessions.test.ts` (red)
- [x] Cài đặt logic RBAC, `overwriteHash`, holiday projection, CAS guard đầy đủ, Zoom upsert/sync và atomic force-overwrite trong `apps/server/src/routes/syllabus.ts` (green)
- [x] Chạy toàn bộ test suite server và typecheck

## Regression Gate & Verification

```bash
pnpm --filter server test && pnpm --filter server check-types
```

## Risk & Rollback

- **Risk 1 (D1 bind-parameter ceiling):** Mọi câu `IN (...)` đều được chunk (≤ 30 cho `class_session_meeting`, ≤ 50 cho `class_session` và `findExistingMaterialIds`); pre-read `class_session_meeting` chỉ dùng 2 bind params `(orgId, classId)`.
- **Risk 2 (Backfill partial failure sau commit):** Nhánh `backfillStuckEnrollments` retry 1 lần trên từng học viên; ngoài ra nhánh self-heal #670 ở `importCurriculumHandler` và resume lớp ở `POST /classes/:id/status` vẫn tự hồi phục các enrollment có `0 lesson` + `package.total = 0`.
- **Rollback:** Revert các thay đổi trong `apps/server/src/routes/syllabus.ts` và `apps/server/src/lib/syllabus-curriculum.ts` (không có DB migration).
