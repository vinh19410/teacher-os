---
phase: 1
title: "Auth gửi email đặt lại mật khẩu"
status: pending
priority: P1
effort: 3h
dependencies: []
---

# Phase 1: Auth gửi email đặt lại mật khẩu

## Goal

`createAuth` gửi email đặt lại mật khẩu qua `Mailer` hiện có. Token sống 1 giờ. Đặt mật khẩu mới thành công thì mọi session của user đó bị thu hồi. Lỗi gửi mail không bị nuốt.

## Files to Create / Modify

- Create: `packages/auth/src/mail/reset-password-email-template.ts`
- Create: `packages/auth/src/auth-reset-password.test.ts`
- Modify: `packages/auth/src/index.ts` (`emailAndPassword` trong `createAuth`)
- Modify: `packages/auth/src/mail/mail.test.ts` (thêm describe cho template mới)
- Modify: `packages/auth/scripts/preview-email.ts` (thêm preview, không đổi preview xác thực)

## Tasks & Steps

### Task 1.1 — Template email

- Goal: một hàm thuần trả `{ html, text }` cho URL better-auth đưa vào.
- Target files: `packages/auth/src/mail/reset-password-email-template.ts`, hàm `resetPasswordEmailTemplate`.
- Steps:
  1. Copy cấu trúc `verificationEmailTemplate` trong `packages/auth/src/mail/verification-email-template.ts`: `escapeHtml`, `lang="vi"`, preheader, nút và fallback URL, dark-mode CSS, `role="presentation"`.
  2. Đổi copy: tiêu đề và nút nói đặt lại mật khẩu TeacherOS. Ghi hạn 1 giờ trong html và text.
  3. `html` chứa URL đã escape. `text` chứa URL thô, URL nằm trên một dòng riêng, khớp `/^https?:\/\/\S+$/m`.
  4. Không nhận thêm field nào ngoài `{ url: string }`. Không nhúng token tách riêng.
- Success criteria: template không đọc env, không gọi mạng.
- Verify: test ở task 1.4.

### Task 1.2 — Bật sendResetPassword

- Goal: xin đặt lại mật khẩu thì mailer được gọi với subject cố định và body từ template.
- Target files: `packages/auth/src/index.ts`, object `emailAndPassword` (hiện chỉ có `enabled: true` quanh dòng 123).
- Steps:
  1. Giữ `enabled: true`. Thêm:
     - `resetPasswordTokenExpiresIn: 60 * 60`
     - `revokeSessionsOnPasswordReset: true`
     - `sendResetPassword: async ({ user, url }) => { ... }`
  2. Trong callback: `const { html, text } = resetPasswordEmailTemplate({ url })`, rồi `await input.mailer.send({ to: user.email, subject: "Đặt lại mật khẩu TeacherOS của bạn", html, text })`.
  3. Không bọc `try/catch` nuốt lỗi. Sign-up vẫn nuốt lỗi ở nhánh cũ. Reset thì ném lỗi ra để better-auth trả lỗi cho client.
  4. Không log `url` hay token. Không thêm `requireEmailVerification`.
  5. Import template cạnh import `verificationEmailTemplate`.
- Success criteria: file không còn nhánh reset nào nuốt exception.
- Verify: `no verification needed` — task 1.3 chứng minh.

### Task 1.3 — Test vòng đời token

- Goal: chứng minh email, chống liệt kê, lỗi mailer, và đăng nhập bằng mật khẩu mới.
- Target files: `packages/auth/src/auth-reset-password.test.ts`.
- Steps:
  1. Copy `setupTestAuth` từ `packages/auth/src/auth-verification-email.test.ts` vào file mới. Không export helper từ file cũ. `studentOrigins: []`, `corsOrigin` và `baseURL` cùng `http://localhost:3000`.
  2. Đăng ký user bằng `auth.handler` POST `${TEST_ORIGIN}/api/auth/sign-up/email` như test xác thực đang làm. Mật khẩu `password123`.
  3. POST `${TEST_ORIGIN}/api/auth/request-password-reset` body JSON `{ email, redirectTo: "http://localhost:3000/reset-password" }`, header `content-type: application/json` và `origin: http://localhost:3000`.
  4. Test `request-password-reset emails a link and the token sets a new password`:
     - status response xin link là 200
     - sau sign-up, lần `send` của mailer cho subject chứa `Đặt lại mật khẩu` đúng một lần (sign-up đã gửi một thư xác thực khác, đếm theo subject)
     - text của thư reset có một URL `https?://`
     - `auth.handler(new Request(urlThatWasMailed))` với redirect thủ công (`redirect: "manual"` nếu gọi fetch; với `auth.handler` thì đọc status và `Location`)
     - lấy `token` từ query `token` của `Location`, hoặc từ chính URL đã gửi nếu URL đó đã chứa `token`
     - POST `${TEST_ORIGIN}/api/auth/reset-password` body `{ newPassword: "newpassword123", token }`
     - POST sign-in email với mật khẩu mới trả 200
     - POST sign-in email với `password123` không trả 200
  5. Test `unknown email does not send mail and matches the known-email status`:
     - xin reset cho `missing-user@example.com` khi chưa đăng ký email đó
     - `send` không được gọi với subject đặt lại mật khẩu cho email đó
     - status HTTP bằng đúng status của test user thật (cùng 200). Nếu khác, test này phải fail.
  6. Test `mailer rejection on request-password-reset is not success`:
     - user đã tồn tại
     - `send` resolve cho thư xác thực sign-up, rồi reject cho lần reset
     - response của request-password-reset có status khác 200
  7. Nếu `auth.handler` không nhận redirect thủ công và trả body thay vì `Location`, đọc token từ URL trong email. Không bịa endpoint khác `/api/auth/request-password-reset` và `/api/auth/reset-password`.
- Success criteria: ba test trên có đúng tên đó.
- Verify: `pnpm --filter @teacher-os/auth test` exits 0 và output chứa `request-password-reset emails a link and the token sets a new password`.

### Task 1.4 — Test template và preview

- Goal: template khóa các bất biến giống thư xác thực, script preview vẫn chạy.
- Target files: `packages/auth/src/mail/mail.test.ts`, `packages/auth/scripts/preview-email.ts`.
- Steps:
  1. Trong `mail.test.ts`, thêm describe `resetPasswordEmailTemplate`. URL mẫu có `&` trong query. Expect `lang="vi"`, `TeacherOS`, `1 giờ`, `html.length < 15000`, href chứa URL đã escape `&` thành `&amp;`, text chứa URL thô và match `/^https?:\/\/\S+$/m`.
  2. Trong `preview-email.ts`, gọi thêm template reset và ghi `packages/auth/.mail-preview/reset-password.html`. Giữ nguyên file `verification.html`. In ra path file reset.
- Success criteria: preview xác thực không bị xóa.
- Verify: `pnpm --filter @teacher-os/auth test` exits 0 và `pnpm --filter @teacher-os/auth preview:email` exits 0, output chứa `reset-password.html`.

## Security Considerations

- Email chỉ chứa `url` better-auth cấp. Không tự ghép token vào origin lạ.
- `redirectTo` trong test là cùng origin đã nằm trong `trustedOrigins` của `setupTestAuth`.
- `revokeSessionsOnPasswordReset: true` là cố ý, không đổi thành false cho test dễ hơn.

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
