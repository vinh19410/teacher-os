---
phase: 1
title: "Mailer + HTML verification template + Better-Auth wiring"
status: completed
priority: P1
effort: 4h
dependencies: []
---

# Phase 1: Mailer + HTML verification template + Better-Auth wiring

## Goal

Học viên đăng ký portal xong, server gửi ngay email verify (HTML đẹp, tiếng Việt) qua Resend HTTP API; dev/test không gửi thật mà log URL verify ra console. Toàn bộ nằm trong `packages/auth`, inject qua `CreateAuthInput.mailer`.

Context: đọc `research/researcher-report-email-verification.md` (option Better-Auth 1.6.27 đã xác minh từ source cài đặt) và `reports/scout-report.md` (file:line trong repo).

Lưu ý import cho consumer ngoài package: `packages/auth` có exports map `"./*" → "./src/*.ts"` nên import bằng subpath `@teacher-os/auth/mail/mailer` (map tới `src/mail/mailer.ts`). Trong nội bộ `packages/auth` dùng import tương đối.

## Files to Create / Modify

- Create: `packages/auth/src/mail/mailer.ts`
- Create: `packages/auth/src/mail/verification-email-template.ts`
- Create: `packages/auth/src/mail/mail.test.ts`
- Create: `packages/auth/src/auth-verification-email.test.ts` (wiring test)
- Create: `packages/auth/scripts/preview-email.ts`
- Modify: `packages/auth/src/index.ts` (CreateAuthInput + emailVerification config)
- Modify: `packages/auth/package.json` (devDep tsx + script preview:email)
- Modify: `packages/infra/alchemy.run.ts` (bindings RESEND_API_KEY / MAIL_FROM / MAILER_IMPL — có default)
- Modify: `packages/infra/.env.example` (3 biến mới + sửa comment stale dòng 20 nếu còn ghi dev CORS chỉ có 8001)
- Modify: `apps/server/src/index.ts` (guard config + construct Mailer theo env)
- Modify: `apps/server/src/cookie-prefix.test.ts` (call site createAuth)
- Modify: `apps/server/src/auth-roundtrip.test.ts` (call site createAuth)
- Modify: `apps/e2e/src/boot.ts` (call site createAuth — LogMailer tạm, Phase 4 thay RecordingMailer)

## Tasks & Steps

Thứ tự task là bắt buộc: Task 1.4 (bindings) phải xong trước Task 1.5 (wiring) vì `env.MAILER_IMPL`/`env.MAIL_FROM`/`env.RESEND_API_KEY` chỉ có type sau khi khai báo trong `alchemy.run.ts` (type `ServerEnv` sinh từ `InferEnv` — `packages/env/env.d.ts`).

### Task 1.1 — `Mailer` interface + `LogMailer` + `ResendMailer`
- Goal: có abstraction gửi mail swappable; Resend gọi bằng `fetch` thuần (không thêm SDK), có timeout để latency Resend không trói response sign-up.
- Target files: `packages/auth/src/mail/mailer.ts` (file mới).
- Steps:
  1. Export interface:
     ```ts
     export interface MailInput { to: string; subject: string; html: string; text: string }
     export interface Mailer { send(input: MailInput): Promise<void> }
     ```
  2. `createLogMailer(): Mailer` — `console.info("[mail:log] to=%s subject=%s\n%s", input.to, input.subject, input.text)`; với email verify, `text` chứa URL verify nên URL sẽ hiện ra console dev. (LogMailer chỉ dùng dev/test/e2e — prod bắt buộc resend, gate ở Task 1.4.)
  3. `createResendMailer({ apiKey, from }: { apiKey: string; from: string }): Mailer` — hàm `send` private thực hiện:
     ```ts
     const res = await fetch("https://api.resend.com/emails", {
       method: "POST",
       signal: AbortSignal.timeout(10_000),
       headers: { Authorization: \`Bearer ${apiKey}\`, "Content-Type": "application/json" },
       body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
     });
     ```
     Nếu `!res.ok` → `throw new Error(\`resend send failed: ${res.status} ${await res.text()}\`)`. Retry đúng 1 lần khi `res.status === 429 || res.status >= 500`: sleep theo header `Retry-After` (giây) nếu có, không có thì 500ms, rồi gọi lại `send` nội bộ.
