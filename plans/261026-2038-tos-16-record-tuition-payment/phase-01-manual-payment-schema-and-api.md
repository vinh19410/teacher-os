---
phase: 1
title: "Migration payment_transaction + contract + POST /api/invoices/:id/payments"
status: pending
priority: P1
effort: "5h"
dependencies: []
---

# Phase 1: Schema và route server

## Files to Modify

- `packages/db/src/schema/payment-transaction.ts` — thêm `method`, `recordedBy`; cập nhật doc comment (dòng `provider = "manual"`).
- `packages/db/src/migrations/<sinh bằng drizzle-kit>.sql` + snapshot meta.
- `packages/api/src/contracts.ts` — `invoicePaymentCreateSchema` (`amount` int > 0, `method` enum, `note` trim ≤ 255, strict); mở rộng kiểu giao dịch trả về của `/invoices/:id/transactions` thêm `method`, `provider`.
- `apps/server/src/routes/kernel.ts` — `kernel.post("/invoices/:id/payments")`; `/invoices/:id/transactions` trả thêm `method`, `provider`.
- `apps/server/src/lib/payments/` — helper `recordManualPayment(db, { orgId, invoiceId, userId, ... })` dựng `INSERT … SELECT … WHERE remaining >= amount` + `recomputeInvoiceStatement` trong một `db.batch`.
- Test: `apps/server/src/routes/payment-transactions.test.ts` hoặc file test mới `manual-payment.test.ts` cạnh helper.

## Luồng

1. `readBody(c, invoicePaymentCreateSchema)` → 400 nếu sai shape.
2. Đọc hóa đơn theo `(id, orgId)` → 404 `invoice not found`.
3. `status = paid` → 422 `invoice-settled`.
4. Batch: insert có điều kiện `amount <= invoice.amount − ledger_sum`; nếu số dòng insert = 0 → 422 `amount-exceeds-debt` + `remaining` (đọc lại), không chạy recompute. Ngược lại `recomputeInvoiceStatement`.
5. Trả 201 `{ id, paidAmount, remaining, status }`.

## Tasks & Steps

1. Test đỏ:
   - 4.500.000 thu 2.000.000 → `paid_amount` 2.000.000, `status unpaid`; thu 2.500.000 → `paid_amount` 4.500.000, `status paid`, `method` hóa đơn = giá trị hiện có của recompute.
   - Dòng ledger có `provider manual`, `matchStatus matched`, `method`, `recordedBy`, `content` = ghi chú, `raw` rỗng.
   - Vượt nợ → 422, không có dòng mới; hóa đơn `paid` → 422; org khác → 404; amount 0 / âm / thập phân → 400.
   - Hai request song song (Promise.all) 3.000.000 + 3.000.000 trên nợ 4.500.000 → đúng 1 thành công.
   - `/invoices/:id/transactions` trả cả dòng manual kèm `method`.
   - Hồi quy: test bank-hub webhook + đối soát không đổi kết quả.
2. Sinh migration, viết code cho xanh.

## Verification

- `pnpm --filter server test -- payment manual bank-hub kernel`
- `pnpm --filter @teacher-os/db test` (nếu có test schema)
- `pnpm check`, `pnpm check-types`
