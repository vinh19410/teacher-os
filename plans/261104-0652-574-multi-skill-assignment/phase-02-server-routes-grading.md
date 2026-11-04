---
phase: 2
title: "Phase 2: Server Routes, Snapshot & Grading Pipeline"
status: pending
priority: P1
effort: "3.5h"
dependencies: [1]
---

# Phase 2: Server Routes, Snapshot & Grading Pipeline

<!-- Updated: Red-Team & Validation Session 1 - full 409 writing lock across classAssignment/assignmentTestPart/studyPackItem, study-pack 422 guard + D1 chunk 3, empty-essay AI guard, detail grade/annotations, student-history, raw essay on take resume, orgId join predicates -->

## Goal
Nối trọn vẹn phần Writing đính kèm qua toàn bộ tầng backend `apps/server`: CRUD ngân hàng đề (`POST/PATCH /api/assignments/prompts` kèm `bodyLimit`/`Content-Type` và khoá 409 toàn phần khi đã gắn lớp/test/study-pack), chặn gắn đề gộp vào `assignment_test` (400) và `study_pack` (422 + hạ `D1_PROMPT_CLONE_INSERT_CHUNK` xuống 3), trả snapshot kernel, cho phép học viên autosave `/essay` + nộp bài kích hoạt chấm tự động lẫn chấm nháp AI (bỏ qua trừ Credit nếu bài viết rỗng), trả đủ `grade`/`annotations` ở cả summary lẫn `/detail`, cập nhật `/history`, hàng đợi chấm `/api/grading` + `objective` và nhắc việc quá hạn dashboard.

## Files to Create / Modify
- Modify: `apps/server/src/routes/snapshot.ts`
- Modify: `apps/server/src/routes/assignments/index.ts`
- Modify: `apps/server/src/routes/assignments/tests.ts`
- Modify: `apps/server/src/lib/study-pack-clone.ts`
- Modify: `apps/server/src/lib/study-pack-clone.test.ts`
- Modify: `apps/server/src/routes/student.ts`
- Modify: `apps/server/src/routes/student-class.ts`
- Modify: `apps/server/src/routes/student-history.ts`
- Modify: `apps/server/src/routes/grading.ts`
- Modify: `apps/server/src/lib/ai-grading/run-grading.ts`
- Modify: `apps/server/src/routes/dashboard-reminders.ts`
- Create: `apps/server/src/routes/hybrid-assignment.test.ts`

## Tasks