- Success criteria: file compile; không import gì từ `cloudflare:workers` (chạy được trong vitest plain node); `apiKey`/`from` nhận qua tham số; cả 2 lần fetch đều có `signal`.
- Verify: `pnpm check-types` → exit 0.

### Task 1.2 — Template HTML `verificationEmailTemplate`
- Goal: email verify HTML đẹp, tiếng Việt, đạt best-practice client email (table layout 600px, inline CSS, dark mode, preheader, bulletproof button, plain-text part, < 15KB).
- Target files: `packages/auth/src/mail/verification-email-template.ts` (file mới).
- Steps:
  1. Export `verificationEmailTemplate(input: { url: string }): { html: string; text: string }`.
  2. `html` dùng skeleton sau (table-based, mọi style cốt lõi inline; `<style>` chỉ chứa dark-mode override; thay `{{URL}}` bằng `input.url`, escape `&` → `&amp;` trong attribute):
     - `<html lang="vi">`, `<meta charset="utf-8">`, viewport, `<meta name="color-scheme" content="light dark">` + `supported-color-schemes`.
     - Preheader ẩn sau `<body>`: "Nhấn nút bên dưới để kích hoạt tài khoản TeacherOS. Liên kết có hiệu lực trong 1 giờ." + chuỗi zero-width chống truncate.
     - Bảng nền `#f1f5f9` full-width (class `bg-body`) → thẻ 600px `max-width:100%` nền trắng `border-radius:12px` (class `bg-card`), system font stack `-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`, mọi table có `role="presentation"`.
     - Header: wordmark chữ "TeacherOS" đậm 20px màu `#4f46e5`.
     - H1 "Xác thực email của bạn" (24px/32px, màu `#0f172a`, class `text-main`); đoạn chào: "Cảm ơn bạn đã đăng ký tài khoản TeacherOS. Vui lòng nhấn nút bên dưới để xác nhận địa chỉ email và kích hoạt tài khoản của bạn."
     - Ghi chú muted (class `text-muted`): "Liên kết có hiệu lực trong 1 giờ. Nếu bạn không đăng ký tài khoản này, bạn có thể bỏ qua email này."
     - **Bulletproof button**: table `role="presentation"` → `td bgcolor="#4f46e5" style="border-radius:8px;"` → `<a href="{{URL}}" style="display:inline-block; padding:14px 32px; font-size:16px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px; background-color:#4f46e5;">Xác thực email</a>`.
     - Fallback: "Nếu nút trên không hoạt động, hãy sao chép và dán liên kết sau vào trình duyệt:" + URL dạng text `word-break:break-all`.
     - Footer sau `border-top:1px solid #e2e8f0`: "Bạn nhận được email này vì có người dùng địa chỉ email của bạn đăng ký TeacherOS." + "© 2026 TeacherOS. Mọi quyền được bảo lưu."
     - Dark mode override trong `<style>`: `@media (prefers-color-scheme: dark)` đổi `.bg-body` → `#0f172a`, `.bg-card` → `#1e293b`, `.text-main` → `#f1f5f9`, `.text-muted` → `#94a3b8` (đều `!important`), kèm selector `[data-ogsc] .bg-card`/`[data-ogsc] .text-main` cho Outlook app. Các class này phải gắn lên đúng element.
  3. `text` viết tay: "Xin chào,\n\nCảm ơn bạn đã đăng ký tài khoản TeacherOS. Xác thực email tại liên kết sau (hiệu lực 1 giờ):\n\n{url}\n\nNếu bạn không đăng ký tài khoản này, hãy bỏ qua email này." — URL phải nằm trên **dòng riêng**, không có ký tự theo sau trên cùng dòng (Task 4.1 của Phase 4 extract URL từ text bằng regex `[^\s]+`).
