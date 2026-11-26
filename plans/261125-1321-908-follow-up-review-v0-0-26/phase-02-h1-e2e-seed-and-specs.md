---
phase: 2
title: "Phase 2: H1 — E2E Seed Endpoint and Auth/Sign-Up Specs"
status: completed
priority: P1
effort: 1.5h
dependencies: [1]
---

# Phase 2: H1 — E2E Seed Endpoint and Auth/Sign-Up Specs

## Goal

Cung cấp endpoint E2E-only `POST /__e2e/seed-user` trong `apps/e2e/src/boot.ts` (giới hạn loopback `Host` header, không ảnh hưởng production) và cập nhật toàn bộ helper/script/spec E2E liên quan để giữ 100% parity bảo mật với production và kiểm chứng hành vi H1 end-to-end trên trình duyệt thật.

## Files to Create / Modify

- Modify: `apps/e2e/src/boot.ts` (thêm `POST /__e2e/seed-user` dùng `(await auth.$context).password.hash(...)`)
- Modify: `apps/e2e/specs/helpers.ts` (`ensureAdminAccount`, thêm helper `seedUserViaE2e` dùng chung)
- Modify: `apps/e2e/scripts/admin-screenshots.mjs` (gọi `/__e2e/seed-user`, xóa unused `createClient`)
- Modify: `apps/e2e/specs/lms-unified-domain.spec.ts` (đổi 2 test allowlist signup sang assert 403 + toast lỗi + 0 user mới)
- Modify: `apps/e2e/specs/signup-ui-smoke.spec.ts` (kiểm thử luồng public sign-up thật của học viên tới `/student`)
- Modify: `apps/e2e/specs/web-email-verification.spec.ts` (seed teacher chưa verify -> đăng nhập tới `/teacher/dashboard` gặp `<AccountBlockedView />` -> bấm `"Gửi lại email xác thực"` -> mở link verify -> CTA `"Vào trang giáo viên"` -> `email_verified = 1`)
- Modify: `apps/e2e/specs/placement-lead-org-drift.spec.ts` (seed teacher qua `seedUserViaE2e` + đăng nhập `POST /api/auth/sign-in/email` với `Origin: WEB_ORIGIN`)

## Tests Before (TDD Red Phase)

### Task 2.1 — Kiểm kê các vị trí gọi `sign-up/email` với allowlisted email trong `apps/e2e`
<!-- Updated: Red Team Session 1 - fix exact file inventory (7 files to modify + 3 valid sign-in-only specs using ensureAdminAccount/ADMIN_EMAIL) -->
- **Goal:** Xác nhận toàn bộ các vị trí trong `apps/e2e` dùng `ADMIN_EMAIL` hoặc `/__e2e/teacher-emails` kết hợp `/api/auth/sign-up/email` đã nằm trọn trong 7 file mục tiêu (các spec khác chỉ gọi `ensureAdminAccount` + `sign-in/email`).
- **Target files and symbols:** 7 file sửa đổi ở mục `Files to Create / Modify` (và xác nhận `admin-auth.spec.ts`, `student-wrong-role-redirect.spec.ts`, `media-upload-magic-bytes.spec.ts` chỉ gọi `ensureAdminAccount` + `sign-in/email`).
- **Steps:**
  1. Chạy grep liệt kê mọi xuất hiện của `teacher-emails`, `ADMIN_EMAIL`, `E2E_ADMIN_EMAILS` trong `apps/e2e/`.
  2. Đối chiếu xác nhận không còn file nào ngoài 7 file mục tiêu gọi `POST /api/auth/sign-up/email` với email thuộc `ADMIN_EMAILS` hoặc `TEACHER_EMAILS`.
- **Success criteria:** Kết quả grep chỉ gồm 7 file mục tiêu cộng các spec chỉ dùng `ensureAdminAccount` / `ADMIN_EMAIL` cho `sign-in/email`.
- **Verify:** `grep -rn "teacher-emails\|ADMIN_EMAIL\|E2E_ADMIN_EMAILS" apps/e2e/ --include="*.ts" --include="*.mjs"` exits 0 and shows no unlisted `sign-up/email` caller.

## Tasks & Steps

