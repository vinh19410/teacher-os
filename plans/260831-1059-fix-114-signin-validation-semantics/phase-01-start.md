---
phase: 1
title: "Sign-in validation semantics — test-first fix"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Sign-in validation semantics — test-first fix

## Overview

Đưa validator form Sign in về đúng ngữ nghĩa đăng nhập: required-first cho email/password và **không** áp rule min-8 (chính sách sign-up) lên password khi sign-in. Làm test-first: unit test schema đỏ trước, fix xanh sau, khóa bằng e2e regression (3 scenario độc lập, mỗi scenario một `test()` riêng).

## Requirements

- Functional:
  - Submit để trống: email → "Email is required"; password → "Password is required".
  - Email non-empty sai format → "Invalid email address" (chặn client vẫn giữ).
  - Password bất kỳ độ dài ≥ 1 ký tự (vd `abc`) pass validator sign-in — credentials do server thẩm định, lỗi hiển thị qua toast auth sẵn có (luồng #125).
  - Email chỉ chứa whitespace tính là trống (trim trước check).
  - Payload gửi lên server phải dùng email đã trim: schema trim chỉ ảnh hưởng validation (form-core đọc `issues`, vứt parsed value) nên `onSubmit` phải tự trim `value.email.trim()`. Password KHÔNG trim.
  - Sign-up form KHÔNG đổi hành vi, được bảo vệ bằng e2e case (c).
- Non-functional:
  - Schema tách module riêng để unit test trực tiếp, không phải mount form.
  - Giữ timing validation hiện tại của TanStack Form (onSubmit — lỗi hiện sau lần submit đầu; sau submit fail `canSubmit=false` cho tới lần submit kế tiếp, đây là hành vi định nghĩa của form-core 1.33.5).

## Architecture

`sign-in-form.tsx` hiện khai báo schema inline trong `validators.onSubmit`. Tách schema ra `apps/web/src/lib/sign-in-schema.ts` (export `signInSchema` + hằng số thông điệp), form import vào.

Email schema zod 4.4.3: `z.string().trim().min(1, EMAIL_REQUIRED).pipe(z.email(EMAIL_INVALID))` (fallback `refine` nếu pipe lỗi — contract test không đổi). Password: `z.string().min(1, PASSWORD_REQUIRED)`.

E2e theo pattern interception của `auth-fail-loudly.spec.ts` nhưng **mỗi scenario một `test()` riêng với page mới** — sau một lần submit fail, `canSubmit` kẹt `false` (validator onSubmit chỉ chạy ở event submit) nên scenario (b) không thể chạy nối tiếp (a) trên cùng page. Tab mặc định của `/login` là signup (`login.tsx` localStorage `teacher-os-auth-tab`) — mọi scenario phải click tab "Sign in" trong context mới. Assertion chính của (b) là interceptor bắt được POST (chứng minh client gửi thay vì chặn client-side); KHÔNG pin toast text (401 thiếu CORS headers sẽ rơi nhánh catch với toast trùng text — dễ xanh nhầm).

## Related Code Files

- Create: `apps/web/src/lib/sign-in-schema.ts`
- Create: `apps/web/src/lib/sign-in-schema.test.ts`
- Modify: `apps/web/src/components/sign-in-form.tsx` (import schema + trim email tại onSubmit)
- Create: `apps/e2e/specs/signin-validation.spec.ts`
- Tham chiếu, không sửa: `apps/web/src/components/sign-up-form.tsx`, `apps/e2e/specs/auth-fail-loudly.spec.ts`, `apps/web/src/components/auth/auth-field.tsx`, `apps/web/src/routes/login.tsx`, `apps/web/src/components/auth/auth-tabs.tsx`, `apps/web/src/components/auth/submit-button.tsx`

## Implementation Steps

1. **RED** — viết `sign-in-schema.test.ts` fail trước (file schema chưa tồn tại), đúng 6 case: (1) email rỗng → "Email is required"; (2) email whitespace-only → required; (3) email `"not-an-email"` → "Invalid email address"; (4) email hợp lệ pass; (5) password rỗng → "Password is required"; (6) password `"abc"` **pass** (regression khóa bug #114). Chạy `pnpm --filter web test` xác nhận đỏ.
2. **GREEN** — tạo `sign-in-schema.ts` với `signInSchema`; test xanh.
3. Wire `sign-in-form.tsx`: thay schema inline bằng import `signInSchema`; trong `onSubmit` đổi payload thành `email: value.email.trim()` (password giữ nguyên); không đổi gì khác.
4. Viết e2e `signin-validation.spec.ts` — 3 `test()` độc lập, mỗi test `goto("/login")` mới + click tab "Sign in":
   - (a) submit trống → thấy "Email is required" + "Password is required" (không thấy "at least 8");
   - (b) email hợp lệ **có padding 2 đầu** (vd `" abc@x.test "`) + password `abc` → interceptor (`page.route("**/api/auth/sign-in/email")`) bắt được đúng 1 POST, payload email đã **trim** (`abc@x.test`) và password `abc` (khóa cả bug lẫn behavior trim đầu-cuối); fulfill 401 + CORS headers (`CORS_BASE` pattern auth-fail-loudly) + body JSON không có `message`; assert toast lỗi hiện diện (không pin text);
   - (c) tab "Create account": password `abc` + các trường hợp lệ khác → client-block, thấy "Password must be at least 8 characters" (bảo vệ sign-up semantics).
5. Chạy gates local: `pnpm test`, `pnpm check-types`, `pnpm exec biome check .`, `pnpm build`, và chạy spec e2e mới local: `pnpm --filter e2e exec playwright test specs/signin-validation.spec.ts` (root `pnpm test` KHÔNG chạy e2e — apps/e2e không có script `test`).
6. Verify không regression auth: chạy lại `login.smoke.spec.ts` + `auth-fail-loudly.spec.ts` qua cùng command playwright.

## Success Criteria

- [ ] Unit test schema: 6 case trên pass, trong đó case password `abc` pass là regression test cho #114.
- [ ] E2e (a): submit trống hiện đúng 2 thông điệp required trên tab Sign in.
- [ ] E2e (b): client gửi POST sign-in với password `abc` (interceptor bắt được), toast lỗi hiện diện.
- [ ] E2e (c): sign-up vẫn chặn password < 8 với đúng thông điệp min-8.
- [ ] Email padding `" a@b.com "` pass validation và payload trim (verify qua payload của interceptor hoặc unit contract).
- [ ] `pnpm test` / `check-types` / `biome` / `build` xanh toàn bộ.

## Risk Assessment

- **canSubmit kẹt disabled sau submit fail**: hành vi ĐỊNH NGHĨA của form-core 1.33.5 (validator onSubmit chỉ chạy event submit; `isValid` không hồi phục khi user sửa input). Không phải regression, không file issue. Phản hồi định sẵn: mỗi scenario e2e một test() riêng, page mới.
- **Zod pipe**: zod 4.4.3 lockfile đã xác nhận hỗ trợ; nếu unit test đỏ do API bất thường → chuyển `refine` với `z.email().safeParse`, contract test không đổi.
- **E2e flaky do toast timing**: assertion chính là interceptor + payload; toast chỉ assert hiện diện. Nếu flaky, bỏ assertion toast, giữ interceptor.
