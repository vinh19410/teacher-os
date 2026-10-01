# Scout report: email verification flow — vì sao sau verify chỉ thấy "OK"

Ngày: 2026-10-01 · Phạm vi: đọc-only, toàn monorepo teacher-os · Phục vụ plan `261001-0635-verify-email-confirmation-page`.

## 1. Chuỗi sự kiện hiện tại (teacher/web)

1. Teacher đăng ký tại `apps/web/src/components/sign-up-form.tsx:40-44` — gọi `authClient.signUp.email({ email, password, name })`, **không truyền `callbackURL`**. Sau khi có session (soft mode), form `window.location.assign` thẳng vào workspace (dòng 66).
2. `packages/auth/src/index.ts:126-154` — `emailVerification.sendOnSignUp: true`, `autoSignInAfterVerification: true`, `expiresIn: 3600`; mail template tiếng Việt `packages/auth/src/mail/verification-email-template.ts` gửi `url` do better-auth phát hành.
3. `packages/auth/src/topology.ts:10-21` — baseURL = `BETTER_AUTH_URL + /api/auth` ⇒ link trong email nằm trên **origin API** (`localhost:8000` dev / `api.<domain>` prod): `{API}/api/auth/verify-email?token=…`.
4. Bấm link: better-auth verify token xong. **Không có `callbackURL` ⇒ không redirect** — trình duyệt đứng lại origin API nhận response trần. `apps/server/src/app.ts:153-154` mount `/api/auth/*` và root `/` trả `c.text("OK")` (literal "OK" duy nhất trong repo, pinned bởi `apps/server/src/readiness.test.ts:76-81`).

## 2. Hành vi better-auth 1.6.27 — đã đối chiếu dist (unpkg @1.6.27, dist/api/routes/email-verification.mjs)

| Trường hợp | Hành vi |
|---|---|
| Verify OK + có `callbackURL` | `throw ctx.redirect(ctx.query.callbackURL)` — redirect **nguyên vẹn**, không thêm param nào |
| Verify OK + không `callbackURL` | `ctx.json({ status: true, user: null })` — response trần trên origin API |
| Token hết hạn/sai + có `callbackURL` | redirect `${callbackURL}?error=TOKEN_EXPIRED` hoặc `INVALID_TOKEN` (append `&error=` nếu URL đã có `?`) |
| Token hết hạn/sai + không `callbackURL` | `APIError "UNAUTHORIZED"` |
| `autoSignInAfterVerification` | `setSessionCookie` chạy **trước** redirect/return ⇒ session cookie có sẵn khi landing |
| `callbackURL` | bị originCheck với `trustedOrigins` (email-verification.mjs:124-131, nghiên cứu `plans/260924-0213-student-email-verification/research/researcher-report-email-verification.md:21`) |

Token verify là JWT HS256 single-use, không lưu bảng `verification`.

## 3. Flow student (đã chạy tốt — precedent)

- `apps/student/src/components/auth/sign-up-form.tsx:36-41` truyền `callbackURL: ${window.location.origin}/login` ⇒ sau verify redirect về portal, gate đẩy sang `/onboarding`. E2E chứng minh: `apps/e2e/specs/student-portal-email-verification.spec.ts:72-78`.
- Resend precedent: `apps/student/src/components/overview/student-error-view.tsx:39-71` — `authClient.sendVerificationEmail({ email, callbackURL: ${origin}/login })`, xử lý `EMAIL_ALREADY_VERIFIED`.

## 4. Ràng buộc kỹ thuật

- **E2E mail log**: `apps/e2e/src/boot.ts:40` regex `\/verify-email\?` — không được đổi shape URL trong email.
- **trustedOrigins**: `packages/auth/src/index.ts:73-78` — `trustedOrigins` = toàn bộ `corsOrigin`; e2e boot (`apps/e2e/src/boot.ts:27-30`) đã gồm origin web (`E2E_WEB_PORT ?? 8001`) ⇒ callbackURL về web origin được chấp nhận.
- **Worker SPA allowlist (web)**: `apps/web/src/routes-matcher.ts:4-21` `VALID_EXACT_ROUTES` + drift guard `apps/web/src/routes-matcher.test.ts` (so `FileRoutesByFullPath` từ `routeTree.gen.ts`) ⇒ route mới phải đăng ký cả hai nơi. Student worker có SPA fallback mở (`apps/student/src/worker.ts:83-94`).
- **UI stack**: Vite 8 + React 19 + TanStack Router/Form + zod, Tailwind v4 + shadcn qua `@teacher-os/ui`; web UI tiếng Anh, student UI tiếng Việt; không i18n framework.
- **Precedent đọc `?error=`**: `apps/web/src/routes/login.tsx:20-30` `validateSearch` giữ `error`/`error_description` từ OAuth callback.
- **E2E helpers**: `apps/e2e/specs/origins.ts` đã có `WEB_ORIGIN`; `apps/e2e/specs/helpers.ts:51-61` `readVerificationEmails()`.

## 5. Kết luận nguyên nhân

"OK" = teacher flow thiếu `callbackURL` ⇒ sau verify không có nơi để về, đứng lại origin API. Cả 2 cơ chế ứng viên (better-auth trả JSON trần, hoặc lọt về root `/` trả "OK") đều hội tụ về cùng một fix: teacher sign-up truyền `callbackURL` về trang xác nhận trên origin web.

Status: DONE
Summary: Đủ bằng chứng lập plan — fix tại sign-up form web (thêm callbackURL) + route `/verify-email` mới trên web; ràng buộc matcher, mail-log regex, trustedOrigins đã xác minh.
Concerns/Blockers: Không chặn. Lưu ý: không đọc được node_modules tại chỗ (hook) nên hành vi dist xác minh qua unpkg đúng version 1.6.27.
