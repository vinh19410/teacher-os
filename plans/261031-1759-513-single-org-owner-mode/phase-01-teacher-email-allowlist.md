---
phase: 1
title: "Allowlist email giáo viên (TEACHER_EMAILS)"
status: pending
priority: P2
effort: "4h"
dependencies: []
---

# Phase 1: Allowlist email giáo viên

## Goal

Khi binding `TEACHER_EMAILS` được set, chỉ email trong danh sách đăng ký được và dùng được app giáo viên. Khi binding rỗng, hành vi giữ nguyên như hiện tại. Production bắt buộc phải set.

## Bối cảnh cần đọc trước

- Pattern mẫu `ADMIN_EMAILS` (plan #413):
  - [packages/auth/src/index.ts](../../packages/auth/src/index.ts): `CreateAuthInput.adminEmails`, nhánh `appRole === "admin"` trong `databaseHooks.user.create.before`.
  - [packages/auth/src/auth-admin-signup.test.ts](../../packages/auth/src/auth-admin-signup.test.ts): cách test hook.
  - [packages/infra/alchemy.run.ts](../../packages/infra/alchemy.run.ts): `adminEmailsConfig` và khối `env` của Worker `server`.
  - [packages/infra/src/topology.ts](../../packages/infra/src/topology.ts): `PROD_APP_DOMAIN`, `resolveAssumeEmailVerified`.
- Kernel gate: `bootstrapMiddleware` trong [apps/server/src/app.ts](../../apps/server/src/app.ts), các nhánh `session.role === "student"`/`"admin"` trả 403 kèm `ACCOUNT_ERROR_CODES`.
- Session có sẵn `email` ([apps/server/src/session.ts](../../apps/server/src/session.ts)).
- Wiring env: [apps/server/src/index.ts](../../apps/server/src/index.ts), các dòng `adminEmails: parseCORSOrigins(env.ADMIN_EMAILS)` (khoảng dòng 78 và 132).
- Web: `isStudentRoleRejected` trong [apps/web/src/lib/repos/kernel.ts](../../apps/web/src/lib/repos/kernel.ts) (khoảng dòng 684) và test [kernel.transport.test.ts](../../apps/web/src/lib/repos/kernel.transport.test.ts).

## Files to Create / Modify

- Modify: `packages/api/src/contracts.ts` (thêm 2 mã vào `ACCOUNT_ERROR_CODES`)
- Modify: `packages/infra/src/topology.ts`, `packages/infra/src/topology.test.ts`
- Modify: `packages/infra/alchemy.run.ts`
- Modify: `packages/auth/src/index.ts`, `packages/auth/src/auth-admin-signup.test.ts` (hoặc tạo `packages/auth/src/auth-teacher-signup.test.ts` theo cùng khuôn)
- Modify: `apps/server/src/app.ts`, `apps/server/src/index.ts`, `apps/server/src/role-gates.test.ts`
- Modify: `apps/web/src/lib/repos/kernel.ts`, `apps/web/src/lib/repos/kernel.transport.test.ts`
- Không sửa: `apps/e2e/src/boot.ts` (e2e chạy với allowlist rỗng, tức là không giới hạn)

## Tasks

### Task 1.1 — Hàm resolve fail-closed trên production

- Goal: deploy production với `TEACHER_EMAILS` rỗng thì ném lỗi; môi trường khác trả danh sách (có thể rỗng).
- Target: `packages/infra/src/topology.ts`, tạo hàm export `resolveTeacherEmails(raw: string | undefined, appDomain: string | undefined): string`.
- Steps:
  1. Đặt hàm ngay dưới `resolveAssumeEmailVerified`, cùng phong cách comment tiếng Việt.
  2. `const value = raw?.trim() ?? ""`. Nếu `value === ""` và `appDomain?.trim() === PROD_APP_DOMAIN` thì `throw new Error("TEACHER_EMAILS must be set on production (single-org owner mode)")`. Ngược lại trả `value`.
  3. Trong `topology.test.ts` thêm 3 test: prod + rỗng thì ném lỗi khớp `/TEACHER_EMAILS must be set/`; prod + `"a@x.vn"` trả `"a@x.vn"`; staging (`staging.teacheros.io.vn`) + rỗng trả `""`.
- Success criteria: 3 test mới pass.
- Verify: `pnpm --filter @teacher-os/infra test` exits 0.

### Task 1.2 — Đưa binding vào Worker

- Goal: Worker `server` nhận binding `TEACHER_EMAILS`.
- Target: `packages/infra/alchemy.run.ts`.
- Steps:
  1. Import `resolveTeacherEmails` cạnh `resolveAssumeEmailVerified`.
  2. Dưới `adminEmailsConfig` thêm comment ngắn giải thích "rỗng = không giới hạn; production bắt buộc set" và `const teacherEmails = resolveTeacherEmails(process.env.TEACHER_EMAILS, process.env.APP_DOMAIN);`.
  3. Trong `env` của `server`, ngay dưới `ADMIN_EMAILS: adminEmailsConfig,` thêm `TEACHER_EMAILS: teacherEmails,`.
  4. Nếu type `Env` của server khai báo binding thủ công (grep `ADMIN_EMAILS` trong `apps/server` và `packages/env`), thêm `TEACHER_EMAILS` theo cùng chỗ.
- Success criteria: typecheck sạch.
- Verify: `pnpm check-types` exits 0.

### Task 1.3 — Mã lỗi trong contract

- Goal: hai mã lỗi mới dùng chung cho server và web.
- Target: `packages/api/src/contracts.ts`, object `ACCOUNT_ERROR_CODES`.
- Steps:
  1. Thêm `TEACHER_SIGNUP_FORBIDDEN: "ACCOUNT_TEACHER_SIGNUP_FORBIDDEN"` kèm comment `/** Sign-up teacher với email ngoài TEACHER_EMAILS (single-org). */`.
  2. Thêm `TEACHER_NOT_ALLOWED: "ACCOUNT_TEACHER_NOT_ALLOWED"` kèm comment `/** Session teacher có email ngoài TEACHER_EMAILS chạm kernel tree. */`.
- Success criteria: không đổi giá trị mã cũ.
- Verify: no verification needed (task 1.4 đến 1.6 dùng các mã này và có test).

### Task 1.4 — Gate sign-up trong auth

- Goal: sign-up role teacher với email ngoài allowlist (khi allowlist khác rỗng) bị 403.
- Target: `packages/auth/src/index.ts`, `CreateAuthInput` và `databaseHooks.user.create.before`.
- Steps:
  1. Thêm field `teacherEmails?: string[]` vào `CreateAuthInput`, comment: "Allowlist email giáo viên (binding TEACHER_EMAILS). Rỗng = không giới hạn."
  2. Trong `user.create.before`, sau khối `if (appRole === "admin") {...}`, thêm:
     ```ts
     if (appRole === "teacher" && (input.teacherEmails ?? []).length > 0) {
       const email = user.email?.trim().toLowerCase() ?? "";
       const allow = (input.teacherEmails ?? []).some(
         (e) => e.trim().toLowerCase() === email,
       );
       if (!email || !allow) {
         throw new APIError("FORBIDDEN", {
           message: "Ứng dụng giáo viên hiện chỉ dành cho chủ tài khoản. Học viên vui lòng dùng cổng học viên.",
           code: "TEACHER_SIGNUP_FORBIDDEN",
         });
       }
     }
     ```
  3. Viết test theo khuôn `auth-admin-signup.test.ts` với 4 ca: (a) teacher origin, allowlist `["owner@x.vn"]`, email `stranger@x.vn` thì ném lỗi có `code` `TEACHER_SIGNUP_FORBIDDEN`; (b) cùng allowlist, email `Owner@X.vn` thì tạo được và role `teacher`; (c) allowlist rỗng, email bất kỳ thì tạo được; (d) student origin, allowlist `["owner@x.vn"]`, email `stranger@x.vn` thì tạo được (role `student`).
- Success criteria: 4 test pass, test cũ vẫn pass.
- Verify: `pnpm --filter @teacher-os/auth test` exits 0.

### Task 1.5 — Gate mỗi request trong kernel

- Goal: session teacher ngoài allowlist không bao giờ tạo org và nhận 403 `ACCOUNT_TEACHER_NOT_ALLOWED`.
- Target: `apps/server/src/app.ts` (`AppDeps`, `bootstrapMiddleware`, các chỗ truyền `adminEmails` vào `createAuth`), `apps/server/src/index.ts`.
- Steps:
  1. Thêm `teacherEmails?: string[]` vào `AppDeps`, comment giống task 1.4.
  2. Trong `bootstrapMiddleware`, ngay sau nhánh `session.role === "admin"` và **trước** `const db = deps.getDb();`, thêm: nếu `(deps.teacherEmails ?? []).length > 0` và email lowercase của session không nằm trong danh sách (so khớp lowercase, trim) thì `return c.json({ error: ACCOUNT_ERROR_CODES.TEACHER_NOT_ALLOWED, code: ACCOUNT_ERROR_CODES.TEACHER_NOT_ALLOWED }, 403);`.
  3. Ở mọi chỗ trong `app.ts` truyền `adminEmails: deps.adminEmails ?? []` vào auth (khoảng dòng 387 và 400), thêm `teacherEmails: deps.teacherEmails ?? []`.
  4. Trong `apps/server/src/index.ts`, ở cả hai chỗ có `adminEmails: parseCORSOrigins(env.ADMIN_EMAILS)`, thêm `teacherEmails: parseCORSOrigins(env.TEACHER_EMAILS ?? "")`. Thêm `?? ""` vì binding có thể vắng ở runtime chưa cấu hình; nếu type `env` khai báo `TEACHER_EMAILS` là `string` bắt buộc thì đổi thành optional.
  5. Trong `role-gates.test.ts`, theo khuôn test hiện có, thêm 3 test: (a) `teacherEmails: ["owner@x.vn"]`, session teacher `stranger@x.vn` gọi một route kernel (route snapshot đang được test trong file) thì 403, body `error === "ACCOUNT_TEACHER_NOT_ALLOWED"`, và bảng `organization` không có row mới; (b) session `OWNER@x.vn` thì 200; (c) allowlist rỗng thì 200 như cũ.
- Success criteria: 3 test mới pass, mọi test server khác giữ nguyên.
- Verify: `pnpm --filter server test` exits 0.

### Task 1.6 — Web xử lý mã mới

- Goal: web chuyển sang màn hình role-blocked khi nhận 403 `ACCOUNT_TEACHER_NOT_ALLOWED`.
- Target: `apps/web/src/lib/repos/kernel.ts`, hàm `isStudentRoleRejected`; component dùng `isRoleBlocked` trong `apps/web/src/lib/data-provider.tsx`.
- Steps:
  1. Đổi điều kiện thành `error.reason === ACCOUNT_ERROR_CODES.STUDENT_ON_TEACHER_APP || error.reason === ACCOUNT_ERROR_CODES.TEACHER_NOT_ALLOWED`. Giữ tên hàm để không phải đổi call site, và cập nhật JSDoc.
  2. Mở `data-provider.tsx` và đọc copy của màn hình blocked. Nếu copy chỉ nói về "tài khoản học viên", đổi thành câu trung tính đúng cho cả hai trường hợp, ví dụ "Tài khoản này không có quyền dùng ứng dụng giáo viên."
  3. Trong `kernel.transport.test.ts` thêm 1 test theo khuôn test "403 body {error: ACCOUNT_STUDENT_ROLE}...": 403 với `ACCOUNT_TEACHER_NOT_ALLOWED` thì `isStudentRoleRejected` trả `true`.
- Success criteria: test mới pass. Nếu có test snapshot hoặc copy của màn hình blocked, cập nhật theo copy mới.
- Verify: `pnpm --filter web test` exits 0.

### Task 1.7 — Gate toàn repo

- Goal: không regression.
- Steps:
  1. `pnpm check:fix` nếu biome báo format.
  2. Chạy lần lượt các lệnh ở Verify.
  3. E2E dùng port override trong AGENTS.md. Trước khi chạy, kiểm tra cổng 8100/8101/8103/8104/8105 trống bằng `lsof -i :8100` (và tương tự với các cổng còn lại).
- Verify:
  - `pnpm exec biome check .` exits 0.
  - `pnpm check-types` exits 0.
  - `pnpm test` exits 0.
  - `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e` exits 0. Nếu run fail với message `[dev-watchdog] hạ tầng dev server bất ổn` thì đó là lỗi hạ tầng, không phải lỗi test: chạy lại một lần trước khi áp dụng Failure Protocol.

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
