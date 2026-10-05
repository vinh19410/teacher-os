---
phase: 2
title: "Server: API chấm bài + snapshot + summary học viên"
status: pending
priority: P1
effort: "4.5h"
dependencies: [1]
---

# Phase 2: Server — API chấm bài + snapshot + summary học viên

## Goal
Giáo viên đọc được bài nộp Writing/Speaking (kèm file nói), lưu điểm qua `/api/grading/:attemptId`. Snapshot kernel mang `attemptId`/`gradedAt`/`band` theo target. Summary học viên mang `grade` khi đã chấm.

## Files to Create / Modify
- Create: `apps/server/src/lib/media-response.ts`
- Create: `apps/server/src/lib/quiz-grade.ts`
- Create: `apps/server/src/routes/grading.ts`
- Create: `apps/server/src/routes/grading.test.ts`
- Modify: `apps/server/src/routes/student.ts` (dùng helper mới cho GET media + thêm `grade` ở GET summary)
- Modify: `apps/server/src/routes/kernel.ts` (mở rộng type deps + mount `/grading`)
- Modify: `apps/server/src/routes/snapshot.ts` (targets thêm 3 field)
- Modify: `apps/server/src/app.ts` (CORP `same-site` cho path media giáo viên)

## Tasks

### Task 2.1 — Tách helper media dùng chung
- **Goal:** route GET media của học viên và của giáo viên dựng `Response` giống hệt nhau từ một chỗ.
- **Target files and symbols:**
  - Mới: `apps/server/src/lib/media-response.ts`, export `toQuizAttemptMedia`, `mediaObjectResponse`.
  - Sửa: `apps/server/src/routes/student.ts` (bỏ `encodeRfc8187` ở dòng khoảng 121–126 và `toQuizAttemptMedia` ở dòng khoảng 129–143; sửa handler `router.get("/attempts/:attemptId/media"` ở dòng khoảng 1483–1517).
- **Steps:**
  1. Chuyển nguyên văn `encodeRfc8187` (không export) và `toQuizAttemptMedia` (export) từ `student.ts` sang file mới, giữ cả JSDoc. Import type `QuizAttemptMedia` từ `@teacher-os/api/contracts` và type `StoredMedia` từ `./media-store`.
  2. Thêm vào file mới:
     ```ts
     /** Stream file bài nói — header khoá cứng cho mọi caller (học viên,
      * giáo viên): nosniff + CSP sandbox nên file giả MIME không chạy được. */
     export function mediaObjectResponse(
       object: StoredMedia,
       meta: { mediaType: string | null; mediaName: string | null },
     ): Response {
       return new Response(object.body, {
         headers: {
           "Content-Type": meta.mediaType ?? object.contentType,
           "Content-Length": String(object.size),
           "Content-Disposition": `inline; filename*=UTF-8''${encodeRfc8187(meta.mediaName ?? "media")}`,
           "X-Content-Type-Options": "nosniff",
           "Content-Security-Policy": "default-src 'none'; sandbox",
           "Cache-Control": "private, no-store",
         },
       });
     }
     ```
  3. Trong `student.ts`: xoá 2 hàm đã chuyển, thêm `import { mediaObjectResponse, toQuizAttemptMedia } from "../lib/media-response";`. Trong handler GET media, thay khối `return new Response(object.body, { headers: {...} })` bằng `return mediaObjectResponse(object, attempt);`. `attempt` đã có `mediaType` và `mediaName`.
  4. Tìm mọi chỗ còn gọi `encodeRfc8187` trong `student.ts`: `grep -n "encodeRfc8187" apps/server/src/routes/student.ts`. Nếu còn chỗ dùng ngoài handler GET media thì export `encodeRfc8187` từ file mới và import lại; nếu không còn thì giữ nó private.
- **Success criteria:** `student.ts` không còn định nghĩa `toQuizAttemptMedia`/`encodeRfc8187`. Test media học viên vẫn xanh (khoá header không đổi).
- **Verify:** `pnpm --filter server test -- student-quiz-media` exits 0, không có test `failed`.

