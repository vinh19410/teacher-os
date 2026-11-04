---
phase: 1
title: "Phase 1: Shared Grid Guards, Web Composer & State Round-Trip (TDD)"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Shared Grid Guards, Web Composer & State Round-Trip (TDD)

## Goal

Bật ô `Giải thích câu {n}` trong `PromptComposer` của `apps/web`, sửa lỗi bắt nhầm phím tắt trong `AnswerKeyGrid` và lỗi `PATCH` 400 ở `TestBuilderShell`, đồng thời khóa toàn bộ đường giữ dữ liệu/kiểm tra hợp lệ của `explanation` ở `packages/ui` và `apps/web` theo quy trình TDD (Red → Green).

## Files to Create / Modify

- Modify: `packages/ui/src/components/assignments/editor/answer-key-grid.test.tsx`
- Modify: `packages/ui/src/components/assignments/editor/answer-key-grid.tsx`
- Modify: `packages/ui/src/components/assignments/editor/cloze-editor.tsx`
- Modify: `packages/ui/src/components/assignments/editor/question-key-editor.test.tsx`
- Modify: `packages/ui/src/components/web-kit/rich-text-editor.tsx`
- Modify: `packages/ui/src/components/quiz/quiz-review-item.tsx`
- Modify: `apps/student/test/quiz-review-item.test.tsx`
- Modify: `apps/web/src/components/assignments/prompt-composer.test.tsx`
- Modify: `apps/web/src/components/assignments/prompt-composer.tsx`
- Modify: `apps/web/src/lib/rich-text-legacy.test.ts`
- Modify: `apps/web/src/lib/rich-text-legacy.ts`
- Modify: `apps/web/src/lib/repos/assignment-tests.test.ts`
- Modify: `apps/web/src/lib/repos/assignment-tests.ts`
- Modify: `apps/web/src/components/assignment-tests/test-builder-shell.test.tsx`
- Modify: `apps/web/src/components/assignment-tests/test-builder-shell.tsx`
- Modify: `apps/web/src/components/assignments/composer-transitions.test.ts`
- Modify: `apps/web/src/components/assignments/composer-transitions.ts`
- Modify: `apps/web/src/lib/assignment-draft-store.test.ts`
- Modify: `apps/web/src/lib/assignment-draft-store.ts`
- Modify: `apps/web/src/lib/assignment-test-draft-store.test.ts`
- Modify: `apps/web/src/lib/assignment-test-draft-store.ts`
- Modify: `apps/web/src/routes/_auth/assignments/new.tsx`
- Modify: `apps/web/src/lib/assignment-quiz-sim.test.ts`
- Modify: `apps/web/src/lib/assignment-quiz-sim.ts`
- Modify: `apps/web/src/components/assignments/preview-quiz-simulation.test.tsx`
- Modify: `apps/web/src/components/assignments/preview-quiz-simulation.tsx`

## Tasks & Steps

### Task 1.1 — Viết Red tests cho `packages/ui` (`AnswerKeyGrid`, `ClozeEditor.hasItemContent`, `quizReviewExplanation`)
<!-- Updated: Red Team RT-1, RT-3, RT-5, RT-7 -->
- Goal: Khóa bằng test đỏ các lỗi ở tầng `packages/ui`: (1) gõ phím tắt đáp án (`t/f/n`, `a–h`, `1–8`) trong `.ProseMirror` hoặc nhấn `Enter` từ portal không được đổi đáp án hay thêm câu; (2) `Backspace` không xóa hàng chỉ có `explanation`; (3) vượt trần 2000 plain / 5000 raw vừa trả `errors.explanation` vừa thực sự render `role="alert"` ra DOM hàng câu; (4) `hasItemContent` coi hàng có `explanation` là có nội dung; (5) `quizReviewExplanation` coi `"<p></p>"` là rỗng để fallback về `note`.
- Target files:
  - `packages/ui/src/components/assignments/editor/answer-key-grid.test.tsx`
  - `packages/ui/src/components/assignments/editor/question-key-editor.test.tsx`
  - `apps/student/test/quiz-review-item.test.tsx`
