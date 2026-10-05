---
phase: 2
title: "UI làm bài Writing: textarea, đếm từ, autosave, guard"
status: done
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
- Verify-only (RT Contract Verifier caller #7): `apps/student/test/quiz-review-item.test.tsx` — consumer test của `QuizPaper` mode review, fixtures reading-only nên không vỡ; chạy trong `pnpm --filter student test`.

## Tasks & Steps

### 2.1 Store: option `valueMax`
- [x] `QuizAttemptStoreOptions` thêm `valueMax?: number` (mặc định `QUIZ_ANSWER_VALUE_MAX`). `setAnswer` clamp theo `valueMax`. Cập nhật comment F2.
- [x] RT K: hook `useQuizAttemptStore` đang hardcode đúng 5 option khi gọi `createQuizAttemptStore` (`:440-446`) — thêm `valueMax` vào interface `UseQuizAttemptStoreOptions` VÀ forward trong body hook. Ghi chú: store tạo lại theo deps `[attemptId]` và đọc options qua ref tại thời điểm tạo, nên `valueMax`/`send` coi như bất biến theo attempt (đúng vì 1 attempt gắn 1 assignment/1 skill).
- [x] RT J: thêm test store-level cho đường resume từ mirror (chưa flush): tạo store với `serverAnswers {"0": "old"}` + mirror `{"0": "newer"}` → assert `getAnswer(0) === "newer"` và pending có key 0 (khoá hành vi `reconcile` cho key 0 mà essay đang dùng).
- [x] Test: `"valueMax tuỳ biến cho phép value dài hơn 500 và vẫn clamp ở ngưỡng mới"`.

### 2.2 Repo
- [x] `patchQuizEssay(attemptId, text, opts?)` gọi PATCH `/api/student/attempts/:id/essay` với body `{ text }` và có `keepalive`, theo khuôn `patchQuizAnswer`.

### 2.3 `QuizEssayInput` (packages/ui)
- [x] Props: `value`, `onChange(value)`, `readOnly?`, `maxLength`.
- [x] RT N: trong `onChange`, strip C0 control chars (giữ `\n`, `\t`, `\r`) trước khi phát `onChange` — chặn lớp lỗi "paste ký tự điều khiển làm body vượt 48KB → 413 deterministic → drain throw → không nộp được". Sau sanitize, worst-case body ≤ 10.000 ký tự × 4 byte = 40KB < `QUIZ_ESSAY_BODY_MAX`.
- [x] Render `<label>` "Bài viết của bạn" (dùng `sr-only` hoặc label nhỏ mono theo style eyebrow `font-mono text-[11px] uppercase`) và `<textarea>` với `id`, `spellCheck={false}`, `autoCorrect="off"`, `autoCapitalize="off"`, `maxLength`, `min-h-[420px] w-full resize-y rounded-md border border-line bg-bg p-4 text-[15px] leading-[1.7]`, focus ring theo token có sẵn của textarea trong repo. Placeholder: "Viết bài của bạn ở đây…".
- [x] Review/readOnly: `readOnly` + `aria-readonly`, giữ nguyên nội dung và xuống dòng.

### 2.4 `QuizPaper`
- [x] Khi `skill === "writing" && questions.length === 0` (RT H — fail-safe: nếu đề Writing bất thường mang questions thì rơi về empty-state thay vì render cả essay lẫn widget câu 0 cùng bind `answers[0]`): render `QuizEssayInput` ngay dưới prompt, `value = answers[0] ?? ""`, `onChange = (v) => onAnswer(0, v)`, `readOnly = reviewMode`, `maxLength = QUIZ_ESSAY_MAX`.
- [x] Ẩn empty-state "không có câu hỏi tự chấm" khi skill là `writing` (kèm điều kiện questions rỗng ở dòng trên). Speaking giữ nguyên.
- [x] Test `quiz-paper.test.tsx`: Writing render textarea với label "Bài viết của bạn" và không có empty-state. Gõ thì `onAnswer(0, value)`. `mode="review"` thì textarea readonly. Reading không có textarea. RT H: thêm test "writing prompt có questions (dữ liệu vi phạm invariant) không render essay input".

### 2.5 `QuizEssayFooter` (packages/ui)
- [x] Props: `text`, `minWords: number | null`.
- [x] Dùng cùng khung sticky với `QuizNavigator`. Nội dung: "**N** từ", cộng thêm " · tối thiểu {min}" khi có `minWords`. Khi `0 < N < min` hoặc `N === 0` (có min) thì phần số dùng màu cảnh báo `text-warn` (token `--color-warn` trong `packages/ui/src/styles/globals.css:151`). Đạt mức thì dùng màu `text-fg`.
- [x] RT C: giữ `data-testid="navigator-progress"` trên footer (cùng contract e2e với `QuizNavigator`) — helper `openPaper` trong spec chờ testid này sau khi start; kèm `data-testid="essay-word-count"` để e2e đọc số từ.
- [x] RT F: KHÔNG bọc số từ mỗi keystroke trong `aria-live` (SR sẽ bị spam hàng trăm thông báo cho một bài 250+ từ). Thêm một vùng `sr-only` với `role="status"` riêng, nội dung chỉ đổi tại mốc: đạt mục tiêu tối thiểu ("Đã đạt tối thiểu {min} từ"), tụt lại dưới mục tiêu, hoặc mỗi 50 từ. Text hiển thị cập nhật trực tiếp không announce.

### 2.6 Route take `$assignmentId.tsx`
- [x] `const isWriting = detail?.skill === "writing"`.
- [x] RT K: chỉ tạo/kích hoạt store khi `detail` đã load (isWriting xác định) — không tạo store trong cửa sổ detail chưa load, kẻo store giữ `send = patchQuizAnswer` + clamp 500 cho đề Writing (mỗi keystroke cắt còn 500 ký tự, PATCH vào `/answer` nhận 400, header "Lỗi lưu", không nộp được).
- [x] Loader: với Writing, `serverAnswers = attempt?.essay ? { "0": attempt.essay } : {}`; các skill khác giữ nguyên. Resume dialog tự hoạt động vì nó dựa vào `serverHasAnswers`.
- [x] Store: `send = isWriting ? (_q, v, o) => patchQuizEssay(id, v, o) : patchQuizAnswer…`, `valueMax = isWriting ? QUIZ_ESSAY_MAX : undefined`.
- [x] RT G: sau flush lúc unmount (store `dispose()`), invalidate query detail `["student", "quiz", id]` để lần vào lại bằng SPA nav trong cửa sổ staleTime 60s loader thấy `attempt.essay` mới từ server và hiện resume dialog, thay vì textarea trống trên cache cũ (điểm yếu có sẵn của pattern answer thường, essay khuếch đại vì bài dài).
- [x] Đếm từ: `const essayText = answers[0] ?? ""`, `const wordCount = countWords(essayText)`, `const minWords = WRITING_MIN_WORDS[detail.part] ?? null`.
- [x] Guard: với Writing, mở dialog khi `essayText.trim() === ""` hoặc `minWords !== null && wordCount < minWords`; các skill khác giữ logic `unansweredCount`.
- [x] Gate card trước khi start: Writing hiện "Bài viết · tối thiểu {min} từ · Band X" (không có min thì "Bài viết · Band X") thay cho "0 câu hỏi".
- [x] Footer: Writing render `QuizEssayFooter` thay cho `QuizNavigator`.

### 2.7 Guard dialog copy
- [x] `QuizSubmitGuardDialog` nhận thêm prop tuỳ chọn `title?`/`description?`. Mặc định giữ copy cũ.
- [x] Route truyền copy cho Writing:
  - Bài trống: title "Bạn chưa viết bài", description "Bài viết đang trống. Bạn có muốn nộp bài không? Sau khi nộp, bạn không thể sửa bài viết."
  - Thiếu từ: title "Bài viết chưa đủ số từ", description "Bài viết có {N}/{min} từ. Bài thi IELTS thiếu từ sẽ bị trừ điểm. Bạn có muốn nộp bài không?…"

## Verification
- `pnpm --filter student test`: xanh (store, quiz-paper, các test cũ).
- `pnpm --filter web test`: xanh (web cũng import `QuizPaper`).
- `pnpm check` + `pnpm check-types`: xanh.
- Thủ công: chạy dev stack, mở một đề Writing bằng tài khoản học viên seed, gõ khoảng 20 từ. Header phải chuyển "Đang lưu…" rồi "Đã lưu", footer cập nhật số từ ngay. Reload thì có resume dialog, bấm tiếp tục thì bài còn nguyên.

## Risks
- `QuizPaper` được dùng ở cả teacher preview. Simulation chỉ dựng cho đề auto-graded, nhưng vẫn phải chạy `pnpm --filter web test` để chắc chắn không có hồi quy.
