---
phase: 1
title: "Phase 1: Server — Helper sinh lịch, chuyển đổi manual/auto & khóa race (TDD)"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Server — Helper sinh lịch, chuyển đổi manual/auto & khóa race (TDD)

<!-- Updated: Red Team & Validation Session 1 - Applied RT-1..RT-8: org_id guard on session_package join/upsert + reset on remove, dual-mode Statement 0 class/lesson guard + retry cls re-read + org_id shift/cancel count, DELETE /sessions SQL guard + kernel.ts runtime imports + SQL sessionsTotal, findTemplate before existing + pre-#670 class heal + drop && !hasLesson, tree.links in MAX_IMPORT_NODES + copyId/FK catch handling, future Monday in Test 670-2, findClassCurriculum in class-mode.ts/kernel.ts, explicit error codes -->

## Goal

Xây dựng theo quy trình TDD (RED trước, GREEN sau) cơ chế đồng bộ vòng đời `manual ↔ auto` ở phía Server khi nhập hoặc gỡ giáo trình lớp, đồng nhất nguồn sự thật giáo trình lớp theo `syllabus.class_id`, tái sử dụng pipeline sinh lịch học + xử lý nghỉ lễ cho học viên `active` chưa có `lesson`, hỗ trợ tự hồi phục idempotent khi backfill dở dang, và khóa chặt race song phương với cả thêm/xóa buổi thủ công lẫn kích hoạt học viên.

## Files to Create / Modify

- Modify: `apps/server/src/manual-sessions.test.ts`
- Modify: `apps/server/src/lib/class-mode.ts`
- Modify: `apps/server/src/routes/enrollment-activation.ts`
- Modify: `apps/server/src/routes/syllabus.ts`
- Modify: `apps/server/src/routes/kernel.ts`

## Tasks & Steps

### Task 1.1 — Viết bộ integration test RED cho vòng đời manual/auto trên Server (#670)
- **Goal**: Thêm `describe("Manual <-> Auto Curriculum Lifecycle (Issue #670)", ...)` vào cuối `apps/server/src/manual-sessions.test.ts` phủ đủ 6 nhóm kịch bản nghiệp vụ (kèm các biên từ Red Team) và xác nhận bộ test fail ở pha RED.
- **Target files and symbols**:
  - `apps/server/src/manual-sessions.test.ts` (thêm khối `describe("Manual <-> Auto Curriculum Lifecycle (Issue #670)", ...)`).