- Steps:
  1. Giữ nguyên tuyệt đối test hiện hữu `không truyền showExplanation → không có ô giải thích` ở `answer-key-grid.test.tsx:651-653`.
  2. Trong `answer-key-grid.test.tsx`, thêm `describe("AnswerKeyGrid — bảo vệ bàn phím và trần explanation (#571)", ...)`:
     - Render `<AnswerKeyGrid showExplanation showErrors items={[{ stem: "S1", answer: "FALSE", opts: null, alts: "", explanation: `<p>${"a".repeat(2001)}</p>` }]} ... />` → HTML output chứa `role="alert"` và chuỗi `"Giải thích vượt quá 2000 ký tự."`; tương tự raw HTML > 5000 ký tự (vd `<p>${"<span>a</span>".repeat(400)}</p>`) hiện `"Giải thích vượt quá 5000 ký tự tính cả định dạng."`; 2000 ký tự plain không báo lỗi.
     - Render tương tác `<AnswerKeyGrid typeId="tfng" showExplanation items={[{ stem: "S1", answer: "FALSE", opts: null, alts: "" }]} onItemsChange={spy} onAddQuestion={addSpy} ... />`: tìm phần tử `[contenteditable="true"]` trong hàng câu 1, bắn `fireEvent.keyDown(editorEl, { key: "n" })` và `fireEvent.keyDown(editorEl, { key: "t" })` → `spy` KHÔNG được gọi (đáp án giữ nguyên `"FALSE"`). Bắn `fireEvent.keyDown` `Enter` với `defaultPrevented` (mô phỏng input link popover đã `preventDefault`) → `addSpy` KHÔNG được gọi.
     - Render 2 hàng trong đó hàng 2 chỉ có `explanation: "<p>Vì đoạn 2</p>"` (stem/answer/alts trống), bắn `fireEvent.keyDown(fieldsetHang2, { key: "Backspace" })` → `spy` KHÔNG được gọi để xóa hàng.
  3. Trong `question-key-editor.test.tsx`: import `hasItemContent` từ `./cloze-editor` và test `hasItemContent({ stem: "", opts: null, answer: "", alts: "", explanation: "<p>Có giải thích</p>" }) === true`, còn `"<p></p>"` trả `false`.
  4. Trong `apps/student/test/quiz-review-item.test.tsx`: thêm test `quizReviewExplanation(reviewInfo({ explanation: "<p>   </p>", note: "Ghi chú chung" })) === "Ghi chú chung"` và `quizReviewExplanation(reviewInfo({ explanation: "<p><br></p>", note: "" })) === null`.
- Success criteria: Các file test biên dịch và fail đúng ở các assertion mới của `#571`.
- Verify: `pnpm --filter @teacher-os/ui test -- answer-key-grid.test.tsx question-key-editor.test.tsx` exits non-zero với assertion failure; nếu exit 0 ngay là sai.

### Task 1.2 — Hiện thực Green cho `packages/ui` và chạy hồi quy `ui` + `admin` + `student`
<!-- Updated: Red Team RT-1, RT-3, RT-5, RT-7 -->
- Goal: Sửa `AnswerKeyGrid`, `RichTextEditor`, `ClozeEditor` và `quizReviewExplanation` để toàn bộ test ở Task 1.1 chuyển sang xanh mà không hồi quy `admin` hay `student`.
- Target files:
  - `packages/ui/src/components/assignments/editor/answer-key-grid.tsx`
  - `packages/ui/src/components/web-kit/rich-text-editor.tsx`
  - `packages/ui/src/components/assignments/editor/cloze-editor.tsx`
  - `packages/ui/src/components/quiz/quiz-review-item.tsx`