### Task 2.2 — Thêm endpoint E2E-only `POST /__e2e/seed-user` trong `apps/e2e/src/boot.ts`
<!-- Updated: Red Team Session 1 - convert emailVerified boolean to SQLite 1/0 explicitly; guard Host header to loopback while preserving dual-stack "::" listener for localhost CI -->
- **Goal:** Cho phép E2E tạo/upsert idempotent tài khoản `admin`/`teacher`/`student` kèm mật khẩu credential hợp lệ mà không mở bất kỳ bypass nào trong `@teacher-os/auth`.
- **Target files and symbols:** `apps/e2e/src/boot.ts` (sau `app.post("/__e2e/teacher-emails", ...)`).
- **Steps:**
  1. Khai báo route `app.post("/__e2e/seed-user", async (c) => { ... })` kiểm tra `Host` header thuộc loopback (`localhost`, `127.0.0.1`, `[::1]`, có hoặc không có `:port`; trả `403` nếu không khớp — giữ nguyên `HOSTNAME = "::"` để dual-stack `localhost` hoạt động trên CI).
  2. Parse JSON `{ email: string, password: string, name?: string, role?: "admin" | "teacher" | "student", emailVerified?: boolean }`. Validate `email` (`trim().toLowerCase()`, không rỗng), `password` (không rỗng), `role` thuộc `"admin" | "teacher" | "student"` (mặc định `"student"`), `emailVerified` boolean (mặc định `true`), `name` (`trim()`, mặc định `"E2E User"`). Trả `400` nếu thiếu/sai.
  3. Lấy `const authCtx = await auth.$context;` và băm mật khẩu thật bằng `const passwordHash = await authCtx.password.hash(password);`.
  4. Chuyển tường minh `const emailVerifiedInt = emailVerified ? 1 : 0;` và `const now = Date.now();`. Kiểm tra `SELECT id FROM user WHERE lower(email) = lower(?) LIMIT 1`:
     - Nếu chưa có: tạo `userId = crypto.randomUUID()`, chèn `user` (`email_verified = emailVerifiedInt`) và `account` (`provider_id = 'credential'`, `account_id = userId`, `user_id = userId`, `password = passwordHash`). Nếu gặp lỗi `UNIQUE` trên `user.email` do race, đọc lại `id` và rơi sang nhánh cập nhật.
     - Nếu đã có: `UPDATE user SET name = ?, role = ?, email_verified = ?, updated_at = ? WHERE id = ?`, rồi cập nhật dòng `account` (`WHERE user_id = ? AND provider_id = 'credential'`) hoặc chèn mới nếu `rowsAffected === 0`.
  5. Trả `200` với `{ ok: true, id: userId, email: normalizedEmail, role, emailVerified }`.
- **Success criteria:** Endpoint chỉ tồn tại trong `apps/e2e/src/boot.ts` (không chạm `apps/server`), typecheck sạch (`pnpm --filter e2e check-types`).
- **Verify:** `pnpm --filter e2e check-types` exits 0.

### Task 2.3 — Cập nhật `ensureAdminAccount`, `admin-screenshots.mjs` và 4 spec E2E auth
<!-- Updated: Red Team Session 1 - use AccountBlockedView on /teacher/dashboard for web-email-verification.spec.ts; pass Origin: WEB_ORIGIN on sign-in/email in placement-lead-org-drift.spec.ts; remove unused createClient import in admin-screenshots.mjs -->
- **Goal:** Chuyển luồng seed admin/teacher trong E2E sang `/__e2e/seed-user` và cập nhật assertion của các spec kiểm thử public sign-up theo chính sách H1.
- **Target files and symbols:**
  - `apps/e2e/specs/helpers.ts` (`seedUserViaE2e`, `ensureAdminAccount`)
  - `apps/e2e/scripts/admin-screenshots.mjs` (`main`, xóa unused import `createClient`)
  - `apps/e2e/specs/lms-unified-domain.spec.ts` (block `Public sign-up role classification at /login`)
  - `apps/e2e/specs/signup-ui-smoke.spec.ts`
  - `apps/e2e/specs/web-email-verification.spec.ts`
  - `apps/e2e/specs/placement-lead-org-drift.spec.ts`
