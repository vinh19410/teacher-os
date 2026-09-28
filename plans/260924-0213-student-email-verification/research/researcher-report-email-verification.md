# Research: Email verification cho teacher-os (Better-Auth 1.6.27 + Cloudflare Workers)

Quy ước: `BA:` = `node_modules/.pnpm/better-auth@1.6.27_*/node_modules/better-auth`,
`CORE:` = `node_modules/.pnpm/@better-auth+core@1.6.27_*/node_modules/@better-auth/core`.
Đã xác minh trực tiếp từ source cài đặt (không chỉ docs).

## 1. Better Auth 1.6.27 — option chính xác

`CORE:dist/types/init-options.d.mts:510-572` — `emailVerification`:

| Option | Mặc định | Ghi chú |
|---|---|---|
| `sendVerificationEmail({ user, url, token }, request?)` | không có | Không cấu hình → endpoint trả 400 `VERIFICATION_EMAIL_NOT_ENABLED` (BA:dist/api/routes/email-verification.mjs:24-27) |
| `sendOnSignUp` | `undefined` = follow `requireEmailVerification` | Điều kiện gửi khi sign-up: `emailVerification?.sendOnSignUp ?? emailAndPassword.requireEmailVerification` (BA:dist/api/routes/sign-up.mjs:242). **Với soft mode (không bật requireEmailVerification) phải set `sendOnSignUp: true` tường minh** |
| `sendOnSignIn` | `false` | Không có trong docs — chỉ resend khi sign-in bị chặn nếu bật |
| `autoSignInAfterVerification` | `false` | Tạo session + set cookie ngay khi click link verify (BA:dist/api/routes/email-verification.mjs:295-314) |
| `expiresIn` | `3600` giây | TTL token |

- `emailAndPassword.requireEmailVerification` (`init-options.d.mts:596`): chặn sign-in khi chưa verify — **KHÔNG dùng trong plan này (soft mode)**.
- Token verify là **JWT HS256 stateless**, KHÔNG lưu bảng `verification` (sign-up.mjs:243-245; email-verification.mjs:176).
- `/verify-email` GET query `{ token, callbackURL? }`; hết hạn → redirect `callbackURL?error=TOKEN_EXPIRED`; sai → `?error=INVALID_TOKEN`; **`callbackURL` bị `originCheck` validate Against `trustedOrigins`** (email-verification.mjs:124-131).
- Verify thành công: `updateUserByEmail(email, { emailVerified: true })` (email-verification.mjs:293).
- `/send-verification-email` POST `{ email, callbackURL? }` → `{ status: true }`; đã verify → 400 `EMAIL_ALREADY_VERIFIED` (email-verification.mjs:37-123).
- Client methods: `authClient.sendVerificationEmail({ email, callbackURL })`, `authClient.verifyEmail({ query: { token, callbackURL } })`.
- **Soft mode: sign-up VẪN tạo session** — hành vi skip-auto-sign-in chỉ kích hoạt khi `requireEmailVerification || autoSignIn === false` (sign-up.mjs:162-163). Soft mode không đụng 2 flag này.
- DB: **không cần migration** — `user.email_verified` đã có (`packages/db/src/schema/auth.ts:8-10`), bảng `verification` đã có (auth.ts:72-88, không dùng cho flow này).
- Seeding/fix tay: `db.update(user).set({ emailVerified: true })` bằng Drizzle trực tiếp (`/update-user` không cho set emailVerified; admin plugin không cần).
- Khác biệt docs-vs-source: (1) resend khi sign-in chỉ khi `sendOnSignIn: true`; (2) `sendOnSignUp` cần set tường minh khi không có requireEmailVerification; (3) `sendOnPasswordReset` KHÔNG tồn tại; (4) sign-up vẫn tạo session trong soft mode.

## 2. Provider email từ Cloudflare Workers (2025-2026)

| Provider | Cơ chế | Free tier | Rủi ro |
|---|---|---|---|
| **Resend** | `fetch` HTTP thuần | 100 email/ngày, 3.000/tháng, 10 req/s (CF docs ghi 2 req/s cho tài khoản mới) | Chưa verify domain → chỉ gửi được tới email chủ tài khoản |
| SES | HTTPS + SigV4 tự ký trong Worker | 3.000/tháng năm đầu | Phức tạp nhất |
| Brevo / Mailjet / Postmark | HTTP API | 300/200/100 ngày-tháng | DX kém hơn / free tier vô dụng |
| MailChannels | — | **Free Workers integration đã chết từ 30/06/2024** | Không dùng |
| CF Email Service `send_email` binding | Native binding | Theo hạn mức Email Service | Bắt buộc onboard domain với Cloudflare; deliverability chưa nhiều case study — phương án B |

Resend detail: `POST https://api.resend.com/emails`, header `Authorization: Bearer re_...`, payload `{ from, to, subject, html, text }`; `onboarding@resend.dev` chỉ gửi được tới email chủ tài khoản; gửi cho học viên thật = verify domain (DKIM/SPF trong dashboard Resend). Pro $20/tháng (50k emails).

Dev/test/CI: **LogMailer** — in URL verify ra console, không gửi thật. Không cần domain thật khi dev.

## 3. HTML email template (best practice 2026)

1. Table-based layout, container 600px, `role="presentation"` — Outlook Windows không hỗ trợ flexbox/grid (Litmus 4/2025, caniemail.com).
2. **Mọi style cốt lõi phải inline**; `<style>` chỉ chứa media query + dark-mode override (Gmail 2016+ hỗ trợ một phần; Outlook.com strip — Email on Acid 3/2024).
3. Preheader ẩn ngay sau `<body>` (display:none, max-height:0) — dòng preview.
4. Bulletproof button padding-based đủ cho client hiện đại; VML chỉ cần cho Outlook Windows — bỏ để giảm weight.
5. Dark mode: `<meta name="color-scheme" content="light dark">` + `@media (prefers-color-scheme: dark)` + selector `[data-ogsc]` cho Outlook app (Litmus 2/2025).
6. Gmail clip ở ~102KB — template verify phải < 15KB.
7. Luôn gửi kèm plain-text `text` song song `html` (điểm spam + fallback).
8. System font stack, không web font (Gmail/Outlook.com không hỗ trợ đáng tin).
9. Accessibility: `role="presentation"`, `<html lang="vi">`, alt text, CTA là `<a>` thật.

Skeleton production đầy đủ (tiếng Việt, brand TeacherOS, màu indigo #4f46e5, dark-mode, preheader, button, fallback URL, footer) đã được soạn trong report gốc của researcher và được vật chất hóa trong `phase-01-mailer-and-template.md` (Task 1.2).
