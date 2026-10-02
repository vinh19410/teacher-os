---
phase: 2
title: "UI làm bài Writing: textarea, đếm từ, autosave, guard"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: UI làm bài Writing: textarea, đếm từ, autosave, guard

## Goal
Học viên mở đề Writing thấy đề bài kèm một textarea để viết. Bài được autosave giống các dạng khác. Footer sticky hiện số từ so với mục tiêu Task 1/Task 2. Nộp bài trống hoặc thiếu từ thì có guard dialog.

## Bối cảnh
- `packages/ui/src/components/quiz/quiz-paper.tsx`: empty-state ở cuối (`questions.length === 0`), prompt Writing render qua `RichTextBody`.
- `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx`: các phần loader `serverAnswers`, `useQuizAttemptStore({ send })`, `unansweredCount`, gate card "N câu hỏi", `QuizNavigator`, `QuizSubmitGuardDialog`.
- `apps/student/src/lib/quiz-attempt-store.ts`: `setAnswer` clamp theo `QUIZ_ANSWER_VALUE_MAX` (khoảng `:371`).
- `apps/student/src/lib/repos/quiz.ts`: `patchQuizAnswer` (khoảng `:104`) là khuôn mẫu.
- `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx`: `QuizSubmitGuardDialog` (khoảng `:149`).
- `QuizNavigator` footer: `sticky bottom-0 z-20 border-line border-t bg-bg/95 backdrop-blur`, bên trong là `mx-auto w-full max-w-[720px] px-4 py-3`.

## Files to Create / Modify
- Create: `packages/ui/src/components/quiz/quiz-essay-input.tsx`
- Create: `packages/ui/src/components/quiz/quiz-essay-footer.tsx`
- Modify: `packages/ui/src/components/quiz/quiz-paper.tsx`
- Modify: `apps/student/src/lib/quiz-attempt-store.ts`
- Modify: `apps/student/src/lib/repos/quiz.ts`
- Modify: `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx`
- Modify: `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx`
- Modify: `apps/student/test/quiz-attempt-store.test.ts`, `apps/student/test/quiz-paper.test.tsx`

## Tasks & Steps

### 2.1 Store: option `valueMax`
- [ ] `QuizAttemptStoreOptions` thêm `valueMax?: number` (mặc định `QUIZ_ANSWER_VALUE_MAX`). `setAnswer` clamp theo `valueMax`. Cập nhật comment F2.
- [ ] Hook `useQuizAttemptStore` chuyển option xuống store.
- [ ] Test: `"valueMax tuỳ biến cho phép value dài hơn 500 và vẫn clamp ở ngưỡng mới"`.

### 2.2 Repo
- [ ] `patchQuizEssay(attemptId, text, opts?)` gọi PATCH `/api/student/attempts/:id/essay` với body `{ text }` và có `keepalive`, theo khuôn `patchQuizAnswer`.

### 2.3 `QuizEssayInput` (packages/ui)
- [ ] Props: `value`, `onChange(value)`, `readOnly?`, `maxLength`.
- [ ] Render `<label>` "Bài viết của bạn" (dùng `sr-only` hoặc label nhỏ mono theo style eyebrow `font-mono text-[11px] uppercase`) và `<textarea>` với `id`, `spellCheck={false}`, `autoCorrect="off"`, `autoCapitalize="off"`, `maxLength`, `min-h-[420px] w-full resize-y rounded-md border border-line bg-bg p-4 text-[15px] leading-[1.7]`, focus ring theo token có sẵn của textarea trong repo. Placeholder: "Viết bài của bạn ở đây…".
- [ ] Review/readOnly: `readOnly` + `aria-readonly`, giữ nguyên nội dung và xuống dòng.

### 2.4 `QuizPaper`
- [ ] Khi `skill === "writing"`: render `QuizEssayInput` ngay dưới prompt, `value = answers[0] ?? ""`, `onChange = (v) => onAnswer(0, v)`, `readOnly = reviewMode`, `maxLength = QUIZ_ESSAY_MAX`.
- [ ] Ẩn empty-state "không có câu hỏi tự chấm" khi skill là `writing`. Speaking giữ nguyên.
- [ ] Test `quiz-paper.test.tsx`: Writing render textarea với label "Bài viết của bạn" và không có empty-state. Gõ thì `onAnswer(0, value)`. `mode="review"` thì textarea readonly. Reading không có textarea.

### 2.5 `QuizEssayFooter` (packages/ui)
- [ ] Props: `text`, `minWords: number | null`.
- [ ] Dùng cùng khung sticky với `QuizNavigator`. Nội dung `aria-live="polite"`: "**N** từ", cộng thêm " · tối thiểu {min}" khi có `minWords`. Khi `0 < N < min` hoặc `N === 0` (có min) thì phần số dùng màu cảnh báo `text-warn` (token `--color-warn` trong `packages/ui/src/styles/globals.css:151`). Đạt mức thì dùng màu `text-fg`.
- [ ] Thêm `data-testid="essay-word-count"` để e2e đọc.

### 2.6 Route take `$assignmentId.tsx`
- [ ] `const isWriting = detail?.skill === "writing"`.
- [ ] Loader: với Writing, `serverAnswers = attempt?.essay ? { "0": attempt.essay } : {}`; các skill khác giữ nguyên. Resume dialog tự hoạt động vì nó dựa vào `serverHasAnswers`.
- [ ] Store: `send = isWriting ? (_q, v, o) => patchQuizEssay(id, v, o) : patchQuizAnswer…`, `valueMax = isWriting ? QUIZ_ESSAY_MAX : undefined`.
- [ ] Đếm từ: `const essayText = answers[0] ?? ""`, `const wordCount = countWords(essayText)`, `const minWords = WRITING_MIN_WORDS[detail.part] ?? null`.
- [ ] Guard: với Writing, mở dialog khi `essayText.trim() === ""` hoặc `minWords !== null && wordCount < minWords`; các skill khác giữ logic `unansweredCount`.
- [ ] Gate card trước khi start: Writing hiện "Bài viết · tối thiểu {min} từ · Band X" (không có min thì "Bài viết · Band X") thay cho "0 câu hỏi".
- [ ] Footer: Writing render `QuizEssayFooter` thay cho `QuizNavigator`.

### 2.7 Guard dialog copy
- [ ] `QuizSubmitGuardDialog` nhận thêm prop tuỳ chọn `title?`/`description?`. Mặc định giữ copy cũ.
- [ ] Route truyền copy cho Writing:
  - Bài trống: title "Bạn chưa viết bài", description "Bài viết đang trống. Bạn có muốn nộp bài không? Sau khi nộp, bạn không thể sửa bài viết."
  - Thiếu từ: title "Bài viết chưa đủ số từ", description "Bài viết có {N}/{min} từ. Bài thi IELTS thiếu từ sẽ bị trừ điểm. Bạn có muốn nộp bài không?…"

## Verification
- `pnpm --filter student test`: xanh (store, quiz-paper, các test cũ).
- `pnpm --filter web test`: xanh (web cũng import `QuizPaper`).
- `pnpm check` + `pnpm check-types`: xanh.
- Thủ công: chạy dev stack, mở một đề Writing bằng tài khoản học viên seed, gõ khoảng 20 từ. Header phải chuyển "Đang lưu…" rồi "Đã lưu", footer cập nhật số từ ngay. Reload thì có resume dialog, bấm tiếp tục thì bài còn nguyên.

## Risks
- `QuizPaper` được dùng ở cả teacher preview. Simulation chỉ dựng cho đề auto-graded, nhưng vẫn phải chạy `pnpm --filter web test` để chắc chắn không có hồi quy.
