# Journal: Ẩn menu "Luyện tập" và "Lịch sử" ở ứng dụng học viên (#852)

- **Date:** 2026-11-20
- **Issue:** #852
- **Branch:** `vinh19410/Ẩn-Menu-Luyện-Tập-Trên-PROD` (target: `develop`)

## Context
Nội dung đề tự luyện trong phần Luyện tập (`/practice`) chưa được hoàn thiện cho học viên trên môi trường Production. Cả hai mục "Luyện tập" và "Lịch sử" (Lịch sử luyện tập) trên menu điều hướng học viên (`apps/student`) cần được ẩn mặc định để học viên không truy cập vào giao diện chưa sẵn sàng.

## Changes
- **Cờ môi trường build-time:** Thêm `VITE_STUDENT_PRACTICE_ENABLED` vào schema `packages/env/src/web.ts`, đồng thời cấu hình biến vào `turbo.json` (`tasks.build`, `tasks.check-types`, `tasks.test`).
- **Student Navigation:** Cập nhật `apps/student/src/components/layout/student-nav.tsx` để `PRACTICE_ROUTES_LIVE` đọc từ `env.VITE_STUDENT_PRACTICE_ENABLED === "true"`, mặc định là `false` khi build production.
- **Bảo tồn E2E test harness:** Bật cờ `VITE_STUDENT_PRACTICE_ENABLED: "true"` trong `apps/e2e/playwright.config.ts`, `apps/e2e/devserver-watchdog.mjs`, và `scripts/design-compare/harness-lib.mjs` để các spec E2E hiện có của practice và history không bị gãy khi CI chạy `e2e.yml`.
- **Tài liệu & Unit tests:** Bổ sung ghi chú vào `AGENTS.md`. Cập nhật unit test trong `apps/student/test/student-nav.test.tsx`, `apps/student/src/components/layout/student-nav.test.ts`, và `scripts/design-compare.test.mjs`.

## Verification
- Unit tests `student-nav.test.tsx` (4/4 passed), `student-nav.test.ts` (4/4 passed), và `design-compare.test.mjs` (23/23 passed).
- `pnpm exec biome check .` (0 errors).
- `pnpm check-types` (12/12 successful).
