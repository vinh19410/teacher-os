---
phase: 3
title: "Phase 3: Verify & Quality Gates"
status: completed
priority: P1
effort: "20m"
dependencies: [1, 2]
---

# Phase 3: Verify & Quality Gates

## Goal
Chạy toàn bộ các cổng kiểm định chất lượng: bộ test của web, kiểm tra kiểu tĩnh (TypeScript), lint & formatting (Biome), đảm bảo không có bất kỳ regression nào trong toàn bộ repo.

## Files to Create / Modify
- N/A (chạy verification)

## Tasks & Steps

### Task 3.1 — Chạy bộ test liên quan và toàn bộ web suite
- **Goal:** Xác nhận tất cả test trong `apps/web` đều pass, đặc biệt là các test liên quan đến students và routes.
- **Target files and symbols:** N/A.
- **Steps:**
  1. Chạy vitest cho helper: `pnpm --filter web exec vitest run src/lib/format-student-target.test.ts`.
  2. Chạy vitest cho route student: `pnpm --filter web exec vitest run src/routes/_auth/students/\$studentId.test.tsx`.
  3. Chạy vitest cho reports student: `pnpm --filter web exec vitest run src/routes/_auth/students/\$studentId.reports.test.tsx`.
- **Success criteria:** Tất cả các lệnh chạy test đều thoát với mã 0.
- **Verify:** `pnpm --filter web test` thoát với mã 0 (toàn bộ suite test của `web` pass).

### Task 3.2 — Chạy typecheck và Biome linter
- **Goal:** Đảm bảo toàn bộ workspace tuân thủ quy tắc typecheck và lint của CI.
- **Target files and symbols:** N/A.
- **Steps:**
  1. Chạy `pnpm check-types` trên toàn bộ workspace.
  2. Chạy `pnpm exec biome check .` để kiểm tra format và lint.
- **Success criteria:** Không có lỗi TypeScript hay lỗi vi phạm Biome nào.
- **Verify:** `pnpm check-types && pnpm exec biome check .` thoát với mã 0.

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
