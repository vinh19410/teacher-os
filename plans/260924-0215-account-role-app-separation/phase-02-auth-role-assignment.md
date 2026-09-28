---
title: "Phase 2: better-auth gán role theo app nguồn + chặn đăng nhập chéo"
status: completed
priority: P1
effort: "5h"
dependencies: [1]
---

# Phase 2: better-auth gán role theo app nguồn + chặn đăng nhập chéo

## Goal

Tại lớp auth: (1) mọi account mới được gán `user.role` theo app gửi request sign-up (portal → `student`, teacher app → `teacher`, không-sign → `student` least-privilege); (2) đăng nhập sai app bị chặn ngay lúc tạo session với lỗi tiếng Việt rõ ràng — áp cho cả email/password lẫn Google OAuth, **kể cả client bundle cũ**.

## Context Links

- [reports/researcher-better-auth-hooks.md](./reports/researcher-better-auth-hooks.md) — **đọc trước khi làm**: mọi cơ chế dưới đây đã verify trên source better-auth 1.6.27 cài trong repo
- Phase 1 — cột `user.role` (better-auth `additionalFields` BẮT BUỘC có cột thật, adapter ném `BetterAuthError` nếu thiếu)
- `packages/auth/src/index.ts:43-101` — `createAuth` hiện tại (hooks.before chỉ validate `/update-user`)
- `packages/infra/alchemy.run.ts:42-62` — pattern derive env từ topology + guard fail-loud của `CORS_ORIGIN`
- `apps/server/src/auth-roundtrip.test.ts` — pattern test better-auth thật trên libsql

## Key Insights (đã verify trên source 1.6.27)

