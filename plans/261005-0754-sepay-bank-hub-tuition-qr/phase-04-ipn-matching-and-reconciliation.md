---
phase: 4
title: "Phase 4: IPN, khớp giao dịch và đối soát"
status: todo
priority: P1
effort: "1.5d"
dependencies: [1, 2, 3]
---

# Phase 4: IPN, khớp giao dịch và đối soát

## Overview

Nhận IPN biến động số dư của Bank Hub, ghi sổ cái `payment_transaction`
(chống trùng theo `transaction_id`), khớp mã `TOS…` với phiếu của **đúng org
sở hữu tài khoản nhận tiền**, rồi tính lại `paid_amount`/`status` từ sổ cái.
Thêm API cho giáo viên: xem giao dịch chưa khớp, gán vào phiếu, bỏ qua, và
"Đối soát" kéo `GET /v1/transaction` để bù IPN bị lỡ. IPN và đối soát dùng
chung một hàm `ingestTransaction`.

## Context Links

- [research/bank-hub-research.md](./research/bank-hub-research.md) — payload IPN, retry, `GET /v1/transaction`
- Skill `ak-payment-integration` — "Payment state invariants" (server sở hữu amount/status; xử lý trùng, sai chữ ký, sai thứ tự)
- `apps/server/src/routes/bank-hub-webhooks.ts` (phase 2), `apps/server/src/lib/safe-equal.ts`
- `apps/server/src/routes/enrollment-activation.ts:188-206` (mẫu `BatchItem<"sqlite">[]` + `db.batch` cho ghi nguyên tử)
- `apps/server/src/routes/kernel.ts:1526` (`mark-paid` thủ công — vẫn giữ)

## Key Insights

- IPN **chỉ retry khi lỗi mạng**: trả 5xx = mất IPN vĩnh viễn ⇒ handler phải tối giản, và bắt buộc có đối soát.
- Sổ cái là nguồn sự thật: `paid_amount = SUM(amount) WHERE invoice_id = ? AND match_status = 'matched'`. Tính lại (không cộng dồn kiểu `+=`) ⇒ nhận trùng, đối soát lại, gán thủ công đều idempotent.
- Trạng thái khớp được **SQL đánh giá ngay lúc insert** trong cùng batch ⇒ không có cửa sổ race giữa "đọc trạng thái phiếu" và "ghi".
- Chỉ tìm phiếu trong org sở hữu `bank_account_xid` ⇒ mã của org A chuyển nhầm vào TK org B **không bao giờ** gạch nợ org A.
- Giao dịch không thuộc TK nào của mình, giao dịch `debit`, hoặc không có mã `TOS…` hợp lệ ⇒ **không lưu** (giảm PII), chỉ ack.

## Requirements

Luật khớp (theo Validation Session 1):

| Tình huống | `match_status` / `unmatched_reason` | Ảnh hưởng phiếu |
|---|---|---|
| Mã khớp phiếu chưa thu (unpaid/overdue) | `matched` | `paid_amount` tính lại; ≥ `amount` ⇒ `status=paid`, `method="Chuyển khoản"` |
| Mã khớp phiếu đã `paid` | `unmatched` / `invoice_paid` | không đổi |
| Mã đúng định dạng nhưng không có phiếu trong org | `unmatched` / `unknown_code` | — |
| `transaction_id` đã có | (không insert) | tính lại → không đổi |

- `status` không bao giờ bị hạ từ `paid` (giữ tương thích `mark-paid` thủ công).
- Endpoint giáo viên (kernel tree, org-scoped):
  - `GET /api/payment-transactions?status=unmatched` → `{ id, amount, content, referenceCode, transactionDate, unmatchedReason, paymentCode }[]`
  - `POST /api/payment-transactions/:id/assign { invoiceId }` → chỉ khi giao dịch `unmatched` và phiếu cùng org, chưa `paid` (409 nếu đã thu).
  - `POST /api/payment-transactions/:id/ignore` → `ignored`.
  - `POST /api/bank-link/reconcile` → kéo 7 ngày gần nhất, cooldown 60 s/org (`last_reconciled_at`) → `{ scanned, matched, unmatched }`.

## Architecture

```
SePay IPN ─POST /webhooks/sepay/bankhub/ipn─▶ auth "Apikey" (safeEqual) ─▶ zod parse
                                             └▶ ingestTransaction(db, tx)
Teacher "Đối soát" ─POST /api/bank-link/reconcile─▶ listTransactions(bank_account_xid, 7d, credit) ─▶ ingestTransaction × N

ingestTransaction(db, tx):
  1. tx.transfer_type !== "credit"                       → return "skipped"
  2. code = PAYMENT_CODE_RE(tx.payment_code) ?? extractPaymentCode(tx.content) → không có → "skipped"
     (kiểm mã TRƯỚC để không tốn API call cho giao dịch không phải học phí)
  3. orgId = org_bank_link WHERE bank_account_xid = tx.bank_account_xid
     → không có (TK cũ sau khi giáo viên đổi TK) → getBankAccount(tx.bank_account_xid).company_xid
       → org_bank_link WHERE company_xid = … → vẫn không có → "skipped"   <!-- Red Team #1 -->
  4. inv = invoice WHERE payment_code = code AND org_id = orgId (có thể null)
  5. db.batch([
       INSERT INTO payment_transaction (…, invoice_id, match_status, unmatched_reason)
         VALUES (…, :invId,
           CASE WHEN :invId IS NULL THEN 'unmatched'
                WHEN (SELECT status FROM invoice WHERE id=:invId) = 'paid' THEN 'unmatched'
                ELSE 'matched' END,
           CASE … 'unknown_code' | 'invoice_paid' | '' END)
         ON CONFLICT(provider, provider_txn_id) DO NOTHING,
       -- VALUES + scalar subquery, KHÔNG dùng INSERT…SELECT…ON CONFLICT
       -- (SQLite: upsert sau SELECT bị mơ hồ cú pháp nếu thiếu WHERE)    <!-- Red Team #2 -->
       recomputeInvoice(:invId)   -- chỉ khi invId != null
     ])
recomputeInvoice(invId) =
  UPDATE invoice SET
    paid_amount = (SELECT COALESCE(SUM(amount),0) FROM payment_transaction
                   WHERE invoice_id = :invId AND match_status = 'matched'),
    status = CASE WHEN status = 'paid' THEN 'paid'
                  WHEN (…same SUM…) >= amount THEN 'paid' ELSE status END,
    method = CASE WHEN status <> 'paid' AND (…SUM…) >= amount THEN 'Chuyển khoản' ELSE method END
  WHERE id = :invId AND org_id = :orgId
```

