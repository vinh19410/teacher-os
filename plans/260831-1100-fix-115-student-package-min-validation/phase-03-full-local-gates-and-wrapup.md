---
phase: 3
title: "Phase 3: Full local gates and wrapup"
status: completed
priority: P2
effort: "1h"
dependencies: ["phase-01", "phase-02"]
---

# Phase 3: Full local gates and wrapup

## Overview

Chạy đủ 4 local gates của repo trên toàn bộ thay đổi, xác minh không regression, rồi chuẩn bị handoff cho review/ship (cập nhật issue #115, journal ngắn).

<!-- Updated: Red Team Session 1 - explicit e2e command + port precondition; diff gate file list widened for contract-test updates; TDD evidence rule -->

## Requirements

- Functional: tất cả gate xanh trên branch `fix/115-student-package-min-validation`.
- Non-functional: không commit file rác (artifact e2e, .env); diff chỉ chứa các file được plan cho phép.

## Architecture

Không đổi code trong phase này — chỉ verify + wrap-up. Gate theo `docs/production-release-runbook.md` local gates section (đã dùng cho mọi release trước).

## Related Code Files

- Verify-only: toàn bộ diff của phase 1-2
- Modify: không (issue #115 comment/label do vibe pipeline step 4/9 xử lý, không thuộc phase file này)

## Implementation Steps

1. `pnpm test` — toàn bộ unit/server/web tests (KHÔNG dùng `pnpm test --filter server` — root script là compound, flag dính vào lệnh cuối; filter đúng: `pnpm --filter <pkg> test`)
2. `pnpm check-types`
3. `pnpm exec biome check .` — 0 error mới (baseline develop: 1 warning + 1 info)
4. `pnpm build` (VITE_SERVER_URL parity như CI)
5. E2E: `pnpm --filter e2e e2e` — CHỈ chạy khi port 8000/8001 free (tắt dev server trước; `reuseExistingServer: false` fail-loud). Nếu e2e local không chạy được: ghi external blocker tường minh; các criterion TDD ở phase 2 KHÔNG được tick cho đến khi có bằng chứng chạy thật (local hoặc CI), không được thay bằng "để CI bắt" ngầm.
6. `git diff --stat` review danh sách file — khớp diff gate.
7. Commit theo conventional commits (`fix(web,api): … (issue #115)` — theo lịch sử repo dùng scope web/server/api).

## Success Criteria

- [x] 4 gate xanh (e2e hoặc xanh, hoặc external blocker được ghi rõ và phase-2 TDD criterion để mở)
- [x] Diff chỉ gồm: `packages/api/src/contracts.ts`, `apps/server/src/kernel.test.ts`, `apps/web/src/components/modals/add-student-modal.tsx`, `apps/e2e/specs/student-package-validation.spec.ts` (+ được phép: `apps/web/src/lib/add-student-enroll.contract.test.ts` và/hoặc `apps/web/src/lib/kernel-runtime.contract.test.ts` nếu source-format đổi; KHÔNG thêm `helpers.ts` — spec mới self-contained)
- [x] Commit trên branch đúng, không đụng develop trực tiếp

## Risk Assessment

- Flaky e2e local (headless timing) — nếu fail 2 lần cùng chỗ do timing, chạy lại lần 3; vẫn fail → mở trace và sửa selector/wait, không thêm sleep tràn lan.
