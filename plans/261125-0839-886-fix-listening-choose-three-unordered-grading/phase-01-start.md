---
phase: 1
title: "Phase 1: Core Grader Implicit Fallback & Summary Set Keys"
status: done
priority: P1
effort: "50m"
dependencies: []
---

# Phase 1: Core Grader Implicit Fallback & Summary Set Keys

<!-- Updated: Red-Team 2026-11-25 - Findings #3, #4, #6, #9, #10 applied -->

## Goal

Xây dựng một nguồn sự thật thuần duy nhất trong `packages/api/src/lib/grade-quiz.ts` (`sanitizeAnswerSetKeys`, `canClusterImplicitMcqMany`, `resolveAnswerSetGroups`, `resolveSummaryAnswerKeys`, và cập nhật `gradeQuiz`) để mọi cụm `mcq_many` — kể cả khi thiếu `answerSet`, mang hậu tố `(lựa chọn i/K)` như `first-step-gt2.json`, hoặc kế thừa `promptType` — đều chấm không phụ thuộc thứ tự, luôn đảm bảo `answerSet <= 20` ký tự, và sinh khóa đáp án tập hợp nhất quán cho màn Summary & Detail.

## Files to Create / Modify

- Modify: `packages/api/src/lib/grade-quiz.ts`
- Modify: `packages/api/src/lib/grade-quiz.test.ts`
- Modify: `apps/server/src/lib/grade-quiz.test.ts`

## TDD Structure

- **Tests Before:** Task 1.1 viết đầy đủ failing unit tests trong `packages/api/src/lib/grade-quiz.test.ts` và `apps/server/src/lib/grade-quiz.test.ts` cho Bikes Q8–10 (có & thiếu `answerSet`), `sysex-first-step-gt2-b59` hậu tố `(lựa chọn 1/3..3/3)` thiếu `answerSet`, hoán vị `{F, C, D}`, lệch vị trí `{A, C, D}`, trùng lặp `{C, C, D}`, bỏ trống `{D, F}`, kế thừa `promptType: "mcq_many"` (kể cả khi `question.type === ""`), cụm không liền kề không gộp nhầm, guard `< 2` lựa chọn không rỗng, `sanitizeAnswerSetKeys` (`> 20` ký tự), và `resolveSummaryAnswerKeys` (bao gồm extended `A–Z`, số La Mã `headings` chữ thường, text tự do).
- **Refactor:** Task 1.2 cài đặt `sanitizeAnswerSetKeys`, `canClusterImplicitMcqMany`, `resolveAnswerSetGroups`, `resolveSummaryAnswerKeys`, và nâng cấp `gradeQuiz` trong `packages/api/src/lib/grade-quiz.ts`.
- **Tests After:** Task 1.3 chạy toàn bộ regression gate của `@teacher-os/api` và `apps/server/src/lib/grade-quiz.test.ts`.
- **Regression Gate:** `pnpm --filter @teacher-os/api test && pnpm --filter server exec vitest run src/lib/grade-quiz.test.ts && pnpm --filter @teacher-os/api check-types`

## Tasks & Steps

### Task 1.1 — Viết failing tests (Red) cho fallback `mcq_many`, `sanitizeAnswerSetKeys`, và `resolveSummaryAnswerKeys`

- **Goal:** Tạo bộ test tái hiện chính xác lỗi chấm theo vị trí khi cụm Choose THREE (`mcq_many`) thiếu `answerSet`, hành vi chuẩn hóa khóa `> 20` ký tự, và hành vi sinh khóa tập hợp cho Summary.
- **Target files and symbols:**
  - `packages/api/src/lib/grade-quiz.test.ts` (imports + describe blocks mới)
  - `apps/server/src/lib/grade-quiz.test.ts` (describe block `gradeQuiz — answerSet (Choose TWO)` mở rộng thêm Choose THREE & fallback không `answerSet`)
