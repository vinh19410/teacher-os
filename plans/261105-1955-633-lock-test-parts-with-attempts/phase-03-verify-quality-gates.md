---
phase: 3
title: "Kiểm thử tổng thể và Quality Gates"
status: pending
priority: P1
effort: "0.5h"
dependencies: [1, 2]
---

# Phase 3: Kiểm thử tổng thể và Quality Gates

## Goal

Đảm bảo toàn bộ hệ thống vượt qua các tiêu chuẩn chất lượng nghiêm ngặt của dự án (biome linter, typecheck, test suites), xác nhận các tiêu chí hoàn thành của issue #633 đã được thỏa mãn đầy đủ và không gây hồi quy.

## Files to Create / Modify

- `CHANGELOG.md`: Ghi nhận thay đổi khóa part test, mã lỗi API và rollback UI.

## Tasks & Steps

### Task 3.1 — Cập nhật CHANGELOG.md
- Goal: Ghi nhận đầy đủ thay đổi kỹ thuật của issue #633.
- Target files: `CHANGELOG.md`
- Steps:
  1. Thêm mục vào ngày 2026-11-05:
     - Khóa thay đổi part của test đã có bài làm (#633): `PUT /api/assignments/tests/:id/parts` trả 409 `TEST_PARTS_LOCKED` kèm `code` khi thêm/gỡ/đổi part của test đã có `quiz_attempt` cùng org; gửi lại danh sách part giống hệt vẫn thành công 200 và giữ nguyên ID trong DB.
     - Web hiển thị thông báo riêng cho mã lỗi `TEST_PARTS_LOCKED` trong `useKernelFormSubmit` và hoàn nguyên (rollback) slot trên `TestBuilderShell` khi bị máy chủ từ chối.
- Success criteria: CHANGELOG được cập nhật chính xác, không thừa thiếu.
- Verify: `git diff CHANGELOG.md` phản ánh đúng các mục trên.

### Task 3.2 — Chạy các gate kiểm tra chất lượng mã nguồn
- Goal: Toàn bộ codebase sạch lỗi linting, formatting và type-checking.
- Target: Workspace root
- Steps:
  1. Chạy linter: `pnpm check` (các file thay đổi trong PR phải hoàn toàn sạch lỗi).
  2. Chạy kiểm tra kiểu: `pnpm check-types` trên toàn bộ monorepo.
  3. Chạy test toàn bộ monorepo: `pnpm test`.
- Success criteria: Mọi lệnh thoát với mã 0.
- Verify:
  - `pnpm check` thoát 0 trên các file được sửa.
  - `pnpm check-types` thoát 0.
  - `pnpm test` thoát 0 (0 failed).

### Task 3.3 — Xác thực tiêu chí hoàn thành của Issue #633
- Goal: Từng checkbox trong issue #633 được đối chiếu có bằng chứng cụ thể.
- Target: Issue #633 checklist
- Steps:
  1. Kiểm tra tiêu chí 1: Thay hoặc gỡ part của test đã có bài làm bị từ chối bằng mã lỗi `TEST_PARTS_LOCKED` (đã chứng minh bằng test server `apps/server/src/routes/assignments/tests.test.ts`).
  2. Kiểm tra tiêu chí 2: Test chưa có bài làm vẫn đổi part bình thường (đã chứng minh bằng test server).
  3. Kiểm tra tiêu chí 3: Web hiện thông báo rõ khi bị từ chối (chứng minh qua test hook `useKernelFormSubmit` khớp thông báo, và shell kết xuất `submit.error` ở footer alert kèm rollback slot).
- Success criteria: Cả 3 tiêu chí đều có test chứng minh đạt kết quả mong muốn.
- Verify: Báo cáo kết quả kiểm chứng đầy đủ.
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
