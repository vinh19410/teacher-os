# Journal: Ship #536 — Deploy apps/profile lên Cloudflare tại msmy.io.vn (Phase 1)

- **Date:** 2026-11-01
- **Issue:** [#536](https://github.com/vinh19410/teacher-os/issues/536)
- **Branch:** `feat/536-profile-cloudflare-deploy`
- **Plan:** `plans/261101-0916-536-profile-cloudflare-deploy/plan.md`

## Tóm tắt kỹ thuật

1. **Topology & `resolveLeadOrigins` (`packages/infra/src/topology.ts`, `topology.test.ts`):**
   - Bổ sung `PROD_PROFILE_DOMAIN = "msmy.io.vn"` và các trường `profileHost`, `profileAliases`, `profileOrigins` vào `DomainTopology`: trên production (`APP_DOMAIN === PROD_APP_DOMAIN`) gắn `msmy.io.vn` + alias `www.msmy.io.vn`; trên mọi domain khác (`staging.teacheros.io.vn`, preview, domain tùy chỉnh) dùng `profile.<domain>` không có alias.
   - Đổi `resolveLeadOrigins` sang nhận `{ topology?: Pick<DomainTopology, "profileOrigins">; isDev: boolean }` và xóa `DEFAULT_PROD_LEAD_ORIGINS`, giúp staging tự nhận `https://profile.staging.teacheros.io.vn` làm mặc định `LEAD_ORIGINS` mà không bao giờ gắn nhầm `msmy.io.vn`.
2. **Resource `StaticSite("profile")` & Canonical (`packages/infra/alchemy.run.ts`, `apps/profile`):**
   - Khai báo `profileWorker` bằng `Cloudflare.Website.StaticSite("profile")` truyền `LEAD_API_URL` (`topology ? topology.apiOrigin : serverWorker.url.as<string>()`) vào cả `Command.Build` (`pnpm build`) và `Command.Dev` (`pnpm dev:bare` ở cổng `8005`), cấu hình `htmlHandling: "auto-trailing-slash"`, gắn custom domain theo `topology` và xuất `profile: profileWorker.url`.
   - Thêm `<link rel="canonical" href="https://msmy.io.vn/">` vào `apps/profile/public/index.html` và `<link rel="canonical" href="https://msmy.io.vn/kiem-tra-dau-vao/">` vào `apps/profile/public/kiem-tra-dau-vao/index.html`.
3. **CI/CD Smoke Check, Drift Test & Runbook 2 đợt (`.github/workflows/deploy*.yml`, `scripts/topology-drift.test.mjs`, `docs/*`):**
   - Thêm `PROFILE_ORIGIN`, nâng `timeout-minutes` của job `deploy` từ `20` lên `30`, và thêm bước `Smoke check profile` kiểm tra cả `/` lẫn `/kiem-tra-dau-vao/` (status `200`, `text/html`, `<meta name="lead-api" content="$API_BASE_URL">`), redirect `301/307/308` tại `/kiem-tra-dau-vao`, và alias `https://www.msmy.io.vn/` trên production.
   - Khóa chống lệch `PROFILE_ORIGIN` và cổng dev `8005` trong `scripts/topology-drift.test.mjs`; cập nhật `docs/production-release-runbook.md` ghi rõ SHA `7d331c05b305fbe7fd16b98fb0942e5ab93a68cb` trước khi merge PR này để đợt 1 promote riêng `server` lên `main` trước khi cô Mỹ phát hành bộ đề và dọn DNS `msmy.io.vn`.
