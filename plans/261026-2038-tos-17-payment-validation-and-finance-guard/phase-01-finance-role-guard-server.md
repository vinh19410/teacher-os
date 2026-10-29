---
phase: 1
title: "canAccessFinance, role trong kernelCtx, middleware 403, snapshot viewer"
status: completed
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: Guard phía server

## Files to Modify

- `packages/auth/src/role.ts` + `packages/auth/src/role.test.ts` — `FINANCE_ROLES`, `canAccessFinance(role)`; comment vocabulary 4 vai trò (FR-029).
- `packages/api/src/contracts.ts` — `KernelViewer` (`{ role: string; canAccessFinance: boolean }`), thêm `viewer?: KernelViewer` vào `KernelSnapshot`.
- `apps/server/src/app.ts` — `KernelCtx` thêm `role: string`; middleware `bootstrapMiddleware` gán `role: first.role`.
- `apps/server/src/lib/require-finance-role.ts` + `apps/server/src/lib/require-finance-role.test.ts` — middleware Hono `requireFinanceRole`, trả `403 { error: "finance-forbidden" }` khi `!canAccessFinance(ctx.role)`.
- `apps/server/src/routes/kernel.ts` — `kernel.use("/invoices", requireFinanceRole)`, `kernel.use("/invoices/*", requireFinanceRole)`, truyền `{ role: ctx.role }` vào `loadSnapshot` ở `GET /api/kernel`.
- `apps/server/src/routes/payment-transactions.ts`, `apps/server/src/routes/bank-link.ts` — gắn `router.use("*", requireFinanceRole)`.
- `apps/server/src/routes/dashboard-reminders.ts` — `resolveReminderScope(role)` trả `{ kind: "org", finance: canAccessFinance(role) }` (ẩn `tuition` khỏi `/api/dashboard/reminders` khi không có quyền tài chính).
- `apps/server/src/routes/snapshot.ts` — `loadSnapshot(db, orgId, opts?: { role?: string })` trả `viewer: { role, canAccessFinance }`; chỉ gọi `loadInvoices` khi `canAccessFinance(role)`, ngược lại trả `invoices: []`.

## Tasks & Steps

### Task 1.1 — Định nghĩa `FINANCE_ROLES` và `canAccessFinance(role)` trong `@teacher-os/auth`
- **Goal:** Hàm `canAccessFinance(role)` trả `true` cho `"teacher" | "owner" | "admin"` và `false` cho `"ta" | "class_teacher"` hoặc mọi chuỗi lạ / rỗng / null / undefined.
- **Target files and symbols:** `packages/auth/src/role.ts` (`FINANCE_ROLES`, `OrgMemberRole`, `canAccessFinance`), `packages/auth/src/role.test.ts`.
- **Steps:**
  1. Viết test đỏ trong `packages/auth/src/role.test.ts` kiểm tra `canAccessFinance` với `"teacher"`, `"owner"`, `"admin"` (`true`) và `"ta"`, `"class_teacher"`, `""`, `"student"`, `null`, `undefined`, `"xyz"` (`false`).
  2. Thêm `FINANCE_ROLES = ["teacher", "owner", "admin"] as const` và `export function canAccessFinance(role: string | null | undefined): boolean` vào `packages/auth/src/role.ts` kèm chú thích vocabulary FR-029.
- **Success criteria:** Unit test của `@teacher-os/auth` pass toàn bộ.
- **Verify:** `pnpm --filter @teacher-os/auth test -- role` exits 0.

### Task 1.2 — Mở rộng `KernelSnapshot.viewer`, `KernelCtx.role`, middleware `requireFinanceRole`, và chặn route tài chính + snapshot
- **Goal:** Mọi request từ thành viên có `membership.role` là `"ta"` hoặc `"class_teacher"` tới các route tài chính (`/api/invoices`, `/api/invoices/*`, `/api/payment-transactions/*`, `/api/bank-link/*`) nhận `403 { error: "finance-forbidden" }`; `GET /api/kernel` trả `invoices: []` và `viewer: { role, canAccessFinance: false }`; `GET /api/dashboard/reminders` ẩn trường `tuition`.
- **Target files and symbols:** `packages/api/src/contracts.ts` (`KernelViewer`, `KernelSnapshot`), `apps/server/src/app.ts` (`KernelCtx`, `bootstrapMiddleware`), `apps/server/src/lib/require-finance-role.ts` (`requireFinanceRole`), `apps/server/src/routes/kernel.ts`, `apps/server/src/routes/payment-transactions.ts`, `apps/server/src/routes/bank-link.ts`, `apps/server/src/routes/dashboard-reminders.ts`, `apps/server/src/routes/snapshot.ts`, `apps/server/src/lib/require-finance-role.test.ts`.
- **Steps:**
  1. Thêm `KernelViewer` và `viewer?: KernelViewer` vào `packages/api/src/contracts.ts`.
  2. Thêm `role: string` vào `KernelCtx` trong `apps/server/src/app.ts` (gán `role: first.role` trong `bootstrapMiddleware`).
  3. Tạo `apps/server/src/lib/require-finance-role.ts`: kiểm tra `ctx` (nếu thiếu trả 401 `{ error: "unauthorized" }`), nếu `!canAccessFinance(ctx.role)` trả `403 { error: "finance-forbidden" }`.
  4. Gắn `requireFinanceRole` vào `/invoices` và `/invoices/*` trong `apps/server/src/routes/kernel.ts`, và `router.use("*", requireFinanceRole)` trong `payment-transactions.ts` và `bank-link.ts`.
  5. Cập nhật `loadSnapshot(db, orgId, opts?: { role?: string })` trong `apps/server/src/routes/snapshot.ts`: tính `role = opts?.role ?? "teacher"`, `financeAllowed = canAccessFinance(role)`, nếu `false` thì không truy vấn `loadInvoices` (trả `[]`), và trả `viewer: { role, canAccessFinance: financeAllowed }`. Truyền `{ role: ctx.role }` tại `GET /api/kernel` trong `kernel.ts`.
  6. Cập nhật `apps/server/src/routes/dashboard-reminders.ts` để `resolveReminderScope(ctx.role)` ẩn truy vấn `tuition` khi `!canAccessFinance(ctx.role)`.
  7. Viết bộ test đầy đủ trong `apps/server/src/lib/require-finance-role.test.ts` phủ tất cả route invoice/payment/bank-link/snapshot/dashboard-reminders/public-pay/webhook cho `ta`, `class_teacher`, `teacher`, `owner`, `admin`.
- **Success criteria:** Mọi test trong `apps/server` xanh, không làm gãy public `/public/pay/:token` hay webhook SePay.
- **Verify:** `pnpm --filter server test -- require-finance-role` exits 0.

## Verification

- `pnpm --filter @teacher-os/auth test -- role`
- `pnpm --filter server test -- require-finance-role`
- `pnpm check && pnpm check-types`

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
