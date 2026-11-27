---
phase: 2
title: "Phase 2: Server Visibility and Routes"
status: pending
priority: P1
effort: "1h45m"
dependencies: [1]
---

# Phase 2: Server Visibility and Routes

## Goal
Mở khóa truy cập/hiển thị toàn bộ bài bộ đề tự học trên chi tiết lớp, quiz, attempt, review, history và nhắc chấm; vá xóa target theo từng học viên khi hủy bộ đề; giữ gate `available_at` cho bài giao tay và giữ gọn `/overview` trừ bài đã làm sớm.

## Files to Create / Modify
- Modify: `apps/server/src/routes/study-pack.test.ts`
- Modify: `apps/server/src/lib/notifications/daily-deadline-reminder.test.ts`
- Modify: `apps/server/src/lib/assignment-visibility.ts`
- Modify: `apps/server/src/lib/study-pack-assign.ts`
- Modify: `apps/server/src/routes/student-class.ts`
- Modify: `apps/server/src/routes/student.ts`
- Modify: `apps/server/src/routes/student-history.ts`
- Modify: `apps/server/src/routes/dashboard-reminders.ts`
- Modify: `apps/server/src/lib/notifications/daily-deadline-reminder.ts`

## Tasks & Steps

### Task 2.1 — TDD Red: Cập nhật và bổ sung test hành vi mới trên `study-pack.test.ts` và `daily-deadline-reminder.test.ts`
- Goal: Có test đỏ phản ánh chính xác hành vi mở khóa bộ đề tự học, cách ly theo từng học viên khi hủy bộ đề, bảo toàn bài giao tay hẹn giờ, hiển thị bài nộp sớm trên `/overview` & `/history`, và bỏ `(mở lúc ...)` trong email nhắc hạn.
- Target files and symbols: `apps/server/src/routes/study-pack.test.ts` (test dòng 452–727 + test multi-student cancel + test hồi quy bài manual), `apps/server/src/lib/notifications/daily-deadline-reminder.test.ts` (dòng 328).
- Steps:
  1. Trong `study-pack.test.ts`: cập nhật test hiện tại để kiểm tra `GET /api/student/classes/class-1` trả cả Day 1 và Day 2 kèm metadata pack (`classStudyPackId`, `studyPackTitle`, `studyPackStatus`, `availableAt`, `studyPackDayIndex`, `studyPackPosition`); `GET /api/student/overview` ban đầu chỉ trả Day 1 (chưa có Day 2 chưa bắt đầu); học viên truy cập và hoàn thành Day 2 trước `available_at` (`GET /quiz` 200, `POST /quiz/start` 201, `PATCH /answer` 200, `POST /submit` 200, `GET /attempts/:id` 200, `GET /attempts/:id/detail` 200); sau khi nộp sớm, Day 2 xuất hiện trong `/overview` và `/api/student/history`; và `cancelClassStudyPack` vẫn giữ lại Day 2 đã làm.
  2. Thêm test multi-student cancel trong `study-pack.test.ts`: Học viên A (`student-1`) làm sớm Ngày 2, Học viên B (`student-late` hoặc thêm học viên cùng lớp) chưa làm Ngày 2 → Giáo viên gọi `DELETE /api/classes/:classId/study-packs/:id` → Học viên A vẫn giữ được Ngày 2 (200), còn Học viên B bị xóa target Ngày 2 (không thấy trong `/classes/:classId` và nhận 404 ở `/quiz`).
  3. Thêm test hồi quy trong `study-pack.test.ts` chứng minh bài giao tay (`classStudyPackId: null`) có `availableAt > now` vẫn trả 404 ở `/quiz`, `/quiz/start`, `/attempts/:id/*` và bị ẩn khỏi `/overview`, `/classes/:id`.
  4. Trong `daily-deadline-reminder.test.ts` dòng 328: đổi kỳ vọng không còn chuỗi `"mở lúc"`.
- Success criteria: Chạy test targeted ở trạng thái đỏ trước khi sửa implementation.
- Verify: `pnpm --filter server exec vitest run src/routes/study-pack.test.ts src/lib/notifications/daily-deadline-reminder.test.ts` exits non-zero with assertion failure (passing before edits is a failure).

