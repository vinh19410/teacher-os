---
phase: 3
title: "Phase 3: UI Review Clarity, Web Simulation & Verification Gates"
status: done
priority: P1
effort: "50m"
dependencies: [1, 2]
---

# Phase 3: UI Review Clarity, Web Simulation & Verification Gates

<!-- Updated: Red-Team 2026-11-25 - Findings #3, #4, #6, #7, #8, #10 applied -->

## Goal

Đồng bộ hoàn toàn phía UI (`QuizPaper`, `QuizReviewItem`, `AttemptCompactList`) và Teacher Preview Simulation (`assignment-quiz-sim.ts`, `use-quiz-simulation.ts`, `PreviewQuizSimulation`) với ngữ nghĩa chấm tập hợp không thứ tự (cho cả `mcq_many` lẫn các câu non-`mcq_many` có `answerSet >= 2` như `sysex-first-step-gt2-b32`), bảo đảm responsive sạch trên 375px / 768px / 1440px, và vượt 100% local quality gates.

## Files to Create / Modify

- Modify: `packages/ui/src/components/quiz/quiz-paper.tsx`
- Modify: `packages/ui/src/components/quiz/quiz-review-item.tsx`
- Modify: `packages/ui/src/components/quiz/attempt-compact-list.tsx`
- Modify: `apps/web/src/lib/assignment-quiz-sim.ts`
- Modify: `apps/web/src/lib/use-quiz-simulation.ts`
- Modify: `apps/web/src/components/assignments/preview-quiz-simulation.tsx`
- Modify: `packages/ui/src/components/quiz/quiz-paper.test.tsx`
- Modify: `apps/student/test/attempt-summary.test.tsx`
- Modify: `apps/web/src/lib/assignment-quiz-sim.test.ts`
- Modify: `apps/web/src/components/assignments/preview-quiz-simulation.test.tsx`

## TDD Structure

- **Tests Before:** Task 3.1 cập nhật/thêm failing tests cho: `assignment-quiz-sim.test.ts` (forward & sanitize `answerSet <= 20` trên `takeQuestions`), `preview-quiz-simulation.test.tsx` (Bikes Choose THREE nộp `{A, C, D}` → `2/3` với `AttemptCompactList` hiện `"C, D, F"` trên cả 3 dòng, VÀ 2 cụm `mcq_many` liên tiếp cùng `(stem, opts)` khác `answerSet` tách đúng thành 2 thẻ `"Chọn 2 đáp án"` — chứng minh RC3 không phải phantom coverage), `quiz-paper.test.tsx` (case-insensitive `QuizMcqManyCard` + `(không tính thứ tự)`, dùng chung `canClusterImplicitMcqMany` hỗ trợ hậu tố `(lựa chọn i/K)` & chặn `opts` `< 2` lựa chọn không rỗng, và `QuizReviewItem` cho tập non-`mcq_many` `answerSet` như `sysex-first-step-gt2-b32` hiển thị `"C, E, G, K (không tính thứ tự)"`), và `attempt-summary.test.tsx` (`AttemptCompactList` hiển thị `"C, D, F"` và wrap an toàn `break-words` không dùng `shrink-0 sm:max-w-none`).
- **Refactor:** Tasks 3.2 & 3.3 cập nhật `@teacher-os/ui` và `apps/web`.
- **Tests After:** Task 3.4 chạy toàn bộ local verification gates (`biome check`, `check-types`, vitest across workspaces).
- **Regression Gate:** `pnpm exec biome check . && pnpm check-types && pnpm --filter @teacher-os/api test && pnpm --filter @teacher-os/ui test && pnpm --filter server test && pnpm --filter web test && pnpm --filter student test`

## Tasks & Steps

### Task 3.1 — Viết/cập nhật failing UI & simulation tests (Red)

- **Goal:** Ghim chặt hành vi mong đợi trên cả 4 file test trước khi sửa code UI & simulation.
- **Target files and symbols:**
  - `apps/web/src/lib/assignment-quiz-sim.test.ts` (dòng 311-341)
  - `apps/web/src/components/assignments/preview-quiz-simulation.test.tsx`
  - `packages/ui/src/components/quiz/quiz-paper.test.tsx` (dòng 168-230 và dòng 2635-2900)
  - `apps/student/test/attempt-summary.test.tsx` (describe block `AttemptCompactList`)
