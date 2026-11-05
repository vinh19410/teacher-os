# Phase 3: Giao diện đăng nhập OTP tại cổng học viên

## Goal
Hiện đại hóa trang đăng nhập cổng học viên (`apps/student`): chuyển luồng đăng nhập bằng mã qua email (Email OTP) thành phương thức mặc định, hỗ trợ đếm ngược 60s để gửi lại mã, giữ liên kết đăng nhập bằng mật khẩu làm phương án phụ cho tài khoản cũ, giữ nút Google OAuth, và loại bỏ tab đăng ký mật khẩu dư thừa.

## Files to Create or Modify
- `apps/student/src/lib/auth-client.ts` (Sửa đổi: thêm plugin `emailOTPClient`)
- `apps/student/src/components/auth/otp-sign-in-form.tsx` (Tạo mới: form nhập email và mã OTP 6 số)
- `apps/student/src/components/auth/otp-sign-in-form.test.tsx` (Tạo mới: unit test cho component form OTP)
- `apps/student/src/routes/login.tsx` (Sửa đổi: tích hợp OTP form làm mặc định, thêm nút chuyển sang mật khẩu)
- `apps/student/src/components/auth/sign-up-form.tsx` (Loại bỏ hoặc gỡ khỏi luồng hiển thị chính)

## Tasks & Steps

### Task 3.1: Thêm emailOTPClient vào apps/student/src/lib/auth-client.ts
- **Goal**: Cung cấp các phương thức `authClient.emailOTP.sendVerificationOTP` và `authClient.signIn.emailOtp` cho frontend.
- **Target files and symbols**: `apps/student/src/lib/auth-client.ts` (biến `authClient`).
- **Steps**:
  1. Import `emailOTPClient` từ `better-auth/client/plugins`.
  2. Bổ sung `plugins: [emailOTPClient()]` vào lời gọi `createAuthClient(...)`.
- **Success criteria**: TypeScript biên dịch thành công mà không phát sinh lỗi type.
- **Verify**: `pnpm --filter student exec tsc --noEmit` exits 0.

### Task 3.2: Xây dựng component OTP Sign-in Form
- **Goal**: Tạo component `OtpSignInForm` với 2 trạng thái:
  - Trạng thái 1: Nhập email, nút "Gửi mã đăng nhập" (kèm validation format email).
  - Trạng thái 2: Nhập mã OTP 6 số (ô input 6 ký tự hoặc input OTP), nút "Đăng nhập", nút đếm ngược 60s "Gửi lại mã", nút "Đổi email" để quay lại bước 1.
  - Hiển thị thông báo lỗi tiếng Việt nếu mã sai, hết hạn, quá số lần thử hoặc gặp lỗi `ROLE_MISMATCH`.
- **Target files and symbols**: `apps/student/src/components/auth/otp-sign-in-form.tsx`.
- **Steps**:
  1. Xây dựng state quản lý bước (`step: 'email' | 'otp'`), `email`, `otp`, `countdown: number`, `isSubmitting: boolean`.
  2. Kết nối với `authClient.emailOTP.sendVerificationOTP({ email, type: 'sign-in' })`.
  3. Kết nối với `authClient.signIn.emailOtp({ email, otp })`.
  4. Sau khi đăng nhập thành công, điều hướng về `returnUrl` hoặc `/overview`.
  5. Thiết kế tuân thủ Design System v2 của repo (shadcn token, Geist, nút loader spinner khi submitting).
- **Success criteria**: Component hoạt động đầy đủ tính năng và chuyển đổi mượt mà giữa các bước.
- **Verify**: `pnpm --filter student test` exits 0.

### Task 3.3: Tích hợp vào apps/student/src/routes/login.tsx
- **Goal**: Cập nhật trang `/login` cổng học viên:
  - Mặc định hiển thị `OtpSignInForm`.
  - Giữ nút `GoogleOAuthButton`.
  - Có liên kết "Đăng nhập bằng mật khẩu" để hiển thị `SignInForm` (dạng toggle hoặc accordion mở rộng).
  - Loại bỏ `SignUpForm` khỏi giao diện vì OTP tự động đăng ký và xác thực tài khoản.
- **Target files and symbols**: `apps/student/src/routes/login.tsx`.
- **Steps**:
  1. Sửa `RouteComponent` trong `login.tsx`.
  2. Thay `AuthTabs` (signin / signup) bằng cấu trúc trực quan: Luồng OTP chính, nút Google, và liên kết phụ chuyển sang mật khẩu nếu cần.
  3. Cập nhật tiêu đề trang phù hợp: "Đăng nhập cổng học viên" / "Nhập email để nhận mã đăng nhập nhanh".
- **Success criteria**: Giao diện gọn gàng, rõ ràng, không còn lỗi role hay chuyển tab phức tạp.
- **Verify**: `pnpm --filter student test` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