- **Steps**:
  1. Trong `apps/server/src/manual-sessions.test.ts`, viết helper nội bộ tạo template giáo trình có `K` bài học qua API (`POST /api/syllabus-templates`, `POST /api/syllabus-templates/:id/modules`, `POST /api/syllabus-templates/:id/modules/:moduleId/lessons`; với ca `53` bài chèn trực tiếp `t.libsql.insert(schema.syllabusLesson)`), và helper tính ngày thứ Hai tương lai `futureMondayISO()` dựa trên `addDaysISO(vietnamTodayISO(), ...)` cách hôm nay ít nhất 7 ngày để không bao giờ vướng `PAST_RANGE` hay trôi cursor `planHolidayShift`.
  2. Viết 6 bài `test(...)` cụ thể:
     - **Test 670-1 (Lớp manual trống nhập template K=3 bài → auto):** Tạo lớp trống (`templateId: ""`, `schedulingMode: "manual"`, `startDate: futureMondayISO()` → `sessionsTotal = 0`), gọi `POST /api/classes/${classId}/curriculum/import` với template 3 bài → `201`; kiểm tra `GET /api/kernel` có `cls.schedulingMode === "auto"`, `cls.sessionsTotal === 3`, `cls.syllabusId === copyId`.
     - **Test 670-2 (Lớp manual đã có 2 học viên `active` + 1 kỳ nghỉ lễ nhập template K=3 bài → backfill đủ `lesson` đã dịch lịch lễ + `sessionPackage.total = 3`):** Tạo lớp trống `manual` qua API với `startDate = futureMondayISO()` (để bootstrap `organization` trước), lấy `orgId` từ bản ghi lớp trong `t.libsql`, chèn trực tiếp 1 kỳ nghỉ lễ `scope: "org"` trùng `startDate` vào `t.libsql.insert(schema.organizationHoliday)` (mẫu `holidays.test.ts:581`), thêm và kích hoạt 2 học viên (`0` dòng `lesson`, `sessionPackage.total = 0`), sau đó gọi `POST /api/classes/${classId}/curriculum/import` với template 3 bài → `201`; kiểm tra mỗi học viên có đủ `3` dòng `lesson` hiệu lực (không phải `holiday`) cộng `1` dòng `holiday` tại `startDate` và buổi bù đã dịch đúng ngày, bảng `holiday_session_shift` có đúng 1 dòng cho lớp, và cả 2 `session_package.total` đều bằng `3`.
     - **Test 670-3 (Tự hồi phục khi backfill dở dang + kiểm tra `404` cho `templateId` lạ + không lặp vô hạn):** Tạo lớp `manual` có 2 học viên `active`, nhập template 3 bài (`201`), mô phỏng lỗi dở dang trên học viên thứ 2 bằng cách xóa `lesson` của `enrollment2` và đặt `session_package.total = 0` trong `t.libsql`; gọi `curriculum/import` với `templateId` không tồn tại → phải trả `404` (không chạy heal lén); gọi lại với `templateId` hợp lệ → trả `201` (bù đủ 3 dòng `lesson` và `total = 3` cho `enrollment2`, không nhân đôi `enrollment1`); gọi lại lần thứ 3 ngay sau đó → trả `409` `{ error: "Lớp đã có giáo trình", code: "CURRICULUM_ALREADY_EXISTS" }`.
     - **Test 670-4 (Chặn `409 has-manual-sessions` + đua song phương `Promise.all` với `POST` và `DELETE /sessions`):** (a) Lớp `manual` đã thêm 1 buổi thủ công gọi `curriculum/import` → trả `409` (`reason: "has-manual-sessions"`, `code: "MANUAL_SESSIONS_EXIST"`), dữ liệu lớp không đổi; xóa buổi thủ công đó (`DELETE /api/classes/${classId}/sessions/${date}`) rồi gọi lại `curriculum/import` → `201`. (b) Chạy 5 vòng đua `Promise.all([POST /sessions, POST /curriculum/import])` trên 5 lớp trống mới → mỗi vòng đúng 1 response `201` và 1 response `409`, không bao giờ tồn tại lớp vừa có bản sao `syllabus` vừa có dòng `class_session`.
     - **Test 670-5 (Biên số bài học `0` bài và `> 52` bài):** Lớp `manual` trống (`sessionsTotal = 0`) nhập template `0` bài → `422` (`reason: "empty-template"`, `code: "CURRICULUM_EMPTY_TEMPLATE"`); nhập template `53` bài → `422` (`reason: "too-many-lessons"`, `code: "CURRICULUM_TOO_MANY_LESSONS"`); lớp `auto` (`schedulingMode: "auto"`, `sessionsTotal: 12`) nhập template `0` bài → `201` và giữ nguyên `sessionsTotal === 12`.
     - **Test 670-6 (Đối xứng `curriculum/remove` + đồng bộ `session_package.total`):** (a) Lớp chưa có `lesson` và chưa có `class_session` (kể cả ca có học viên `active` mang lịch legacy không parse được khiến `0 lesson` nhưng `session_package.total = 3`) sau khi bấm `POST /api/classes/${classId}/curriculum/remove` → `200`, lớp trở về `schedulingMode === "manual"`, `sessionsTotal === 0`, `syllabusId === null` và `session_package.total === 0`; nhập lại template 5 bài → `session_package.total` lên `5`. (b) Lớp đã có học viên `active` với `lesson` thật bấm `curriculum/remove` → `200`, `syllabusId === null` nhưng giữ nguyên `schedulingMode === "auto"`, `sessionsTotal === 3` và toàn bộ `lesson`; nhập lại template 5 bài → `201`, gắn `syllabusId` mới nhưng giữ nguyên `sessionsTotal === 3` và không ghi đè `lesson` của học viên cũ (trong khi nếu có học viên mới bị kẹt `0 lesson, total = 0` thì vẫn được bù `3` buổi).
