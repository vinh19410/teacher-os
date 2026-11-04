---
title: "#558: Tối ưu thời gian run CI trên workflow deploy"
description: "Rút job quality (~8 phút) xuống ≤ ~4 phút bằng reusable workflow 4 job song song, turbo cache có kiểm soát, phân tách test theo tải 2 vCPU và bỏ build trùng; không bỏ bước nào của gate."
status: in-progress
priority: P2
effort: 5h
issue: 558
branch: ci/558-ci-deploy-speedup
tags: [ci, infra, performance]
blockedBy: []
blocks: []
created: 2026-11-03
---

# Plan: #558 — Tối ưu thời gian run CI trên workflow deploy

Tracking: #558 (`--advice` handover-ready plan; mỗi phase file chứa `## Failure Protocol` bắt buộc dừng và gọi `kongming` nếu bất kỳ bước `Verify` nào trượt).

## Outcome

Từ lúc push `main` (prod) hoặc `staging` đến lúc bước Deploy bắt đầu chạy giảm từ ~8 phút xuống ≤ ~4 phút (kể cả cold run không phụ thuộc cache `.turbo` giữa nhánh). Biome, toàn bộ 12 workspace test suites + 4 root contract suites, `check-types`, và `build` vẫn chạy đủ trước khi deploy. PR/CI thường (`ci.yml`) dùng chung định nghĩa quality kèm `.turbo` cache theo từng job để phản hồi nhanh hơn nữa.

## Hiện trạng đã đo

### Trên GitHub Actions (`ubuntu-latest` 2 vCPU, run #41685858123 & #41623794011)

| Bước | Thời gian | Ghi chú |
|---|---|---|
| Setup (checkout, pnpm, node, install) | ~40–43s | Đã có cache pnpm store |
| `biome check .` | 8s | |
| `pnpm test` | **~320–324s** | `turbo run test` chạy **12 workspace packages** + **4 root `node --test` scripts** trên 2 vCPU; turbo cache 0/12 |
| — `apps/web` | 257s / 176 file | Tranh chấp CPU với `server` + các package khác |
| — `apps/server` | 271s / 97 file | Gồm `ledger-invariants.test.ts` + 96 file test server |
| `pnpm check-types` | ~99–100s | `web`/`student`/`admin` chạy `vite build && tsc --noEmit` |
| `pnpm build` | 14s | Lặp lại `vite build` vừa chạy trong `check-types` |
| Deploy + smoke (4 ở prod, 5 ở staging) | ~89–90s | Không đụng |

### Đo thực nghiệm cục bộ cô lập 2 nhân (`taskset -c 0,1`)

