# Scout Report: Codebase evidence cho student-email-verification

Repo: /Users/vinhtran/Documents/project/personal/teacher-os, nhánh `develop`, working tree sạch (trừ plan dir này).

## 1. Server — deps injection (điểm cắm Mailer)

- `apps/server/src/app.ts:27-32` — `AppDeps { getDb(); corsOrigin: string | string[]; getSessionUser(headers); authHandler(req) }`; comment: mọi collaborator đụng Cloudflare bindings được inject để test chạy plain node. `buildApp(deps)` dòng 92; `/api/auth/*` → `deps.authHandler` (138); `/api/student` → `studentRoutes(deps)` (143).
- `apps/server/src/index.ts:16-46` — lazy memoized db/auth per isolate; `createAuth({ db, corsOrigin, secret: env.BETTER_AUTH_SECRET, baseURL: env.BETTER_AUTH_URL, cookieDomain?, cookiePrefix?, googleClientId, googleClientSecret })` (dòng 29). **Đây là chỗ construct Mailer theo env.**
- Không có typed Hono Bindings — env đọc qua `import { env } from "@teacher-os/env/server"` (re-export `cloudflare:workers`, `packages/env/src/server.ts:5`); type `ServerEnv` sinh từ alchemy: `packages/env/env.d.ts` (`InferEnv<typeof server>`).
- `apps/server/src/session.ts:6-7` — `SessionUser` đã có `email?`, `emailVerified?`.
- `apps/server/src/student-provisioning.ts` — `provisionStudentForUser(db, { name, email })`: match `lower(trim(email))`, org đích = earliest org (`ORDER BY created_at, id LIMIT 1`), **fail-open** (catch + console.error, dòng 57-63).
- `apps/server/src/routes/student.ts` — `StudentRouteDeps { getDb(); getSessionUser() }` (22-25); `requireStudent` (43-141): 401 → 403 `NOT_LINKED` nếu email rỗng (50-58) → 0 row: nếu `emailVerified === true` thì provision + query lại (68-86) → vẫn 0 row → 403 `NOT_LINKED` (88-96) → có row + unverified → 403 `EMAIL_UNVERIFIED` (99-107) → >1 row → 403 `AMBIGUOUS` (109-117). Endpoints: `GET /me` (143), `GET /overview` (160).

## 2. Infra / secrets

- `packages/infra/alchemy.run.ts` — dotenv load `./.env`, `../../apps/web/.env`, `../../apps/server/.env` (8-10). Worker `server` (68-92): `DB`, `CORS_ORIGIN: Config.string(...)`, `BETTER_AUTH_SECRET: Config.redacted("BETTER_AUTH_SECRET")` (77), `BETTER_AUTH_URL` (78), `COOKIE_DOMAIN`, `BETTER_AUTH_COOKIE_PREFIX`, `GOOGLE_CLIENT_ID: Config.string(...)`, `GOOGLE_CLIENT_SECRET: Config.redacted(...)` (85-86). **Pattern thêm secret mới: khai báo trong `server.env` → type tự có trong `ServerEnv`.**
- Không có `.dev.vars`/wrangler config. `.env.example`: `packages/infra/.env.example` (BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID/SECRET), `apps/student/.env.example` (`VITE_SERVER_URL=http://localhost:8000`).

## 3. Auth package

- `packages/auth/src/index.ts` (105 dòng): `betterAuth({ database: drizzleAdapter(input.db, { provider: "sqlite", schema }), trustedOrigins, socialProviders.google, emailAndPassword: { enabled: true }, secret, baseURL, hooks.before, advanced { defaultCookieAttributes sameSite none/secure/httpOnly, crossSubDomainCookies?, cookiePrefix? } })`. **Chưa có `emailVerification` nào.** `CreateAuthInput` dòng 24-41; `trustedOrigins` từ `corsOrigin` (53-55); `export type Auth = ReturnType<typeof createAuth>` (105).
- `packages/db/src/schema/auth.ts:8-10` — `user.emailVerified` (integer mode boolean, default false, notNull); bảng `verification` (72-88).
- **4 call sites của `createAuth`** (đều phải truyền mailer khi đổi `CreateAuthInput`): `apps/server/src/index.ts:29`, `apps/server/src/cookie-prefix.test.ts:41`, `apps/server/src/auth-roundtrip.test.ts:35`, `apps/e2e/src/boot.ts:44`.

## 4. Tests + scripts

- `apps/server/src/student.test.ts` — vitest; in-memory libsql + migration thật (`createClient({ url: "file::memory:" })` + `migrate(db, { migrationsFolder: MIGRATIONS_DIR })`, 29-31); fake session theo header `x-test-user` (176-258: "google-verified" | "unverified" | ...); `authHandler: () => new Response("auth OK")` (257); assert DB bằng `select({ count: count() }).from(schema.student)`; mock provisioning bằng `vi.spyOn(studentProvisioning, "provisionStudentForUser")` (352-354).
  - **Test hiện tại sẽ bị đổi kỳ vọng**: dòng 333-343 "unverified user with 0 rows … returns 403" expect `NOT_LINKED` → sau Phase 02 phải expect `EMAIL_UNVERIFIED`. Dòng 351-361 (provision fail → NOT_LINKED) giữ nguyên; 393-400 (có row + unverified → EMAIL_UNVERIFIED) giữ nguyên.
