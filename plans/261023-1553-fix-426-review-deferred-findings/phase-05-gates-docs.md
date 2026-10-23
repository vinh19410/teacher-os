---
phase: 5
title: "Gates tổng + docs decision"
status: pending
priority: P1
effort: "1h"
dependencies: [1, 2, 3, 4]
---

# Phase 5: Gates tổng

## Goal

Toàn bộ gate local của repo xanh trước khi ship: `pnpm check`, `check-types`, `test`, e2e admin. Quyết định docs theo mode beta.

## Files to Create / Modify

- Không có file sản phẩm mới. (Chỉ chạy gate + ghi nhận.)

## Tasks & Steps

### Task 5.1 — Gates toàn repo
- Steps:
  1. `pnpm check` (biome — nếu lỗi format: `pnpm check:fix` rồi chạy lại).
  2. `pnpm check-types`.
  3. `pnpm test` (toàn workspace).
  4. e2e admin: reading + listening (Task 4.3 nếu chưa chạy sau edit cuối).
- Success criteria: cả 4 lệnh exit 0.
- Verify: log từng lệnh, ghi kết quả vào báo cáo ship.

### Task 5.2 — Docs decision (beta mode)
- Steps:
  1. Đối chiếu: thay đổi có đụng public contract không? Kết quả điều tra: superRefine path chỉ lộ trong UI admin (server 400 PUT part trả `{error:"invalid body"}` không kèm issues; NOT_READY trả issues từ `partIssues` — luật này KHÔNG đổi). → Không cần `/ak:docs update`.
  2. Ghi quyết định vào PR description.
- Success criteria: quyết định docs có căn cứ trong PR.
- Verify: PR body có dòng "Docs: skipped — không đổi public contract (lý do …)".

### Task 5.3 — Dọn đồ thừa
- Steps: `git status --short` — không còn file tạm (bench, script throwaway); plan files + bench-results.md được commit theo convention `plans/`.
- Success criteria: tree sạch, chỉ còn thay đổi sản phẩm + plan.
- Verify: `git status --short` đọc được và khớp danh sách file kỳ vọng.

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
