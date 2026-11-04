# #558 — Baseline số lượng test & thời gian chạy (Phase 2 & 3)

## 1. Baseline GitHub Actions trước tối ưu (`ubuntu-latest`, 2 vCPU)

Nguồn: GitHub Actions runs `#41685858123` (`ci.yml`) và `#41623794011` (`deploy-staging.yml`).

| Bước trong job `quality` cũ (tuần tự 1 job) | Thời gian | Ghi chú |
|---|---|---|
| Setup (`checkout` + `pnpm` + `node` + `pnpm install --frozen-lockfile`) | ~40–43s | Đã dùng pnpm store cache |
| `pnpm exec biome check .` | 8s | |
| `pnpm test` | 320–324s | `turbo run test` (12 workspace packages) + 4 root scripts; `.turbo` cache 0/12 |
| `pnpm check-types` | 99–100s | `web`, `student`, `admin` chạy `vite build && tsc --noEmit` |
| `pnpm build` | 14s | Chạy lại `vite build` lần 2 |
| **Tổng thời gian chờ trước khi `deploy` bắt đầu** | **~479–489s (~8.0 phút)** | Chiếm ~85% tổng thời gian pipeline deploy |

## 2. Baseline đầy đủ 16 bộ test toàn monorepo (không bỏ sót, không chạy trùng sau khi dùng Transit Nodes)

| # | Phân vùng trong `quality.yml` mới | Package / Script | Runner | Số file test | Số test |
|---|---|---|---|---:|---:|
| 1 | `test-web` | `apps/web` | Vitest | 176 | 1782 |
| 2 | `test-server` (`VITEST_SKIP_SLOW=1`) | `apps/server` (trừ `ledger-invariants`) | Vitest | 96 | 1238 |
| 3 | `test-workspace` (`server#test:ledger`) | `apps/server/src/lib/payments/ledger-invariants.test.ts` | Vitest | 1 | 10 (9 pass + 1 expected fail) |
| 4 | `test-workspace` | `apps/student` | Vitest | 42 | 388 |
| 5 | `test-workspace` | `apps/admin` | Vitest | 19 | 184 |
| 6 | `test-workspace` | `packages/api` | Vitest | 26 | 342 |
| 7 | `test-workspace` | `packages/ui` | Vitest | 14 | 184 |
| 8 | `test-workspace` | `packages/auth` | Vitest | 9 | 94 |
| 9 | `test-workspace` | `packages/db` | Vitest | 2 | 6 |
| 10 | `test-workspace` | `packages/infra` | Vitest | 1 | 28 |
| 11 | `test-workspace` | `apps/e2e` (unit) | `node --test` | 1 | 1 |
| 12 | `test-workspace` | `apps/landing` | `node --test` | 1 | 5 |
| 13 | `test-workspace` | `apps/profile` | `node --test` | 2 | 19 (sau merge #559) |
| 14 | `test-workspace` (root) | `scripts/ci-workflow.test.mjs` | `node --test` | 1 | 7 (tăng từ 4 lên 7 để khoá hợp đồng #558) |
| 15 | `test-workspace` (root) | `scripts/topology-drift.test.mjs` | `node --test` | 1 | 10 |
| 16 | `test-workspace` (root) | `scripts/devserver-watchdog.test.mjs` | `node --test` | 1 | 13 |
| 17 | `test-workspace` (root) | `scripts/design-compare.test.mjs` | `node --test` | 1 | 23 |
| **Tổng** | **3 job test song song** | **12 workspace + 4 root scripts** | — | **394** | **4334** (baseline gốc 4331 sau #559 + 3 test hợp đồng CI mới) |

## 3. Đo thực nghiệm cô lập 2 vCPU cục bộ (`taskset -c 0,1`, `--maxWorkers=2`)

| Nhóm công việc | Wall-clock trên 2 core | Tải CPU | Lý do thiết kế |
|---|---:|---:|---|
| `apps/web` (`176` file) | 180.8s | 184% | Bão hoà đủ 2 nhân → tách riêng job `test-web` |
| `apps/server` không có ledger (`96` file) | 155.9s | 187% | Bão hoà đủ 2 nhân → tách riêng job `test-server` |
| `apps/server` `ledger-invariants.test.ts` (`1` file) | 83.0s | 100% | Đơn luồng 1 nhân → chạy qua `server#test:ledger` trong `test-workspace` |
| 10 workspace còn lại (`--concurrency=2`) | 100.7s | 129% | Chạy trong `test-workspace` |
| 4 root `scripts/*.test.mjs` | 15.4s | 48% | Chạy cuối `test-workspace` |

## 4. Bằng chứng thực nghiệm trên GitHub Actions (`ubuntu-latest`, 2 vCPU)

### 4.1. Red-gate behavioral proof (`Probe Gate 558` — Run `#41750673830`, `turbo-cache: false`)

- **URL:** `https://github.com/vinh19410/teacher-os/actions/runs/41750673830`
- **Cơ chế:** Đẩy nhánh tạm độc lập `probe/558-gate` chứa workflow tạm `.github/workflows/probe-gate.yml` (`permissions: contents: read`, không `environment`, không `secrets`, `turbo-cache: false`) gọi `./.github/workflows/quality.yml` và có job hạ lưu `would-deploy` (`needs: [quality]`). Cố ý chèn `exit 1` ở cuối step cuối cùng của `quality / test-workspace`.
- **Kết quả xác nhận qua GitHub API (`actions/runs/41750673830/jobs`):**
  - `quality / checks`: `conclusion: "success"` — **2m04s (124s)** (`biome check .`: 6s, `pnpm check-types`: 68s, `pnpm build`: **1s** nhờ local `.turbo` dedupe!)
  - `quality / test-server`: `conclusion: "success"` — **2m38s (158s)**
  - `quality / test-web`: `conclusion: "success"` — **3m20s (200s)**
  - `quality / test-workspace`: `conclusion: "failure"` (đúng lỗi cố ý ở step cuối; phát hiện thêm `dependsOn: ["^test"]` làm `e2e -> server#test` chạy trùng 97 file tốn 188s → đã khử triệt để bằng Turborepo **Transit Nodes** `dependsOn: ["transit"]` ở bước review!)
  - **`would-deploy` (`needs: [quality]`): `conclusion: "skipped"` (0s)** — chứng minh khi bất kỳ job con nào trong `quality.yml` đỏ, job deploy hạ lưu bị chặn hoàn toàn.
- **Dọn dẹp:** Đã xoá nhánh `probe/558-gate` trên `origin` (`git ls-remote --heads origin probe/558-gate` = 0).

### 4.2. Run thực tế sau khi áp dụng Transit Nodes trên PR `#558` (`ci/558-ci-deploy-speedup`)

- Sẽ ghi nhận trực tiếp trên PR body và comment sau khi push nhánh PR (cả 4 job dự kiến ≤ ~3m00s–3m20s ngay cả khi cold run).
