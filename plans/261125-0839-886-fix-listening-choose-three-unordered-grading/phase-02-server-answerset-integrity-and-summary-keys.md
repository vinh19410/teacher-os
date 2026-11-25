---
phase: 2
title: "Phase 2: Server answerSet Integrity & Summary Keys"
status: done
priority: P1
effort: "55m"
dependencies: [1]
---

# Phase 2: Server answerSet Integrity & Summary Keys

<!-- Updated: Red-Team 2026-11-25 - Findings #1, #2, #5, #6, #10 applied -->

## Goal

Bảo toàn `answerSet` (luôn `<= 20` ký tự) xuyên suốt mọi tuyến server (`snapshot.ts`, `assignments/index.ts`, `study-packs.ts`, `student-practice.ts`, `student.ts`), khóa cứng ranh giới part cho cả explicit lẫn implicit `mcq_many` trên đề nhiều part, đồng bộ tuyệt đối `promptType` giữa `POST /submit`, `loadAttemptForReview`, và `GET /attempts/:attemptId`, và trả set key nhất quán trên Summary.

## Files to Create / Modify

- Modify: `packages/db/src/seed/study-packs.ts`
- Modify: `apps/server/src/routes/snapshot.ts`
- Modify: `apps/server/src/routes/assignments/index.ts`
- Modify: `apps/server/src/routes/student-practice.ts`
- Modify: `apps/server/src/routes/student.ts`
- Modify: `apps/server/src/kernel.test.ts`
- Modify: `apps/server/src/routes/student-practice.test.ts`
- Modify: `apps/server/src/routes/student-quiz.test.ts`

## TDD Structure

- **Tests Before:** Task 2.1 thêm failing tests cho (a) `snapshot.ts` + `assignments/index.ts` round-trip `answerSet` & PATCH đổi `title` kèm `questions` từ snapshot trên prompt có attempt trả `200` (không dính `409 PROMPT_CONTENT_LOCKED`), (b) `student-practice.ts` đề 2 part tách tuyệt đối cả explicit `answerSet` (kể cả dài 20 ký tự) lẫn implicit `mcq_many` legacy giáp biên hai part và không 404, plus `parseQuizQuestions` sanitize `answerSet > 20` ký tự không gây 404/ZodError, (c) `student.ts` Summary trả `key: "C, D, F"` cho cụm Bikes Q8–10 (cả có và thiếu `answerSet`), Detail giữ single key `"C"`, `"D"`, `"F"`, và `POST /submit` khớp 100% `loadAttemptForReview` trên cả assignment lẫn practice (không rò type Part 1 sang Part 2–4).
- **Refactor:** Tasks 2.2, 2.3, 2.4 sửa `study-packs.ts`, `snapshot.ts`, `assignments/index.ts`, `student-practice.ts`, và `student.ts`.
- **Tests After:** Task 2.5 chạy đầy đủ server quiz/practice/kernel/listening-import/study-pack tests và typecheck.
- **Regression Gate:** `pnpm --filter server exec vitest run src/kernel.test.ts src/routes/assignments/prompt-content-lock.test.ts src/routes/student-practice.test.ts src/routes/student-practice-library-sync.test.ts src/routes/student-quiz.test.ts src/listening-library-import.test.ts && pnpm --filter @teacher-os/db exec vitest run src/seed/study-packs.test.ts`

## Tasks & Steps

### Task 2.1 — Viết failing server tests (Red) cho `snapshot`/content-lock, `student-practice` đa part, và `student` summary/submit

- **Goal:** Đóng khung bằng chứng thất bại trước khi sửa code server trên cả 3 file test.
- **Target files and symbols:**
  - `apps/server/src/kernel.test.ts` (chèn test mới NGAY SAU dòng `6451` — sau khi đóng hoàn toàn test `per-question type survives the snapshot round-trip`)
  - `apps/server/src/routes/student-practice.test.ts` (describe block mới cho multi-part explicit + implicit `answerSet` isolation, `max(20)`, và single-part overlong `answerSet` sanitization)
  - `apps/server/src/routes/student-quiz.test.ts` (describe block mới cho `mcq_many` Choose THREE summary set key vs detail single key, có & thiếu `answerSet`, prompt-level `type: "mcq_many"` ở assignment, và parity `POST /submit` vs `GET /attempts/:id` cho practice)
