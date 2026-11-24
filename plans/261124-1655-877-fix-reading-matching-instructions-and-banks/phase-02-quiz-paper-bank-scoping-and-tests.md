---
phase: 2
title: "Phase 2: QuizPaper Bank Scoping Wiring & Integration Tests"
status: completed
priority: P1
effort: "45m"
dependencies: [1]
---

# Phase 2: `QuizPaper` Bank Scoping Wiring & Integration Tests

<!-- Updated: Red-Team Review 2026-11-24 - Switched to unified scopeFlattenedOptionBank({ skill, introPreamble }) returning { partitioned: ReadonlyMap<string, string[]> | null, isBankScoped }, unified isPositionalOnlyBank with isPositionalSectionBank for "letter", preserved #875 guard on mixed source:"intro" parts and RT2 length>0 guard on OptionBankList, replaced phantom [data-testid='option-bank-list'] with real DOM assertions, and upgraded Case 5 memoization test to vi.spyOn call-count assertion -->

## Goal
Nối `scopeFlattenedOptionBank`, `isPositionalSectionBank`, `effectivePartBank` và `isBankScoped` vào `packages/ui/src/components/quiz/quiz-paper.tsx` (bảo toàn memoization theo từng keystroke, guard `#875`, guard RT2 và tương thích ngược `map` pin / `RT11`), đồng thời bổ sung integration tests DOM thực tế cho **Neanderthal Technology**, **Bovids**, các ca fail-closed và memoization trong `packages/ui/src/components/quiz/quiz-paper.test.tsx`.

## Files to Create / Modify
- Modify: `packages/ui/src/components/quiz/quiz-paper.tsx`
- Modify: `packages/ui/src/components/quiz/quiz-paper.test.tsx`

## Tasks & Steps

