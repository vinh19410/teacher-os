---
phase: 3
title: "Phase 3: API & Web UI bài nộp mẫu dùng thử trên /grading"
status: completed
priority: P1
effort: "2.5h"
dependencies: [1, 2]
---

# Phase 3: API & Web UI bài nộp mẫu dùng thử trên /grading

## Goal

Cung cấp cặp endpoint `POST /api/grading/demo-sample` và `DELETE /api/grading/demo-sample` cùng nút thao tác trên `/grading` để giáo viên tạo nhanh 1 bài nộp Writing Task 2 mẫu (kèm nhận xét AI mẫu cố định, không tốn credit AI, cô lập hoàn toàn khỏi danh sách học viên/ngân hàng đề/nhắc việc) và xóa sạch bất kỳ lúc nào.

## Files to Create / Modify

- Modify: `apps/server/src/routes/grading.ts` — thêm helper tạo/xóa bộ bài nộp mẫu theo ID tất định `demo-*:${orgId}`, thêm route `POST /demo-sample` và `DELETE /demo-sample`, và bỏ qua `emitNotifications` khi chấm bài `demo-attempt:%`.
- Modify: `apps/server/src/routes/snapshot.ts` — lọc bỏ `demo-student:%`, `demo-prompt:%`, `demo-test:%` khỏi `loadSnapshot` để dữ liệu mẫu của `/grading` không bao giờ lọt sang `/students`, `/classes`, `/tuition`, `/assignments`.
- Modify: `apps/server/src/routes/dashboard-reminders.ts` — lọc bỏ `demo-attempt:%` khỏi `computeReminders` để bài mẫu không báo giả "Bài quá hạn chấm > 24h" trên Dashboard.
- Modify: `apps/web/src/lib/repos/grading.ts` — thêm `DEMO_ATTEMPT_PREFIX`, `createDemoGradingSample`, và `deleteDemoGradingSample`.
- Modify: `apps/web/src/routes/_auth/grading/index.tsx` — thêm nút `"Tạo bài nộp mẫu dùng thử"` ở empty state của `/grading` và nút `"Xóa bài nộp mẫu"` khi trong hàng chờ có `demo-attempt:*`.
- Modify: `apps/server/src/routes/grading.test.ts` & `apps/web/src/routes/_auth/grading/index.test.tsx` — thêm unit/integration test cho tạo, chấm, cô lập snapshot/reminders, và xóa bài nộp mẫu.

## Tasks & Steps

### Task 3.1 — Cô lập ID `demo-*` tại `snapshot.ts` và `dashboard-reminders.ts`

- **Goal:** Đảm bảo bản ghi phục vụ bài nộp mẫu trên `/grading` (`demo-student:${orgId}`, `demo-prompt:${orgId}`, `demo-test:${orgId}`, `demo-attempt:${orgId}`) không bao giờ xuất hiện trong snapshot chung hay bộ đếm nhắc việc Dashboard.
- **Target files and symbols:**
  - `apps/server/src/routes/snapshot.ts`: `loadSnapshot` (dòng 256–356).
  - `apps/server/src/routes/dashboard-reminders.ts`: `computeReminders` (dòng 158–215).
- **Steps:**
  1. Trong `apps/server/src/routes/snapshot.ts` tại `loadSnapshot`:
     - Import `notLike` từ `drizzle-orm`.
     - Tại truy vấn `student` (dòng 256–260): đổi `.where(eq(student.orgId, orgId))` thành `.where(and(eq(student.orgId, orgId), notLike(student.id, "demo-student:%")))`.
     - Tại truy vấn `assignmentPrompt` (dòng 325–328): đổi `.where(eq(assignmentPrompt.orgId, orgId))` thành `.where(and(eq(assignmentPrompt.orgId, orgId), notLike(assignmentPrompt.id, "demo-prompt:%")))`.
     - Tại truy vấn `assignmentTest` (dòng 334–337): đổi `.where(eq(assignmentTest.orgId, orgId))` thành `.where(and(eq(assignmentTest.orgId, orgId), notLike(assignmentTest.id, "demo-test:%")))`.
  2. Trong `apps/server/src/routes/dashboard-reminders.ts` tại `computeReminders`:
     - Import `notLike` từ `drizzle-orm`.
     - Trong truy vấn `practiceRows` (khoảng dòng 186–209), thêm `notLike(quizAttempt.id, "demo-attempt:%")` vào `where(and(...))`.
- **Success criteria:** Khi DB có các dòng `demo-student:${orgId}`, `demo-prompt:${orgId}`, `demo-test:${orgId}`, `demo-attempt:${orgId}`, `loadSnapshot` và `computeReminders` hoàn toàn không trả về các dòng này.
- **Verify:** no verification needed (covered by Task 3.4 test suite).

