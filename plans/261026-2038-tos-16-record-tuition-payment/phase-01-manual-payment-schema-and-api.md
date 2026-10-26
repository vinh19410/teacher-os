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
- `packages/api/src/contracts.ts` — `invoicePaymentCreateSchema` (`clientRequestId` uuid, `amount` int > 0, `method` enum, `note` trim ≤ 255, strict); mở rộng `InvoiceTransactionItem` của `/invoices/:id/transactions` thêm `method` **dưới dạng nhãn hiển thị** ("Tiền mặt"/"Chuyển khoản"/"Khác" cho dòng manual, `""` cho dòng bank) — không expose `provider` enum, giữ nguyên bất biến #345 "display fields only".
- `apps/server/src/routes/kernel.ts` — `kernel.post("/invoices/:id/payments")`; `/invoices/:id/transactions` trả thêm `method` (nhãn hiển thị).
- `apps/server/src/lib/payments/` — helper `recordManualPayment(db, { orgId, invoiceId, userId, clientRequestId, amount, method, note })`: insert `INSERT … SELECT … WHERE invoice.status <> 'paid' AND amount ≤ invoice.amount − (SELECT SUM … WHERE invoice_id AND match_status = 'matched')` (đúng fragment `LEDGER_SUM` của `recompute-invoice.ts`), `recomputeInvoiceStatement` (vô điều kiện, với `methodHint` theo D8) trong cùng `db.batch`; sau batch đọc row count để phân loại 422.
- Test: `apps/server/src/payment-transactions.test.ts` (file thật nằm ở src root) hoặc file mới `apps/server/src/lib/payments/manual-payment.test.ts` cạnh helper.

## Luồng

1. `readBody(c, invoicePaymentCreateSchema)` → 400 nếu sai shape.
2. Đọc hóa đơn theo `(id, orgId)` → 404 `invoice not found`.
3. Batch: insert có điều kiện `status <> 'paid'` + `amount ≤ invoice.amount − matched_ledger_sum` (chốt cả race manual-vs-manual lẫn manual-vs-`mark-paid` ở cùng statement); `recomputeInvoiceStatement` chạy vô điều kiện kế tiếp trong batch (idempotent).
4. Sau batch đọc kết quả bằng `.returning({ id })` trên INSERT…SELECT (không đọc row count — D1 `meta.changes` khác libsql `rowsAffected`; SELECT luôn có WHERE để tránh parse mơ hồ INSERT…SELECT…ON CONFLICT): mảng rỗng → tra `(provider='manual', providerTxnId, orgId, invoiceId, amount)`: khớp đủ → 200 phiếu cũ; trùng key khác hóa đơn/số tiền → 409 trống; không trùng → đọc lại invoice: `status = paid` → 422 `invoice-settled`; ngược lại 422 `amount-exceeds-debt` kèm `remaining` hiện tại. Ngược lại 201 `{ id, paidAmount, remaining, status }`. Lỗi UNIQUE không được bật 500: dùng `onConflictDoNothing` (hoặc bắt `isRollbackableConstraintError` như `holidays.ts`).

## Tasks & Steps

1. Test đỏ:
   - 4.500.000 thu 2.000.000 → `paid_amount` 2.000.000, `status unpaid`; thu 2.500.000 (Tiền mặt) → `paid_amount` 4.500.000, `status paid`, `invoice.method = "Tiền mặt"` (D8); thu đủ bằng chuyển khoản QR → `invoice.method = "Chuyển khoản"` (hành vi cũ giữ).
   - Dòng ledger có `provider manual`, `matchStatus matched`, `method`, `recordedBy`, `content` = ghi chú, `raw` rỗng, `transactionDate` format `yyyy-mm-dd HH:mm:ss`.
   - Gửi lại cùng `clientRequestId` trên cùng hóa đơn + số tiền → không có dòng mới, response 200 phiếu cũ; cùng key nhưng khác hóa đơn hoặc khác số tiền → 409 trống (không payload).
   - Vượt nợ → 422 `amount-exceeds-debt` kèm `remaining`, không có dòng mới; hóa đơn `paid` → 422 `invoice-settled`; org khác → 404; amount 0 / âm / thập phân / thiếu `clientRequestId` → 400.
   - Hai request song song (Promise.all) 3.000.000 + 3.000.000 trên nợ 4.500.000 → đúng 1 thành công.
   - Tuần tự tất định: `mark-paid` trước, rồi ghi phiếu thu → 422 `invoice-settled`, không có dòng manual (guard trong batch chốt; KHÔNG test bằng Promise.all vì libsql chạy tuần tự).
   - Fixture có dòng `unmatched` reason `invoice_paid` gắn `invoiceId` → guard KHÔNG tính dòng đó vào ledger_sum.
   - `/invoices/:id/transactions` trả cả dòng manual kèm `method`.
   - Hồi quy: test bank-hub webhook + đối soát không đổi kết quả (recompute callers cũ không truyền `methodHint`).
2. Sinh migration (rebase develop trước khi generate, reconcile `_journal.json`), viết code cho xanh.

## Verification

- `pnpm --filter server test -- payment manual bank-hub kernel`
- `pnpm --filter @teacher-os/db test` (nếu có test schema)
- `pnpm check`, `pnpm check-types`
