---
phase: 3
title: "Shell giáo viên + trang auth/pay/404"
status: pending
priority: P1
effort: "4h"
dependencies: [2]
---

# Phase 3: Shell giáo viên + trang auth/pay/404

## Goal

Khung app giáo viên (sidebar, topbar) và các trang ngoài shell (đăng nhập, đăng ký, quên/đặt
lại mật khẩu, xác minh email, `/pay/$token`, 404, tài khoản bị chặn) khớp design `App.tsx`
(`Login`, layout `aside` + topbar) và `PayPage`.

## Files to Create / Modify

- Modify: `apps/web/src/components/layout/app-shell.tsx` — sidebar dạng card nổi: desktop
  `app:m-4 app:h-[calc(100svh-2rem)] sticky top-4 neu rounded-md`; cột 248px → 220px
  (collapsed 64px giữ); main `px-6 app:px-12 py-10 max-w-[1280px]`. Giữ scrim mobile, transition,
  `motion-reduce`.
- Modify: `apps/web/src/components/layout/sidebar.tsx` — wordmark `TEACHER/OS` mono 12px
  uppercase `tracking-[0.25em]`, `/` màu `hot` (thay ô vuông chữ cái); nhãn nhóm ("Giảng dạy",
  "Phụ huynh") mono uppercase `text-meta`; item active `neu-in text-hot font-medium rounded-md`
  + dấu `■` cam `aria-hidden` trước nhãn (ẩn khi collapsed); inactive `hover:text-hot`. **Giữ**
  icon (cần cho chế độ thu gọn, `sidebar-collapse.spec.ts`), class móc `sidebar` trên `<aside>` (spec dùng `aside.sidebar`), nhãn, `aria-label`, nút đăng xuất,
  khối hồ sơ cuối sidebar (đổi sang kiểu design: tên org + kỳ mono 10px `text-meta`).
- Modify: `apps/web/src/components/layout/topbar.tsx` — ô tìm kiếm pill `neu-in rounded-full
  px-5 py-2.5` (giữ placeholder "Tìm học viên, lớp học…", hành vi, `global-search.spec.ts`);
  thêm `ThemeToggle` (từ `@teacher-os/ui/components/theme-toggle`) bên phải trước chuông
  thông báo; avatar tròn `neu-sm text-hot`. Bỏ nền topbar riêng nếu có, để chung nền `bg`.
- Modify: `apps/web/src/components/layout/notif-panel.tsx` — panel `neu rounded-lg`, hàng
  `border-t border-line`; giữ test `notif-panel.test.tsx`.
- Modify: `apps/web/src/components/layout/version-badge.tsx` — mono 10px `text-meta`.
- Modify: `apps/web/src/components/auth/brand-panel.tsx` — theo design `Login` cột trái: nền
  `surface-warm` (raise) viền phải `line` (thay nền đen đặc), wordmark `TEACHER/OS`, headline
  `font-display font-extrabold text-5xl app:text-7xl leading-[0.95]` (giữ nội dung tiếng Việt
  hiện có, nhấn một từ bằng `text-hot underline decoration-meta underline-offset-8`),
  `<TeacherDesk>` từ `illustrations.tsx`, đoạn mô tả `text-meta text-sm`. Giữ
  `brand-panel.test.tsx` (cập nhật assertion nếu test khóa class/nội dung đã đổi có chủ đích).
- Modify: `apps/web/src/routes/login.tsx`, `forgot-password.tsx`, `reset-password.tsx`,
  `verify-email.tsx`, `apps/web/src/components/auth/*` (`auth-tabs`, `auth-field`, `notices`,
  `submit-button`), `sign-in-form.tsx`, `sign-up-form.tsx`, `verify-email-view.tsx`,
  `google-oauth-button.tsx` — tiêu đề `font-display font-extrabold text-3xl`, input theo `Field`,
  nút chính `Button primary` full width, nút Google `secondary`, link phụ `text-xs underline
  text-meta hover:text-hot`; `ThemeToggle` góc trên phải trang login.
- Modify: `apps/web/src/routes/pay.$token.tsx` — theo design `PayPage`: kicker mono, mã chuyển
  khoản lớn mono cam, `payment-qr-panel` giữ nền **trắng** cho QR (máy quét cần tương phản).
- Modify: `apps/web/src/components/not-found.tsx`, `account-blocked-view.tsx`,
  `kernel-load-error.tsx`, `loader.tsx` — page head kiểu mới, mã lỗi mono.

## Tasks & Steps

1. Đọc design `src/App.tsx` (layout + `Login`) và `PayPage` trong `src/pages/Teacher.tsx`.
2. Shell trước (ảnh hưởng mọi trang), chụp nhanh `/dashboard` 3 viewport.
3. Auth pages; kiểm `login.smoke.spec.ts`, `signin-validation.spec.ts`, `password-reset.spec.ts`,
   `web-email-verification.spec.ts`, `404-branded-status.spec.ts`, `sidebar-collapse.spec.ts`,
   `global-search.spec.ts`, `account-role-separation.spec.ts`.
4. `/pay/$token` + `payment-qr-panel.test.tsx`.

## Verification

- `pnpm --filter web test` (sidebar, notif-panel, brand-panel, sign-in/up, forgot/reset,
  verify-email, not-found, payment-qr-panel).
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e` với các spec
  ở bước 3.
- Keyboard: Tab qua sidebar → topbar → nội dung; focus ring cam thấy rõ ở cả 2 theme; toggle
  theme bằng Enter/Space.

## Rollback

Revert commit phase 3; primitive phase 2 vẫn chạy với shell cũ.
