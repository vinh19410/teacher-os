---
phase: 3
title: "Bắt buộc emailVerified cho TEACHER_EMAILS và áp role gate canAccessFinance cho /api/leads"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 3: Bắt buộc `emailVerified` cho `TEACHER_EMAILS` và áp role gate `canAccessFinance` cho `/api/leads`

## Goal

1. Chặn tài khoản có email nằm trong `TEACHER_EMAILS` nhưng chưa xác thực email (`session.emailVerified !== true`) tại `bootstrapMiddleware` (`apps/server/src/app.ts`) với mã lỗi riêng `ACCOUNT_TEACHER_EMAIL_UNVERIFIED`, chặn đăng ký email thuộc `TEACHER_EMAILS` từ cổng khác `teacher` (`packages/auth/src/index.ts`), và cung cấp nút gửi lại email xác thực + nút tải lại trang trên `AccountBlockedView` (`apps/web/src/components/account-blocked-view.tsx`).
2. Áp role gate `canAccessFinance(ctx.role)` cho `GET/PATCH /api/leads` (`apps/server/src/routes/leads.ts`), lọc người nhận email lead mới trong `apps/server/src/lib/lead-notify.ts` theo `canAccessFinance(membership.role)`, chặn JSON hỏng trả 400 ở `PATCH /api/leads/:id`, và ẩn/chặn `/leads` trên Sidebar, ⌘K và route `/leads` của `apps/web` khi `viewer.canAccessFinance === false`.

## Files to Create / Modify

- Modify: `packages/api/src/contracts.ts`
- Modify: `packages/auth/src/index.ts`
- Modify: `packages/auth/src/auth-admin-signup.test.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/role-gates.test.ts`
- Modify: `apps/server/src/routes/leads.ts`
- Modify: `apps/server/src/routes/leads.test.ts`
- Modify: `apps/server/src/lib/lead-notify.ts`
- Modify: `apps/server/src/routes/public-leads.test.ts`
- Modify: `apps/web/src/lib/role-block.ts`
- Modify: `apps/web/src/lib/role-block.test.ts`
- Modify: `apps/web/src/lib/query-client.ts`
- Modify: `apps/web/src/lib/repos/kernel.ts`
- Modify: `apps/web/src/lib/repos/kernel.transport.test.ts`
- Modify: `apps/web/src/components/account-blocked-view.tsx`
- Create: `apps/web/src/components/account-blocked-view.test.tsx`
- Modify: `apps/web/src/components/layout/sidebar.tsx`
- Modify: `apps/web/src/components/layout/sidebar.test.tsx`
- Modify: `apps/web/src/components/command-search/search-index.test.ts`
- Modify: `apps/web/src/routes/_auth/leads/index.tsx`
- Modify: `apps/web/src/routes/_auth/leads/index.test.tsx`

## Tasks & Steps

### Task 3.1 — Thêm mã `TEACHER_EMAIL_UNVERIFIED`, chặn role-poisoning trong `packages/auth`, và bắt buộc `session.emailVerified === true` trong `bootstrapMiddleware` (TDD Red → Green)

- **Goal:** Khi `teacherEmails` khác rỗng: (a) email thuộc `teacherEmails` không thể bị đăng ký từ cổng học viên/admin để làm nhiễm `role = "student"`, (b) tài khoản có email thuộc allowlist nhưng `emailVerified !== true` bị chặn 403 `ACCOUNT_TEACHER_EMAIL_UNVERIFIED` (không tạo org/membership), và (c) tài khoản đã verify (`email_verified = 1` hoặc `AUTH_ASSUME_EMAIL_VERIFIED=true`) được vào bình thường. <!-- Updated: Red Team RT-3, RT-4 -->
- **Target files and symbols:**
  - `packages/api/src/contracts.ts` (`ACCOUNT_ERROR_CODES.TEACHER_EMAIL_UNVERIFIED`)
  - `packages/auth/src/index.ts` (`databaseHooks.user.create.before`)
  - `packages/auth/src/auth-admin-signup.test.ts`
  - `apps/server/src/app.ts` (`bootstrapMiddleware`)
  - `apps/server/src/role-gates.test.ts`