- **Steps:**
  1. Trong `apps/server/src/kernel.test.ts` (ngay sau dòng `6451`), thêm test dùng type hợp lệ của `ASSIGNMENT_PART_TYPES` (ví dụ `skill: "listening"`, `part: "s4"`, `type: "sent4"`, hoặc `skill: "reading"`, `part: "p2"`, `type: "info"`):
     - Tạo prompt qua `POST /api/assignments/prompts` gồm 2 câu có `answerSet: "set-bikes"` (không truyền `pin`, để mặc định) và 1 câu thường không có `answerSet`.
     - Đọc lại qua `t.kernel(orgA)`: assert 2 câu đầu giữ nguyên `answerSet: "set-bikes"`, câu 3 không có key `"answerSet"`.
     - Chèn `class_assignment` + `quiz_attempt` gắn với prompt đó, rồi gửi `PATCH /api/assignments/prompts/:id` với `{ title: "Renamed title", questions: row.questions }` (chính mảng `questions` lấy từ `/api/snapshot` có `type: null, pin: null`) → kỳ vọng `200` (KHÔNG dính `409 PROMPT_CONTENT_LOCKED`) và đọc lại snapshot vẫn giữ `answerSet: "set-bikes"`.
  2. Trong `apps/server/src/routes/student-practice.test.ts`, thêm describe block gồm 3 test:
     - **Explicit multi-part + 20-char `answerSet`:** Đề 2 part (`s1`, `s2`), Part 1 có 2 câu `mcq_many` `answerSet: "set-0123456789abcdef"` (20 ký tự, key `A, B`), Part 2 có 2 câu `mcq_many` CÙNG `answerSet: "set-0123456789abcdef"` (20 ký tự, key `C, D`). Assert `GET /api/student/practice/:testId/quiz` trả `200` (không `404`), `answerSet` 2 part khác nhau và đều `<= 20` ký tự; nộp đáp án tráo giữa 2 part `{"0": "C", "1": "D", "2": "A", "3": "B"}` → `correctCount === 0`; nộp đảo thứ tự nội bộ từng part `{"0": "B", "1": "A", "2": "D", "3": "C"}` → `correctCount === 4`, summary `items[0..1].key === "A, B"`, `items[2..3].key === "C, D"`.
     - **Implicit multi-part boundary guard:** Đề 2 part (`s1`, `s2`) KHÔNG có `answerSet`, cuối Part 1 là 2 câu `mcq_many` stem `"Choose TWO letters, A-E."`, `opts: ["A","B","C","D","E"]`, key `A, B`; đầu Part 2 là 2 câu `mcq_many` CÙNG stem/opts, key `C, D`. Assert `GET /quiz` cấp `answerSet` khác nhau cho 2 part, nộp tráo giữa 2 part `{"0": "C", "1": "D", "2": "A", "3": "B"}` → `correctCount === 0` (không gộp chéo part thành cụm 4 câu).
     - **Overlong legacy `answerSet` (> 20 chars) on 1-part practice:** Prompt 1 part chứa 2 câu `answerSet: "legacy-overlong-answerset-key-01"` (32 ký tự). Assert `GET /api/student/practice/:testId/quiz` trả `200` (không `404`), `answerSet` đã sanitize `<= 20` ký tự, và nộp hoán vị vẫn chấm `2/2`.
  3. Trong `apps/server/src/routes/student-quiz.test.ts`, thêm describe block cho Choose THREE Bikes Q8–10 (`C, D, F`):
     - **Case A (có `answerSet: "set-2"`):** Nộp `{ "0": "A", "1": "C", "2": "D" }` → `POST /submit` trả `{ correctCount: 2, wrongCount: 1 }`; `GET /attempts/:id` (summary) trả `items` với `verdict: ["wrong", "correct", "correct"]` và `key: ["C, D, F", "C, D, F", "C, D, F"]`; `GET /attempts/:id/detail` vẫn giữ `questions[i].key` là `["C", "D", "F"]` và `verdict: ["wrong", "correct", "correct"]`.
     - **Case B (legacy assignment snapshot thiếu `answerSet`, `prompt.type = "mcq_many"`, `question.type = null`):** Nộp `{ "0": "F", "1": "C", "2": "D" }` → `POST /submit` trả `correctCount: 3`, summary `items[i].key === "C, D, F"`, detail `verdict` toàn `"correct"` và single `key: ["C", "D", "F"]`.
     - **Case C (practice `promptType` parity — chống split-brain & chống rò type Part 1 sang Part 2):** Đề practice 2 part mà Part 1 có `prompt.type = "mcq_many"` còn Part 2 có 2 câu `type: null` trùng `(stem, opts)` trong snapshot: `POST /submit`, `GET /attempts/:id`, và `GET /attempts/:id/detail` cho cùng một `correctCount` và `verdicts`, không áp `mcq_many` của Part 1 lên Part 2.