### Task 3.2 — Triển khai `POST /api/grading/demo-sample` và `DELETE /api/grading/demo-sample` trong `apps/server/src/routes/grading.ts`

- **Goal:** Tạo idempotent bộ bài nộp Writing Task 2 mẫu (kèm `aiGradingDraft` tĩnh `status = "ai_drafted"`, `creditCost = 0`) và xóa sạch theo `orgId` khi giáo viên yêu cầu.
- **Target files and symbols:**
  - `apps/server/src/routes/grading.ts`: `gradingRoutes` (dòng 332–1194).
- **Steps:**
  1. Trong `apps/server/src/routes/grading.ts`, khai báo hằng tiền tố và hàm tạo ID tất định theo `orgId`:
     ```ts
     export const DEMO_ATTEMPT_PREFIX = "demo-attempt:";
     function demoIdsForOrg(orgId: string) {
     	return {
     		studentId: `demo-student:${orgId}`,
     		promptId: `demo-prompt:${orgId}`,
     		testId: `demo-test:${orgId}`,
     		partId: `demo-test-part:${orgId}`,
     		attemptId: `${DEMO_ATTEMPT_PREFIX}${orgId}`,
     	};
     }
     ```
  2. Trong `routes.post("/demo-sample", async (c) => { ... })` (đặt TRƯỚC `routes.get("/:attemptId", ...)`):
     - Kiểm tra `const ctx = c.get("kernelCtx"); if (!ctx) return unauthorized(c);`.
     - Kiểm tra quyền `if (!canPublishGrade(ctx.role)) return c.json({ error: "forbidden" }, 403);`.
     - Tính `const ids = demoIdsForOrg(ctx.orgId); const now = new Date(); const db = deps.getDb();`.
     - Chuẩn bị nội dung đề Writing Task 2 mẫu và bài luận mẫu (~260 từ) cùng nhận xét AI mẫu bằng tiếng Việt (`aiScores: { task: 6.5, coherence: 6.5, lexical: 6.0, grammar: 6.0 }`, `aiFeedback` nhận xét chi tiết 4 tiêu chí TA/CC/LR/GRA).
     - Thực thi `await db.batch([...])`:
       1. `db.insert(student).values({ id: ids.studentId, orgId: ctx.orgId, name: "Nguyễn Minh Anh (Học viên mẫu)", email: "", phone: "", zalo: "", parentName: "", parentPhone: "", createdAt: now }).onConflictDoNothing()`
       2. `db.insert(assignmentPrompt).values({ id: ids.promptId, orgId: ctx.orgId, task: "task2", genre: "opinion", skill: "writing", part: "task2", type: "opinion", title: "[Mẫu dùng thử] IELTS Writing Task 2 — AI in Education", band: "6.5", source: "Teacher OS Demo", prompt: "<p>Some people believe that artificial intelligence will soon replace teachers in the classroom. To what extent do you agree or disagree?</p>", intro: "", passage: "", transcript: "", cueTopic: "", cuePoints: "", audioName: "", imageUrl: "", questions: "[]", optionBank: "[]", note: "Đề mẫu giúp giáo viên trải nghiệm giao diện chấm bài và gợi ý AI.", status: "draft", createdAt: now }).onConflictDoNothing()`
       3. `db.insert(assignmentTest).values({ id: ids.testId, orgId: ctx.orgId, title: "[Mẫu dùng thử] IELTS Writing Task 2 — AI in Education", description: "Bài nộp mẫu dùng thử tính năng chấm điểm", skill: "writing", status: "draft", createdAt: now, updatedAt: now }).onConflictDoNothing()`
       4. `db.insert(assignmentTestPart).values({ id: ids.partId, testId: ids.testId, promptId: ids.promptId, part: "task2", position: 0 }).onConflictDoNothing()`
       5. `db.insert(quizAttempt).values({ id: ids.attemptId, orgId: ctx.orgId, assignmentId: null, studentId: ids.studentId, testId: ids.testId, mode: "practice", status: "submitted", questionsSnapshot: "[]", answers: "{}", essay: DEMO_SAMPLE_ESSAY, gradeScores: null, gradeFeedback: "", gradedAt: null, startedAt: now, submittedAt: now }).onConflictDoUpdate({ target: quizAttempt.id, set: { status: "submitted", essay: DEMO_SAMPLE_ESSAY, gradeScores: null, gradeFeedback: "", gradedAt: null, submittedAt: now } })`
       6. `db.insert(aiGradingDraft).values({ attemptId: ids.attemptId, orgId: ctx.orgId, skill: "writing", status: "ai_drafted", aiScores: { task: 6.5, coherence: 6.5, lexical: 6.0, grammar: 6.0 }, aiFeedback: DEMO_SAMPLE_AI_FEEDBACK, reviewedScores: null, reviewedFeedback: "", gradingMode: "standard", creditCost: 0, version: 1, retryCount: 0, startedAt: now, draftedAt: now, publishedAt: null }).onConflictDoUpdate({ target: aiGradingDraft.attemptId, set: { status: "ai_drafted", aiScores: { task: 6.5, coherence: 6.5, lexical: 6.0, grammar: 6.0 }, aiFeedback: DEMO_SAMPLE_AI_FEEDBACK, reviewedScores: null, reviewedFeedback: "", creditCost: 0, version: 1, publishedAt: null, draftedAt: now } })`
     - Trả `c.json({ attemptId: ids.attemptId }, 201)`.
  3. Thêm `routes.delete("/demo-sample", async (c) => { ... })`:
     - Kiểm tra `const ctx = c.get("kernelCtx"); if (!ctx) return unauthorized(c);`.
     - Kiểm tra `if (!canPublishGrade(ctx.role)) return c.json({ error: "forbidden" }, 403);`.
     - Tính `const ids = demoIdsForOrg(ctx.orgId); const db = deps.getDb();`.
     - Thực thi `await db.batch([...])` theo đúng thứ tự khóa ngoại:
       1. `db.delete(quizAttemptAnnotation).where(and(eq(quizAttemptAnnotation.attemptId, ids.attemptId), eq(quizAttemptAnnotation.orgId, ctx.orgId)))`
       2. `db.delete(aiGradingDraft).where(and(eq(aiGradingDraft.attemptId, ids.attemptId), eq(aiGradingDraft.orgId, ctx.orgId)))`
       3. `db.delete(quizAttempt).where(and(eq(quizAttempt.id, ids.attemptId), eq(quizAttempt.orgId, ctx.orgId)))`
       4. `db.delete(assignmentTestPart).where(eq(assignmentTestPart.id, ids.partId))`
       5. `db.delete(assignmentTest).where(and(eq(assignmentTest.id, ids.testId), eq(assignmentTest.orgId, ctx.orgId)))`
       6. `db.delete(assignmentPrompt).where(and(eq(assignmentPrompt.id, ids.promptId), eq(assignmentPrompt.orgId, ctx.orgId)))`
       7. `db.delete(student).where(and(eq(student.id, ids.studentId), eq(student.orgId, ctx.orgId)))`
     - Trả `c.json({ ok: true })`.
  4. Trong `routes.post("/:attemptId/grade", ...)` (`apps/server/src/routes/grading.ts:841`), bọc lời gọi `emitNotifications` trong điều kiện `if (!loaded.row.id.startsWith(DEMO_ATTEMPT_PREFIX))` để chấm bài mẫu không phát sinh bản ghi thông báo.
