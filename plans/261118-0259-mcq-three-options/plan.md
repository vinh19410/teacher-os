---
title: "MCQ 3 or 4 options support"
description: "Allow mcq questions to choose between 3 options (A–C) and 4 options (A–D) across contracts, server validation, editor UI, web test builder, and student quiz rendering."
status: completed
priority: P1
effort: "3h"
branch: vinh19410/afanc
tags: [feature, frontend, api]
blockedBy: []
blocks: []
created: 2026-11-18
---

# MCQ 3 or 4 Options Support

## Overview

Cho phép dạng bài `mcq` (Multiple choice — One answer) tùy chọn 3 lựa chọn (`A, B, C`) hoặc 4 lựa chọn (`A, B, C, D`, mặc định 4) trên từng câu thay vì cố định 4 lựa chọn như hiện tại. Thay đổi áp dụng đồng bộ cho `packages/api` (contract validation), `apps/server` (routes/assignments), `packages/ui` (`AnswerKeyGrid`, `QuestionKeyEditor`, `BulkKeyPaste`, `questionSummary`, `QuizPaper`), `apps/admin` (`part-issues.ts`, `group-card.tsx`), `apps/web` (`test-answer-key.ts`, `test-builder-shell.tsx`, `assignments/new.tsx`), và kiểm thử qua unit test + E2E + smoke test đề số 1.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Chuẩn hóa xác thực đáp án và biên độ `opts` của MCQ (`A–C` khi 3 lựa chọn, `A–D` khi 4 lựa chọn hoặc `opts` null/rỗng; đồng bộ bản nháp và bản xuất bản) | P1 |
| 2 | Thêm tùy chọn chuyển nhanh `3 lựa chọn` / `4 lựa chọn` trực tiếp trên từng câu `mcq` trong `AnswerKeyGrid` (mặc định 4, đồng bộ chip đáp án, phím tắt, `BulkKeyPaste`, `questionSummary`, `apps/web` save-gate/soát đáp án, và kế thừa số lựa chọn khi thêm câu) | P1 |
| 3 | Hiển thị đúng instruction/radio 3 lựa chọn trên `QuizPaper` (không lộ phương án `D` trống) và bảo đảm mọi unit test + typecheck + lint + E2E pass | P1 |

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Phase 1: Contracts and Server Validation](./phase-01-start.md) | Pending |
| 2 | [Phase 2: UI Editor and Verification](./phase-02-ui-editor-and-verification.md) | Pending |

## Dependencies

- `packages/api/src/contracts.ts` (`ASSIGNMENT_ANSWER_CHOICES`, `answerKindByType`, `assignmentPromptCreateSchema`, `assignmentPromptUpdateSchema`, `libraryExerciseBaseSchema`)
- `packages/api/src/library-contracts.ts` (`libraryPartUpsertSchema`, `partIssues`, `validatePartForReady`)
- `apps/server/src/routes/assignments/index.ts`
- `packages/ui/src/components/assignments/editor/*` (`answer-key-grid.tsx`, `question-key-editor.tsx`, `bulk-key-paste.ts`, `question-summary.ts`)
- `packages/ui/src/components/quiz/quiz-paper.tsx`
- `apps/admin/src/components/library/part-issues.ts`, `group-card.tsx`
- `apps/web/src/lib/test-answer-key.ts`, `apps/web/src/components/assignment-tests/test-builder-shell.tsx`, `apps/web/src/routes/_auth/assignments/new.tsx`

## Success Criteria

- [x] Câu `mcq` mặc định vẫn khởi tạo 4 lựa chọn (`A–D`), giữ 100% tương thích ngược với đề cũ và test hiện tại.
- [x] Người dùng có thể chuyển từng câu `mcq` sang `3 lựa chọn` (`A–C`) hoặc `4 lựa chọn` (`A–D`); khi thu về 3 lựa chọn thì xóa lựa chọn D khỏi `opts` và reset đáp án nếu đang là `"D"`.
- [x] Thêm câu mới (`Thêm câu` / Enter) khi câu `mcq` trước đó đang ở chế độ 3 lựa chọn sẽ kế thừa 3 lựa chọn.
- [x] `BulkKeyPaste`, phím tắt bàn phím (`a–c` vs `a–d`, nút `3 lựa chọn`/`4 lựa chọn` không bị `Enter` cướp thao tác), `questionRowError`, `questionSummary`, `contracts.ts`, `library-contracts.ts`, `assignments/index.ts`, `apps/web`, và `QuizPaper` đều tôn trọng số lựa chọn thực tế của `mcq`.
- [x] `pnpm check`, `pnpm check-types`, unit tests của `packages/api`, `packages/ui`, `apps/admin`, `apps/web`, `apps/server`, và E2E `admin-library-reading.spec.ts` đều pass.

## Validation Log

### Session — 2026-11-18
- **User decisions confirmed (via `ask_question`):**
  1. Chỉnh trực tiếp trên dạng `mcq` (giữ 1 dạng bài, cho phép chọn 3 hoặc 4 lựa chọn trên từng câu; áp dụng chung cho `AnswerKeyGrid` ở cả Admin và Web).
  2. Chuyển nhanh `3 lựa chọn` hoặc `4 lựa chọn` (mặc định 4 lựa chọn; tự đồng bộ chip đáp án `A–C` hoặc `A–D`).
- **Verification Results:**
  - **Tier:** Light (Fact Checker)
  - **Claims checked:** 14 | **Verified:** 14 | **Failed:** 0 | **Unverified:** 0

## Red Team Review

### Session — 2026-11-18
**Findings:** 7 unique (6 from Security Adversary, 6 from Assumption Destroyer — deduplicated across overlapping scope)
**Severity breakdown:** 1 Critical, 4 High, 2 Medium (all accepted and applied inline)

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | `effectiveAnswerChoices` / `opts` length bounds (2–4 cho `mcq`, giữ tương thích `opts: null` & `""` trong E2E) | Critical | Accept (refined) | Phase 1 |
| 2 | `libraryPartUpsertSchema` draft-save parity + `partIssues` `opts` null/rỗng + `FIELD_LABELS.answer` + `GroupCard` `questionsTabError` | High | Accept | Phase 1 |
| 3 | `apps/web` `test-answer-key.ts` / `test-builder-shell.tsx` / `assignments/new.tsx` save-gate & soát đáp án | Critical | Accept | Plan, Phase 2 |
| 4 | `BulkKeyPaste` bỏ qua `item.type` từng câu & thông báo lỗi `rowChoices` | High | Accept | Phase 2 |
| 5 | `AnswerKeyGrid` `Enter` trên button cướp `onAddQuestion` & `opts: []` / `>4` gây `"Lựa chọn undefined"` / `"0 lựa chọn"` | High | Accept | Phase 2 |
| 6 | `QuizPaper` instruction khi trộn câu 3 và 4 lựa chọn trong cùng part | Medium | Accept | Phase 2 |
| 7 | Lệnh verify sửa `part-form.test.tsx` (không tồn tại `part-issues.test`) & phân biệt `pnpm check` vs `pnpm check:fix` | Medium | Accept | Phase 1, Phase 2 |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-ui-editor-and-verification.md`
- Decision deltas checked: 7
- Reconciled stale references: 0
- Unresolved contradictions: 0

<!-- slug: mcq-three-options -->
