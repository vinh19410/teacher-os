# Phase 3: Verification & Quality Gate

## Goal
Kiểm tra toàn bộ hệ thống qua các lệnh gate (typecheck, lint, unit tests), cập nhật `CHANGELOG.md` theo chuẩn conventional commits tiếng Việt, và sẵn sàng cho quy trình ship.

## Files to Create / Modify
- `CHANGELOG.md`

## Tasks & Steps

### Task 3.1 — Full Test Suites
- Goal: Đảm bảo toàn bộ test suites của `@teacher-os/api`, `server`, và `student` pass 100%.
- Target files: none (chạy tests)
- Steps:
  1. Chạy unit tests cho api package:
     `pnpm --filter @teacher-os/api test`
  2. Chạy unit tests cho server app:
     `pnpm --filter server test`
  3. Chạy unit tests cho student app:
     `pnpm --filter student test`
- Success criteria: Không có test nào bị fail hoặc regression.
- Verify: `pnpm --filter @teacher-os/api test && pnpm --filter server test && pnpm --filter student test` exits 0.

### Task 3.2 — Typecheck & Lint Gate
- Goal: Đảm bảo TypeScript không có lỗi type (`pnpm check-types`) và Biome không có lỗi format/lint (`pnpm exec biome check .`).
- Target files: toàn bộ codebase
- Steps:
  1. Chạy typecheck toàn repo:
     `pnpm check-types`
  2. Chạy biome check:
     `pnpm exec biome check .`
- Success criteria: Cả hai lệnh đều exit 0 không có warning/error nghiêm trọng.
- Verify: `pnpm check-types && pnpm exec biome check .` exits 0.

### Task 3.3 — Changelog Update
- Goal: Ghi nhận thay đổi cho issue #587 vào `CHANGELOG.md` theo format tiếng Việt chuẩn của repo.
- Target files: `CHANGELOG.md`
- Steps:
  1. Thêm mục vào phần Unreleased hoặc ngày hiện tại:
     `- **student**: hiện hạn nộp (ngày và giờ) trên header trang làm bài thi/bài tập, ẩn với bài tự luyện (#587).`
- Success criteria: `CHANGELOG.md` phản ánh trung thực thay đổi.
- Verify: `git diff CHANGELOG.md` hiển thị đúng dòng thay đổi.

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
