---
title: "Quên mật khẩu qua email"
description: "Người dùng xin liên kết đặt lại mật khẩu qua email, bấm link, rồi đặt mật khẩu mới trên đúng cổng đã xin."
status: pending
priority: P1
effort: 10h
issue: 292
branch: vinh19410/feat/forgot-password-email-reset
tags: [feature, auth, frontend, backend]
blockedBy: []
blocks: []
created: 2026-10-01
---

# Quên mật khẩu qua email

## Overview

Giáo viên và học viên đang đăng nhập bằng email/mật khẩu không có đường lấy lại mật khẩu. Trên `apps/web`, nút "Forgot password?" chỉ mở một câu thông báo pilot. Cổng học viên không có nút nào. Mailer Resend và template xác thực email đã chạy trong `packages/auth`.

Plan này bật `sendResetPassword` của better-auth 1.6.27, gửi email HTML tiếng Việt chứa đúng `url` better-auth trả về, rồi thêm trang xin link và trang đặt mật khẩu mới trên cả hai app. Link trong email do better-auth phát hành; khi hợp lệ nó chuyển tới `/reset-password?token=...` của đúng origin đã xin.

## Scope Challenge

- Existing code: `emailAndPassword.enabled` không có `sendResetPassword` (`packages/auth/src/index.ts`). Web chặn người dùng bằng notice tại `apps/web/src/components/sign-in-form.tsx`. Student sign-in không có nhánh quên mật khẩu. E2E mail log chỉ giữ URL `/verify-email` (`apps/e2e/src/boot.ts`).
- Requested scope: quên mật khẩu, gửi link qua email, click link thì vào trang đổi mật khẩu mới. Làm đủ cho cả hai cổng vì cả hai dùng cùng kho credential.
- Complexity: khoảng 15 file, không service mới, 3 phase. Tái dùng `Mailer`, `AuthField`, `BrandPanel`.
- Selected mode: HOLD SCOPE. Không `--yagni`.

## Decisions

| # | Quyết định | Lý do |
|---|------------|--------|
| D1 | Dùng better-auth `sendResetPassword` + client `requestPasswordReset({ email, redirectTo })` + `resetPassword({ newPassword, token })` | Đúng API docs email-password của bản catalog `1.6.27`. Không tự phát hành token. |
| D2 | `redirectTo` = `window.location.origin + "/reset-password"`. Cấm nhận redirect từ query người dùng gõ | Better-auth chỉ chấp nhận origin trong `trustedOrigins`. Chặn open redirect. |
| D3 | `resetPasswordTokenExpiresIn: 60 * 60`. `revokeSessionsOnPasswordReset: true` | Cùng hạn 1 giờ với email xác thực. Đặt lại mật khẩu phải cắt session cũ. |
| D4 | Email dùng chung, tiếng Việt, subject `Đặt lại mật khẩu TeacherOS của bạn`. UI teacher giữ tiếng Anh. UI student giữ tiếng Việt | Khớp ngôn ngữ từng bề mặt hiện có. Một template vì auth là một. |
| D5 | API trả 200 thì UI luôn hiện câu trung tính "nếu có tài khoản thì đã gửi". Lỗi mạng hoặc status khác 200 thì báo gửi thất bại | Không tiết lộ email có tồn tại. Lỗi mailer không được nuốt như sign-up. |
| D6 | Không bật `requireEmailVerification`. Không làm đổi mật khẩu khi đang đăng nhập | Ngoài yêu cầu. |

## Non-goals

- OTP, magic link đăng nhập, đổi mật khẩu trong trang profile.
- Sửa fail-open của email xác thực lúc sign-up.
- Đổi ngôn ngữ trang login teacher.
- Cấu hình Resend hoặc zone TLS mới.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Auth gửi email đặt lại mật khẩu](./phase-01-start.md) | Pending |
| 2 | [Trang quên mật khẩu và trang đặt mật khẩu mới](./phase-02-reset-pages.md) | Pending |
| 3 | [E2E hai cổng và changelog](./phase-03-e2e-reset-mail.md) | Pending |

