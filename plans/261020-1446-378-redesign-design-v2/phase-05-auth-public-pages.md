---
phase: 5
title: "Auth, pay, 404 (web + student)"
status: pending
priority: P2
effort: "4h"
dependencies: [3]
---

# Phase 5: Auth, pay, 404

## Goal

Các màn ngoài shell khớp `Login` + `PayPage` của design v2 ở cả hai app.

## Files to Create / Modify

- Modify: `apps/web/src/routes/login.tsx`, `apps/web/src/components/sign-in-form.tsx`,
  `sign-up-form.tsx`, `google-oauth-button.tsx`, `auth/*` — split `lg:grid-cols-2`: cột trái
  logo-block "Teacher OS" + ThemeToggle, form `max-w-xs grid gap-6` (tiêu đề `text-2xl font-bold`
  căn giữa, mô tả muted, divider "Hoặc tiếp tục với", nút Google outline); cột phải `bg-muted`
  quote + `TeacherDesk` (ẩn dưới `lg`).
- Modify: `forgot-password.tsx`, `reset-password.tsx`, `verify-email.tsx`,
  `verify-email-view.tsx`, `account-blocked-view.tsx` — cùng khung (pattern `login-reset`).
- Modify: `apps/student/src/routes/{login,forgot-password,reset-password,verify-email}.tsx`,
  `apps/student/src/components/auth/*` (`brand-panel.tsx` → panel `bg-muted` + `StudentSpot`,
  `auth-tabs.tsx` → Tabs v2).
- Modify: `apps/web/src/routes/pay.$token.tsx` + `packages/ui/src/components/payments/payment-qr-panel.tsx`
  — bố cục `PayPage` v2 (card căn giữa, QR nền trắng giữ nguyên, mã chuyển khoản `font-mono`).
- Modify: `apps/web/src/components/not-found.tsx`, `kernel-load-error.tsx`, `loader.tsx`
  (+ student `loader.tsx`, `student-error-view.tsx`) — Empty/Alert v2.
- Modify: test tương ứng (`sign-in-form.test.tsx`, `verify-email-view.test.tsx`, `not-found.test.tsx`).

## Tasks & Steps

1. Port `Login` v2 thành layout dùng chung `AuthSplitLayout` trong `@teacher-os/ui` (web + student
   khác minh họa + quote).
2. Giữ nguyên field name, validation, thông báo lỗi, `getByLabel` e2e.
3. Pay page: giữ VietQR thật (`img[src*='vietqr.app']` e2e ×6).

## Verification

- `pnpm --filter web test -- sign-in sign-up verify not-found && pnpm --filter student test`
- e2e auth/pay: `pnpm --filter e2e e2e -- auth login pay` (port override)
- `pnpm design:compare --screens login-teacher,login-reset,pay --side app --label new` → PASS
  ghi vào `verdict.md`.
