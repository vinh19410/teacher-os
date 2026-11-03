---
phase: 4
title: "Phase 4: Gán vào lớp, lọc lúc đọc & hook enrollment"
status: completed
priority: P1
effort: "3.5h"
dependencies: [1, 3]
---

# Phase 4: Gán vào lớp, lọc lúc đọc & hook enrollment

## Goal

Gán bộ đề vào lớp tạo sẵn toàn bộ `class_assignment` kèm `available_at` & `due_at` (bỏ qua ngày nghỉ); mọi đường đọc và làm bài phía học viên lọc chặt `available_at <= now`; học viên kích hoạt enrollment vào lớp muộn tự nhận các bài chưa quá hạn (`due_at > now`); cô lập hoàn toàn bài của pack khỏi `KernelSnapshot` và trần 200 bài giao tay.

## Files

- Create:
  - `apps/server/src/lib/assignment-visibility.ts`
  - `apps/server/src/lib/study-pack-assign.ts`
  - `apps/server/src/lib/study-pack-assign.test.ts`
- Modify:
  - `apps/server/src/routes/study-pack.ts`
  - `apps/server/src/routes/study-pack.test.ts`
  - `apps/server/src/routes/enrollment-activation.ts`
  - `apps/server/src/routes/student-class.ts`
  - `apps/server/src/routes/student.ts`
  - `apps/server/src/routes/student-history.ts`
  - `apps/server/src/routes/dashboard-reminders.ts`

## Tasks

### Task 4.1 — Tạo helper `visibleAssignmentFilter(now)` và áp dụng lên toàn bộ đường đọc/làm bài của học viên
- **Goal:** Mọi bài có `available_at > now` hoàn toàn vô hình với học viên trên cả danh sách lẫn truy cập URL trực tiếp (GET quiz, start attempt, save answer, submit, review, history).
- **Target files:**
  - `apps/server/src/lib/assignment-visibility.ts`
  - `apps/server/src/routes/student-class.ts`
  - `apps/server/src/routes/student.ts`
  - `apps/server/src/routes/student-history.ts`
  - `apps/server/src/routes/dashboard-reminders.ts`
- **Steps:**
  1. Tạo `apps/server/src/lib/assignment-visibility.ts` export `visibleAssignmentFilter(now: Date = new Date())`:
     ```ts
     export function visibleAssignmentFilter(now: Date = new Date()) {
     	return or(
     		isNull(classAssignment.availableAt),
     		lte(classAssignment.availableAt, now),
     	);
     }
     ```
  2. Áp dụng `visibleAssignmentFilter(now)` vào:
     - `apps/server/src/routes/student-class.ts` (`loadClassAssignmentItems`).
     - `apps/server/src/routes/student.ts`:
       - `GET /api/student/assignments/:assignmentId/quiz` (`~1173`).
       - `POST /api/student/assignments/:assignmentId/quiz/start` (`~1295`).
       - `loadOwnedAttemptWithSkill` (`~793-844`): lấy thêm `assignmentId: classAssignment.id, availableAt: classAssignment.availableAt`; nếu `row.mode === "assignment"` và (`!row.assignmentId` hoặc `(row.availableAt !== null && row.availableAt.getTime() > Date.now())`), trả về `undefined`.
       - Trong `PATCH /api/student/attempts/:attemptId/answer` (`~1396`) và `GET /api/student/attempts/:attemptId/media` (`~1724`): kiểm tra qua `loadOwnedAttemptWithSkill` (nếu `undefined` trả 404).
       - Trong `loadAttemptForReview` (`~1924-1957`): thêm `visibleAssignmentFilter(new Date())` vào truy vấn `classAssignment`; nếu `attempt.mode !== "practice" && header.length === 0`, trả về `{ error: 404 } as const`.
     - `apps/server/src/routes/student-history.ts` (`attemptRows` `~242`).
     - `apps/server/src/routes/dashboard-reminders.ts` (`computeReminders` `~164`).
- **Success criteria:** Trước `available_at`, học viên gọi bất kỳ endpoint nào của bài đó đều nhận 404 hoặc không thấy trong danh sách; đúng từ `available_at` trở đi truy cập và làm bài bình thường.
- **Verify:** no verification needed (sẽ kiểm chứng cùng Task 4.3).

### Task 4.2 — Cài đặt logic gán pack, tính lịch bỏ ngày nghỉ, huỷ pack và backfill học viên vào lớp muộn
- **Goal:** Gán bộ đề vào lớp sinh lịch chính xác bỏ qua ngày nghỉ (`loadExistingHolidayDates`), chèn theo lô an toàn cho D1, hỗ trợ xem tiến độ (`GET /api/classes/:classId/study-packs`), huỷ pack giữ bài đã mở, và tự động backfill khi học viên kích hoạt enrollment.
- **Target files:**
  - `apps/server/src/lib/study-pack-assign.ts`
  - `apps/server/src/routes/study-pack.ts`
  - `apps/server/src/routes/enrollment-activation.ts`