- **Steps:**
  1. Trong `apps/web/src/lib/assignment-quiz-sim.test.ts:340`, cập nhật assertion từ `expect("answerSet" in (sim?.takeQuestions[0] ?? {})).toBe(false)` sang kiểm tra `sim?.takeQuestions[0]?.answerSet === "pair-1"` và `sim?.takeQuestions[1]?.answerSet === "pair-1"`; thêm assertion rằng câu thường không có `answerSet` không thêm key mới vào `takeQuestions`, và `answerSet` dài `> 20` ký tự được sanitize `<= 20` ký tự đồng nhất giữa `takeQuestions` và `fullQuestions`.
  2. Trong `apps/web/src/components/assignments/preview-quiz-simulation.test.tsx`, thêm 2 test:
     - **Bikes Choose THREE (có & thiếu `answerSet`):** Chọn checkbox `A, C, D` (với key `C, D, F`), bấm Nộp bài → xác minh `attempt-correct-count` là `2`, và cả 3 dòng trong `attempt-compact-list` đều hiển thị `Đáp án: C, D, F` (tuyệt đối không xuất hiện `Đáp án: D` đơn lẻ cạnh `C` đúng).
     - **Hai cụm `mcq_many` liên tiếp cùng `(stem, opts)` khác `answerSet` (`"s1"` vs `"s2"`):** Mở tab Làm thử → xác minh render đúng **2** badge `"Chọn 2 đáp án"` (không gộp thành `"Chọn 4 đáp án"`), chọn 2 đáp án ở cụm 1 + 2 đáp án ở cụm 2 và nộp → chấm tách biệt từng cụm.
  3. Trong `packages/ui/src/components/quiz/quiz-paper.test.tsx`, thêm các test:
     - `QuizMcqManyCard` review với answer/key viết thường (`answer: "c"`, `key: "f"`) vẫn highlight đúng checkbox `C` (`Đúng`) và `F` (`Đáp án đúng`) và in `C, D, F` kèm `(không tính thứ tự)`.
     - Bikes Q8–10 review với `{A, C, D}` vs key `{C, D, F}` (verdict `[wrong, correct, correct]`) highlight đúng `A` = `Bạn chọn`, `C`/`D` = `Đúng`, `F` = `Đáp án đúng`, footer có `C, D, F` và `(không tính thứ tự)`.
     - Fallback không `answerSet` gom đúng cụm có hậu tố `(lựa chọn 1/3..3/3)` (như `sysex-first-step-gt2-b59`) và khoảng trắng đầu/cuối, nhưng KHÔNG gom 2 câu `mcq_many` có `opts: ["", ""]` hoặc `opts: ["Only one", "   "]` (`< 2` lựa chọn không rỗng).
     - Non-`mcq_many` `answerSet` review (`type: "sent4"`, `opts: null`, `answerSet: "q1-4"`, keys `C, E, G, K`, học viên nhập `K, G, E, C` đúng `4/4`): `QuizReviewItem` hiển thị `C, E, G, K` kèm `(không tính thứ tự)`, không in `Đáp án: C` đơn lẻ mâu thuẫn cạnh câu trả lời `K`.
  4. Trong `apps/student/test/attempt-summary.test.tsx`, thêm test `AttemptCompactList` render tập đáp án `"C, D, F"` và tập text dài, xác minh hiển thị đầy đủ chuỗi `Đáp án: C, D, F`, dùng `break-words` bảo vệ wrap trên mobile/tablet và không dùng `shrink-0` hay `truncate` cắt mất đáp án.
- **Success criteria:** Cả 4 file test đều thất bại đúng ở các test mới trong pha Red.
- **Verify:** Chạy độc lập từng lệnh (không nối `&&` để xác minh cả 3 workspace đều Red):
  - `pnpm --filter @teacher-os/ui exec vitest run src/components/quiz/quiz-paper.test.tsx` exits non-zero on the new `QuizPaper` tests.
  - `pnpm --filter web exec vitest run src/lib/assignment-quiz-sim.test.ts src/components/assignments/preview-quiz-simulation.test.tsx` exits non-zero on the updated/new simulation tests.
  - `pnpm --filter student exec vitest run test/attempt-summary.test.tsx` exits non-zero on the new `AttemptCompactList` test.

