---
phase: 1
title: "Thêm profile vào topology và stack"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Thêm profile vào topology và stack

## Goal

Mô tả profile trong topology và stack Alchemy kèm smoke và tài liệu, rồi mở PR vào `develop` nhưng **chưa merge**.

## Files to Create / Modify

- Modify: `packages/infra/src/topology.ts`, `packages/infra/src/topology.test.ts`
- Modify: `packages/infra/alchemy.run.ts`
- Modify: `apps/profile/public/index.html`, `apps/profile/public/kiem-tra-dau-vao/index.html` (canonical)
- Modify: `apps/profile/tests/index.test.mjs`
- Modify: `.github/workflows/deploy.yml`, `.github/workflows/deploy-staging.yml`
- Modify: `scripts/topology-drift.test.mjs`
- Modify: `docs/production-release-runbook.md`, `docs/system-architecture.md`, `docs/codebase-summary.md`, `CHANGELOG.md`

## Tasks & Steps

1. Tạo branch `feat/536-profile-cloudflare-deploy` từ `origin/develop`.
2. Trong `topology.ts`, thêm `profileHost`, `profileAliases`, `profileOrigins` vào `DomainTopology`:
   - `APP_DOMAIN === PROD_APP_DOMAIN`: host `msmy.io.vn`, alias `www.msmy.io.vn`, origins cả hai.
   - Domain khác: host `profile.<domain>`, không alias, một origin.
3. Đổi `resolveLeadOrigins`: nhánh topology rơi về `topology.profileOrigins` thay vì hằng số prod. Giữ nguyên hành vi với giá trị explicit và với dev. Cập nhật test tương ứng.
4. Thêm resource vào `alchemy.run.ts` theo mẫu `landing`:

   ```ts
   const profileWorker = yield* Cloudflare.Website.StaticSite("profile", {
   	cwd: "../../apps/profile",
   	command: "pnpm build",
   	outdir: "dist",
   	env: {
   		LEAD_API_URL: topology
   			? topology.apiOrigin
   			: serverWorker.url.as<string>(),
   	},
   	assets: {
   		htmlHandling: "auto-trailing-slash",
   		notFoundHandling: "none",
   	},
   	...(topology && {
   		domain: { name: topology.profileHost, aliases: topology.profileAliases },
   		workersDev: false,
   	}),
   	dev: { command: "pnpm dev:bare", url: "http://localhost:8005" },
   });
   ```

   Thêm `profile: profileWorker.url` vào object trả về. Đối chiếu `env` và `domain.aliases` với type của `alchemy@2.0.0-beta.72`: tài liệu công khai có mô tả cả hai nhưng là bản mới nhất. Nếu `env` không truyền vào build ở bản này, dùng `command` kèm biến inline.
5. Thêm `<link rel="canonical">` trỏ `https://msmy.io.vn/` và `https://msmy.io.vn/kiem-tra-dau-vao/`; thêm assertion vào test profile.
6. Thêm `PROFILE_ORIGIN` vào `env` của hai workflow (`https://msmy.io.vn`, `https://profile.staging.teacheros.io.vn`) và step `Smoke check profile`, poll tối đa khoảng 10 phút như landing:
   - `/` trả `200`, `text/html`, và chứa `<meta name="lead-api" content="$API_BASE_URL">`.
   - `/kiem-tra-dau-vao/` trả `200`.
7. Thêm drift test: `PROFILE_ORIGIN` của mỗi workflow khớp `resolveDomainTopology(...)`.
8. Cập nhật tài liệu:
   - Runbook: thêm dòng profile vào bảng topology; thay bước 5 của mục phát hành bộ đề bằng "merge PR profile, `deploy.yml` tự build và deploy"; giữ nguyên yêu cầu thứ tự.
   - Thêm vào preflight: zone msmy.io.vn phải cùng account và CI token phải có quyền trên zone này.
   - Cập nhật `system-architecture.md`, `codebase-summary.md`, mục `[Unreleased]` của `CHANGELOG.md`.
9. Mở PR vào `develop`, ghi rõ trên PR: **chưa merge cho đến khi Phase 2 xong**.

## Verification

- `pnpm --filter @teacher-os/infra test` xanh, gồm test: staging và domain lạ không bao giờ có `msmy.io.vn`.
- `node --test scripts/topology-drift.test.mjs scripts/ci-workflow.test.mjs` xanh.
- `pnpm --filter profile test` xanh.
- `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, `pnpm build` xanh.
- `LEAD_API_URL=https://api.staging.teacheros.io.vn pnpm --filter profile build` rồi xác nhận meta trong cả hai file HTML đã đổi.
