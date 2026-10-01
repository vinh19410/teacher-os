---
phase: 1
title: "Intro splitter + buildQuizParts theo cụm instruction"
status: completed
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Intro splitter + buildQuizParts theo cụm instruction

## Goal
Hàm thuần `splitQuizIntro` tách `intro` (HTML hoặc plain legacy) thành preamble + các section mở đầu bằng marker `Questions X–Y`. `buildQuizParts` dùng kết quả đó để tạo mỗi section thành một part đúng số câu, kèm `instructionHtml`.

## Bối cảnh (đọc trước khi làm)
- `packages/api/src/lib/quiz-parts.ts:29`: `buildQuizParts(questions, promptType)` hiện chỉ gom cụm theo `question.type ?? promptType`.
- Đề cũ hoặc đề không khai type từng câu chỉ có 1 cụm. Giáo viên dán cả 3 khối "Questions 1–4 …", "Questions 5–8 · Flow-chart completion — … Write ONE WORD ONLY …", "Questions 9–13 …" vào `intro`. Blob này đang render một lần ở đầu trang (`packages/ui/src/components/quiz/quiz-paper.tsx:164`), tức là đang bị gom cục.
- Câu "Write ONE WORD ONLY" là text giáo viên tự viết, khác với map chuẩn (`QUIZ_TYPE_DISPLAY.flowchart` ghi "Choose ONE WORD ONLY", ở `packages/api/src/contracts.ts:517`). Khi có text riêng thì dùng text của giáo viên. KHÔNG sửa map chuẩn.
- `packages/api` không có script test. Test của `quiz-parts` đang nằm ở `apps/student/test/quiz-parts.test.ts`, vitest chạy với `environment: "node"` nên không có `DOMParser`. Vì vậy splitter KHÔNG được dùng `htmlToPlainText`, vì hàm đó đi hai nhánh DOM/regex khác nhau. Thay vào đó tự strip tag và decode entity bằng một helper nội bộ, để browser và node cho cùng một kết quả.
- Item render theo type TỪNG CÂU. `QuizQuestionItem` nhận `type={question.type ?? typeId}` (`quiz-paper.tsx:217`), còn `choiceRowsByQ` key theo câu (`:93`). Vì vậy part theo section chỉ cần `typeId` của câu đầu cho fallback header, không phải tách sub-part.

## Files to Create / Modify
- Create: `packages/api/src/lib/quiz-intro-sections.ts`
- Modify: `packages/api/src/lib/quiz-parts.ts` (interface `QuizPart`, function `buildQuizParts`)
- Create: `apps/student/test/quiz-intro-sections.test.ts`
- Modify: `apps/student/test/quiz-parts.test.ts`

## Contract cần implement

```ts
// packages/api/src/lib/quiz-intro-sections.ts
export interface QuizIntroSection {
	/** Số câu hiển thị 1-based theo assignment (đã trừ offset). */
	start: number;
	end: number;
	/** Phần instruction của giáo viên, đã bỏ marker; "" = chỉ có marker. */
	html: string;
}
export interface QuizIntroSplit {
	/** Nội dung trước marker đầu tiên ("" nếu không có). */
	preamble: string;
	sections: QuizIntroSection[];
}
/** null = không tách được → caller giữ hành vi cũ (intro blob + cụm theo type). */
export function splitQuizIntro(
	intro: string,
	questionCount: number,
): QuizIntroSplit | null;
```

```ts
// packages/api/src/lib/quiz-parts.ts — thêm field optional vào QuizPart
/** Instruction riêng của giáo viên cho cụm (tách từ intro). undefined = cụm theo type → header dùng QUIZ_TYPE_DISPLAY. */
instructionHtml?: string;

export function buildQuizParts(
	questions: readonly StudentQuizQuestion[],
	promptType: string,
	intro = "",
): QuizPart[];
```

## Thuật toán `splitQuizIntro` (thực hiện đúng thứ tự)
1. Nếu `questionCount <= 0` hoặc `intro.trim() === ""` thì `return null`.
2. Tách block:
   - Plain legacy (không khớp `/<\/?[a-z][^>]*>/i`): mỗi dòng (`split("\n")`) là một block, khi ghép lại dùng `"\n"`.
   - HTML: quét tuần tự các phần tử top-level bằng bộ đếm độ sâu của TÊN THẺ mở đầu, để `<ul>` lồng `<ul>` không bị cắt sai. Text rời nằm giữa các phần tử cũng thành một block. Khi ghép lại dùng `""`.
   - Với block `<p>…</p>` có `<br>`: tách tại `<br>` nếu đoạn phía sau bắt đầu bằng marker. Mỗi đoạn được bọc lại thành `<p>…</p>`.