- **Steps:**
  1. Trong `packages/api/src/lib/grade-quiz.test.ts`, import thêm `canClusterImplicitMcqMany`, `resolveSummaryAnswerKeys`, và `sanitizeAnswerSetKeys` từ `./grade-quiz`.
  2. Thêm describe block cho unordered grading của Choose THREE (fixture *Talking about the history of bikes* Q8–10, key `C, D, F`, 6 options A–F) gồm các trường hợp:
     - Có `answerSet: "set-2"`: `{ "0": "F", "1": "C", "2": "D" }` → `["correct", "correct", "correct"]` (`3/3`); `{ "0": "A", "1": "C", "2": "D" }` → `["wrong", "correct", "correct"]` (`2/3`); `{ "0": "A", "1": "E", "2": "F" }` → `["wrong", "wrong", "correct"]` (`1/3`).
     - Thiếu `answerSet` (`type: "mcq_many"`, cùng `stem` và `opts`, kể cả khi có khoảng trắng đầu/cuối): `{ "0": "F", "1": "C", "2": "D" }` → `3/3`, `{ "0": "A", "1": "C", "2": "D" }` → `2/3`, `{ "0": "C", "1": "C", "2": "D" }` → `["correct", "wrong", "correct"]` (`2/3`), `{ "0": "D", "1": "F" }` → `["correct", "correct", "skipped"]`.
     - Fixture study-pack `sysex-first-step-gt2-b59` thiếu `answerSet`: 3 câu `type: "mcq_many"` cùng 6 `opts`, stem `"Questions 1 (lựa chọn 1/3)"`, `"Questions 1 (lựa chọn 2/3)"`, `"Questions 1 (lựa chọn 3/3)"`, đáp án `A, D, F` → nộp `{ "0": "F", "1": "A", "2": "D" }` chấm `3/3`; đồng thời hai cụm kế tiếp có stem `"(lựa chọn 1/2)"`, `"(lựa chọn 2/2)"` rồi `"(lựa chọn 1/2)"`, `"(lựa chọn 2/2)"` với cùng base/opts KHÔNG bị gộp thành cụm 4 câu.
     - Kế thừa `promptType: "mcq_many"` khi `question.type` là `null`, `undefined`, HOẶC `""` qua `gradeQuiz(questions, answers, { promptType: "mcq_many" })`.
     - Hai cụm `mcq_many` thiếu `answerSet` bị ngăn cách bởi 1 câu `mcq` hoặc khác `stem`/`opts` tuyệt đối không trộn đáp án sang nhau.
     - Cụm `mcq_many` có `opts: null`, `opts: ["", ""]`, `opts: ["Only one", "   "]`, hoặc `opts.length < 2` KHÔNG được kích hoạt implicit clustering (`canClusterImplicitMcqMany` trả `false`, `gradeQuiz` chấm positional an toàn).
  3. Thêm describe block cho `resolveSummaryAnswerKeys`:
     - Cụm Bikes Q8–10 (cả có `answerSet` lẫn fallback không `answerSet`) trả `["C, D, F", "C, D, F", "C, D, F"]` ngay cả khi thứ tự key trong snapshot là `["F", "C", "D"]`.
     - Cụm extended bank (`type: "sent4"`, `opts: null`, `answerSet: "q1-4"`, answers `K, C, G, E`) trả `"C, E, G, K"` (nhận `A–Z`, không cắt ở `A–H`).
     - Cụm `headings` số La Mã chữ thường (`type: "headings"`, `answerSet: "h1"`, answers `["i", "v"]`) giữ nguyên chữ thường `"i, v"` (không ép hoa thành `"I, V"`).
     - Cụm text tự do (`answerSet: "s1"`, answers `["solar", "wind"]`) giữ thứ tự xuất hiện và khử trùng (`"solar, wind"`).
     - Câu positional hoặc explicit `answerSet` chỉ có 1 câu giữ nguyên `question.answer`.
  4. Thêm describe block cho `sanitizeAnswerSetKeys`:
     - Khóa `<= 20` ký tự giữ nguyên giá trị đã trim.
     - Hai khóa khác nhau cùng dài `> 20` ký tự và trùng 20 ký tự đầu (`"very-long-answerset-prefix-1"` và `"very-long-answerset-prefix-2"`) được remap nhất quán sang 2 khóa ngắn khác nhau (`<= 20` ký tự), không va chạm nhau và không đụng các khóa ngắn đang có sẵn trong mảng.
  5. Trong `apps/server/src/lib/grade-quiz.test.ts`, thêm test kiểm tra Bikes Q8–10 không `answerSet` hoán vị `{F, C, D}` và `{A, C, D}` đều chấm đúng tập hợp.
