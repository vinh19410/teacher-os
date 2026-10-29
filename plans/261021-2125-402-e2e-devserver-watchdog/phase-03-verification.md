---
phase: 3
title: "Verification gates"
status: in-progress
priority: P1
effort: 1h
dependencies: [1, 2]
---

# Phase 3: Verification gates

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

## Goal
Bộ gate local đầy đủ (tương đương CI vì CI chỉ chạy cho target `main`) xanh
trên worktree, chứng minh không regression cho toàn bộ 237 spec e2e và
design:compare.

## Files to Create / Modify
- Không có — chỉ chạy gate và ghi evidence.

## Tasks & Steps

### Task 3.1 — Static + unit gates
- Steps:
  1. `pnpm check` (biome check --write toàn repo).
  2. `pnpm check-types`.
  3. `node --test scripts/devserver-watchdog.test.mjs`.
  4. `pnpm test` (chuỗi root gồm turbo test + ci-workflow + topology-drift + devserver-watchdog mới).
- Success criteria: cả 4 exit 0.
- Verify: exit code từng lệnh (so sánh output).

### Task 3.2 — Full e2e + design:compare
- Steps:
  1. `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e` — kỳ vọng 237/237 passed (hoặc đúng số spec hiện hành, 0 failed).
  2. `pnpm design:compare --screens t-attendance` — kỳ vọng 12 ảnh, 0 lỗi.
  3. Sau cả 2 run: `lsof -nP -iTCP:8100 -iTCP:8101 -iTCP:8103 -sTCP:LISTEN` rỗng.
- Success criteria: đủ 3 kết quả.
- Verify: tail output từng lệnh + lsof.

## Verification (phase gate)
- Tất cả Task 3.1 + 3.2 đạt. Đây là điều kiện để sang ak:ship.