- **Steps:**
  1. Trong `apps/e2e/specs/helpers.ts`: thêm hàm export `seedUserViaE2e(request: APIRequestContext, opts: { email: string; password?: string; name?: string; role: "admin" | "teacher" | "student"; emailVerified?: boolean })` gọi `POST ${API_ORIGIN}/__e2e/seed-user` và assert `res.status() === 200`. Cập nhật `ensureAdminAccount(request)` gọi `seedUserViaE2e` với `{ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, name: "E2E Admin", role: "admin", emailVerified: true }`.
  2. Trong `apps/e2e/scripts/admin-screenshots.mjs`: gỡ `import { createClient } from "@libsql/client"` ở dòng 12 và thay đoạn `fetch(${API_ORIGIN}/api/auth/sign-up/email)` + SQLite `UPDATE` bằng `POST ${API_ORIGIN}/__e2e/seed-user` cho `ADMIN_EMAIL` (fail-loud nếu `status !== 200`).
  3. Trong `apps/e2e/specs/lms-unified-domain.spec.ts`:
     - Test `"email trong TEACHER_EMAILS đăng ký tại /login bị chặn 403 và không tạo tài khoản"`: gọi `setRuntimeTeacherEmails(request, [teacherEmail])`, submit form `#panel-signup`, bắt response `/api/auth/sign-up/email` assert `status === 403` và `code === "ROLE_SIGNUP_FORBIDDEN"`, assert vẫn ở `/login`, hiển thị toast chứa `"Tiếp tục với Google"`, và `readUserRole(teacherEmail)` trả `null`.
     - Test `"email trong ADMIN_EMAILS đăng ký tại /login bị chặn 403 và không tạo tài khoản"`: `deleteUserByEmail(ADMIN_EMAIL)`, submit form `#panel-signup` với `ADMIN_EMAIL`, assert response `status === 403`, `code === "ROLE_SIGNUP_FORBIDDEN"`, vẫn ở `/login`, toast hiển thị, `readUserRole(ADMIN_EMAIL)` trả `null`; khối `finally` gọi `ensureAdminAccount(request)`.
  4. Trong `apps/e2e/specs/signup-ui-smoke.spec.ts`: đổi tên test thành `"student signs up through the real form and lands on the student portal"`, bỏ gọi `/__e2e/teacher-emails`, dùng `signUpViaUi(page, { email, expectedUrl: /\/student/ })` và assert `toHaveURL(/\/student/)`.
  5. Trong `apps/e2e/specs/web-email-verification.spec.ts`:
     - Gọi `POST ${API_ORIGIN}/__e2e/teacher-emails` với `{ emails: [teacherEmail] }` (reset `[]` trong `finally`).
     - Seed tài khoản teacher chưa xác thực qua `seedUserViaE2e(request, { email: teacherEmail, name: "E2E Teacher Verify", password: "password-8chars", role: "teacher", emailVerified: false })`.
     - Đăng nhập qua `/login` (`#signin-email`, `#signin-password`, `#panel-signin button[type='submit']`) -> assert URL chuyển tới `/teacher/dashboard` và `<AccountBlockedView />` hiển thị đoạn text chứa `"chưa được xác thực"` (`apps/web/src/components/account-blocked-view.tsx:92-96`).
     - Chờ và bấm nút `page.getByRole("button", { name: "Gửi lại email xác thực" })` (`account-blocked-view.tsx:117-134`), xác nhận thông báo `"Đã gửi lại email xác thực"` xuất hiện.
     - Đọc link verify trong `.mail-log.jsonl` (assert `callbackURL` trỏ `${LMS_ORIGIN}/verify-email?verified=ok`), mở link verify -> assert `"Email đã được xác thực"` -> bấm CTA `"Vào trang giáo viên"` -> assert tới `TEACHER_BASE_URL` và DB `email_verified = 1`.
  6. Trong `apps/e2e/specs/placement-lead-org-drift.spec.ts`: thay đoạn `POST /api/auth/sign-up/email` + `UPDATE user SET email_verified = 1` bằng gọi `seedUserViaE2e(teacherPage.request, { email: teacherEmail, name: "Cô Mỹ Drift E2E", password: "password-8chars", role: "teacher", emailVerified: true })` rồi `POST ${API_ORIGIN}/api/auth/sign-in/email` với **`headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN }`** (assert `status === 200`, đặt cookie session lên `teacherPage`), sau đó giữ nguyên `setTeacherEmails(teacherPage, [teacherEmail])` và điều hướng tới `${TEACHER_BASE_URL}/dashboard`.
- **Success criteria:** Không còn test E2E nào phụ thuộc vào hành vi cũ cho phép `admin`/`teacher` dùng `sign-up/email`, typecheck & biome check `e2e` pass 0 lỗi.
- **Verify:** `pnpm --filter e2e check-types && pnpm --filter e2e test && pnpm exec biome check apps/e2e/src/boot.ts apps/e2e/specs/helpers.ts apps/e2e/scripts/admin-screenshots.mjs apps/e2e/specs/lms-unified-domain.spec.ts apps/e2e/specs/signup-ui-smoke.spec.ts apps/e2e/specs/web-email-verification.spec.ts apps/e2e/specs/placement-lead-org-drift.spec.ts` exits 0.

## Tests After & Regression Gate

- `pnpm --filter e2e check-types && pnpm --filter e2e test` exits 0.
- `pnpm exec biome check apps/e2e/src/boot.ts apps/e2e/specs/helpers.ts apps/e2e/scripts/admin-screenshots.mjs apps/e2e/specs/lms-unified-domain.spec.ts apps/e2e/specs/signup-ui-smoke.spec.ts apps/e2e/specs/web-email-verification.spec.ts apps/e2e/specs/placement-lead-org-drift.spec.ts` exits 0.
- Runtime Playwright verification của `POST /__e2e/seed-user` và 7 spec E2E lẻ chạy ở Phase 5 Task 5.4 với port override `8100..8105` (tránh build/boot stack E2E nhiều lần).

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
