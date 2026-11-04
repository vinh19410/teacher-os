# Phase 4: Kiểm thử toàn diện & Quality Gates

## Goal
Xác minh toàn bộ các gate chất lượng cục bộ của repository trước khi ship beta: chạy kiểm thử linting Biome, kiểm tra kiểu dữ liệu TypeScript toàn repo, chạy toàn bộ test suite của packages/auth, apps/server, apps/student, và kiểm tra end-to-end nếu cần.

## Files to Create or Modify
- Các file sửa đổi trong các phase trước cần đảm bảo tuân thủ formatting và typecheck.

## Tasks & Steps

### Task 4.1: Kiểm tra format và lint với Biome
- **Goal**: Đảm bảo tất cả các file mã nguồn mới và đã sửa đổi tuân thủ nghiêm ngặt quy tắc Biome của dự án.
- **Target files and symbols**: Toàn bộ repo.
- **Steps**:
  1. Chạy `pnpm exec biome check .` để quét kiểm tra.
  2. Nếu có lỗi format/lint, chạy `pnpm check` để tự động sửa chữa.
- **Success criteria**: Biome check kết thúc với mã thoát 0 (chỉ cho phép cảnh báo vô hại, không có lỗi).
- **Verify**: `pnpm exec biome check .` exits 0.

### Task 4.2: Kiểm tra kiểu dữ liệu toàn repo (Typecheck)
- **Goal**: Xác nhận toàn bộ 14 packages/apps biên dịch sạch sẽ không có lỗi TypeScript.
- **Target files and symbols**: Toàn bộ repo (`pnpm check-types`).
- **Steps**:
  1. Chạy `pnpm check-types` qua turbo.
- **Success criteria**: 12/12 hoặc 14/14 packages hoàn thành thành công mà không phát sinh lỗi kiểu.
- **Verify**: `pnpm check-types` exits 0.

### Task 4.3: Chạy test suite của các package liên quan
- **Goal**: Chạy toàn bộ các bộ test tự động của `@teacher-os/auth`, `apps/server`, và `apps/student`.
- **Target files and symbols**:
  - `packages/auth`
  - `apps/server`
  - `apps/student`
- **Steps**:
  1. Chạy `pnpm --filter @teacher-os/auth test`.
  2. Chạy `pnpm --filter server test`.
  3. Chạy `pnpm --filter student test`.
- **Success criteria**: 100% test case trong 3 package trên đều chạy xanh.
- **Verify**: Lần lượt từng lệnh test đều exits 0.

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
