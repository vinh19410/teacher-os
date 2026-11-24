# Plan #873 — Nhập đáp án inline tại marker `(N)` / `[N]` trong `QuizPaper`

- **Issue:** [#873](https://github.com/vinh19410/teacher-os/issues/873)
- **Branch:** `vinh19410/Input-answer-inline` → PR vào `develop` (`--merge --beta`)
- **Status:** Completed (ready to ship `--merge --beta`)

## Objective

Render ô nhập đáp án inline (`<input type="text">` cho text completion và `<select>` cho nhóm có `optionBank`) ngay tại các marker `<strong>(N)</strong>` / `[N]` trong `instructionHtml` / `intro` của `QuizPaper` trên toàn bộ bề mặt (take, review, admin preview, web simulation), ẩn danh sách `<QuizQuestionItem>` bị lặp bên dưới và giữ trọn điều hướng `QuizNavigator`, autosave và review.

## Phases & File Ownership

| Phase | Scope | Owned files | Dependencies |
|---|---|---|---|
| **1A** | Pure parser/mapper HTML→marker (`inline-instruction.ts`) + unit tests + dataset sweep 498 file `docs/listening_ielts` | `packages/ui/src/lib/inline-instruction.ts`, `packages/ui/src/lib/inline-instruction.test.ts` | None |
| **1B** | Mở rộng seed helper `helpers-quiz.ts` (`groups`, `optionBank`, `explanation`) + viết E2E spec `student-quiz-inline-answers.spec.ts` | `apps/e2e/specs/helpers-quiz.ts`, `apps/e2e/specs/student-quiz-inline-answers.spec.ts` | None (dùng hợp đồng DOM đã chốt) |
| **2** | Component `QuizInlineInstruction` + tích hợp `QuizPaper` + component tests (`packages/ui` & `apps/student`) | `packages/ui/src/components/quiz/quiz-inline-instruction.tsx`, `packages/ui/src/components/quiz/quiz-paper.tsx`, `packages/ui/src/components/quiz/quiz-paper.test.tsx`, `apps/student/test/quiz-paper.test.tsx` | Phase 1A |
| **3** | Orchestrator verification: `biome check`, `check-types`, unit tests, chạy E2E spec lẻ + chụp POT 3 viewport Light/Dark | `plans/reports/873-inline-answer-*.png` | Phase 1B, 2 |
| **4** | Isolated code review (`code-reviewer` fresh subagent) + fix + re-review đến sạch | Theo findings (nếu có) | Phase 3 |
| **5** | Ship `--merge --beta` vào `develop`, kiểm tra CI, merge, đăng POT comment lên #873, gắn `shipped` | GitHub PR & Issue #873 | Phase 4 |

## Hợp đồng DOM & Hành vi (Shared Contract)

- Inline slot wrapper: `<span data-testid="quiz-inline-slot" data-question={q} data-verdict={...}>` (ở review mode giữ `id="quiz-q-${q + 1}"` và `tabIndex={-1}`).
- Badge số câu: `<span data-testid="quiz-inline-badge" aria-hidden="true">{question.number}</span>`.
- Text input: `<input type="text" id={take ? "quiz-q-${q+1}" : undefined} aria-label="Điền đáp án câu ${question.number}" maxLength={QUIZ_ANSWER_VALUE_MAX} ... />`.
- Select (`optionBank`): `<select id={take ? "quiz-q-${q+1}" : undefined} aria-label="Chọn đáp án câu ${question.number}" ...>` với `<option value="">— Chọn —</option>` và các `<option value={row.value}>`.
- Review inline key hint (khi `wrong`/`skipped`): `<span data-testid="quiz-inline-key">→ {review.key}</span>`.
- Review collapsible block: `<details data-testid="quiz-inline-review-details"><summary>Đáp án & Giải thích ({count} câu)</summary>...</details>` chứa `QuizReviewChip` + `QuizReviewItem`.
- Nội dung inline container: `<div data-testid="quiz-inline-instruction">`, mọi `<table>` bọc trong `<div className="my-2 max-w-full overflow-x-auto">`.

## Acceptance Criteria (Done means)

1. Unit test parser/mapper + dataset sweep 498 file `docs/listening_ielts`: 0 câu rớt, 0 slot trùng, XSS sanitized.
2. `QuizPaper` render text `<input>` & optionBank `<select>` inline, ẩn `<QuizQuestionItem>` đã bind, giữ fallback cho câu chưa khớp, `QuizNavigator` scroll+focus & Tab order chuẩn, Review mode tô verdict + key hint + `<details>` Đáp án & Giải thích.
3. Spec E2E lẻ pass + POT screenshots 3 viewport (`1440×900`, `768×1024`, `375×812`, light & dark) không tràn ngang/vỡ bảng.
4. `pnpm exec biome check .`, `pnpm check-types`, relevant unit tests, isolated review, PR merge vào `develop`, issue #873 có POT + `shipped`.
