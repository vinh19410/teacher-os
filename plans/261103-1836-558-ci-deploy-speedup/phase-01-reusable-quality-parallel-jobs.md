# Phase 1 — Reusable quality workflow + job song song

## Mục tiêu

Một định nghĩa quality duy nhất, 3 job chạy song song, được `ci.yml`, `deploy.yml`, `deploy-staging.yml` gọi lại.

## Files

Đọc: `.github/workflows/{ci,deploy,deploy-staging}.yml`, `scripts/ci-workflow.test.mjs`, `scripts/topology-drift.test.mjs`, `docs/production-release-runbook.md`.

Sửa/tạo:
- Tạo `.github/workflows/quality.yml` (`on: workflow_call`, không nhận secrets).
- Tạo `.github/actions/setup-workspace/action.yml` (composite: pnpm 10.33.1, node 24 + cache pnpm, `pnpm install --frozen-lockfile`). Checkout vẫn nằm ở workflow vì action local cần repo đã checkout.
- Sửa 3 workflow trên để gọi `quality.yml` và dùng composite cho job `deploy`.
- Sửa `scripts/ci-workflow.test.mjs`, `scripts/topology-drift.test.mjs` (nếu đọc phần quality).

## Các bước

1. Đồng bộ nhánh: `git merge origin/main` vào nhánh làm việc cắt từ `develop`, xử lý xung đột ở `deploy*.yml`, `e2e.yml`, `ci-workflow.test.mjs`. Chạy `node --test scripts/ci-workflow.test.mjs` để biết trạng thái xanh ban đầu.
2. Ghi baseline: chạy 1 run CI trên nhánh và ghi thời gian từng step vào `plans/reports/` (dùng `gh api repos/{owner}/{repo}/actions/runs/<id>/jobs`).
3. Viết `quality.yml` với 3 job độc lập, mỗi job: checkout, composite setup, rồi:
   - `lint`: `pnpm exec biome check .`
   - `test`: `pnpm test` (giữ nguyên, gồm 4 test node ở gốc)
   - `types-build`: `pnpm check-types` rồi `pnpm build`
   Giữ `env.VITE_SERVER_URL: http://localhost:8000` và `timeout-minutes`.
4. `ci.yml`: thay job `quality` bằng `uses: ./.github/workflows/quality.yml`. Giữ `concurrency`, `permissions: contents: read`, trigger `[main, develop]`.
5. `deploy.yml`, `deploy-staging.yml`: thay job `quality` bằng `uses: ./.github/workflows/quality.yml`, giữ `deploy.needs: [quality]`. Dùng composite cho phần setup của job deploy. Không đổi `environment`, `env`, secrets, smoke.
6. Cập nhật `ci-workflow.test.mjs`: các assert về `biome check`, `pnpm test` (dòng riêng), `check-types`, `build`, `VITE_SERVER_URL`, cấm `secrets.` và `--write` đọc từ `quality.yml`; thêm assert `ci.yml`, `deploy.yml`, `deploy-staging.yml` đều `uses: ./.github/workflows/quality.yml`; thêm assert `quality.yml` không có `secrets.` và không có `secrets: inherit` ở bên gọi quality.
7. Cập nhật `topology-drift.test.mjs` nếu nó phụ thuộc vị trí các bước quality.

## Kiểm chứng

- `node --test scripts/ci-workflow.test.mjs scripts/topology-drift.test.mjs` xanh.
- `pnpm exec biome check .` xanh (biome kiểm cả YAML/JSON nếu repo bật).
- Push nhánh, mở PR vào `develop`: 3 job `lint`, `test`, `types-build` chạy song song và xanh. Ghi thời gian wall-clock.
- Run thử trên nhánh với 1 test cố ý fail: workflow gọi quality đỏ, job `deploy` ở `deploy*.yml` bị skip (dùng `workflow_dispatch` trên nhánh nháp hoặc đọc điều kiện `needs`, không deploy thật).

## Rủi ro và rollback

- Job trong reusable workflow hiện tên `quality / lint`…; nếu repo sau này đặt required check theo tên cũ `quality` sẽ lệch. Hiện không có required check.
- `needs: [quality]` trên job gọi reusable workflow chỉ pass khi mọi job con thành công; đã đúng ý, nhưng phải kiểm bằng run thử ở trên.
- Rollback: revert commit; 3 workflow trở lại bản có job `quality` nội tuyến.
