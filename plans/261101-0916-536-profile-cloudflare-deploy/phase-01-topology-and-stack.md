---
phase: 1
title: "Thêm profile vào topology và stack"
status: completed
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Thêm profile vào topology và stack

## Goal

Mô tả `profile` trong topology và stack Alchemy kèm canonical tag, smoke check CI/CD, drift test và tài liệu, sau đó mở PR vào `develop`, review và merge theo hợp đồng beta pipeline (kèm cảnh báo rõ SHA `7d331c05b305fbe7fd16b98fb0942e5ab93a68cb` trước merge để đợt 1 promote server không kéo theo `profileWorker`). <!-- Updated: Red Team RT-5 & Kongming -->

## Files to Create / Modify

- Modify: `packages/infra/src/topology.ts`, `packages/infra/src/topology.test.ts`
- Modify: `packages/infra/alchemy.run.ts`
- Modify: `apps/profile/public/index.html`, `apps/profile/public/kiem-tra-dau-vao/index.html` (canonical)
- Modify: `apps/profile/tests/index.test.mjs`, `apps/profile/tests/placement-test.test.mjs` <!-- Updated: Red Team RT-4 -->
- Modify: `.github/workflows/deploy.yml`, `.github/workflows/deploy-staging.yml`
- Modify: `scripts/topology-drift.test.mjs`
- Modify: `docs/production-release-runbook.md`, `docs/system-architecture.md`, `docs/codebase-summary.md`, `CHANGELOG.md`

## Tasks & Steps

### Task 1.1 — Viết test TDD (Red) cho `profileHost`, `profileAliases`, `profileOrigins` và `resolveLeadOrigins`
- **Goal:** Khóa hợp đồng `DomainTopology` và `resolveLeadOrigins` trong `packages/infra/src/topology.test.ts` trước khi sửa implementation.
- **Target files and symbols:**
  - `packages/infra/src/topology.test.ts` (`resolveDomainTopology`, `resolveLeadOrigins`, `PROD_PROFILE_DOMAIN`, `DEFAULT_DEV_LEAD_ORIGINS`)
- **Steps:**
  1. Trong `packages/infra/src/topology.test.ts`, thay import `DEFAULT_PROD_LEAD_ORIGINS` bằng `PROD_PROFILE_DOMAIN`.
  2. Cập nhật `it("derives the exact app/api origins for a bare domain")` (`teacher-os.edu.vn`) thêm `profileHost: "profile.teacher-os.edu.vn"`, `profileAliases: []`, `profileOrigins: ["https://profile.teacher-os.edu.vn"]`.
  3. Thêm các test khẳng định:
     - Với `PROD_APP_DOMAIN` (`teacheros.io.vn`): `profileHost === "msmy.io.vn"`, `profileAliases` là `["www.msmy.io.vn"]`, `profileOrigins` là `["https://msmy.io.vn", "https://www.msmy.io.vn"]`.
     - Với `staging.teacheros.io.vn` và domain bất kỳ khác: `profileHost === "profile.<domain>"`, `profileAliases` là `[]`, `profileOrigins` là `["https://profile.<domain>"]`, và tuyệt đối không chứa `msmy.io.vn`.
  4. Cập nhật `describe("resolveLeadOrigins (#524)")`:
     - Truyền `{ topology: resolveDomainTopology(PROD_APP_DOMAIN), isDev: false }` khi `raw` rỗng/khoảng trắng/chỉ dấu phẩy → trả về `"https://msmy.io.vn,https://www.msmy.io.vn"`.
     - Truyền `{ topology: resolveDomainTopology("staging.teacheros.io.vn"), isDev: false }` khi `raw` rỗng → trả về `"https://profile.staging.teacheros.io.vn"`.
     - Khi `raw` có giá trị explicit → giữ nguyên hành vi trim + join các phần tử không rỗng.
     - Khi `{ topology: undefined, isDev: true }` và `raw` rỗng → trả về `DEFAULT_DEV_LEAD_ORIGINS` (`"http://localhost:8005"`).
     - Khi `{ topology: undefined, isDev: false }` và `raw` rỗng → ném lỗi `/LEAD_ORIGINS must be set/`.