### Task 2.2 — Tách predicate visibility trong `assignment-visibility.ts` & vá per-student cancel cleanup trong `study-pack-assign.ts`
- Goal: Tách 3 chính sách SQL rõ ràng (`visibleAssignmentFilter`, `accessibleAssignmentFilter`, `overviewAssignmentFilter`) và vá `buildCleanupCancelledPackStatements` xóa target theo từng học viên chưa có `quiz_attempt`.
- Target files and symbols:
  - `apps/server/src/lib/assignment-visibility.ts` (`visibleAssignmentFilter`, `accessibleAssignmentFilter`, `overviewAssignmentFilter`)
  - `apps/server/src/lib/study-pack-assign.ts` (`buildCleanupCancelledPackStatements`, khoảng dòng 140–192)
- Steps:
  1. Trong `assignment-visibility.ts`: giữ nguyên `visibleAssignmentFilter(now)`; export `accessibleAssignmentFilter(now = new Date())` (`or(isNotNull(classAssignment.classStudyPackId), isNull(classAssignment.availableAt), lte(classAssignment.availableAt, now))`); export `overviewAssignmentFilter(now = new Date())` (`or(isNull(classAssignment.availableAt), lte(classAssignment.availableAt, now), and(isNotNull(classAssignment.classStudyPackId), or(isNotNull(classAssignmentTarget.submittedAt), isNotNull(quizAttempt.id))))`).
  2. Trong `study-pack-assign.ts` (`buildCleanupCancelledPackStatements`): trong câu xóa `classAssignmentTarget` (cả nhánh `cutoff !== null` lẫn `cutoff === null`), thay `NOT EXISTS (SELECT 1 FROM ${quizAttempt} qa WHERE qa.org_id = ${orgId} AND qa.assignment_id = ca.id)` bằng `NOT EXISTS (SELECT 1 FROM ${quizAttempt} qa WHERE qa.org_id = ${orgId} AND qa.assignment_id = ca.id AND qa.student_id = ${classAssignmentTarget.studentId})` để chỉ giữ target của học viên thực sự đã bắt đầu/làm bài, không để lọt target cho học viên khác trong lớp khi hủy bộ đề. (Giữ nguyên điều kiện xóa `classAssignment` chỉ xóa assignment khi không còn bất kỳ `quizAttempt` nào để tránh cascade xóa bài đã làm của Học viên A.)
- Success criteria: Học viên A đã làm sớm vẫn giữ bài khi hủy bộ đề; Học viên B chưa làm bị xóa target và nhận 404.
- Verify: no verification needed (covered by Task 2.5).

### Task 2.3 — Nâng cấp `loadClassAssignmentItems` trong `student-class.ts`
- Goal: Hỗ trợ `mode: "overview" | "class_detail" | "session_detail"`, join `classStudyPack`, nạp `studyPackDayIndex` và `studyPackPosition` theo `packId` (chunk `D1_IN_ARRAY_CHUNK`) ở mode `class_detail`.
- Target files and symbols: `apps/server/src/routes/student-class.ts` (`ClassAssignmentLoadMode`, `loadClassAssignmentItems`).
- Steps:
  1. Export `ClassAssignmentLoadMode = "overview" | "class_detail" | "session_detail"`.
  2. Mở rộng tham số cuối `options?: { mode?: ClassAssignmentLoadMode }` (mặc định `"overview"`, giữ tương thích ngược với caller 3-5 tham số).
  3. Chọn predicate filter theo `mode`: `"class_detail"` → `accessibleAssignmentFilter(now)`, `"session_detail"` → `visibleAssignmentFilter(now)`, `"overview"` → `overviewAssignmentFilter(now)`.
  4. `leftJoin(classStudyPack, and(eq(classStudyPack.id, classAssignment.classStudyPackId), eq(classStudyPack.orgId, orgId)))` và select thêm `availableAt`, `classStudyPackId`, `studyPackPackId`, `studyPackTitle`, `studyPackStatus`, `studyPackStartDate`.
  5. Khi `mode === "class_detail"`, thu thập `uniquePackIds`, chunk theo `D1_IN_ARRAY_CHUNK` query `studyPackItem` bằng `inArray(studyPackItem.packId, slice)`, map từng row qua `extractPackItemIdFromAssignmentId(row.classStudyPackId, row.id)`. Khi item gốc trong `studyPackItem` vắng mặt (pack bị sửa/xóa item sau khi gán), fallback ánh xạ `due -> dayIndex` từ lịch `computeStudyPackSchedule(packStartDate, MAX_PACK_DAYS, classHolidayMap)` (cùng logic với `loadClassStudyPacks`), rồi suy `position` 0-based trong cùng ngày.
  6. Trả thêm các trường mới vào từng `StudentAssignment` item.
