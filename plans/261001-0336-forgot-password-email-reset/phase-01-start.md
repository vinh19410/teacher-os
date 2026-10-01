---
phase: 1
title: "Auth gửi email đặt lại mật khẩu"
status: done
priority: P1
effort: 4h
dependencies: []
---

# Phase 1: Auth gửi email đặt lại mật khẩu

## Goal

`createAuth` gửi email đặt lại mật khẩu qua `Mailer` hiện có. Token sống 1 giờ. Đặt mật khẩu mới thành công thì mọi session của user đó bị thu hồi. Mail gửi nền để response của email có tài khoản và email lạ không phân biệt được về nội dung lẫn thời gian. Lỗi gửi mail được log (không kèm url/token), không nuốt âm thầm. Mail không bao giờ đi tới cổng khác role của tài khoản.

## Files to Create / Modify

- Create: `packages/auth/src/mail/reset-password-email-template.ts`
- Create: `packages/auth/src/auth-reset-password.test.ts`
- Create: `apps/server/src/log-redaction.ts` và `apps/server/src/log-redaction.test.ts`
- Modify: `packages/auth/src/index.ts` (`CreateAuthInput`, `advanced`, `emailAndPassword` trong `createAuth`)
- Modify: `apps/server/src/index.ts` (truyền `runInBackground` bằng `waitUntil`)
- Modify: `apps/server/src/app.ts` (`app.use(logger())` dùng hàm che token)
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

### Task 1.2 — Bật sendResetPassword, gửi nền, khóa role

- Goal: xin đặt lại mật khẩu thì mailer được gọi với subject cố định và body từ template, ngoài đường request, chỉ cho đúng cổng của tài khoản.
- Nền tảng đã kiểm chứng (better-auth v1.6.27, `api/routes/password.ts` và `context/create-context.ts`): endpoint `request-password-reset` gọi `runInBackgroundOrAwait(sendResetPassword(...))`, hàm này `try/catch` và chỉ log, nên endpoint luôn trả 200 dù callback ném lỗi. Nhánh email lạ chỉ giả lập một lần tra DB. Vì vậy "ném lỗi để client thấy lỗi" là không khả thi và còn mở oracle liệt kê tài khoản. Quyết định D5 (đã sửa) thay thế.
- Target files: `packages/auth/src/index.ts`, `apps/server/src/index.ts`.
- Steps:
  1. `CreateAuthInput` thêm field tùy chọn `runInBackground?: (promise: Promise<unknown>) => void`. Trong `advanced` của `betterAuth`, thêm `...(input.runInBackground && { backgroundTasks: { handler: input.runInBackground } })`. Không truyền thì better-auth tự `await` (Node, test, e2e).
  2. `apps/server/src/index.ts`: `import { waitUntil } from "cloudflare:workers"` (module đã dùng ở `packages/env/src/server.ts`, bundler đã `neverBundle` nó, worker có `nodejs_compat`). Truyền `runInBackground: (promise) => waitUntil(promise)` vào `createAuth`.
  3. Trong `emailAndPassword`, giữ `enabled: true`. Thêm `resetPasswordTokenExpiresIn: 60 * 60`, `revokeSessionsOnPasswordReset: true`, và `sendResetPassword: async ({ user, url }) => { ... }`.
  4. Callback, theo thứ tự:
     - Lấy `callbackURL` từ `new URL(url).searchParams.get("callbackURL")`. Tính app đích bằng `resolveRequestApp({ origin: new URL(callbackURL).origin, studentOrigins: input.studentOrigins, teacherOrigins })`. Nếu `callbackURL` rỗng hoặc không parse được thì coi là lệch.
     - Nếu `resolveUserRole(user.role) !== appĐích`: return, không gửi, không log email. Response HTTP vẫn trung tính vì better-auth đã trả 200 sau callback. (Ý định giống `before` hook, nhưng đặt trong callback vì ở đó có sẵn `user` và `url`, tránh phụ thuộc cách `before` hook rút ngắn response.)
     - `const { html, text } = resetPasswordEmailTemplate({ url })`.
     - `try { await input.mailer.send({ to: user.email, subject: "Đặt lại mật khẩu TeacherOS của bạn", html, text }) } catch (error) { console.error("[auth] reset-password email failed", { userId: user.id, message: error instanceof Error ? error.message : "unknown" }) }`. Không ném lại: better-auth sẽ nuốt, và ném lại chỉ tạo log trùng.
  5. Không log `url`, `token`, `user.email`. Không thêm `requireEmailVerification`.
  6. Import template cạnh import `verificationEmailTemplate`; import `resolveUserRole` cạnh `resolveRequestApp`.