### Task 2.2 — Helper điểm `quiz-grade.ts`
- **Goal:** chuyển cột `grade_*` thành `QuizAttemptGrade`, và validate scores theo skill, ở một chỗ.
- **Target files and symbols:** `apps/server/src/lib/quiz-grade.ts` (mới), export `toQuizAttemptGrade`, `parseGradeScores`.
- **Steps:**
  1. Viết:
     ```ts
     import {
       type QuizAttemptGrade,
       speakingGradeScoresSchema,
       writingGradeScoresSchema,
     } from "@teacher-os/api/contracts";
     import { type GradableSkill, ieltsOverallBand } from "@teacher-os/api/lib/ielts-band";

     /** Cột grade_* → wire; null khi chưa chấm (thiếu scores hoặc gradedAt). */
     export function toQuizAttemptGrade(row: {
       gradeScores: Record<string, number> | null;
       gradeFeedback: string;
       gradedAt: Date | null;
     }): QuizAttemptGrade | null {
       if (!row.gradeScores || !row.gradedAt) return null;
       const values = Object.values(row.gradeScores);
       if (values.length === 0) return null;
       return {
         scores: row.gradeScores,
         band: ieltsOverallBand(values),
         feedback: row.gradeFeedback,
         gradedAt: row.gradedAt.toISOString(),
       };
     }

     /** Scores đúng bộ 4 tiêu chí của skill (strict) — null nếu sai. */
     export function parseGradeScores(
       skill: GradableSkill,
       scores: unknown,
     ): Record<string, number> | null {
       const schema = skill === "writing" ? writingGradeScoresSchema : speakingGradeScoresSchema;
       const parsed = schema.safeParse(scores);
       return parsed.success ? parsed.data : null;
     }
     ```
  2. Kiểm tra cách server import subpath của `@teacher-os/api`. `student.ts` đang import `@teacher-os/api/lib/...` (ví dụ `grade-quiz`); làm theo đúng dạng đó.
- **Success criteria:** file compile (kiểm ở Task 2.7).
- **Verify:** no verification needed (Task 2.6 test bao trùm).