- Steps:
  1. Trong `packages/ui/src/components/assignments/editor/answer-key-grid.tsx`:
     - Dòng 3: import `collapseWhitespace, htmlToPlainText, isEmptyRichText` từ `@teacher-os/api/rich-text`.
     - Ngay dưới `QUESTION_OPTION_MAX`: export `export const QUESTION_EXPLANATION_MAX = 2000;` và `export const QUESTION_EXPLANATION_RAW_MAX = 5000;`.
     - Trong `questionRowError`: nếu `typeof item.explanation === "string"`:
       - Nếu `collapseWhitespace(htmlToPlainText(item.explanation)).length > QUESTION_EXPLANATION_MAX` → `errors.explanation = \`Giải thích vượt quá ${QUESTION_EXPLANATION_MAX} ký tự.\`;`
       - Ngược lại nếu `item.explanation.trim().length > QUESTION_EXPLANATION_RAW_MAX` → `errors.explanation = \`Giải thích vượt quá ${QUESTION_EXPLANATION_RAW_MAX} ký tự tính cả định dạng.\`;`
     - Trong `rowIsEmpty`: thêm `if (item.explanation && !isEmptyRichText(item.explanation)) return false;` trước kiểm tra `item.opts`.
     - Trong `handleKeyDown` (`:330-355`):
       - Tính `const editingRichText = Boolean(target.isContentEditable || target.closest?.('[contenteditable="true"]'));` và `const outsideFieldset = !event.currentTarget.contains(target);` (chặn event từ React portal như Link Popover).
       - Nếu `outsideFieldset || event.defaultPrevented`, `return;` ngay đầu hàm.
       - Ở dòng `:351`, đổi thành `if (typing || editingRichText || event.metaKey || event.ctrlKey || event.altKey) return;` để mọi phím gõ trong `.ProseMirror` không bao giờ lọt xuống nhánh phím tắt đáp án.
     - Tại `errorEntries` (`:400`): đổi tuple thành `(["stem", "answer", "opts", "pin", "alts", "explanation"] as const)` để lỗi `explanation` vừa hiển thị trong `<div role="alert">` của hàng câu vừa kích hoạt `forceOpen` khi `collapsible`.
  2. Trong `packages/ui/src/components/web-kit/rich-text-editor.tsx:371-376`: thêm `e.stopPropagation();` ngay cạnh `e.preventDefault();` khi nhấn `Enter` trong `<input>` địa chỉ liên kết.
  3. Trong `packages/ui/src/components/assignments/editor/cloze-editor.tsx:37-40`: import `isEmptyRichText` từ `@teacher-os/api/rich-text` và thêm `if (item.explanation && !isEmptyRichText(item.explanation)) return true;` vào `hasItemContent`.
  4. Trong `packages/ui/src/components/quiz/quiz-review-item.tsx:28-35`: import `isEmptyRichText` từ `@teacher-os/api/rich-text`; trong `quizReviewExplanation`, coi `info.explanation` chỉ có hiệu lực khi `info.explanation && !isEmptyRichText(info.explanation)` (trả `info.explanation.trim()`), ngược lại fallback sang `note` (cũng kiểm `!isEmptyRichText(info.note)`), và đồng bộ điều kiện `data-source` ở dòng `:116` dùng cùng phép kiểm `!isEmptyRichText(info.explanation ?? "")`.
- Success criteria: Toàn bộ unit test của `@teacher-os/ui`, `admin` và `student` đều pass.
- Verify: `pnpm --filter @teacher-os/ui test && pnpm --filter admin test && pnpm --filter student test` exits 0.

### Task 1.3 — Viết Red tests cho `PromptComposer`, `TestBuilderShell`, `composerFromPrompt`, `rich-text-legacy`, transitions, draft stores và preview simulation (`apps/web`)
<!-- Updated: Red Team RT-2, RT-5, RT-6, RT-7, RT-11 -->
- Goal: Tạo đầy đủ test đỏ khóa mọi yêu cầu ở tầng `apps/web` trước khi sửa code sản phẩm.
- Target files:
  - `apps/web/src/components/assignments/prompt-composer.test.tsx`
  - `apps/web/src/lib/rich-text-legacy.test.ts`
  - `apps/web/src/lib/repos/assignment-tests.test.ts`
  - `apps/web/src/components/assignment-tests/test-builder-shell.test.tsx`
  - `apps/web/src/components/assignments/composer-transitions.test.ts`
  - `apps/web/src/lib/assignment-draft-store.test.ts`
  - `apps/web/src/lib/assignment-test-draft-store.test.ts`
  - `apps/web/src/lib/assignment-quiz-sim.test.ts`
  - `apps/web/src/components/assignments/preview-quiz-simulation.test.tsx`
