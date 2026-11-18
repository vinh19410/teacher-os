---
phase: 1
title: "Phase 1: Backend — Gỡ bỏ Email OTP plugin, template và chuyển đổi test tích hợp"
status: done
priority: P1
effort: "45m"
dependencies: []
---

# Phase 1: Backend — Gỡ bỏ Email OTP plugin, template và chuyển đổi test tích hợp

## Goal
Đóng hoàn toàn các endpoint Email OTP trên server bằng cách gỡ bỏ plugin `emailOTP`, logic cooldown/chặn endpoint phụ trợ và template mail OTP trong `packages/auth`, đồng thời giữ nguyên cơ chế `maybeProvisionVerifiedStudent` (#716), `userName` trim/fallback, `validateUpdateUserImage`, và chuyển đổi test tích hợp `apps/server` sang luồng `sign-up/email` + `verify-email`.

## Target Files & Symbols
- Modify: `packages/auth/src/index.ts` (imports `emailOTP`, `otpEmailTemplate`, `eq` nếu không còn dùng; helper `getUserByEmail`, `checkAndUpdateCooldown`; khối `BLOCKED_EMAIL_OTP_PATHS` và nhánh `/email-otp/send-verification-otp` / `/sign-in/email-otp` trong `hooks.before`; comment `#578` trong `databaseHooks.user.create.before`; mảng `plugins`)
- Modify: `packages/auth/src/mail/mail.test.ts` (gỡ import `otpEmailTemplate` và block `describe("otpEmailTemplate", ...)`)
- Modify: `packages/auth/src/auth-verification-email.test.ts` (thêm test TDD xác nhận toàn bộ 9 endpoint OTP trả `404` với `studentOrigin`, `teacherOrigin`, và không có `Origin`; bổ sung assert `student_invitation` tự accept khi verify-email)
- Rename & Modify: `apps/server/src/routes/student-auth-otp.test.ts` → `apps/server/src/routes/student-auth-provisioning.test.ts` (chuyển helper `loginWithOtp` sang `signUpAndVerifyStudent` dùng `/api/auth/sign-up/email` + `GET /api/auth/verify-email`, lấy cookie từ response `302` của `/verify-email` để giữ nguyên lớp test tích hợp `createAuth` → `getSessionUser` → `buildApp` → `/api/student/me` cho Trường hợp A/B/C)
- Delete: `packages/auth/src/mail/otp-email-template.ts`
- Delete: `packages/auth/src/auth-email-otp.test.ts`

## Tasks & Steps

### Task 1.1 (TDD Red) — Viết test khẳng định toàn bộ 9 endpoint Email OTP trả về 404
- **Goal:** Tạo test fail trước khi sửa `packages/auth/src/index.ts` để chứng minh Better-Auth hiện đang phục vụ hoặc xử lý các endpoint OTP.
- **Target files and symbols:** `packages/auth/src/auth-verification-email.test.ts` (thêm `test(...)` mới ở cuối `describe("auth email verification wiring", ...)`).
- **Steps:**
  1. Đọc cuối file `packages/auth/src/auth-verification-email.test.ts` để lấy mẫu khởi tạo `createAuth` có đủ `studentOrigin` và `teacherOrigin` (không dùng `setupTestAuth` vốn để `studentOrigins: []`).
  2. Thêm test case gửi `POST` tới cả 9 path:
     - `/api/auth/email-otp/send-verification-otp`
     - `/api/auth/sign-in/email-otp`
     - `/api/auth/email-otp/request-password-reset`
     - `/api/auth/email-otp/reset-password`
     - `/api/auth/forget-password/email-otp`
     - `/api/auth/email-otp/change-email`
     - `/api/auth/email-otp/request-email-change`
     - `/api/auth/email-otp/verify-email`
     - `/api/auth/email-otp/check-verification-otp`
     Kiểm tra lần lượt với `origin: studentOrigin`, `origin: teacherOrigin`, và không có header `Origin`, assert mỗi response đều có `res.status === 404`.
  3. Chạy lệnh verify đỏ bên dưới trước khi sửa `packages/auth/src/index.ts`.
- **Success criteria:** Test mới vừa thêm thất bại vì `emailOTP` plugin và `BLOCKED_EMAIL_OTP_PATHS` đang trả về `200`/`400`/`403` thay vì `404`.
- **Verify:** `pnpm --filter @teacher-os/auth test src/auth-verification-email.test.ts` thoát mã khác `0` với assertion failure trên status `404` (trạng thái Red).

### Task 1.2 — Gỡ plugin `emailOTP`, cooldown/hook OTP, template mail OTP và chuyển đổi test tích hợp
- **Goal:** Xóa toàn bộ mã nguồn Email OTP khỏi `packages/auth` nhưng giữ nguyên `maybeProvisionVerifiedStudent` (#716), `userName` trim/fallback và `validateUpdateUserImage`, đồng thời bảo toàn test tích hợp provisioning ở `apps/server`.
- **Target files and symbols:** `packages/auth/src/index.ts`, `packages/auth/src/mail/otp-email-template.ts`, `packages/auth/src/mail/mail.test.ts`, `packages/auth/src/auth-email-otp.test.ts`, `apps/server/src/routes/student-auth-otp.test.ts` → `apps/server/src/routes/student-auth-provisioning.test.ts`.
- **Steps:**
  1. Trong `packages/auth/src/index.ts`:
     - Xóa `import { emailOTP } from "better-auth/plugins";` và `import { otpEmailTemplate } from "./mail/otp-email-template";`.
     - **Giữ lại `import { eq } from "drizzle-orm";`** vì `getUserRole` vẫn dùng `eq(schema.user.id, userId)`.
     - Xóa helper `getUserByEmail` và `checkAndUpdateCooldown`.
     - Trong `hooks.before`, xóa khối `// Issue #578: Email OTP security & cooldown` (`BLOCKED_EMAIL_OTP_PATHS`, `/email-otp/send-verification-otp`, `/sign-in/email-otp`).
     - Trong `databaseHooks.user.create.before`, **giữ nguyên** phần `userName` trim + fallback email local-part và `validateUpdateUserImage` sanitization, chỉ cập nhật lại comment bỏ tham chiếu `#578` OTP.
     - Xóa khối `plugins: [ emailOTP({ ... }) ]`.
  2. Trong `packages/auth/src/mail/mail.test.ts`, xóa `import { otpEmailTemplate } from "./otp-email-template";` và khối `describe("otpEmailTemplate", ...)`.
  3. Xóa `packages/auth/src/mail/otp-email-template.ts` và `packages/auth/src/auth-email-otp.test.ts`.
  4. Chuyển `apps/server/src/routes/student-auth-otp.test.ts` thành `apps/server/src/routes/student-auth-provisioning.test.ts` (xóa file cũ, tạo file mới): đổi helper `loginWithOtp(email)` sang `signUpAndVerifyStudent(email)` gọi `POST /api/auth/sign-up/email` (`origin: PORTAL_ORIGIN`, kèm `name` và `callbackURL: \`${PORTAL_ORIGIN}/verify-email?verified=ok\``), tách verify URL từ `sentMails`, gọi `GET <verifyUrl>` (không gửi `Origin`), assert `302` và lấy session cookie từ response `Set-Cookie` của `/verify-email`, rồi giữ nguyên cả 3 test Trường hợp A (student tạo trước), Trường hợp B (student mới), Trường hợp C (pending `student_invitation` tự accept và vào `/api/student/me` 200 OK). Đồng thời bổ sung assert `student_invitation` từ `pending` → `accepted` trong `packages/auth/src/auth-verification-email.test.ts`.
- **Success criteria:** Không còn bất kỳ tham chiếu nào tới `emailOTP`, `otpEmailTemplate`, hoặc `otp-cooldown` trong `packages/` và `apps/server/`, và cả 9 path OTP trả `404`.
- **Verify:** `pnpm --filter @teacher-os/auth test src/auth-verification-email.test.ts && pnpm --filter server test src/routes/student-auth-provisioning.test.ts` thoát `0` và toàn bộ test pass.

### Task 1.3 (TDD Green & Regression) — Chạy toàn bộ test suite của `@teacher-os/auth` và `server`
- **Goal:** Xác nhận không có lỗi hồi quy ở verify-email, reset-password, role isolation, teacher/admin signup guard và student provisioning.
- **Target files and symbols:** Toàn bộ `packages/auth` và `apps/server`.
- **Steps:**
  1. Chạy `pnpm --filter @teacher-os/auth test`.
  2. Chạy `pnpm --filter server test`.
- **Success criteria:** Toàn bộ test files trong `@teacher-os/auth` và `server` pass với exit code `0`.
- **Verify:** `pnpm --filter @teacher-os/auth test && pnpm --filter server test` thoát mã `0` và in kết quả pass không có test failed.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same failure evidence to the user. Never continue by self-reasoning.
