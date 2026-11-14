---
phase: 1
title: "Phase 1: Contracts and Server"
status: done
---

# Phase 1: Contracts and Server

> **Goal:** Định nghĩa contract 2 trạng thái (`"active" | "paused"`) + mã lỗi `CLASS_PAUSED`, mở `POST /api/classes/:id/status`, khóa nguyên tử D1 TOCTOU cho mọi thao tác giảng dạy và tuyển sinh khi lớp tạm dừng, và lọc lịch/điểm danh/nhắc việc phía server.
> **Skill hints:** TDD (`tdd`) — viết failing test trước khi sửa mã nguồn.

## Tasks

- [x] **Task 1.1: API Contracts (`@teacher-os/api`) & Snapshot Normalizers**
  - **Target files & symbols:**
    - `packages/api/src/contracts.ts`: `CLASS_STATUSES`, `ClassStatus`, `CLASS_ERROR_CODES` (`~L203`), `classStatusUpdateSchema`, `classStatusResponseSchema`, `dailyAttendanceResponseSchema` (`L1493-L1528`), `KernelClassRow` (interface tại `L1692-L1714`), `studentClassSchema` (`L2226-L2247`), rà soát thêm `.strict()` nếu tương thích cho `addManualSessionSchema` (`L1849-L1866`), `resendStudentInviteSchema` (`L3039-L3041`), entry của `sessionAttendanceSaveSchema` (`L1470-L1474`)
    - `apps/server/src/routes/snapshot.ts`: normalize `status` tại `L669` (`row.status === "paused" ? "paused" : "active"`)
    - `apps/server/src/routes/student-class.ts`: `StudentClassRow` (`L44-L55`), `toStudentClass` (`L119-L139`)
    - `packages/api/src/class-update-schema.test.ts`
  - **Steps:**
    1. Đọc toàn bộ `packages/api/src/class-update-schema.test.ts` (đặc biệt `L101-L121`) và `apps/server/src/routes/snapshot.ts` (`L650-L680`).
    2. Viết test đỏ trước cho: `CLASS_STATUSES` (`["active", "paused"]`), `CLASS_ERROR_CODES.CLASS_PAUSED === "CLASS_PAUSED"`, `classStatusUpdateSchema` (chỉ nhận `"active" | "paused"`, `.strict()` từ chối key lạ hoặc `"archived"`), `classUpdateSchema.strict()` vẫn từ chối `status`, `dailyAttendanceResponseSchema` chấp nhận `classPaused?: boolean`, `studentClassSchema.status` dùng `z.enum(CLASS_STATUSES).catch("active")` (chống crash khi gặp row legacy / deploy skew).
    3. Cập nhật `packages/api/src/contracts.ts` (`KernelClassRow.status: ClassStatus` là TS interface), `snapshot.ts:669` và `student-class.ts:132`. Kiểm tra mọi caller của `addManualSessionSchema`, `resendStudentInviteSchema`, `sessionAttendanceSaveSchema` trước khi bật `.strict()`.
  - **Success criteria:** `classUpdateSchema` vẫn từ chối `status`; schema input reject giá trị ngoài `"active" | "paused"`; `snapshot.ts` và `student-class.ts` pass `check-types` sạch.
  - **Verify:** `pnpm --filter @teacher-os/api test && pnpm --filter @teacher-os/api check-types`

