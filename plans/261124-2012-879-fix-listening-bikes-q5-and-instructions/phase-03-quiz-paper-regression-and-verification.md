---
phase: 3
title: "Phase 3: QuizPaper Regression Tests & Full Verification Gates"
status: completed
priority: P1
effort: "30m"
dependencies: [1, 2]
---

# Phase 3: QuizPaper Regression Tests & Full Verification Gates

<!-- Updated: Red-Team Review 2026-11-24 - Upgraded Task 3.2 audit to baseline-diff across ALL 498 Listening + 352 Reading files (cleanedPreamble + scopeFlattenedOptionBank + cross-group leaks), ran audit from vitest/workspace with full @teacher-os/ui + @teacher-os/api deps, added @teacher-os/infra flat-migrations.test.ts and study-pack-clone.test.ts, fixed pnpm check -> pnpm check:fix -->

## Goal
Thêm integration DOM tests cho *Talking about the history of bikes* và *City Health Services* (Take + Review, `hasGroupSource` + `!hasGroupSource`) trong `packages/ui/src/components/quiz/quiz-paper.test.tsx`, kiểm chứng baseline-diff trên toàn bộ 498 file Listening + 352 file Reading (0 cross-group leak, 0 hồi quy `cleanedPreamble`, 0 hồi quy `scopeFlattenedOptionBank`), và vượt 100% local quality gates (`biome`, `check-types`, vitest).

## Files to Create / Modify
- Modify: `packages/ui/src/components/quiz/quiz-paper.test.tsx`

## Tasks & Steps

### Task 3.1 — Thêm QuizPaper integration DOM tests cho Bikes và City Health Services
- **Goal:** Xác minh ở mức DOM thật trên `QuizPaper` (cả `mode="take"` lẫn `mode="review"`, cả `buildQuizPartsFromGroups` lẫn `buildQuizParts`) rằng:
  1. **Talking about the history of bikes:** ô bảng Q5 hiển thị `"easier; ride"` gắn liền input inline câu 5, đáp án `"more smoothly"` chấm đúng qua `gradeQuiz`, nhóm Q8–10 (`mcq_many`) hiển thị đúng hướng dẫn `"Choose THREE letters, A-F, and write them next to questions 8-10..."` trong section `Questions 8–10` mà không bị lặp ở preamble đầu trang.
  2. **City Health Services:** `"Choose the correct answer."` chỉ xuất hiện duy nhất trong section `Questions 5–7` (`mcq1`), tuyệt đối không xuất hiện trong section `Questions 1–4` (`form`), section `Questions 8–10` (`sent4`), hay `introPreamble` đầu trang.
- **Target files and symbols:** `packages/ui/src/components/quiz/quiz-paper.test.tsx`
- **Steps:**
  1. Thêm khối `describe("QuizPaper — Issue #879: Talking about the history of bikes Q5 & City Health Services instruction isolation", ...)` vào cuối `packages/ui/src/components/quiz/quiz-paper.test.tsx`.
  2. Case 1 (Bikes — `hasGroupSource` và `!hasGroupSource`, `mode="take"` và `mode="review"`):
     - Dựng fixture khớp chính xác dữ liệu từ `Unknown-S4-talking-about-the-history-of-bikes.json` (gồm Q1–7 `tablecomp` với `<td><p>easier; ride <strong>(5)</strong></p></td>`, Q8–10 `mcq_many` với `answerSet: "set-2"`).
     - Kiểm tra `gradeQuiz` với `answers["4"] = "more smoothly"` trả verdict `"correct"`.
     - Render `<QuizPaper>` ở Take và Review cho cả 2 đường (`buildQuizPartsFromGroups` và `buildQuizParts`):
       - Trong section `Questions 1–7`: text chứa `easier; ride`, KHÔNG chứa `easier and` cạnh `ride`, input `Điền đáp án câu 5` tồn tại inline trong bảng, và ở Review hiển thị verdict `correct` cho `"more smoothly"` hoặc key `→ more smoothly` khi sai/bỏ trống.
       - Trong section `Questions 8–10`: chứa `"Choose THREE letters, A-F, and write them next to questions 8-10"`, không có bản lặp ở preamble đầu trang (tổng số lần xuất hiện cụm trên DOM ngoài section `Questions 8–10` === `0`, `introPreamble` không render ngoài các `<section>`; lưu ý bên trong section `Questions 8–10` chuỗi xuất hiện ở cả `<header>` lẫn `QuizMcqManyCard` stem).
  3. Case 2 (City Health Services — `hasGroupSource` và `!hasGroupSource`, `mode="take"` và `mode="review"`):
     - Dựng fixture khớp chính xác 3 nhóm của `Actual-Test-S1-city-health-services.json` (`form` Q1–4, `mcq1` Q5–7 `"Choose the correct answer."`, `sent4` Q8–10) kèm `detail.intro` flattened giống `flattenLibraryTestPart`.
     - Render `<QuizPaper>` ở Take và Review cho cả 2 đường:
       - Section `Questions 1–4`: chứa `"Complete the form below. Write NO MORE THAN TWO WORDS for each answer."` + inline inputs Q1–4, tuyệt đối KHÔNG chứa `"Choose the correct answer."`.
       - Section `Questions 5–7`: chứa `"Choose the correct answer."` + 3 câu MCQ Q5–7.
       - Section `Questions 8–10`: chứa `"Complete the sentences below. Write ONE WORD AND/OR A NUMBER for each answer."` + inline inputs Q8–10, tuyệt đối KHÔNG chứa `"Choose the correct answer."`.
       - Toàn trang chỉ xuất hiện `"Choose the correct answer."` đúng 1 lần (nằm gọn trong section `Questions 5–7`).