- `ctx.path` trong hook là path cụ thể: `"/sign-up/email"`, `"/sign-in/email"`, `"/sign-in/social"`, `"/callback/google"`.
- **Gán role**: `databaseHooks.user.create.before` — trả `{ data: { role } }` để persist; chạy cho **cả** email sign-up lẫn OAuth sign-up (đều qua `createWithHooks`); throw được để abort. Mutate `ctx.body` trong `hooks.before` KHÔNG dùng được cho role (body đã bị lọc qua `parseUserInput`, `input:false` → 400).
- **Chặn sign-in**: `databaseHooks.session.create.before` — throw `APIError` chặn được cả email lẫn OAuth (đều qua `internalAdapter.createSession`); email path nhận JSON error ngay tại form (message survive nguyên văn tới `authErrorMessage`); OAuth callback path → **302 redirect** tới `errorCallbackURL` kèm `?error=<code>&error_description=<message>` (SPA phải đọc query params — không có JSON). Bundle cũ không set `errorCallbackURL` → redirect về fallback `${baseURL}/error` (endpoint chết trên API origin) — với stamping server-side (D5) tình trạng này không xảy ra trong luồng đúng.
- **App nguồn**: POST từ browser LUÔN có `Origin` (cross-origin) — kể cả bundle cũ; tại `/callback/google` (GET navigation) **không có Origin** → đọc app từ OAuth state (`additionalData` lưu bảng `verification`, strategy "database") bằng `getOAuthState()` export từ `better-auth/api`.
- **Stamping server-side** (Red-team Critical #2): `hooks.before` trên `ctx.path === "/sign-in/social"` mutate `ctx.body.additionalData.app` theo Origin của POST initiation — cùng object ref với handler nên giá trị chảy vào `generateState`. Client bundle cũ (không gửi gì) vẫn được classify đúng vì stamping nằm ở server. Fallback nếu mutation không chảy (verify bằng test bước 6): đặt signed cookie marker trong cùng hook (`ctx.setSignedCookie`) và đọc lại ở callback.
- CSRF gate của better-auth: POST có Origin ngoài `trustedOrigins` → 403 `INVALID_ORIGIN` **trước khi hook chạy**; POST không Origin + không cookie (curl) → đi qua → classifier phải fail-closed về `student`.
- `user.additionalFields: { role: { type: "string", required: false, input: false } }` → role hiện trên `session.user` (→ `getSession()`), client gửi `role` trong sign-up/update → 400, OAuth profile cũng không ghi đè.
- Truy vấn role user hiện hữu trong session hook: closure `input.db` (chính là instance drizzle adapter đang dùng) + `drizzle-orm` — thêm dep vào `packages/auth` (chỉ drizzle-orm, khác case #257 vì không cần @libsql/client).

## Requirements

- `CreateAuthInput` thêm `studentOrigins: string[]`; teacherOrigins suy ra = `corsOrigin` (trustedOrigins) trừ `studentOrigins`.
- Classifier thuần trong `packages/auth/src/role.ts` — **chỉ tin Origin khớp CHÍNH XÁC một origin đã biết**; origin lạ/chuỗi `"null"`/thiếu → rơi về OAuth state → `'student'` (Red-team High #3, Medium #8):
  ```ts
  export type AppRole = "teacher" | "student";
  export const OAUTH_APP_STATE_KEY = "app";

  export function resolveUserRole(role: string | null | undefined): AppRole {
    return role === "student" ? "student" : "teacher";
  }

  function matchOrigin(origin: string, known: string[]): boolean {
    const normalized = origin.trim().toLowerCase();
    return normalized.length > 0 && normalized !== "null"
      && known.some((o) => o.trim().toLowerCase() === normalized);
  }

  /** Chỉ origin đã biết mới đáng tin; unknown/"null" → oauthApp → student. */
  export function resolveRequestApp(input: {
    origin: string | null | undefined;
    oauthApp?: string | null;
    studentOrigins: string[];
    teacherOrigins: string[];
  }): AppRole {
    if (input.origin && matchOrigin(input.origin, input.studentOrigins)) {
      return "student";
    }
    if (input.origin && matchOrigin(input.origin, input.teacherOrigins)) {
      return "teacher";
    }
    if (input.oauthApp === "teacher" || input.oauthApp === "student") {
      return input.oauthApp;
    }
    return "student";
  }
  ```
  Ghi chú posture (accepted): curl giả header `Origin: app.<domain>` (nằm trong trustedOrigins) vẫn classify `teacher` — tương đương open sign-up hiện hành; ranh giới bảo mật thật là role column + API gate (Phase 3), không phải classification.
- Message lỗi đăng nhập chéo (tiếng Việt, client hiển thị nguyên văn):
  - student vào teacher app: `"Tài khoản học viên không thể đăng nhập vào trang giáo viên. Vui lòng dùng cổng học viên."`
  - teacher vào portal: `"Tài khoản giáo viên không thể đăng nhập vào cổng học viên."`
  - kèm `code: "ROLE_MISMATCH"` (chính là tham số `?error=` trên errorCallbackURL).
- Client Google (2 app): **chỉ thêm** `errorCallbackURL: ${window.location.origin}/login` — không gửi `additionalData` từ client (server tự stamp, an toàn với bundle cũ).
- Route `/login` (2 app): `validateSearch` nhận thêm `error`/`error_description`; có param → `toast.error(...)` rồi navigate replace để strip param.
- Env plumbing (`STUDENT_ORIGINS`) mirror đúng 3 nhánh + guard fail-loud của `CORS_ORIGIN` (Red-team High #5): (1) topology → `Config.withDefault(topology.studentOrigin)` **+ throw nếu explicit env thiếu `topology.studentOrigin`**; (2) dev → `Config.withDefault("http://localhost:8003")`; (3) còn lại → `Config.string("STUDENT_ORIGINS")` không default (fail tại deploy). KHÔNG ghi giá trị dev vào `apps/server/.env` (file này được alchemy nạp cả khi deploy — override âm thầm).

## Files to Create / Modify

- Create: `packages/auth/src/role.ts`, `packages/auth/src/role.test.ts`
- Modify: `packages/auth/src/index.ts` — `studentOrigins` input, `user.additionalFields`, `databaseHooks` (user.create.before + session.create.before), `hooks.before` stamping `/sign-in/social`
- Modify: `packages/auth/package.json` — thêm `"drizzle-orm": "catalog:"`
- Modify: `apps/server/src/index.ts` — truyền `studentOrigins: parseCORSOrigins(env.STUDENT_ORIGINS)`
- Modify: `packages/infra/alchemy.run.ts` — 3 nhánh `studentOriginsConfig` + guard throw mirror `CORS_ORIGIN` (dòng 42-54); thêm `STUDENT_ORIGINS` vào env block của Worker `server` — typing tự suy ra qua `ServerEnv`, **không** sửa `packages/env/env.d.ts` (file này không chứa key env nào)
- Modify: `apps/e2e/src/boot.ts` — `corsOrigin: [CORS_ORIGIN, "http://localhost:8003"]`, `studentOrigins: ["http://localhost:8003"]`
- Modify: `apps/web/src/components/google-oauth-button.tsx`, `apps/student/src/components/auth/google-oauth-button.tsx` — thêm `errorCallbackURL`
- Modify: `apps/web/src/routes/login.tsx`, `apps/student/src/routes/login.tsx` — toast lỗi OAuth error params + strip
- Modify: `apps/server/src/auth-roundtrip.test.ts`, `apps/server/src/cookie-prefix.test.ts` — call site `createAuth` thêm `studentOrigins` (bắt buộc, không optional — check-types sẽ đỏ nếu sót)
- Create: `apps/server/src/auth-role-roundtrip.test.ts`

## Implementation Steps

1. Tạo `packages/auth/src/role.ts` đúng Requirements + unit test `role.test.ts` (pure): student-match, teacher-match, unknown, `"null"`, thiếu origin + oauthApp, thiếu tất cả.
2. Sửa `createAuth` (`packages/auth/src/index.ts`):
   - `CreateAuthInput` thêm `studentOrigins: string[]`; `teacherOrigins = trustedOrigins.filter(o => !studentOrigins.includes(o))` (tính trong hàm).
   - Config thêm:
     ```ts
     user: {
       additionalFields: {
         role: { type: "string", required: false, input: false },
       },
     },
     hooks: {
       before: createAuthMiddleware(async (ctx) => {
         if (ctx.path === "/sign-in/social") {
           const appRole = resolveRequestApp({
             origin: ctx.headers?.get("origin") ?? null,
             studentOrigins: input.studentOrigins,
             teacherOrigins,
           });
           const body = (ctx.body ?? {}) as Record<string, unknown>;
           const extra = (body.additionalData ?? {}) as Record<string, unknown>;
           ctx.body = { ...body, additionalData: { ...extra, [OAUTH_APP_STATE_KEY]: appRole } };
           return;
         }
         if (ctx.path !== "/update-user") return;
         // ...giữ nguyên validate name/image hiện có
       }),
     },
     databaseHooks: {
       user: {
         create: {
           before: async (user, ctx) => {
             const oauthApp = await readOAuthApp();
             const appRole = resolveRequestApp({
               origin: ctx?.request?.headers?.get("origin") ?? null,
               oauthApp,
               studentOrigins: input.studentOrigins,
               teacherOrigins,
             });
             return { data: { ...user, role: appRole } };
           },
         },
       },
       session: {
         create: {
           before: async (session, ctx) => {
             const oauthApp = await readOAuthApp();
             const requiredApp = resolveRequestApp({
               origin: ctx?.request?.headers?.get("origin") ?? null,
               oauthApp,
               studentOrigins: input.studentOrigins,
               teacherOrigins,
             });
             const userRole = await getUserRole(session.userId);
             if (userRole !== requiredApp) {
               throw new APIError("FORBIDDEN", {
                 message: userRole === "student"
                   ? "Tài khoản học viên không thể đăng nhập vào trang giáo viên. Vui lòng dùng cổng học viên."
                   : "Tài khoản giáo viên không thể đăng nhập vào cổng học viên.",
                 code: "ROLE_MISMATCH",
               });
             }
           },
         },
       },
     },
     ```
   - `readOAuthApp()`: `const state = await getOAuthState().catch(() => null); return (state as Record<string, unknown> | null)?.[OAUTH_APP_STATE_KEY] as string | null ?? null;` — import `getOAuthState` từ `better-auth/api`.
   - `getUserRole(userId)`: closure qua `input.db` (cast như `CreateAuthInput["db"]`) — `select role from user where id = ?` + `resolveUserRole`.
3. Wire env: `apps/server/src/index.ts` truyền `studentOrigins`; `alchemy.run.ts` 3 nhánh + guard + env block.
4. Client Google 2 app: thêm `errorCallbackURL: \`${window.location.origin}/login\`` vào `signIn.social` (không thêm additionalData — server tự stamp).
5. Route `/login` 2 app: `validateSearch` thêm `error?: string` + `error_description?: string`; `useEffect` thấy param → `toast.error(error_description || "Đăng nhập Google thất bại. Vui lòng thử lại.")` → `navigate({ search: { returnUrl }, replace: true })` strip param.
6. Viết `apps/server/src/auth-role-roundtrip.test.ts` (libsql in-memory + migrations thật + better-auth thật qua `buildApp`). **Lưu ý bắt buộc** (Red-team High #7): `corsOrigin` phải chứa CẢ 2 origin `["http://localhost:8001", "http://localhost:8003"]` — nếu chỉ có 8001, request mang Origin 8003 chết ở 403 `INVALID_ORIGIN` của better-auth TRƯỚC khi tới hook; `studentOrigins: ["http://localhost:8003"]`:
   - Sign-up email Origin `http://localhost:8003` → DB `user.role === 'student'`; sign-in lại cùng Origin → 200.
   - Sign-in student account với Origin `http://localhost:8001` → error `code === "ROLE_MISMATCH"`, message tiếng Việt, status 403; bảng `session` không có row cho user.
   - Sign-up email Origin `http://localhost:8001` → `role === 'teacher'`.
   - Sign-up email KHÔNG Origin → `role === 'student'`.
   - Sign-up với header `Origin: null` (chuỗi literal) → `role === 'student'`.
   - Sign-up kèm body `role: "teacher"` từ portal origin → 400 (`role is not allowed to be set`), role trong DB vẫn `student`.
   - `/update-user` với `role` → 400.
   - **Stamping**: POST `/sign-in/social` (provider google) với Origin portal → row `verification` (state) chứa `app: "student"`; với Origin web → `app: "teacher"` (chứng minh server-side stamp, không cần client gửi).
   - Seed teacher user (role teacher + credential) → sign-in Origin portal → 403 `ROLE_MISMATCH`.
   - `/get-session` trả `user.role`.
   - Regression: `auth-roundtrip.test.ts` cũ (đã thêm `studentOrigins: []`) vẫn xanh — teacher signup → bootstrap không đổi.
7. `pnpm check`, `pnpm check-types`, `pnpm test` toàn workspace.

## Todo

- [x] `role.ts` + `role.test.ts` (pure)
- [x] `createAuth`: additionalFields + 2 databaseHooks + stamping hook + studentOrigins
- [x] Dep `drizzle-orm` vào packages/auth
- [x] alchemy: 3 nhánh + guard + env block STUDENT_ORIGINS
- [x] Google buttons 2 app: errorCallbackURL
- [x] `/login` 2 app: toast error params + strip
- [x] `auth-roundtrip.test.ts` + `cookie-prefix.test.ts` thêm `studentOrigins`
- [x] `auth-role-roundtrip.test.ts` 10 case
- [x] Full check xanh

## Implementation Deviations (cook 2026-09-24)

- **Stamping mutate `ctx.body` KHÔNG chảy vào state** (test bước 6 bắt đúng như
  risk plan dự báo — middleware context giữ bản copy, không phải object ref của
  handler). Fix: hook `/sign-in/social` return `{ context: { body: ... } }` theo
  docs chính thức better-auth ("Modify Request Context") → stamping chảy vào state,
  verify bằng roundtrip test đọc row `verification`. **Fallback signed cookie
  không cần dùng.**

## Success Criteria

- Role gán đúng ở MỌI đường tạo account (email 2 app, Google 2 app kể cả bundle cũ nhờ stamping server-side, curl không Origin/Origin lạ → student).
- Đăng nhập chéo bị chặn ở cả 2 chiều, cả email lẫn Google (Google: redirect về `/login` kèm `?error=ROLE_MISMATCH&error_description=<message VN>` và toast hiển thị).
- Client không thể tự set/đổi role (400); `getSession()` mang `role` (Phase 3 phụ thuộc).
- Stamping state verify bằng test đọc row `verification` — không phụ thuộc client version.

## Risk Assessment

- **Mutate `ctx.body.additionalData` không chảy vào state** (khả năng thấp — researcher Q1 xác nhận cùng object ref): test bước 6 stamping bắt ngay; fallback chỉ định sẵn — signed cookie marker (`ctx.setSignedCookie("tos_oauth_app", appRole, secret, { maxAge: 600 })`) đặt trong cùng hook, đọc bằng `ctx.request.headers` ở callback; không đổi kiến trúc.
- **Google callback không test được E2E** (dummy creds như #257): chiều OAuth cover bằng unit/roundtrip (state row stamp — đọc row `verification`); redirect 302 của callback KHÔNG assert được offline (dummy Google creds chết ở token exchange TRƯỚC createSession) — hành vi chặn đã được assert thật qua email path đi cùng `databaseHooks.session.create.before` (cook 2026-09-24).
- **`getOAuthState()` ít docs** (researcher ghi nhận): đã verify tồn tại trong export của bản 1.6.27; nếu runtime lệch, fallback đọc row `verification` theo state query param.
- **Auto-signin sau signup chạy qua session hook**: role vừa gán khớp app nên vô hại (roundtrip case 1/3 chứng minh).

## Security Considerations

- Least-privilege: thiếu thông tin app nguồn → `student` (privilege thấp); không bao giờ default `teacher` với tín hiệu không tin cậy được.
- `input: false` chặn client tự gán role qua sign-up/update/OAuth profile (đã verify cả 3 đường).
- Client KHÔNG còn kê khai báo app nào — stamping nằm ở server theo Origin của initiation POST (browser luôn gửi, kể cả bundle cũ); `additionalData` từ client nếu có cũng bị ghi đè.
- Curl giả Origin teacher vẫn classify teacher ≡ open sign-up posture hiện hành (đã chấp nhận #255/#257); ranh giới thật là role column + API gate.
- Không ghi PII vào log trong hook; message lỗi không lộ chi tiết role/user.
