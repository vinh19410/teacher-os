---
title: "#539: Tắt đăng ký tài khoản ở giao diện auth giáo viên"
description: "Ẩn tab 'Create account', form đăng ký và link 'Create an account' ở /login của apps/web bằng cờ build-time VITE_TEACHER_SIGNUP_ENABLED (mặc định tắt), giữ e2e chạy bình thường bằng cách bật cờ trong dev server của e2e."
status: done
priority: P2
effort: 3h
issue: 539
branch: feat/539-disable-teacher-signup-ui
tags: [frontend, auth, feature-flag]
blockedBy: []
blocks: []
created: 2026-11-03
---

# Plan: #539 — Tắt đăng ký ở giao diện auth giáo viên

## Outcome

Trong giai đoạn single-org, trang `/login` của giáo viên (`apps/web`) **chỉ còn đăng nhập**: không còn tab "Create account", không còn form đăng ký, không còn link "Create an account", để người lạ không tự tạo thêm org. Bật lại bằng một biến build, không phải sửa code.

## Hiện trạng (đã scout)

- `apps/web/src/routes/login.tsx` hiển thị `AuthTabs` (Sign in / Create account), `SignInForm`, `SignUpForm` (ẩn bằng prop `hidden`, vẫn nằm trong DOM) và link chuyển tab. Tab mặc định là **signup**, và lựa chọn được nhớ trong `localStorage` (`teacher-os-auth-tab`).
- Cờ tính năng build-time đã có tiền lệ: `apps/web/src/lib/features.ts` đọc `VITE_AI_ENABLED` qua `packages/env/src/web.ts`. E2E bật cờ này ở `apps/e2e/playwright.config.ts:75` và `apps/e2e/devserver-watchdog.mjs:146`.
- Server **đã có** chặn đăng ký giáo viên theo allowlist `TEACHER_EMAILS` (#513, #524, `packages/auth/src/index.ts`): khi biến này khác rỗng, email ngoài danh sách bị `TEACHER_SIGNUP_FORBIDDEN`, kể cả qua Google OAuth. Phần UI của plan này là lớp bổ sung, không thay thế lớp đó.
- 69 spec e2e đăng ký giáo viên qua giao diện bằng `signUpViaUi` (`apps/e2e/specs/helpers.ts:16`, điền `#su-*`), cộng `signin-validation`, `auth-fail-loudly`, `design-seed`. Tắt cứng UI sẽ làm hỏng toàn bộ.

## Quyết định thiết kế

| Vấn đề | Chọn | Lý do |
|---|---|---|
| Cách tắt | Cờ `TEACHER_SIGNUP_ENABLED = env.VITE_TEACHER_SIGNUP_ENABLED === "true"`, **mặc định tắt** | Cùng mẫu `AI_ENABLED`; production không cần đổi `alchemy.run.ts` vì không đặt biến là tắt; bật lại chỉ cần đặt biến. |
| Khi tắt, form đăng ký | **Không render** `SignUpForm` (không chỉ ẩn) | Form ẩn vẫn nằm trong DOM, vẫn có thể bị tự động điền/submit; không render thì không còn bề mặt. |
| Tab / link chuyển | Không render `AuthTabs` và dòng "New to Teacher OS? Create an account" | Chỉ còn một chế độ, tab một mục là thừa. |
| Chế độ khởi tạo | Ép `signin` khi cờ tắt, bỏ qua giá trị `signup` cũ trong `localStorage` | Người dùng từng chọn tab signup sẽ không bị kẹt ở chế độ không tồn tại. |
| Tiêu đề | "Welcome back" / "Sign in to open your workspace." cố định khi tắt | Khớp nhánh signin hiện có. |
| E2E | Bật cờ ở hai nơi khởi dựng web dev server của e2e | Giữ nguyên 69 spec; đường đăng ký vẫn được kiểm bằng cờ bật. |
| Phạm vi server | **Không đổi** | Yêu cầu nói rõ "ở giao diện auth"; xem câu hỏi mở 1. |

## Non-goals

- Không chặn endpoint `/api/auth/sign-up/email` hay Google OAuth ở server (đã có `TEACHER_EMAILS`).
- Không đụng cổng học viên (`apps/student`) hay admin.
- Không xoá `SignUpForm`, `sign-up-schema` hay test của chúng (cần khi bật lại cờ).

## Acceptance criteria

1. Không đặt `VITE_TEACHER_SIGNUP_ENABLED`: `/login` không có `#tab-signup`, `#panel-signup`, `#su-*`, chữ "Create account"/"Create an account"; còn form đăng nhập và nút Google.
2. `localStorage["teacher-os-auth-tab"] = "signup"` vẫn hiển thị chế độ đăng nhập khi cờ tắt.
3. Đặt `VITE_TEACHER_SIGNUP_ENABLED=true`: giao diện đúng như hiện nay (mặc định tab signup, có tab và link).
4. `pnpm check`, `pnpm check-types`, `pnpm --filter web test` xanh; e2e đầy đủ xanh (cờ bật trong e2e).

## Phases

| # | Phase | Trạng thái |
|---|---|---|
| 1 | [Cờ và giao diện `/login`](phase-01-flag-and-login-ui.md) | pending |
| 2 | [E2E, test và tài liệu](phase-02-e2e-tests-docs.md) | pending |

## Câu hỏi mở

1. Google OAuth ở cổng giáo viên vẫn tạo được tài khoản mới nếu `TEACHER_EMAILS` rỗng ở môi trường đó. Có cần xác nhận `TEACHER_EMAILS` đã được đặt ở production/staging (việc vận hành, không phải code) hay muốn thêm chặn ở server?
2. Có muốn thay chỗ trống bằng dòng hướng dẫn kiểu "Liên hệ quản trị viên để được cấp tài khoản" không? Mặc định plan **không** thêm.
