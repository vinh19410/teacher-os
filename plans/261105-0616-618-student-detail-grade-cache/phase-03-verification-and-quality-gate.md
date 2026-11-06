# Phase 3: Verification & Quality Gate

## Goal
Chạy kiểm tra toàn bộ chất lượng mã nguồn trên repository (typecheck, lint/format, test suite toàn cục) và ghi chép thay đổi vào `CHANGELOG.md`.

## Files to Create or Modify
- `CHANGELOG.md`

## Tasks & Steps

### Task 3.1 — Chạy Biome check và format
- **Goal:** Đảm bảo code tuân thủ các quy tắc format và lint của repo.
- **Target files:** Không giới hạn (toàn bộ repo).
- **Steps:**
  1. Chạy `pnpm check` (chạy biome check --write).
  2. Kiểm tra `git status` đảm bảo không có thay đổi ngoài ý muốn.
- **Success criteria:** Biome hoàn tất không có lỗi.
- **Verify:** `pnpm exec biome check .` thoát mã 0.

### Task 3.2 — Chạy Typecheck toàn repo
- **Goal:** Đảm bảo không có lỗi type nào phát sinh.
- **Steps:**
  1. Chạy `pnpm check-types`.
- **Success criteria:** Toàn bộ packages và apps đều pass typecheck.
- **Verify:** `pnpm check-types` thoát mã 0.

### Task 3.3 — Chạy Test suite của student app và server
- **Goal:** Đảm bảo không có regression test nào bị phá vỡ.
- **Steps:**
  1. Chạy `pnpm --filter student test`.
- **Success criteria:** 100% test files pass.
- **Verify:** `pnpm --filter student test` thoát mã 0.

### Task 3.4 — Cập nhật CHANGELOG.md
- **Goal:** Ghi nhận bugfix #618 vào CHANGELOG.md theo quy chuẩn repo.
- **Target files:** `CHANGELOG.md`.
- **Steps:**
  1. Thêm dòng mô tả: `fix(student): tự động cập nhật điểm khi giáo viên chấm xong (#618)`.
- **Success criteria:** Dòng changelog được ghi nhận rõ ràng dưới mục Unreleased hoặc phiên bản hiện tại.
- **Verify:** `git diff CHANGELOG.md` hiển thị mục đã thêm.

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