`assign` = batch [`UPDATE payment_transaction SET invoice_id, match_status='matched', unmatched_reason=''`, `recomputeInvoice`].

## Related Code Files

- Create: `apps/server/src/lib/payments/ingest-transaction.ts`, `apps/server/src/lib/payments/recompute-invoice.ts`
- Create: `apps/server/src/routes/payment-transactions.ts` (mount `kernel.route("/payment-transactions", …)`)
- Modify: `apps/server/src/routes/bank-hub-webhooks.ts` (route `/ipn`), `apps/server/src/routes/bank-link.ts` (`/reconcile`)
- Modify: `packages/api/src/contracts.ts` (`PaymentTransactionRow`, `paymentAssignSchema`, `BankHubIpnSchema` nếu đặt ở contracts — hoặc giữ trong `bank-hub-types.ts` server-only)
- Create tests: `apps/server/src/bank-hub-ipn.test.ts`, `apps/server/src/payment-transactions.test.ts`, `apps/server/src/bank-hub-reconcile.test.ts`

## Implementation Steps

1. TDD `ingestTransaction` (DB test thật như các `*.test.ts` server hiện có):
   - 200k rồi 300k cùng mã cho phiếu 500k → `paid_amount` 200k/unpaid rồi 500k/paid, `method="Chuyển khoản"`.
   - Gửi lại cùng `transaction_id` 3 lần → 1 dòng sổ cái, `paid_amount` không đổi.
   - Phiếu đã paid (kể cả `mark-paid` thủ công) nhận thêm tiền → `unmatched/invoice_paid`, phiếu giữ nguyên.
   - Mã của org A vào TK org B → `unmatched/unknown_code` dưới org B; phiếu org A không đổi.
   - `debit`, không mã, TK lạ (fake `getBankAccount` trả company không thuộc org nào) → không có dòng nào được lưu.
   - TK cũ của org (đã đổi sang TK mới) nhận IPN → fallback theo `company_xid` → vẫn khớp đúng org.
   - Nội dung `"SEVQR tos7k2m9qxa"` (chữ thường) vẫn khớp.
2. Route `/ipn`: thiếu/sai `Authorization` → 401 (không đọc body); body > 64 KB → 413; zod lỗi → 400 có log (không retry được nhưng không có giao dịch hợp lệ để mất); thành công → `200 {"success": true}`; lỗi DB → 500 + `console.error` kèm `transaction_id` (đối soát sẽ bù).
3. `payment-transactions.ts`: list/assign/ignore với predicate `org_id`; assign kiểm tra phiếu cùng org + chưa paid.
4. `/bank-link/reconcile`: cooldown 60 s; phân trang `per_page=100`, tối đa 5 trang; tôn trọng 429 (`Retry-After` → trả 429 cho client, không ngủ trong Worker). Định dạng `start_transaction_date` xác nhận ở sandbox (phase 6).
5. Kiểm tra lại không có route nào mở `paid_amount`/`status` cho client ghi trực tiếp.

## Todo

- [ ] `ingest-transaction.ts` + `recompute-invoice.ts` (một D1 batch)
- [ ] Test matrix ingest (partial, replay, paid, cross-tenant, skip, case-insensitive)
- [ ] Route IPN + test auth/limit/parse
- [ ] `payment-transactions` list/assign/ignore + test
- [ ] `/bank-link/reconcile` + cooldown + test với fake client phân trang

## Success Criteria

- `pnpm --filter server test -- bank-hub-ipn payment-transactions bank-hub-reconcile` xanh.
- Đối soát chạy trên dữ liệu đã nhận qua IPN → `matched: 0` mới, không thay đổi `paid_amount`.

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| IPN trả 5xx bị mất | Đối soát thủ công 7 ngày; log lỗi kèm `transaction_id` |
| `amount` gửi dạng chuỗi/thập phân | zod `coerce.number()`, `Number.isInteger` sau `Math.round`, ≤ 0 → skip |
| Giáo viên gán nhầm phiếu | Chỉ gán được giao dịch `unmatched`; chưa có "huỷ gán" — ghi chú follow-up nếu cần |
| Whitelist `TOS` lọt từ khác (vd "TOSHIBA") | Regex có ranh giới; không khớp → không lưu |

## Security Considerations

- IPN xác thực bằng `Apikey` (so sánh thời gian hằng); tuỳ chọn thêm allowlist IP SePay qua header `CF-Connecting-IP` — để cấu hình env, mặc định tắt (danh sách IP Bank Hub chưa được công bố riêng).
- Số tiền/trạng thái chỉ do server tính; client redirect hay postMessage không bao giờ gạch nợ.
- `raw` payload chỉ đọc được qua route org-scoped; không đưa vào snapshot.

## Next Steps

Phase 5 hiển thị `paidAmount`, danh sách chưa khớp, nút Đối soát.
