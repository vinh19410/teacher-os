# Phase 1: Cấu hình Better-Auth Email OTP & Bảo mật Role

## Goal
Tích hợp plugin `emailOTP` vào `packages/auth/src/index.ts`, định nghĩa template email tiếng Việt gửi mã OTP 6 số, thiết lập cơ chế cooldown 60s per-email ở `hooks.before`, và áp dụng các kiểm tra role isolation nghiêm ngặt để ngăn ngừa việc spam mail cho giáo viên/admin hoặc chiếm quyền role.

## Files to Create or Modify
- `packages/auth/src/mail/otp-email-template.ts` (Tạo mới: template email OTP tiếng Việt)
- `packages/auth/src/index.ts` (Sửa đổi: đăng ký plugin `emailOTP`, kiểm tra cooldown và role trước khi gửi OTP, chặn endpoint OTP ngoài student origin, điền tên mặc định và kiểm tra avatar trong `user.create.before`)
- `packages/auth/src/auth-email-otp.test.ts` (Tạo mới: bộ unit test kiểm chứng luồng Email OTP và bảo mật role)

## Tasks & Steps

### Task 1.1: Tạo template email OTP tiếng Việt
- **Goal**: Cung cấp hàm sinh nội dung email (HTML & text) chứa mã OTP 6 số, thông báo mã có hiệu lực trong 5 phút.
- **Target files and symbols**: `packages/auth/src/mail/otp-email-template.ts` (export `otpEmailTemplate`).
- **Steps**:
  1. Tạo file `packages/auth/src/mail/otp-email-template.ts` theo phong cách của `verification-email-template.ts` và `reset-password-email-template.ts`.
  2. Hàm `otpEmailTemplate({ otp }: { otp: string })` trả về `{ html: string, text: string }`.
  3. Giao diện email hiển thị rõ mã OTP (font to, dễ nhìn), lưu ý học viên không chia sẻ mã cho người khác và mã hết hạn sau 5 phút.
- **Success criteria**: Hàm xuất ra template HTML/text hợp lệ chứa chuỗi `otp`.
- **Verify**: `pnpm --filter @teacher-os/auth exec vitest run src/mail/mail.test.ts` exits 0.

### Task 1.2: Viết test TDD cho Email OTP trong packages/auth
- **Goal**: Tạo file test `packages/auth/src/auth-email-otp.test.ts` kiểm thử các kịch bản:
  1. Gửi OTP thành công cho email học viên mới từ origin student.
  2. Đăng nhập thành công với mã đúng, tạo user với `role: 'student'`, `emailVerified: true`, sinh session cookie.
  3. Từ chối mã sai, mã hết hạn, quá 3 lần nhập sai (`TOO_MANY_ATTEMPTS`).
  4. Cooldown 60s: gọi gửi OTP lần 2 trong vòng 60s cho cùng 1 email bị chặn / nuốt không gọi mailer và không làm mất mã OTP trước đó.
  5. Chặn gửi OTP hoặc đăng nhập OTP từ origin khác student (teacher, admin) -> 403 `ROLE_MISMATCH` hoặc `FORBIDDEN`.
  6. Chặn gửi OTP cho email thuộc `teacherEmails`/`adminEmails` từ student portal.
  7. Tài khoản giáo viên đã tồn tại cố đăng nhập từ student portal bằng OTP bị chặn ngay từ trước khi cập nhật `emailVerified`.
  8. Các endpoint password reset của OTP (`/email-otp/request-password-reset`, `/email-otp/reset-password`) bị vô hiệu hóa / trả về lỗi.
- **Target files and symbols**: `packages/auth/src/auth-email-otp.test.ts`.
- **Steps**:
  1. Tạo file test sử dụng `setupTestAuth` (dựa trên mẫu `auth-reset-password.test.ts` với in-memory LibSQL và migrations).
  2. Viết các test case mô tả các hành vi trên.
- **Success criteria**: File test tồn tại và chạy (ở trạng thái ban đầu sẽ fail trước khi cấu hình plugin - Red phase của TDD).
- **Verify**: `pnpm --filter @teacher-os/auth exec vitest run src/auth-email-otp.test.ts` chạy và ghi nhận kết quả mong đợi.

### Task 1.3: Cấu hình plugin emailOTP & Hardening trong packages/auth/src/index.ts
- **Goal**: Đăng ký và thiết lập plugin `emailOTP` với đầy đủ các lớp bảo vệ chống bypass và spam.
- **Target files and symbols**: `packages/auth/src/index.ts` (hàm `createAuth`, `hooks.before`, `databaseHooks.user.create.before`).
- **Steps**:
  1. **Khóa Origin & Vô hiệu hóa Endpoint Reset Password**:
     - Trong `hooks.before`:
       - Chặn hoàn toàn các endpoint `/email-otp/request-password-reset`, `/email-otp/reset-password`, `/forget-password/email-otp`, `/email-otp/change-email`, `/email-otp/request-email-change` (ném `APIError("BAD_REQUEST")` hoặc 404). Chỉ cho phép reset password qua token link đã bảo mật.
       - Với các endpoint `/email-otp/send-verification-otp` và `/sign-in/email-otp`: kiểm tra origin của request (`ctx.headers?.get("origin")`). Nếu origin KHÔNG nằm trong `input.studentOrigins`, ném `APIError("FORBIDDEN", { message: ROLE_MISMATCH_TEACHER_ON_PORTAL_MESSAGE, code: "ROLE_MISMATCH" })`.
  2. **Cooldown 60s per-email an toàn (tránh race condition DB overwrite)**:
     - Trong `hooks.before` khi `ctx.path === "/email-otp/send-verification-otp"`:
       - Đọc email từ body.
       - Truy vấn bảng `verification` tìm bản ghi cooldown chuyên dụng: `identifier = 'otp-cooldown:' + email`.
       - Nếu bản ghi tồn tại và `Date.now() - row.createdAt.getTime() < 60_000`, trả về phản hồi giả lập thành công `{ status: true }` ngay lập tức, KHÔNG cho endpoint handler chạy tiếp để không ghi đè mã OTP đã gửi và không gọi mailer.
       - Nếu không trong cooldown, ghi/cập nhật bản ghi `otp-cooldown:<email>` với timestamp hiện tại.
  3. **Chặn gửi OTP cho tài khoản không phải student**:
     - Trong `sendVerificationOTP`:
       - Kiểm tra email: nếu thuộc `teacherEmails` hoặc `adminEmails`, hoặc kiểm tra DB nếu user đã tồn tại với role khác `student`, thì không gửi mail (trả về trung tính).
       - Gửi email bằng `otpEmailTemplate({ otp })` qua `input.mailer.send` (chạy qua `input.runInBackground` nếu có).
  4. **Bảo vệ role và avatar trong databaseHooks**:
     - Trong `databaseHooks.user.create.before`:
       - Nếu user chưa có `name` hoặc `name === ""`, tự động điền tên từ tiền tố email (phần trước `@`).
       - Validate avatar `user.image` qua `validateUpdateUserImage(user.image)`; nếu không hợp lệ thì gán `undefined`.
- **Success criteria**: Tất cả các test case trong `auth-email-otp.test.ts` chuyển sang màu xanh (Green phase).
- **Verify**: `pnpm --filter @teacher-os/auth exec vitest run src/auth-email-otp.test.ts` exits 0 với 100% test passed.

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
