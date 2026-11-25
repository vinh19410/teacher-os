---
phase: 3
title: "Phase 3: QuizPaper Wiring, Tests & Full Verification Gates"
status: completed
priority: P1
effort: "45m"
dependencies: [1, 2]
---

# Phase 3: `QuizPaper` Wiring, Integration Tests & Full Verification Gates

<!-- Updated: Red-Team Review 2026-11-24 - Preserved useMemo memoization with primitive hasIntroSplit & module-level EMPTY_MATCHED_INSTRUCTIONS, tightened multi-completion contextIntro scoping, and guarded sanitized non-empty matchedInstruction -->

## Goal
Nối logic dedup/extraction và scoping `contextIntro` vào `QuizPaper` cho cả chế độ Take lẫn Review (cả khi có `groups` và khi fallback không `groups`) mà không phá memoization theo từng keystroke, bổ sung regression tests cho đề **The History of Tea**, và vượt qua toàn bộ quality gates của monorepo.

## Files to Create / Modify
- Modify: `packages/ui/src/components/quiz/quiz-paper.tsx`
- Modify: `packages/ui/src/components/quiz/quiz-paper.test.tsx`

## Tasks & Steps

### Task 3.1 — Viết integration tests tái hiện đề The History of Tea trong `QuizPaper` (Red phase)
- **Goal:** Bổ sung tests trong `quiz-paper.test.tsx` cho cả 2 chế độ (`take` và `review`) và cả 2 dạng dữ liệu (fallback không `groups` pre-0085 và có `groups` post-0087), cộng với test chống rò rỉ `contextIntro` khi có `>= 2` nhóm completion.
- **Target files and symbols:** `packages/ui/src/components/quiz/quiz-paper.test.tsx`
- **Steps:**
  1. Thêm suite `QuizPaper — Issue #876: The History of Tea instruction consistency & review detail`:
     - Case 1 (pre-0085 fallback, không `groups`, `mode="take"` và `mode="review"`): `detail.intro` chứa cả hướng dẫn Q1–7 (`Complete the sentences below with words taken from Reading Passage 1. Use ONE WORD for each answer.`) lẫn Q8–13 (`Do the following statements agree...\nWrite\nTRUE...\nFALSE...\nNOT GIVEN...`), `parts` xây từ `buildQuizParts(questions, "sent", detail.intro)` gồm `sent` (Q1–7) và `tfng` (Q8–13). Assert:
       - Section `Questions 1–7` chứa `"Use ONE WORD for each answer."` và tuyệt đối KHÔNG chứa `"NO MORE THAN THREE WORDS"`, KHÔNG chứa `"TRUE if the statement"`.
       - Section `Questions 8–13` chứa `"Do the following statements agree"` và `"TRUE if the statement"`, tuyệt đối KHÔNG chứa `"Use ONE WORD"`.
       - Không còn `introPreamble` lẫn ở đầu `<article>`.
     - Case 2 (post-0087 có `groups`, `mode="review"`): `parts` từ `buildQuizPartsFromGroups` với `instructionHtml` riêng từng nhóm và `detail.intro` vẫn mang bản flatten từ `flattenLibraryTestPart` (gồm cả `<table>` của Group 1 và plain-text TFNG của Group 2). Assert không lặp hướng dẫn ở đầu trang, Q1–7 chỉ hiện hướng dẫn `Use ONE WORD` (kèm inline slots), Q8–13 chỉ hiện hướng dẫn TFNG.
     - Case 3 (chống rò rỉ `contextIntro` giữa `>= 2` nhóm completion):
       - 3a: Part 1 (`sent`, đã tiêu thụ `Use ONE WORD`) + Part 2 (`notes`, không có instruction riêng) → Part 2 giữ nguyên fallback, KHÔNG bị nhiễm `ONE WORD`.
       - 3b: Part 1 (`shortans`) + Part 2 (`summary`) cùng không khớp keyword với `detail.intro` chứa hai word limit khác nhau (`ONE WORD ONLY` và `ONE WORD AND/OR A NUMBER`) → Part 2 KHÔNG bị ghi đè nhầm bằng `ONE WORD ONLY` của Part 1.
- **Success criteria:** Case 1 và 3b thất bại trước khi sửa `quiz-paper.tsx`.
- **Verify:** `pnpm --filter @teacher-os/ui exec vitest run src/components/quiz/quiz-paper.test.tsx` exits non-zero with assertion failure on Issue #876 tests (passing test is a failure).

