---
title: remove-student-email-otp-761
date: 2026-11-17
summary: "Gỡ bỏ hoàn toàn đăng nhập Email OTP trên apps/student và packages/auth, khôi phục /login 2 tab Đăng nhập và Đăng ký (#761)"
---

# remove-student-email-otp-761

# 2026-11-17 — Issue #761 (Gỡ bỏ đăng nhập bằng mã email trên cổng học viên)

**Nhánh:** `feat/remove-student-email-otp` | **Plan:** `plans/261117-1228-remove-student-email-otp/plan.md` | **Trạng thái:** Hoàn tất implement & verification local, chờ commit/push/PR.

## Bối cảnh & Rủi ro thực tế

Trang `/login` của `apps/student` trước đây mặc định mở tab `Mã email` (`OtpSignInForm`) kèm `Mật khẩu` và `Đăng ký`, dựa trên plugin `emailOTP` của `better-auth` trong `packages/auth/src/index.ts`. Khi gỡ tính năng này, chỉ ẩn tab ở frontend sẽ bỏ ngỏ 9 endpoint OTP phía backend — vừa thừa bề mặt tấn công/spam mail, vừa dễ gây nhầm lẫn trạng thái.

Điểm dễ sập nhất lúc rà soát (Red Team Review) là hai bẫy ngầm:
1. **Tài khoản cũ chỉ từng đăng nhập bằng OTP** có bản ghi `user` (`emailVerified = true`) nhưng không có `account` (`providerId = "credential"`). Nếu bỏ OTP mà không đổi thông báo lỗi, họ bấm Đăng ký sẽ ăn lỗi tiếng Anh `USER_ALREADY_EXISTS`, còn bấm Đăng nhập sẽ ăn `INVALID_EMAIL_OR_PASSWORD` mà không hiểu cách đặt mật khẩu qua `Quên mật khẩu?`.
2. **Xóa mù `student-auth-otp.test.ts`** sẽ vô tình làm mất luôn bài test tích hợp duy nhất từ `createAuth` → `getSessionUser` → `/api/student/me` cho cơ chế auto-provisioning học viên `#716` (`maybeProvisionVerifiedStudent`), cũng như dễ tay nhanh xóa nhầm `userName` trim/fallback trong `databaseHooks.user.create.before`.

## Quyết định kỹ thuật

- **Gỡ cả UI lẫn backend OTP:** Xóa `OtpSignInForm`, tab `Mã email`, `emailOTPClient` (`apps/student/src/lib/auth-client.ts`), plugin `emailOTP`, `BLOCKED_EMAIL_OTP_PATHS`, cooldown hook OTP và `packages/auth/src/mail/otp-email-template.ts`. Khôi phục `apps/student/src/components/auth/auth-tabs.tsx` về 2 tab `Đăng nhập` (`#tab-signin`) và `Đăng ký` (`#tab-signup`), `login.tsx` mặc định `"signin"` và tự fallback nếu `localStorage` còn kẹt `"otp"`.
- **Giữ nguyên phần lõi dùng chung:** Bảo toàn `#716` (`maybeProvisionVerifiedStudent`), `userName` trim/fallback, `validateUpdateUserImage`, Google OAuth và luồng Quên/Đặt lại mật khẩu.
- **Hướng dẫn người dùng cũ trong `apps/student/src/lib/auth-error.ts`:** Map `USER_ALREADY_EXISTS`, `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` và `INVALID_EMAIL_OR_PASSWORD` sang tiếng Việt, chỉ thẳng người dùng từng dùng mã email sang `Quên mật khẩu?` để tạo `credential`.
- **Thay thế test & đồng bộ docs:** Chuyển `apps/server/src/routes/student-auth-otp.test.ts` thành `apps/server/src/routes/student-auth-provisioning.test.ts` (`sign-up/email` + `verify-email` → `/api/student/me`), bổ sung test khẳng định cả 9 route OTP trả HTTP `404` và `apps/student/test/login-route.test.tsx` (`jsdom`). Đồng bộ 6 file đặc tả/usecase dưới `docs/auth-signin/`.

## Kiểm chứng

- `@teacher-os/auth`: 9/9 files, 102 tests pass.
- `server`: 118/118 files, 1545 passed + 1 expected fail.
- `student`: 56/56 files, 513 tests pass.
- `web`: 206/206 files, 2207 tests pass.
- `pnpm check-types` (12/12), `pnpm build` (14/14), `pnpm exec biome check .` (0 errors).
- Chụp 6 ảnh POT (`plans/reports/761-student-login-{desktop,tablet,mobile}-{light,dark}.png`) + kiểm tra 0px overflow ở 320px.

## Bài học & Bước tiếp theo

- **Bài học:** Khi gỡ một phương thức auth, phải lần từ `account.providerId` của user cũ và rà những hook/test đang "ăn ké" qua đường cũ (`user.create.before`, `#716` provisioning) trước khi xóa file test.
- **Bước tiếp theo:** Commit + push nhánh `feat/remove-student-email-otp`, mở PR vào `develop` và đính kèm POT lên issue `#761`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
