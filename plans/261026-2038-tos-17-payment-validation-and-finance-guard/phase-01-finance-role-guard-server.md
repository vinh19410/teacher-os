---
phase: 1
title: "canAccessFinance, role trong kernelCtx, middleware 403, snapshot viewer"
status: pending
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: Guard phía server

## Files to Modify

- `packages/auth/src/role.ts` + `role.test.ts` — `FINANCE_ROLES`, `canAccessFinance(role)`; comment vocabulary 4 vai trò (FR-029).
- `apps/server/src/app.ts` — `KernelCtx` thêm `role`; middleware gán `first.role`.
- `apps/server/src/lib/require-finance-role.ts` + `.test.ts` — middleware Hono, 403 `finance-forbidden`.
- `apps/server/src/routes/kernel.ts` — `kernel.use("/invoices/*", requireFinanceRole)` và `kernel.use("/invoices", …)` cho route tạo hóa đơn.
- `apps/server/src/routes/payment-transactions.ts`, `apps/server/src/routes/bank-link.ts` — gắn middleware.
- `apps/server/src/routes/snapshot.ts` + kiểu `KernelSnapshot` trong `packages/api/src/contracts.ts` — `viewer: { role, canAccessFinance }`; `invoices: []` khi không có quyền.

## Tasks & Steps

1. Test đỏ:
   - `canAccessFinance`: `teacher`/`owner`/`admin` → true; `ta`/`class_teacher`/`""`/`"xyz"` → false.
   - Seed membership role `ta` và `class_teacher`: mọi route invoice/payment/bank-link (liệt kê đủ) → 403; snapshot `invoices.length === 0`, `viewer.canAccessFinance === false`.
   - Role `teacher` mặc định: các route trên giữ status cũ (200/201/404); snapshot có `viewer.canAccessFinance === true`.
   - Public `/pay/:token` và webhook bank-hub **không** bị guard (không có kernelCtx).
2. Viết code cho xanh.

## Verification

- `pnpm --filter server test -- finance kernel payment snapshot bank`
- `pnpm --filter @teacher-os/auth test -- role`
- `pnpm check`, `pnpm check-types`
