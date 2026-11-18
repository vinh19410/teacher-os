---
phase: 1
title: "Phase 1: Contracts and Server Validation"
status: todo
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Contracts and Server Validation

## Goal

Cập nhật validation phía contract (`packages/api`) và route server (`apps/server`) sao cho câu `mcq` (và `mcq1`/`mcq3`) có `opts` 2–4 phần tử chỉ chấp nhận đáp án hợp lệ trong phạm vi `opts` (vd `A–C` khi 3 lựa chọn), giữ nguyên hành vi fallback `A–D` khi `opts` là `null`/rỗng/4 phần tử, đồng bộ giữa bản nháp (`draft`) và bản xuất bản (`ready`).

<!-- Applied: Red-Team Finding 1, 2 (Security Adversary + Assumption Destroyer) -->

## Files to Create / Modify

- Modify: `packages/api/src/contracts.ts` — thêm helper thuần `effectiveAnswerChoices(kind, opts)` dùng chung cho các schema và kiểm tra số phần tử `opts` của `mcq4`/`mcq3` (2–4 cho `mcq4`, 2–3 cho `mcq3` khi `opts` có phần tử).
- Modify: `packages/api/src/library-contracts.ts` — đồng bộ kiểm tra đáp án + biên độ `opts` cho `mcq`/`mcq1`/`mcq3` trong cả `libraryPartUpsertSchema` (lưu nháp) và `partIssues` (ready/xuất bản).
- Modify: `apps/server/src/routes/assignments/index.ts` — dùng `effectiveAnswerChoices(kind, question.opts)` khi validate `PATCH /assignments/prompts/:id`.
- Modify: `apps/admin/src/components/library/part-issues.ts` — ánh xạ message lỗi mới và bổ sung `answer: "Đáp án"` vào `FIELD_LABELS`.
- Modify: `apps/admin/src/components/library/group-card.tsx` — cập nhật `questionsTabError` để cũng bật dấu lỗi trên tab "Câu hỏi" khi có đáp án MCQ nằm ngoài `effectiveAnswerChoices`.
- Modify: `packages/api/src/assignment-question-schema.test.ts` — bổ sung test cho 3-choice `mcq` hợp lệ và reject `"D"` khi `opts` có 3 phần tử hoặc `opts` vượt quá 4 phần tử / chỉ 1 phần tử.
- Modify: `packages/api/src/library-contracts.test.ts` — bổ sung test cho `libraryPartUpsertSchema` (nháp) và `validatePartForReady` (ready) cho `mcq` 3 lựa chọn (`A–C` pass, `"D"` bị reject, `opts` rỗng/null vẫn giữ tương thích).

## Tests Before

1. Trong `packages/api/src/assignment-question-schema.test.ts`: viết test cho `assignmentPromptCreateSchema`, `assignmentPromptUpdateSchema` và `libraryExerciseCreateSchema` với `type: "mcq"`:
   - `opts: ["Opt A", "Opt B", "Opt C"]`, `answer: "C"` → pass.
   - `opts: ["Opt A", "Opt B", "Opt C"]`, `answer: "D"` → fail (`invalid answer choice`).
   - `opts: ["Only 1"]`, `answer: "A"` → fail (MCQ cần 2–4 lựa chọn khi đã khai `opts`).
   - `opts: ["1", "2", "3", "4", "5"]`, `answer: "A"` → fail (vượt quá 4 lựa chọn).
   - `opts: null`, `answer: "D"` → pass (tương thích ngược).
   - `opts: ["", "", "", ""]`, `answer: "A"` → pass (tương thích ngược E2E tạo nhanh không điền text lựa chọn).
2. Trong `packages/api/src/library-contracts.test.ts`: viết test cho `libraryPartUpsertSchema` và `validatePartForReady("reading", ...)`:
   - `mcq` với `opts: ["A", "B", "C"]` và `answer: "C"` → không có issue.
   - `mcq` với `opts: ["A", "B", "C"]` và `answer: "D"` → bị chặn ở cả draft (`libraryPartUpsertSchema`) và ready (`validatePartForReady`).

## Implementation Steps (Refactor & Behavior)

1. Trong `packages/api/src/contracts.ts`:
   - Export helper `effectiveAnswerChoices(kind: keyof typeof ASSIGNMENT_ANSWER_CHOICES, opts?: readonly string[] | null): readonly string[]`:
     - Nếu `(kind === "mcq4" || kind === "mcq3") && opts && opts.length > 0`: trả về `ASSIGNMENT_ANSWER_CHOICES[kind].slice(0, opts.length)` (tự động cap theo độ dài tối đa của `ASSIGNMENT_ANSWER_CHOICES[kind]`).
     - Ngược lại trả về `ASSIGNMENT_ANSWER_CHOICES[kind]`.
   - Export helper `mcqOptionsIssue(kind: keyof typeof ASSIGNMENT_ANSWER_CHOICES, opts?: readonly string[] | null): string | null`:
     - Nếu `(kind === "mcq4" || kind === "mcq3") && opts && opts.length > 0`: kiểm tra `opts.length >= 2 && opts.length <= ASSIGNMENT_ANSWER_CHOICES[kind].length` (2–4 cho `mcq4`, 2–3 cho `mcq3`). Không đạt → trả về `"mcq options must have 2–4 items"` (hoặc `"mcq3 options must have 2–3 items"`).
   - Cập nhật 3 chỗ `.superRefine` trong `packages/api/src/contracts.ts` (`assignmentPromptCreateSchema`, `assignmentPromptUpdateSchema`, `libraryExerciseBaseSchema`) để kiểm tra cả `mcqOptionsIssue` và `effectiveAnswerChoices(kind, question.opts)`.
2. Trong `packages/api/src/library-contracts.ts`:
   - Tách helper `validateMcqQuestion(question, effectiveType)` kiểm tra `mcqOptionsIssue(kind, question.opts)` và `effectiveAnswerChoices(kind, question.opts)` khi `question.answer.trim()` khác rỗng.
   - Gọi helper này trong cả `libraryPartUpsertSchema.superRefine` (bảo đảm nháp cũng không lưu sai đáp án/số lựa chọn) lẫn `partIssues` (kể cả khi `question.opts` null/rỗng!).
3. Trong `apps/server/src/routes/assignments/index.ts`:
   - Tại dòng ~278, dùng `mcqOptionsIssue(kind, question.opts)` và `effectiveAnswerChoices(kind, question.opts)`.
4. Trong `apps/admin/src/components/library/part-issues.ts` và `group-card.tsx`:
   - Thêm ánh xạ message mới (`mcq answer must be within opts`, `mcq options must have`) và thêm `answer: "Đáp án"` vào `FIELD_LABELS`.
   - Cập nhật `questionsTabError` trong `group-card.tsx` để phát hiện `item.answer` không thuộc `effectiveAnswerChoices(kind, item.opts)`.

## Tests After & Verification

- `pnpm --filter @teacher-os/api test`
- `pnpm --filter server test`
- `pnpm --filter admin test -- src/components/library/part-form.test.tsx src/components/library/group-card.test.tsx`
- `pnpm check-types`

## Todo

- [x] Viết test thất bại trước trong `assignment-question-schema.test.ts` và `library-contracts.test.ts`
- [x] Thêm `effectiveAnswerChoices` / `mcqOptionsIssue` và cập nhật `contracts.ts`, `library-contracts.ts`, `assignments/index.ts`, `part-issues.ts`, `group-card.tsx`
- [x] Chạy test và typecheck xác nhận Phase 1 xanh hoàn toàn
