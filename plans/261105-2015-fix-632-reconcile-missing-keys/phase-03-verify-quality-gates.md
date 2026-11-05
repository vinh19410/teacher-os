---
phase: 3
title: "Kiểm thử hồi quy toàn diện và Quality Gates"
status: ready
priority: P1
effort: "15m"
dependencies: ["phase-01-canonical-json-and-unit-tests.md", "phase-02-new-submit-reconcile-tests.md"]
---

# Phase 3: Kiểm thử hồi quy toàn diện và Quality Gates

## Goal

Chạy toàn bộ các gate kiểm tra chất lượng (code style, lint, format, typecheck, unit tests và các test suites liên quan) để đảm bảo không có bất kỳ hồi quy nào trên codebase trước khi mở PR.

## Target files and symbols

- Toàn bộ repo (`pnpm check`, `pnpm check-types`, `pnpm --filter web test`).

## Tasks & Steps

### Task 3.1 — Kiểm tra Typecheck và Biome linter
- **Goal**: Mã nguồn đạt tiêu chuẩn type safety và lint format sạch sẽ.
- **Target files and symbols**: Toàn bộ dự án.
- **Steps**:
  1. Chạy `pnpm check` (nếu có lỗi format do file mới thì chạy `pnpm exec biome check --write` trên các file đã sửa).
  2. Chạy `pnpm check-types` qua turbo.
- **Success criteria**: Không có lỗi lint mới, typecheck qua 100% không có lỗi.
- **Verify**: `pnpm check && pnpm check-types` thoát 0, 0 failed.

### Task 3.2 — Chạy các bộ test liên quan đến assignments và builder
- **Goal**: Kiểm tra các luồng liên quan đến composer, test-builder-shell, cloze, prompt content lock để xác nhận không có hồi quy phụ.
- **Target files and symbols**:
  - `apps/web/src/routes/_auth/assignments/new-submit.test.tsx`
  - `apps/web/src/lib/canonical-json.test.ts`
  - `apps/web/src/components/assignment-tests/test-builder-shell.test.tsx`
  - `apps/server/src/routes/assignments/prompt-content-lock.test.ts`
- **Steps**:
  1. Chạy `pnpm --filter web exec vitest run src/lib/canonical-json.test.ts src/routes/_auth/assignments/new-submit.test.tsx src/components/assignment-tests/test-builder-shell.test.tsx`.
  2. Chạy `pnpm --filter server exec vitest run src/routes/assignments/prompt-content-lock.test.ts`.
- **Success criteria**: Tất cả các test suites trên đều pass 100%.
- **Verify**: Lệnh vitest cho các file trên thoát 0 và báo 0 failed.

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