### Task 2.1 — TDD Red: Tạo bộ integration test server `hybrid-assignment.test.ts`
- **Goal:** Viết trước toàn bộ kịch bản kiểm thử server cho đề gộp (authoring, 409 lock 3 bảng, test-builder 400 guard, study-pack 422 guard, student quiz/essay/submit/summary/detail/history, empty-essay 0-credit AI guard, grading queue/detail/publish, dashboard reminders, org isolation).
- **Target files and symbols:** `apps/server/src/routes/hybrid-assignment.test.ts` (mới).
- **Steps:**
  1. Đọc 40 dòng đầu của `apps/server/src/routes/assignments/tests.test.ts` và `apps/server/src/routes/grading.test.ts` để tái dùng đúng helper khởi tạo app + DB test trong bộ nhớ.
  2. Viết các test case cụ thể:
     - **Authoring & Snapshot:** `POST /api/assignments/prompts` tạo đề `grammar` có `writing: { part: "task2", type: "discuss", prompt: "<p>Write an essay</p>" }` trả 201; `GET /api/kernel` trả `assignmentPrompts` có `writing` khớp dữ liệu vừa lưu.
     - **PATCH & 409 Full Writing Lock:**
       - Khi đề CHƯA gắn `class_assignment`, `assignment_test_part`, hay `study_pack_item`: `PATCH /api/assignments/prompts/:id` thêm/sửa/gỡ `writing` đều trả 200; gửi `PATCH` không chứa key `writing` (`{ title: "Renamed" }`) giữ nguyên `writing` cũ.
       - Khi đề ĐÃ giao lớp (`class_assignment` tham chiếu `promptId`): mọi `PATCH` làm thay đổi `writing` (thêm mới, gỡ `null`, đổi `part`, đổi `type`, hoặc đổi `prompt`) đều trả **409** `{ code: "WRITING_SECTION_LOCKED" }`; trong khi `PATCH { title: "Renamed" }` (không chạm `writing`) vẫn trả 200.
       - Khi đề thuần đã nằm trong `assignment_test_part` hoặc `study_pack_item` (`sourceKind = "org_prompt"`): `PATCH` gắn thêm `writing != null` trả **409** `{ code: "WRITING_SECTION_LOCKED" }`.
       - `PATCH` gửi `writing != null` cho đề có `row.skill === "writing"` hoặc `"speaking"` trả **400**.
     - **Test Builder & Study Pack Guards:**
       - `PUT /api/assignments/tests/:id/parts` gắn đề Reading có `writing !== null` trả **400**.
       - `POST /api/study-packs` (hoặc `validateStudyPackItems`) gắn đề Grammar có `writing !== null` trả **422**.
     - **Student Flow & Resume Offset Safety:**
       - `GET /api/student/overview` và `GET /api/student/classes/:classId` trả `hasWriting: true` cho bài giao từ đề gộp.
       - `GET /api/student/assignments/:assignmentId/quiz` trả `skill: "grammar"` kèm `writing: { part: "task2", type: "discuss", prompt: "<p>Write an essay</p>" }`.
       - Sau khi start attempt: `PATCH /api/student/attempts/:id/answer` lưu câu `0` và `PATCH /api/student/attempts/:id/essay` lưu bài luận có ký tự `<br> &amp;` trả **200**; gọi lại `GET .../quiz` trả nguyên văn chuỗi `<br> &amp;` (không chạy `essayToPlain` làm lệch độ dài khi đang làm). Đề Reading thuần gọi `/essay` vẫn bị chặn **400**.
       - **Empty-essay AI Credit Guard:** học viên nộp bài gộp với `essay: "   "` (rỗng) → `correctCount` vẫn chấm đúng, nhưng ví Credit của org **không bị trừ** và `ai_grading_draft` ở trạng thái `manual_pending` (0 Credit).
       - Học viên nộp bài gộp có nội dung `essay` thật → chấm đúng `correctCount`, kích hoạt AI grading với `prompt` đã strip HTML (`htmlToPlainText`), tạo `ai_grading_draft` `skill: "writing"`.
     - **Teacher Grading, `/detail`, `/history` & Dashboard Reminders:**
       - Bài nộp đề gộp xuất hiện trong `GET /api/grading` với `skill: "writing"`, `part: "task2"`, và khi quá 24h chưa chấm thì tăng cả `overdueGrading.count` lẫn `overdueGrading.writing` trong `computeReminders`.
       - Trước khi chấm, `GET /api/student/history/list` trả dòng bài gộp với `score: "1/2"`, `status: "awaiting"`, `hasWriting: true`.
       - `GET /api/grading/:attemptId` trả `skill: "writing"`, `part: "task2"`, `prompt.prompt` là `writingPrompt`, `essay` của học viên, VÀ `objective: { correctCount: 1, totalCount: 2 }`.
       - Giáo viên tạo highlight (`POST /api/grading/:attemptId/annotations`) và chấm điểm (`POST /api/grading/:attemptId/grade`) trả 200:
         - `GET /api/student/attempts/:id` VÀ `GET /api/student/attempts/:id/detail` đều trả đủ `grade`, `part: "task2"`, `annotations`, `essay` cùng `correctCount`/câu hỏi trắc nghiệm.
         - `GET /api/student/history/list` trả `score: "1/2 · Band 6.5"`, `status: "graded"`, `hasWriting: true` (không xoá mất `1/2`).
     - **IDOR / Org Isolation:** Giáo viên org B gọi `GET /api/grading/:attemptId` của bài gộp thuộc org A nhận 404.
- **Success criteria:** File test chạy được bằng vitest và fail ở các assertion bài gộp (Red phase).
- **Verify:** `pnpm --filter server test -- hybrid-assignment` exits non-zero.