- Success criteria: Không vượt quá giới hạn bind parameter của D1 và giữ tương thích schema `studentAssignmentSchema`, không đánh sai `dayIndex` khi template pack đã sửa sau khi gán.
- Verify: no verification needed (covered by Task 2.5).

### Task 2.4 — Cập nhật `student.ts`, `student-history.ts`, `dashboard-reminders.ts`, `daily-deadline-reminder.ts`
- Goal: Toàn bộ luồng take/audio/start/attempt/review/history/reminders mở khóa cho bộ đề tự học, truyền `now` nhất quán ở `/overview`, bỏ `opensAtLabel` trong email nhắc hạn.
- Target files and symbols:
  - `apps/server/src/routes/student.ts` (`loadOwnedAttemptWithSkill`, `GET /overview`, `GET /classes/:classId`, `GET /classes/:classId/sessions/:date`, `GET /assignments/:assignmentId/quiz`, `GET /assignments/:assignmentId/audio`, `POST /assignments/:assignmentId/quiz/start`, `loadAttemptForReview`)
  - `apps/server/src/routes/student-history.ts` (`attemptRows`, route handlers)
  - `apps/server/src/routes/dashboard-reminders.ts` (`queryAssignmentOverdue`)
  - `apps/server/src/lib/notifications/daily-deadline-reminder.ts` (`opensAtLabel`)
- Steps:
  1. Trong `student.ts`: cập nhật `loadOwnedAttemptWithSkill` select `classStudyPackId` và chỉ chặn `availableAt > now` khi `classStudyPackId === null`; truyền `now` + `{ mode: "overview" }` ở `/overview`, `{ mode: "class_detail" }` ở `/classes/:classId`, `{ mode: "session_detail" }` ở `/classes/:classId/sessions/:date`; thay `visibleAssignmentFilter` bằng `accessibleAssignmentFilter` ở `/quiz`, `/audio`, `/quiz/start`, `loadAttemptForReview`.
  2. Trong `student-history.ts`: dùng `accessibleAssignmentFilter(now)` với `now` thống nhất từ `deps.now`.
  3. Trong `dashboard-reminders.ts`: dùng `accessibleAssignmentFilter(now)`.
  4. Trong `daily-deadline-reminder.ts`: đặt `opensAtLabel = null`.
- Success criteria: Mọi endpoint và cron job phản ánh đúng chính sách mở khóa bộ đề tự học.
- Verify: no verification needed (covered by Task 2.5).

### Task 2.5 — Verify toàn bộ server test suite & typecheck
- Goal: Xác nhận toàn bộ `apps/server` test và check-types xanh, bao gồm `study-pack.test.ts`, `student-session-detail.test.ts`, `grading.test.ts`, `daily-deadline-reminder.test.ts`.
- Target files and symbols: `apps/server`
- Steps:
  1. Chạy unit/integration test và typecheck cho `apps/server`.
- Success criteria: Exit code 0, 0 test fail.
- Verify: `pnpm --filter server test && pnpm --filter server check-types` exits 0 with 0 failures.

## Todo
- [ ] Task 2.1: TDD Red test updates
- [ ] Task 2.2: Visibility filters & per-student cancel cleanup
- [ ] Task 2.3: `loadClassAssignmentItems` in `student-class.ts`
- [ ] Task 2.4: Routes, history, and reminders updates
- [ ] Task 2.5: Verify `apps/server` tests & types

## Verification
- `pnpm --filter server test && pnpm --filter server check-types`

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
