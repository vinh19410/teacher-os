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

- IPN **chỉ retry khi lỗi mạng**: trả 4xx/5xx = mất IPN vĩnh viễn ⇒ handler phải tối giản, parse lỏng ở biên, và bắt buộc có đối soát.
- Sổ cái là nguồn sự thật: `paid_amount = SUM(amount) WHERE invoice_id = ? AND match_status = 'matched'`. Tính lại (không cộng dồn kiểu `+=`) ⇒ nhận trùng, đối soát lại, gán thủ công đều idempotent.
- Trạng thái khớp được **SQL đánh giá ngay lúc insert** trong cùng batch ⇒ không có cửa sổ race giữa "đọc trạng thái phiếu" và "ghi".
- Chỉ tìm phiếu trong org sở hữu `bank_account_xid` ⇒ mã của org A chuyển nhầm vào TK org B **không bao giờ** gạch nợ org A; giao dịch đó lưu `foreign_code` dưới org B nhưng **che `content`/`payment_code`** trong DTO list (không lộ dữ liệu học viên org A cho giáo viên org B). <!-- RT2 #F3 -->
- Đường IPN: giao dịch `debit` hoặc không có mã `TOS…` hợp lệ ⇒ **không lưu**, chỉ ack (whitelist keyword phía SePay đã lọc trước; giảm PII). Đường **đối soát**: giao dịch credit không có mã ⇒ vẫn lưu `unmatched/no_code` (có giới hạn tự nhiên: ≤ 5 trang × 100 dòng/7 ngày) để giáo viên đối chiếu — chính là "phụ huynh tự gõ nội dung" mà phase 3 hứa. <!-- RT2 #F2 -->

## Requirements

Luật khớp (theo Validation Session 1):

| Tình huống | `match_status` / `unmatched_reason` | Ảnh hưởng phiếu |
|---|---|---|
| Mã khớp phiếu chưa thu (unpaid/overdue) | `matched` | `paid_amount` tính lại; ≥ `amount` ⇒ `status=paid`, `method="Chuyển khoản"` |
| Mã khớp phiếu đã `paid` mà `paid_amount < amount` (mark-paid thủ công khi mới thu một phần) | `matched` | cộng dồn `paid_amount` (tiền bù nốt), giữ `status=paid` | <!-- RT2 #F5 -->
| Mã khớp phiếu đã `paid` đủ (`paid_amount >= amount`) | `unmatched` / `invoice_paid` | không đổi |
| Mã đúng định dạng nhưng không có phiếu trong org | `unmatched` / `unknown_code` | — |
| Mã hợp lệ thuộc **org khác** (chuyển nhầm TK) | `unmatched` / `foreign_code` — DTO che `content`/`paymentCode` | — | <!-- RT2 #F3 -->
| Đối soát: giao dịch credit không có mã | `unmatched` / `no_code` | — | <!-- RT2 #F2 -->
| `transaction_id` đã có | (không insert) | tính lại → không đổi |

- `status` không bao giờ bị hạ từ `paid` (giữ tương thích `mark-paid` thủ công).
- Endpoint giáo viên (kernel tree, org-scoped):
  - `GET /api/payment-transactions?status=unmatched` → `{ id, amount, content, referenceCode, transactionDate, unmatchedReason, paymentCode }[]` — tối đa 50 dòng mới nhất; giao dịch `foreign_code` trả `content: null, paymentCode: null` kèm nhãn hiển thị riêng. <!-- RT2 #F3 -->
  - `POST /api/payment-transactions/:id/assign { invoiceId }` → chỉ khi giao dịch `unmatched` và phiếu cùng org; 409 khi phiếu đã `paid` **và** `paid_amount >= amount` (phiếu `paid` còn thiếu tiền vẫn gán được để cộng dồn). <!-- RT2 #F5 -->
  - `POST /api/payment-transactions/:id/ignore` → `ignored`.
  - `POST /api/bank-link/reconcile` → kéo 7 ngày gần nhất của **tất cả** `bank_account_xid` đã từng thuộc org (xid hiện tại + `past_bank_account_xids`), cooldown 60 s/org (`last_reconciled_at`) → `{ scanned, matched, unmatched }`. <!-- RT2 #S2/#F1 -->

## Architecture