### Task 2.2 — TDD Green (Authoring, Snapshot, Test Builder & Study Pack Guards): Cập nhật `snapshot.ts`, `assignments/index.ts`, `assignments/tests.ts`, `study-pack-clone.ts`
- **Goal:** Lưu/đọc 3 cột `writing_*`, áp dụng `bodyLimit` + `Content-Type` và khoá 409 bất biến trên `PATCH /prompts/:id`, chặn đề gộp ở `assignment_test` lẫn `study_pack`, và hạ chunk clone D1 xuống 3.
- **Target files and symbols:**
  - `apps/server/src/routes/snapshot.ts` (`loadSnapshot` quanh dòng 661–715)
  - `apps/server/src/routes/assignments/index.ts` (`readBody`, `POST /prompts`, `PATCH /prompts/:id`)
  - `apps/server/src/routes/assignments/tests.ts` (`PUT /:id/parts` quanh dòng 185–215)
  - `apps/server/src/lib/study-pack-clone.ts` (`D1_PROMPT_CLONE_INSERT_CHUNK` dòng 30, `validateStudyPackItems` dòng 421–468, `materializePrompts` dòng 710–745) & `study-pack-clone.test.ts` (dòng 222)
- **Steps:**
  1. **`snapshot.ts`:** destructure thêm `writingPart`, `writingType`, `writingPrompt` từ `assignmentPromptRows` và trả `writing: writingPart ? { part: writingPart, type: writingType ?? "", prompt: writingPrompt ?? "" } : null`.
  2. **`assignments/index.ts`:**
     - Thêm middleware `bodyLimit({ maxSize: 256 * 1024 })` từ `hono/body-limit` cho `POST` và `PATCH` trên `routes`, và kiểm tra `Content-Type` chứa `application/json` trong `readBody` (trả 415 nếu thiếu, khớp `kernel.ts`).
     - Ở `POST /prompts`: chuẩn hoá `const writing = body.data.writing ?? null;`, ghi `writingPart: writing?.part ?? null`, `writingType: writing?.type ?? null`, `writingPrompt: writing?.prompt ?? ""`.
     - Ở `PATCH /prompts/:id`:
       - Select thêm `writingPart: assignmentPrompt.writingPart`, `writingType: assignmentPrompt.writingType`, `writingPrompt: assignmentPrompt.writingPrompt` trên `row`.
       - Nếu `body.data.writing !== undefined`:
         - Nếu `body.data.writing !== null && !isAutoGradableSkill(row.skill)` → trả `c.json({ error: "writing section only applies to auto-graded skills" }, 400)`.
         - Kiểm tra xem `body.data.writing` có thực sự đổi giá trị so với hiện tại không:
           `const nextW = body.data.writing; const curW = row.writingPart ? { part: row.writingPart, type: row.writingType ?? "", prompt: row.writingPrompt ?? "" } : null; const writingChanged = JSON.stringify(nextW) !== JSON.stringify(curW);`
         - Nếu `writingChanged`: kiểm tra song song (`Promise.all`) sự tồn tại của `promptId` trong `classAssignment` (`eq(classAssignment.orgId, ctx.orgId)`), và nếu `nextW !== null` kiểm tra thêm trong `assignmentTestPart` (join `assignmentTest` theo `orgId`) cùng `studyPackItem` (`and(eq(studyPackItem.sourceKind, "org_prompt"), eq(studyPackItem.sourceId, promptId))`). Nếu bất kỳ bảng nào khớp → trả `c.json({ error: "writing section locked", code: "WRITING_SECTION_LOCKED" }, 409)`.
         - Ghi vào `updates`: nếu `nextW === null` thì `updates.writingPart = null; updates.writingType = null; updates.writingPrompt = "";`, ngược lại ghi đủ 3 cột.
  3. **`assignments/tests.ts`:** ở `PUT /:id/parts`, select thêm `writingPart: assignmentPrompt.writingPart`; nếu `prompt.writingPart !== null` → trả `c.json({ error: "hybrid prompt cannot be attached to test" }, 400)`.
  4. **`study-pack-clone.ts` & `study-pack-clone.test.ts`:**
     - Đổi `export const D1_PROMPT_CLONE_INSERT_CHUNK = 3;` (bảng `assignment_prompt` có 27 cột sau khi thêm 3 cột `writing_*`; `getTableColumns(assignmentPrompt).length * 3 <= 100` D1 bind limit) và cập nhật `study-pack-clone.test.ts:222` kiểm tra `D1_PROMPT_CLONE_INSERT_CHUNK === 3` cùng bất biến `Object.keys(getTableColumns(assignmentPrompt)).length * D1_PROMPT_CLONE_INSERT_CHUNK <= 100`.
     - Trong `validateStudyPackItems`, select thêm `writingPart: assignmentPrompt.writingPart` trên `assignmentPrompt`; nếu `row.writingPart !== null` → trả `{ ok: false, status: 422, error: "hybrid prompt cannot be used in study packs" }`. Thêm assertion vào `study-pack-clone.test.ts`.