- **Success criteria:** Test chạy fail (Red phase) vì `profileHost`, `profileAliases`, `profileOrigins`, `PROD_PROFILE_DOMAIN` và chữ ký mới của `resolveLeadOrigins` chưa được hiện thực.
- **Verify:** `pnpm --filter @teacher-os/infra test` exits non-zero with assertion/import failure; passing test is a failure.

### Task 1.2 — Hiện thực `DomainTopology`, `resolveLeadOrigins` và resource `profileWorker` trong `packages/infra` (Green)
- **Goal:** Hiện thực `profileHost`, `profileAliases`, `profileOrigins` trong `packages/infra/src/topology.ts`, cập nhật `resolveLeadOrigins` và khai báo `StaticSite("profile")` trong `packages/infra/alchemy.run.ts`. <!-- Updated: Red Team RT-1, RT-2 -->
- **Target files and symbols:**
  - `packages/infra/src/topology.ts` (`DomainTopology`, `PROD_PROFILE_DOMAIN`, `resolveDomainTopology`, `resolveLeadOrigins`)
  - `packages/infra/alchemy.run.ts` (`leadOrigins`, `profileWorker`)
- **Steps:**
  1. Trong `packages/infra/src/topology.ts`:
     - Thêm `profileHost: string`, `profileAliases: string[]`, `profileOrigins: string[]` vào `DomainTopology`.
     - Export `export const PROD_PROFILE_DOMAIN = "msmy.io.vn";`.
     - Trong `resolveDomainTopology(appDomain)`: khi `domain === PROD_APP_DOMAIN`, đặt `profileHost = PROD_PROFILE_DOMAIN` và `profileAliases = [\`www.${PROD_PROFILE_DOMAIN}\`]`; ngược lại đặt `profileHost = \`profile.${domain}\`` và `profileAliases = []`. Tính `profileOrigins = [profileHost, ...profileAliases].map((h) => \`https://${h}\`)`.
     - Xóa `DEFAULT_PROD_LEAD_ORIGINS` và đổi chữ ký `resolveLeadOrigins(raw: string | undefined, options: { topology?: Pick<DomainTopology, "profileOrigins">; isDev: boolean }): string`: khi `entries.length > 0` trả `entries.join(",")`; khi `options.topology` có mặt trả `options.topology.profileOrigins.join(",")`; khi `options.isDev` trả `DEFAULT_DEV_LEAD_ORIGINS`; ngược lại ném lỗi `"LEAD_ORIGINS must be set when deploying without APP_DOMAIN"`.
  2. Trong `packages/infra/alchemy.run.ts`:
     - Cập nhật lời gọi `resolveLeadOrigins(process.env.LEAD_ORIGINS, { topology, isDev: isDevCommand })`.
     - Thêm `profileWorker` bằng `Cloudflare.Website.StaticSite("profile", { cwd: "../../apps/profile", command: "pnpm build", outdir: "dist", env: { LEAD_API_URL: topology ? topology.apiOrigin : serverWorker.url.as<string>() }, assets: { htmlHandling: "auto-trailing-slash", notFoundHandling: "none" }, ...(topology && { domain: { name: topology.profileHost, aliases: topology.profileAliases }, workersDev: false }), dev: { command: "pnpm dev:bare", url: "http://localhost:8005" } })` và thêm `profile: profileWorker.url` vào object return của `Alchemy.Stack`.
- **Success criteria:** Toàn bộ unit test và typecheck của `@teacher-os/infra` xanh.
- **Verify:** `pnpm --filter @teacher-os/infra test && pnpm --filter @teacher-os/infra check-types` exits 0.

### Task 1.3 — Thêm thẻ `<link rel="canonical">` cho `apps/profile` kèm kiểm thử TDD
- **Goal:** Gắn `<link rel="canonical" href="https://msmy.io.vn/">` vào `apps/profile/public/index.html` và `<link rel="canonical" href="https://msmy.io.vn/kiem-tra-dau-vao/">` vào `apps/profile/public/kiem-tra-dau-vao/index.html`, khóa bằng test ở `index.test.mjs` và `placement-test.test.mjs`. <!-- Updated: Red Team RT-4 -->
- **Target files and symbols:**
  - `apps/profile/tests/index.test.mjs`
  - `apps/profile/tests/placement-test.test.mjs`
  - `apps/profile/public/index.html`
  - `apps/profile/public/kiem-tra-dau-vao/index.html`
