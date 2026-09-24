---
title: "Phase 3: Gate role ở API — bootstrap teacher-app và bridge student portal"
status: pending
priority: P1
effort: "3h"
dependencies: [1, 2]
---

# Phase 3: Gate role ở API — bootstrap teacher-app và bridge student portal

## Goal

Server từ chối ở tầng API mọi request dùng session sai loại app: user role `student` gõ vào teacher app nhận 403 `ACCOUNT_STUDENT_ROLE` và **không bao giờ** được bootstrap org/membership; user role `teacher` mở portal nhận 403 `ACCOUNT_TEACHER_ROLE` và **không bao giờ** được provision student row.

## Context Links

- Phase 1 (cột `user.role`) + Phase 2 (role gán lúc signup, session rejection lúc login)
- `apps/server/src/app.ts:44-90` — `bootstrapMiddleware` hiện cấp membership `teacher` cho mọi user
- `apps/server/src/routes/student.ts:43-141` — `requireStudent` bridge (match email + provision)
- `apps/server/src/session.ts:18-32` — `getSessionUser` seam

## Key Insights

- Chặn ở **login form thôi là chưa đủ**: cookie session dùng chung cross-subdomain (`Domain=.<domain>`, `SameSite=None` — `packages/infra/src/topology.ts:96`) nên học viên login portal xong mở `app.<domain>` là **có sẵn session hợp lệ**, không cần đăng nhập lại. Bắt buộc phải có gate ở middleware API của từng phía.
- `bootstrapMiddleware` skip sẵn `/api/auth/*` và `/api/student*` (`app.ts:50-56`) → gate student-role đặt ngay sau `getSessionUser` trong middleware này, trước nhánh "0 membership → tạo org".
- `requireStudent` cần gate role **trước** bước match/provision email để teacher-role không bao giờ chạm `provisionStudentForUser`.
- `SessionUser` không có role — bổ sung từ `auth.api.getSession()` (better-auth `user.additionalFields` từ Phase 2 đưa `role` vào `session.user`); NULL/undefined quy về `"teacher"` qua helper dùng chung (phòng thủ, sau Phase 1 không còn row NULL).

## Requirements

- Helper thuần trong `packages/auth/src/role.ts` (đồng locus với classifier của Phase 2):
  ```ts
  export type AppRole = "teacher" | "student";
  export function resolveUserRole(role: string | null | undefined): AppRole {
    return role === "student" ? "student" : "teacher";
  }
  ```
- Mã lỗi mới trong `packages/api/src/contracts.ts` (cạnh `STUDENT_ERROR_CODES`):
  ```ts
  export const ACCOUNT_ERROR_CODES = {
    STUDENT_ON_TEACHER_APP: "ACCOUNT_STUDENT_ROLE",
    TEACHER_ON_STUDENT_PORTAL: "ACCOUNT_TEACHER_ROLE",
  } as const;
  ```
- 403 body mirror style hiện hành (kernel dùng `{ error: ... }`; bridge dùng `{ error, code }`).

## Files to Create / Modify

