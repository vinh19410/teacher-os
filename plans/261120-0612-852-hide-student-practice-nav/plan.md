# Plan: Ẩn menu "Luyện tập" và "Lịch sử" ở ứng dụng học viên (#852)

- **Issue:** [#852](https://github.com/vinh19410/teacher-os/issues/852)
- **Branch:** `vinh19410/Ẩn-Menu-Luyện-Tập-Trên-PROD`
- **Route:** feature
- **Ship mode:** official
- **Date:** 2026-11-20

## 1. Executive Summary

Mục "Luyện tập" (`/practice`) và "Lịch sử" (`/history`) trong ứng dụng học viên (`apps/student`) hiện hiển thị trên thanh điều hướng (`STUDENT_NAV`). Do nội dung đề tự luyện chưa hoàn thiện trên môi trường Production, menu này cần được ẩn đi để học viên không bấm vào các màn hình chưa có nội dung.
Giải pháp tuân thủ kiến trúc chuẩn của repo (tương tự `VITE_TEACHER_SIGNUP_ENABLED` ở #539): dùng cờ build-time `VITE_STUDENT_PRACTICE_ENABLED` (mặc định tắt trên PROD, bật trong E2E và dev server khi cần).

## 2. Scope & Boundaries

### In Scope
- Thêm biến client `VITE_STUDENT_PRACTICE_ENABLED` vào `packages/env/src/web.ts`.
- Bổ sung `VITE_STUDENT_PRACTICE_ENABLED` vào `turbo.json` (`build`, `check-types`, `test`).
- Cập nhật `apps/student/src/components/layout/student-nav.tsx`: `PRACTICE_ROUTES_LIVE` phụ thuộc `env.VITE_STUDENT_PRACTICE_ENABLED === "true"` (mặc định false).
- Cấu hình bật cờ `VITE_STUDENT_PRACTICE_ENABLED: "true"` trong dev server / e2e harness (`apps/e2e/playwright.config.ts`, `apps/e2e/devserver-watchdog.mjs`, `scripts/design-compare/harness-lib.mjs`) để không gây gãy các bài test E2E hiện hành khi deploy production (`deploy.yml` chạy `e2e.yml`).
- Cập nhật unit tests trong `apps/student/test/student-nav.test.tsx` và `apps/student/src/components/layout/student-nav.test.ts`.

### Out of Scope
- Không xóa mã nguồn hay routes của `/practice` hay `/history` (giữ nguyên để kích hoạt lại khi nội dung hoàn thiện).
- Không thay đổi backend API hay bảng dữ liệu `quiz_attempt`.

## 3. Acceptance Criteria

- [ ] Khi cờ `VITE_STUDENT_PRACTICE_ENABLED` không bật (mặc định), `STUDENT_NAV` chỉ render 5 mục: Tổng quan, Lớp học, Lịch học, Bài tập, Học phí.
- [ ] Không xuất hiện nút/menu "Luyện tập" và "Lịch sử" trong sidebar học viên khi tắt cờ.
- [ ] Khi bật `VITE_STUDENT_PRACTICE_ENABLED="true"`, `STUDENT_NAV` hiển thị đầy đủ 7 mục (bao gồm Luyện tập và Lịch sử).
- [ ] Active key prefix và label breadcrumb cho `/practice` và `/history` vẫn được giữ để đảm bảo an toàn nếu truy cập trực tiếp URL.
- [ ] `pnpm check`, `pnpm check-types`, và unit test pass 100%.

## 4. Execution Phases

- **Phase 1: Environment & Nav Configuration**
  - Cập nhật `packages/env/src/web.ts`, `turbo.json`, `apps/student/src/components/layout/student-nav.tsx`.
- **Phase 2: Tests & E2E Harness Alignment**
  - Cập nhật `apps/student/test/student-nav.test.tsx`, `apps/student/src/components/layout/student-nav.test.ts`.
  - Cập nhật `apps/e2e/playwright.config.ts`, `apps/e2e/devserver-watchdog.mjs`, `scripts/design-compare/harness-lib.mjs`.
  - Chạy full verification gate: `pnpm check`, `pnpm check-types`, unit tests.