- **Success criteria:** Cả 3 suite test đều fail đúng ở các test mới trong pha Red.
- **Verify:** Chạy độc lập từng lệnh (không nối `&&` để xác minh cả 3 suite đều Red):
  - `pnpm --filter server exec vitest run src/kernel.test.ts` exits non-zero on the new `answerSet` round-trip test.
  - `pnpm --filter server exec vitest run src/routes/student-practice.test.ts` exits non-zero on the new multi-part / overlong `answerSet` tests.
  - `pnpm --filter server exec vitest run src/routes/student-quiz.test.ts` exits non-zero on the new Choose THREE summary/submit tests.

### Task 2.2 — Forward & sanitize `answerSet` trong `snapshot.ts`, chuẩn hóa canonical `normalizeQuestions` ở `assignments/index.ts`, và thêm `.max(20)` ở `study-packs.ts` (RC2)

- **Goal:** Chặn triệt để việc rơi `answerSet`, khóa `> 20` ký tự, và lỗi `409 PROMPT_CONTENT_LOCKED` giả khi resend `questions` từ snapshot.
- **Target files and symbols:**
  - `apps/server/src/routes/snapshot.ts` (`parseQuestions`, dòng 156-203)
  - `apps/server/src/routes/assignments/index.ts` (`normalizeQuestions`, dòng 426-439)
  - `packages/db/src/seed/study-packs.ts` (`seedQuestionSchema`, dòng 124)
- **Steps:**
  1. Trong `apps/server/src/routes/snapshot.ts`:
     - Import `sanitizeAnswerSetKeys` từ `@teacher-os/api/lib/grade-quiz`.
     - Trong `parseQuestions`, sau block `explanation` (dòng 191-193), thêm conditional spread:
       ```ts
       ...(typeof record.answerSet === "string" &&
       record.answerSet.trim().length > 0
         ? { answerSet: record.answerSet.trim() }
         : {}),
       ```
     - Bọc mảng trả về của `parseQuestions` bằng `sanitizeAnswerSetKeys(...)` để đảm bảo không bao giờ trả `answerSet > 20` ký tự xuống wire. Không thêm key `answerSet` cho câu không có `answerSet` (`kernel.test.ts:6344`).
  2. Trong `apps/server/src/routes/assignments/index.ts:426-429`:
     - Cập nhật `normalizeQuestions` để sau khi `promptQuestionsSchema.safeParse(value)` thành công, chuẩn hóa từng question thành dạng canonical đồng nhất trước khi `JSON.stringify`: bỏ mọi field optional có giá trị `null`/`undefined` (ví dụ `type: q.type ?? undefined`, `pin: q.pin ?? undefined`, `answerSet: q.answerSet ?? undefined`, `explanation: q.explanation ?? undefined`, và `opts: q.opts ?? null`, `alts: q.alts`) để JSON lưu trong DB (vốn bỏ key `undefined`) khớp 100% với payload đọc từ `snapshot.ts` (vốn gắn `type: null, pin: null`).
  3. Trong `packages/db/src/seed/study-packs.ts:124`, đổi `answerSet: z.string().trim().min(1).optional()` thành `answerSet: z.string().trim().min(1).max(20).optional()`.