| Nhóm test | Số file | Số test | Thời gian 2-core | Tải CPU |
|---|---|---|---|---|
| `apps/web` (`vitest`) | 176 | 1782 | 180.8s | 184% |
| `apps/server` trừ `ledger-invariants` (`vitest`) | 96 | 1238 | 155.9s | 187% |
| `apps/server` `ledger-invariants.test.ts` (`vitest`) | 1 | 10 (9 pass + 1 expected fail) | 83.0s | 100% |
| 10 workspace còn lại (`student` 42, `admin` 19, `api` 26, `ui` 14, `auth` 9, `db` 2, `infra` 1, `e2e` 1, `landing` 1, `profile` 2) | 117 | 1251 | 100.7s | 129% |
| 4 root contract tests (`scripts/*.test.mjs`) | 4 | 50 (mở rộng lên 53 sau #558) | 15.4s | 48% |
| **Tổng baseline toàn repo** | **394** | **4331** (4334 sau #558) | — | — |

## Hướng làm (đã đối soát qua Validation + Red Team + Kongming)

1. **Phase 1** — Đồng bộ `origin/main` (PR #557 đã gỡ `e2e.yml`) vào nhánh làm việc; tạo composite `.github/actions/setup-workspace/action.yml` và reusable `.github/workflows/quality.yml` (`on: workflow_call`, `permissions: contents: read`, không `concurrency`, không `secrets`, có boolean input `turbo-cache` mặc định `false`). Chia thành **4 job song song cân tải**: `checks` (`biome check .` + `check-types` + `build`), `test-web`, `test-server`, `test-workspace` (10 workspace còn lại + `server#test:ledger` + 4 root contract scripts). Khóa chặt hợp đồng trong `scripts/ci-workflow.test.mjs`.
2. **Phase 2** — Hoàn thiện phân tách `ledger-invariants.test.ts` qua biến môi trường `VITEST_SKIP_SLOW=1` (chỉ đặt ở step `test-server`), cấu hình đúng schema `turbo@2.10` (`env` thay vì nhầm vào `inputs`, bổ sung cross-package `inputs` cho `apps/server/turbo.json`, `globalDependencies: ["package.json"]`), cấu hình `maxWorkers` khi `CI` trên runner 2 vCPU, và bật `.turbo` cache phân tách key theo từng job khi `inputs.turbo-cache == true` (`ci.yml` bật `true`: restore trên PR/push, chỉ save trên `push`; `deploy*.yml` giữ `false` để release gate luôn thực thi thật mà cold wall-clock vẫn ≤ ~4 phút).
3. **Phase 3** — Bỏ chạy trùng `vite build` giữa `check-types` và `build` bằng `dependsOn: ["$TURBO_EXTENDS$", "build"]` ở `apps/{web,student,admin}/turbo.json` + bổ sung `"src/routeTree.gen.ts"` vào `build.outputs` (tận dụng local `.turbo` ngay trong cùng job `checks` cả khi `turbo-cache: false`); thêm `paths-ignore: ["plans/**/*.md", "plans/reports/**/*.html"]` cho `ci.yml` (tuyệt đối không ignore `docs/production-release-runbook.md` hay file code/JSON bị `topology-drift.test.mjs` và `biome check .` kiểm tra); cập nhật `AGENTS.md`, `README.md`, `docs/production-release-runbook.md`.

## Phụ thuộc và rủi ro

- **Đồng bộ `origin/main` trước khi sửa workflow:** `origin/main` (`ba981112`, PR #557) đã xoá `e2e.yml` và sửa `deploy.yml` (`needs: [quality]`) + `scripts/ci-workflow.test.mjs`. Nhánh PR #558 sẽ merge `origin/main` trước ở Phase 1, và khi merge PR #558 vào `develop` phải dùng **merge commit** (không squash) để giữ nguyên lịch sử git ancestry với `origin/main`.
- **Hợp đồng `scripts/ci-workflow.test.mjs` và `scripts/topology-drift.test.mjs`:** Mở rộng `ci-workflow.test.mjs` để khóa không lọt `secrets` ở `ci.yml`, `quality.yml`, `setup-workspace/action.yml` và khối caller `quality:`; khóa `permissions: contents: read`; cấm `concurrency:`, `continue-on-error`, `always()`; khóa `deploy.needs: [quality]` ở **cả** `deploy.yml` lẫn `deploy-staging.yml`; và khóa tập hợp filter trong `quality.yml` phủ kín toàn bộ workspace + mọi script `test:*` ở root `package.json`.
- **Chứng minh red-gate an toàn tuyệt đối:** Không bao giờ dùng `workflow_dispatch` trên `deploy.yml` / `deploy-staging.yml` để thử lỗi (vì có nguy cơ deploy nhầm hoặc bị chặn giả bởi Environment branch policy). Dùng nhánh tạm `probe/558-gate` với workflow tạm `.github/workflows/probe-gate.yml` (`on: push: branches: [probe/**]`) gọi `./.github/workflows/quality.yml` + job `would-deploy` (`needs: [quality]`, không `environment`, không `secrets`), xác nhận qua GitHub API rằng job `would-deploy` bị `skipped` khi một job con của `quality.yml` đỏ, lưu bằng chứng vào `plans/reports/`, rồi xóa nhánh `probe/558-gate`.

## Non-goals

- Không đổi thứ tự hay nội dung bước Deploy và smoke check.
- Không thêm lại e2e vào GitHub Actions (quyết định của #557).
- Không bỏ hoặc nới lỏng bước nào của gate để lấy tốc độ.
- Không shard `apps/web` ra nhiều matrix runner (tránh đội phút runner trên repo private; chỉ xét lại nếu đo thực tế trên GitHub runner vượt ~4 phút).
- Không tự viết task sinh `routeTree.gen.ts` độc lập trước `web#test` (tránh đổi tập test baseline của `routes-matcher.test.ts` ngoài phạm vi #558).
- Không dedupe việc `ci.yml` và `deploy.yml` cùng chạy khi push `main` (giữ nguyên hợp đồng trigger `[main, develop]` của `ci.yml`).

## Acceptance criteria

- [ ] Thời gian chạy thực tế của `quality.yml` trên GitHub Actions `ubuntu-latest` (tương đương thời gian từ lúc trigger đến lúc job `deploy` bắt đầu trên `deploy.yml` / `deploy-staging.yml` ở chế độ cold không `.turbo` cache) ≤ ~4 phút (trung bình 2 run thực tế trên nhánh PR).
- [x] Tổng số file test (394 file) và số test chạy qua 3 job test (`test-web`, `test-server`, `test-workspace`) bằng đúng baseline của toàn bộ 12 workspace packages + 4 root contract suites, không test nào bị bỏ sót.
- [x] `pnpm test`, `pnpm exec biome check .`, `pnpm check-types`, `pnpm build` vẫn chạy cục bộ đầy đủ như cũ (bao gồm `ledger-invariants.test.ts` khi không đặt `VITEST_SKIP_SLOW`).
- [x] `node --test scripts/ci-workflow.test.mjs scripts/topology-drift.test.mjs` xanh và khoá chặt toàn bộ bước gate, quyền `contents: read`, cấm `secrets`, cấm `paths-ignore` chạm `docs/production-release-runbook.md`, và `deploy.needs: [quality]` trên cả prod lẫn staging.
- [x] Chứng minh thực nghiệm trên GitHub Actions (qua nhánh tạm `probe/558-gate` không chứa `environment`/secrets) rằng khi 1 job con trong `quality.yml` đỏ thì job phụ thuộc `needs: [quality]` bị `skipped`, sau đó nhánh probe được dọn sạch.

## Phases

| # | Phase | Trạng thái |
|---|---|---|
| 1 | [Reusable quality workflow + 4 job song song](phase-01-reusable-quality-parallel-jobs.md) | completed |
| 2 | [Cắt thời gian test, cấu hình Turbo env/inputs & cache an toàn](phase-02-cut-test-time.md) | completed |
| 3 | [Bỏ build trùng + paths-ignore an toàn + cập nhật docs](phase-03-dedupe-build-paths-ignore.md) | completed |

## Validation Log

### Session 1 — 2026-11-04
**Trigger:** `/ak-plan validate` trong pipeline `/ak-vibe --ship --beta --advice` cho #558
**Questions asked:** 0 (mọi điểm quyết định mở đã được giải quyết bằng bằng chứng codebase thực nghiệm + khuyến nghị bảo thủ của `kongming`)

#### Verification Results
- **Tier:** Standard (3 phases — Fact Checker + Contract Verifier, 14+ claims/phase checked)
- **Claims checked:** 32
- **Verified:** 23 | **Failed:** 6 | **Unverified:** 3 (resolved via empirical 2-core run & GitHub API)
- **Failures resolved into plan:**
  1. `[Fact Checker]` `plan.md` & `phase-02` ghi `turbo run test` chạy 8 package (385 file) — thực tế chạy **12 workspace packages + 4 root `node --test` scripts = 394 file** (`package.json:25`, `apps/{e2e,landing,profile}/package.json`, `packages/infra/package.json`).
  2. `[Fact Checker]` `phase-02` đặt `VITE_SERVER_URL` trong `turbo.json` `inputs` — sai schema Turborepo v2 (`turbo@2.10.10` dùng `envMode: "strict"`; biến môi trường phải khai báo trong `env`, nếu không sẽ bị lọc bỏ khỏi tiến trình con).
  3. `[Contract Verifier]` `apps/server` đọc file xuyên workspace (`apps/profile/public/**`, `apps/web/public/placement-seed/**`, `apps/e2e/fixtures/exam-import/**`) ngoài `$TURBO_DEFAULT$` (`apps/server/src/lead-catalog-drift.test.ts:17-21`, `validate-file.test.ts:40-44`).
  4. `[Fact Checker]` Chỉ `apps/web/src/routeTree.gen.ts` bị `.gitignore:12` bỏ qua (`student` và `admin` commit sẵn), và `turbo.json:8` `build.outputs` thiếu `"src/routeTree.gen.ts"` làm nổ `tsc --noEmit` khi `web#build` trúng cache; đồng thời package `turbo.json` thiếu `"$TURBO_EXTENDS$"` sẽ ghi đè mất `^check-types`.
  5. `[Contract Verifier]` `scripts/topology-drift.test.mjs:22,64` đọc trực tiếp `docs/production-release-runbook.md` và `biome.json:5,10-42` quét `.json`/`.js`/`.ts` trong `plans/**` và `docs/**` — `paths-ignore` rộng `["plans/**", "docs/**", "**/*.md"]` làm lọt lỗi sang lúc deploy.
  6. `[Contract Verifier]` `scripts/ci-workflow.test.mjs:95-120` chưa khoá `deploy.needs: [quality]` cho `deploy-staging.yml`, và việc gỡ `e2e.yml` trên `origin/main` đã làm mất kiểm tra `/\bsecrets\s*[.[]/` và caller `secrets:`.

#### Confirmed Decisions
- **Kiến trúc 4 job song song (`checks`, `test-web`, `test-server`, `test-workspace`):** Đạt cold wall-clock ≤ ~4 phút trên runner 2 vCPU mà không cần shard `apps/web` và tiết kiệm 1 lượt setup runner (~40s) bằng cách gộp `biome check .` (8s) lên đầu job `checks`.
- **Chính sách `.turbo` cache qua input `turbo-cache`:** Bật `turbo-cache: true` ở `ci.yml` (restore trên PR/push, save chỉ trên `push`, tách key riêng theo từng job); tắt `turbo-cache: false` ở `deploy.yml` và `deploy-staging.yml` để cổng deploy luôn chạy thực tế 100%.
- **Giới hạn `paths-ignore` trong `ci.yml`:** Chỉ ignore `["plans/**/*.md", "plans/reports/**/*.html"]` để bảo vệ hoàn toàn `docs/production-release-runbook.md` và mọi file được Biome kiểm tra.
- **Chiến lược `origin/main` sync:** Merge `origin/main` vào nhánh làm việc ở đầu Phase 1 và dùng merge commit khi hợp nhất PR #558 vào `develop`.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-reusable-quality-parallel-jobs.md`, `phase-02-cut-test-time.md`, `phase-03-dedupe-build-paths-ignore.md`
- Decision deltas checked: 7 (4-job layout, `turbo-cache` boolean input, `turbo.json` strict `env` + cross-package `inputs`, `routeTree.gen.ts` outputs + `$TURBO_EXTENDS$`, narrow `paths-ignore`, probe-branch red-gate proof, 394-file/16-suite baseline)
- Reconciled stale references: 14
- Unresolved contradictions: 0

## Red Team Review

### Session — 2026-11-04
**Findings:** 9 deduplicated from 3 adversarial reviewers (`RedTeamSecurity`, `RedTeamAssumptions`, `RedTeamFailureModes`) (8 accepted, 1 rejected/partial)
**Severity breakdown:** 4 Critical, 3 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | Turborepo v2 `envMode: "strict"` strips `VITEST_SKIP_SLOW`/`VERIFY_DEPTH` & `inputs` rejects env vars | Critical | Accept | Phase 2 |
| 2 | `actions/cache` key collision across parallel jobs + cross-package `server#test` file reads + unsigned cache on deploy | Critical | Accept | Phase 1, Phase 2 |
| 3 | Phase 3 Cách A omits `src/routeTree.gen.ts` from `build.outputs` and clobbers `^check-types` without `$TURBO_EXTENDS$` | Critical | Accept | Phase 3 |
| 4 | Weak `secrets.` regex, missing caller `secrets:` ban, missing `permissions: contents: read` & `deploy-staging.yml` `needs` lock, `concurrency` hazard in `quality.yml`, unsafe `workflow_dispatch` failure rehearsal | Critical | Accept | Phase 1 |
| 5 | Broad `paths-ignore` (`docs/**`, `**/*.md`, `plans/**`) bypasses `topology-drift.test.mjs` runbook checks and `biome check .` | High | Accept | Phase 3 |
| 6 | Single `test` job (`web` 181s + `server` 156s + 10 pkgs 101s on 2 vCPUs) exceeds 4m on cold/promotion runs; `ci-workflow.test.mjs` locks `apps/web` `test` script | High | Accept | Phase 1, Phase 2 |
| 7 | Incomplete 8-of-12 workspace baseline omits 4 workspace packages and 4 root `node --test` suites | Medium | Accept | Phase 1, Phase 2 |
| 8 | Merge `origin/main` ancestry risk if squash-merged or whole-PR reverted | Medium | Accept (modified: use merge commit + post-sync revert guidance) | Phase 1 |
| 9 | Migrate all GitHub Actions across repo from major version tags (`@v6`/`@v7`) to 40-char commit SHAs | Medium | Reject (out of scope without Renovate/Dependabot; pinned `actions/cache@v6` explicitly per repo convention) | Phase 2 |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-reusable-quality-parallel-jobs.md`, `phase-02-cut-test-time.md`, `phase-03-dedupe-build-paths-ignore.md`
- Decision deltas checked: 9
- Reconciled stale references: 14
- Unresolved contradictions: 0
