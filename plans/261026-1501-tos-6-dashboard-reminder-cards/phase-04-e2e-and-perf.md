---
phase: 4
title: "E2E, 3 viewport, design compare, đo 2 giây"
status: pending
priority: P1
effort: "3h"
dependencies: [3]
---

# Phase 4: Kiểm chứng end-to-end

## Goal

Chứng minh Scenario 1 của AC-001 trên app thật: bộ đếm đúng với dữ liệu seed, 3 thẻ hiển thị trong vòng 2 giây, và một lần bấm thẻ thì URL đúng `/attendance?date={today}&status=pending`.

## Files to Create / Modify

- Create: `apps/e2e/specs/dashboard-reminders.spec.ts`.
- Modify (nếu cần seed): `apps/e2e/specs/helpers-dated-class.ts`. Seed thêm 1 lớp có ca hôm nay `upcoming`, 1 attempt writing submitted 25h trước, 1 invoice quá hạn. Dùng helper sẵn có, không tạo cơ chế seed mới.

## Tasks & Steps

1. Viết spec:
   - Đăng nhập teacher, mở `/dashboard`.
   - Assert 3 thẻ và số đếm khớp seed.
   - Đo thời gian từ lúc navigate tới khi thẻ có số, phải ≤ 2000ms. Dùng `performance.now()` qua `page.evaluate` hoặc `expect(...).toBeVisible({ timeout: 2000 })`.
   - Bấm thẻ điểm danh, assert `page.url()` chứa `/attendance?date=<vietnamTodayISO>&status=pending` và trang khung hiển thị.
   - Bấm nút chấm bài, assert URL `/grading?status=awaiting`.
2. Chạy spec ở 3 viewport 1440×900, 768×1024, 375×812 theo `REVIEW.md`. Chụp screenshot để gắn vào PR.
3. Chạy `pnpm design:compare` vì PR có thay đổi giao diện dashboard. Ghi nhận các màn bị ảnh hưởng.
4. Chạy full Playwright suite trước khi merge vào `develop` (theo memory dự án).

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e -- dashboard-reminders`
- Full suite: `pnpm --filter e2e e2e`
- `pnpm design:compare`

## Ghi chú

Nếu run fail kèm `[dev-watchdog] hạ tầng dev server bất ổn…` thì đó là lỗi hạ tầng, không phải lỗi test (xem `AGENTS.md`).
