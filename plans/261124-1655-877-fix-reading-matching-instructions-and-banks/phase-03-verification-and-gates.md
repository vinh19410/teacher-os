---
phase: 3
title: "Phase 3: Full Verification Gates & Regression Audit"
status: completed
priority: P1
effort: "25m"
dependencies: [1, 2]
---

# Phase 3: Full Verification Gates & Regression Audit

<!-- Updated: Red-Team Review 2026-11-24 - Extended dataset sanity check to verify 0 mis-slices AND 0 false isBankScoped across all 76 multi-bank Reading tests plus Listening multi-bank tests -->

## Goal
Xác minh toàn bộ bộ công cụ chất lượng (lint/format read-only, typecheck toàn monorepo, kiểm tra sanity trên toàn bộ bộ dữ liệu Reading/Listening thật, và các unit/integration test suites của mọi workspace tiêu thụ `QuizPaper`) đều xanh 100% trước khi chuyển sang bước code review và ship beta.

## Files to Create / Modify
- Verify only (không tạo/sửa file mới trừ khi khắc phục hồi quy phát hiện trong phạm vi khóa).

## Tasks & Steps

### Task 3.1 — Chạy kiểm tra Lint & Typecheck toàn monorepo
- **Goal:** Đảm bảo không phát sinh lỗi format, lint Biome (kể cả `useExhaustiveDependencies`), hay lỗi kiểu TypeScript (`TS4104`, v.v.) trên 15 packages.
- **Target files and symbols:** `packages/ui/src/lib/quiz-instruction.ts`, `packages/ui/src/lib/quiz-instruction.test.ts`, `packages/ui/src/components/quiz/quiz-paper.tsx`, `packages/ui/src/components/quiz/quiz-paper.test.tsx`.
- **Steps:**
  1. Chạy `pnpm exec biome check .` (read-only gate; nếu có lỗi format thì chạy `pnpm check` và kiểm tra diff).
  2. Chạy `pnpm check-types`.
- **Success criteria:** Cả 2 lệnh thoát mã 0 với 0 lỗi.
- **Verify:** `pnpm exec biome check . && pnpm check-types` exits 0 with 0 errors.

### Task 3.2 — Chạy toàn bộ test suites liên quan qua các workspace tiêu thụ `QuizPaper` + Dataset Sanity
- **Goal:** Xác minh không có hồi quy trên `@teacher-os/ui`, `@teacher-os/api`, `student`, `web` (`PreviewQuizSimulation`), `admin` (`TestPreviewOverlay`), và chứng minh 0 ca cắt/gán sai trên 76 đề Reading multi-bank + các đề Listening multi-bank.
- **Target files and symbols:**
  - `packages/ui` (full test suite)
  - `packages/api` (full test suite)
  - `apps/student/test/quiz-paper.test.tsx`, `apps/student/test/quiz-review-item.test.tsx`, `apps/student/test/quiz-parts.test.ts`
  - `apps/web/src/components/assignments/preview-quiz-simulation.test.tsx`
  - `apps/admin/src/components/library/test-preview-overlay.test.tsx`
- **Steps:**
  1. Chạy full test suite của `@teacher-os/ui` và `@teacher-os/api`.
  2. Chạy bộ test quiz của `student`, `web` (`preview-quiz-simulation.test.tsx`), và `admin` (`test-preview-overlay.test.tsx`).
  3. Chạy kiểm chứng tự động trên 351 đề Reading (`docs/reading-ielts/reading-practice/*.json`) và bộ Listening (`docs/listening_ielts/*.json`) mô phỏng đường fallback `!hasGroupSource` (`flattenLibraryTestPart` + `buildQuizParts`): xác nhận **0 ca cắt sai bank** và **0 ca `isBankScoped === true` trên bank đang trộn**.
- **Success criteria:** Tất cả test suites pass 100% (0 failed) và dataset sanity đạt 0 mis-slices / 0 false `isBankScoped`.
- **Verify:** `pnpm --filter @teacher-os/ui test && pnpm --filter @teacher-os/api test && pnpm --filter student exec vitest run test/quiz-paper.test.tsx test/quiz-review-item.test.tsx test/quiz-parts.test.ts && pnpm --filter web exec vitest run src/components/assignments/preview-quiz-simulation.test.tsx && pnpm --filter admin exec vitest run src/components/library/test-preview-overlay.test.tsx` exits 0.

## Verification
- `pnpm exec biome check . && pnpm check-types`
- Full relevant test suites across `@teacher-os/ui`, `@teacher-os/api`, `student`, `web`, `admin`.
- Dataset sanity check across 351 Reading + Listening files.

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