- **Success criteria:** Cả hai file test đều thất bại đúng ở các assertion/export mới trong pha Red.
- **Verify:** Chạy độc lập từng lệnh (không nối `&&` để xác minh cả 2 suite đều Red):
  - `pnpm --filter @teacher-os/api exec vitest run src/lib/grade-quiz.test.ts` exits non-zero with failures on the new tests.
  - `pnpm --filter server exec vitest run src/lib/grade-quiz.test.ts` exits non-zero with failures on the new Bikes fallback tests.

### Task 1.2 — Cài đặt `sanitizeAnswerSetKeys`, `canClusterImplicitMcqMany`, `resolveAnswerSetGroups`, `resolveSummaryAnswerKeys` và nâng cấp `gradeQuiz` (Green)

- **Goal:** Triển khai bộ hàm thuần dùng chung trong `packages/api/src/lib/grade-quiz.ts` làm single source of truth cho grader, server routes, và `QuizPaper`.
- **Target files and symbols:**
  - `packages/api/src/lib/grade-quiz.ts` (`ANSWER_SET_MAX_LENGTH`, `GradeQuizOptions`, `sanitizeAnswerSetKeys`, `canClusterImplicitMcqMany`, `resolveAnswerSetGroups`, `resolveSummaryAnswerKeys`, `gradeQuiz`)