### Task 3.2 — Cập nhật `QuizPaper` wiring (Green phase)
- **Goal:** Áp dụng chỉnh sửa gọn trong `packages/ui/src/components/quiz/quiz-paper.tsx`, giữ nguyên memoization và sạch cảnh báo Biome `useExhaustiveDependencies`.
- **Target files and symbols:** `packages/ui/src/components/quiz/quiz-paper.tsx` (`QuizPaper`)
- **Steps:**
  1. Khai báo hằng số mức module `const EMPTY_MATCHED_INSTRUCTIONS: ReadonlyMap<string, string> = new Map();`.
  2. Trích `const hasIntroSplit = introSplit !== null;` (boolean nguyên thủy) trước `useMemo`.
  3. Tại `useMemo` dòng ~521–530: đổi điều kiện bỏ qua thành `if (!hasGroupSource && (hasIntroSplit || parts.length <= 1))` trả về `{ cleanedPreamble: rawIntroPreamble, matchedInstructionsByPartId: EMPTY_MATCHED_INSTRUCTIONS }`, và cập nhật deps thành `[hasGroupSource, hasIntroSplit, rawIntroPreamble, parts]`.
  4. Tại `parsedInlineByPartId` (`useMemo` dòng ~560–613): thêm `matchedInstructionsByPartId` vào deps và ưu tiên `part.instructionHtml` (khi không rỗng) → `matchedInstructionsByPartId.get(part.id)` → `hasIntroCandidate ? introPreamble : ""`.
  5. Tính `const completionPartCount = parts.filter((part) => part.typeId in COMPLETION_TYPE_REGEX).length;` và tại dòng ~841–850 (`resolvePartInstruction`): truyền `contextIntro: parts.length <= 1 ? detail.intro : hasIntroSplit || completionPartCount === 1 ? introPreamble : undefined` để chặn triệt để rò rỉ giới hạn từ giữa `>= 2` nhóm completion.
  6. Kiểm tra `hasOwnInstruction` chỉ bật với `matchedInstruction` khi `matchedInstruction` không rỗng sau `isEffectivelyEmptyInstruction` (chặn block `<style>`/`<script>` ẩn làm trống header).
- **Success criteria:** Toàn bộ tests trong `packages/ui` và `apps/student/test/quiz-paper.test.tsx` (bao gồm `RT11`, đề 1 type, đề trộn có ghi chú tiếng Việt) pass 100%.
- **Verify:** `pnpm --filter @teacher-os/ui exec vitest run src/components/quiz/quiz-paper.test.tsx src/lib/quiz-instruction.test.ts && pnpm --filter student exec vitest run test/quiz-paper.test.tsx` exits 0 and reports all tests passed.

### Task 3.3 — Chạy toàn bộ Verification Gates (Lint, Typecheck, Tests)
- **Goal:** Xác minh không có lỗi format/lint, lỗi TypeScript hay regression trên các package bị ảnh hưởng.
- **Target files and symbols:** Toàn bộ workspace bị chạm (`packages/db`, `packages/api`, `packages/ui`, `apps/student`, `apps/server`, `apps/web`).
- **Steps:**
  1. Chạy `pnpm exec biome check .`.
  2. Chạy `pnpm check-types`.
  3. Chạy unit/integration test suites liên quan của `@teacher-os/api`, `@teacher-os/ui`, `student`, `server` (bao gồm migration tests, `study-pack-clone.test.ts`, `student-practice-library-sync.test.ts`, `student-practice.test.ts`, `student-quiz.test.ts`).
- **Success criteria:** Tất cả lệnh thoát với mã 0 và 0 lỗi.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm --filter @teacher-os/ui test && pnpm --filter @teacher-os/api test && pnpm --filter student test && pnpm --filter server exec vitest run src/assignment-prompt-groups-backfill-migration.test.ts src/study-pack-migration.test.ts src/lib/study-pack-clone.test.ts src/routes/student-practice-library-sync.test.ts src/routes/student-practice.test.ts src/routes/student-quiz.test.ts` exits 0.

## Verification
- `pnpm exec biome check . && pnpm check-types`
- Full relevant unit/integration test suites across `@teacher-os/ui`, `@teacher-os/api`, `student`, `server`.

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