- **Steps:**
  1. Trong `apps/server/src/lib/study-pack-assign.ts`:
     - Viết hàm thuần `computeStudyPackSchedule(startDate, maxDayIndex, holidayMap)` dùng con trỏ `cursor = startDate` tiến từng ngày từ `1..maxDayIndex`, bỏ qua mọi ngày nằm trong `holidayMap` (trả về `dateByDayIndex` và `skippedHolidays`).
     - Viết hàm `assignStudyPackToClass(db, params)`:
       - Kiểm tra lớp thuộc `orgId`, bộ đề `status === "ready"` (thuộc `orgId` hoặc hệ thống `orgId === null`).
       - Nếu đã có `class_study_pack` `status === "active"` cho `(classId, packId)`: nếu cùng `(startDate, releaseTime, dueTime)` thì tái dùng `existing.id` làm `classPackId` (idempotent retry); nếu khác cấu hình thì trả lỗi `409 Conflict`.
       - Gọi `materializePrompts(db, orgId, items)` để lấy `promptId` cho mọi item.
       - Tính `availableAt = new Date(vietnamDateTimeMs(dateISO, releaseTime))` và `dueAt = new Date(vietnamDateTimeMs(dateISO, dueTime))`.
       - Tạo các dòng `class_assignment` với ID tất định `ca_pk_${classPackId}_${item.id}` và `class_assignment_target` cho mọi học viên có `enrollment.status === "active"` trong lớp với ID tất định `cat_pk_${assignmentId}_${studentId}`.
       - Thực thi lệnh chèn theo chunk (`D1_ASSIGNMENT_INSERT_CHUNK = 8`, `D1_TARGET_INSERT_CHUNK = 15`) với `.onConflictDoNothing()`, gom vào các lệnh `db.batch` tối đa `50` câu lệnh mỗi batch.
     - Viết hàm `cancelClassStudyPack(db, orgId, classId, classPackId, now)`:
       - Tìm các dòng `class_assignment` thuộc `classPackId` có `available_at > now` và chưa có dòng `quiz_attempt` nào.
       - Xoá tường minh `class_assignment_target` (chunk 50) trước rồi xoá `class_assignment` (chunk 50) và cập nhật `class_study_pack` sang `status = "cancelled", cancelledAt = now`.
     - Viết hàm `backfillStudyPackTargetsForStudent(db, orgId, classId, studentId, now = new Date())`:
       - Tìm mọi `class_assignment` của `classId` thuộc `class_study_pack` đang `active` có `due_at > now`.
       - Chèn `class_assignment_target` với ID `cat_pk_${assignmentId}_${studentId}` (chunk 15, `.onConflictDoNothing()`).
  2. Trong `apps/server/src/routes/enrollment-activation.ts` (`activateEnrollment`):
     - Gọi `await backfillStudyPackTargetsForStudent(db, orgId, existingEnrollment.classId, existingEnrollment.studentId)` cả ở nhánh early-return khi enrollment đã `active` (`lines 300, 340`) lẫn sau khi `db.batch(statements)` kích hoạt thành công (`line 548`).
  3. Trong `apps/server/src/routes/study-pack.ts`:
     - Thêm `GET /api/classes/:classId/study-packs` (role gate `canReviewGrade`): trả về danh sách `class_study_pack` của lớp (kèm lịch từng bài, trạng thái đã mở/chưa mở, số học viên đã nộp/nộp trễ) và danh sách ngày nghỉ của lớp từ `loadExistingHolidayDates(db, ctx.orgId, [classId])`.
     - Thêm `POST /api/classes/:classId/study-packs` (role gate `canPublishGrade`) và `DELETE /api/classes/:classId/study-packs/:id` (role gate `canPublishGrade`).
- **Success criteria:** Gán pack, đọc tiến độ lớp, huỷ pack và kích hoạt học viên vào lớp muộn hoạt động đúng và idempotent.
- **Verify:** no verification needed (sẽ kiểm chứng ở Task 4.3).

### Task 4.3 — Viết unit & integration test cho Phase 4
- **Goal:** Kiểm chứng đầy đủ lịch bỏ ngày nghỉ, gán idempotent, lọc `available_at <= now` trên mọi đường đọc/làm bài học viên, học viên vào muộn qua `activateEnrollment`, huỷ pack giữ bài đã mở, và cô lập `snapshot.ts` / trần 200 bài.
- **Target files:**
  - `apps/server/src/lib/study-pack-assign.test.ts`
  - `apps/server/src/routes/study-pack.test.ts`
- **Steps:**
  1. Trong `apps/server/src/lib/study-pack-assign.test.ts` và `apps/server/src/routes/study-pack.test.ts`:
     - Test tính lịch bỏ ngày nghỉ (`org` và `classes` scope), bao gồm kỳ nghỉ nhiều ngày liên tiếp và `startDate` trùng ngày nghỉ.
     - Test gọi `POST /api/classes/:classId/study-packs` 2 lần liên tiếp với cùng tham số trả kết quả idempotent, không nhân đôi `class_assignment` hay `class_assignment_target`.
     - Test huỷ pack rồi gán lại cùng `packId` tạo lượt gán mới thành công, trong khi bài đã mở ở lượt trước vẫn được giữ lại.
     - Test học viên truy cập bài có `available_at > now`: không xuất hiện trong `loadClassAssignmentItems` (`GET /api/student/overview` & `/classes/:id`), và gọi trực tiếp `GET /quiz`, `POST /quiz/start`, `PATCH /answer`, `POST /submit`, `GET /attempts/:id` đều trả `404`; khi `available_at <= now` thì thấy và nộp bài thành công.
     - Test học viên vào lớp muộn qua `activateEnrollment`: nhận target cho các bài có `due_at > now`, không nhận bài đã quá hạn (`due_at <= now`).
     - Test cô lập trần 200 bài giao tay và `loadSnapshot` (không chứa bài của pack và không chứa `assignment_prompt` materialize ngầm có `library_ref`).
- **Success criteria:** Toàn bộ test server pass và `rg "self_study|selfStudy|plan_item|runSelfStudyPlanTick" apps/ packages/` không còn kết quả nào.
- **Verify:** `pnpm --filter server test -- study-pack` exits 0, `pnpm check-types` exits 0, and `pnpm exec biome check .` exits 0.

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