### Task 2.1 — Viết TDD integration tests cho Issue #877 trong `QuizPaper` (Red phase)
- **Goal:** Tái hiện đầy đủ các ca lỗi của **Neanderthal Technology** và **Bovids** (cả Take lẫn Review, cả `hasGroupSource === true` lẫn `!hasGroupSource`, có và không có `body_html` inline) cộng với các ca fail-closed, `Paragraph A..H`, guard `#875` trên `source: "intro"`, và memoization bằng `vi.spyOn`.
- **Target files and symbols:** `packages/ui/src/components/quiz/quiz-paper.test.tsx`
- **Steps:**
  1. Thêm helper nội bộ trong test để kiểm tra DOM thực tế (TUYỆT ĐỐI không dùng selector giả `[data-testid='option-bank-list']` vì `OptionBankList` không có `data-testid`): kiểm tra mọi phần tử con trực tiếp `article > div` không chứa `<section>` đều không chứa `"Ngân hàng lựa chọn"` và không có `<ol>`, và đọc trực tiếp `<ol> li` bên trong từng `<section>`.
  2. Thêm suite `QuizPaper — Issue #877: Neanderthal Technology & Bovids matching instructions and option banks`:
     - **Case 1 — Neanderthal Technology (fallback `!hasGroupSource`, cả `mode="take"` và `mode="review"`, bản plain-text và bản có `body_html` inline ở Q6–10 + Q11–13):**
       - `detail.optionBank` = 6 headings + 5 places (11 mục); `detail.intro` = flattened instructions từ `Collection-neanderthal-technology.json`; `parts = buildQuizParts(questions, "headings", detail.intro)`.
       - Assert:
         - Không có top-level `"Ngân hàng lựa chọn"` ở cấp `<article>` trực tiếp, không có `introPreamble` lẫn.
         - Section `Questions 1–5` (`headings`): `<ol> li` đúng 6 mục `i–vi` (có `"Evidence of outdoor dwellings"`, `"A vital source of power"`, KHÔNG có `"The Périgord region"` hay `"Krapina"`), radio pills đúng 6 mục `i–vi` (không `vii`..`xi`), hướng dẫn ghi `i-vi` (tuyệt đối KHÔNG có `i–viii`).
         - Section `Questions 6–10` (`info`): `<ol> li` đúng 5 địa danh `A–E` (`A The Périgord region` .. `E Krapina`), choices đúng 5 mục `A–E` (không `F`..`K`), hướng dẫn về địa danh `A-E` (tuyệt đối KHÔNG có `"Which section"` hay `"A–H"`).
         - Section `Questions 11–13` (`summary`): ô nhập chữ (không có radio `A–K`), hướng dẫn `"NO MORE THAN TWO WORDS"` (không `"ONE WORD ONLY"`).
         - Section `Questions 14` (`mcq`): giữ đủ 4 lựa chọn `A–D`.
     - **Case 2 — Neanderthal Technology (`hasGroupSource === true`, kể cả khi `instructionHtml: ""` trống trên nhóm `headings` và `info`):**
       - Q1–5 rơi về fallback động `i–vi` (không `i–viii`), chỉ hiện 6 headings `i–vi`.
       - Q6–10 rơi về fallback danh sách có tên `A–E` (không `"Which section… A–H"`), chỉ hiện 5 địa danh `A–E`.
     - **Case 3 — Bovids (cả `hasGroupSource === true` có/trống `instructionHtml`, lẫn fallback `!hasGroupSource`, cả `mode="take"` và `mode="review"`):**
       - `mcq` (Q1–3) + `info` (Q4–8, 4 sub-families `Antelope`, `Bovinae`, `Caprinae`, `Cephalophinae`) + `fill_blank` (Q9–13).
       - Assert:
         - Không có top-level `"Ngân hàng lựa chọn"` trước `Questions 1–3`; hộp `"Ngân hàng lựa chọn"` với đúng 4 `<li>` `A–D` nằm bên trong section `Questions 4–8`.
         - Section `Questions 4–8` tuyệt đối KHÔNG chứa `"Which section"` hay `"A–H"`, lựa chọn đúng `A–D`.
         - Section `Questions 9–13` chứa `"Answer the questions below."` và `"NO MORE THAN THREE WORDS"`, `introPreamble` sạch.
     - **Case 4 — Unpartitionable multi-bank & positional `"Paragraph A..F"` & guard `#875` trên `source: "intro"`:**
       - 4a: `!hasGroupSource` `headings` + `match_names` thiếu range (không tách được) → giữ top-level `"Ngân hàng lựa chọn"`, fallback instruction trung tính (KHÔNG chứa `i–viii`, `i–xi`, `A–H`, `A–K`).
       - 4b: `info` với `optionBank: ["Paragraph A", "Paragraph B", "Paragraph C", "Paragraph D"]` và `instructionHtml: ""` → ẩn hộp `"Ngân hàng lựa chọn"` thừa và hiển thị `"Which section contains the following information? Write the correct letter A–D."`.
       - 4c: Part `source: "intro"` trộn `headings` + `summary` trong cùng section 1 + `mcq` ở section 2 → câu `summary` trong section 1 vẫn là ô nhập chữ (không bị biến thành radio `A–F`).
     - **Case 5 — Memoization thật theo keystroke bằng `vi.mock(..., { spy: true })` (Vitest 4 ESM-safe):**
       - Bọc module `@teacher-os/ui/lib/quiz-instruction` bằng `vi.mock("@teacher-os/ui/lib/quiz-instruction", { spy: true })` (giữ nguyên 100% implementation thật), gọi `vi.clearAllMocks()` trước Case 5, render `QuizPaper` với mảng `parts` ổn định (như `QuizTakeView` / `AttemptDetailScreen`), rerender 3 lần với `answers` và `currentQuestion` đổi → assert cả `scopeFlattenedOptionBank` và `deduplicateGroupIntroPreamble` đều chỉ được gọi đúng **1 lần**.
- **Success criteria:** Các test mới cho Case 1–5 thất bại (Red) trước khi sửa `quiz-paper.tsx`.
- **Verify:** `pnpm --filter @teacher-os/ui exec vitest run src/components/quiz/quiz-paper.test.tsx` exits non-zero with assertion failures on Issue #877 tests (passing test is a failure).