- Success criteria: hàm thuần, không I/O; chuỗi HTML chứa `lang="vi"`, `role="presentation"`, URL xuất hiện ở cả button và fallback.
- Verify: do Task 1.3 bao trùm → `no verification needed` ở task này.

### Task 1.3 — Unit test mailer + template
- Goal: template và 2 mailer có gate cơ học, không cần gửi mail thật.
- Target files: `packages/auth/src/mail/mail.test.ts` (file mới; vitest; import tương đối `./mailer`, `./verification-email-template`).
- Steps:
  1. Template tests: chứa `lang="vi"`; chứa `input.url` (đã escape) ở attribute href và ở fallback; chứa "Xác thực email"; chứa `color-scheme`; **độ dài html < 15_000 ký tự**; text part chứa url và "hiệu lực 1 giờ"; url trong text nằm trên dòng riêng (regex `/^https?:\/\/\S+$/m` match).
  2. `createResendMailer` tests — mock `globalThis.fetch` bằng `vi.stubGlobal`: (a) response ok → gọi đúng `https://api.resend.com/emails`, header `Authorization: Bearer test-key`, body có `from`, `to: ["a@b.c"]`, `subject`, `html`, `text`, và `signal` có mặt; (b) response 500 rồi 200 → retry đúng 1 lần rồi thành công; (c) response 400 → throw Error chứa "resend send failed"; (d) fetch reject bởi AbortSignal (mock rejects với TimeoutError) → throw, không retry.
  3. `createLogMailer` test: spy `console.info`, assert được gọi và text chứa url.
- Success criteria: toàn bộ test mới pass, không đụng network thật.
- Verify: `pnpm --filter @teacher-os/auth test` → exit 0, output có dòng `Test Files` với ≥ 2 file passed (gồm wiring test ở Task 1.5).

### Task 1.4 — Bindings có default + env example + guard boot
- Goal: 3 biến môi trường mới có default an toàn để fresh clone và CI deploy không vỡ; cấu hình mailer sai thì fail loud ngay lúc boot.
- Target files: `packages/infra/alchemy.run.ts` (khối `server.env` dòng 68-92); `packages/infra/.env.example`; `apps/server/src/index.ts` (phần guard).
- Steps:
  1. `alchemy.run.ts` — trong `server.env` thêm, theo pattern `Config.withDefault` mà file đã dùng cho CORS (dòng 54-62):
     ```ts
     MAILER_IMPL: Config.string("MAILER_IMPL").pipe(Config.withDefault("log")),
     MAIL_FROM: Config.string("MAIL_FROM").pipe(Config.withDefault("TeacherOS <onboarding@resend.dev>")),
     RESEND_API_KEY: Config.redacted("RESEND_API_KEY").pipe(Config.withDefault(<giá trị rỗng của Redacted>)),
     ```
     Nếu `Config.redacted(...).pipe(Config.withDefault(...))` gây lỗi type (kiểm bằng `pnpm check-types`), đổi sang `Config.string("RESEND_API_KEY").pipe(Config.withDefault(""))` và thêm comment "// plain string vì redacted không combine được với withDefault".
  2. `packages/infra/.env.example` — thêm 3 dòng kèm comment tiếng Việt: `MAILER_IMPL=log` (dev mặc định; prod đặt `resend`), `MAIL_FROM="TeacherOS <onboarding@resend.dev>"` (dev; prod đổi thành địa chỉ trên domain đã verify với Resend), `RESEND_API_KEY=` (chỉ cần khi `MAILER_IMPL=resend`). Đồng thời sửa comment stale ở dòng 20 nếu nó ghi dev CORS default chỉ có 8001 (dev default thật đã gồm cả 8003 — `alchemy.run.ts:56-61`).
  3. `apps/server/src/index.ts` — trước khi construct mailer (dùng trong Task 1.5), thêm guard fail-loud:
     ```ts
     if (env.MAILER_IMPL === "resend" && !env.RESEND_API_KEY) {
       throw new Error("RESEND_API_KEY is required when MAILER_IMPL=resend");
     }
     if (env.MAILER_IMPL !== "resend") {
       console.error("[mail] MAILER is in LOG-ONLY mode — verification emails are NOT being sent. Set MAILER_IMPL=resend + RESEND_API_KEY to enable.");
     }
     ```
     Guard này chạy mọi môi trường: quên cấu hình ở prod sẽ thấy banner đỏ trong log Workers ngay khi boot thay vì mất email âm thầm.
  4. Đặt giá trị tương ứng vào `packages/infra/.env` local (file ngoài git): `MAILER_IMPL=log`, `MAIL_FROM="TeacherOS <onboarding@resend.dev>"`. Không bắt buộc đặt RESEND_API_KEY ở dev.
