# Scout report — Teacher quiz preview simulation

Ngày: 2026-09-30 · Nguồn: Explore agent (45 tool uses) + đọc trực tiếp; mọi claim kèm file:line.

## 1. Hiện trạng trang preview giáo viên

- `apps/web/src/routes/_auth/assignments/preview.tsx:16-63` — route `/_auth/assignments/preview`, `validateSearch` nhận `?id=`; bank mode tìm prompt trong `useData().assignmentPrompts`; draft mode đọc sessionStorage không xoá. Render `StudentPreviewPaper` + textarea "Bài làm của học viên (mô phỏng)" không lưu (L191-209).
- `apps/web/src/components/assignments/student-preview-paper.tsx:111-141` — block `isAuto` (reading/listening) render intro + `OptionBankList` + items: `ClozeStemText` **preview-mode** (truyền `answer`, không `onChange`) — answer chỉ đo width ô trống, không render (`packages/ui/src/components/assignments/cloze-stem.tsx:77-100`).
- `QuestionItem = AssignmentQuestion` (full key: stem/opts/answer/alts/pin) — `apps/web/src/components/assignments/assignment-presets.ts:21`.
- Chưa có e2e spec nào chạm `/assignments/preview` (grep toàn `apps/e2e/specs/` = 0 hit) — #282 chỉ unit test.

## 2. Component student quiz (`apps/student/src/components/quiz/`)

| File | Props chính | Phụ thuộc ngoài |
|---|---|---|
| `quiz-paper.tsx` L45-65 | `QuizPaper({detail: QuizPaperDetail, parts: QuizPart[], answers, onAnswer, currentQuestion, mode?: "take"\|"review", review?: Record<number, QuizReviewInfo>})` | api/contracts, ui primitives, `@/components/quiz/quiz-question-item`, `@/lib/quiz-parts` |
| `quiz-question-item.tsx` L51-72 | `QuizQuestionItem` (fieldset `disabled={reviewMode}` L83, ClozeStemText interactive L94-100) | api/contracts, ui ClozeStemText, `@/components/quiz/quiz-review-item` |
| `quiz-review-item.tsx` L5-41 | xuất `QuizReviewInfo {verdict, key, alts, answer, note}`, `QuizReviewItem({info})` | type `QuizVerdict` (api/contracts), `cn` (`@/lib/cn` = re-export ui utils) |
| `quiz-navigator.tsx` L23-41 | `{parts, answers, current, onSelect, mode?, verdicts?}` | `@/lib/quiz-parts` (countAnswered, isAnsweredValue) |
| `attempt-score-card.tsx` L10-22 | `{correctCount, wrongCount, skippedCount, totalCount, attemptId}` — **có Link router student** L63-66 | `@tanstack/react-router`, ui button |
| `attempt-compact-list.tsx` L14-18 | `{items: readonly QuizAttemptItem[]}` | api/contracts |
| `attempt-review-error.tsx` | errorComponent route — student-specific, KHÔNG move | `@/lib/query-client` |

- Routes: `$assignmentId.tsx` L41-63 (take, submit drain-store), `attempt/$attemptId.tsx` L23-53 (summary: ScoreCard + CompactList + duration), `attempt/$attemptId.detail.tsx` L20-103 (detail: `parts = buildQuizParts(attempt.questions)`, `review = {q: {verdict,key,alts,answer,note}}`, `QuizPaper mode="review"` L130-138).
- Token CSS dùng chung từ `@teacher-os/ui` globals (text-muted-fg, border-line, bg-surface, text-accent-blue…) — cả web lẫn student cùng consume.

## 3. Logic thuần

- `apps/server/src/lib/grade-quiz.ts:50` — `gradeQuiz(questions: readonly AssignmentQuestion[], answers): QuizGrade {verdicts, correctCount, wrongCount, skippedCount, totalCount}`. Import **type-only** từ api/contracts → chạy client-side được. Normalize `replace(/\s+/g," ").trim().toLowerCase()` L25-27; alts split `" / "` L22; blank → skipped.
- `apps/student/src/lib/quiz-parts.ts` — `QuizPartQuestion` (thêm `q` 0-based + `number`), `QuizPart`, `buildQuizParts(questions)`; comment RT#13: flat 1 part hôm nay, shape giữ sẵn cho đa phần.
- Test hiện có: `apps/server/src/lib/grade-quiz.test.ts` (15 test TDD #283).

## 4. Packages

- `packages/api` — exports `"./*": "./src/*.ts"`; CHƯA có script test (chỉ check-types); có sẵn logic thuần `format-schedule.ts`, `vietnam-date.ts` được test từ app tiêu thụ (`apps/web/src/lib/format-schedule.test.ts`) → precedent giữ test ở consumer.
- `packages/ui` — exports `"./components/*"`, `"./lib/*"`; dep `@teacher-os/api`; KHÔNG có test (behavior cover gián tiếp qua web/student + e2e). Tiền lệ extraction #284 (commit f0ceefc): move renderer + xoá gốc, không shim.

## 5. Mapping dữ liệu cho simulation

- `AssignmentPrompt` web (`apps/web/src/lib/mock-data.ts:59-85`) optional nhiều field (skill/part/type/intro/passage/…, fallback task/genre L42-43); kernel required.
- Server precedent mapping prompt → quiz payload: `apps/server/src/routes/student.ts:874-895` (fill default, strip answer/alts cho take).
- Take-render + grading cần 2 shape: (a) take-render từ questions **đã strip key** (mirror server), (b) gradeQuiz cần `AssignmentQuestion` full key — ở web cả hai đều có sẵn client-side từ prompt; **take view tuyệt đối không render key** (mirror leak contract).
- `note` nằm ở prompt level → review map dùng chung cho mọi câu (giống `attempt.note` ở detail route).

## 6. Test & gates

- apps/student: vitest **environment node**, `renderToStaticMarkup`, stub router `vi.mock("@tanstack/react-router")` (`test/quiz-navigator.test.tsx:15-19`). `pnpm --filter student test`.
- apps/web: vitest colocated `*.test.tsx`; mặc định node, jsdom opt-in từng file bằng `// @vitest-environment jsdom` (precedent `rich-text-editor.test.tsx`). `pnpm --filter web test`.
- E2e leak-check 3 lớp: `apps/e2e/specs/student-quiz-take-review.spec.ts` L33-42, L413-447 (key/alts/note không xuất hiện ở take; JSON /quiz không chứa answer/alts/note/verdict/key).
- Gates chuẩn (AGENTS.md): `pnpm check`, `pnpm check-types`, `pnpm --filter <app> test`; e2e local dùng `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103`.

## Risks

- `QuizNavigator.verdicts` khai báo `Record<number, QuizVerdict>` nhưng detail route build `Record<string, QuizVerdict>` (`$attemptId.detail.tsx:97`) — TS chấp nhận; khi tái sử dụng nên thống nhất.
- PinOverlay/ClozeStemText key answers theo **offset trong items** — simulation phải truyền đủ/thứ tự items y hệt take (xem chú thích `quiz-paper.tsx:93-95`).
- Move component đổi import path của test student — cần đồng bộ 12 file test.

## Errata (Red Team Session 1)

- Mục 2 thiếu 2 file trong bảng: thư mục `apps/student/src/components/quiz/` có
  **9 file** — bổ sung `quiz-lifecycle-dialogs.tsx` (confirm dialogs, dùng
  QuizDialog) và `quiz-runtime-header.tsx` (import `@/lib/quiz-attempt-store` +
  router — student-specific, không move được). Cả 2 KHÔNG thuộc scope move.