- **Success criteria:** `kernel.test.ts`, `prompt-content-lock.test.ts`, và `study-packs.test.ts` pass 100%.
- **Verify:** `pnpm --filter server exec vitest run src/kernel.test.ts src/routes/assignments/prompt-content-lock.test.ts && pnpm --filter @teacher-os/db exec vitest run src/seed/study-packs.test.ts` exits 0.

### Task 2.3 — Tách biên part cho cả explicit lẫn implicit `mcq_many` trong `apps/server/src/routes/student-practice.ts` (RC4)

- **Goal:** Ngăn va chạm `answerSet` và ngăn trộn chéo cụm implicit `mcq_many` giữa các part trong `buildMergedQuestions`, đồng thời bảo đảm `<= 20` ký tự theo `studentQuizQuestionSchema`.
- **Target files and symbols:**
  - `apps/server/src/routes/student-practice.ts` (import `resolveAnswerSetGroups`, `buildMergedQuestions` dòng 109-124)
- **Steps:**
  1. Import `resolveAnswerSetGroups` từ `@teacher-os/api/lib/grade-quiz` trong `apps/server/src/routes/student-practice.ts`.
  2. Trong `buildMergedQuestions(parts, testId)`:
     - Với từng part `(row, partIndex)`: parse `parsed = parseQuizQuestions(row.prompt.questions, ...)` (đã được sanitize `<= 20` ký tự từ Task 2.4), tính `effectiveTypes = inferQuestionTypes(parsed, row.prompt.type)`, tạo mảng `partQuestions` đã gắn `type: effectiveTypes[index] ?? row.prompt.type`.
     - Nếu `parts.length <= 1`, trả `partQuestions` giữ nguyên `answerSet` gốc (giữ nguyên `"g2"` cho `student-practice-library-sync.test.ts:316`).
     - Nếu `parts.length > 1`:
       - Chạy `resolveAnswerSetGroups(partQuestions, { promptType: row.prompt.type })` trong phạm vi riêng của part này.
       - Tạo `scopedKeyByIndex = new Map<number, string>()` và `seq = 0`:
         - Với mỗi group trong `unorderedGroups` (bao phủ cả explicit `answerSet >= 2` lẫn implicit `mcq_many >= 2` của part đó): `seq += 1`, gán `p${partIndex + 1}-s${seq}` cho mọi `m.index` trong group.
         - Với các câu thuộc `positional` nhưng vẫn mang explicit `answerSet` đơn lẻ (1 câu): `seq += 1`, gán `p${partIndex + 1}-s${seq}` để không bị đụng explicit key của part khác.
       - Khi map trả về từng câu: chỉ dùng conditional spread `...(scopedKey ? { answerSet: scopedKey } : {})`, không bao giờ gắn `answerSet: undefined` lên câu thường.
- **Success criteria:** Tất cả test trong `student-practice.test.ts` và `student-practice-library-sync.test.ts` pass 100%.
- **Verify:** `pnpm --filter server exec vitest run src/routes/student-practice.test.ts src/routes/student-practice-library-sync.test.ts` exits 0.

### Task 2.4 — Sanitize `answerSet` trong `parseQuizQuestions`, đồng bộ `gradingPromptType`, và dùng `resolveSummaryAnswerKeys` trong `apps/server/src/routes/student.ts` (RC1 + RC4 + RC5)