- **Success criteria:** `POST /api/grading/demo-sample` tạo bài nộp mẫu xuất hiện trong `GET /api/grading`, đọc được chi tiết tại `GET /api/grading/:attemptId` kèm `aiDraft`, chấm điểm thành công qua `POST /api/grading/:attemptId/grade`, và xóa sạch qua `DELETE /api/grading/demo-sample`.
- **Verify:** no verification needed (covered by Task 3.4 test suite).

### Task 3.3 — Bổ sung nút Tạo / Xóa bài nộp mẫu dùng thử trên `/grading`

- **Goal:** Cho phép giáo viên trên `/grading` tạo bài nộp mẫu bằng 1 cú nhấp chuột khi hàng chờ trống và xóa bài nộp mẫu ngay trên trang `/grading`.
- **Target files and symbols:**
  - `apps/web/src/lib/repos/grading.ts`: thêm `DEMO_ATTEMPT_PREFIX`, `createDemoGradingSample`, `deleteDemoGradingSample`.
  - `apps/web/src/routes/_auth/grading/index.tsx`: `GradingQueueRoute` (dòng 131–580).
- **Steps:**
  1. Trong `apps/web/src/lib/repos/grading.ts`:
     - Export `export const DEMO_ATTEMPT_PREFIX = "demo-attempt:";`.
     - Thêm hàm:
       ```ts
       export async function createDemoGradingSample(
       	baseUrl: string = getApiBaseUrl(),
       ): Promise<{ attemptId: string }> {
       	const res = await gradingFetch(
       		"/demo-sample",
       		{
       			method: "POST",
       			headers: { "Content-Type": "application/json" },
       			body: "{}",
       		},
       		"create demo grading sample",
       		baseUrl,
       	);
       	return (await res.json()) as { attemptId: string };
       }

       export async function deleteDemoGradingSample(
       	baseUrl: string = getApiBaseUrl(),
       ): Promise<void> {
       	await gradingFetch(
       		"/demo-sample",
       		{
       			method: "DELETE",
       		},
       		"delete demo grading sample",
       		baseUrl,
       	);
       }
       ```
     - Lưu ý: middleware của `kernel.ts` (dòng 154–168) chỉ yêu cầu `Content-Type: application/json` cho `POST`, còn `DELETE` chỉ kiểm tra `Origin` (trình duyệt tự gắn khi fetch cross-origin).
  2. Trong `apps/web/src/routes/_auth/grading/index.tsx`:
     - Sử dụng `useQueryClient()` từ `@tanstack/react-query` và state `sampleBusy: boolean`.
     - Kiểm tra `const hasDemoSample = items.some((item) => item.attemptId.startsWith(DEMO_ATTEMPT_PREFIX));`.
     - Trong `grading-empty-state` (dòng 300–313), thêm nút `"Tạo bài nộp mẫu dùng thử"` (`data-testid="create-demo-grading-sample"`): khi bấm gọi `createDemoGradingSample()`, sau đó `await queryClient.invalidateQueries({ queryKey: gradingQueueQueryKey })`.
     - Khi `hasDemoSample === true`, hiển thị nút `"Xóa bài nộp mẫu"` (`variant="secondary"`, `size="sm"`, `data-testid="delete-demo-grading-sample"`) ở `PageHead.action` của `/grading`: khi bấm gọi `deleteDemoGradingSample()` và invalidate `gradingQueueQueryKey`.