- **Steps:**
  1. Trong `packages/api/src/contracts.ts`, thêm `TEACHER_EMAIL_UNVERIFIED: "ACCOUNT_TEACHER_EMAIL_UNVERIFIED"` vào `ACCOUNT_ERROR_CODES`.
  2. Trong `packages/auth/src/index.ts` (`databaseHooks.user.create.before`), ngoài kiểm tra `appRole === "teacher"` với `input.teacherEmails`, chặn luôn trường hợp `appRole !== "teacher"` nhưng `email` nằm trong `input.teacherEmails` (ném `APIError("FORBIDDEN", { message: "Email này thuộc tài khoản giáo viên. Vui lòng đăng nhập tại ứng dụng giáo viên.", code: "TEACHER_SIGNUP_FORBIDDEN" })`) để ngăn kẻ tấn công đăng ký email giáo viên trên cổng student nhằm khóa tài khoản. Thêm unit test tương ứng trong `packages/auth/src/auth-admin-signup.test.ts`. <!-- Updated: Red Team RT-4 -->
  3. Trong `apps/server/src/role-gates.test.ts`:
     - Thêm helper `setEmailVerified(token: string, verified: boolean)` chạy `UPDATE user SET email_verified = ? WHERE id IN (SELECT user_id FROM session WHERE token = ?)` với `args: [verified ? 1 : 0, dbToken(token)]`. <!-- Updated: Validation & Red Team RT-3 -->
     - Thêm test `"teacherEmails allowlist: session thuộc allowlist nhưng chưa verify email → 403 ACCOUNT_TEACHER_EMAIL_UNVERIFIED, không tạo org/membership (#524)"`.
     - Cập nhật test `"teacherEmails allowlist: session OWNER@x.vn (khác hoa/thường) → 200"` để gọi `await setEmailVerified(ownerToken, true)` sau khi verify rằng lúc `email_verified = 0` bị 403 `ACCOUNT_TEACHER_EMAIL_UNVERIFIED`.
  4. Chạy `pnpm --filter @teacher-os/auth test && pnpm --filter server test -- role-gates.test.ts` để xác nhận Red phase.
  5. Trong `apps/server/src/app.ts` (`bootstrapMiddleware`, dòng 234-248), sau khi kiểm tra `!email || !allow` (trả 403 `ACCOUNT_ERROR_CODES.TEACHER_NOT_ALLOWED`), thêm kiểm tra:
     ```ts
     if (session.emailVerified !== true) {
       return c.json(
         {
           error: ACCOUNT_ERROR_CODES.TEACHER_EMAIL_UNVERIFIED,
           code: ACCOUNT_ERROR_CODES.TEACHER_EMAIL_UNVERIFIED,
         },
         403,
       );
     }
     ```
- **Success criteria:** `packages/auth` tests và `role-gates.test.ts` pass toàn bộ test cũ và mới.
- **Verify:** `pnpm --filter @teacher-os/auth test && pnpm --filter server test -- role-gates.test.ts` exits 0.

### Task 3.2 — Hỗ trợ gửi lại email xác thực trên `AccountBlockedView` khi bị chặn bởi `ACCOUNT_TEACHER_EMAIL_UNVERIFIED`

- **Goal:** Giáo viên hợp lệ trong allowlist đăng ký bằng email/password nhưng chưa xác thực email sẽ thấy hướng dẫn kiểm tra hộp thư, nút `"Gửi lại email xác thực"` (có kiểm tra `res.error` và `EMAIL_ALREADY_VERIFIED`) và nút `"Tôi đã xác thực — Kiểm tra lại"` ngay trên màn hình blocked (trong khi vẫn giữ tiêu đề `"Đây là tài khoản học viên"` để không phá E2E `account-role-separation.spec.ts`). <!-- Updated: Red Team RT-3 -->
- **Target files and symbols:**
  - `apps/web/src/lib/repos/kernel.ts` (`isStudentRoleRejected(error: unknown): error is HttpError`, `KernelCommandBusDeps.onRoleBlocked`)
  - `apps/web/src/lib/role-block.ts` (`markRoleBlocked(reason?: string)`, `getRoleBlockReason()`, `resetRoleBlockedForTest()`)
  - `apps/web/src/lib/query-client.ts` (`QueryCache.onError`)
  - `apps/web/src/components/account-blocked-view.tsx` (`AccountBlockedView`)
  - `apps/web/src/components/account-blocked-view.test.tsx`
  - `apps/web/src/lib/repos/kernel.transport.test.ts`, `apps/web/src/lib/role-block.test.ts`