- **Goal:** Đảm bảo `parseQuizQuestions`, `POST /submit`, `loadAttemptForReview`, và `GET /attempts/:attemptId` nhất quán tuyệt đối — không bao giờ lệch điểm giữa DB/Summary/Detail, không bao giờ rò type Part 1 trên practice, không bao giờ đẩy `answerSet > 20` ký tự xuống client, và hiển thị đúng set key trên Summary.
- **Target files and symbols:**
  - `apps/server/src/routes/student.ts` (import tại dòng 37, `parseQuizQuestions` dòng 313-357, `loadOwnedAttemptWithSkill` dòng 950-1015, `POST /attempts/:attemptId/submit` dòng 2500-2503, `loadAttemptForReview` dòng 2661-2671, `GET /attempts/:attemptId` dòng 2762 & 2779-2786)
- **Steps:**
  1. Cập nhật import tại dòng 37: `import { gradeQuiz, resolveSummaryAnswerKeys, sanitizeAnswerSetKeys } from "@teacher-os/api/lib/grade-quiz";`.
  2. Trong `parseQuizQuestions` (dòng 313-357), bọc mảng kết quả bằng `sanitizeAnswerSetKeys(...)` để bảo đảm mọi snapshot (cả mới lẫn cũ) không bao giờ đẩy `answerSet > 20` ký tự ra `studentQuizDetailSchema` / `quizAttemptDetailSchema`.
  3. Trong `loadOwnedAttemptWithSkill` (`select` dòng 957-972), select thêm `promptType: assignmentPrompt.type`; ở nhánh `row.mode === "practice"` (dòng 1000-1005), đặt `promptType: null`.
  4. Định nghĩa quy tắc đồng nhất `gradingPromptType`:
     - Tại `POST /attempts/:attemptId/submit` (dòng 2502): `const gradingPromptType = attempt.mode === "practice" ? undefined : (header.promptType || undefined);` rồi gọi `gradeQuiz(questions, answers, { promptType: gradingPromptType })`.
     - Tại `loadAttemptForReview` (dòng 2663): `const gradingPromptType = attempt.mode === "practice" ? undefined : (header[0]?.type || undefined);` rồi gọi `gradeQuiz(questions, answers, { promptType: gradingPromptType })`.
     - Tại `GET /attempts/:attemptId` (dòng 2762): destructure thêm `promptType` từ `loaded`: `const { attempt, questions, answers, grade, title, skill, part, promptType, writing } = loaded;`.
     - Tại `GET /attempts/:attemptId` (dòng 2779-2786): tính `const gradingPromptType = attempt.mode === "practice" ? undefined : (promptType || undefined);` và `const summaryKeys = resolveSummaryAnswerKeys(questions, { promptType: gradingPromptType });`, sau đó dùng `key: summaryKeys[index] ?? question.answer` trong `items`.
  5. Tuyệt đối KHÔNG sửa `GET /attempts/:attemptId/detail` dòng 2899 (giữ nguyên `key: question.answer` đơn lẻ trên wire để `QuizMcqManyCard` và `isAcceptedAnswer` hoạt động chuẩn).
- **Success criteria:** Toàn bộ test server liên quan và `check-types` pass 100%.
- **Verify:** `pnpm --filter server exec vitest run src/routes/student-quiz.test.ts src/routes/student-practice.test.ts src/routes/student-practice-library-sync.test.ts src/listening-library-import.test.ts src/kernel.test.ts src/routes/assignments/prompt-content-lock.test.ts && pnpm --filter server check-types` exits 0.

## Verification

- `pnpm --filter server exec vitest run src/kernel.test.ts src/routes/assignments/prompt-content-lock.test.ts src/routes/student-practice.test.ts src/routes/student-practice-library-sync.test.ts src/routes/student-quiz.test.ts src/listening-library-import.test.ts`
- `pnpm --filter @teacher-os/db exec vitest run src/seed/study-packs.test.ts`
- `pnpm --filter server check-types`

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