- **Success criteria:** Tất cả các integration test mới và cũ trong `packages/ui/src/components/quiz/quiz-paper.test.tsx` pass 100%.
- **Verify:** `pnpm --filter @teacher-os/ui exec vitest run src/components/quiz/quiz-paper.test.tsx` exits 0 and reports all tests passed.

### Task 3.2 — Chạy baseline-diff audit 498 Listening + 352 Reading & toàn bộ local quality gates
- **Goal:** Xác nhận cơ học 0 lỗi cross-group different-type leak, 0 hồi quy `cleanedPreamble`, 0 hồi quy `scopeFlattenedOptionBank` trên toàn bộ **850 đề** (498 Listening + 352 Reading), và pass toàn bộ `biome check`, `check-types`, cùng các vitest suites liên quan (gồm cả `@teacher-os/infra` flat migrations và `study-pack-clone.test.ts`; không chạy full E2E local theo quy ước `AGENTS.md`).
- **Target files and symbols:** Toàn bộ workspace bị ảnh hưởng (`docs/listening_ielts`, `packages/db`, `packages/ui`, `packages/infra`, `apps/server`, `apps/student`, `apps/web`, `apps/admin`)
- **Steps:**
  1. Chạy audit toàn diện trên **849 đề (498 file Listening `docs/listening_ielts/*.json` + 351 file Reading `docs/reading-ielts/reading-practice/*.json`, lọc bỏ `_index.json`)** qua Vitest trong `@teacher-os/ui` (nơi có sẵn đủ dependency `@teacher-os/api` và `packages/ui/src/lib/quiz-instruction.ts`; KHÔNG chạy từ `@teacher-os/db` vốn thiếu dependency `@teacher-os/ui`/`@teacher-os/api`) đối chiếu kết quả trước vs sau thay đổi ở `quiz-instruction.ts`, xác nhận:
     - `different-type cross-group leaks === 0` trên toàn bộ 498 Listening + 352 Reading.
     - `cleanedPreamble` regressions === `0` (không có đề nào từ rỗng thành có nội dung, và 10 đề `MAP_LABELLING` 2 dòng như `C16T1-S2` giữ nguyên `cleanedPreamble` sạch).
     - `scopeFlattenedOptionBank` regressions === `0` (không có đề nào rơi từ `isBankScoped: true → false` hay `partitioned: Map → null`).
     - `Bikes` (`!hasGroupSource`), `City Health Services` (grouped + `!hasGroupSource`), `C14T3-S3`, `C15T3-S3`, `C20T3-S3`, `C20T4-S2`, `C11T3-S3`, `C11T4-S1`, `Actual-Test-S2-radio-program-singing-in-the-choir`, `Collection-S3-climate-change-and-allergies`, `Forecast-Quy-2-2025-grey-workers`, `Collection-nineteenth-century-paperback-literature` đều đạt đúng kỳ vọng.
  2. Chạy gate lint/format đọc-only `pnpm exec biome check .` (nếu có lỗi format thì sửa bằng **`pnpm check:fix`**, rồi kiểm lại bằng `pnpm exec biome check .`).
  3. Chạy `pnpm check-types`.
  4. Chạy đầy đủ test suites liên quan:
     - `pnpm --filter @teacher-os/db test`
     - `pnpm --filter @teacher-os/ui test`
     - `pnpm --filter @teacher-os/infra exec vitest run src/flat-migrations.test.ts`
     - `pnpm --filter server exec vitest run src/listening-bikes-q5-migration.test.ts src/study-pack-migration.test.ts src/listening-library-import.test.ts src/routes/student-practice-library-sync.test.ts src/assignment-prompt-groups-backfill-migration.test.ts src/lib/study-pack-clone.test.ts`
     - `pnpm --filter student exec vitest run test/quiz-paper.test.tsx test/quiz-take-view.test.tsx`
     - `pnpm --filter web exec vitest run src/components/assignments/preview-quiz-simulation.test.tsx`
     - `pnpm --filter admin exec vitest run src/components/library/test-preview-overlay.test.tsx`
- **Success criteria:** Audit 850 file trả 0 different-type leaks / 0 preamble regressions / 0 bank-scoping regressions, `biome check` = 0 errors, `check-types` = 0 errors, toàn bộ test suites pass 100%.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm --filter @teacher-os/db test && pnpm --filter @teacher-os/ui test && pnpm --filter @teacher-os/infra exec vitest run src/flat-migrations.test.ts && pnpm --filter server exec vitest run src/listening-bikes-q5-migration.test.ts src/study-pack-migration.test.ts src/listening-library-import.test.ts src/routes/student-practice-library-sync.test.ts src/assignment-prompt-groups-backfill-migration.test.ts src/lib/study-pack-clone.test.ts && pnpm --filter student exec vitest run test/quiz-paper.test.tsx test/quiz-take-view.test.tsx && pnpm --filter web exec vitest run src/components/assignments/preview-quiz-simulation.test.tsx && pnpm --filter admin exec vitest run src/components/library/test-preview-overlay.test.tsx` exits 0 with all checks green.

## Verification
- Full verification gate command from Task 3.2.

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
