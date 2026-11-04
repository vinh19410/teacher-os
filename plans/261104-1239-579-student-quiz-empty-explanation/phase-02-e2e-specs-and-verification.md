---
phase: 2
title: "Phase 2: E2E Specs, Quality Gates & Regression Verification"
status: completed
priority: P1
effort: "45m"
dependencies: [1]
---

# Phase 2: E2E Specs, Quality Gates & Regression Verification

## Goal

Cập nhật các assertion trong E2E specs liên quan (`apps/e2e/specs/student-quiz-take-review.spec.ts`, `apps/e2e/specs/assignment-prompt-create.spec.ts`) để đồng bộ với nhãn `"Xem chi tiết bài làm"`, rà soát triệt để toàn repo không còn chuỗi cũ, và chạy toàn bộ quality gates (`biome check`, `check-types`, test suite).

## Files to Create / Modify

- Modify: `apps/e2e/specs/student-quiz-take-review.spec.ts`
- Modify: `apps/e2e/specs/assignment-prompt-create.spec.ts`

## Tasks & Steps

### Task 2.1 — Cập nhật E2E specs sang nhãn mới
- Goal: Đổi tất cả các locator tìm link `"Xem giải thích chi tiết"` sang `"Xem chi tiết bài làm"` trong cả 2 spec E2E, đặc biệt chú ý 2 vị trí phủ định `toHaveCount(0)` ở Writing/Speaking để tránh assertion xanh giả.
- Target files:
  - `apps/e2e/specs/student-quiz-take-review.spec.ts`
  - `apps/e2e/specs/assignment-prompt-create.spec.ts`
- Steps:
  1. Trong `apps/e2e/specs/student-quiz-take-review.spec.ts`:
     - Dòng 562: đổi `"Xem giải thích chi tiết"` thành `"Xem chi tiết bài làm"`.
     - Dòng 819: đổi `"Xem giải thích chi tiết"` thành `"Xem chi tiết bài làm"`.
     - Dòng 937: đổi `"Xem giải thích chi tiết"` thành `"Xem chi tiết bài làm"`.
     - Dòng 1008: đổi `page.getByRole("link", { name: "Xem giải thích chi tiết" })` thành `page.getByRole("link", { name: "Xem chi tiết bài làm" })` (Writing - assert count 0).
     - Dòng 1067: đổi `"Xem giải thích chi tiết"` thành `"Xem chi tiết bài làm"`.
     - Dòng 1158: đổi `page.getByRole("link", { name: "Xem giải thích chi tiết" })` thành `page.getByRole("link", { name: "Xem chi tiết bài làm" })` (Speaking - assert count 0).
  2. Trong `apps/e2e/specs/assignment-prompt-create.spec.ts`:
     - Dòng 738: đổi `studentPage.getByRole("link", { name: "Xem giải thích chi tiết" })` thành `studentPage.getByRole("link", { name: "Xem chi tiết bài làm" })`.
- Success criteria: Không còn locator nào tìm chuỗi cũ trong thư mục `apps/e2e`.
- Verify: `git grep "Xem giải thích chi tiết" apps/ packages/` không trả về dòng nào.

### Task 2.2 — Chạy Quality Gates và rà soát toàn diện
- Goal: Xác minh toàn bộ chất lượng mã nguồn: linting, formatting, type checking, và unit tests của toàn bộ repo đều pass.
- Target files: toàn bộ repo
- Steps:
  1. Chạy linter đọc: `pnpm exec biome check .`.
  2. Chạy kiểm tra kiểu: `pnpm check-types`.
  3. Chạy unit tests: `pnpm test`.
- Success criteria: Mọi lệnh kiểm tra đều exit 0 không lỗi.
- Verify: `pnpm exec biome check . && pnpm check-types && pnpm --filter student test && pnpm --filter @teacher-os/ui test` exits 0.

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