- Steps:
  1. Trong `prompt-composer.test.tsx`: thêm test xác nhận `PromptComposer` render nhãn `"Giải thích câu 1"` cho cả `reading` và `grammar` (hoặc `listening`), và KHÔNG render `"Giải thích câu"` khi `skill === "writing"`.
  2. Trong `rich-text-legacy.test.ts`: thêm test cho `looksLikeHtml` / `normalizeLegacyRichText` với chuỗi plain text có cặp dấu nhọn không phải thẻ HTML hợp lệ như `"Ta có a<b và c>d\nSuy ra B"` → được escape thành `"Ta có a&lt;b và c&gt;d<br>Suy ra B"` thay vì nhận nhầm là HTML, và thêm test cho helper `normalizeDraftItems` (chuẩn hóa `explanation` có chữ, xóa key `explanation` khi rỗng hoặc `"<p></p>"`).
  3. Trong `assignment-tests.test.ts`: thêm test cho `composerFromPrompt`:
     - Giữ `explanation` HTML (`"<p>Đoạn 2 nêu rõ</p>"`).
     - Chuẩn hóa `explanation` plain text có xuống dòng từ AI Exam Import (`"Dòng 1\nDòng 2"`) thành `"Dòng 1<br>Dòng 2"`.
     - Câu không có `explanation` hoặc `explanation` rỗng (`"   "` / `"<p></p>"`) KHÔNG sinh key `explanation` trên item kết quả (`"explanation" in value.items[i]` là `false`).
  4. Trong `test-builder-shell.test.tsx`: thêm test mở `"Chỉnh sửa"` trên slot đã gán đề có `explanation`, sửa nội dung rồi bấm `"Cập nhật đề"` → request `PATCH /api/assignments/prompts/:id` có body KHÔNG chứa key `"skill"` hay `"part"` (đạt chuẩn `assignmentPromptUpdateSchema.safeParse(body).success === true`) và giữ đúng `questions[0].explanation`.
  5. Trong `composer-transitions.test.ts`:
     - `hasAuthoringContent`: composer chỉ có `items[0].explanation = "<p>Gợi ý</p>"` trả `true`; `"<p></p>"` trả `false`.
     - `clozeStemIssue` / `clozeRowIssue`: câu có `explanation` vượt 2000 ký tự plain trả `"Giải thích câu 1 vượt quá 2000 ký tự."`, vượt 5000 ký tự raw trả `"Giải thích câu 1 vượt quá 5000 ký tự tính cả định dạng."`.
  6. Trong `assignment-draft-store.test.ts` và `assignment-test-draft-store.test.ts`:
     - `composerDraftHasContent` / `testDraftHasContent`: chỉ gõ `explanation: "<p>Vì vậy</p>"` trả `true`; `"<p></p>"` trả `false`.
     - `readAssignmentDraft` / `readAssignmentTestDraft`: giữ nguyên `explanation` string hợp lệ khi round-trip, và từ chối cả `explanation: 123` lẫn `explanation: null` (trả `null`).
  7. Trong `assignment-quiz-sim.test.ts` và `preview-quiz-simulation.test.tsx`:
     - `buildQuizSim`: hỗ trợ cả `grammar` và `vocabulary` (khớp `isAutoSkill`); `fullQuestions[0].explanation` giữ nguyên `"<p>Giải thích riêng câu 1</p>"`, bỏ qua `"<p></p>"`, trong khi `JSON.stringify(sim.takeQuestions)` KHÔNG chứa chuỗi giải thích đó.
     - `PreviewQuizSimulation`: sau khi nộp bài (`grade` có giá trị), câu có `explanation` render `data-testid="quiz-review-explanation"` với `data-source="question"` và nội dung giải thích của câu đó.
- Success criteria: Chạy vitest trên tập file trên thoát khác 0 đúng tại các test mới của `#571`.
- Verify: `pnpm --filter web test -- prompt-composer.test.tsx rich-text-legacy.test.ts assignment-tests.test.ts test-builder-shell.test.tsx composer-transitions.test.ts assignment-draft-store.test.ts assignment-test-draft-store.test.ts assignment-quiz-sim.test.ts preview-quiz-simulation.test.tsx` exits non-zero với assertion failures; nếu exit 0 ngay là sai.

### Task 1.4 — Hiện thực Green cho `apps/web` và kiểm tra toàn bộ unit/type gates
<!-- Updated: Red Team RT-2, RT-5, RT-6, RT-7, RT-11 -->
- Goal: Hiện thực đầy đủ thay đổi tại `apps/web` để toàn bộ test ở Task 1.3 cùng typecheck toàn workspace chuyển sang xanh.
- Target files:
  - `apps/web/src/components/assignments/prompt-composer.tsx`
  - `apps/web/src/lib/rich-text-legacy.ts`
  - `apps/web/src/lib/repos/assignment-tests.ts`
  - `apps/web/src/components/assignment-tests/test-builder-shell.tsx`
  - `apps/web/src/components/assignments/composer-transitions.ts`
  - `apps/web/src/lib/assignment-draft-store.ts`
  - `apps/web/src/lib/assignment-test-draft-store.ts`
  - `apps/web/src/routes/_auth/assignments/new.tsx`
  - `apps/web/src/lib/assignment-quiz-sim.ts`
  - `apps/web/src/components/assignments/preview-quiz-simulation.tsx`
