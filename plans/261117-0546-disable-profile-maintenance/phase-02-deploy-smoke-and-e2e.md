---
phase: 2
title: "Deploy Smoke Checks, Drift Guards & E2E"
status: done
priority: P1
effort: 1h
dependencies: [1]
---

# Phase 2: Deploy Smoke Checks, Drift Guards & E2E

## Goal

Cập nhật smoke check triển khai prod/staging, bổ sung drift guard cho cấu hình infra/workflow, giữ 6 spec E2E hiện tại chạy được trên source gốc, và thêm spec E2E xác minh trang maintenance trên Chromium ở 3 viewport.

## Files to Create / Modify

- Modify: `.github/workflows/deploy.yml` (lines 142-184) — trong `Smoke check profile`, đọc `apps/profile/maintenance.json`: nếu `disabled === true` thì verify `$PROFILE_ORIGIN/`, `$PROFILE_ORIGIN/kiem-tra-dau-vao/`, `$PROFILE_ORIGIN/noi-bo/`, và `https://www.msmy.io.vn/` trả HTTP 200 HTML chứa `"Trang web đang trong quá trình phát triển"` và không chứa `lead-api`; nếu `false` thì giữ kiểm tra đầy đủ như cũ. <!-- Updated: Red Team RT-2 -->
- Modify: `.github/workflows/deploy-staging.yml` (lines 262-299) — tương tự cho `$PROFILE_ORIGIN/`, `$PROFILE_ORIGIN/kiem-tra-dau-vao/`, và `$PROFILE_ORIGIN/noi-bo/`. <!-- Updated: Red Team RT-2 -->
- Modify: `scripts/topology-drift.test.mjs` (lines 197-272) — kiểm tra trên toàn chuỗi `run` rằng `alchemy.run.ts` đọc `apps/profile/maintenance.json` qua `import.meta.url` và trên `profileBlock` rằng `notFoundHandling` nhánh theo flag maintenance. <!-- Updated: Red Team RT-8 -->
- Modify: `apps/e2e/playwright.config.ts` (lines 132-144) — truyền `PROFILE_MAINTENANCE: "false"` vào `env` của `pnpm --filter profile run dev:bare` để 6 spec E2E profile/placement hiện tại tiếp tục bảo vệ source gốc.
- Create: `apps/e2e/specs/profile-maintenance.spec.ts` — cấp phát một port trống > 0 (tránh `PORT=0` fallback về `8005`), xóa `PROFILE_MAINTENANCE` khỏi env tiến trình con và spawn `node apps/profile/serve.mjs` trong `try/finally`, mở Chromium ở 3 viewport (`1440x900`, `768x1024`, `375x812`), xác minh trang `"Trang web đang trong quá trình phát triển"` hiển thị rõ, không overflow ngang, không có `<a>`/`<button>`/`<form>`, và kiểm tra cả `/`, `/kiem-tra-dau-vao/`, `/noi-bo/`. <!-- Updated: Red Team RT-6 -->

## Tests Before

1. Thêm test vào `scripts/topology-drift.test.mjs` kiểm tra `alchemy.run.ts` đọc `apps/profile/maintenance.json` cho `notFoundHandling` -> chạy `pnpm test:topology-drift`.
2. Tạo `apps/e2e/specs/profile-maintenance.spec.ts` -> verify Chromium render trên 3 viewport.

## Tasks & Steps

1. Cập nhật `Smoke check profile` trong `.github/workflows/deploy.yml` và `.github/workflows/deploy-staging.yml` nhánh theo `apps/profile/maintenance.json` (giữ nguyên tên step `Smoke check profile` trước `Notify Discord release changelog`).
2. Thêm drift guard trong `scripts/topology-drift.test.mjs`.
3. Cập nhật `apps/e2e/playwright.config.ts` thêm `PROFILE_MAINTENANCE: "false"` cho webServer `profile`.
4. Tạo `apps/e2e/specs/profile-maintenance.spec.ts`.

## Tests After

1. Chạy `pnpm exec biome check .` (fix nếu format lệch bằng `pnpm check:fix`).
2. Chạy `pnpm check-types`.
3. Chạy `pnpm test`.
4. Chạy spec E2E lẻ: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/profile-maintenance.spec.ts` và 1 spec profile cũ (`specs/profile-lightbox.spec.ts`) để xác minh cả 2 luồng.

## Regression Gate

```bash
pnpm exec biome check . && pnpm check-types && pnpm test
```
