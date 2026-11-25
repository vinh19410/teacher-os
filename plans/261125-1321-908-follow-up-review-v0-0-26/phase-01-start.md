---
phase: 1
title: "Phase 1: H1 — Block Privileged Email Sign-Up in Auth & Unit/Server Tests"
status: completed
priority: P1
effort: 1.5h
dependencies: []
---

# Phase 1: H1 — Block Privileged Email Sign-Up in Auth & Unit/Server Tests

## Goal

Chặn fail-closed mọi thao tác tạo tài khoản không phải unified Google OAuth cho email thuộc `ADMIN_EMAILS` hoặc `TEACHER_EMAILS` khi `unifiedOrigins.length > 0` (trả `403 ROLE_SIGNUP_FORBIDDEN`, 0 user tạo mới, 0 email xác thực gửi đi), chặn thêm role-poisoning `adminEmails` ở nhánh fall-through `appRole === "student"`, giữ nguyên Google OAuth callback unified và cập nhật đầy đủ unit/integration tests ở `@teacher-os/auth` và `apps/server`.

## Files to Create / Modify

- Modify: `packages/auth/src/index.ts` (`CreateAuthInput` comment, `hooks.before`, `databaseHooks.user.create.before`, helper `isEmailInList` / `isPrivilegedAllowlistEmail` + `ROLE_SIGNUP_FORBIDDEN`)
- Modify: `packages/auth/src/auth-unified-origin.test.ts`
- Modify: `packages/auth/src/auth-admin-signup.test.ts` (thêm test cô lập bảo vệ role-poisoning `adminEmails` trên `STUDENT_ORIGIN` và request thiếu `Origin`)
- Modify: `apps/server/src/auth-role-roundtrip.test.ts` (block 2 unified origin tests)

## Tests Before (TDD Red Phase)

### Task 1.1 — Viết failing tests cho H1 trong `packages/auth/src/auth-unified-origin.test.ts` và `packages/auth/src/auth-admin-signup.test.ts`
<!-- Updated: Red Team Session 1 - use isolated freshCtx in auth-admin-signup.test.ts, add non-unified OAuth callback blocking test & live teacherEmails mutation test -->
- **Goal:** Tạo bài test tái hiện chính xác lỗ hổng H1 (account squatting + verification email + thiếu/`"null"` `Origin` role-poisoning + OAuth `oauthApp !== "unified"` role-poisoning + claimed vs unclaimed state oracle + mutation runtime `teacherEmails`) trước khi sửa mã nguồn.
- **Target files and symbols:**
  - `packages/auth/src/auth-unified-origin.test.ts` (`describe("unified origin authentication")`)
  - `packages/auth/src/auth-admin-signup.test.ts` (`describe("user.create.before — admin allowlist gate")`)
- **Steps:**
  1. Trong `packages/auth/src/auth-unified-origin.test.ts`, thêm helper `seedCredentialUser(ctx, { email, name, role, password, emailVerified })` dùng `hashPassword` từ `better-auth/crypto` (tạo row `schema.user` + `schema.account` với `providerId: "credential"`, `accountId: userId`) để phục vụ các test `sign-in`, `verify-email`, `reset-password` cho tài khoản `admin`/`teacher` đã tồn tại.
  2. Cập nhật test đầu tiên thành các assertion chặn `POST /api/auth/sign-up/email`:
     - Với `Origin: LMS_ORIGIN`: email `ADMIN@Example.COM`, `Both@Example.COM`, `TEACHER@Example.COM` trả `403`, `body.code === "ROLE_SIGNUP_FORBIDDEN"`, 0 row mới trong bảng `user`, 0 call vào `ctx.send` (không gửi verification email).
     - Với request **không có header `Origin`** và request **`Origin: "null"`**: `admin@example.com` và `teacher@example.com` vẫn trả `403 ROLE_SIGNUP_FORBIDDEN` (chặn curl role-poisoning thành `student`), 0 row user, 0 mail gửi.
     - Với email `admin@example.com` **đã có sẵn trong DB** (giả lập đã claim bằng Google OAuth): gọi `POST /api/auth/sign-up/email` vẫn trả `403 ROLE_SIGNUP_FORBIDDEN` (đóng claimed-vs-unclaimed oracle `422` vs `403` và admin-vs-teacher oracle).
     - Kiểm chứng mutation tại chỗ trên mảng `teacherEmails` (giống `apps/e2e/src/boot.ts:413`): thêm email mới bằng `.push(...)` vào mảng đã truyền cho `createAuth` → `POST /api/auth/sign-up/email` lập tức trả `403 ROLE_SIGNUP_FORBIDDEN`.
     - Email thường (`new-learner@example.com`) trên `Origin: LMS_ORIGIN` và không có `Origin` vẫn trả `200`, gán `role: "student"`, gửi mail verify và provision bảng `student` sau verify.
  3. Thêm test kiểm chứng Google OAuth callback path trên unified origin:
     - Initiate `/api/auth/sign-in/social` từ `Origin: LMS_ORIGIN` (stamp `app: "unified"`) + callback `/api/auth/callback/google` (mock `globalThis.fetch` cho token/userinfo Google) tạo được user `admin@example.com` mang `role: "admin"`, `teacher@example.com` mang `role: "teacher"`, và `oauth-student@example.com` mang `role: "student"`.
     - Initiate `/api/auth/sign-in/social` **không có `Origin`** (stamp `app: "student"`) + callback `/api/auth/callback/google` với email `admin@example.com` → bị chặn (redirect lỗi / không tạo user role `student`, 0 row `admin@example.com` trong DB).
  4. Cập nhật các test `sign-in`, `verify-email`, `reset-password` trong `auth-unified-origin.test.ts` dùng `seedCredentialUser` cho `admin`/`teacher` (riêng test `verify-email` cho `admin`/`teacher` gửi mail qua `POST /api/auth/send-verification-email` trên tài khoản unverified đã seed) và giữ nguyên `signUp` cho `learner@example.com`.
  5. Trong `packages/auth/src/auth-admin-signup.test.ts`, thêm test dùng một **`freshCtx = await setup(["admin-legacy@example.com"])` cô lập** (không dùng chung `ctx` của `beforeAll` vì `root@example.com` đã tồn tại từ test 2) xác nhận ở nhánh legacy (`unifiedOrigins` rỗng), `STUDENT_ORIGIN` và request thiếu `Origin` với `"ADMIN-LEGACY@Example.COM"` trả `403 ADMIN_SIGNUP_FORBIDDEN` và không tạo row `student` (trong khi `WEB_ORIGIN` vẫn giữ hành vi hiện tại).
