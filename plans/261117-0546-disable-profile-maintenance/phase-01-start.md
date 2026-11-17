---
phase: 1
title: "Profile Maintenance Mode & Infra Routing"
status: done
priority: P1
effort: 1h
dependencies: []
---

# Phase 1: Profile Maintenance Mode & Infra Routing

## Goal

Cài đặt cơ chế maintenance mode dùng chung cho `apps/profile` (`build.mjs`, `serve.mjs`), `packages/infra/alchemy.run.ts`, và `turbo.json` qua cờ cấu hình `apps/profile/maintenance.json` mà vẫn bảo toàn nguyên vẹn `apps/profile/public/**` và 74 test hiện có.

## Files to Create / Modify

- Create: `apps/profile/maintenance.json` — single source of truth `{ "disabled": true }`
- Create: `apps/profile/maintenance.mjs` — đọc `maintenance.json` qua `new URL("./maintenance.json", import.meta.url)`, hỗ trợ env override `PROFILE_MAINTENANCE`, xuất `renderMaintenanceHtml()` thuần túy (`"Trang web đang trong quá trình phát triển"`, `noindex,nofollow`, không có `<a>`/`<button>`/`<form>`, không external script/font)
- Create: `apps/profile/tests/maintenance.test.mjs` — unit & HTTP integration tests cho chế độ mặc định (`disabled: true`), bypass method `POST /noi-bo/` (`405`), headers `Cache-Control` + `X-Robots-Tag`, cách ly `process.env.PROFILE_MAINTENANCE`, và override (`PROFILE_MAINTENANCE=false`)
- Modify: `apps/profile/build.mjs` (lines 7-40) — nhận option `maintenance = isProfileMaintenanceEnabled()`; khi `true` gọi `mkdir(..., { recursive: true })` và ghi `renderMaintenanceHtml()` vào `dist/index.html`, `dist/kiem-tra-dau-vao/index.html`, `dist/kiem-tra-dau-vao/ket-qua/index.html`, và `dist/noi-bo/index.html` (không copy `assets/` hay `.mp4` hay HTML gốc) <!-- Updated: Red Team RT-2, RT-5 -->
- Modify: `apps/profile/serve.mjs` (lines 112-234) — nhận option `maintenance` trong `createProfileServer(..., options)`; khi `true`, giữ `400` cho malformed URL / null-byte và short-circuit mọi method trước khi chạm `root`: `GET`/`HEAD` trả `200 text/html` maintenance HTML kèm `Cache-Control: no-cache, no-store, must-revalidate`, `X-Robots-Tag: noindex, nofollow`, `X-Content-Type-Options: nosniff`; mọi method khác trả `405 Method Not Allowed` (`Allow: GET, HEAD`). Giữ nguyên `const port = Number(process.env.PORT) || 8005;` và `STUDENT_PORTAL_URL ?? "http://localhost:8003"` để thỏa `scripts/topology-drift.test.mjs` <!-- Updated: Red Team RT-3, RT-9 -->
- Modify: `apps/profile/tests/index.test.mjs` (lines 394-462, 1598-1646) — truyền `{ maintenance: false }` vào `createProfileServer` / `buildProfile` ở 2 test bảo toàn source gốc <!-- Updated: Red Team RT-1 -->
- Modify: `apps/profile/tests/placement-test.test.mjs` (lines 522-561) — truyền `{ maintenance: false }` vào `createProfileServer` / `buildProfile` ở 2 test bảo toàn source gốc <!-- Updated: Red Team RT-1 -->
- Modify: `apps/profile/tests/placement-result.test.mjs` (lines 150-154) — truyền `{ maintenance: false }` vào `buildProfile` ở test bảo toàn source gốc <!-- Updated: Red Team RT-1 -->
- Modify: `packages/infra/alchemy.run.ts` (lines 403-431) — dùng `readFileSync(new URL("../../apps/profile/maintenance.json", import.meta.url), "utf8")` kết hợp `process.env.PROFILE_MAINTENANCE` (cùng rule với `maintenance.mjs`) để đặt `notFoundHandling: profileDisabled ? "single-page-application" : "none"` trên `Cloudflare.Website.StaticSite("profile")` <!-- Updated: Red Team RT-4 -->
- Modify: `turbo.json` (lines 13-18, 35-41) — thêm `"PROFILE_MAINTENANCE"` vào `tasks.build.env` và `tasks.test.env` <!-- Updated: Red Team RT-4 -->