- **Success criteria:** Khi `/grading` rỗng, giáo viên thấy nút `"Tạo bài nộp mẫu dùng thử"`; bấm vào nạp bài nộp mẫu lên bảng; khi có bài nộp mẫu, nút `"Xóa bài nộp mẫu"` xuất hiện và bấm vào dọn sạch về trạng thái rỗng.
- **Verify:** no verification needed (covered by Task 3.4 test suite).

### Task 3.4 — Viết bài kiểm thử Server & Web cho Bài nộp mẫu `/grading`

- **Goal:** Khóa hành vi tạo, chấm, cô lập snapshot/reminders và xóa bài nộp mẫu bằng test tự động.
- **Target files and symbols:**
  - `apps/server/src/routes/grading.test.ts`
  - `apps/web/src/routes/_auth/grading/index.test.tsx`
- **Steps:**
  1. Trong `apps/server/src/routes/grading.test.ts`:
     - Thêm test `"POST /api/grading/demo-sample creates an isolated demo Writing attempt with static AI draft (0 credits) and DELETE removes it cleanly"`:
       - Gọi `POST /api/grading/demo-sample` → 201 `{ attemptId: "demo-attempt:..." }`.
       - Gọi `GET /api/grading` → thấy đúng 1 item `aiStatus: "ai_drafted"`, `skill: "writing"`.
       - Gọi `GET /api/kernel` (`loadSnapshot`) → `students`, `assignmentPrompts`, `assignmentTests` KHÔNG chứa bản ghi `demo-*`.
       - Gọi `GET /api/dashboard/reminders` → `overdueGrading.count === 0`.
       - Gọi `POST /api/grading/:attemptId/grade` với `{ scores: { task: 6.5, coherence: 6.5, lexical: 6.0, grammar: 6.0 }, feedback: "Tốt", version: 1 }` → 200.
       - Gọi `DELETE /api/grading/demo-sample` → 200 `{ ok: true }`; gọi lại `GET /api/grading` → `items: []`.
  2. Trong `apps/web/src/routes/_auth/grading/index.test.tsx`:
     - Thêm test kiểm tra nút `"Tạo bài nộp mẫu dùng thử"` ở empty state gọi `createDemoGradingSample` và nút `"Xóa bài nộp mẫu"` xuất hiện khi queue có `demo-attempt:org-1`.
- **Success criteria:** Toàn bộ test trong `apps/server/src/routes/grading.test.ts` và `apps/web/src/routes/_auth/grading/index.test.tsx` đều pass.
- **Verify:** `pnpm --filter server check-types && pnpm --filter web check-types && pnpm --filter server test -- src/routes/grading.test.ts && pnpm --filter web test -- src/routes/_auth/grading/index.test.tsx` exits 0.

## Verification

- `pnpm --filter server test -- src/routes/grading.test.ts` exits 0.
- `pnpm --filter web test -- src/routes/_auth/grading/index.test.tsx` exits 0.

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