- Success criteria: fresh clone không set biến nào mới vẫn `pnpm dev` được (default log); `MAILER_IMPL=resend` thiếu key thì boot fail với message rõ.
- Verify: `pnpm check-types` → exit 0; `grep -c "MAILER_IMPL" packages/infra/alchemy.run.ts packages/infra/.env.example` → cả 2 ≥ 1; `grep -n "withDefault" packages/infra/alchemy.run.ts` → có hit trong khối server.env.

### Task 1.5 — Wire vào `createAuth` + cập nhật 4 call sites + wiring test
- Goal: Better-Auth gửi email verify khi sign-up (soft mode — KHÔNG bật `requireEmailVerification`, sign-up vẫn tạo session, sign-in không bị chặn); lỗi gửi mail trên đường sign-up fail-open (D3), trên đường "Gửi lại" thì propagate để UI báo lỗi thật.
- Target files: `packages/auth/src/index.ts`; `apps/server/src/index.ts`; `apps/server/src/cookie-prefix.test.ts`; `apps/server/src/auth-roundtrip.test.ts`; `apps/e2e/src/boot.ts`; `packages/auth/src/auth-verification-email.test.ts` (mới).
- Steps:
  1. `packages/auth/src/index.ts` — `CreateAuthInput` (dòng 24-41) thêm `mailer: Mailer` (**bắt buộc**, không optional — ép mọi call site quyết định rõ ràng). Import `type Mailer` từ `./mail/mailer`, `verificationEmailTemplate` từ `./mail/verification-email-template`.
  2. Cùng file, trong config `betterAuth({...})` thêm (giữ nguyên mọi key hiện có):
     ```ts
     emailVerification: {
       sendVerificationEmail: async ({ user, url }, request) => {
         const { html, text } = verificationEmailTemplate({ url });
         // Đường "Gửi lại" (/send-verification-email): để lỗi ném ra ngoài —
         // Better-Auth sẽ trả lỗi về client để UI hiển thị (email-verification.mjs:109-117).
         // Đường sign-up: nuốt lỗi (D3 fail-open) — đăng ký không được chết vì mailer.
         const isResendPath =
           Boolean(request) && new URL(request!.url).pathname.endsWith("/send-verification-email");
         try {
           await input.mailer.send({
             to: user.email,
             subject: "Xác thực email TeacherOS của bạn",
             html, text,
           });
         } catch (error) {
           if (isResendPath) throw error;
           console.error("Failed to send verification email", { email: user.email, error });
         }
       },
       sendOnSignUp: true,               // bắt buộc set tường minh khi không có requireEmailVerification (BA sign-up.mjs:242)
       autoSignInAfterVerification: true,
       expiresIn: 60 * 60,
     },
     ```
     KHÔNG thêm `emailAndPassword.requireEmailVerification` (soft mode — plan.md D1). KHÔNG thêm cấu hình rateLimit riêng: Better-Auth 1.6.27 đã có special rule 3 req/60s theo IP cho `/send-verification-email` (BA `rate-limiter/index.mjs:386-395`).
  3. `apps/server/src/index.ts` — sau guard của Task 1.4, construct:
     ```ts
     const mailer =
       env.MAILER_IMPL === "resend"
         ? createResendMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM })
         : createLogMailer();
     ```
     rồi truyền `mailer` vào `createAuth({...})` (dòng 29). Import `createLogMailer, createResendMailer` từ `@teacher-os/auth/mail/mailer`. Giữ style memoized hiện có của file.
  4. `apps/server/src/cookie-prefix.test.ts:41` và `apps/server/src/auth-roundtrip.test.ts:35` — truyền `mailer: createLogMailer()` (import subpath như bước 3). Sau bước này các test sign-up hiện có sẽ in dòng `[mail:log]` ra console — đó là noise kỳ vọng, KHÔNG phải failure.
  5. `apps/e2e/src/boot.ts:44` — truyền `mailer: createLogMailer()` tạm (Phase 4 thay bằng RecordingMailer).
  6. Tạo `packages/auth/src/auth-verification-email.test.ts`: boot `createAuth` với spy Mailer (`vi.fn()` resolve) + db/auth setup theo đúng pattern của `cookie-prefix.test.ts:41-67`; gọi `auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", { method: "POST", ... body JSON email/password/name }))`; assert response OK và `mailer.send` được gọi **đúng 1 lần** với `to === email` vừa đăng ký và subject chứa "Xác thực". Thêm case thứ 2: spy reject + POST `/api/auth/send-verification-email` → handler trả error (không nuốt).