- [x] **Task 1.2: Server Write Guards, Role Auth, D1 TOCTOU Atomicity & `POST /api/classes/:id/status`**
  - **Target files & symbols:**
    - `apps/server/src/routes/kernel.ts`: `findClass` (`L407-L423`), `findLessonAction` (`L432-L451`), `POST /students` (`L468-L635`), `POST /students/:id/resend-invite` (`L1127-L1349`), `POST /classes/:id/enroll` (`L1395-L1448`), `POST /enrollments/:enrollmentId/accept` (`L1458-L1475`), `POST /classes/:id/status` (mới, đặt gần `POST /classes/:id/notes` `L1722` & `POST /classes/:id/tuition-fee` `L1743`), `lessonStatusAction` (`L2158-L2229`), `POST /classes/:id/sessions` (`L2692-L2916`), `occurrenceStatusAction` (`L3092-L3143`), `POST /classes/:id/sessions/:date/check-in` (`L3145-L3163`), `PUT /classes/:id/sessions/:date/attendance` (`L3185-L3316`)
    - `packages/auth/src/role.ts` & `packages/auth/src/role.test.ts`: export `CLASS_STATUS_MANAGE_ROLES` & `canManageClassStatus(role)` fail-closed (cho phép `teacher | owner | admin | class_teacher`, từ chối `ta` / `null` / `undefined`)
    - `apps/server/src/routes/enrollment-activation.ts`: `materializeScheduleForEnrollment` (`L281-L654`, cụ thể `L294, L500, L614-L654`), `activateEnrollment` (`L669-L776`)
    - `apps/server/src/routes/syllabus.ts`: `findClassRow` (`L78-L89`), export cấp module `backfillStuckEnrollments` (`L108-L147`, break khi `"class-paused"`), callers `importCurriculumHandler` (`L440, L446, L631`) & `syncCurriculumHandler` (`L975`)
    - `apps/server/src/routes/holidays.ts`: `loadApplicableClasses` (`L113, L126-L136`), `shiftStatements` (`L312-L408`), `cancelStatements` (`L414-L441`), `POST /holidays` catch (`L615-L627`), giữ `DELETE /holidays/:id` (`L849-L861` undo) hoạt động bình thường không thêm guard `class.status = 'active'` (tránh nổ nhầm `409 makeup-touched`)
    - `apps/server/src/class-status.test.ts` (file test mới)
  - **Steps:**
    1. Đọc trước `enrollment-activation.ts:280-515`, `holidays.ts:95-145,305-445,840-870`, `packages/auth/src/role.ts:70-150`, và `syllabus.ts:75-150`.
    2. Viết failing integration tests trong `apps/server/src/class-status.test.ts` phủ đủ:
       - `POST /api/classes/:id/status` (active ↔ paused, idempotent 200 `{ ok: true, status }`, 400 cho `"archived"`/key lạ, 403 cho role `ta`, 404 khác org/không tồn tại); `PATCH /api/classes/:id` kèm `status` vẫn trả 400.
       - Bảo toàn 100% dòng `lesson` & `class_session` qua chu kỳ `active -> paused -> active` (gồm cả lớp `manual` và `legacy`).
       - Chặn `409 { code: "CLASS_PAUSED" }` khi `paused`: `POST /classes/:id/enroll` (`activateNow: false` & `true`), `POST /students` (kèm `classId`, chứng minh **không để rớt orphan `student`, `studentInvitation('accepted')`, hay `enrollment('active')` không có buổi** khi thua race `pause`), `POST /students/:id/resend-invite` (truyền `enrollmentId` trỏ lớp paused trả `409 CLASS_PAUSED` **không đốt cooldown hay ghi `lastInviteEmailAt`**; gọi không `enrollmentId` mà học viên chỉ có invite lớp paused -> `409 CLASS_PAUSED` thay vì `409 ALREADY_JOINED` hay gửi mail rỗng; ưu tiên invite lớp active nếu có), `POST /enrollments/:enrollmentId/accept` trên `kernel.ts`, `POST /classes/:id/sessions`, `POST /classes/:id/sessions/:date/check-in`, `POST /lessons/:id/check-in`, `PUT /classes/:id/sessions/:date/attendance`, `holidays` (`scope: "classes"` trỏ lớp `paused` trả `409 CLASS_PAUSED`).
       - Idempotency & D1 race checks: `activateEnrollment` trên enrollment đã `active` của lớp `paused` trả `200 { ok: true }`; nếu `E` vừa bị `DELETE` vừa `pause` lớp, `activateEnrollment` trả `404` chứ không `409 CLASS_PAUSED`; mô phỏng race đảm bảo `POST /classes/:id/sessions` trả `409 CLASS_PAUSED` (nếu class paused) và vẫn giữ `404` nếu class bị xóa / `409 date-occupied` nếu class còn `active`; `occurrenceStatusAction("completed")` thua race trả `409 CLASS_PAUSED` trong khi bucket đã chốt của lớp `active` vẫn idempotent `200 { updated: 0 }`; `PUT .../attendance` trả `409 CLASS_PAUSED` trước `roster-changed`.
       - Thao tác VẪN ĐƯỢC PHÉP khi `paused`: `DELETE /enrollments/:id`, `PUT /classes/:id/sessions/:date`, `DELETE /classes/:id/sessions/:date`, `POST /classes/:id/sessions/:date/cancel`, `POST /lessons/:id/cancel`, `POST /classes/:id/notes`, `POST /classes/:id/tuition-fee`, `PATCH /classes/:id`, sửa/sync giáo trình (không sinh `lesson` chui hay nổ `500` trên lớp paused), tạo assignment/study-pack/tuition cho lớp & HV active (theo phạm vi A2/A3 đã chốt).
    3. Thêm `canManageClassStatus(role)` fail-closed ở `packages/auth/src/role.ts` + test trong `packages/auth/src/role.test.ts`; trong `kernel.ts` tạo wrapper `role === undefined ? true : canManageClassStatus(role)`, helper `classPausedResponse(c)` và route `POST /classes/:id/status` (trả `403` cho `ta`); khi thực sự chuyển `paused -> active` (`UPDATE ... WHERE status = 'paused' RETURNING id`), gọi `backfillStuckEnrollments`.
    4. Cập nhật `findClass` chọn `status: classTable.status`, và `findLessonAction` (`L432-L451`) `innerJoin(classTable, ...)` chọn `classStatus: classTable.status`.
    5. Cập nhật `materializeScheduleForEnrollment` (`enrollment-activation.ts:294,500,614-654`): chọn `status: classTable.status`, thêm `${classTable.status} = 'active'` vào Statement 0 `CASE WHEN`, và trong `catch` đọc `[enrAfter, existingLesson, existingPkg, clsAfter]` theo đúng thứ tự: `existingLesson / existingPkg -> { ok: true }` → `!clsAfter -> "class"` → `clsAfter.status !== "active" -> "class-paused"` (thoát ngay không retry `500`) → `enrAfter[0]?.status !== "active" -> { ok: true }` → retry/throw.
    6. Cập nhật `activateEnrollment`:
       - Giữ `existingEnrollment.status === "active"` (`L696-L704`) trả `{ ok: true }` **trước** kiểm tra `cls.status`.
       - Pre-check `!cls` → `"class"`, `cls.status !== "active"` → `"class-paused"`.
       - CAS `UPDATE enrollment SET status = 'active' ... AND EXISTS (SELECT 1 FROM class WHERE ... AND status = 'active')`: khi `0 rows`, re-read `[currentEnrollment, clsAfter, existingLesson]` theo đúng thứ tự `!currentEnrollment -> "enrollment"`, `!clsAfter -> "class"`, `currentEnrollment.status === "active" && (clsAfter.status === "active" || existingLesson.length > 0) -> { ok: true }`, `clsAfter.status !== "active" -> "class-paused"`, fallback `"enrollment"`.
       - Nếu `materializeScheduleForEnrollment` fail vì `"class-paused"` hay `"class"` sau CAS, compensating rollback `UPDATE enrollment SET status = 'invited' WHERE id = ... AND org_id = ... AND status = 'active' AND NOT EXISTS (SELECT 1 FROM lesson WHERE enrollment_id = ...)` rồi trả `{ ok: false, error }`.
       - Map `result.error === "class-paused"` trong `kernel.ts:1464-1475` (`POST /enrollments/:enrollmentId/accept`) sang `classPausedResponse(c)` (`409`).
    7. Trong `POST /students` (khi có `classId`) và `POST /classes/:id/enroll`:
       - Luôn insert `enrollment.status` ở bước 1 bằng `CASE WHEN EXISTS (SELECT 1 FROM class WHERE id = ${cls.id} AND org_id = ${ctx.orgId} AND status = 'active') THEN 'invited' ELSE NULL END`.
       - Bọc `try/catch` (gồm cả `POST /classes/:id/enroll` `L1426`) phân giải `FOREIGN KEY` (`404`), `UNIQUE` (`ALREADY_IN_ORG` / `student already enrolled`), và `NOT NULL` (`clsAfter` missing → `404`, `clsAfter.status !== "active"` → `409 CLASS_PAUSED`).
       - Trong `POST /students`, trì hoãn flip `studentInvitation` sang `'accepted'` tới **sau** khi `activateEnrollment` thành công (khi `activateNow === true`); nếu `!act.ok`, chạy compensating cleanup (dùng điều kiện `NOT EXISTS (SELECT 1 FROM lesson ...)` & `NOT EXISTS (SELECT 1 FROM enrollment ...)` để không xóa nhầm học viên hợp lệ vừa chèn song song) và trả `409 CLASS_PAUSED` (hoặc `404` nếu lớp bị xóa). Tương tự ở `POST /classes/:id/enroll`, compensating delete `enrollment ('invited')` với `NOT EXISTS (SELECT 1 FROM lesson ...)` rồi trả `409 CLASS_PAUSED`.
    8. Trong `POST /classes/:id/sessions`: đặt `CASE WHEN EXISTS (SELECT 1 FROM class WHERE ... AND status = 'active') THEN ${dateISO} ELSE NULL END` ở `classSession.date`; trong `catch` (`isRollbackableConstraintError`), đọc lại `findClass` → nếu `!clsAfter` trả `404`; phân biệt lỗi `UNIQUE` (`date-occupied`) vs `NOT NULL` (`clsAfter.status !== "active"` → `409 CLASS_PAUSED`).
    9. Trong `POST /classes/:id/sessions/:date/check-in` (`L3154`), `occurrenceStatusAction("completed")`, `lessonStatusAction("completed")`, `PUT /classes/:id/sessions/:date/attendance`: pre-check `cls.status !== "active"` (`409 CLASS_PAUSED`); nhúng `EXISTS (... class.status = 'active')` vào `WHERE`; khi 0 dòng/mismatch (kể cả `rows.length === 0` ở `occurrenceStatusAction("completed")`), re-read `findClass`: `!clsAfter` → `404`, `clsAfter.status !== "active"` → `409 CLASS_PAUSED`, chỉ giữ fallback cũ (`200 { updated: 0 }`, `roster-changed`, `409 Conflict`) khi class vẫn `active`. Đồng thời cân nhắc bỏ phát `scheduleChangedEvents` khi `cls.status !== "active"` lúc hủy/sửa buổi để tránh gửi nhắc lịch cho học viên của lớp tạm dừng.
    10. Trong `POST /students/:id/resend-invite`: thêm `eq(classTable.orgId, ctx.orgId)` vào các join `classTable`; kiểm tra trạng thái lớp **trước** `L1180` và **trước** `cooldownMs` / CAS `lastInviteEmailAt` (`L1193`). Nếu không truyền `enrollmentId`: lọc `eq(classTable.status, "active")` ở `latestInvited` và `activeClass`; nếu đều rỗng mà học viên chỉ có enrollment lớp `paused` (không có lớp `active` nào), trả `409 CLASS_PAUSED` (không rơi vào `ALREADY_JOINED` hay gửi portal invite rỗng lớp).
    11. Trong `syllabus.ts`: chọn `status: classTable.status` trong `findClassRow` (`L78-L89`), export `backfillStuckEnrollments`, và bỏ qua `backfillStuckEnrollments` khi lớp `paused` (dừng loop nếu nhận `"class-paused"`). Trong `holidays.ts`: phân biệt `409 CLASS_PAUSED` trên `scope: "classes"` khi trỏ lớp paused (kể cả trong `catch` của `POST /holidays` `L618`, giữ `STALE_PREVIEW` cho `scope: "org"`) và nhúng `EXISTS (... class.status = 'active')` trong `shiftStatements` (`L318`) / `cancelStatements` (`L420`), **giữ nguyên `DELETE /holidays/:id` (`L849` undo) không gắn guard lớp active** để hoàn tác được kỳ nghỉ org-wide.
  - **Success criteria:** Tất cả write guards vượt qua race D1 không orphan row, không nuốt lỗi `CLASS_PAUSED`, không đốt cooldown hay backfill chui.
  - **Verify:** `pnpm --filter @teacher-os/auth test && pnpm --filter server exec vitest run src/class-status.test.ts`