## Tests Before

1. Viết `apps/profile/tests/maintenance.test.mjs` kiểm tra:
   - Lưu và khôi phục `process.env.PROFILE_MAINTENANCE` trong `try/finally`.
   - `maintenance.json` mặc định `disabled: true` và `isProfileMaintenanceEnabled()` xử lý `undefined`, `"false"`, `"0"`, `"true"`, `"1"`.
   - `createProfileServer()` mặc định trả `200`, `text/html; charset=utf-8`, exact `Content-Length`, `Cache-Control: no-cache, no-store, must-revalidate`, `X-Robots-Tag: noindex, nofollow`, `noindex, nofollow`, có `Trang web đang trong quá trình phát triển`, không chứa `<a `, `<button`, `<form`, `lead-api`, `kiem-tra-dau-vao`, `studentPortalLink` cho `/`, `/kiem-tra-dau-vao`, `/kiem-tra-dau-vao/`, `/kiem-tra-dau-vao/ket-qua/?t=abc`, `/noi-bo/`, `/random`.
   - `POST /noi-bo/` và `PUT /index.html` trả `405` (`Allow: GET, HEAD`), không lộ nội dung gốc.
   - `HEAD /` trả `200` với body rỗng và `Content-Length` khớp.
   - `buildProfile()` mặc định tạo `dist/index.html`, `dist/kiem-tra-dau-vao/index.html`, `dist/kiem-tra-dau-vao/ket-qua/index.html`, `dist/noi-bo/index.html` là trang maintenance và không xuất `dist/assets`, `dist/huong-dan-kiem-tra-dau-vao.mp4`, hay file JS/CSS gốc.
   - `buildProfile({ ..., maintenance: false })` và `createProfileServer(..., { maintenance: false })` vẫn phục vụ toàn bộ `public/` như cũ.
2. Chạy `pnpm --filter profile test` và xác nhận test mới FAIL trước khi implement.

## Tasks & Steps

1. Tạo `apps/profile/maintenance.json` với `{ "disabled": true }`.
2. Tạo `apps/profile/maintenance.mjs` với `readProfileDisabledFlag()`, `isProfileMaintenanceEnabled()`, và `renderMaintenanceHtml()` (responsive, inline CSS sạch sẽ, nền sáng trung tính dễ đọc, `<h1>Trang web đang trong quá trình phát triển</h1>`, không nút/link ngoài).
3. Cập nhật `apps/profile/build.mjs` và `apps/profile/serve.mjs` dùng `isProfileMaintenanceEnabled()` và `renderMaintenanceHtml()` khi maintenance bật.
4. Cập nhật 5 test bảo toàn source gốc trong `apps/profile/tests/index.test.mjs`, `placement-test.test.mjs`, `placement-result.test.mjs` truyền `{ maintenance: false }`.
5. Cập nhật `packages/infra/alchemy.run.ts` và `turbo.json`.

## Tests After

1. Chạy `pnpm --filter profile test` — toàn bộ 74 test cũ + test mới trong `maintenance.test.mjs` PASS.
2. Chạy `pnpm --filter @teacher-os/infra check-types` và `pnpm --filter @teacher-os/infra test` — PASS.
3. Chạy `pnpm --filter server test` (bao gồm `lead-catalog-drift.test.ts` đọc `apps/profile/public/index.html`) — PASS.

## Regression Gate

```bash
pnpm --filter profile test && pnpm --filter @teacher-os/infra check-types && pnpm --filter @teacher-os/infra test
```