- Success criteria: không còn nhánh nào ném exception từ callback; callback chỉ gửi khi role khớp cổng.
- Verify: `no verification needed` — task 1.3 chứng minh.

### Task 1.2b — Che token trong log HTTP của server

- Goal: link reset `GET /api/auth/reset-password/<token>` không để token trong log Hono.
- Target files: `apps/server/src/log-redaction.ts`, `apps/server/src/log-redaction.test.ts`, `apps/server/src/app.ts` (dòng `app.use(logger())`).
- Steps:
  1. `log-redaction.ts` export `redactResetToken(line: string): string` thay đoạn sau `/api/auth/reset-password/` đến trước `?`, khoảng trắng hoặc hết chuỗi bằng `[redacted]`.
  2. `app.ts`: `app.use(logger((line, ...rest) => console.log(redactResetToken(line), ...rest)))`. Giữ nguyên thứ tự middleware.
  3. Test: dòng `<-- GET /api/auth/reset-password/abc123?callbackURL=http%3A%2F%2Fx` ra `.../reset-password/[redacted]?callbackURL=...`; dòng không liên quan giữ nguyên; `POST /api/auth/reset-password` (không token trong path) giữ nguyên.
- Success criteria: chuỗi `abc123` không còn trong output.
- Verify: `pnpm --filter server exec vitest run src/log-redaction.test.ts` exits 0.
- Ghi nhận (không sửa): `createLogMailer` in nguyên `text` kể cả URL reset. Đó là chế độ log-only cho dev/preview, server đã `console.error` cảnh báo chế độ này khi khởi động (`apps/server/src/index.ts`). Production phải đặt `MAILER_IMPL=resend`.

### Task 1.3 — Test vòng đời token

- Goal: chứng minh email, chống liệt kê (nội dung và thời gian), lỗi mailer, thu hồi session, khóa role, và đăng nhập bằng mật khẩu mới.
- Target files: `packages/auth/src/auth-reset-password.test.ts`.
- Steps:
  1. Copy `setupTestAuth` từ `packages/auth/src/auth-verification-email.test.ts` vào file mới. Không export helper từ file cũ. Mặc định `studentOrigins: []`, `corsOrigin` và `baseURL` cùng `http://localhost:3000`. Cho phép tham số `runInBackground` và `studentOrigins`/`corsOrigin` khi test cần.
  2. Đăng ký user bằng `auth.handler` POST `${TEST_ORIGIN}/api/auth/sign-up/email` như test xác thực đang làm. Mật khẩu `password123`.
  3. POST `${TEST_ORIGIN}/api/auth/request-password-reset` body JSON `{ email, redirectTo: "http://localhost:3000/reset-password" }`, header `content-type: application/json` và `origin: http://localhost:3000`.
  4. Test `request-password-reset emails a link and the token sets a new password`:
     - sign-in trước để lấy cookie session cũ
     - status response xin link là 200
     - sau sign-up, lần `send` của mailer cho subject chứa `Đặt lại mật khẩu` đúng một lần (đếm theo subject)
     - text của thư reset có một URL `https?://`
     - `auth.handler(new Request(urlThatWasMailed))`; đọc status 302 và `Location`, lấy `token` từ query `token` của `Location`. Redirect do `ctx.redirect` nên `Location` đọc trực tiếp được trên `Response` của `auth.handler`.
     - POST `${TEST_ORIGIN}/api/auth/reset-password` body `{ newPassword: "newpassword123", token }`
     - POST sign-in email với mật khẩu mới trả 200
     - POST sign-in email với `password123` không trả 200
     - `GET /api/auth/get-session` với cookie session cũ trả session null (khóa `revokeSessionsOnPasswordReset`)
  5. Test `unknown email does not send mail and matches the known-email response`:
     - xin reset cho `missing-user@example.com`
     - `send` không được gọi với subject đặt lại mật khẩu cho email đó
     - status và body JSON bằng đúng response của user thật (cùng 200, cùng `message`). Nếu khác, test phải fail.
  6. Test `mailer rejection is logged and does not change the response`:
     - user đã tồn tại; `send` resolve cho thư xác thực sign-up, rồi reject cho lần reset
     - spy `console.error`; response của request-password-reset vẫn 200 và body bằng response email lạ
     - spy được gọi với chuỗi chứa `reset-password email failed`; không có đối số nào chứa `token`, `reset-password/` hay email của user
  7. Test `request returns before the mailer finishes when runInBackground is set`:
     - `setupTestAuth({ runInBackground: (p) => { pending.push(p) } })`; mailer reset sleep 300ms
     - response của user thật trả về trong thời gian ngắn hơn 300ms (đo `performance.now()`, ngưỡng 150ms); sau `await Promise.all(pending)` mailer đã được gọi đúng một lần
  8. Test `reset link requested for another app's origin sends no mail`:
     - `corsOrigin: ["http://localhost:3000", "http://localhost:3001"]`, `studentOrigins: ["http://localhost:3001"]`
     - user đăng ký từ origin teacher (role teacher). POST request-password-reset với `origin` và `redirectTo` của origin student 3001
     - status 200; `send` không được gọi với subject đặt lại mật khẩu
  9. Test `reset creates a password credential for an account that had none` (D7):
     - có user không có account `credential` (tạo user qua cùng db của `setupTestAuth`, hoặc xóa row credential account của user vừa đăng ký)
     - xin reset, lấy token, `reset-password`, rồi sign-in email với mật khẩu mới trả 200
  10. Không bịa endpoint khác `/api/auth/request-password-reset`, `/api/auth/reset-password` và `GET /api/auth/reset-password/:token`.