- Scripts: root `check` = `biome check --write .` (lint cấp repo), `test` = `turbo run test && …`, `check-types`. `apps/server`: `build: tsdown`, `check-types: tsc -b`, `test: vitest run`. `apps/student`: `dev: vite dev`, `check-types: vite build && tsc --noEmit`, `test: vitest run`. `packages/auth`: chỉ `test: vitest run`. `apps/e2e`: `e2e: playwright test`, `boot:api: tsx src/boot.ts`, `check-types: tsc --noEmit`. **Không workspace nào có script `lint` riêng.**

## 5. Student portal (apps/student)

- Routes: `src/routes/login.tsx` (validateSearch `returnUrl` 14-22; redirect nếu có session 38-42; BrandPanel + AuthTabs + SignInForm + SignUpForm; logo SVG inline 66-79, title "Teacher OS · Học viên" — index.html:6); `src/routes/_auth/route.tsx` (beforeLoad `authClient.getSession()` → redirect `/login`, 6-15); `src/routes/_auth/index.tsx` (overview; branch error theo `HttpError.code` 35-52: meQuery.error → StudentErrorView không shell).
- `src/components/auth/sign-up-form.tsx` — `authClient.signUp.email({ email, password, name })` (36-40) **không có callbackURL**; success `window.location.assign(validateReturnUrl(returnUrl))` (60); NoticeOk "Tài khoản đã tạo" (86-90). Form ids portal: `#signup-name/#signup-email/#signup-password` (96-156). Google button truyền `callbackURL` (google-oauth-button.tsx:44).
- `src/components/overview/student-error-view.tsx:26-29` — NOT_LINKED: "Tài khoản chưa được liên kết"; **:30-34 — EMAIL_UNVERIFIED đã có sẵn**: title "Email chưa được xác thực", icon `MailCheck`, copy khuyên dùng Google. **Đây là view mở rộng cho pending-verification.**
- `src/lib/repos/student.ts:16-44` — fetch `/api/student/me|overview`, `credentials: "include"`, lỗi → `HttpError(res.status, msg, { code })`; `src/lib/query-client.ts:5-19` — `HttpError`; 401 → signOut + redirect login (50-56).
- `src/lib/auth-client.ts:42-44` — `createAuthClient({ baseURL: new URL("/api/auth", getServerUrl(env.VITE_SERVER_URL)) })`.
- `src/lib/validate-return-url.ts` — chỉ nhận cùng-app path, chặn `//`, `scheme:`.
- Styling: Tailwind v4, tokens `--accent`, `text-fg`, `bg-surface`, `border-line`, `font-display`, `bg-accent-soft`… Copy tiếng Việt toàn bộ.

## 6. Contracts

- `packages/api/src/contracts.ts:911-917` — `STUDENT_ERROR_CODES = { NOT_LINKED, AMBIGUOUS, EMAIL_UNVERIFIED: "STUDENT_EMAIL_UNVERIFIED" }`. **Phase 02 tái dùng `EMAIL_UNVERIFIED`, không thêm code mới.**

## 7. E2E

- `apps/e2e/playwright.config.ts` — testDir ./specs, workers 1, 2 webServer: `pnpm run boot:api` (chờ /readyz, port `E2E_API_PORT ?? 8000`) + vite web (`E2E_WEB_PORT ?? 8001`). **Chưa có webServer cho apps/student — phải thêm.**
- `apps/e2e/src/boot.ts` — shim Node: libsql `apps/e2e/local.db` (wipe + migrate thật), `createAuth` thật (secret dummy, dòng 44), `buildApp` DI như prod. **Chỗ cắm RecordingMailer cho e2e.**
- `apps/e2e/specs/student-portal-provisioning.spec.ts` — signup teacher qua web UI (`signUpViaUi` helpers.ts:10-26, ids `#su-*`, chờ URL /dashboard) → assert DB count student = 0. **Spec này không gọi /api/student nên Phase 02 không phá nó.**
- Portal form ids khác web: `#signup-*` (sign-up-form.tsx:96-156).

## 8. Email references — ZERO

Grep resend|mailchannel|smtp|sendgrid|mailjet|postmark|ses|mailer|emailVerification|sendVerificationEmail toàn src/docs/json/md/toml: không có hit thực-----------
## 9. Docs conventions

- `docs/index.md` nav: PDR, Roadmap, Code Standards, System Architecture, Codebase Summary, Runbook.
- `docs/code-standards.md`: ownership (`contracts.ts` = wire types; `app.ts` = auth/bootstrap/composition; `alchemy.run.ts` = runtime bindings); "change the server and web together when a contract changes"; validation: `check`, `test`, `check-types` (root).
- `plans/260923-0758-students-from-portal-registration/plan.md` (completed) — D1: provision ở bridge `requireStudent`, không ở auth hook; D2: org earliest; D7: fail-open. Non-goal cũ (plan.md:41) đã dành chỗ cho email verification. **Plan này kế thừa D1/D2/D7.**