3. `leadingText(block)`: bỏ mọi tag, decode `&nbsp;`→space, `&ndash;`/`&#8211;`→`–`, `&mdash;`/`&#8212;`→`—`, `&amp;`→`&`, rồi `trimStart()`.
4. Marker chỉ được nhận khi nằm ĐẦU block: `MARKER_RE = /^(?:questions?|câu)\s+(\d{1,3})(?:\s*(?:[-–—]|to|and)\s*(\d{1,3}))?(?!\d)/i`. Các câu như "Answer questions 1–4 …" hay "There are 13 questions" KHÔNG phải marker.
5. Gom block: các block đứng trước marker đầu tiên thuộc preamble. Mỗi marker mở một section `[a, b ?? a]`, chứa các block cho tới marker kế tiếp.
6. Hợp lệ hoá. Chỉ cần vi phạm MỘT điều kiện là `return null`:
   - Không có marker nào.
   - Có `a > b`.
   - Các range không tăng dần chặt: `next.a <= prev.b` (tức chồng nhau hoặc trùng).
   - Đặt `offset = sections[0].a - 1` (ví dụ đề part 2 ghi "Questions 14–20" thì học viên thấy câu 1–7). Sau khi trừ offset mà `last.end > questionCount`.
7. Bỏ marker khỏi block đầu của mỗi section. Xoá tiền tố marker, giữ lại các tag mở/đóng xung quanh, và xoá luôn 1 dấu phân cách theo sau (`·`, `:`, `.`, `-`, `–`, `—`, `&middot;`, `&ndash;`, `&mdash;`). Nếu sau đó `leadingText` của block rỗng thì bỏ block. `section.html` là các block còn lại được ghép lại, rồi trim.
8. Trả về `{ preamble, sections }` với `start`/`end` đã trừ offset.

## Thuật toán `buildQuizParts` mới
1. Tách phần gom cụm theo type hiện tại thành helper nội bộ `clusterByType(questions, fromQ, toQ, promptType)` (q nằm trong `[fromQ, toQ)`).
2. Tính `split = splitQuizIntro(intro, questions.length)`. Nếu `null` thì trả về `clusterByType(questions, 0, questions.length, promptType)`. Kết quả phải giống hệt hiện tại.
3. Nếu có split: duyệt q từ 0. Câu nằm trong section thì thành 1 part `{ typeId: questions[start-1].type ?? promptType, instructionHtml: section.html }`. Khoảng trống giữa hoặc sau các section thì gom bằng `clusterByType` (không có `instructionHtml`).
4. Đánh `id` = `part-${index+1}` theo thứ tự cuối cùng. `qStart` và label `Questions X–Y` dùng lại logic sẵn có. `q`/`number` không đổi, vì đáp án và grading key theo `q`.

## Tasks

### Task 1.1: Viết test cho splitter trước (red)
- Goal: có file test pin toàn bộ edge case.
- Target files: `apps/student/test/quiz-intro-sections.test.ts`. Import `splitQuizIntro` từ `@teacher-os/api/lib/quiz-intro-sections`.
- Steps: viết đủ các case `it(...)` sau, mỗi case assert kết quả cụ thể:
  1. HTML đúng ví dụ của user: `<p>Questions 1–4</p><p>Do the following statements agree…</p><p>Questions 5–8 · Flow-chart completion — Complete the flow-chart below. Write ONE WORD ONLY from the passage for each answer.</p><p>Questions 9–13</p><p>Complete the notes below.</p>` với `questionCount=13` → 3 sections `[1,4]`,`[5,8]`,`[9,13]`. Section 2 có html chứa `Flow-chart completion — Complete the flow-chart below. Write ONE WORD ONLY` và KHÔNG chứa `Questions 5–8`.
  2. Preamble: `<p>Read the passage.</p><p>Questions 1–2</p><p>x</p>` → `preamble` chứa `Read the passage.`.
  3. Biến thể range: `Questions 1-4`, `Questions 1 — 4`, `QUESTIONS 1 to 4`, `Questions 1&ndash;4`, `Questions&nbsp;1–4`, `Question 5` (số ít, range `[5,5]`), `Câu 1–4`. Mỗi biến thể được nhận đúng range.
  4. Marker `<strong>`: `<p><strong>Questions 1–2</strong> · Choose TRUE</p>` → html còn `Choose TRUE`, không còn `Questions 1–2`.
  5. `<br>` trong một `<p>`: `<p>Questions 1–2<br>Write TRUE<br>Questions 3–4<br>Write ONE WORD</p>` với `questionCount=4` → 2 sections.
  6. Plain legacy: `"Questions 1–2\nWrite TRUE\nQuestions 3–4\nWrite ONE WORD"` → 2 sections, html section 1 = `Write TRUE`.
  7. Marker giữa câu: `<p>Answer questions 1–4 using the passage.</p>` → `null`.
  8. Offset: `Questions 14–16` + `Questions 17–20` với `questionCount=7` → `[1,3]`,`[4,7]`.
  9. Vượt biên: `Questions 1–4` + `Questions 5–14` với `questionCount=13` → `null`.
  10. Chồng nhau / trùng / đảo ngược: `1–4` + `3–6` → `null`. `1–4` + `1–4` → `null`. `4–1` → `null`.
  11. Section chỉ có marker: `<p>Questions 1–2</p><p>Questions 3–4</p><p>x</p>` → section 1 `html === ""`.
  12. Intro rỗng / `<p></p>` / `questionCount=0` → `null`.
  13. List lồng: `<p>Questions 1–2</p><ul><li>a<ul><li>b</li></ul></li></ul><p>Questions 3–4</p>` → section 1 html chứa trọn `<ul><li>a<ul><li>b</li></ul></li></ul>`.