- Success criteria: sáu test trên (bước 4, 5, 6, 7, 8, 9) có đúng tên đó.
- Verify: `pnpm --filter @teacher-os/auth test` exits 0 và output chứa `request-password-reset emails a link and the token sets a new password`.

### Task 1.4 — Test template và preview

- Goal: template khóa các bất biến giống thư xác thực, script preview vẫn chạy.
- Target files: `packages/auth/src/mail/mail.test.ts`, `packages/auth/scripts/preview-email.ts`.
- Steps:
  1. Trong `mail.test.ts`, thêm describe `resetPasswordEmailTemplate`. URL mẫu có `&` trong query. Expect `lang="vi"`, `TeacherOS`, `1 giờ`, `html.length < 15000`, href chứa URL đã escape `&` thành `&amp;`, text chứa URL thô và match `/^https?:\/\/\S+$/m`.
  2. Trong `preview-email.ts`, gọi thêm template reset và ghi `packages/auth/.mail-preview/reset-password.html`. Giữ nguyên file `verification.html`. In ra path file reset.
- Success criteria: preview xác thực không bị xóa.
- Verify: `pnpm --filter @teacher-os/auth test` exits 0 và `pnpm --filter @teacher-os/auth preview:email` exits 0, output chứa `reset-password.html`. Sau đó `pnpm --filter server exec vitest run src/log-redaction.test.ts src/auth-roundtrip.test.ts` exits 0 và `pnpm --filter server check-types` exits 0 (không test nào import `apps/server/src/index.ts`, nên `check-types` là cổng duy nhất cho import `cloudflare:workers` và chữ ký `createAuth` mới).

## Security Considerations

- Email chỉ chứa `url` better-auth cấp. Không tự ghép token vào origin lạ.
- `redirectTo` trong test là cùng origin đã nằm trong `trustedOrigins` của `setupTestAuth`.
- `revokeSessionsOnPasswordReset: true` là cố ý, không đổi thành false cho test dễ hơn.
- Response của `request-password-reset` không phụ thuộc việc email có tài khoản hay mailer có lỗi. Gửi nền loại timing oracle. Hệ quả chấp nhận: lỗi Resend chỉ thấy trong log, người dùng thấy câu thành công dù thư không đến.
- Rate limit mặc định của better-auth cho path này là 3 request/60s/IP, in-memory theo isolate, chỉ bật ở production. Không đổi cấu hình server. Rủi ro còn lại: email-bombing một hộp thư bị giới hạn theo IP và theo isolate, và học viên chung NAT chia chung bucket. UI phase 2 xử lý copy 429.
- Tài khoản chỉ đăng nhập Google nhận mail reset và `resetPassword` tạo credential mật khẩu cho tài khoản đó (hành vi mặc định của better-auth, quyết định D7). Người kiểm soát hộp thư email đó vốn đã có quyền ngang Google reset; test khóa hành vi này.
- Rủi ro pre-hijack do sign-up không bắt xác thực email (D6, ngoài phạm vi): reset thu hồi mọi session, test xác nhận session cũ về null.

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
