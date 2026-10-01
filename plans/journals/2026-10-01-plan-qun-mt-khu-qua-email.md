---
title: Plan quên mật khẩu qua email
date: 2026-10-01
summary: "Hoàn tất plan #292 cho reset mật khẩu better-auth trên web và student."
---

# Plan quên mật khẩu qua email

## What happened
Phiên Claude `1881ec78` kẹt ở research của `/ak-plan --github --advice` cho quên mật khẩu. Reader bỏ 231 bản ghi `attachment`/`atis-latch`, nhưng last-prompt còn yêu cầu gốc: gửi link reset qua email rồi mở trang đổi mật khẩu.

Đã đối chiếu source: `emailAndPassword` chỉ `enabled: true`, notice pilot ở sign-in teacher, student không có lối quên mật khẩu, e2e mail log chỉ giữ URL `/verify-email`, worker teacher 404 route lạ.

## Decision
HOLD SCOPE, mode hard rút gọn thành plan 3 phase, không implement trong phiên này.
Dùng `requestPasswordReset` / `sendResetPassword` / `resetPassword` của better-auth 1.6.27. Token 1 giờ. Thu hồi session khi đổi mật khẩu. Cả hai cổng. UI đúng ngôn ngữ từng app.

## Next steps
Cook `plans/261001-0336-forgot-password-email-reset` khi được yêu cầu. Issue https://github.com/vinh19410/teacher-os/issues/292

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