### Task 2.3 — Router `grading.ts`
- **Goal:** 3 endpoint GET bài nộp, GET media, POST grade dưới `/api/grading`, đúng mã lỗi trong plan.md Key Decision 5.
- **Target files and symbols:** `apps/server/src/routes/grading.ts` (mới), export `gradingRoutes(deps: { getDb(): Db; getMediaStore?(): MediaStore | undefined })`.
- **Steps:**
  1. Khung file theo đúng `apps/server/src/routes/assignments/index.ts`:
     - `type Env = { Variables: { kernelCtx: KernelCtx } }`;
     - hàm `unauthorized(c)`;
     - hàm `readBody(c, schema)` chép nguyên mẫu từ file đó (precedent local helper mỗi router).
     
     JSDoc đầu router ghi rõ: "Mount TRONG kernelRoutes (`kernel.route("/grading", …)`) để thừa hưởng Origin guard + guard JSON POST + role gate teacher — không mount standalone."
  2. Hàm nội bộ `loadGradableAttempt(db, attemptId, orgId)`:
     - Select từ `quizAttempt` các cột: `id, status, assignmentId, essay, mediaKey, mediaName, mediaType, mediaSize, mediaUploadedAt, startedAt, submittedAt, gradeScores, gradeFeedback, gradedAt`.
     - Kèm các cột từ join: `classAssignment.{id, classId, title, due}`, `classTable.name`, `student.{id, name}`, `assignmentPrompt.{skill, part, prompt, imageUrl, cueTopic, cuePoints, note}`.
     - `innerJoin` có predicate `orgId = orgId` trên MỖI bảng (`classAssignment`, `assignmentPrompt`, `classTable`, `student`), cùng chuẩn IDOR với `loadAttemptForReview` ở `student.ts`.
     - `where(and(eq(quizAttempt.id, attemptId), eq(quizAttempt.orgId, orgId)))`.
     - Trả về:
       - `{ error: 404 }` khi không có row;
       - `{ error: 409 }` khi `status !== "submitted"`;
       - `{ error: 400 }` khi `!isGradableSkill(skill)`;
       - còn lại trả `{ row, skill }`, với `skill` đã narrow thành `GradableSkill`.
  3. Hàm nội bộ `errorResponse(c, code)`:
     - 404 trả `{ error: "attempt not found" }`;
     - 409 trả `{ error: "attempt not yet submitted", code: "NOT_SUBMITTED" }`;
     - 400 trả `{ error: "skill not gradable", code: "SKILL_NOT_GRADABLE" }`.
  4. Hàm nội bộ `toSubmission(row, skill): TeacherSubmission`, map đúng từng field của `teacherSubmissionSchema` (Phase 1 Task 1.3):
     - `essay: skill === "writing" ? row.essay : null`;
     - `media: skill === "speaking" ? toQuizAttemptMedia(row) : null`;
     - `grade: toQuizAttemptGrade(row)`;
     - `startedAt: row.startedAt.toISOString()`;
     - `submittedAt: row.submittedAt ? row.submittedAt.toISOString() : ""`;
     - `prompt: { prompt, imageUrl, cueTopic, cuePoints, note }`. Các cột prompt có thể null ở dữ liệu cũ; dùng `?? ""` cho từng field.
  5. `routes.get("/:attemptId", …)`: `ctx` thiếu thì trả `unauthorized`; load; lỗi thì trả `errorResponse`; còn lại trả `c.json(toSubmission(...) satisfies TeacherSubmission)`.
  6. `routes.get("/:attemptId/media", …)`:
     - `deps.getMediaStore?.()` undefined thì trả 503 `{ error: "media storage unavailable" }`;
     - load lỗi thì trả `errorResponse`;
     - `skill !== "speaking"` hoặc `row.mediaKey === null` thì trả 404 `{ error: "media not found" }`;
     - `store.get(key)` null thì trả 404;
     - còn lại `return mediaObjectResponse(object, row)`.
  7. `routes.post("/:attemptId/grade", …)`:
     1. `readBody(c, quizGradeInputSchema)`. Lỗi thì trả response của nó (400 `invalid json` / `invalid body`; nhận xét > 5000 ký tự rơi vào đây).
     2. Load. Lỗi thì trả `errorResponse`.
     3. `const scores = parseGradeScores(skill, body.data.scores)`. Null thì trả 400 `{ error: "invalid scores" }`.
     4. `const now = new Date()`, rồi UPDATE `quizAttempt` set `{ gradeScores: scores, gradeFeedback: body.data.feedback, gradedAt: now }`, where `id = attemptId AND orgId = ctx.orgId AND status = 'submitted'`, `.returning({ id: quizAttempt.id })`.
     5. Không có row trả về thì trả 409 `{ error: "attempt not yet submitted", code: "NOT_SUBMITTED" }`.
     6. Trả 200 `c.json(toQuizAttemptGrade({ gradeScores: scores, gradeFeedback: body.data.feedback, gradedAt: now }))`. Hàm luôn non-null ở đây; dùng `!` hoặc guard ném lỗi 500.
- **Success criteria:** router compile, có 3 route đúng path.
- **Verify:** no verification needed (Task 2.6 test bao trùm).

### Task 2.4 — Mount router + CORP
- **Goal:** `/api/grading/*` chạy sau Origin guard của kernel. Response media giáo viên có `Cross-Origin-Resource-Policy: same-site`.
- **Target files and symbols:**
  - `apps/server/src/routes/kernel.ts`: chữ ký `kernelRoutes(deps: {...})` ở dòng khoảng 71–75; khối `kernel.route(...)` ở dòng khoảng 2120–2123.
  - `apps/server/src/app.ts`: middleware ở dòng khoảng 136–139.
