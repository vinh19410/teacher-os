---
phase: 1
title: "API lịch sử giao dịch theo hóa đơn"
status: completed
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: API lịch sử giao dịch theo hóa đơn

## Goal

Thêm `GET /api/invoices/:id/transactions` trả danh sách giao dịch ngân hàng đã khớp vào một hóa
đơn, org-scoped, chỉ field hiển thị, để trang detail có bảng lịch sử giao dịch.

## Files to Create / Modify

- Modify: `packages/api/src/contracts.ts` — thêm `InvoiceTransactionItem` cạnh `PaymentTransactionItem` (~L2113).
- Modify: `apps/server/src/routes/kernel.ts` — handler mới ngay sau `kernel.get("/invoices/:id/payment")` (~L1479-1487).
- Modify: `apps/server/src/invoice-payment.test.ts` — thêm `describe` cho endpoint mới (dùng harness in-memory sẵn có; nếu file quá dài thì tạo `apps/server/src/invoice-transactions.test.ts` copy harness từ `payment-transactions.test.ts:20-60`).

## Contract

```ts
/** One matched bank transaction on the teacher's invoice detail page. */
export interface InvoiceTransactionItem {
	id: string;
	amount: number;
	/** Transfer memo as typed by the payer. */
	content: string;
	referenceCode: string;
	/** Provider timestamp string, as stored (e.g. "2026-10-05 10:00:00"). */
	transactionDate: string;
	/** ISO 8601 — server ingest time (Drizzle timestamp_ms → Date → toISOString()). */
	createdAt: string;
}
```

## Tasks & Steps

1. Thêm `InvoiceTransactionItem` vào `contracts.ts` với docblock như trên.
2. Trong `kernel.ts`, thêm handler:
   - `ctx` từ `c.get("kernelCtx")`, không có → `unauthorized(c)`.
   - Kiểm tra invoice tồn tại **và** thuộc `ctx.orgId` (`select id from invoice where id = :id and org_id = :org`); không có → `404 { error: "invoice not found" }` (id lạ và id org khác không phân biệt được — cùng convention mark-paid).
   - Query `paymentTransaction` where `orgId = ctx.orgId AND invoiceId = :id AND matchStatus = 'matched'`, `orderBy(desc(createdAt), desc(id))`, `limit(100)` (bound trả về; một hóa đơn thực tế vài giao dịch).
   - Map sang `InvoiceTransactionItem` — **chỉ** các field trong contract; `createdAt: row.createdAt.toISOString()`. Không trả `raw`, `bankAccountXid`, `providerTxnId`, `paymentCode`, `provider`.
   - Annotate `satisfies InvoiceTransactionItem[]`.
3. Import `paymentTransaction` schema + `desc` vào `kernel.ts` nếu chưa có.
4. Server tests (vitest, in-memory libsql + migrations):
   - 401 khi không có session.
   - 403 khi session role `student` — stub `getSessionUser` trả `{ role: "student" }`, assert code
     `STUDENT_ON_TEACHER_APP` (gate bootstrap `app.ts:105-114`; khoá threat model portal-session
     đọc ledger tài chính, tham chiếu e2e `account-role-separation.spec.ts:8-13`).
   - 404 cho id không tồn tại; 404 cho invoice của org khác (seed org thứ hai).
   - Trả đúng giao dịch `matched` của invoice; KHÔNG trả `unmatched`/`ignored`, KHÔNG trả matched của invoice khác.
   - Thứ tự mới nhất trước; `createdAt` là ISO string parse được; payload không có key `raw`/`providerTxnId`/`bankAccountXid`.
   - Invoice không có giao dịch → `[]`.

## Verification

- `pnpm --filter server test -- invoice` (hoặc tên file test mới) xanh.
- `pnpm check-types` xanh (contract dùng được từ web).

## Risks

- Route ordering trong Hono: `/invoices/:id/transactions` không xung đột `/invoices/:id/payment` (segment khác). Không cần CSRF vì là GET (giống `/payment`).
