# Phase 01 — Bật `prompt: select_account`

## Context

Nguyên nhân và quyết định ở [plan.md](plan.md).

## Files

- Sửa: `packages/auth/src/index.ts` (khối `socialProviders.google`).
- Sửa: `apps/server/src/auth-role-roundtrip.test.ts` (thêm test URL authorize).

## Steps

1. Xác nhận better-auth 1.6.27 hỗ trợ option `prompt` ở provider Google (đọc type của `socialProviders.google` hoặc docs qua `ak-docs-seeker`). Nếu không hỗ trợ ở provider, dùng `prompt` trong body `signIn.social` ở 3 button và ghi rõ vào PR.
2. Thêm `prompt: "select_account"` vào `socialProviders.google`.
3. Thêm test: gọi `/sign-in/social` với Origin của student, teacher, admin; assert `url` trả về chứa `prompt=select_account`.
4. Chạy `pnpm --filter server test auth-role-roundtrip`, rồi `pnpm exec biome check .` và `pnpm check-types`.

## Validation

Bốn tiêu chí ở plan.md. Tiêu chí 3 cần credential Google thật, ghi kết quả vào PR.

## Risk / Rollback

Rủi ro thấp: chỉ thêm một tham số OAuth; người dùng chỉ thấy thêm một bước chọn tài khoản. Rollback bằng revert một dòng.