- **Steps:**
  1. `kernel.ts`: thêm `getMediaStore?(): MediaStore | undefined;` vào type deps của `kernelRoutes`, và `import type { MediaStore } from "../lib/media-store";`. `buildApp` đã truyền nguyên `deps` (kiểu `AppDeps`) vào `kernelRoutes(deps)` ở `app.ts:197`, nên không phải sửa chỗ gọi.
  2. `kernel.ts`: thêm `kernel.route("/grading", gradingRoutes(deps));` ngay sau `kernel.route("/comment-bank", …)`, và import `gradingRoutes` từ `./grading`.
  3. `app.ts`: ngay sau khối `app.use("/api/student/attempts/:attemptId/media", …)`, thêm khối tương tự cho `"/api/grading/:attemptId/media"`, set `Cross-Origin-Resource-Policy` là `same-site` sau `await next()`. Thêm comment 1 dòng: "Media giáo viên (chấm bài) — cùng lý do override CORP như route học viên ở trên."
- **Success criteria:** `GET /api/grading/x` không còn trả 404 kiểu "route không tồn tại" của Hono. Kiểm ở Task 2.6.
- **Verify:** no verification needed (Task 2.6 test bao trùm).

### Task 2.5 — Snapshot targets + summary học viên
- **Goal:** `classAssignments[].targets[]` có `attemptId`/`gradedAt`/`band`. `GET /api/student/attempts/:attemptId` có `grade` khi đã chấm.
- **Target files and symbols:**
  - `apps/server/src/routes/snapshot.ts`: khối `targetsByAssignment` ở dòng khoảng 301–321.
  - `apps/server/src/routes/student.ts`: handler `router.get("/attempts/:attemptId"` ở dòng khoảng 1693–1733.
- **Steps:**
  1. `snapshot.ts`: TRƯỚC vòng `for (const target of classAssignmentTargetRows)`, thêm query tuần tự:
     ```ts
     // Trạng thái chấm theo target: chỉ attempt đã nộp, chỉ 5 cột nhẹ
     // (không kéo essay/answers/snapshot đề).
     const submittedAttemptRows = await db
       .select({
         id: quizAttempt.id,
         assignmentId: quizAttempt.assignmentId,
         studentId: quizAttempt.studentId,
         gradeScores: quizAttempt.gradeScores,
         gradedAt: quizAttempt.gradedAt,
       })
       .from(quizAttempt)
       .where(and(eq(quizAttempt.orgId, orgId), eq(quizAttempt.status, "submitted")));
     const attemptByTarget = new Map(
       submittedAttemptRows.map((row) => [`${row.assignmentId}:${row.studentId}`, row]),
     );
     ```
     Thêm import `quizAttempt` từ `@teacher-os/db/schema/quiz-attempt` (hoặc từ barrel mà `snapshot.ts` đang dùng; xem khối import dòng 1–30), cùng `and` từ `drizzle-orm` nếu chưa có, và `ieltsOverallBand` từ `@teacher-os/api/lib/ielts-band`.
  2. Trong vòng lặp, đổi `list.push({...})` thành:
     ```ts
     const attempt = attemptByTarget.get(`${target.assignmentId}:${target.studentId}`);
     const scores = attempt?.gradedAt ? Object.values(attempt.gradeScores ?? {}) : [];
     list.push({
       studentId: target.studentId,
       submittedAt: target.submittedAt,
       attemptId: attempt?.id ?? null,
       gradedAt: attempt?.gradedAt && scores.length > 0 ? attempt.gradedAt.toISOString() : null,
       band: attempt?.gradedAt && scores.length > 0 ? ieltsOverallBand(scores) : null,
     });
     ```
  3. `student.ts`: trong handler summary, sau khi dựng `const summary: QuizAttemptSummary = {...}`, thêm:
     ```ts
     // Điểm giáo viên chấm: CHỈ thêm key khi đã chấm — bundle cũ (schema
     // strict) không vỡ ở attempt chưa chấm.
     const grade = toQuizAttemptGrade(attempt);
     if (grade) {
       summary.grade = grade;
       summary.part = part;
     }
     ```
     Để có `part`: trong `loadAttemptForReview` (`student.ts`, dòng khoảng 1655–1690), thêm `part: assignmentPrompt.part` vào select `header` và `part: header?.part ?? ""` vào object trả về; trong handler summary destructure thêm `part`. Import `toQuizAttemptGrade` từ `../lib/quiz-grade`. `attempt` ở đây là row đầy đủ (`db.select().from(quizAttempt)` trong `loadAttemptForReview`), nên đã có 3 cột mới. KHÔNG thêm `grade` vào handler `/detail`.