- Success criteria: sign-up email/password vẫn tạo session (soft mode) và gọi `mailer.send` đúng 1 lần; đường resend propagate lỗi; mọi test server hiện tại vẫn pass.
- Verify: `pnpm --filter @teacher-os/auth test` → exit 0; `pnpm --filter server test` → exit 0; `pnpm check-types` → exit 0.

### Task 1.6 — Preview script cho template
- Goal: xem trước email HTML trong browser không cần gửi mail.
- Target files: `packages/auth/scripts/preview-email.ts` (mới); `packages/auth/package.json`.
- Steps:
  1. Script: `mkdirSync(new URL("../.mail-preview", import.meta.url), { recursive: true })` trước khi ghi (tránh ENOENT lần chạy đầu); import `verificationEmailTemplate`, gọi với `url = "http://localhost:3000/api/auth/verify-email?token=demo&callbackURL=http%3A%2F%2Flocalhost:8003%2Flogin"`, ghi html ra `packages/auth/.mail-preview/verification.html`, log đường dẫn.
  2. `packages/auth/package.json`: thêm `"preview:email": "tsx scripts/preview-email.ts"`; thêm devDependency `"tsx"` với **cùng version đang khai báo ở `apps/e2e/package.json`** (hiện là 4.23.12 — đối chiếu lại file trước khi copy). Chạy `pnpm install` cập nhật lockfile.
  3. Thêm dòng `.mail-preview/` vào `.gitignore` (root) nếu chưa có pattern tương ứng.
- Success criteria: mở file preview trong browser thấy email render đúng cả light/dark.
- Verify: `pnpm --filter @teacher-os/auth preview:email` → exit 0 và in ra đường dẫn; `ls packages/auth/.mail-preview/verification.html` → file tồn tại.

## Verification (cả phase)

- `pnpm --filter @teacher-os/auth test` → exit 0.
- `pnpm --filter server test` → exit 0.
- `pnpm check-types` → exit 0.
- `pnpm check` → exit 0.
- Smoke dev (thủ công, không bắt buộc trong CI): chạy server + portal, đăng ký tài khoản mới → console server in `[mail:log]` chứa URL `/verify-email?token=…`.

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