### Task 2.2 — Cập nhật `QuizPaper` wiring (Green phase)
- **Goal:** Nối `scopeFlattenedOptionBank` và `isPositionalSectionBank` vào `packages/ui/src/components/quiz/quiz-paper.tsx`, đảm bảo nhất quán kiểu dữ liệu (`string[]`), guard RT2, guard `#875`, và memoization.
- **Target files and symbols:** `packages/ui/src/components/quiz/quiz-paper.tsx` (`isPositionalOnlyBank`, `QuizPaper`)
- **Steps:**
  1. Import `isPositionalSectionBank` và `scopeFlattenedOptionBank` từ `@teacher-os/ui/lib/quiz-instruction`.
  2. Cập nhật `isPositionalOnlyBank(bank, kind)` tại `quiz-paper.tsx:74-86`: với `kind === "letter"`, trả `isPositionalSectionBank(bank)` (giữ nhánh `kind === "roman"` như cũ) để đồng bộ hoàn toàn giữa ẩn hộp bank thừa và fallback instruction trên `"Paragraph A..H"` / `"Section A..H"`.
  3. Tính `scopedBankResult` trong `useMemo`:
     ```ts
     const scopedBankResult = useMemo(() => {
       if (hasGroupSource) {
         return { partitioned: null, isBankScoped: true };
       }
       return scopeFlattenedOptionBank(
         parts,
         detail.optionBank,
         matchedInstructionsByPartId,
         { skill, introPreamble },
       );
     }, [hasGroupSource, parts, detail.optionBank, matchedInstructionsByPartId, skill, introPreamble]);
     const partitionedBanks = scopedBankResult.partitioned;
     const hasPartitionedBanks = partitionedBanks !== null;
     const isBankScoped = scopedBankResult.isBankScoped;
     ```
  4. Cập nhật `showDetailBank`:
     ```ts
     const showDetailBank =
       !hasGroupSource &&
       !hasPartitionedBanks &&
       bankKind !== undefined &&
       !isPositionalOnlyBank(detail.optionBank, bankKind);
     ```
  5. Trong vòng lặp `choiceRowsByQ` / `optionBankByQ` (dòng ~653–686):
     - Tính cho từng part `const partHasRequiredBankQuestion = part.questions.some((q) => REQUIRED_BANK_SET.has(q.type ?? (part.source === "group" ? part.typeId : typeId)));` (tái dùng cùng danh sách required-bank).
     - Với từng câu trong part:
       - Nếu `part.source === "group"`: `part.optionBank ?? []`.
       - Else nếu `hasPartitionedBanks`: `part.optionBank ?? (isQOptionalBank && partHasRequiredBankQuestion ? [] : (partitionedBanks.get(part.id) ?? []))` (bảo toàn tuyệt đối guard `#875` cho `source: "intro"` trộn dạng!).
       - Else: giữ nguyên `part.optionBank ?? (isQOptionalBank && hasRequiredBankQuestion ? [] : detail.optionBank)`.
  6. Trong vòng `parts.map((part) => ...)` (dòng ~843–956):
     - `const partScopedBank = hasPartitionedBanks ? (partitionedBanks.get(part.id) ?? []) : undefined;`
     - `effectivePartBank`: `part.source === "group" ? (part.optionBank ?? []) : partScopedBank !== undefined ? partScopedBank : (part.optionBank ?? (isPartOptionalBank && hasRequiredBankQuestion ? [] : detail.optionBank))`.
     - Truyền `isBankScoped` vào `resolvePartInstruction(..., { partBank: effectivePartBank, isBankScoped, matchedInstruction, contextIntro: ... })`.
     - `const partBankToRender: string[] | undefined = part.source === "group" ? (part.optionBank ?? []) : partScopedBank !== undefined ? partScopedBank : part.optionBank;`
     - Giữ CHẶT guard RT2 `.length`: `const partBankKind = partBankToRender && partBankToRender.length > 0 ? libraryOptionBankKindFor(skill, part.typeId, part.questions.map((question) => question.type), partBankToRender) : undefined;`
     - `const showPartBank = partBankKind !== undefined && partBankToRender !== undefined && partBankToRender.length > 0 && !isPositionalOnlyBank(partBankToRender, partBankKind);`
     - Truyền `bank={partBankToRender ?? []}` (kiểu `string[]`) vào `<OptionBankList />`.
- **Success criteria:** Toàn bộ tests trong `packages/ui/src/components/quiz/quiz-paper.test.tsx`, `packages/ui/src/lib/quiz-instruction.test.ts`, và `apps/student/test/quiz-paper.test.tsx` + `quiz-review-item.test.tsx` pass 100%.
- **Verify:** `pnpm --filter @teacher-os/ui exec vitest run src/components/quiz/quiz-paper.test.tsx src/lib/quiz-instruction.test.ts && pnpm --filter student exec vitest run test/quiz-paper.test.tsx test/quiz-review-item.test.tsx` exits 0 and reports all tests passed.

## Verification
- `pnpm --filter @teacher-os/ui exec vitest run src/components/quiz/quiz-paper.test.tsx src/lib/quiz-instruction.test.ts`
- `pnpm --filter student exec vitest run test/quiz-paper.test.tsx test/quiz-review-item.test.tsx`

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
