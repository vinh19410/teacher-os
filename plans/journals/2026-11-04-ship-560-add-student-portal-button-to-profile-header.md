---
title: "Ship #560 add student portal button to profile header"
date: 2026-11-04
summary: "Thêm nút Gốc học viên (#studentPortalLink) trên header apps/profile kèm cơ chế thay STUDENT_PORTAL_URL an toàn (#560)"
---

# Ship #560 add student portal button to profile header

## What happened
Thực thi đầu-cuối Issue #560 thêm nút **"Gốc học viên"** (`#studentPortalLink`, `rel="noopener"`) trên thanh header của `apps/profile` (`apps/profile/public/index.html`) dẫn tới cổng học viên (`apps/student`) theo từng môi trường (`https://student.teacheros.io.vn` trên prod, `https://student.staging.teacheros.io.vn` trên staging, `http://localhost:8003` khi dev và `http://localhost:8103` khi chạy E2E).

## Decision
- **Chốt an toàn navigation sink `<a href>`:** Tách `normalizeStudentPortalUrl` và `replaceStudentPortalHref` trong `apps/profile/serve.mjs` (tái sử dụng ở `apps/profile/build.mjs`), kiểm tra `new URL()` chỉ chấp nhận `http:`/`https:` không chứa credentials, fail-closed ngay khi khởi tạo `createProfileServer` hoặc lúc build nếu sai scheme hay thiếu/trùng `#studentPortalLink`, và dùng callback replacer `() => ...` chống `$`-pattern injection.
- **Bảo toàn ngữ nghĩa `""` vs `undefined`:** Dùng `process.env.STUDENT_PORTAL_URL ?? "http://localhost:8003"` trong `createProfileServer` để khi biến không đặt (`undefined`) thì dev trỏ `8003`, còn khi đặt tường minh `STUDENT_PORTAL_URL=""` thì giữ nguyên mặc định prod của HTML.
- **Khép kín dải responsive header từ `320px` đến `1440px`:** Nâng ngưỡng ẩn `.nav-links` lên `@media (max-width: 1320px)`, ẩn `.brand-subtitle` ở `@media (max-width: 860px)`, và chia lưới 2 cột cân đối cho `.nav-actions .btn` ở `@media (max-width: 640px)` để không cắt cụt hay tràn container ở cả laptop `1280×800`, iPad `810×1080` lẫn điện thoại `375×812`/`320×812`.

## Verification & Next steps
- `pnpm --filter profile test` (23/23 pass), `node --test scripts/topology-drift.test.mjs` (10/10 pass), `pnpm exec biome check .` (0 lỗi), `pnpm test`, `pnpm check-types` (8/8 pass), `pnpm build` (6/6 pass).
- Quét thực nghiệm Chromium trên 17 mốc chiều rộng (`320px`..`1440px`) + kiểm tra phím `Tab` + Playwright E2E `specs/profile-lead-intake.spec.ts` (3/3 pass).
- Tiếp theo: mở PR vào `develop`, chạy `ak-review-pr --fix --reply --advice`, gắn nhãn `ready to ship beta`, merge và theo dõi CI `develop` tới khi xanh.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