- **Success criteria:** Test `assignments/tests.test.ts` và `study-pack-clone.test.ts` pass 100%.
- **Verify:** `pnpm --filter server test -- study-pack-clone assignments/tests.test.ts` exits 0.

### Task 2.3 — TDD Green (Student, History, Grading, AI Grading & Reminders): Cập nhật `student.ts`, `student-class.ts`, `student-history.ts`, `grading.ts`, `run-grading.ts`, `dashboard-reminders.ts`
- **Goal:** Hoàn thiện toàn bộ luồng học viên, lịch sử, chấm AI (có guard bài rỗng + strip HTML đề), hàng đợi chấm và nhắc việc quá hạn.
- **Target files and symbols:**
  - `apps/server/src/routes/student-class.ts` (`loadClassAssignmentItems`)
  - `apps/server/src/routes/student.ts` (`loadOwnedAttemptWithSkill`, `GET /assignments/:assignmentId/quiz`, `PATCH /attempts/:attemptId/essay`, `POST /attempts/:attemptId/submit`, `loadAttemptForReview`, `GET /attempts/:attemptId`, `GET /attempts/:attemptId/detail`)
  - `apps/server/src/routes/student-history.ts` (`entryGradeOf`, `loadHistoryEntries`)
  - `apps/server/src/routes/grading.ts` (`loadGradingQueue`, `loadGradableAttempt`, `toSubmission`)
  - `apps/server/src/lib/ai-grading/run-grading.ts` (`loadAttemptForGrading`, `runAiGrading`)
  - `apps/server/src/routes/dashboard-reminders.ts` (`computeReminders`)
