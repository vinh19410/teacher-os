---
phase: 2
title: "Workflow CI audit-663.yml read-only + test gate cơ học"
status: pending
priority: P1
effort: "45m"
dependencies: [1]
---

# Phase 2: Workflow CI audit-663.yml read-only + test gate cơ học

## Goal
Workflow `workflow_dispatch` mới chạy script audit (chế độ đọc) trên D1 thật staging/prod qua GitHub Environment, serialize với deploy; kèm **test gate cơ học trong `ci-workflow.test.mjs`** chốt vĩnh viễn tính read-only (repo convention: workflow chạm secrets thì có gate — precedent `state-migrate.yml` có test riêng tại `scripts/ci-workflow.test.mjs:804-842`).

## Files to Create / Modify
- Create: `.github/workflows/audit-663.yml`
- Modify: `scripts/ci-workflow.test.mjs` — thêm 1 test block assert tính chất an toàn của workflow mới.

## Context kỹ thuật

- Precedent bắt buộc làm mẫu: `.github/workflows/state-migrate.yml` — đọc kỹ trước khi viết.
- Cấu trúc copy từ precedent:
  - `on.workflow_dispatch.inputs.stage`: choice `[staging, prod]`, required. KHÔNG input khác (không có input cho phép ghi).
  - `concurrency.group`: `deploy-${{ inputs.stage == 'prod' && 'production' || 'staging' }}`, `cancel-in-progress: false` (serialize với deploy — tránh query giữa migration đổi shape bảng).
  - `permissions.contents: read`.
  - Job `audit`: `runs-on: ubuntu-latest`, `timeout-minutes: 15`, `environment: ${{ inputs.stage == 'prod' && 'production' || 'staging' }}`.
  - Steps: `actions/checkout@v7` → `./.github/actions/setup-workspace` → chạy script với env secrets (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` — đúng 2 secrets này, không secret khác).
- Step chạy: `pnpm --filter @teacher-os/db exec tsx scripts/audit-663-orphan-materials.ts --d1 --d1-stage "${{ inputs.stage }}"`. KHÔNG truyền cờ ghi (cờ apply) — mode `--d1` của script in mỗi số tổng hợp (chính sách repo PUBLIC, phase 1).
- Comment đầu file nêu mục đích #663 + ràng buộc chỉ-đọc. **Chú ý ngôn từ**: comment DÙNG chữ "chỉ đọc / read-only / no write mode", TRÁNH substring cờ ghi để test assert `doesNotMatch(/apply/)` không bắt nhầm prose (red-team S7/F4).
- Kỳ vọng sẵn có: Environment `staging`/`production` giữ 2 secrets (chứng minh: `state-migrate.yml` chạy được). Environment `production` có thể đòi reviewer approval — run chờ là hành vi đúng.
- **Lint YAML**: biome KHÔNG xử lý YAML (chạy thử trên precedent: `No files were processed`, exit 1 — red-team A2/F4) → KHÔNG đưa biome vào verify cho file này; YAML validate bằng `python3 -c "import yaml;yaml.safe_load(open('.github/workflows/audit-663.yml'))"` (ubuntu runner có sẵn PyYAML).

## Tasks & Steps

### Task 2.1 — Viết workflow + test gate
- Goal: file workflow đúng precedent; test gate cơ học chạy xanh và có khả năng chặn regress.
- Target files: `.github/workflows/audit-663.yml`; `scripts/ci-workflow.test.mjs`.
- Steps:
  1. Viết workflow theo Context.
  2. Trong `scripts/ci-workflow.test.mjs`, thêm test `audit-663.yml ...` assert (style giống block `state-migrate.yml` `:804-842`): (a) chỉ `workflow_dispatch`, không trigger `push`/`pull_request`; (b) `permissions: contents: read`; (c) concurrency group dùng đúng biểu thức `deploy-${{ inputs.stage == 'prod' && 'production' || 'staging' }}` + `cancel-in-progress: false`; (d) run-step KHÔNG chứa substring `apply` (regex `doesNotMatch`); (e) không `actions/upload-artifact`; (f) env của step chạy script chỉ gồm đúng 2 secrets `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN`; (g) environment mapping prod↔production.
- Success criteria: YAML parse bằng python3 được; 7 assert trên pass; test gate có ý nghĩa (thử bỏ 1 tính chất → test đỏ, khôi phục → xanh — làm 1 lần thủ công khi viết test).
- Verify: `python3 -c "import yaml;yaml.safe_load(open('.github/workflows/audit-663.yml'))" && pnpm test:ci-workflow` exit 0.

### Task 2.2 — Gate repo
- Goal: lint/type/test toàn repo không đỏ vì file mới.
- Steps: `pnpm exec biome check scripts/ci-workflow.test.mjs` (file .mjs là TS/JS — biome xử lý được), `pnpm check-types`, `pnpm test:ci-workflow`, `pnpm test:topology-drift`.
- Success criteria: cả bốn exit 0.
- Verify: `pnpm exec biome check scripts/ci-workflow.test.mjs && pnpm test:ci-workflow && pnpm test:topology-drift` exit 0.

## Regression gate
- `pnpm test:ci-workflow && pnpm test:topology-drift` — xanh.

## Tests Before
Test gate Task 2.1 (b)–(g) viết CÙNG lúc workflow — chạy RED bằng cách viết test trước khi có file workflow (import/read file fail), rồi viết workflow cho xanh.

## TDD Refactor
Không áp dụng (YAML + test khẳng định).

## Tests After
Không áp dụng.

## Verification (tổng phase)
- [ ] `python3 -c "import yaml;yaml.safe_load(open('.github/workflows/audit-663.yml'))"` exit 0
- [ ] `pnpm test:ci-workflow` exit 0 (gồm test gate mới)
- [ ] `pnpm exec biome check scripts/ci-workflow.test.mjs` exit 0
- [ ] Test gate có khả năng chặn: thử nghiệm 1 lần bỏ `permissions` → test đỏ → khôi phục

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
