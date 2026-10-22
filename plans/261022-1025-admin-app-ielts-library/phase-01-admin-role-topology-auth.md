# Phase 1 — Role `admin`, topology, gate xác thực

## Context

Hiện `AppRole = "teacher" | "student"` (`packages/auth/src/role.ts`), phân loại theo Origin của request. Ba lớp gate của plan #260: (1) sign-up gán `user.role` theo origin, (2) `databaseHooks.session.create.before` từ chối cross-app (`ROLE_MISMATCH`), (3) middleware API (`bootstrapMiddleware` chặn `student`, student guard chặn `teacher`). Origin thứ ba phải mở rộng cả ba lớp, và **không được** để origin admin tự cấp quyền admin cho người lạ.

## Requirements

- `AppRole` thêm `"admin"`; `resolveRequestApp` nhận thêm `adminOrigins`, khớp chính xác; origin lạ vẫn mặc định `student`.
- `user.create.before`: nếu `appRole === "admin"` mà email ∉ `ADMIN_EMAILS` → `APIError FORBIDDEN` (mã `ADMIN_SIGNUP_FORBIDDEN`). Áp cho cả email/password lẫn Google callback.
- `session.create.before`: giữ so khớp `userRole === requiredApp`, thêm thông điệp `ROLE_MISMATCH` cho admin ↔ app khác.
- `sendResetPassword` và email xác thực: link chỉ gửi sang cổng đúng role (code hiện so `targetApp` với `resolveUserRole`), bảo đảm vẫn đúng với `admin`.
- Topology: `adminHost = admin.<domain>`, `adminOrigin`; `CORS_ORIGIN` mặc định gồm 3 origin; dev default thêm `http://localhost:8004`.
- Binding mới `ADMIN_ORIGINS` (mặc định `adminOrigin`) và `ADMIN_EMAILS` (danh sách email phân tách dấu phẩy, không có default; rỗng = không ai là admin).
- API: `SessionUser.role` thêm `admin`. `bootstrapMiddleware` trả 403 `ACCOUNT_ADMIN_ROLE` cho role `admin` trên kernel tree (không tạo org). `/api/student/*` từ chối admin (guard hiện chỉ chặn `teacher` tại `apps/server/src/routes/student.ts:446`, nên admin sẽ lọt qua nếu không sửa). `/api/admin/*` được bootstrap bỏ qua như `/api/student`.
- `requireAdmin` guard: `role==='admin'` ∧ `emailVerified` ∧ `email ∈ ADMIN_EMAILS` (so sánh lowercase, kiểm lại **mỗi request**).

## Files

Sửa:
- `packages/auth/src/role.ts` (+ `role.test.ts`)
- `packages/auth/src/index.ts` (`CreateAuthInput.adminOrigins`, `adminEmails`; hooks)
- `packages/auth/src/topology.ts` (không đổi hằng, thêm validate danh sách origin nếu cần)
- `packages/infra/src/topology.ts` (+ `topology.test.ts`): `adminHost`, `adminOrigin`
- `packages/infra/alchemy.run.ts`: CORS check/default, `ADMIN_ORIGINS`, `ADMIN_EMAILS`
- `packages/infra/.env.example`
- `packages/env/env.d.ts` (kiểu binding mới)
- `apps/server/src/index.ts` (truyền `adminOrigins`, `adminEmails` vào `createAuth`)
- `apps/server/src/session.ts` (role union)
- `apps/server/src/app.ts` (`bootstrapMiddleware`, mount point `/api/admin` — router được tạo ở phase 3)
- `packages/api/src/contracts.ts`: `ACCOUNT_ERROR_CODES.ADMIN_ON_TEACHER_APP`, `ADMIN_SIGNUP_FORBIDDEN`, `NOT_ADMIN`
- `scripts/topology-drift.test.mjs`: dev CORS default phải khớp web+student+admin; thêm kiểm port admin = 8004

Tạo:
- `apps/server/src/lib/require-admin.ts` (+ test)
- `apps/server/src/role-gates.test.ts` mở rộng (file có sẵn)

## Steps

1. Viết test đỏ trước cho `resolveRequestApp` (admin origin khớp, origin lạ vẫn student) và cho `user.create.before` (admin origin + email lạ bị 403; email trong allowlist qua).
2. Mở rộng `role.ts`, `createAuth`, topology, alchemy theo requirements. Đặt `ADMIN_EMAILS` ở cùng chỗ đọc `STUDENT_ORIGINS` để giữ pattern fail-loud của `alchemy.run.ts` (explicit `ADMIN_ORIGINS` thiếu origin admin ở topology mode → throw).
3. `require-admin.ts` + gắn vào router phase 3; sửa `bootstrapMiddleware` và student guard.
4. Cập nhật `topology-drift.test.mjs`; chạy lại.
5. Tài khoản admin đầu tiên: người vận hành đặt `ADMIN_EMAILS`, đăng ký trên admin origin (Google khuyến nghị vì email đã verify). Ghi quy trình vào runbook ở phase 7.

## Validation

```bash
pnpm --filter @teacher-os/auth test        # role + hooks
pnpm --filter server exec vitest run src/role-gates.test.ts src/lib/require-admin.test.ts
node --test scripts/topology-drift.test.mjs
pnpm --filter @teacher-os/infra test
pnpm check-types
```

Pass khi: ma trận role × app (3×3) đều đúng kỳ vọng; admin gọi kernel route nhận 403 và **không** có row `organization`/`membership` mới; sign-up admin origin với email ngoài allowlist trả 403 và không có row `user`.

## Risks / Rollback

- Rủi ro: quên một nhánh `role` union làm `student` hoặc `teacher` hồi quy → test ma trận 3×3 là gate.
- Rollback: thay đổi chỉ cộng thêm; không có migration ở phase này. Revert commit là đủ.