- **Steps:**
  1. Trong `apps/web/src/lib/repos/kernel.ts`:
     - Đổi chữ ký `export function isStudentRoleRejected(error: unknown): error is HttpError` và chấp nhận thêm `error.reason === ACCOUNT_ERROR_CODES.TEACHER_EMAIL_UNVERIFIED`.
     - Đổi `KernelCommandBusDeps.onRoleBlocked?(reason?: string): void` và truyền `error.reason` vào cả 3 vị trí gọi `deps.onRoleBlocked?.(error.reason)` trong `createKernelCommandBus`. <!-- Updated: Validation & Red Team RT-3 -->
  2. Trong `apps/web/src/lib/role-block.ts`, lưu thêm `blockReason: string | undefined` khi gọi `markRoleBlocked(reason?: string)`, export `getRoleBlockReason(): string | undefined`, và export `resetRoleBlockedForTest(): void` (reset `blocked = false`, `blockReason = undefined`, `listeners.clear()`). Cập nhật `apps/web/src/lib/query-client.ts` truyền `error.reason` vào `markRoleBlocked(error.reason)`. <!-- Updated: Red Team RT-3 -->
  3. Trong `apps/web/src/components/account-blocked-view.tsx`:
     - Đọc `const { data: session } = authClient.useSession();` và `const blockReason = getRoleBlockReason();`.
     - Hiển thị khối xác thực email khi `blockReason === ACCOUNT_ERROR_CODES.TEACHER_EMAIL_UNVERIFIED` và có `userEmail = session?.user?.email`.
     - Giữ nguyên `<h2 ...>Đây là tài khoản học viên</h2>` (invariant cho E2E `account-role-separation.spec.ts:140`).
     - Khi ở trạng thái cần xác thực email: hiển thị hướng dẫn mở liên kết xác thực trong hộp thư, nút `"Gửi lại email xác thực"` gọi `authClient.sendVerificationEmail({ email: userEmail, callbackURL: \`${window.location.origin}/verify-email?verified=ok\` })` (kiểm tra `if (res.error)`: nếu mã/message chứa `EMAIL_ALREADY_VERIFIED` thì gọi `window.location.reload()`, ngược lại hiện thông báo lỗi và đưa trạng thái về `"idle"`), cùng nút `"Tôi đã xác thực — Kiểm tra lại"` gọi `window.location.reload()`. <!-- Updated: Red Team RT-3 -->
  4. Thêm unit test trong `apps/web/src/lib/repos/kernel.transport.test.ts`, `apps/web/src/lib/role-block.test.ts` (gọi `resetRoleBlockedForTest()` trong `beforeEach`), và tạo `apps/web/src/components/account-blocked-view.test.tsx` kiểm tra hiển thị nút gửi lại, xử lý `res.error` và giữ nguyên heading `"Đây là tài khoản học viên"`. <!-- Updated: Red Team RT-3 -->
- **Success criteria:** Các test trong `kernel.transport.test.ts`, `role-block.test.ts`, và `account-blocked-view.test.tsx` đều pass.
- **Verify:** `pnpm --filter web test -- kernel.transport.test.ts role-block.test.ts account-blocked-view.test.tsx` exits 0.

### Task 3.3 — Áp role gate `canAccessFinance` cho `/api/leads`, lọc `notifyNewLead`, và trả 400 khi JSON hỏng tại `PATCH /api/leads/:id`

- **Goal:** Chặn `ta` và `class_teacher` đọc/sửa PII lead trên `/api/leads` hoặc nhận email thông báo lead mới; trả 400 thay vì 500 khi `PATCH /api/leads/:id` nhận JSON hỏng.
- **Target files and symbols:**
  - `apps/server/src/routes/leads.ts` (`leadRoutes`)
  - `apps/server/src/lib/lead-notify.ts` (`notifyNewLead`)
  - `apps/server/src/routes/leads.test.ts`
  - `apps/server/src/routes/public-leads.test.ts`
- **Steps:**
  1. Trong `apps/server/src/routes/leads.test.ts`, thêm các test (Red phase):
     - `ta` và `class_teacher` gọi `GET /api/leads` và `PATCH /api/leads/:id` đều nhận `403` với `{ error: "leads-forbidden", code: "leads-forbidden" }`.
     - `owner` và `admin` (cùng `teacher`) gọi `GET /api/leads` và `PATCH /api/leads/:id` nhận `200`.
     - `PATCH /api/leads/lead-1` với body chuỗi JSON hỏng `"{bad-json"` trả `400` `{ error: "invalid body" }` thay vì `500`.
  2. Trong `apps/server/src/routes/public-leads.test.ts`, thêm test: org có thêm thành viên `ta` và `class_teacher` thì khi tạo lead mới, `notifyNewLead` chỉ gửi email cho thành viên có quyền tài chính (`teacher`/`owner`/`admin`), không gửi cho `ta` hay `class_teacher`.
  3. Chạy test để xác nhận Red phase.
  4. Trong `apps/server/src/routes/leads.ts`:
     - Cập nhật JSDoc dòng 17-22 ghi rõ router gắn middleware `canAccessFinance(ctx.role)` (chỉ `teacher`, `owner`, `admin` được xem/sửa PII của lead; `ta` và `class_teacher` bị 403 `leads-forbidden`).
     - Thêm middleware `routes.use("*", ...)` kiểm tra nghiêm ngặt `if (!ctx) return c.json({ error: "unauthorized" }, 401);` và `if (!canAccessFinance(ctx.role)) return c.json({ error: "leads-forbidden", code: "leads-forbidden" }, 403);` (y hệt `placement-test.ts:125`, không mở ngoại lệ cho `undefined`). <!-- Updated: Red Team RT-6 -->
     - Tại `routes.patch("/:id", ...)`, bọc `await c.req.raw.json()` trong `try / catch`, trả `c.json({ error: "invalid body" }, 400)` khi JSON không parse được.
  5. Trong `apps/server/src/lib/lead-notify.ts`:
     - Select thêm `role: membership.role` trong truy vấn `membership` join `user`.
     - Chỉ giữ các dòng có `canAccessFinance(row.role)` trước khi lấy danh sách `recipients`.
