---
title: "Phase 2: Regression verification E2E"
status: completed
---

# Phase 2: Regression verification E2E

Chứng minh regression suite xanh tại đúng commit của branch này: toàn bộ `apps/e2e` (bao gồm luồng class operations và money loop) cùng các gate `pnpm check` / `pnpm check-types` / `pnpm test`.


## Context Links

- Class operations specs: `apps/e2e/specs/class-operations.spec.ts`, `create-class-validation.spec.ts`, `class-assign.spec.ts`, `schedule-session-modal.spec.ts`, `session-occurrence.spec.ts`, `projected-sessions.spec.ts`.
- Money loop specs: `apps/e2e/specs/create-invoice.spec.ts` (tạo invoice → mark paid → KPI giữ sau reload).
- CI workflow: `.github/workflows/e2e.yml` (chạy đúng suite này trên PR/push develop).

## Tests Before (TDD)

Không viết test mới — suite hiện có chính là regression contract. Trước khi ghi evidence, xác nhận bộ specs tiền định tồn tại và chạy được:

- `apps/e2e/specs` chứa specs class operations (danh sách file ở Context Links) và money loop (`create-invoice.spec.ts`).
- Gate: `pnpm --filter e2e e2e` exit 0, và **nêu đích danh mọi test skip** trong kết quả (hiện có 1 skip có chủ đích: `profile.spec.ts:143` — OAuth round-trip thật env-gated `E2E_GOOGLE_OAUTH`, thuộc manual checklist theo M3 deviation).

## Implementation Steps

1. Chạy `pnpm check` (biome), `pnpm check-types` (turbo), `pnpm test` (turbo test + ci-workflow + topology-drift) — ghi lại kết quả từng gate.
2. Chạy full E2E local: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 pnpm --filter e2e e2e` (ports override vì dev server chính chiếm 8000/8001). Ghi: số specs, số test pass, duration, commit SHA, ngày.
3. Nếu bất kỳ gate nào đỏ: dừng, mở debug root-cause (`ak:debug`), fix thật, rồi chạy lại toàn bộ từ đầu (evidence phải là run xanh tại commit chứa fix).
4. Ghi raw output vào `reports/` trong plan dir (đã làm sạch, không secret).

## Todo

- [x] `pnpm check` xanh — 362 files, no fixes (1 info pre-existing về biome migrate).
- [x] `pnpm check-types` xanh — 6/6 tasks successful.
- [x] `pnpm test` xanh — turbo test + ci-workflow 2/2 + topology-drift 6/6.
- [x] Full E2E xanh local tại commit `beda711` (ports 8100/8101): **66 passed, 1 skipped (đích danh: profile.spec.ts OAuth round-trip, env-gated), 0 failed**, 1.6m.
- [x] Output đã lưu vào `reports/`.

## Success Criteria

Cả 4 gate xanh tại cùng một commit; số lượng test E2E pass > 0 và không skip toàn diện. Nếu một gate đỏ mà nguyên nhân là external blocker thật (secret, service), ghi rõ thay vì nhạt nhòa.

## Risk Assessment

- **Risk:** dev server chính worktree chiếm 8000/8001 làm E2E fail port. **Mitigation:** override port theo cơ chế có sẵn trong playwright.config (đã làm).
- **Risk:** E2E flaky do retries=0 local. **Mitigation:** chạy lại 1 lần để phân biệt flake vs regression thật; flake lặp lại = defect, debug thật.
