---
title: "886-fix-listening-choose-three-unordered-grading"
description: "Harden unordered set grading for Choose TWO/THREE (mcq_many) across gradeQuiz fallback, snapshot/canonical-lock/sim/multi-part answerSet integrity, and clear unordered key display on Summary & Detail review UI"
status: completed
priority: P1
effort: "2.5h"
tags: [listening, quiz, grading, mcq_many, answerSet, ui]
created: 2026-11-25
---

# Plan #886 — Chấm tập hợp không thứ tự cho câu Choose TWO/THREE (`mcq_many`) & đồng bộ hiển thị Review

- **Issue:** [#886](https://github.com/vinh19410/teacher-os/issues/886)
- **Branch:** `vinh19410/fix-listening-c-u-choose-three-c-th-ang-ch-m-the` → PR vào `develop` (`--ship --beta --advice`)
- **Route:** Bugfix (`/ak-fix --auto --advice`)
- **Handover-ready:** Có — mỗi phase được phân rã thành các task tự chứa gồm `Goal`, `Target files and symbols`, `Steps`, `Success criteria`, lệnh `Verify` cơ học (tách độc lập từng lệnh cho pha Red của `--tdd`) và khối `## Failure Protocol` nguyên văn buộc dừng khi verify thất bại.

## Overview

Khắc phục triệt để toàn bộ 5 nhóm nguyên nhân gốc rễ trên vòng đời `answerSet` / `mcq_many` từ issue [#886](https://github.com/vinh19410/teacher-os/issues/886) (*Talking about the history of bikes* Q8–10 "Choose THREE" và toàn bộ đề IELTS Choose TWO/THREE):

1. **RC1 — Bất đối xứng giữa UI take (`QuizPaper`) và bộ chấm (`gradeQuiz`) khi thiếu `answerSet`:**
   - `QuizPaper` (`packages/ui/src/components/quiz/quiz-paper.tsx:134-147`) gom các câu `mcq_many` liên tiếp theo `(stem, opts)` thành một thẻ checkbox và lưu đáp án theo thứ tự alphabet, nhưng `gradeQuiz` (`packages/api/src/lib/grade-quiz.ts:88-93`) chỉ chấm tập hợp khi có `question.answerSet` tường minh. Mọi snapshot tạo trước commit `5360b4e7` (`2026-11-24`) hoặc prompt cũ thiếu `answerSet` bị rơi về **chấm theo vị trí** (chọn `{A, C, D}` với đáp án `{C, D, F}` bị chấm `0/3` thay vì `2/3`; chọn `{F, C, D}` bị chấm `0/3` thay vì `3/3`). Ngoài ra, toàn bộ 20 cụm `mcq_many` trong `packages/db/seed-data/study-packs/first-step-gt2.json` dùng stem có hậu tố vị trí `(lựa chọn 1/3)` / `(lựa chọn 2/3)` / `(lựa chọn 3/3)` nên cần chuẩn hóa hậu tố slot khi so khớp implicit clustering dùng chung giữa `gradeQuiz` và `QuizPaper`.
2. **RC2 — `apps/server/src/routes/snapshot.ts:156-196` cắt mất `answerSet` khi đọc `assignment_prompt.questions` & `assignments/index.ts:426-429` so sánh không canonical (`null` vs `undefined`):**
   - `snapshot.ts` làm rơi `answerSet` mỗi khi tải kernel snapshot, đồng thời bơm `type: null, pin: null` khiến `normalizeQuestions` ở `apps/server/src/routes/assignments/index.ts:426-429` báo sai `409 PROMPT_CONTENT_LOCKED` khi resend nguyên `questions` từ snapshot. Cần vừa forward `answerSet` (kèm chuẩn hóa `<= 20` ký tự chống crash wire) vừa chuẩn hóa canonical trong `normalizeQuestions`. *(Lưu ý: `ASSIGNMENT_PART_TYPES` tại `packages/api/src/contracts.ts:515-531` hiện không chứa `mcq_many`, nên giới hạn `400` trên `POST`/`PATCH /prompts` cho prompt thư viện `mcq_many` giữ nguyên trong Non-Goals.)*
3. **RC3 — `apps/web/src/lib/assignment-quiz-sim.ts:84-91` cắt mất `answerSet` trên `takeQuestions`:**
   - Lệch với `studentQuizQuestionSchema` (`packages/api/src/contracts.ts:3120`) và route học viên thật (`student.ts:1850`, `student-practice.ts:207`).
4. **RC4 — `apps/server/src/routes/student-practice.ts:109-124` (`buildMergedQuestions`) không tách biên part cho cả explicit lẫn implicit `answerSet` & thiếu chốt `max(20)` trên đường đọc:**
   - Trên đề tự luyện nhiều part, hai part cùng dùng `answerSet: "set-1"` (mặc định của `listening-library.ts:622`) hoặc hai cụm `mcq_many` legacy giáp biên hai part sẽ bị trộn vào cùng một tập trong `gradeQuiz`. Phải chạy `resolveAnswerSetGroups` theo từng part trước khi `flatMap` khi `parts.length > 1` và gắn khóa `p${partIndex + 1}-s${seq}` (`<= 8` ký tự, luôn `<= 20`), đồng thời chuẩn hóa `answerSet` vượt quá 20 ký tự ở `parseQuizQuestions`, `snapshot.ts`, `assignment-quiz-sim.ts` và thêm `.max(20)` vào `packages/db/src/seed/study-packs.ts:124`.
5. **RC5 — Màn Summary (`AttemptCompactList`) và Detail (`QuizPaper` / `QuizReviewItem`) hiển thị key đơn theo vị trí + responsive mobile:**
   - Kể cả khi `gradeQuiz` chấm đúng tập hợp, `GET /api/student/attempts/:attemptId` (`student.ts:2779-2786`) và `PreviewQuizSimulation` (`preview-quiz-simulation.tsx:68-88`) đều trả `item.key = question.answer` đơn lẻ theo vị trí, tạo nghịch lý `9 ✓ C | Đáp án: D` hoặc làm QA nhìn `{A, E, F}` vs `C / D / F` tưởng hệ thống chấm theo ô. Chuẩn hóa bằng helper dùng chung `resolveSummaryAnswerKeys` trả `"C, D, F"` trên cả 3 dòng (không đổi schema `.strict()`), đồng bộ `promptType` nhất quán giữa `POST /submit`, `loadAttemptForReview`, và `GET /attempts/:attemptId` (`undefined` cho `mode === "practice"`), chuẩn hóa `.trim().toUpperCase()` + `(không tính thứ tự)` trên `QuizMcqManyCard` và câu `QuizQuestionItem` thuộc tập `answerSet >= 2` (như `sysex-first-step-gt2-b32`), cùng layout wrap an toàn trên `AttemptCompactList` ở 375px / 768px / 1440px.

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - **RC1 (`packages/api/src/lib/grade-quiz.ts`):** Export `sanitizeAnswerSetKeys`, `canClusterImplicitMcqMany`, `resolveAnswerSetGroups`, và `resolveSummaryAnswerKeys`; cập nhật `gradeQuiz(questions, answers, options?: GradeQuizOptions)` dùng chung `resolveAnswerSetGroups` với điều kiện effective type `(question.type?.trim() || options?.promptType?.trim()) === "mcq_many"`, `opts.filter((o) => o.trim().length > 0).length >= 2`, chuẩn hóa hậu tố slot `(lựa chọn i/K)`/`(choice i/K)` (không ghép khi `slot` không tăng chặt), và tách biệt hoàn toàn namespace explicit vs implicit.
  - **RC2 (`apps/server/src/routes/snapshot.ts`, `apps/server/src/routes/assignments/index.ts`, `packages/db/src/seed/study-packs.ts`):** Forward `answerSet` (đã sanitize `<= 20` ký tự) trong `snapshot.ts:156-203`; chuẩn hóa canonical (bỏ key `null`/`undefined` tương đương) trong `normalizeQuestions` tại `assignments/index.ts:426-429` để không trả `409 PROMPT_CONTENT_LOCKED` giả khi resend `questions` từ snapshot; thêm `.max(20)` vào `study-packs.ts:124`.
  - **RC3 (`apps/web/src/lib/assignment-quiz-sim.ts`, `apps/web/src/lib/use-quiz-simulation.ts`):** Sanitize & forward `answerSet` lên `takeQuestions`, truyền `{ promptType: sim.detail.type }` vào `gradeQuiz`, cập nhật assertion tại `assignment-quiz-sim.test.ts:340`, và thêm test tách 2 cụm `mcq_many` cùng stem/opts khác `answerSet` trong `preview-quiz-simulation.test.tsx`.
  - **RC4 (`apps/server/src/routes/student-practice.ts`, `apps/server/src/routes/student.ts`):** Trong `buildMergedQuestions`, khi `parts.length > 1`, chạy `resolveAnswerSetGroups` trên từng part trước khi `flatMap` để gán khóa `p${partIndex + 1}-s${seq}` cho cả explicit `answerSet` lẫn implicit `mcq_many` (tách tuyệt đối biên part, luôn `<= 20` ký tự); giữ nguyên khóa gốc khi `parts.length <= 1` (chỉ remap chống 404/ZodError nếu vượt 20 ký tự qua `sanitizeAnswerSetKeys` ở `parseQuizQuestions`). Đồng bộ tuyệt đối `gradingPromptType = attempt.mode === "practice" ? undefined : (promptType || undefined)` across `POST /submit`, `loadAttemptForReview`, và `GET /attempts/:attemptId` (destructure `promptType` tại `student.ts:2762`).
  - **RC5 (`apps/server/src/routes/student.ts`, `apps/web/src/components/assignments/preview-quiz-simulation.tsx`, `packages/ui/src/components/quiz/quiz-paper.tsx`, `quiz-review-item.tsx`, `attempt-compact-list.tsx`):** Dùng `resolveSummaryAnswerKeys` ở `GET /attempts/:attemptId` và `PreviewQuizSimulation` (giữ nguyên `detail.questions[i].key` single-key trên wire; bảo vệ chữ thường số La Mã `i`/`v`/`x` ở `headings`); `QuizPaper.canClusterMcqMany` gọi chung `canClusterImplicitMcqMany`; `QuizMcqManyCard` chuẩn hóa `.trim().toUpperCase()` + chú thích `(không tính thứ tự)`; câu non-`mcq_many` chia sẻ `answerSet >= 2` trong `QuizPaper` review truyền `answerSetKey` (UI-only) xuống `QuizReviewItem` để hiển thị `Đáp án: C, E, G, K (không tính thứ tự)` đồng nhất với Summary; `AttemptCompactList` dùng wrap có kiểm soát (`min-w-0 max-w-[55%] sm:max-w-[50%] text-right break-words`) không cắt mất đáp án ở 375px và không ép mất cột học viên ở `>= 640px`.
- **Explicit Non-Goals & Rollout Caveats:**
  - Không viết D1 backfill migration cho `quiz_attempt.questions_snapshot` (bất biến theo RT#3) hay cột `quiz_attempt.correct_count` lịch sử. *Caveat rollout/rollback đã ghi nhận:* 3 bề mặt đọc `quiz_attempt.correct_count` đã lưu (`/api/student/history`, `practiceScoreLabel` trên `/api/student/practice` catalog, và `objective.correctCount` của đề hybrid ở `apps/server/src/routes/grading.ts:488,654`) sẽ giữ giá trị cũ cho các attempt nộp trước `5360b4e7` (trong khi màn Summary/Detail chấm lại trực tiếp từ snapshot nên hiển thị điểm mới); các attempt đa part đang `in_progress` trước thời điểm deploy giữ snapshot đã freeze.
  - Không mở `mcq_many`/`tablecomp` vào `ASSIGNMENT_PART_TYPES` (`packages/api/src/contracts.ts:515-531`) cho trình soạn bank giáo viên (giữ nguyên tách biệt giữa bank giáo viên và thư viện đề admin `librarySkillTypes`).
  - Không thay đổi schema `.strict()` của `quizAttemptItemSchema` hay single-key trên wire của `detail.questions[i].key` và text `"Đúng"` của `QuizReviewChip`.
  - Không dọn bản ghi đề *Talking about the history of bikes* trùng trên Staging (thuộc [#887](https://github.com/vinh19410/teacher-os/issues/887) / [#894](https://github.com/vinh19410/teacher-os/issues/894)).
  - Không sửa `exam-import` (`apps/server/src/lib/exam-import/publish-to-bank.ts`) hay typo hướng dẫn trong `docs/listening_ielts/Forecast-Quy-2-2025-S2-exploring-local-restaurants.json`.
  - Không chạy full E2E suite ở local (theo `AGENTS.md`).

## Extension Trace

Biến thể kế tiếp đã truy vết qua boundary `resolveAnswerSetGroups` / `resolveSummaryAnswerKeys`:
1. **Tập đáp án không phải `mcq_many` với extended letter bank (`sysex-first-step-gt2-b32` trong `packages/db/seed-data/study-packs/first-step-gt2.json:3705-3740`):** `type: "sent4"`, `opts: null`, `answerSet: "q1-4"`, đáp án `C, E, G, K`. Contract giữ ổn định trên cả Summary (`resolveSummaryAnswerKeys` nhận chữ cái `A–Z`, không ép chữ thường La Mã ở `headings`) lẫn Detail (`QuizPaper` tính UI-only `answerSetKey` từ `detail.questions` cùng `answerSet >= 2` và hiển thị `"C, E, G, K (không tính thứ tự)"` trong `QuizReviewItem` mà không đổi wire `detail.questions[i].key`).
2. **Đề luyện tập đa part (`Listening` 4 section hoặc `Reading` 3 passage trong [#889](https://github.com/vinh19410/teacher-os/issues/889)):** hai part cùng mang `answerSet: "set-1"` / khóa 20 ký tự hoặc hai cụm `mcq_many` legacy giáp biên không có `answerSet`. Contract giữ ổn định nhờ chạy `resolveAnswerSetGroups` theo từng part trước khi `flatMap` trong `buildMergedQuestions` và gán `p${partIndex + 1}-s${seq}` (`<= 8` ký tự, luôn thỏa `studentQuizQuestionSchema` `max(20)`).

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Bảo đảm mọi cụm Choose TWO/THREE (`mcq_many`, dù có `answerSet`, thiếu `answerSet`, hay mang hậu tố `(lựa chọn i/K)`) luôn chấm theo tập hợp không phụ thuộc thứ tự | P1 |
| 2 | Chặn mọi điểm làm rơi, quá 20 ký tự, false 409 `PROMPT_CONTENT_LOCKED`, hoặc đụng độ biên part của `answerSet` trên `snapshot.ts`, `assignments/index.ts`, `student-practice.ts`, `student.ts`, và `assignment-quiz-sim.ts` | P1 |
| 3 | Hiển thị đáp án tập hợp nhất quán (`C, D, F`) trên Summary (`AttemptCompactList`) và Detail (`QuizMcqManyCard` + `QuizReviewItem`) không vỡ `.strict()` và không tràn/cắt cụt trên 375px / 768px / 1440px | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: Core Grader Implicit Fallback & Summary Set Keys](./phase-01-start.md) | Done |
| 2 | [Phase 2: Server answerSet Integrity & Summary Keys](./phase-02-server-answerset-integrity-and-summary-keys.md) | Done |
| 3 | [Phase 3: UI Review Clarity, Web Simulation & Verification Gates](./phase-03-ui-review-clarity-sim-and-verification.md) | Done |

## Acceptance Criteria

- [x] `gradeQuiz` chấm *Talking about the history of bikes* Q8–10 (key `C, D, F`) theo tập hợp không thứ tự **cả khi có `answerSet: "set-2"` lẫn khi thiếu `answerSet`** (và cả fixture `sysex-first-step-gt2-b59` có hậu tố `(lựa chọn 1/3..3/3)` khi thiếu `answerSet`): `{F, C, D}` → `3/3`, `{D, F, C}` → `3/3`, `{A, C, D}` → `2/3`, `{A, E, F}` → `1/3`, `{C, C, D}` → `2/3`, `{D, F}` → `2 correct / 1 skipped`; hỗ trợ `promptType: "mcq_many"` khi `question.type` là `null`/`undefined`/`""`; không gộp 2 cụm `mcq_many` không liền kề, khác `(stem, opts)`, hoặc có `< 2` lựa chọn không rỗng.
- [x] `resolveSummaryAnswerKeys` trả `"C, D, F"` cho cụm Q8–10, `"C, E, G, K"` cho tập extended letter `A–Z`, giữ nguyên chữ thường cho số La Mã `headings` (`"i, v"`), giữ thứ tự xuất hiện khử trùng cho tập text tự do, giữ nguyên `question.answer` cho câu positional; không đổi shape `.strict()` của `quizAttemptItemSchema` hay single-key trên wire của `detail.questions[i].key`.
- [x] `apps/server/src/routes/student.ts` đồng bộ tuyệt đối `gradingPromptType` (`undefined` cho `mode === "practice"`, `promptType || undefined` cho `mode === "assignment"`) ở `POST /submit`, `loadAttemptForReview`, và `GET /attempts/:attemptId` (destructure `promptType` đầy đủ), không bao giờ lệch điểm giữa DB/Summary/Detail hay rò type Part 1 sang Part 2–4.
- [x] `apps/server/src/routes/snapshot.ts` forward `answerSet` (kèm `sanitizeAnswerSetKeys` `<= 20` ký tự), `apps/server/src/routes/assignments/index.ts` (`normalizeQuestions`) chuẩn hóa canonical bỏ lệch `null` vs `undefined` để round-trip snapshot + PATCH đổi `title` trên prompt hợp lệ có attempt trả `200` (không dính `409 PROMPT_CONTENT_LOCKED`), và `packages/db/src/seed/study-packs.ts` chặn `.max(20)`.
- [x] `apps/server/src/routes/student-practice.ts` (`buildMergedQuestions`) giữ nguyên `answerSet` khi `parts.length <= 1` (sanitize nếu `> 20` ký tự) và khi `parts.length > 1` tách biên part bằng `resolveAnswerSetGroups` theo từng part rồi remap `p${partIndex + 1}-s${seq}` cho cả explicit lẫn implicit `mcq_many` (không trộn chéo hai part và không 404 ở `assertValidDetail`).
- [x] `apps/web/src/lib/assignment-quiz-sim.ts` sanitize & forward `answerSet` lên `takeQuestions` (test chứng minh tách 2 cụm cùng stem/opts khác `answerSet`), `use-quiz-simulation.ts` truyền `{ promptType }`, `PreviewQuizSimulation` dùng `resolveSummaryAnswerKeys`, `QuizPaper` dùng chung `canClusterImplicitMcqMany`, chuẩn hóa `.trim().toUpperCase()` + `(không tính thứ tự)` trên `QuizMcqManyCard` lẫn câu non-`mcq_many` chung `answerSet >= 2` (`QuizReviewItem`), và `AttemptCompactList` hiển thị đầy đủ không cắt cụt/tràn ở 375px / 768px / 1440px.
- [x] Toàn bộ local quality gates pass 100%: `pnpm exec biome check .`, `pnpm check-types`, và vitest suites cho `@teacher-os/api`, `@teacher-os/ui`, `server`, `web`, `student`.

## Red Team Review

### Session — 2026-11-25
**Reviewers:** Security Adversary (Fact Checker), Assumption Destroyer (Contract Verifier), Failure Mode Analyst (Flow Tracer) — 3 parallel hostile subagents
**Findings:** 10 deduplicated from 23 raw findings (10 accepted, 0 rejected)
**Severity breakdown:** 3 Critical, 3 High, 4 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | Bất đối xứng `promptType` giữa `POST /submit` (`null`) và `loadAttemptForReview` (`header[0]?.type` Part 1) trên `mode === "practice"` gây lệch điểm DB vs Summary/Detail và rò type Part 1 sang Part 2–4; thiếu destructure `promptType` tại `student.ts:2762` | Critical | Accept | Plan, Phase 2 |
| 2 | `PATCH /api/assignments/prompts/:id` vẫn trả `409 PROMPT_CONTENT_LOCKED` khi resend `questions` từ `snapshot.ts` do `normalizeQuestions` (`assignments/index.ts:426-429`) không bỏ lệch `null`/`undefined` (`type: null, pin: null`); `mcq_many` không có trong `ASSIGNMENT_PART_TYPES` (`contracts.ts:515-531`) gây `400` trên `POST`/`PATCH` | Critical | Accept | Plan, Phase 2 |
| 3 | Implicit `mcq_many` fallback trượt 20/20 cụm thực tế của `first-step-gt2.json` khi thiếu `answerSet` do stem có hậu tố `(lựa chọn 1/3..3/3)`, và `question.type === ""` bỏ qua fallback `??` | Critical | Accept | Plan, Phase 1, Phase 3 |
| 4 | `QuizPaper.canClusterMcqMany` thiếu guard `opts` hợp lệ (`>= 2` option không rỗng theo `library-contracts.ts:619`), tái tạo bất đối xứng UI-vs-grader và trôi tên helper trong Phase 1 | High | Accept | Plan, Phase 1, Phase 3 |
| 5 | `buildMergedQuestions` (RC4) chỉ tách namespace cho explicit `answerSet`, để lọt cụm implicit `mcq_many` legacy giáp biên hai part bị trộn chéo | High | Accept | Plan, Phase 2 |
| 6 | Thiếu chặn `max(20)` trên `study-packs.ts:124`, `parseQuizQuestions`, `snapshot.ts`, `assignment-quiz-sim.ts` và nhánh 1-part `student-practice.ts` — có thể gây 404 `assertValidDetail` hoặc crash Zod phía Student SPA | High | Accept | Plan, Phase 1, Phase 2, Phase 3 |
| 7 | Câu `answerSet` non-`mcq_many` (`sysex-first-step-gt2-b32`: `sent4`, `q1-4`) vẫn hiện single key vị trí ở Detail (`QuizReviewItem`) mâu thuẫn với Summary (`C, E, G, K`) | Medium | Accept | Plan, Phase 3 |
| 8 | `AttemptCompactList` dùng `shrink-0 max-w-[55%] truncate sm:max-w-none` vừa cắt cụt đáp án trên mobile touch 375px vừa ép mất cột đáp án học viên ở `>= 640px` | Medium | Accept | Plan, Phase 3 |
| 9 | `resolveSummaryAnswerKeys` dùng `/^[A-Z]$/i` ép hoa số La Mã 1 ký tự (`i`, `v`, `x`) ở `headings` | Medium | Accept | Phase 1 |
| 10 | Phantom coverage RC3 ở Task 3.1 Step 2 (thiếu test 2 cụm cùng stem khác `answerSet`), lệnh Verify Red dùng `&&` ngắt mạch và bỏ sót `attempt-summary.test.tsx` + `apps/server/src/lib/grade-quiz.test.ts`, lỗi scope `preview-quiz-simulation.tsx:84-88`, số dòng `kernel.test.ts:6362`→`6451`, và thiếu caveat `/practice` catalog + hybrid `grading.ts` | Medium | Accept | Plan, Phase 1, Phase 2, Phase 3 |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-server-answerset-integrity-and-summary-keys.md`, `phase-03-ui-review-clarity-sim-and-verification.md`
- Decision deltas checked: 10 (thống nhất `gradingPromptType` practice=`undefined` + destructure `promptType` ở `student.ts:2762`; chuẩn hóa canonical `normalizeQuestions` ở `assignments/index.ts:426-429` + wire code `PROMPT_CONTENT_LOCKED` + type hợp lệ `ASSIGNMENT_PART_TYPES` trong test `kernel.test.ts` sau dòng 6451; chuẩn hóa hậu tố `(lựa chọn i/K)` & `type?.trim() || promptType?.trim()`; thống nhất 1 predicate export `canClusterImplicitMcqMany` yêu cầu `>= 2` option không rỗng dùng chung ở `grade-quiz.ts` và `quiz-paper.tsx`; chạy `resolveAnswerSetGroups` theo từng part trong `buildMergedQuestions` khi `parts.length > 1`; thêm `sanitizeAnswerSetKeys` `<= 20` ký tự + `.max(20)` trong `study-packs.ts:124`; thêm UI-only `answerSetKey` cho `QuizReviewItem` non-`mcq_many`; đổi `AttemptCompactList` sang wrap `min-w-0 max-w-[55%] sm:max-w-[50%] text-right break-words`; bảo vệ số La Mã `headings` trong `resolveSummaryAnswerKeys`; tách lệnh Verify pha Red độc lập + bổ sung test tách 2 cụm RC3 + sửa scope `preview-quiz-simulation.tsx:84-88` + ghi đầy đủ caveat rollout)
- Reconciled stale references: 10/10 (0 tên helper/mã lỗi/số dòng/lệnh cũ còn sót)
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-11-25
- `ak plan validate`: `valid: true`, `errors: null` (trước và sau khi áp dụng 10/10 phát hiện Red-Team).
- Kongming post-plan-gates counsel: **GO** kèm 5 chốt chặn cài đặt (áp dụng trực tiếp trong Phase 1–3): (1) dựng `effectiveReview` dạng `Record<number, QuizReviewInfo>` map theo `arrayIndex` → `q.q` + resolve `effectiveType` theo từng part + cập nhật `InlineAnswerSlot` (`quiz-inline-instruction.tsx:164-172`) dùng `info.answerSetKey?.trim() || info.key`; (2) chuẩn hóa `type: ""` → `null` trong `parseQuizQuestions` (`student.ts:336`); (3) dựng object canonical thứ tự key cố định trong `normalizeQuestions` (`assignments/index.ts:426-429`); (4) `sanitizeAnswerSetKeys` trim trước check `<= 20` và strip khóa toàn khoảng trắng `"   "`, `buildMergedQuestions` destructure bỏ `answerSet` cũ trước khi conditional spread; (5) giữ thứ tự bản đã `trim()` khi khử trùng text tự do ở `resolveSummaryAnswerKeys`.

### Verification Results
- **Tier:** Standard (3 phases — Fact Checker + Contract Verifier + Flow Tracer)
- **Claims checked:** 31
- **Verified:** 31 | **Failed:** 0 | **Unverified:** 0
- Verified symbols & paths: `packages/api/src/lib/grade-quiz.ts:75-178`, `packages/api/src/contracts.ts:515-531,992-1019,1483,3108-3123,3211-3218,3284`, `packages/api/src/library-contracts.ts:619`, `packages/db/src/seed/listening-library.ts:622`, `packages/db/src/seed/study-packs.ts:124`, `packages/db/seed-data/study-packs/first-step-gt2.json:436-465,3705-3740,6881-6925`, `apps/server/src/routes/snapshot.ts:156-203`, `apps/server/src/routes/assignments/index.ts:250-294,423-439`, `apps/server/src/routes/student-practice.ts:109-124,129-144,171-172,207,426-435,522-524`, `apps/server/src/routes/student.ts:37,313-357,950-1015,1850,2451,2500-2513,2589-2624,2661-2671,2762,2779-2786,2898-2901`, `apps/server/src/routes/grading.ts:488,651-659`, `apps/server/src/routes/student-history.ts:151-156`, `apps/server/src/kernel.test.ts:6318-6451`, `apps/web/src/lib/assignment-quiz-sim.ts:66-141`, `apps/web/src/lib/assignment-quiz-sim.test.ts:311-341`, `apps/web/src/lib/use-quiz-simulation.ts:26-48`, `apps/web/src/components/assignments/preview-quiz-simulation.tsx:53-102`, `packages/ui/src/components/quiz/quiz-paper.tsx:134-224,439-448,1058-1082`, `packages/ui/src/components/quiz/quiz-review-item.tsx:11-25,80-105`, `packages/ui/src/components/quiz/attempt-compact-list.tsx:13-59`.

<!-- slug: 886-fix-listening-choose-three-unordered-grading -->
