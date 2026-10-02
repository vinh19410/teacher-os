---
phase: 1
title: "Contract + DB + endpoint essay"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Contract + DB + endpoint essay

## Goal
Server lưu được bài viết Writing của một attempt đang làm, trả lại bài khi resume, và đưa bài đã nộp ra summary. Mọi guard (auth, CSRF, IDOR, trạng thái, skill, độ dài) phải được test bao phủ.

## Bối cảnh
- Schema: `packages/db/src/schema/quiz-attempt.ts`. Migration mới nhất là `0030_previous_drax.sql`; tạo migration bằng `pnpm db:generate`.
- Router: `apps/server/src/routes/student.ts`.
  - `quizWriteGuard` (khoảng `:565`) gồm Origin, Content-Type và `bodyLimit` 4096, áp cho `/attempts/*`.
  - PATCH answer (khoảng `:1014`) là khuôn mẫu cho ownership predicate, CAS `status = 'in_progress'`, và cách phân biệt 404/409.
  - GET quiz (khoảng `:816`) trả `attempt.answers`.
  - `loadAttemptForReview` (khoảng `:1185`) đã join `classAssignment → assignmentPrompt` để lấy header.
  - GET summary (khoảng `:1229`).
- Contract: `packages/api/src/contracts.ts`, các dòng `QUIZ_ANSWER_VALUE_MAX` (`:1658`), `studentQuizDetailSchema` (`:1696`), `quizAttemptSummarySchema` (`:1750`).
- Test: `apps/server/src/routes/student-quiz.test.ts` có sẵn fixture và các test (a)–(i).

## Files to Create / Modify
- Modify: `packages/db/src/schema/quiz-attempt.ts`, thêm `essay: text("essay").notNull().default("")` và cập nhật doc comment.
- Create (generated): `packages/db/src/migrations/0031_*.sql` + `meta/0031_snapshot.json` + `meta/_journal.json`.
- Modify: `packages/api/src/contracts.ts`
- Create: `packages/api/src/lib/word-count.ts`
- Modify: `apps/server/src/routes/student.ts`
- Modify: `apps/server/src/routes/student-quiz.test.ts`
- Create: `apps/student/test/word-count.test.ts` (test của `packages/api/src/lib` đang nằm ở `apps/student/test`, ví dụ `quiz-parts.test.ts`)

## Tasks & Steps

### 1.1 Contract
- [ ] Thêm `QUIZ_ESSAY_MAX = 10000` và `QUIZ_ESSAY_BODY_MAX = 48 * 1024` cạnh `QUIZ_ANSWER_VALUE_MAX`, kèm comment giải thích lý do chọn số (xem Key Decision 2 trong plan).
- [ ] Thêm `quizEssayPatchSchema = z.object({ text: z.string().max(QUIZ_ESSAY_MAX) }).strict()` và export type `QuizEssayPatch`.
- [ ] `studentQuizDetailSchema.attempt` thêm `essay: z.string().optional()`. Optional để client mới chạy với server cũ không throw; object con này không strict nên bundle cũ bỏ qua field mới.
- [ ] `quizAttemptSummarySchema` thêm `essay: z.string().nullable()` (null = đề không phải Writing). `quizAttemptDetailSchema` đang `.omit({ items })` từ summary nên sẽ kế thừa field này; server detail cũng phải set field đó.
- [ ] Thêm `WRITING_MIN_WORDS: Readonly<Record<string, number>> = { task1: 150, task2: 250 }`.

### 1.2 Word count helper
- [ ] Tạo `packages/api/src/lib/word-count.ts` với `export function countWords(text: string): number`, trả 0 khi chuỗi rỗng hoặc toàn whitespace, còn lại là `text.trim().split(/\s+/u).length`.
- [ ] Viết `apps/student/test/word-count.test.ts` cho các case: chuỗi rỗng, toàn whitespace/newline, nhiều khoảng trắng liên tiếp, xuống dòng/tab, từ gạch nối `well-known` = 1, số `1960` = 1, tiếng Việt có dấu.

### 1.3 DB
- [ ] Thêm cột `essay` vào schema, chạy `pnpm db:generate`. Kiểm tra SQL sinh ra đúng là `ALTER TABLE \`quiz_attempt\` ADD \`essay\` text DEFAULT '' NOT NULL;`. Nếu tên file migration do drizzle sinh ngẫu nhiên thì giữ nguyên, theo precedent.

### 1.4 Endpoint `PATCH /api/student/attempts/:attemptId/essay`
- [ ] `quizWriteGuard`: `maxSize` = `QUIZ_ESSAY_BODY_MAX` khi `c.req.path.endsWith("/essay")`, các path khác giữ `4096`. Không đăng ký thêm `bodyLimit` thứ hai, vì guard `/attempts/*` chạy trước sẽ chặn ở 4096.
- [ ] Handler:
  1. Parse JSON (lỗi thì 400 `invalid json`), sau đó `quizEssayPatchSchema.safeParse` (lỗi thì 400 `invalid body`).
  2. Đọc attempt theo `owner` (id + orgId + studentId), join `classAssignment` → `assignmentPrompt` (cả hai đều có predicate `orgId`) để lấy `skill`. Không có row thì 404. `status === "submitted"` thì 409. `skill !== "writing"` thì 400 `essay not allowed`.
  3. `UPDATE quiz_attempt SET essay = ? WHERE owner AND status = 'in_progress' RETURNING id`. Nếu 0 row thì re-read: không còn row thì 404, còn row thì 409 (y hệt PATCH answer).
  4. Trả `{ ok: true }`.
- [ ] Viết JSDoc theo style các handler bên cạnh, giải thích vì sao essay tách khỏi `answers`.

### 1.5 Đọc essay
- [ ] GET quiz: `attempt.essay = attempt.essay` khi attempt tồn tại.
- [ ] `loadAttemptForReview`: header select thêm `skill: assignmentPrompt.skill`. Summary và detail set `essay: header.skill === "writing" ? attempt.essay : null`.

### 1.6 Server tests (`student-quiz.test.ts`)
Seed thêm một prompt Writing (`skill: "writing"`, `part: "task1"`, `questions: []`) trong fixture hiện có, rồi viết test mới:
- [ ] `"writing essay autosaves, resumes via take payload and shows on summary"`: start, PATCH essay 200, GET quiz trả `attempt.essay`, submit, summary trả `essay` đúng nội dung, summary trả `totalCount 0`.
- [ ] `"essay patch guards: non-writing 400, over max 400, other student 404, after submit 409"`.
- [ ] `"essay route accepts bodies above 4096 bytes while answer route still rejects them"`: body khoảng 9.000 ký tự ở `/essay` thì 200, body lớn hơn `QUIZ_ESSAY_BODY_MAX` thì 413, body khoảng 5.000 byte ở `/answer` thì 413.
- [ ] Mở rộng test (a) để có endpoint thứ bảy: unauthenticated `/essay` trả 401.
- [ ] Summary của đề Reading có `essay: null`.

## Verification
- `pnpm --filter server test -- student-quiz`: tất cả xanh, gồm test mới.
- `pnpm --filter student test -- word-count`: xanh.
- `pnpm check-types`: xanh. Field `essay` mới trong summary sẽ làm fixture test/student đang build `QuizAttemptSummary` bị lỗi type; sửa các fixture đó ngay trong phase này (thêm `essay: null`).

## Risks
- Quên cập nhật `quizWriteGuard` sẽ khiến bài viết dài hơn khoảng 4KB bị 413 mà không có thông báo rõ. Test 1.6 thứ ba khoá hành vi này.