- Steps:
  1. Trong `apps/web/src/components/assignments/prompt-composer.tsx:246-263`: thêm prop `showExplanation` vào `<QuestionKeyEditor ... showExplanation />`.
  2. Trong `apps/web/src/lib/rich-text-legacy.ts`:
     - Trong `looksLikeHtml(text)`: giữ kiểm tra nhanh `if (!HTML_TAG_RE.test(text)) return false;`; nếu `typeof DOMParser !== "undefined"`, parse bằng `new DOMParser().parseFromString(text, "text/html")` và trả `doc.body.children.length > 0 || /<(br|img|hr)\b/i.test(text)` (đồng bộ chính xác với `packages/ui/src/components/assignments/rich-text-body.tsx:31-36`).
     - Export thêm `normalizeDraftItems(items: QuestionItem[]): QuestionItem[]` dùng `isEmptyRichText` từ `@teacher-os/api/rich-text`: với mỗi item, nếu `typeof item.explanation === "string" && !isEmptyRichText(item.explanation)` thì trả `{ ...rest, explanation: normalizeLegacyRichText(item.explanation) }`, ngược lại xóa key `explanation` khỏi bản sao item.
  3. Trong `apps/web/src/lib/repos/assignment-tests.ts:114-124`:
     - Import `isEmptyRichText` từ `@teacher-os/api/rich-text`.
     - Trong `composerFromPrompt`, giữ `explanation: normalizeLegacyRichText(question.explanation)` chỉ khi `typeof question.explanation === "string" && !isEmptyRichText(question.explanation)`, và giữ phòng thủ `answerSet: question.answerSet` khi `typeof question.answerSet === "string" && question.answerSet.trim().length > 0`.
  4. Trong `apps/web/src/routes/_auth/assignments/new.tsx` và `apps/web/src/components/assignment-tests/test-builder-shell.tsx`:
     - Ở `new.tsx`: bọc `restored.items` và `bannerDraft.value.items` qua `normalizeDraftItems(...)`.
     - Ở `test-builder-shell.tsx`: chuẩn hóa `slotDrafts` từ `bannerDraft.slotDrafts` ngay trong `useState` khởi tạo (cũng như trong `openComposeNew`); trong `composerSaveAllowed` (`:833-835`) dùng `isAutoSkill(value.skill)` cho nhánh câu hỏi không phải `reading` để phủ cả `grammar`/`vocabulary`; trong `handleComposerSave` (`:394-401`), khi `composer.promptId` tồn tại, tách `const { skill: _skill, part: _part, ...updatePayload } = payload;` trước khi gọi `submit.run({ type: "update-assignment-prompt", promptId: composer.promptId, payload: updatePayload })`.
  5. Trong `apps/web/src/components/assignments/composer-transitions.ts`:
     - Import `collapseWhitespace, htmlToPlainText` từ `@teacher-os/api/rich-text` và `QUESTION_EXPLANATION_MAX, QUESTION_EXPLANATION_RAW_MAX` từ `./answer-key-grid`.
     - Trong `hasAuthoringContent`: thêm `|| Boolean(item.explanation && !isEmptyRichText(item.explanation))` vào `value.items.some(...)`.
     - Trong `clozeRowIssue`: kiểm tra `typeof item.explanation === "string"` với `QUESTION_EXPLANATION_MAX` và `QUESTION_EXPLANATION_RAW_MAX` như Task 1.3 bước 5.
  6. Trong `apps/web/src/lib/assignment-draft-store.ts` và `apps/web/src/lib/assignment-test-draft-store.ts`:
     - Trong `composerValueShape`: thêm kiểm tra chặt `(item.explanation === undefined || typeof item.explanation === "string")` (từ chối cả `null`).
     - Trong `composerDraftHasContent` của cả 2 file: đồng bộ kiểm tra `alts.trim()`, `opts`, `pin != null`, và `Boolean(item.explanation && !isEmptyRichText(item.explanation))`.
  7. Trong `apps/web/src/lib/assignment-quiz-sim.ts`:
     - Đổi điều kiện skill ở dòng `:63` sang `if (!isAutoSkill(skillId)) return null;` (import `isAutoSkill` từ `@/components/assignments/assignment-presets`).
     - Trong `normalizeQuestion`, thêm `...(typeof item.explanation === "string" && !isEmptyRichText(item.explanation) ? { explanation: item.explanation } : {})` (`takeQuestions` giữ nguyên whitelist `{ stem, opts, type, pin }`).
  8. Trong `apps/web/src/components/assignments/preview-quiz-simulation.tsx`: trong `perQuestion` ở nhánh `if (grade)`, thêm `...(question.explanation ? { explanation: question.explanation } : {})`.
- Success criteria: Toàn bộ test unit/component của `apps/web`, `@teacher-os/ui`, `apps/admin`, `apps/student` và `pnpm check-types` đều xanh.
- Verify: `pnpm --filter web test && pnpm --filter @teacher-os/ui test && pnpm --filter admin test && pnpm --filter student test && pnpm check-types` exits 0.

## Verification

- `pnpm --filter @teacher-os/ui test` exits 0
- `pnpm --filter web test` exits 0
- `pnpm --filter admin test` exits 0
- `pnpm --filter student test` exits 0
- `pnpm check-types` exits 0

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
