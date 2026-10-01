---
phase: 2
title: "QuizPaper render instruction theo cụm + nối 3 caller"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: QuizPaper render instruction theo cụm + nối 3 caller

## Goal
Mỗi cụm có instruction của giáo viên sẽ hiển thị header `Questions X–Y` cộng instruction đó NGAY TRÊN danh sách câu X..Y. Đầu trang chỉ còn preamble. Áp dụng cho take, review và teacher simulation.

## Bối cảnh
- `packages/ui/src/components/quiz/quiz-paper.tsx:164`–`166` đang render nguyên `detail.intro` một lần.
- `:190`–`228` render các part. Header hiện dùng `quizTypeDisplay(part.typeId)`, còn `aria-label` = `${part.label} · ${display.label}` (`:198`). E2E #286 assert theo aria-label này cho cụm theo type, nên KHÔNG đổi aria-label của cụm theo type.
- Các caller của `buildQuizParts`:
  - Take: `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx:139`
  - Review: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx:77`
  - Teacher simulation: `apps/web/src/components/assignments/preview-quiz-simulation.tsx:40`
- Navigator (`packages/ui/src/components/quiz/quiz-navigator.tsx:71`) đã có tab theo `part.label`. Không cần sửa, tab sẽ tự hiện `Questions 1–4`/`5–8`/`9–13`.
- Trong node test, `RichTextBody` render HTML dưới dạng text escape (không có `document`). Vì vậy assert bằng `toContain` trên đoạn text, KHÔNG assert tag.

## Files to Create / Modify
- Modify: `packages/ui/src/components/quiz/quiz-paper.tsx`
- Modify: `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx`
- Modify: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx`
- Modify: `apps/web/src/components/assignments/preview-quiz-simulation.tsx`
- Modify test: `apps/student/test/quiz-paper.test.tsx`

## Tasks

### Task 2.1: Test QuizPaper với intro chia cụm (red)
- Target files: `apps/student/test/quiz-paper.test.tsx`. Thêm `describe("QuizPaper — instruction giáo viên theo từng cụm")`, dùng helper `paperFields` sẵn có ở `:13`.
- Steps: dựng 6 câu không khai type, `type: "note"`, `intro: "<p>Read carefully.</p><p>Questions 1–2</p><p>Write TRUE or FALSE.</p><p>Questions 3–6 · Flow-chart completion — Write ONE WORD ONLY from the passage for each answer.</p>"`, `parts={buildQuizParts(questions, "note", intro)}`. Viết các assert:
  1. `html` chứa `aria-label="Questions 1–2"` và `aria-label="Questions 3–6"` (không có hậu tố ` · `).
  2. `html.indexOf("Write TRUE or FALSE.")` nhỏ hơn `html.indexOf('data-question="0"')`. `html.indexOf("Write ONE WORD ONLY")` lớn hơn `html.indexOf('data-question="1"')` và nhỏ hơn `html.indexOf('data-question="2"')`.
  3. Text `Questions 1–2` xuất hiện đúng 1 lần (header h2, không lặp lại trong instruction).
  4. `Read carefully.` xuất hiện đúng 1 lần và đứng trước `Questions 1–2`.
  5. Intro không có marker (`<p>Ghi chú riêng của giáo viên.</p>`) → hành vi cũ: chứa đủ intro một lần và header chuẩn `Note completion`. Test cũ ở `:242` đã pin điều này, chỉ cần vẫn xanh.
  6. Section chỉ có marker (`<p>Questions 1–2</p><p>Questions 3–6</p><p>x</p>`) → cụm 1 fallback `Note completion` + instruction chuẩn của map.
- Verify: `pnpm --filter student test -- quiz-paper` exits NON-ZERO, chỉ case mới fail (red mong đợi).

### Task 2.2: Render header theo section trong QuizPaper
- Target files: `packages/ui/src/components/quiz/quiz-paper.tsx` (function `QuizPaper`).
- Steps:
  1. Import `splitQuizIntro` từ `@teacher-os/api/lib/quiz-intro-sections`.
  2. Sau khi tính `questions` (`:81`), thêm: `const introSplit = parts.some((part) => part.instructionHtml !== undefined) ? splitQuizIntro(detail.intro, questions.length) : null;`. Comment rõ lý do: chỉ cắt intro khi parts thật sự được dựng từ intro, nên caller nào quên truyền intro vẫn thấy nguyên blob và không mất nội dung.
  3. Thay khối `:164`–`166`: nếu `introSplit` thì render `introSplit.preamble` (chỉ khi `!isEmptyRichText`). Ngược lại giữ nguyên render `detail.intro`.
  4. Trong `parts.map`: `const fromIntro = part.instructionHtml !== undefined; const hasOwn = fromIntro && !isEmptyRichText(part.instructionHtml ?? "");`. `aria-label` = `fromIntro ? part.label : \`${part.label} · ${display.label}\``. Trong header: giữ `h2 {part.label}`. Nếu `hasOwn` thì render `<RichTextBody text={part.instructionHtml} className="text-muted-fg text-sm" />` thay cho 2 dòng label + instruction chuẩn. Ngược lại giữ nguyên 2 dòng hiện tại.
- Success criteria: test Task 2.1 và toàn bộ test cũ của file đều xanh.
- Verify: `pnpm --filter student test -- quiz-paper` exits 0, không có `failed`.

### Task 2.3: Truyền intro ở 3 caller
- Target files và thay đổi:
  - `$assignmentId.tsx:139`: `buildQuizParts(detail?.questions ?? [], detail?.type ?? "", detail?.intro ?? "")`, thêm `detail?.intro` vào deps của `useMemo`.
  - `$attemptId.detail.tsx:77`: `buildQuizParts(attempt.questions, quizQuery.data?.type ?? "", quizQuery.data?.intro ?? "")`, thêm `quizQuery.data?.intro` vào deps.
  - `preview-quiz-simulation.tsx:40`: `buildQuizParts(sim.takeQuestions, sim.detail.type, sim.detail.intro)`.
- Success criteria: 3 caller đều truyền intro. Không caller nào còn gọi với 2 tham số (kiểm tra bằng lệnh Verify).
- Verify: `grep -rn "buildQuizParts(" apps/student/src apps/web/src` in ra đúng 3 dòng, mỗi dòng có `intro`. Sau đó `pnpm check-types` exits 0.

### Task 2.4: Gate unit toàn app
- Verify: `pnpm --filter student test` exits 0. `pnpm --filter web test` exits 0. `pnpm check` exits 0 và `git status --short` không có file ngoài danh sách của phase 1–2 (biome chỉ format).

## Non-goals của phase
- `apps/web/src/components/assignments/student-preview-paper.tsx` (aside xem trước lúc soạn) giữ nguyên, đúng Non-Goal của #286. Chỉ tab simulation dùng `QuizPaper` mới được hưởng.

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