- Create: `packages/auth/src/role.ts` — `AppRole`, `resolveUserRole` (đã có từ Phase 2).
- Modify: `apps/server/src/session.ts` — `SessionUser` thêm `role: AppRole`; `getSessionUser` map qua `resolveUserRole`.
- Modify: `apps/server/src/app.ts` — `bootstrapMiddleware` gate student-role.
- Modify: `apps/server/src/routes/student.ts` — `requireStudent` gate teacher-role.
- Modify: `packages/api/src/contracts.ts` — `ACCOUNT_ERROR_CODES`.
- Modify: `apps/server/src/student.test.ts` — DB seed user portal ghi `role: "student"` VÀ stub `getSessionUser` trả `role` theo user seed (file có ~7 object `SessionUser` inline tại 179-240 — mỗi case role tương ứng).
- Modify: `apps/server/src/kernel.test.ts` (68-83), `apps/server/src/kernel-occurrence.test.ts` (37-52), `apps/server/src/lesson-date-integration.test.ts` (31-46) — stub `getSessionUser` bổ sung `role: "teacher"` cho khớp `SessionUser` mới (Red-team High #6: thiếu 1 file nào là `pnpm check-types` đỏ).
- Create: `apps/server/src/role-gates.test.ts` — test gate 2 phía qua `buildApp(deps)`.

## Implementation Steps

1. Tạo `packages/auth/src/role.ts` với `AppRole` + `resolveUserRole`.
2. Sửa `session.ts`: `SessionUser` thêm `role`; map `resolveUserRole(session.user.role)`.
3. Sửa `bootstrapMiddleware` (`app.ts`): sau `const session = await deps.getSessionUser(...)` và check null, thêm:
   ```ts
   if (session.role === "student") {
     return c.json(
       { error: ACCOUNT_ERROR_CODES.STUDENT_ON_TEACHER_APP },
       403,
     );
   }
   ```
   (import từ `@teacher-os/api/contracts`).
4. Sửa `requireStudent` (`routes/student.ts`): ngay sau 401 check:
   ```ts
   if (session.role !== "student") {
     return c.json(
       {
         error: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
         code: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
       },
       403,
     );
   }
   ```
5. Sửa seed/stub test: `student.test.ts` (DB seed `role: "student"` + stub getSessionUser trả role theo seed); 3 stub teacher trong `kernel.test.ts`/`kernel-occurrence.test.ts`/`lesson-date-integration.test.ts` thêm `role: "teacher"`.
6. Viết `role-gates.test.ts` (libsql in-memory + migrations thật + better-auth thật; **seed session row TRỰC TIẾP qua drizzle** theo pattern `kernel.test.ts:99-104` `insert(authSession).values({ token, ... })` — KHÔNG tạo session qua API sign-in, vì session hook Phase 2 sẽ chặn đúng kịch bản đang muốn mô phỏng; request mang header cookie với token đã seed):
   - User role `student` (seed trực tiếp) + session seeded gọi 1 route kernel đại diện → 403 `ACCOUNT_STUDENT_ROLE`; assert DB **không** có organization/membership mới.
   - User role `teacher` chưa có membership gọi route kernel → vẫn được bootstrap (regression hành vi hiện hành).
   - User role `teacher` (đã có membership) + session seeded gọi `/api/student/me` → 403 `ACCOUNT_TEACHER_ROLE`; assert **không** sinh student row.
   - User role NULL (insert tay không role) + session seeded gọi `/api/student/me` → 403 `ACCOUNT_TEACHER_ROLE` (chứng minh NULL ≡ teacher).
7. Bước hậu deploy (runbook, operator): `SELECT count(*) FROM user WHERE role IS NULL;` phải = 0 trên prod; nếu > 0 (sign-up rơi vào cửa sổ deploy) → chạy `UPDATE user SET role='student' WHERE role IS NULL;` (default 'student' của cột đã giảm khả năng này về 0).
8. `pnpm check`, `pnpm check-types`, `pnpm test` toàn workspace xanh.

> **Ràng buộc release:** Phase 1 + 2 + 3 phải ship trong MỘT release (một PR, deploy một lần) — xem plan.md "Sequencing".

## Todo

- [ ] `SessionUser.role` + map trong `getSessionUser`
- [ ] Gate student-role trong `bootstrapMiddleware` (không bootstrap)
- [ ] Gate teacher-role trong `requireStudent` (trước provisioning)
- [ ] `ACCOUNT_ERROR_CODES` trong contracts
- [ ] Sửa seed/stub test portal + 3 stub teacher
- [ ] `role-gates.test.ts` 4 case (seed session trực tiếp)
- [ ] Runbook post-deploy NULL check
- [ ] Suite toàn workspace xanh

## Success Criteria

- Student-role tuyệt đối không tạo được org/membership qua teacher API; teacher-role tuyệt đối không tạo được student row qua portal API.
- Không regression cho luồng teacher hiện hành (bootstrap, snapshot) và portal hiện hành (student-role đi qua bridge như cũ).
- 403 body dùng mã contract mới, có test khẳng định shape.
- Sau deploy prod: `SELECT count(*) FROM user WHERE role IS NULL` = 0.

## Risk Assessment

- **Sót stub `SessionUser` không có `role`** → `pnpm check-types` đỏ ngay (danh sách 4 file test đã liệt kê đầy đủ, Red-team đã enumerate); nếu implementer "vá nhanh" bằng `role?` optional thì gate với stub cũ sẽ cho qua hết — cấm optional, giữ field bắt buộc.
- **`session.user.role` không về tới `getSessionUser`** (additionalFields cấu hình sai ở Phase 2): `resolveUserRole` NULL → teacher nghĩa là teacher app mở cửa hoàn toàn và portal chặn hết — test roundtrip Phase 2 assert `role` có mặt trong `getSession()` để bắt sớm.
- **Seed session trực tiếp lệch contract** (token/cookie name): pattern có sẵn `kernel.test.ts:99-104`; nếu cookie prefix staging thay đổi, test đọc prefix từ helper có sẵn của boot/test seam.

## Security Considerations

- Gate đặt ở middleware API (không chỉ UI) — đây là ranh giới bảo mật thật của plan.
- 403 body chỉ chứa mã, không lộ chi tiết role/user cho client xấu.