- **Success criteria**: `apps/server/src/manual-sessions.test.ts` biên dịch sạch và các test mới trong khối `#670` fail ở pha RED do hành vi cũ chưa chuyển `schedulingMode`/`sessionsTotal` và chưa chặn `409`/`422`.
- **Verify**: `pnpm --filter server exec vitest run src/manual-sessions.test.ts` kết thúc với mã thoát khác `0` do assertion failure trong khối `Issue #670` (14 test cũ vẫn pass); nếu lệnh thoát `0` ở bước này thì coi là thất bại.

### Task 1.2 — Đồng bộ `isManualClass` và tách helper `materializeScheduleForEnrollment` khóa kín TOCTOU trong `enrollment-activation.ts`
- **Goal**: Cập nhật `isManualClass` kiểm tra theo `findClassCurriculum` (#394) và tách helper `materializeScheduleForEnrollment` trong `apps/server/src/routes/enrollment-activation.ts` với khóa nguyên tử Statement 0 + cô lập `org_id` đầy đủ cho cả `activate` và `backfill`.
- **Target files and symbols**:
  - `apps/server/src/lib/class-mode.ts` (`isManualClass`)
  - `apps/server/src/routes/enrollment-activation.ts` (`materializeScheduleForEnrollment`, `activateEnrollment`)
- **Steps**:
  1. Trong `apps/server/src/lib/class-mode.ts`:
     - Kiểm tra sự tồn tại của bản sao giáo trình lớp qua `await findClassCurriculum(db, classId, orgId)` (từ `./syllabus-curriculum`): nếu lớp có bản sao giáo trình thực sự (`syllabus.class_id = classId` trong cùng `orgId`) thì trả `false` ngay; nếu không có bản sao (kể cả khi `syllabusId` bị kẹt con trỏ template mồ côi như Matrix 9), xét tiếp `if (schedulingMode === "manual") return true;` rồi kiểm tra sự tồn tại của `class_session`. (Giữ chữ ký tham số hiện tại để tương thích 100% với mọi caller).
  2. Trong `apps/server/src/routes/enrollment-activation.ts`:
     - Export hàm `materializeScheduleForEnrollment(db: Db, input: { orgId: string; enrollmentId: string; studentId: string; classId: string; mode: "activate" | "backfill" }): Promise<{ ok: true } | { ok: false; error: "class" }>`:
       - Bên trong vòng lặp `for (let attempt = 1; attempt <= 3; attempt += 1)`, đọc tươi dòng `cls` từ `classTable` theo `(input.classId, input.orgId)` (`if (!cls) return { ok: false, error: "class" }`) và kiểm tra `const hasCurriculum = Boolean(await findClassCurriculum(db, cls.id, input.orgId))` cùng `const isManual = !hasCurriculum && (cls.schedulingMode === "manual" || ...)` qua `isManualClass`.
       - Nếu `input.mode === "backfill"` mà lớp không còn ở chế độ `auto` (ví dụ `isManual` là `true` hoặc `cls.sessionsTotal <= 0` do `curriculum/remove` vừa đua thắng), trả `{ ok: true }` dừng êm ngay mà không chèn `lesson`.
       - Dựng `generated` (`classSessionRows` khi `isManual`, `generateScheduleLessons` khi `!isManual`), đọc tươi `loadClassShifts`, `loadClassCancels`, `existingClassLessons`, áp `applyShiftsToRows`, đánh dấu `cancelled`, chạy I6 `planHolidayShift` + `materialMoveStatements` (#659/#662).
       - **Statement 0 (guard nguyên tử chung cho cả `activate` và `backfill` trước mọi insert):**
         ```ts
         const syllabusStateSql = hasCurriculum
         	? sql`EXISTS (SELECT 1 FROM ${syllabus} WHERE ${syllabus.classId} = ${cls.id} AND ${syllabus.orgId} = ${input.orgId})`
         	: sql`NOT EXISTS (SELECT 1 FROM ${syllabus} WHERE ${syllabus.classId} = ${cls.id} AND ${syllabus.orgId} = ${input.orgId})`;
         const manualCountGuardSql = isManual
         	? sql` AND (SELECT count(*) FROM ${classSession} WHERE ${classSession.classId} = ${cls.id} AND ${classSession.orgId} = ${input.orgId}) = ${classSessionRows.length}`
         	: sql``;
         ```
         Cập nhật `enrollment.status` bằng `CASE WHEN ${enrollment.status} = 'active' AND NOT EXISTS (SELECT 1 FROM ${lesson} WHERE ${lesson.enrollmentId} = ${input.enrollmentId} AND ${lesson.orgId} = ${input.orgId}) AND EXISTS (SELECT 1 FROM ${classTable} WHERE ${classTable.id} = ${cls.id} AND ${classTable.orgId} = ${input.orgId} AND ${classTable.schedulingMode} = ${cls.schedulingMode} AND ${classTable.sessionsTotal} = ${cls.sessionsTotal}) AND ${syllabusStateSql}${manualCountGuardSql} THEN 'active' ELSE NULL END`.
       - **Statement 1 (`sessionPackage` có cô lập `orgId`):**
         - Khi `input.mode === "activate"`: `db.insert(sessionPackage).values({ id: crypto.randomUUID(), ...packageValues })`.
         - Khi `input.mode === "backfill"`: `db.insert(sessionPackage).values({ id: crypto.randomUUID(), ...packageValues }).onConflictDoUpdate({ target: sessionPackage.enrollmentId, set: { total: sql\`CASE WHEN ${sessionPackage.orgId} = ${input.orgId} THEN ${packageValues.total} ELSE NULL END\` }, setWhere: eq(sessionPackage.orgId, input.orgId) })`.
       - Trong vòng chèn `lesson`: thêm `AND ${holidaySessionShift.orgId} = ${input.orgId}` và `AND ${holidaySessionCancel.orgId} = ${input.orgId}` vào cả hai subquery `SELECT count(*)` trên `lesson.status`.
       - Trong `catch (err: unknown)` khi `isRollbackableConstraintError(err)` là `true`:
         - Kiểm tra lại `enrollment` theo `(input.enrollmentId, input.orgId)`: nếu không còn `status === "active"` thì trả `{ ok: true }`.
         - Kiểm tra xem đã tồn tại dòng `lesson` của `(input.orgId, input.enrollmentId)` (hoặc ở `mode === "activate"`, đã tồn tại `session_package` của `(input.orgId, input.enrollmentId)` có `total > 0` do `backfill` vừa ghi xong): nếu có thì trả `{ ok: true }` idempotent (nhờ đó `activateEnrollment` vẫn chạy tiếp `backfillStudyPackTargetsForStudent`!).
         - Ngược lại nếu `attempt < 3` thì tiếp tục vòng lặp kế tiếp (đọc lại `cls` tươi từ DB!).
  3. Trong `activateEnrollment`: giữ kiểm tra tồn tại lớp trước CAS (tránh đổi `status` nếu lớp không tồn tại), sau khi CAS `UPDATE enrollment SET status = 'active'` thành công thì gọi `const mat = await materializeScheduleForEnrollment(db, { orgId, enrollmentId, studentId: existingEnrollment.studentId, classId: existingEnrollment.classId, mode: "activate" }); if (!mat.ok) return mat;`, rồi gọi `await backfillStudyPackTargetsForStudent(...)` và trả `{ ok: true }`.
- **Success criteria**: `holidays.test.ts` và `student.test.ts` pass 100%, không còn khe hở TOCTOU hay thiếu `org_id` trên `session_package` / `holiday_session_*`.
- **Verify**: `pnpm --filter server exec vitest run src/routes/holidays.test.ts` kết thúc với mã thoát `0`.

### Task 1.3 — Cập nhật `syllabus.ts` (`import` / `remove`) và khóa race cả `POST` lẫn `DELETE /sessions` trong `kernel.ts` (TDD GREEN)
- **Goal**: Hoàn thiện `importCurriculumHandler` + `removeCurriculumHandler` trong `apps/server/src/routes/syllabus.ts` và khóa chặt race giáo trình trong cả `POST /classes/:id/sessions` lẫn `DELETE /classes/:id/sessions/:date` của `apps/server/src/routes/kernel.ts` để toàn bộ test Phase 1 chuyển sang GREEN.
- **Target files and symbols**:
  - `apps/server/src/routes/syllabus.ts` (`importCurriculumHandler`, `removeCurriculumHandler`, `backfillStuckEnrollments`)
  - `apps/server/src/routes/kernel.ts` (imports dòng `69-73, 113-119`, `POST /classes/:id/sessions` dòng `2415-2630`, `DELETE /classes/:id/sessions/:date` dòng `2632-2787`)
- **Steps**:
  1. Trong `apps/server/src/routes/syllabus.ts`:
     - Import `classSession`, `enrollment`, `lesson`, `sessionPackage`, `sql`, `findExistingMaterialIds`, `isRollbackableConstraintError`, và `materializeScheduleForEnrollment`.
     - Viết helper `findClassRow(db, classId, orgId)` đọc `{ id, syllabusId, schedulingMode, sessionsTotal }` từ `classTable`.
     - Viết helper `backfillStuckEnrollments(db, orgId, classId)` truy vấn `enrollment` với `.leftJoin(sessionPackage, and(eq(sessionPackage.enrollmentId, enrollment.id), eq(sessionPackage.orgId, enrollment.orgId)))` lọc `and(eq(enrollment.orgId, orgId), eq(enrollment.classId, classId), eq(enrollment.status, "active"), sql\`NOT EXISTS (SELECT 1 FROM ${lesson} WHERE ${lesson.orgId} = ${orgId} AND ${lesson.enrollmentId} = ${enrollment.id})\`, sql\`(${sessionPackage.id} IS NULL OR ${sessionPackage.total} = 0)\`)`, gọi tuần tự `await materializeScheduleForEnrollment(db, { orgId, enrollmentId: row.id, studentId: row.studentId, classId, mode: "backfill" })` và trả về số lượng học viên đã chạy bù.
     - Trong `importCurriculumHandler`:
       a) Đọc `cls = await findClassRow(db, classId, ctx.orgId)` (`!cls` → `404`).
       b) Đọc `tpl = await findTemplate(db, body.data.templateId, ctx.orgId)` (`!tpl` → `404 "syllabus not found"`, chạy **trước** `existing` để giữ chặt hợp đồng bảo mật `kernel.test.ts:2895`).
       c) Kiểm tra `const existing = await findClassCurriculum(db, classId, ctx.orgId)`. Nếu `existing` tồn tại:
          - Nếu lớp đang kẹt ở trạng thái tiền-#670 (`cls.schedulingMode === "manual" && cls.sessionsTotal === 0`), kiểm tra không có `class_session` và không có `lesson`, đếm số bài của `existing` (`existingTree = await selectTemplateTree(db, existing.id, ctx.orgId)` — hoặc đọc các `syllabusModule`/`syllabusLesson` của `existing.id`): nếu `1 <= existingLessonCount <= 52`, cập nhật `classTable` sang `schedulingMode = "auto", sessionsTotal = existingLessonCount` rồi gọi `await backfillStuckEnrollments(db, ctx.orgId, classId)` và trả `201 { id: existing.id }`.
          - Nếu `cls.schedulingMode === "auto" && cls.sessionsTotal > 0`, gọi `const healed = await backfillStuckEnrollments(db, ctx.orgId, classId); if (healed > 0) return c.json({ id: existing.id } satisfies CreatedResponse, 201);`.
          - Ngược lại trả `409` `{ error: "Lớp đã có giáo trình", code: "CURRICULUM_ALREADY_EXISTS" }`.
       d) Đọc `tree = await selectTemplateTree(db, tpl.id, ctx.orgId)`. Kiểm tra đầu tiên: `if (tree.modules.length + tree.lessons.length + tree.links.length > MAX_IMPORT_NODES) return c.json({ error: "Template quá lớn để import", code: "CURRICULUM_TEMPLATE_TOO_LARGE" }, 422);`.
       e) Truy vấn song song sự tồn tại của `classSession` (`hasClassSession`) và `lesson` (`hasLesson`) thuộc `(ctx.orgId, classId)` (`limit(1)`):
          - Nếu `hasClassSession`: trả `409` `{ error: "Lớp đã có buổi học thủ công. Vui lòng xóa các buổi chưa học trước khi nhập giáo trình.", reason: "has-manual-sessions", code: "MANUAL_SESSIONS_EXIST" }`.
          - Đặt `lessonCount = tree.lessons.length`. Nếu `!hasLesson`:
            - Nếu `lessonCount > 52`: trả `422` `{ error: "Template vượt quá giới hạn 52 buổi học của lớp.", reason: "too-many-lessons", code: "CURRICULUM_TOO_MANY_LESSONS" }`.
            - Nếu `cls.schedulingMode === "manual" && cls.sessionsTotal === 0 && lessonCount === 0`: trả `422` `{ error: "Template chưa có bài học nào. Vui lòng thêm ít nhất 1 bài học trước khi nhập vào lớp trống.", reason: "empty-template", code: "CURRICULUM_EMPTY_TEMPLATE" }`.
          - Đặt `candidateSessionsTotal = lessonCount > 0 ? lessonCount : cls.sessionsTotal`.
       f) Dựng `{ copyId, statements } = buildImportBatch(...)`, đẩy câu `UPDATE class` nguyên tử vào cuối `statements`:
          ```ts
          statements.push(
          	db
          		.update(classTable)
          		.set({
          			syllabusId: copyId,
          			sessionsTotal: sql`CASE WHEN EXISTS (SELECT 1 FROM ${lesson} WHERE ${lesson.orgId} = ${ctx.orgId} AND ${lesson.classId} = ${classId}) THEN ${classTable.sessionsTotal} ELSE ${candidateSessionsTotal} END`,
          			schedulingMode: sql`CASE WHEN EXISTS (SELECT 1 FROM ${classSession} WHERE ${classSession.classId} = ${classId} AND ${classSession.orgId} = ${ctx.orgId}) THEN NULL ELSE 'auto' END`,
          		})
          		.where(and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId))),
          );
          ```
       g) Thực thi `await db.batch(statements)` trong `try / catch (err)`:
          - Đọc `const after = await findClassCurriculum(db, classId, ctx.orgId);`. Nếu `after && after.id === copyId` (batch đã commit trên D1 nhưng mất ACK mạng), **không** trả `409` mà rơi xuống bước backfill bên dưới và trả `201 { id: copyId }`!
          - Nếu `!isRollbackableConstraintError(err)` → `throw err`.
          - Nếu `/FOREIGN KEY/i.test(message)` và `tree.links.length > 0`, kiểm tra `findExistingMaterialIds` để trả `422` `{ error: "material-not-found", materialId: missing, code: "CURRICULUM_MATERIAL_NOT_FOUND" }`.
          - Nếu `after` (khác `copyId`) hoặc tồn tại bản ghi `syllabus` giữ `classId` ở org khác (`foreign`) → trả cùng cấu trúc `409` `{ error: "Lớp đã có giáo trình", code: "CURRICULUM_ALREADY_EXISTS" }`.
          - Kiểm tra lại `classSession` thuộc `(ctx.orgId, classId)` → nếu tồn tại thì trả `409` `{ error: "Lớp đã có buổi học thủ công. Vui lòng xóa các buổi chưa học trước khi nhập giáo trình.", reason: "has-manual-sessions", code: "MANUAL_SESSIONS_EXIST" }`.
          - Còn lại `throw new Error("import-syllabus batch failed")`.
       h) Sau khi batch thành công, đọc lại `sessionsTotal` thực tế (hoặc nếu `(hasLesson ? cls.sessionsTotal : candidateSessionsTotal) > 0`), luôn gọi `await backfillStuckEnrollments(db, ctx.orgId, classId)` (không chặn `&& !hasLesson` để cứu cả học viên còn kẹt sau chu kỳ gỡ-rồi-nhập-lại), rồi trả `201 { id: copyId }`.
     - Trong `removeCurriculumHandler`:
       - Giữ nguyên nhánh `if (!copy)`.
       - Khi `copy` tồn tại, đặt điều kiện SQL `hasRealSessionsSql = sql\`EXISTS (SELECT 1 FROM ${lesson} WHERE ${lesson.orgId} = ${ctx.orgId} AND ${lesson.classId} = ${classId}) OR EXISTS (SELECT 1 FROM ${classSession} WHERE ${classSession.orgId} = ${ctx.orgId} AND ${classSession.classId} = ${classId})\``; trong cùng `db.batch`:
         1) `db.update(classTable).set({ syllabusId: null, schedulingMode: sql\`CASE WHEN ${hasRealSessionsSql} THEN ${classTable.schedulingMode} ELSE 'manual' END\`, sessionsTotal: sql\`CASE WHEN ${hasRealSessionsSql} THEN ${classTable.sessionsTotal} ELSE 0 END\` }).where(and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)))`
         2) `db.update(sessionPackage).set({ total: sql\`CASE WHEN ${hasRealSessionsSql} THEN ${sessionPackage.total} ELSE 0 END\` }).where(and(eq(sessionPackage.orgId, ctx.orgId), inArray(sessionPackage.enrollmentId, db.select({ id: enrollment.id }).from(enrollment).where(and(eq(enrollment.orgId, ctx.orgId), eq(enrollment.classId, classId))))))`
         3) Các câu xóa `syllabusLesson` → `syllabusModule` → `syllabus` như cũ.
  2. Trong `apps/server/src/routes/kernel.ts`:
     - Tại dòng `69-73`, tách `syllabus` thành value import: `import { syllabus, type syllabusLesson, type syllabusModule } from "@teacher-os/db/schema/syllabus";`.
     - Tại dòng `113-119`, thêm `findClassCurriculum` vào danh sách import từ `../lib/syllabus-curriculum`.
     - Tại `POST /classes/:id/sessions` (`dòng 2424`) và `DELETE /classes/:id/sessions/:date` (`dòng 2641`), kiểm tra giáo trình lớp bằng `if (await findClassCurriculum(db, classId, ...orgId))` trả `409 class-has-syllabus`.
     - Trong `db.update(classTable)` của **cả** `POST /classes/:id/sessions` (`dòng 2574`) **và** `DELETE /classes/:id/sessions/:date` (`dòng 2750`), đặt guard nguyên tử:
       `schedulingMode: sql\`CASE WHEN EXISTS (SELECT 1 FROM ${syllabus} WHERE ${syllabus.classId} = ${classId} AND ${syllabus.orgId} = ${orgId}) THEN NULL ELSE 'manual' END\``
     - Trong khối `catch` của `POST /classes/:id/sessions` (`dòng 2621`, trước `date-occupied`) và bọc `try / catch` quanh `await db.batch(deleteStatements)` của `DELETE /classes/:id/sessions/:date` (`dòng 2785`), nếu `isRollbackableConstraintError(err)` và `await findClassCurriculum(db, classId, orgId)` khác `null` thì trả `409` `{ error: "cannot add manual session to class with syllabus", reason: "class-has-syllabus" }` (hoặc thông báo tương ứng cho delete).
- **Success criteria**: Toàn bộ test suite của `apps/server` (`manual-sessions.test.ts`, `holidays.test.ts`, `kernel.test.ts`, v.v.) và kiểm tra kiểu TypeScript đều xanh 100%.
- **Verify**: `pnpm --filter server test && pnpm --filter server check-types` kết thúc với mã thoát `0` và `0` test fail.

## Verification

- [x] `pnpm --filter server exec vitest run src/manual-sessions.test.ts` pass toàn bộ (14 test cũ + 6 test #670).
- [x] `pnpm --filter server test` và `pnpm --filter server check-types` exit `0`.

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
