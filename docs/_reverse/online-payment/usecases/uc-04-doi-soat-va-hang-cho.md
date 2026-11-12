---
type: reverse-usecase
feature: online-payment
uc: UC-04
status: draft
updated: 2026-11-12
---
# UC-04 — Đối soát giao dịch và xử lý hàng chờ chưa khớp

| Mục | Nội dung |
|---|---|
| (a) Mô tả | Giáo viên bấm đối soát để kéo lại giao dịch 7 ngày của mọi tài khoản từng liên kết, rồi gán hoặc bỏ qua từng giao dịch chưa khớp |
| (b) Actor chính | Giáo viên (vai trò tài chính) |
| (c) Tiền điều kiện | Đăng nhập vai trò tài chính; tổ chức có mã đại diện trên hub; cách nhau trên 60 giay từ lần đối soát trước |
| (d) Hậu điều kiện | Giao dịch còn thiếu được đưa vào hàng chờ (hoặc khớp ngay nếu có mã); không có giao dịch nào bị ghi đúp |

**(e) Luồng chính**

1. Giáo viên mở modal thu học phí, thấy "Giao dịch chưa khớp (n)" (queue tối đa 50 dòng mới nhất). — ✅ [S13] `apps/web/src/components/modals/invoice-payment-modal.tsx:316-327`; [S6] `apps/server/src/routes/payment-transactions.ts:47-61`
2. Bấm "Đối soát"; máy chủ gộp tài khoản hiện tại + các tài khoản cũ (bỏ trùng). — ✅ [S3] `apps/server/src/routes/bank-link.ts:285-300`
3. Với mỗi tài khoản, kéo tối đa 5 trang × 100 giao dịch tiền vào trong 7 ngày, đẩy qua cùng đường ingest với chế độ giữ giao dịch không mã. — ✅ [S3] `:302-333`
4. Ghi thời điểm đối soát; trả { scanned, matched, unmatched }. — ✅ [S3] `:339-343`
5. UI hiển thị "Đối soát xong: khớp m, chưa khớp u.". — ✅ [S13] `apps/web/src/components/modals/invoice-payment-modal.tsx:329-334`

**(f) Luồng thay thế/đặc biệt**

- f1: Bấm trong 60 giay → 429 `reconcile cooldown`; UI nhắc "Vừa đối soát, thử lại sau 1 phút.". — ✅ [S3] `:277-283`; [S13] `:335-339`
- f2: Giao dịch không mã từ IPN không có trong sổ — chỉ đối soát mới đưa vào hàng chờ lý do "Không có mã học phí". — ✅ [S4] `apps/server/src/lib/payments/ingest-transaction.ts:32-39`; OQ-10
- f3: Gán về phiếu: phiếu đã đủ → 409; hợp lệ → ghi sổ khớp + tính lại trong batch. — ✅ [S6] `apps/server/src/routes/payment-transactions.ts:78-128`
- f4: Bỏ qua: chỉ từ trạng thái chưa khớp, ngược lại 404. — ✅ [S6] `:132-149`
- f5: Dòng của tổ chức khác bị che nội dung — giáo viên không thể đọc memo của người lạ. — ✅ [S6] `:62-75`
- f6: Không có gì để xử lý → "Không có giao dịch nào chờ xử lý.". — ✅ [S13] `apps/web/src/components/modals/invoice-payment-modal.tsx:340-343`

**(g) Dữ liệu chính**

- Vào: lựa chọn gán (mã giao dịch + mã hóa đơn) hoặc bỏ qua (mã giao dịch).
- Ra: kết quả đối soát 3 số; hàng chờ cập nhật; hóa đơn đích tính lại. — ✅ [S8] `packages/api/src/contracts.ts:3083-3087`

**(h) Truy vết test**

- `apps/server/src/bank-hub-reconcile.test.ts:173-238` (hiện tại + cũ, no_code, idempotent, cooldown 429 + Retry-After). — ✅
- `apps/server/src/payment-transactions.test.ts:137-203` (redact, assign, ignore, 404/409). — ✅
- E2E gán từ hàng chờ: `apps/e2e/specs/tuition-bank-transfer.spec.ts:338-374`. — ✅