- **Success criteria:** `leads.test.ts` và `public-leads.test.ts` pass 100%.
- **Verify:** `pnpm --filter server test -- leads.test.ts public-leads.test.ts` exits 0.

### Task 3.4 — Ẩn mục `leads` trên Sidebar & ⌘K và gắn `useFinanceRouteGuard` cho màn `/leads` trên `apps/web`

- **Goal:** Thành viên có `viewer.canAccessFinance === false` (`ta`, `class_teacher`) không thấy mục `"Đăng ký mới"` trên Sidebar / ⌘K và nếu truy cập thẳng URL `/leads` sẽ được điều hướng về `/dashboard` kèm toast, render `null` và không gọi `/api/leads`.
- **Target files and symbols:**
  - `apps/web/src/components/layout/sidebar.tsx` (`FINANCE_NAV_KEY_MAP`)
  - `apps/web/src/components/layout/sidebar.test.tsx`
  - `apps/web/src/components/command-search/search-index.test.ts`
  - `apps/web/src/routes/_auth/leads/index.tsx` (`LeadsRoute`)
  - `apps/web/src/routes/_auth/leads/index.test.tsx`
- **Steps:**
  1. Trong `apps/web/src/components/layout/sidebar.tsx`, thêm `leads: true` vào `FINANCE_NAV_KEY_MAP` và cập nhật comment JSDoc của `teacherNavForViewer`.
  2. Cập nhật `apps/web/src/components/layout/sidebar.test.tsx` và `apps/web/src/components/command-search/search-index.test.ts` để assert `"leads"` / `"Đăng ký mới"` có mặt khi `canAccessFinance = true` và bị ẩn khi `canAccessFinance = false`.
  3. Trong `apps/web/src/routes/_auth/leads/index.tsx`:
     - Gọi `const canAccessFinance = useFinanceRouteGuard();` ở đầu `LeadsRoute`.
     - Truyền `enabled: canAccessFinance` vào `useQuery({ ...leadsQueryOptions(queryParams), enabled: canAccessFinance })`.
     - Đặt `if (!canAccessFinance) return null;` **ngay sau các hook `useEffect` (trước `if (isPending)` tại dòng 254)** để khi `enabled: false` (`isPending === true`), component trả `null` thay vì thẻ `"Đang tải danh sách đăng ký…"`. Đồng thời xử lý `status === 401` (`reauth()`) trong `patchMutation.onError`. <!-- Updated: Validation & Red Team RT-2 -->
  4. Trong `apps/web/src/routes/_auth/leads/index.test.tsx`:
     - Mock `@/lib/use-finance-route-guard` với biến điều khiển `let canAccessFinanceMock = true` (mặc định `true` trong `beforeEach`).
     - Thêm test `"ẩn màn /leads (container rỗng) và không gọi /api/leads khi canAccessFinance = false (#524)"`.
- **Success criteria:** Toàn bộ test của `sidebar.test.tsx`, `search-index.test.ts` và `leads/index.test.tsx` đều pass.
- **Verify:** `pnpm --filter web test -- sidebar.test.tsx search-index.test.ts leads/index.test.tsx` exits 0.

### Task 3.5 — Chạy toàn bộ quality gates của repo

- **Goal:** Xác nhận không có lỗi lint, format, typecheck, unit test hay build trên toàn monorepo.
- **Target files and symbols:** Toàn bộ workspace.
- **Steps:**
  1. Chạy `pnpm exec biome check .` (nếu cần format thì chạy `pnpm check:fix` rồi kiểm lại bằng `pnpm exec biome check .`).
  2. Chạy `pnpm check-types`.
  3. Chạy `pnpm test`.
  4. Chạy `pnpm build`.
- **Success criteria:** Cả 4 lệnh đều exit 0.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm test && pnpm build` exits 0.

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
