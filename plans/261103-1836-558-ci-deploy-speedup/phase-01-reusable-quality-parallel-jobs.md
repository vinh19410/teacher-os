# Phase 1 — Reusable quality workflow + 4 job song song

<!-- Updated: Validation & Red-Team Session 1 - Reconciled 4-job layout, turbo-cache boolean input, permissions/secrets/needs/concurrency locks, and safe probe-branch red-gate proof -->

## Goal

Đồng bộ `origin/main` (PR #557 gỡ `e2e.yml`) vào nhánh làm việc, trích xuất `.github/actions/setup-workspace/action.yml` và `.github/workflows/quality.yml` với **4 job chạy song song** (`checks`, `test-web`, `test-server`, `test-workspace`), được `ci.yml`, `deploy.yml`, và `deploy-staging.yml` gọi lại mà không nhận bất kỳ secret nào.

## Files to Create or Modify

- Create: `.github/actions/setup-workspace/action.yml`
- Create: `.github/workflows/quality.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/deploy-staging.yml`
- Modify: `scripts/ci-workflow.test.mjs`

## Tasks & Steps

### Task 1.1 — Đồng bộ `origin/main` vào nhánh `ci/558-ci-deploy-speedup`
- [x] Hoàn thành Task 1.1
- **Goal:** Đưa các thay đổi trên `origin/main` (`ba981112`, PR #557 xoá `.github/workflows/e2e.yml` và cập nhật `deploy.yml`, `scripts/ci-workflow.test.mjs`, `AGENTS.md`, `README.md`, `docs/production-release-runbook.md`) vào nhánh làm việc bằng merge commit sạch trước khi sửa workflow.
- **Target files and symbols:** `.github/workflows/deploy.yml`, `.github/workflows/deploy-staging.yml`, `.github/workflows/e2e.yml` (bị xoá), `scripts/ci-workflow.test.mjs`, `AGENTS.md`, `README.md`, `docs/production-release-runbook.md`.
- **Steps:**
  1. Chạy `git merge origin/main --no-edit` trong worktree `/root/projects/worktrees/teacher-os-ci-558-ci-deploy-speedup`.
  2. Nếu có xung đột ở `AGENTS.md` hoặc workflow/test, giải quyết theo trạng thái mới nhất của `origin/main` (giữ quyết định gỡ `e2e.yml` của #557 và giữ các plan file #558/#559/#560 từ `develop`).
  3. Chạy bộ test hợp đồng workflow và topology hiện có để xác nhận mốc xanh trước khi refactor.
- **Success criteria:** `.github/workflows/e2e.yml` không còn tồn tại trong worktree; `git status` sạch; cả 2 file test hợp đồng gốc đều pass.
- **Verify:** `test ! -f .github/workflows/e2e.yml && node --test scripts/ci-workflow.test.mjs scripts/topology-drift.test.mjs` thoát mã `0` và in `fail 0`.

### Task 1.2 — Tạo composite action `.github/actions/setup-workspace/action.yml`
- [x] Hoàn thành Task 1.2
- **Goal:** Gom bước cài `pnpm@10.33.1`, `node@24` (kèm `cache: pnpm`), và `pnpm install --frozen-lockfile` vào một composite action duy nhất dùng chung cho mọi job của `quality.yml` và job `deploy` của `deploy*.yml`.
- **Target files and symbols:** `.github/actions/setup-workspace/action.yml` (`runs.using: "composite"`).
- **Steps:**
  1. Tạo `.github/actions/setup-workspace/action.yml` với `name: Setup Workspace`, `runs: { using: "composite", steps: [...] }`.
  2. Định nghĩa đúng 3 bước: `pnpm/action-setup@v6` (`version: 10.33.1`), `actions/setup-node@v7` (`node-version: 24`, `cache: pnpm`), và `run: pnpm install --frozen-lockfile` với `shell: bash`.
  3. Tuyệt đối không khai báo hay đọc bất kỳ biến `secrets.*` hoặc ghi vào `$GITHUB_ENV`.
- **Success criteria:** File `.github/actions/setup-workspace/action.yml` tồn tại, hợp lệ, cài đặt đúng pnpm `10.33.1` + Node `24` + `pnpm install --frozen-lockfile`, không chứa từ khoá `secrets`.
- **Verify:** `test -f .github/actions/setup-workspace/action.yml` thoát mã `0` (kiểm chứng nội dung đầy đủ nằm ở Task 1.5).

### Task 1.3 — Tạo reusable workflow `.github/workflows/quality.yml` với 4 job song song
- [x] Hoàn thành Task 1.3
- **Goal:** Định nghĩa một nguồn chân lý duy nhất cho cổng quality gồm 4 job song song cân tải trên runner 2 vCPU, quyền tối thiểu `contents: read`, không có `concurrency:` (tránh hủy nhầm deploy đang chạy), và có boolean input `turbo-cache` (`default: false`).
- **Target files and symbols:** `.github/workflows/quality.yml` (`on.workflow_call.inputs.turbo-cache`, `permissions`, `jobs.checks`, `jobs.test-web`, `jobs.test-server`, `jobs.test-workspace`).
- **Steps:**
  1. Tạo `.github/workflows/quality.yml` với `on: workflow_call: inputs: turbo-cache: { type: boolean, required: false, default: false }` (không khai báo `secrets:`).
  2. Đặt `permissions: { contents: read }` ở cấp top-level; **không** khai báo `concurrency:` và **không** dùng `continue-on-error` hay `if:` trên bất kỳ job nào.
  3. Đặt `env: { VITE_SERVER_URL: http://localhost:8000 }` ở cấp top-level của `quality.yml`.
  4. Tạo 4 job song song (`runs-on: ubuntu-latest`, `timeout-minutes: 15`), mỗi job chạy `actions/checkout@v7` rồi `uses: ./.github/actions/setup-workspace`:
     - `checks`: chạy lần lượt `- run: pnpm exec biome check .`, `- run: pnpm check-types`, `- run: pnpm build`.
     - `test-web`: chạy `- run: pnpm exec turbo run test --filter=web`.
     - `test-server`: chạy `- run: pnpm exec turbo run test --filter=server` (Phase 2 sẽ gắn `VITEST_SKIP_SLOW: "1"` sau khi tách `test:ledger`; ở Phase 1 chưa bỏ qua file nào).
     - `test-workspace`: chạy `- run: pnpm exec turbo run test --concurrency=2 --filter=!web --filter=!server` và `- run: pnpm test:ci-workflow && pnpm test:topology-drift && pnpm test:devserver-watchdog && pnpm test:design-compare`.
- **Success criteria:** `quality.yml` chứa đủ 4 job bao phủ 100% tập lệnh của `biome check .`, `pnpm test`, `pnpm check-types`, `pnpm build`, không dùng `secrets`, không có `concurrency`.
- **Verify:** no verification needed (được kiểm tra tự động ngay tại Task 1.5).

### Task 1.4 — Chuyển `ci.yml`, `deploy.yml`, `deploy-staging.yml` sang gọi `quality.yml` và `setup-workspace`
- [x] Hoàn thành Task 1.4
- **Goal:** Thay job `quality` nội tuyến ở cả 3 workflow bằng lời gọi reusable workflow `./.github/workflows/quality.yml` và dùng `./.github/actions/setup-workspace` trong job `deploy` mà không làm đổi bất kỳ logic deploy/smoke/concurrency/secrets nào.
- **Target files and symbols:** `.github/workflows/ci.yml` (`jobs.quality`), `.github/workflows/deploy.yml` (`jobs.quality`, `jobs.deploy`), `.github/workflows/deploy-staging.yml` (`jobs.quality`, `jobs.deploy`).
- **Steps:**
  1. Trong `.github/workflows/ci.yml`: giữ nguyên `on`, `concurrency` (`cancel-in-progress: true`), `permissions: contents: read`; thay toàn bộ `jobs.quality` bằng `uses: ./.github/workflows/quality.yml` kèm `with: { turbo-cache: true }` (không có `secrets:`).
  2. Trong `.github/workflows/deploy.yml`: giữ nguyên `on`, `concurrency` (`cancel-in-progress: false`), `permissions: contents: read`, `env`; thay `jobs.quality` bằng `uses: ./.github/workflows/quality.yml` kèm `with: { turbo-cache: false }` (không có `secrets:`); giữ nguyên `deploy.needs: [quality]`; trong `jobs.deploy.steps`, thay 3 bước `pnpm/action-setup` + `actions/setup-node` + `pnpm install --frozen-lockfile` (ngay sau `actions/checkout@v7`) bằng `- uses: ./.github/actions/setup-workspace`, giữ nguyên 100% bước `Deploy to Cloudflare (stage prod)` và 4 bước smoke check.
  3. Trong `.github/workflows/deploy-staging.yml`: tương tự `deploy.yml` — thay `jobs.quality` bằng `uses: ./.github/workflows/quality.yml` kèm `with: { turbo-cache: false }`, giữ nguyên `deploy.needs: [quality]`, thay 3 bước cài đặt sau `actions/checkout@v7` trong `jobs.deploy.steps` bằng `- uses: ./.github/actions/setup-workspace`, giữ nguyên 100% bước `Deploy to Cloudflare (stage staging)` và 5 bước smoke check.
  4. Cập nhật chú thích đầu file `deploy.yml` / `deploy-staging.yml` cho khớp với việc dùng chung `quality.yml`.
- **Success criteria:** Cả 3 workflow gọi `./.github/workflows/quality.yml`; `deploy.yml` và `deploy-staging.yml` giữ nguyên `needs: [quality]`, `cancel-in-progress: false`, biến môi trường topology và toàn bộ bước deploy/smoke.
- **Verify:** `node --test scripts/topology-drift.test.mjs` thoát mã `0` và in `fail 0`.

### Task 1.5 — Mở rộng và siết chặt hợp đồng `scripts/ci-workflow.test.mjs`
- [x] Hoàn thành Task 1.5
- **Goal:** Cập nhật `scripts/ci-workflow.test.mjs` để khoá chặt kiến trúc reusable `quality.yml`, composite `setup-workspace`, quyền tối thiểu, cấm rò rỉ `secrets`, cấm `concurrency` trong `quality.yml`, và bắt buộc `deploy.needs: [quality]` trên cả prod lẫn staging.
- **Target files and symbols:** `scripts/ci-workflow.test.mjs`.
- **Steps:**
  1. Giữ các kiểm tra trigger `pull_request` / `push` `[main, develop]` trên `ci.yml`, trigger `[staging]` + `workflow_dispatch` trên `deploy-staging.yml`, và kiểm tra `e2e.yml` đã bị gỡ.
  2. Thêm các kiểm tra bắt buộc trên `.github/workflows/quality.yml` và `.github/actions/setup-workspace/action.yml`:
     - Cả hai file tồn tại; `quality.yml` có `workflow_call:`, `permissions:\n  contents: read`, `VITE_SERVER_URL`, `pnpm exec biome check .` (không `--write`), `pnpm check-types`, `pnpm build`.
     - `quality.yml` chạy đủ các phân vùng test (`--filter=web`, `--filter=server`, `--filter=!web --filter=!server`) và chứa **mọi** lệnh `pnpm test:<name>` được khai báo trong `package.json` `scripts.test` (trích xuất động từ `package.json` để thêm script mới ở root mà quên thêm vào `quality.yml` sẽ fail ngay).
     - Cấm mọi tham chiếu `secrets` (`/\bsecrets\b/` ngoài dòng comment `#`) trong `ci.yml`, `quality.yml`, và `setup-workspace/action.yml`.
     - Cấm `concurrency:`, `continue-on-error`, và `always()` trong `quality.yml`.
  3. Kiểm tra khối job `quality:` trong cả 3 file `ci.yml`, `deploy.yml`, `deploy-staging.yml`: đều gọi `uses: ./.github/workflows/quality.yml`, không truyền `secrets:` (chặn cả `secrets: inherit` lẫn map tường minh), `ci.yml` đặt `turbo-cache: true`, còn `deploy.yml` và `deploy-staging.yml` đặt `turbo-cache: false`.
  4. Kiểm tra khối job `deploy:` trên **cả** `deploy.yml` và `deploy-staging.yml`: `needs` bằng đúng `["quality"]`, `cancel-in-progress: false` ở cấp workflow, và không có `continue-on-error` hay `always()`/`failure()` trên job `deploy`.
- **Success criteria:** Toàn bộ suite hợp đồng CI và topology pass, bảo vệ chặt hơn cả bản trước refactor.
- **Verify:** `node --test scripts/ci-workflow.test.mjs scripts/topology-drift.test.mjs && pnpm exec biome check .` thoát mã `0` và in `fail 0`.

## Risiko & Rollback

- Tên check trên GitHub UI đổi từ `quality` sang `quality / checks`, `quality / test-web`, `quality / test-server`, `quality / test-workspace`. Repo hiện không cấu hình branch-protection required check theo tên cũ.
- Khi cần rollback #558 trên `develop`: chỉ revert các commit sau commit merge `origin/main` để không khôi phục nhầm `e2e.yml` của PR #557.

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