### Task 3.2 — Cập nhật `QuizPaper`, `QuizReviewItem`, và `AttemptCompactList` trong `@teacher-os/ui` (RC1 + RC5)

- **Goal:** Đồng bộ 100% quy tắc gom cụm `QuizPaper` với `grade-quiz.ts` qua `canClusterImplicitMcqMany`, chuẩn hóa `.trim().toUpperCase()` + chú thích `(không tính thứ tự)` cho cả `QuizMcqManyCard` lẫn `QuizReviewItem` thuộc tập `answerSet >= 2`, và sửa responsive wrap của `AttemptCompactList`.
- **Target files and symbols:**
  - `packages/ui/src/components/quiz/quiz-paper.tsx` (`canClusterMcqMany` dòng 134-147, `QuizMcqManyCard` dòng 210-224 & 439-448, truyền `answerSetKey` cho `QuizQuestionItem` tại dòng 1070-1081)
  - `packages/ui/src/components/quiz/quiz-review-item.tsx` (`QuizReviewInfo` dòng 11-25, `QuizReviewItem` dòng 80-106)
  - `packages/ui/src/components/quiz/attempt-compact-list.tsx` (`AttemptCompactList` dòng 24-51)
- **Steps:**
  1. Trong `packages/ui/src/components/quiz/quiz-paper.tsx`:
     - Import `canClusterImplicitMcqMany` và `resolveSummaryAnswerKeys` từ `@teacher-os/api/lib/grade-quiz`.
     - Cập nhật `canClusterMcqMany(prev, curr)`: nếu `prevSet || currSet` giữ `Boolean(prevSet && currSet && prevSet === currSet)`; ngược lại trả về `canClusterImplicitMcqMany(prev, curr)` (khớp 100% với `gradeQuiz`).
     - Trong `QuizMcqManyCard`:
       - Chuẩn hóa `rawSelected` bằng `.trim().toUpperCase()`.
       - Chuẩn hóa `keyLetters` bằng `.trim().toUpperCase()`.
       - Tại footer `Đáp án:` (dòng 439-448), giữ `Đáp án: <span ...>C, D, F</span>` và bổ sung nhãn nhỏ ` (không tính thứ tự)` khi `questions.length >= 2`.
       - Không sửa `QuizReviewChip` toàn cục.
     - Ở `QuizPaper` khi `reviewMode && review`, dựng map UI-only `reviewByQWithSetKey` cho các câu non-`mcq_many` thuộc cùng một `answerSet` có `>= 2` câu (gọi `resolveSummaryAnswerKeys` trên danh sách `questions` kèm `answer: review[q.q]?.key ?? ""` và `type`, rồi gắn `answerSetKey` vào `QuizReviewInfo` của câu đó khi `summaryKey !== info.key` hoặc thuộc tập `>= 2`). Truyền `reviewByQWithSetKey.get(unit.question.q) ?? review?.[unit.question.q]` cho `QuizQuestionItem` (dòng 1079) và `QuizInlineInstruction` (dòng 1048).
  2. Trong `packages/ui/src/components/quiz/quiz-review-item.tsx`:
     - Thêm trường UI-only optional `answerSetKey?: string` vào `QuizReviewInfo`.
     - Trong `QuizReviewItem` (dòng 92-105), nếu `info.answerSetKey` tồn tại và không rỗng, hiển thị `{info.answerSetKey}` cùng nhãn nhỏ ` (không tính thứ tự)` ở dòng `Đáp án:` thay cho single `info.key` vị trí (vẫn giữ `alts` nếu có).
  3. Trong `packages/ui/src/components/quiz/attempt-compact-list.tsx:27-50`:
     - Thay class của `<span>Đáp án: {item.key}</span>` từ `shrink-0 font-mono text-[13px] text-verdict-correct` thành `min-w-0 max-w-[55%] break-words text-right font-mono text-[13px] text-verdict-correct sm:max-w-[50%]` để hiển thị trọn vẹn cả đáp án học viên lẫn đáp án tập hợp ở 375px, 768px, và 1440px mà không cắt cụt hay bóp mất cột bên trái.