- **Success criteria:** type `KernelSnapshot` khớp (không còn lỗi type ở `snapshot.ts`); summary có `grade` khi chấm.
- **Verify:** no verification needed (Task 2.6 + 2.7 bao trùm).

### Task 2.6 — Test tích hợp `grading.test.ts`
- **Goal:** khoá mọi mã trạng thái, tenancy, validate điểm, stream media, snapshot và summary học viên.
- **Target files:** `apps/server/src/routes/grading.test.ts` (mới).
- **Steps:**
  1. Harness: chép mẫu `apps/server/src/routes/student-quiz-media.test.ts`:
     - phần migrate in-memory, dòng khoảng 105–108;
     - `createMemoryMediaStore`, dòng khoảng 31–60, có thể rút gọn bỏ `hooks`;
     - `buildApp` với `getMediaStore`.

     `sessionFor(headers)` đọc header `x-test-user`:
     - `"teacher-1"` trả `{ userId: "t-1", userName: "Cô Lan", role: "teacher" }`;
     - `"teacher-2"` trả `{ userId: "t-2", userName: "Thầy Nam", role: "teacher" }`;
     - `"student-u"` trả `{ userId: "u-s", userName: "Minh", email: "minh@gmail.com", emailVerified: true, role: "student" }`;
     - còn lại trả `null`.

     Xem type `SessionUser` trong `apps/server/src/session.ts` để điền đúng field bắt buộc. `corsOrigin: ["http://localhost:8001", "http://localhost:8003"]`. Request ghi (POST) gửi header `origin: "http://localhost:8001"` và `content-type: application/json`.
  2. Seed trong `beforeAll`:
     - `organization` `org-1` và `org-2`;
     - `user` `t-1`, `t-2` (bảng `schema.user`; xem cột bắt buộc trong `packages/db/src/schema/auth.ts`);
     - `membership` (`t-1` → `org-1`, `t-2` → `org-2`, role `teacher`). Bootstrap middleware thấy membership có sẵn nên dùng đúng org đó;
     - `student-1` thuộc `org-1`; `class-1` thuộc `org-1`, chép giá trị cột từ test media;
     - 3 prompt `org-1`:
       - `prompt-writing`: skill `writing`, part `task2`, `prompt: "<p>Some people think…</p>"`, `questions: "[]"`;
       - `prompt-speaking`: chép từ test media;
       - `prompt-reading`: chép từ test media;
     - các `classAssignment` + `classAssignmentTarget` cho `student-1`: `ca-w` (writing), `ca-w-open` (writing), `ca-s` (speaking), `ca-r` (reading);
     - `quizAttempt` (cột bắt buộc: `id, orgId, assignmentId, studentId, status, questionsSnapshot: "[]"`):
       - `att-w`: `ca-w`, `submitted`, `essay: "My essay line 1\nline 2"`, `submittedAt: new Date()`;
       - `att-w-open`: `ca-w-open`, `in_progress`;
       - `att-s`: `ca-s`, `submitted`, `mediaKey: "quiz-media/org-1/att-s/k1"`, `mediaName: "bai-noi.mp3"`, `mediaType: "audio/mpeg"`, `mediaSize: 4`, `mediaUploadedAt: new Date()`, `submittedAt: new Date()`;
       - `att-r`: `ca-r`, `submitted`, `questionsSnapshot` lấy từ prompt reading.

       Ghi object `quiz-media/org-1/att-s/k1` vào memory store, nội dung `new Uint8Array([1, 2, 3, 4])`, contentType `audio/mpeg`.
  3. Test case. Mỗi case là một `test(...)`; tên test mô tả hành vi, không chứa mã plan:
     1. `GET /api/grading/att-w` với teacher-1 → 200. `skill === "writing"`, `essay === "My essay line 1\nline 2"`, `media === null`, `grade === null`, `student.name === "Minh Tran"` (theo tên seed), `prompt.prompt` chứa `Some people think`, `className` đúng.
     2. `GET /api/grading/att-s` → 200, `essay === null`, `media.name === "bai-noi.mp3"`, `media.size === 4`.
     3. `GET /api/grading/att-w` với teacher-2 (org khác) → 404.
     4. `GET /api/grading/att-w-open` → 409 và `code === "NOT_SUBMITTED"`.
     5. `GET /api/grading/att-r` → 400 và `code === "SKILL_NOT_GRADABLE"`.
     6. `GET /api/grading/att-w` với `x-test-user: student-u` → 403 (role gate có sẵn ở `app.ts:86`).
     7. `GET /api/grading/att-s/media` → 200, body đúng 4 byte `[1,2,3,4]`, header `x-content-type-options` là `nosniff`, `content-security-policy` là `default-src 'none'; sandbox`, `cache-control` là `private, no-store`, `cross-origin-resource-policy` là `same-site`.
     8. `GET /api/grading/att-w/media` → 404. `GET /api/grading/att-s/media` với teacher-2 → 404.
     9. `POST /api/grading/att-w/grade` body `{ scores: { task: 6, coherence: 6.5, lexical: 6, grammar: 6.5 }, feedback: "Tốt.\nCần thêm ví dụ." }` → 200, `band === 6.5`, `feedback` khớp, `gradedAt` là ISO string. Sau đó `GET /api/grading/att-w` → `grade.band === 6.5`, `grade.scores.task === 6`.
     10. POST lại `att-w` với scores toàn `7` và `feedback: ""` → 200, `band === 7`. GET thấy bản mới (ghi đè).
     11. POST `att-s` với scores Writing (`task…`) → 400 `invalid scores`. POST `att-s` với `{ fluency: 7, lexical: 7, grammar: 7, pronunciation: 7 }` → 200, `band === 7`.
     12. Validate, mỗi case → 400:
         - thiếu 1 tiêu chí;
         - thừa key `extra`;
         - điểm `6.25`;
         - điểm `9.5`;
         - điểm `-1`;
         - `feedback` dài `5001` ký tự (`"a".repeat(5001)`);
         - body thiếu `feedback`.
     13. POST `att-w-open` (scores hợp lệ) → 409. POST `att-r` → 400 `SKILL_NOT_GRADABLE`. POST `att-w` với teacher-2 → 404.
     14. POST `att-w` với `origin: "https://evil.example"` → 403.
     15. Snapshot: `GET /api/kernel` với teacher-1 → `classAssignments`:
         - target của `ca-w` có `attemptId === "att-w"`, `band === 7`, `gradedAt` khác null;
         - target `ca-w-open` có `attemptId === null`, `band === null`.
     16. Summary học viên qua route thật. Session `student-u` có `email: "minh@gmail.com"`, và `requireStudent` resolve học viên theo email, nên seed `student-1` với đúng email này.
         - `GET /api/student/attempts/att-w` với `x-test-user: student-u` → 200, `grade.band === 7`, `grade.feedback === ""`, `part === "task2"`.
         - `GET /api/student/attempts/att-s2` → 200 và JSON KHÔNG có key `grade` lẫn `part` (`expect("grade" in json).toBe(false)`, `expect("part" in json).toBe(false)`).

         `att-s2` là attempt Speaking riêng, không bao giờ được chấm, để thứ tự test tất định: seed thêm `ca-s2` + target + `att-s2` status `submitted`, có media.
- **Success criteria:** mọi case pass.
- **Verify:** `pnpm --filter server test -- grading` exits 0, output có `grading.test.ts` và không có `failed`.

### Task 2.7 — Gate phase
- **Goal:** toàn bộ server xanh, type khớp.
- **Steps:** chạy lần lượt 2 lệnh dưới.
- **Success criteria / Verify:**
  - `pnpm --filter server test` exits 0, không có `failed`.
  - `pnpm --filter server check-types` exits 0.

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