- Success criteria: file tồn tại, đủ 13 case.
- Verify: `pnpm --filter student test -- quiz-intro-sections` exits NON-ZERO vì module chưa tồn tại (`Failed to resolve` / `Cannot find`). Đây là trạng thái red mong đợi, KHÔNG phải lỗi. Nếu exit 0 thì đó là lỗi.

### Task 1.2: Implement `splitQuizIntro`
- Goal: toàn bộ test Task 1.1 xanh.
- Target files: `packages/api/src/lib/quiz-intro-sections.ts`
- Steps: implement đúng "Thuật toán `splitQuizIntro`" ở trên. Không import DOM global. Mỗi bước chính có một comment tiếng Việt ngắn, theo style của `quiz-parts.ts`.
- Success criteria: 13 case pass.
- Verify: `pnpm --filter student test -- quiz-intro-sections` exits 0 và output có `13 passed` (hoặc đúng số case đã viết, không có `failed`).

### Task 1.3: Test `buildQuizParts` với intro (red)
- Goal: pin cách tích hợp vào parts.
- Target files: `apps/student/test/quiz-parts.test.ts` (thêm `describe` mới, giữ nguyên các test cũ).
- Steps: thêm các case:
  1. 13 câu KHÔNG khai type, `promptType="note"`, intro 3 marker như case 1.1 → 3 parts, labels `Questions 1–4`/`Questions 5–8`/`Questions 9–13`, `parts[1].instructionHtml` chứa `Write ONE WORD ONLY`, `q` liên tục `0..12`.
  2. Intro chỉ phủ `1–4` trên 6 câu (q 4–5 type `tfng`, còn lại không type, `promptType="note"`) → part 1 có `instructionHtml`, part 2 (`Questions 5–6`, `typeId: "tfng"`) có `instructionHtml === undefined`.
  3. Intro không hợp lệ (vượt biên) → kết quả `toEqual(buildQuizParts(questions, promptType))` (y hệt khi không có intro).
  4. Gọi không có tham số intro → hành vi cũ (các test cũ vẫn pass là đủ).
- Verify: `pnpm --filter student test -- quiz-parts` exits NON-ZERO, chỉ có các case mới fail (red mong đợi).

### Task 1.4: Implement `buildQuizParts(questions, promptType, intro = "")`
- Target files: `packages/api/src/lib/quiz-parts.ts` (`QuizPart`, `buildQuizParts`, helper `clusterByType`).
- Steps: làm theo "Thuật toán `buildQuizParts` mới". Cập nhật JSDoc của `QuizPart` để nói rõ part có thể đến từ section của intro.
- Success criteria: test cũ + mới đều xanh. Chữ ký vẫn tương thích với 3 caller hiện tại, vì `intro` là tham số optional.
- Verify: `pnpm --filter student test -- quiz-parts quiz-intro-sections` exits 0, không có `failed`. Sau đó `pnpm check-types` exits 0.

## Verification (cuối phase)
- `pnpm --filter student test` exits 0.
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