- **Steps:**
  1. Thêm assertion kiểm tra `<link rel="canonical" href="https://msmy.io.vn/">` trong `apps/profile/tests/index.test.mjs` và `<link rel="canonical" href="https://msmy.io.vn/kiem-tra-dau-vao/">` trong `apps/profile/tests/placement-test.test.mjs` (cả file nguồn `public/` lẫn file xuất `dist/` từ `buildProfile`).
  2. Thêm `<link rel="canonical" href="https://msmy.io.vn/">` vào `<head>` của `apps/profile/public/index.html` và `<link rel="canonical" href="https://msmy.io.vn/kiem-tra-dau-vao/">` vào `<head>` của `apps/profile/public/kiem-tra-dau-vao/index.html`.
  3. Chạy test và build thử `apps/profile` với `LEAD_API_URL=https://api.staging.teacheros.io.vn`.
- **Success criteria:** Cả hai trang HTML có đúng thẻ canonical về apex `msmy.io.vn`, và `build.mjs` thay đúng `meta[name="lead-api"]` mà giữ nguyên canonical.
- **Verify:** `pnpm --filter profile test && LEAD_API_URL=https://api.staging.teacheros.io.vn pnpm --filter profile build && grep -Fq '<meta name="lead-api" content="https://api.staging.teacheros.io.vn">' apps/profile/dist/index.html && grep -Fq '<meta name="lead-api" content="https://api.staging.teacheros.io.vn">' apps/profile/dist/kiem-tra-dau-vao/index.html && pnpm --filter profile build` exits 0.

### Task 1.4 — Thêm `PROFILE_ORIGIN`, `Smoke check profile` và drift test cho workflow deploy
- **Goal:** Cập nhật `.github/workflows/deploy.yml`, `.github/workflows/deploy-staging.yml` và khóa hợp đồng bằng `scripts/topology-drift.test.mjs`. <!-- Updated: Red Team RT-3, RT-4 -->
- **Target files and symbols:**
  - `scripts/topology-drift.test.mjs`
  - `.github/workflows/deploy.yml` (`env.PROFILE_ORIGIN`, `env.PROFILE_WWW_ORIGIN`, `timeout-minutes`, step `Smoke check profile`)
  - `.github/workflows/deploy-staging.yml` (`env.PROFILE_ORIGIN`, `timeout-minutes`, step `Smoke check profile`)
- **Steps:**
  1. Trong `scripts/topology-drift.test.mjs`, thêm các test:
     - `PROFILE_ORIGIN` của `deploy.yml` (`https://msmy.io.vn`) và `deploy-staging.yml` (`https://profile.staging.teacheros.io.vn`) khớp `https://${resolveDomainTopology(APP_DOMAIN).profileHost}` và `resolveDomainTopology(APP_DOMAIN).profileOrigins[0]`; `resolveDomainTopology(stagingAppDomain).profileOrigins` không bao giờ chứa `msmy.io.vn`.
     - Cổng dev `8005` của `profile` đồng nhất giữa `DEFAULT_DEV_LEAD_ORIGINS` (`packages/infra/src/topology.ts`), `dev.url` của `profileWorker` (`packages/infra/alchemy.run.ts`) và `apps/profile/serve.mjs`.
     - Cả hai workflow deploy đều có bước `Smoke check profile`.
  2. Trong `.github/workflows/deploy.yml`:
     - Thêm `PROFILE_ORIGIN: https://msmy.io.vn` vào `env` cấp workflow và nâng `timeout-minutes` của job `deploy` từ `20` lên `30`.
     - Thêm step `Smoke check profile` (poll tối đa 30 lần × 20s): kiểm tra `$PROFILE_ORIGIN/` và `$PROFILE_ORIGIN/kiem-tra-dau-vao/` đều trả `200`, `content-type: text/html`, chứa `<meta name="lead-api" content="$API_BASE_URL">`; kiểm tra `https://www.msmy.io.vn/` trả `200` `text/html`; và kiểm tra `$PROFILE_ORIGIN/kiem-tra-dau-vao` (không dấu `/` cuối) trả redirect `301`/`307`/`308` tới `/kiem-tra-dau-vao/`.
  3. Trong `.github/workflows/deploy-staging.yml`:
     - Thêm `PROFILE_ORIGIN: https://profile.staging.teacheros.io.vn` vào `env` cấp workflow và nâng `timeout-minutes` của job `deploy` từ `20` lên `30`.
     - Thêm step `Smoke check profile` (poll tối đa 30 lần × 20s): kiểm tra `$PROFILE_ORIGIN/` và `$PROFILE_ORIGIN/kiem-tra-dau-vao/` đều trả `200`, `content-type: text/html`, chứa `<meta name="lead-api" content="$API_BASE_URL">`; và kiểm tra `$PROFILE_ORIGIN/kiem-tra-dau-vao` trả redirect `301`/`307`/`308` tới `/kiem-tra-dau-vao/`.