- **Success criteria:** Toàn bộ test của `@teacher-os/ui` và `apps/student/test/attempt-summary.test.tsx` pass.
- **Verify:** `pnpm --filter @teacher-os/ui exec vitest run src/components/quiz/quiz-paper.test.tsx && pnpm --filter student exec vitest run test/attempt-summary.test.tsx` exits 0.

### Task 3.3 — Cập nhật Teacher Preview Simulation trong `apps/web` (RC3 + RC5)

- **Goal:** Sanitize & forward `answerSet` sang `takeQuestions`, truyền `{ promptType }` vào `gradeQuiz`, và hiển thị set key trên `AttemptCompactList` của `PreviewQuizSimulation`.
- **Target files and symbols:**
  - `apps/web/src/lib/assignment-quiz-sim.ts` (`buildQuizSim`, dòng 77-92)
  - `apps/web/src/lib/use-quiz-simulation.ts` (`useQuizSimulation`, dòng 43-48)
  - `apps/web/src/components/assignments/preview-quiz-simulation.tsx` (`PreviewQuizSimulation`, dòng 64-89)
- **Steps:**
  1. Trong `apps/web/src/lib/assignment-quiz-sim.ts`:
     - Import `sanitizeAnswerSetKeys` từ `@teacher-os/api/lib/grade-quiz`.
     - Bọc `fullQuestions` qua `sanitizeAnswerSetKeys(...)` để đảm bảo mọi `answerSet` trong simulation luôn `<= 20` ký tự và đồng nhất giữa `fullQuestions` và `takeQuestions`.
     - Trong `takeQuestions` (dòng 84-91), bổ sung `...(question.answerSet ? { answerSet: question.answerSet } : {})`.
  2. Trong `apps/web/src/lib/use-quiz-simulation.ts:46`, gọi `gradeQuiz(sim.fullQuestions, Object.fromEntries(Object.entries(answers)), { promptType: sim.detail.type })`.
  3. Trong `apps/web/src/components/assignments/preview-quiz-simulation.tsx`:
     - Import `resolveSummaryAnswerKeys` từ `@teacher-os/api/lib/grade-quiz`.
     - Tính `const summaryKeys = resolveSummaryAnswerKeys(sim.fullQuestions, { promptType: sim.detail.type });`.
     - Cập nhật `items` (dòng 84-88) thành:
       ```ts
       const items = perQuestion.map(({ verdict, key, answer }, q) => ({
         verdict,
         key: summaryKeys[q] ?? key,
         answer,
       }));
       ```
       (vẫn giữ `perQuestion[q].key = question.answer` cho `review` truyền vào `QuizPaper`).
- **Success criteria:** `assignment-quiz-sim.test.ts` và `preview-quiz-simulation.test.tsx` pass 100%.
- **Verify:** `pnpm --filter web exec vitest run src/lib/assignment-quiz-sim.test.ts src/components/assignments/preview-quiz-simulation.test.tsx` exits 0.

### Task 3.4 — Chạy toàn bộ local quality gates (không chạy full E2E)

- **Goal:** Xác minh toàn bộ lint/format, typecheck, và unit/integration test suites trên các gói bị ảnh hưởng đều xanh 100%.
- **Target files and symbols:** Toàn workspace bị tác động (`@teacher-os/api`, `@teacher-os/db`, `@teacher-os/ui`, `server`, `web`, `student`)
- **Steps:**
  1. Chạy `pnpm exec biome check .` (nếu có lỗi format do code mới, chạy `pnpm check:fix` rồi kiểm lại `pnpm exec biome check .`).
  2. Chạy `pnpm check-types`.
  3. Chạy vitest suites cho `@teacher-os/api`, `@teacher-os/db`, `@teacher-os/ui`, `server`, `web`, `student`.
- **Success criteria:** Mọi lệnh exit 0, 0 lỗi lint/type/test.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm --filter @teacher-os/api test && pnpm --filter @teacher-os/db test && pnpm --filter @teacher-os/ui test && pnpm --filter server test && pnpm --filter web test && pnpm --filter student test` exits 0.

## Verification

- `pnpm exec biome check .`
- `pnpm check-types`
- `pnpm --filter @teacher-os/api test`
- `pnpm --filter @teacher-os/db test`
- `pnpm --filter @teacher-os/ui test`
- `pnpm --filter server test`
- `pnpm --filter web test`
- `pnpm --filter student test`

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