```
SePay IPN ─POST /webhooks/sepay/bankhub/ipn─▶ auth "Apikey" (safeEqual) ─▶ zod parse lỏng
                                             └▶ ingestTransaction(db, tx, {saveNoCode: false})
Teacher "Đối soát" ─POST /api/bank-link/reconcile─▶ với MỖI xid của org
  (xid hiện tại + past_bank_account_xids):                    <!-- RT2 #S2 -->
  listTransactions(xid, 7d, credit) ─▶ ingestTransaction(db, tx, {saveNoCode: true}) × N

ingestTransaction(db, tx, {saveNoCode}):
  1. tx.transfer_type !== "credit"                       → return "skipped"
  2. code = PAYMENT_CODE_RE(tx.payment_code) ?? extractPaymentCode(tx.content)
     → không có: saveNoCode ? lưu 'unmatched/no_code' : "skipped" (ack)
     (IPN: whitelist SePay đã lọc, không tốn chỗ; đối soát: lưu để GV đối chiếu)
  3. orgId = org_bank_link WHERE bank_account_xid = tx.bank_account_xid
     → không có (TK cũ sau khi giáo viên đổi TK) → THỬ getBankAccount(tx.bank_account_xid).company_xid
       trong try/catch — API lỗi (429/timeout) ⇒ log kèm transaction_id + ack 200,
       KHÔNG 500 (đối soát phủ mọi xid sẽ bù);                    <!-- RT2 #F1 -->
       → org_bank_link WHERE company_xid = … → vẫn không có → "skipped"
  4. inv = invoice WHERE payment_code = code AND org_id = orgId (có thể null)
  5. db.batch([
       INSERT INTO payment_transaction (…, invoice_id, match_status, unmatched_reason, raw)
         VALUES (…, :invId,
           CASE WHEN :invId IS NOT NULL THEN 'matched'
                WHEN (SELECT status='paid' AND paid_amount>=amount
                      FROM invoice WHERE id=:invId) THEN 'unmatched'   -- đã đủ
                ELSE 'matched' END,          -- chưa đủ (kể cả paid còn thiếu) ⇒ tiền thật cho phiếu
           CASE WHEN :invId IS NOT NULL THEN ''
                WHEN (SELECT org_id FROM invoice WHERE payment_code = :code) IS NOT NULL
                     THEN 'foreign_code'     -- mã thuộc org khác, chuyển nhầm TK
                ELSE 'unknown_code' END,
           CASE WHEN match_status <> 'matched' THEN :rawJson ELSE '' END)  -- raw chỉ khi chưa khớp
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

`assign` = batch [`UPDATE payment_transaction SET invoice_id, match_status='matched', unmatched_reason=''`, `recomputeInvoice`] — cho phép gán vào phiếu `paid` khi `paid_amount < amount` (tiền bù nốt); 409 khi đã đủ. <!-- RT2 #F5 -->

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
   - Phiếu `mark-paid` thủ công khi mới thu 400k/500k (paid còn thiếu) nhận IPN 100k → `matched`, `paid_amount`=500k, giữ `paid`.
   - Phiếu đã `paid` đủ (IPN hoặc mark-paid khi đã đủ) nhận thêm tiền → `unmatched/invoice_paid`, phiếu giữ nguyên; assign vào phiếu này → 409.
   - Mã của org A vào TK org B → `unmatched/foreign_code` dưới org B, DTO list trả `content: null, paymentCode: null`; phiếu org A không đổi.
   - IPN không mã → không lưu; **đối soát** giao dịch không mã → `unmatched/no_code` (lưu để gán).
   - `debit`, TK lạ (fake `getBankAccount` trả company không thuộc org nào) → không có dòng nào được lưu.
   - Fallback `getBankAccount` ném lỗi (fake 429) → route IPN vẫn 200, log kèm `transaction_id`, không 500. <!-- RT2 #F1 -->
   - TK cũ của org (đã đổi sang TK mới, xid nằm trong `past_bank_account_xids`) nhận IPN → fallback theo `company_xid` → vẫn khớp đúng org.
   - Nội dung `"SEVQR tos7k2m9qxa"` (chữ thường) vẫn khớp.
2. Route `/ipn`: thiếu/sai `Authorization` → 401 (không đọc body); body > 64 KB → 413; **zod parse lỏng**: chỉ bắt buộc `transaction_id`, `transfer_type`, `amount`, `bank_account_xid`, `content` — field lạ bị strip, field khác kiểu ở phần ngoài ⇒ log cảnh báo vẫn 200 (SePay không retry 4xx/5xx — schema drift không được làm chết toàn luồng); thiếu field bắt buộc → 400 có log; thành công → `200 {"success": true}`; lỗi DB → 500 + `console.error` kèm `transaction_id` (đối soát bù). <!-- RT2 #F6/#A7 -->
3. `payment-transactions.ts`: list (giới hạn 50, che `foreign_code`) / assign / ignore với predicate `org_id`; assign kiểm tra phiếu cùng org + 409 chỉ khi `paid` và `paid_amount >= amount`.
4. `/bank-link/reconcile`: cooldown 60 s; **lặp qua xid hiện tại + `past_bank_account_xids`**; phân trang `per_page=100`, tối đa 5 trang mỗi xid; tôn trọng 429 (`Retry-After` → trả 429 cho client, không ngủ trong Worker). Định dạng `start_transaction_date` xác nhận ở sandbox (phase 6).
5. Kiểm tra lại không có route nào mở `paid_amount`/`status` cho client ghi trực tiếp; không route nào trả cột `raw`.

## Todo

- [ ] `ingest-transaction.ts` + `recompute-invoice.ts` (một D1 batch)
- [ ] Test matrix ingest (partial, replay, paid-thiếu/paid-đủ, foreign_code, no_code, skip, case-insensitive, fallback API lỗi)
- [ ] Route IPN + test auth/limit/parse lỏng
- [ ] `payment-transactions` list (che foreign, limit 50)/assign/ignore + test
- [ ] `/bank-link/reconcile` (mọi xid) + cooldown + test với fake client phân trang

## Success Criteria

- `pnpm --filter server test -- bank-hub-ipn payment-transactions bank-hub-reconcile` xanh.
- Đối soát chạy trên dữ liệu đã nhận qua IPN → `matched: 0` mới, không thay đổi `paid_amount`.

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| IPN trả 4xx/5xx bị mất (SePay không retry) | Đối soát quét **mọi xid** của org trong 7 ngày; fallback API lỗi ⇒ ack + log thay vì 500; log lỗi kèm `transaction_id` | <!-- RT2 #F1 -->
| SePay đổi payload IPN (schema drift) ⇒ mọi IPN fail âm thầm | Parse lỏng chỉ bắt buộc 5 field; sandbox phase 6 so schema thật với zod trước go-live production | <!-- RT2 #F6 -->
| `amount` gửi dạng chuỗi/thập phân | zod `coerce.number()`, `Number.isInteger` sau `Math.round`, ≤ 0 → skip |
| Giáo viên gán nhầm phiếu | Chỉ gán được giao dịch `unmatched`; chưa có "huỷ gán" — ghi chú follow-up nếu cần |
| Whitelist `TOS` lọt từ khác (vd "TOSHIBA") | Regex có ranh giới; không khớp phiếu → không gạch nợ, lưu `unknown_code/foreign_code` cho GV xử lý |
| Invariant race/atomicity chỉ được test trên libsql (D1 thật chưa từng chạy) | `db.batch` D1 nguyên tử theo docs; mô hình single-writer không có cửa sổ race; nếu batch lỗi ⇒ IPN mất ⇒ đối soát bù. Nếu sandbox phát hiện bất thường, thêm test `@cloudflare/vitest-pool-workers` | <!-- RT2 #F7 -->

## Security Considerations

- IPN xác thực bằng `Apikey` (so sánh thời gian hằng); tuỳ chọn thêm allowlist IP SePay qua header `CF-Connecting-IP` — để cấu hình env, mặc định tắt (danh sách IP Bank Hub chưa được công bố riêng).
- Số tiền/trạng thái chỉ do server tính; client redirect hay postMessage không bao giờ gạch nợ.
- `raw` chỉ lưu cho giao dịch chưa khớp; không endpoint nào trả `raw`; không đưa vào snapshot.
- Giao dịch `foreign_code` (mã của org khác) che `content`/`payment_code` trong DTO — giáo viên org B không thấy dữ liệu phiếu của org A. <!-- RT2 #F3 -->

## Next Steps

Phase 5 hiển thị `paidAmount`, danh sách chưa khớp, nút Đối soát.