- **Success criteria:** Các bài test drift và CI workflow đều pass.
- **Verify:** `node --test scripts/topology-drift.test.mjs scripts/ci-workflow.test.mjs` exits 0.

### Task 1.5 — Cập nhật tài liệu vận hành, kiến trúc và `CHANGELOG.md`
- **Goal:** Đồng bộ `docs/production-release-runbook.md`, `docs/system-architecture.md`, `docs/codebase-summary.md` và `CHANGELOG.md` (`## 2026-11-01`). <!-- Updated: Red Team RT-4, RT-5 -->
- **Target files and symbols:**
  - `docs/production-release-runbook.md`
  - `docs/system-architecture.md`
  - `docs/codebase-summary.md`
  - `CHANGELOG.md`
- **Steps:**
  1. Trong `docs/production-release-runbook.md`:
     - Thêm dòng `Profile origin` (`https://msmy.io.vn` + `https://www.msmy.io.vn` trên prod, `https://profile.<domain>` trên stage khác) và `LEAD_API_URL (profile build)` vào bảng Topology, cập nhật mô tả staging (`https://profile.staging.teacheros.io.vn`).
     - Cập nhật dòng `LEAD_ORIGINS` ở bảng Lead intake (#506) dòng 101: mặc định lấy từ `topology.profileOrigins` (`https://msmy.io.vn,https://www.msmy.io.vn` trên prod, `https://profile.staging.teacheros.io.vn` trên staging); cảnh báo không để biến `LEAD_ORIGINS` cũ trên GitHub Environment `staging`/`production` làm mất origin mặc định của stage.
     - Thay bước 5 của mục thứ tự phát hành bộ đề (#515) bằng cơ chế deploy tự động qua `deploy.yml` (giữ nguyên cổng: bộ đề phải được phát hành ở bước 3–4 trước khi đưa resource `profile` lên prod; ghi rõ SHA `7d331c05b305fbe7fd16b98fb0942e5ab93a68cb` nếu cần promote riêng `server` ở đợt 1).
     - Bổ sung vào mục Deploy preflight yêu cầu xác nhận zone `msmy.io.vn` cùng Cloudflare account và `CLOUDFLARE_API_TOKEN` có quyền trên zone `msmy.io.vn`.
  2. Cập nhật `docs/system-architecture.md` và `docs/codebase-summary.md` phản ánh `apps/profile` được đóng gói qua `Cloudflare.Website.StaticSite("profile")` trong `packages/infra/alchemy.run.ts` với topology `msmy.io.vn` (+ `www`) trên prod và `profile.<domain>` trên staging.
  3. Thêm mục dưới `## 2026-11-01` (`### CI/Infra`) trong `CHANGELOG.md` mô tả việc đưa `apps/profile` vào stack Alchemy, topology, smoke check và runbook (#536).
- **Success criteria:** Toàn bộ local gate (`biome check`, `check-types`, `test`, `build`) chạy xanh.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm test && pnpm build` exits 0.

## Verification

- `pnpm --filter @teacher-os/infra test` xanh, gồm test: staging và domain lạ không bao giờ có `msmy.io.vn`.
- `node --test scripts/topology-drift.test.mjs scripts/ci-workflow.test.mjs` xanh.
- `pnpm --filter profile test` xanh.
- `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, `pnpm build` xanh.
- `LEAD_API_URL=https://api.staging.teacheros.io.vn pnpm --filter profile build` rồi xác nhận meta trong cả hai file HTML đã đổi.

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