## Dependencies

- better-auth `1.6.27` (`pnpm-workspace.yaml` catalog).
- `Mailer` inject sẵn (`CreateAuthInput.mailer`). Không env mới.
- Phase 2 phụ thuộc contract HTTP của phase 1. Phase 3 phụ thuộc cả hai.

## Success Criteria

- [ ] User teacher bấm "Forgot password?", nhận email, mở link, đặt mật khẩu mới, đăng nhập được bằng mật khẩu mới và không đăng nhập được bằng mật khẩu cũ.
- [ ] User student làm cùng việc trên cổng học viên, link không nhảy sang origin teacher.
- [ ] Email không tồn tại vẫn thấy cùng câu thành công và không có thư trong mail log.
- [ ] Link hết hạn hoặc sai token hiện lỗi và không đổi mật khẩu.
- [ ] `pnpm --filter @teacher-os/auth test` và spec e2e mới đều xanh.

## Red Team Review

Planner tự đối chiếu source trong phiên lập plan. Không spawn 3 reviewer riêng, vì việc cần xong là plan còn dở. Finding đã đưa vào phase.

| ID | Severity | Evidence | Disposition |
|----|----------|----------|-------------|
| RT1 | High | `apps/e2e/src/boot.ts:40` chỉ regex `/verify-email`. Thư reset sẽ thành `error: "no-verify-url"` | Accept — phase 3 bắt URL reset, không đổi nhánh verify |
| RT2 | High | `apps/web/src/routes-matcher.ts:3` không có route lạ. `/forgot-password` sẽ 404 ở worker | Accept — phase 2 thêm exact route và test drift |
| RT3 | High | `packages/auth/src/index.ts:143` nuốt lỗi mailer lúc sign-up. Copy nguyên sẽ báo đã gửi dù không gửi | Accept — phase 1 await và ném lỗi |
| RT4 | Medium | Docs better-auth: `redirectTo` không hợp lệ bị từ chối. Query tự do là open redirect nếu tự nối | Accept — D2 |
| RT5 | Medium | Tài khoản chỉ Google có thể không có credential password | Accept — UI không nhánh riêng; câu thành công giống D5. Không xây luồng "tài khoản Google" |

### Whole-Plan Consistency Sweep

Đã rà `plan.md` và 3 phase. Cùng tên API, cùng hai route, cùng subject, cùng hạn 3600 giây, cùng `revokeSessionsOnPasswordReset: true`. Không còn giả định "forgetPassword" là API bắt buộc. Nếu TypeScript báo không có `requestPasswordReset`, phase 2 được phép gọi `forgetPassword` với cùng body và phải ghi một dòng trong phase file. Không được đặt tên thứ ba.

## Validation Log

### Verification Results

- Claims checked: 12
- Verified: 12 | Failed: 0 | Unverified: 0
- Tier: Standard
- Failures: none

Claims: `emailAndPassword` chỉ `enabled: true` tại `packages/auth/src/index.ts:123`. Notice pilot tại `apps/web/src/components/sign-in-form.tsx:97`. Student sign-in không có forgot (`apps/student/src/components/auth/sign-in-form.tsx`). `signUpViaUi` tại `apps/e2e/specs/helpers.ts:11`. `readVerificationEmails` tại `apps/e2e/specs/helpers.ts:51`. Catalog `better-auth: 1.6.27`. Route public nằm ở `routes/login.tsx`, không nằm dưới `_auth`. Drift guard đọc `FileRoutesByFullPath` trong `apps/web/src/routes-matcher.test.ts:83`. `.mail-preview/` đã gitignore.

### Decisions locked without a second interview

Yêu cầu gốc đã đủ để HOLD SCOPE. Không hỏi lại giữa chừng vì phiên trước đang kẹt ở bước research.

### Whole-Plan Consistency Sweep

Không có mâu thuẫn còn mở. Plan sẵn sàng để `/ak:cook` khi được yêu cầu. Chưa implement trong phiên này.

<!-- slug: forgot-password-email-reset -->