- [x] **Task 1.3: Server Read Filters — Daily Attendance Bucket, Dashboard Reminders & Student Portal API**
  - **Target files & symbols:**
    - `apps/server/src/routes/daily-attendance.ts`: `queryDailyRows` (`L80-L172`, cả 2 nhánh `select`), `computeDailyAttendance` (`L183-L300`)
    - `apps/server/src/routes/dashboard-reminders.ts`: `attendanceRows` query (`L110-L132`)
    - `apps/server/src/routes/student-class.ts`: `loadNextSession` (`L83-L117`) hoặc callers trong `student.ts` (`L1018-L1174`)
    - `apps/server/src/routes/student.ts`: overview (`L1018-L1026`), class detail (`L1091-L1129`), `GET /schedule` (`L1141-L1264`), `POST /enrollments/:enrollmentId/accept` (`L1325-L1349`)
  - **Steps:**
    1. Viết failing tests trong `apps/server/src/class-status.test.ts` phủ:
       - `daily-attendance`: lớp `paused` bỏ toàn bộ `legacy` bucket; với `dated` bucket chưa dạy (`upcoming` 100%) thì ẩn hoàn toàn; với `dated` mixed bucket `[completed, upcoming]` giữ đủ học viên, gắn `classPaused: true`, **không** gắn `classPaused` cho lớp `active` (bảo toàn fixture `daily-attendance.test.ts`), và **không** cộng `classPaused` vào `counts.pending` (note rõ `counts.all = sessions.length` và bất biến `pending + completed <= all`).
       - `dashboard-reminders`: lớp `paused` không xuất hiện trong nhắc việc điểm danh.
       - `student`: `nextSession === null` trên cả `/overview`, `/classes/:classId`, và `/schedule` khi `row.status !== "active"`; `/api/student/schedule` chỉ giữ `completed | absent` cho lớp `paused`; `POST /api/student/enrollments/:enrollmentId/accept` trả `409 { code: "CLASS_PAUSED" }` khi `invited` và vẫn `200 { ok: true }` khi `alreadyActive`.
    2. Sửa `queryDailyRows` (cả 2 nhánh `select` trong `daily-attendance.ts`) chọn `classStatus: classTable.status`; trong `computeDailyAttendance`, bỏ toàn bộ `legacy` bucket của lớp `!== "active"`, và cho `dated` bucket của lớp `!== "active"`: bỏ nếu `!rows.some(r => r.status === "completed" || r.status === "absent")`, ngược lại giữ full `rows`, chỉ thêm `...(isPaused ? { classPaused: true } : {})`, và `pending` chỉ đếm `!s.recorded && !s.classPaused`.
    3. Sửa `dashboard-reminders.ts` thêm `eq(classTable.status, "active")` ở `attendanceRows`.
    4. Sửa `student.ts` (`L1022, L1093, L1169`): ép `nextSession = null` khi `row.status !== "active"`; trên `/api/student/schedule`, select `classStatus: classTable.status` và giữ only `completed | absent` cho lớp `!== "active"`; map `result.error === "class-paused"` ở `POST /student/enrollments/:enrollmentId/accept` sang `409 { error, code: CLASS_ERROR_CODES.CLASS_PAUSED }`.
  - **Success criteria:** Toàn bộ API contracts & server unit/integration tests xanh.
  - **Verify:** `pnpm --filter @teacher-os/api test && pnpm --filter server test && pnpm --filter server check-types`

## Failure Protocol

If any verification step fails unexpectedly:
1. STOP immediately — do NOT touch code yet.
2. Invoke `kongming` via `invoke_subagent(TypeName="kongming", Model="inherit")` with the failing command, exact stderr/test diff, and relevant files.
3. Wait for diagnosis and apply the verified fix.
4. Re-run the full verification gate to confirm clean pass.