- **Steps:**
  1. Định nghĩa `export const ANSWER_SET_MAX_LENGTH = 20;` và `export interface GradeQuizOptions { promptType?: string }`.
  2. Export `sanitizeAnswerSetKeys<T extends { answerSet?: string | null }>(questions: readonly T[]): T[]`:
     - Thu thập tập các khóa ngắn đã trim (`len >= 1 && len <= ANSWER_SET_MAX_LENGTH`) để tránh đụng tên.
     - Duyệt `questions`: nếu `raw = q.answerSet?.trim()` rỗng thì giữ nguyên object; nếu `raw.length <= ANSWER_SET_MAX_LENGTH` thì giữ `raw`; nếu `raw.length > ANSWER_SET_MAX_LENGTH` thì ánh xạ nhất quán qua `Map<string, string>` sang `s${seq}` chưa nằm trong tập khóa hiện có. Trả mảng mới nếu có ít nhất 1 phần tử thay đổi (không tạo key `answerSet` mới cho câu không có `answerSet`).
  3. Viết các helper nội bộ và export `canClusterImplicitMcqMany`:
     - `hasValidImplicitMcqManyOpts(opts: readonly string[] | null | undefined): opts is readonly string[]`: trả `Array.isArray(opts) && opts.filter((o) => o.trim().length > 0).length >= 2` (khớp `packages/api/src/library-contracts.ts:619`).
     - `areMcqManyOptionsEqual(a: readonly string[], b: readonly string[]): boolean`: kiểm `a.length === b.length && a.every((item, i) => item.trim() === (b[i] ?? "").trim())`.
     - `parseImplicitSlotStem(stem: string)`: khớp hậu tố `/\s*\((?:lựa chọn|choice)\s*(\d+)\s*\/\s*(\d+)\)\s*$/i` trên `stem.trim()`; nếu khớp trả `{ base, slot: Number(m[1]), total: Number(m[2]) }` (khi `slot >= 1 && total >= 2 && slot <= total`), ngược lại `{ base: stem.trim(), slot: null, total: null }`.
     - Export `canClusterImplicitMcqMany(prev: { stem: string; opts?: readonly string[] | null }, curr: { stem: string; opts?: readonly string[] | null }): boolean`:
       - Kiểm `hasValidImplicitMcqManyOpts(prev.opts) && hasValidImplicitMcqManyOpts(curr.opts)`.
       - Kiểm `areMcqManyOptionsEqual(prev.opts, curr.opts)`.
       - So khớp stem đã phân tích từ `parseImplicitSlotStem`: nếu cả 2 không có slot → `p.base === c.base`; nếu cả 2 có slot → `p.base === c.base && p.total === c.total && c.slot > p.slot`; ngược lại `false`.
  4. Export `resolveAnswerSetGroups(questions: readonly AssignmentQuestion[], options?: GradeQuizOptions)` trả về `{ positional: AnswerSetMember[]; unorderedGroups: AnswerSetMember[][] }` (trong đó `AnswerSetMember = { index: number; question: AssignmentQuestion }`):
     - Helper nội bộ `effectiveQuestionType(question, options) = question.type?.trim() || options?.promptType?.trim() || ""`.
     - Duyệt `questions` theo thứ tự `index` tăng dần:
       - **Explicit:** nếu `question.answerSet?.trim()` khác rỗng → đóng chuỗi implicit đang mở, thêm vào `explicitSets.get(key)`.
       - **Implicit `mcq_many`:** nếu `effectiveQuestionType(question, options) === "mcq_many"` và `hasValidImplicitMcqManyOpts(question.opts)`:
         - Nếu đang có chuỗi implicit mở ở phần tử liền trước (`last.index === index - 1`) và `canClusterImplicitMcqMany(last.question, question)` → push vào chuỗi đó.
         - Ngược lại → đóng chuỗi implicit cũ và mở chuỗi implicit mới `[member]`.
       - **Positional:** đóng chuỗi implicit đang mở, thêm vào `positional`.
     - Khi đóng chuỗi implicit: nếu `cluster.length >= 2` → push vào `unorderedGroups`; nếu `cluster.length === 1` → push phần tử duy nhất về `positional`.
     - Với mỗi bucket của `explicitSets`: nếu `bucket.length >= 2` → push vào `unorderedGroups`; nếu `bucket.length === 1` → push về `positional` (kết quả chấm tương đương 100%, đồng thời `unorderedGroups` luôn bảo đảm mọi phần tử đều có `length >= 2`).
     - Không trộn explicit và implicit chung một `Map<string, ...>`.
  5. Cập nhật `gradeQuiz(questions, answers, options?: GradeQuizOptions): QuizGrade` gọi `resolveAnswerSetGroups(questions, options)`, chấm `positional` và gọi `gradeAnswerSet` cho từng nhóm trong `unorderedGroups`.
  6. Export `resolveSummaryAnswerKeys(questions: readonly AssignmentQuestion[], options?: GradeQuizOptions): string[]`:
     - Khởi tạo mảng kết quả `questions.map((q) => q.answer)`.
     - Với mỗi group trong `unorderedGroups` (`group.length >= 2`):
       - Trích `rawKeys = group.map((m) => m.question.answer.trim()).filter((k) => k.length > 0)`.
       - Nếu `rawKeys.length === 0`, giữ nguyên `question.answer`.
       - Xác định `isRomanHeadingsGroup = group.every((m) => effectiveQuestionType(m.question, options) === "headings")`.
       - Nếu `rawKeys.every((k) => /^[A-Z]$/.test(k))` HOẶC (`!isRomanHeadingsGroup && rawKeys.every((k) => /^[A-Z]$/i.test(k))`): chuẩn hóa `.toUpperCase()`, khử trùng lặp qua `Set`, sort ASCII (`a < b ? -1 : a > b ? 1 : 0`), join `", "`.
       - Ngược lại (text tự do / số La Mã): giữ thứ tự xuất hiện, khử trùng theo `normalize(k)`, join `", "`.
       - Gán chuỗi đã format cho mọi `m.index` trong group.
     - *(Quy ước: Summary chỉ hiển thị tập canonical key đã khử trùng, nhất quán với `AttemptCompactList` hiện hành; `alts` chi tiết hiển thị ở màn Detail.)*
- **Success criteria:** Toàn bộ test mới ở Task 1.1 và mọi test cũ trong `@teacher-os/api` và `apps/server/src/lib/grade-quiz.test.ts` pass 100%.
- **Verify:** `pnpm --filter @teacher-os/api exec vitest run src/lib/grade-quiz.test.ts && pnpm --filter server exec vitest run src/lib/grade-quiz.test.ts` exits 0 and reports all tests passed.

### Task 1.3 — Kiểm tra regression toàn gói `@teacher-os/api`

- **Goal:** Bảo đảm không có hồi quy contract/type hay test nào khác trong `@teacher-os/api`.
- **Target files and symbols:** `packages/api` (test suite + typecheck)
- **Steps:**
  1. Chạy toàn bộ test suite và typecheck của `@teacher-os/api`.
- **Success criteria:** Toàn bộ test và TypeScript trong `@teacher-os/api` xanh.
- **Verify:** `pnpm --filter @teacher-os/api test && pnpm --filter @teacher-os/api check-types` exits 0.

## Verification

- `pnpm --filter @teacher-os/api test`
- `pnpm --filter server exec vitest run src/lib/grade-quiz.test.ts`
- `pnpm --filter @teacher-os/api check-types`

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