- **Steps:**
  1. **`student-class.ts`:** thêm `eq(classAssignment.orgId, orgId)` và `eq(assignmentPrompt.orgId, orgId)` vào join (defense-in-depth); select `writingPart: assignmentPrompt.writingPart`; thêm `...(row.writingPart !== null ? { hasWriting: true } : {})`.
  2. **`student.ts`:**
     - `loadOwnedAttemptWithSkill`: select thêm `writingPart: assignmentPrompt.writingPart`, `writingPrompt: assignmentPrompt.writingPrompt` (nhánh `practice` gán `writingPart: null, writingPrompt: ""`).
     - `GET /assignments/:assignmentId/quiz`: nếu `prompt.writingPart !== null`, thêm `writing: { part: prompt.writingPart, type: prompt.writingType ?? "", prompt: prompt.writingPrompt }`. Ở `detail.attempt.essay`: giữ `prompt.skill === "writing" ? essayToPlain(attempt.essay).text : attempt.essay` để đề gộp giữ nguyên văn UTF-16 khi resume!
     - `PATCH /attempts/:attemptId/essay`: đổi gate sang `if (essayTaskOf(attempt) === null) return c.json({ error: "essay not allowed" }, 400);`.
     - `POST /attempts/:attemptId/submit`: đổi điều kiện `scheduleAiGrading` sang `flipped.length > 0 && header !== undefined && hasGradableTask(header)`.
     - `loadAttemptForReview`: ở nhánh assignment, select thêm `writingPart`, `writingType`, `writingPrompt` và trả `writing: header[0]?.writingPart ? { part: header[0].writingPart, type: header[0].writingType ?? "", prompt: header[0].writingPrompt ?? "" } : null`.
     - `GET /attempts/:attemptId` (summary) VÀ `GET /attempts/:attemptId/detail`:
       - Dùng `const essayTask = essayTaskOf({ skill, part: loaded.part, writing: loaded.writing });`.
       - `const essayView = essayTask ? essayToPlain(attempt.essay) : null;` → gán `essay: essayView ? essayView.text : null`.
       - Trên `/detail`, nếu `loaded.writing` khác `null`, gắn `writing: loaded.writing`.
       - Trên CẢ summary VÀ `/detail`: khi `const teacherGrade = toQuizAttemptGrade(attempt)` khác `null`, gắn `grade = teacherGrade`, `part = essayTask ? essayTask.part : loaded.part`, và nếu `essayTask && essayView` thì nạp `loadEssayAnnotations` + `toPlainAnnotation` gắn `annotations` (khi `annotations.length > 0`).
  3. **`student-history.ts`:**
     - Select thêm `writingPart: assignmentPrompt.writingPart` trên query assignment attempts (nhánh practice gán `writingPart: null`).
     - Trong `entryGradeOf(row)`: nếu `row.writingPart !== null`:
       - Tính `objScore = row.correctCount !== null && row.total > 0 ? \`${row.correctCount}/${row.total}\` : null;`.
       - Nếu `row.gradeScores && row.gradedAt`: tính `band = formatBand(ieltsOverallBand(Object.values(row.gradeScores)))`, trả `{ score: objScore ? \`${objScore} · Band ${band}\` : \`Band ${band}\`, status: "graded" }`.
       - Nếu chưa chấm: trả `{ score: objScore, status: "awaiting" }`.
     - Khi dựng `HistoryEntry`, gắn `...(row.writingPart !== null ? { hasWriting: true } : {})`.
  4. **`grading.ts`:**
     - `loadGradingQueue`: thêm `or(inArray(assignmentPrompt.skill, ["writing", "speaking"]), isNotNull(assignmentPrompt.writingPart))`, select `writingPart`, map dòng gộp thành `skill: "writing"`, `part: row.writingPart`.
     - `loadGradableAttempt` & `toSubmission`: select `questionsSnapshot`, `correctCount` trên `base` và `writingPart`, `writingPrompt` trên nhánh assignment `header`. Với dòng gộp (`!practice && header?.writingPart && isAutoGradableSkill(header.skill ?? "")`), gán `skill = "writing"`, `part = header.writingPart`, `prompt = header.writingPrompt ?? ""`, `imageUrl = ""`, và `objective = { correctCount: base.correctCount ?? 0, totalCount: parseQuizQuestions(base.questionsSnapshot, base.id).length }`; gắn `...(row.objective ? { objective: row.objective } : {})` trong `toSubmission`.
  5. **`run-grading.ts`:**
     - Trong `loadAttemptForGrading`: select thêm `writingPart`, `writingPrompt` trên nhánh assignment; nếu `essayTaskOf(header)` trả về `essayTask`, trả `{ orgId: base.orgId, skill: "writing", part: essayTask.part, prompt: essayTask.hybrid ? htmlToPlainText(essayTask.prompt) : essayTask.prompt, essay: base.essay, mediaKey: base.mediaKey, hybrid: essayTask.hybrid }`.
     - Trong `runAiGrading` (ngay trước `ensureWallet` / `reserveCredits`): nếu `attempt.hybrid === true && essayToPlain(attempt.essay).text.trim().length === 0` (chỉ áp cho bài gộp để giữ nguyên 100% hành vi & test sẵn có của đề Writing thuần), gọi `casDraftFromProcessing` chuyển sang `status: "manual_pending"` (0 Credit, `errorCode: null`) và `return` ngay, tuyệt đối không gọi LLM hay trừ ví.
  6. **`dashboard-reminders.ts`:** thêm `eq(assignmentPrompt.orgId, orgId)` vào join, select `writingPart`, mở filter `or(inArray(assignmentPrompt.skill, ["writing", "speaking"]), isNotNull(assignmentPrompt.writingPart))`, và map dòng có `writingPart !== null` thành `{ skill: "writing" }`.
- **Success criteria:** Toàn bộ test trong `hybrid-assignment.test.ts` và toàn bộ test suite `apps/server` pass 100%.
- **Verify:** `pnpm --filter server test` exits 0 và không có test nào fail.

## Verification
- `pnpm --filter server test -- hybrid-assignment` exits 0.
- `pnpm --filter server test` exits 0.
- `pnpm check-types` exits 0.

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