- **Success criteria:** Bộ test biên dịch sạch nhưng thất bại đúng ở các assertion `403 ROLE_SIGNUP_FORBIDDEN` / `ADMIN_SIGNUP_FORBIDDEN` / OAuth non-unified block do mã nguồn cũ vẫn cho tạo tài khoản.
- **Verify:** `pnpm --filter @teacher-os/auth test` exits non-zero with assertion failure (expecting status 403 / code `ROLE_SIGNUP_FORBIDDEN`); passing test is a failure.

## Tasks & Steps

### Task 1.2 — Khóa fail-closed trong `packages/auth/src/index.ts`
<!-- Updated: Red Team Session 1 - require oauthApp === "unified" for privileged OAuth creation on unified deployments; make legacy fall-through adminEmails guard unconditional; read input.adminEmails/teacherEmails live without snapshotting; document allowlist-oracle tradeoff -->
- **Goal:** Chặn tạo tài khoản không phải unified OAuth cho `adminEmails`/`teacherEmails` trên unified LMS ở cả `hooks.before` và `databaseHooks.user.create.before`, bảo toàn Google OAuth unified (`oauthApp === "unified"`), bịt role-poisoning `adminEmails` trên nhánh fall-through, và đọc live allowlist trên mỗi request.
- **Target files and symbols:** `packages/auth/src/index.ts` (`CreateAuthInput`, `createAuth`, `hooks.before`, `databaseHooks.user.create.before`).
- **Steps:**
  1. Định nghĩa hằng số thông báo lỗi trung tính (không phân biệt `admin` vs `teacher`) `UNIFIED_PRIVILEGED_SIGNUP_FORBIDDEN_MESSAGE = 'Email này không thể tự đăng ký bằng mật khẩu. Nếu đây là tài khoản của bạn, vui lòng chọn "Tiếp tục với Google" để đăng nhập.'` và mã `ROLE_SIGNUP_FORBIDDEN`. *(Ghi chú trade-off bảo mật trong comment: mã 403 thống nhất đóng claimed-vs-unclaimed oracle và admin-vs-teacher oracle, đổi lại vẫn hướng dẫn chủ tài khoản dùng Google OAuth thay vì lỗi chung mơ hồ).*
  2. Thêm helper nội bộ đọc **trực tiếp (live)** từ `input.adminEmails` và `input.teacherEmails` trên từng lời gọi — **tuyệt đối không copy/snapshot thành `Set` hay mảng mới lúc khởi tạo `createAuth`** (để `POST /__e2e/teacher-emails` mutate mảng tại chỗ bằng `.splice` có hiệu lực ngay):
     ```ts
     function isEmailInList(
     	email: string | null | undefined,
     	list: string[] | undefined,
     ): boolean {
     	const normalized = (email ?? "").trim().toLowerCase();
     	return (
     		normalized.length > 0 &&
     		(list ?? []).some((entry) => entry.trim().toLowerCase() === normalized)
     	);
     }

     function isPrivilegedAllowlistEmail(email: string | null | undefined): boolean {
     	return (
     		isEmailInList(email, input.adminEmails) ||
     		isEmailInList(email, input.teacherEmails)
     	);
     }
     ```
  3. Trong `hooks.before` (`createAuthMiddleware`), ngay trước nhánh `if (ctx.path !== "/update-user") return;`, thêm:
     - Nếu `ctx.path === "/sign-up/email"` và `unifiedOrigins.length > 0`: đọc `body = (ctx.body ?? {}) as Record<string, unknown>`; nếu `typeof body.email === "string"` và `isPrivilegedAllowlistEmail(body.email)` -> `throw new APIError("FORBIDDEN", { message: UNIFIED_PRIVILEGED_SIGNUP_FORBIDDEN_MESSAGE, code: "ROLE_SIGNUP_FORBIDDEN" })`.
  4. Trong `databaseHooks.user.create.before(user, ctx)`:
     - Kiểm tra `const oauthApp = await readOAuthApp();` và `const isUnifiedOAuthCallback = ctx?.path === "/callback/:id" && oauthApp === "unified";`.
     - Khi `unifiedOrigins.length > 0`:
       - Nếu `isPrivilegedAllowlistEmail(user.email)` và `!isUnifiedOAuthCallback`: ném `APIError("FORBIDDEN", { message: UNIFIED_PRIVILEGED_SIGNUP_FORBIDDEN_MESSAGE, code: "ROLE_SIGNUP_FORBIDDEN" })` — chặn đồng bộ mọi `sign-up/email` (dù có `Origin`, thiếu `Origin`, hay `Origin: "null"`) lẫn OAuth callback có `oauthApp !== "unified"`.
       - Sau đó nếu `await isUnifiedContext(ctx)`: giữ logic `resolveAllowlistRole` + `normalizeUserProfile` để Google OAuth unified tạo đúng `admin`/`teacher`/`student`, và public `sign-up/email` email thường tạo đúng `student`.
     - Ở nhánh fall-through (`appRole = await resolveRequestAppForContext(ctx)`), bổ sung guard **vô điều kiện** (không bọc trong `if (unifiedOrigins.length === 0)`): khi `appRole === "student"` và `isEmailInList(user.email, input.adminEmails)` -> ném `APIError("FORBIDDEN", { message: "Email này thuộc tài khoản quản trị. Vui lòng đăng nhập tại cổng quản trị.", code: "ADMIN_SIGNUP_FORBIDDEN" })`.
  5. Cập nhật JSDoc của `CreateAuthInput.unifiedOrigins` cho khớp chính sách mới (public `sign-up/email` chỉ tạo `student`; `admin`/`teacher` khởi tạo lần đầu qua Google OAuth trên unified origin).
