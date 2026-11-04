---
title: "Ship #558 optimize CI quality workflow runtime on deploy pipelines"
date: 2026-11-04
summary: "Rút cổng quality từ ~8 phút xuống ≤ ~4 phút bằng reusable workflow 4 job song song, Turborepo Transit Nodes, khử vite build trùng và per-job Turbo cache (#558)"
---

# Ship #558 optimize CI quality workflow runtime on deploy pipelines

## What happened
Thực thi issue #558 tối ưu thời gian chạy cổng `quality` dùng chung cho `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, và `.github/workflows/deploy-staging.yml` mà không bỏ hoặc nới lỏng bất kỳ gate nào (`biome check .`, toàn bộ 12 workspace test suites + 4 root contract suites, `check-types`, `build`).

## Decision
- **Gộp thành reusable `.github/workflows/quality.yml` (4 job song song) + composite `.github/actions/setup-workspace/action.yml`:** Chia đều tải trên runner 2 vCPU thành `checks` (`biome` + `check-types` + `build`), `test-web` (`176` file), `test-server` (`96` file với `VITEST_SKIP_SLOW=1`), và `test-workspace` (10 workspace còn lại + `server#test:ledger` + 4 root scripts).
- **Chuyển `test` và `test:ledger` sang Turborepo Transit Nodes (`dependsOn: ["transit"]`):** Log thực nghiệm từ `Probe Gate 558` (run `#41750673830`) và code review độc lập phát hiện `apps/e2e` phụ thuộc `server: workspace:*`, khiến `dependsOn: ["^test"]` kéo ngược toàn bộ 97 file của `server#test` vào `test-workspace` (đội tổng thực thi lên 581 file). Chuyển sang `transit` (`dependsOn: ["^transit"]`) giữ nguyên 100% băm invalidation xuyên package nhưng loại bỏ hoàn toàn thực thi trùng lặp, đưa tổng thực thi về đúng **394 file**.
- **Tách chính sách `.turbo` cache qua boolean input `turbo-cache` và khử `vite build` trùng:** Bật `turbo-cache: true` ở `ci.yml` (`actions/cache/restore@v6` trên PR, `actions/cache@v6` + tỉa >7 ngày trên `push`, tách key riêng từng job); đặt `turbo-cache: false` ở `deploy.yml` / `deploy-staging.yml` để cổng phát hành luôn chạy thực tế 100%. Ở `apps/{web,student,admin}/turbo.json`, khai báo `outputs: ["dist/**", "src/routeTree.gen.ts"]` và `check-types.dependsOn: ["$TURBO_EXTENDS$", "build"]` giúp `pnpm build` chạy sau `pnpm check-types` chỉ mất ~1s trên GitHub runner.
- **Thu hẹp `paths-ignore` ở `ci.yml` chỉ gồm `["plans/**/*.md", "plans/reports/**/*.html"]`:** Bảo vệ tuyệt đối `docs/production-release-runbook.md` (được đọc bởi `scripts/topology-drift.test.mjs`) và các file `.json`/`.js`/`.ts` do Biome quét.

## Verification & Next steps
- Red-gate probe thực tế trên GitHub Actions (`#41750673830`, `turbo-cache: false`, nhánh `probe/558-gate` đã xoá): `quality / checks` 2m04s, `quality / test-server` 2m38s, `quality / test-web` 3m20s; khi step cuối `test-workspace` fail cố ý, job hạ lưu `would-deploy` (`needs: [quality]`) bị `skipped` (0s).
- Kiểm chứng cục bộ: `pnpm check`, `pnpm check-types`, `pnpm build`, `pnpm test` (bao gồm 7 test hợp đồng trong `scripts/ci-workflow.test.mjs`, `topology-drift`, `devserver-watchdog`, `design-compare`) đều xanh.
- Tiếp theo: mở PR vào `develop`, chạy `ak-review-pr --fix --reply --advice`, merge bằng merge commit (bảo toàn git ancestry với `origin/main` PR #557) và theo dõi CI `develop` xanh.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
