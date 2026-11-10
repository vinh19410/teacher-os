---
phase: 3
title: "Web copy fix + gates cuối"
status: completed
priority: P2
effort: "1h"
dependencies: [2]
---

# Phase 3: Web copy fix + gates cuối

## Goal

Copy lỗi 409 `SESSION_HOLIDAY` chính xác cho cả 2 bucket semantics (detach chủ ý còn 200 cho bucket mới); gates repo xanh (`pnpm check`, `pnpm check-types`, full test suites). Badge "đã dời" cho bucket 0 lesson là follow-up issue riêng (red-team finding 6 — xem plan decision 7).

## Files to Create / Modify

- Modify: `apps/web/src/lib/repos/materials.ts` (case `SESSION_HOLIDAY` tại `:194-196`)

## Failure Protocol

Nếu bất kỳ bước Verify nào không đạt pass condition: DỪNG phase này. Không tự sửa thử, không retry mù, không suy luận vòng quanh. Spawn subagent `kongming` với: phase + task id, các bước đã chạy, lệnh chạy đúng và output đầy đủ, pass condition không đạt. Áp dụng hướng dẫn rồi chạy lại Verify. Nếu không spawn được `kongming`, DỪNG và báo nguyên evidence cho user. Không tiếp tục bằng tự suy luận.

## Tasks & Steps

### Task 3.1 — Sửa copy `SESSION_HOLIDAY`

- Goal: message không còn khẳng định sai "không gỡ được" trong khi detach chủ ý 200 cho bucket mới (server Phase 2).
- Target files: `apps/web/src/lib/repos/materials.ts:196`.
- Steps:
  1. Đổi chuỗi thành: `"Buổi này là buổi nghỉ lễ đã dời lịch — không gắn tài liệu được."` (bỏ "hoặc gỡ"). Copy này đúng cho cả 2 case: bucket holiday thuần (attach chặn; message không khẳng định gì về gỡ) và bucket đã-shift có class_session (attach chặn, gỡ được — đúng fact).
  2. Không đổi error code, không đổi shape response server (tái dụng `SESSION_HOLIDAY` — plan decision 3). Không có test web nào pin message cũ (đã grep 2026-11-10).
- Success criteria: chuỗi mới trong code; không có test nào đỏ.
- Verify: `pnpm --filter web exec vitest run src/lib/repos/` — exit 0 (nếu thư mục không có test: `pnpm --filter web exec vitest run src/lib/` exit 0).

### Task 3.2 — Gates cuối

- Goal: toàn bộ gate repo xanh trên thay đổi hợp nhất.
- Target files: không có file mới (chỉ chạy gates).
- Steps:
  1. `pnpm check` (biome read-only); nếu lỗi format → `pnpm check:fix` rồi `pnpm check` lại phải sạch.
  2. `pnpm check-types` — exit 0.
  3. `pnpm test` (full suite) — exit 0.
- Success criteria: cả 3 gate exit 0.
- Verify: chạy tuần tự 3 lệnh trên; mọi lệnh exit 0. Bất kỳ lệnh nào non-zero → đúng Failure Protocol.

## Verification

- `pnpm check && pnpm check-types` — exit 0.
- `pnpm test` — exit 0.