- **Success criteria:** Mọi đường non-unified-OAuth tạo tài khoản với email thuộc `adminEmails`/`teacherEmails` trên deployment unified đều bị chặn `403 ROLE_SIGNUP_FORBIDDEN` với 0 user row và 0 mail gửi đi; Google OAuth unified (`oauthApp === "unified"`) vẫn tạo đúng role `admin`/`teacher`/`student`; không có cờ opt-in bypass mới.
- **Verify:** `pnpm --filter @teacher-os/auth test` exits 0 and all test files pass.

### Task 1.3 — Cập nhật `apps/server/src/auth-role-roundtrip.test.ts` (block 2 unified origin)
- **Goal:** Đồng bộ integration test server với chính sách H1 (assert 403 trên `sign-up/email` cho admin/teacher, seed sẵn tài khoản cho các test sign-in & API role guard).
- **Target files and symbols:** `apps/server/src/auth-role-roundtrip.test.ts` (`describe("unified origin auth and API role guards")`, lines 281-561).
- **Steps:**
  1. Thêm helper `seedUnifiedCredentialUser(email, name, role)` sử dụng `hashPassword` từ `better-auth/crypto` (đã là dependency trực tiếp của `apps/server`) để insert `schema.user` (`emailVerified: false`) và `schema.account` (`providerId: "credential"`, `accountId: userId`), sau đó đăng nhập bằng `signInUnified(email)` lấy `session_token`.
  2. Trong `beforeAll`: giữ `studentToken = await signUpUnified(STUDENT_EMAIL, "Unified Student")`, chuyển `ADMIN_EMAIL`, `REMOVED_ADMIN_EMAIL`, `TEACHER_EMAIL` sang `seedUnifiedCredentialUser` + `signInUnified`.
  3. Thêm test case xác nhận `POST /api/auth/sign-up/email` trên `LMS_ORIGIN` và không có `Origin` cho `ADMIN_EMAIL` / `TEACHER_EMAIL` (cả email mới chưa tồn tại trong `adminEmails`/`teacherEmails` lẫn email đã seed) trả `403` `ROLE_SIGNUP_FORBIDDEN`.
- **Success criteria:** Toàn bộ suite `auth-role-roundtrip.test.ts` và `role-gates.test.ts` pass.
- **Verify:** `pnpm --filter server exec vitest run src/auth-role-roundtrip.test.ts src/role-gates.test.ts` exits 0 with 0 failures.

## Tests After & Regression Gate

- `pnpm --filter @teacher-os/auth test` exits 0.
- `pnpm --filter server exec vitest run src/auth-role-roundtrip.test.ts src/role-gates.test.ts src/routes/student-auth-provisioning.test.ts` exits 0.

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
