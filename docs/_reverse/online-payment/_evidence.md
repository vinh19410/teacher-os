---
type: reverse-evidence
feature: online-payment
status: draft
updated: 2026-11-12
---
# online-payment — Bằng chứng tái lập (evidence)

> Mỗi mệnh đề mang nhãn ở spec/gaps/flows có bằng chứng tại đây; dòng nào không tra được về file:line dưới đây thì phải hạ nhãn. Toàn bộ nhãn theo luật ở spec Mục 0.

## §1 Endpoints (điểm gắn và tuyến)

| Endpoint | Method | File:line | Ghi chú |
|---|---|---|---|
| `/webhooks/sepay/bankhub/events` và `/ipn` | POST | `apps/server/src/app.ts:409-411` (mount), `apps/server/src/routes/bank-hub-webhooks.ts:105-106` (2 path, 1 dispatcher) | Ngoài `/api`, không auth phiên — ✅ |
| `/public/pay/:token` | GET | `apps/server/src/app.ts:421-423` (mount), `apps/server/src/routes/public-pay.ts:21-53` | Ngoài `/api`, đọc-only — ✅ |
| `/dev/bank-hub/mock-transaction` | POST | `apps/server/src/app.ts:418-420` (mount), `apps/server/src/routes/bank-hub-mock.ts:44-156` | Chỉ sandbox (`:54-56` 403 `SANDBOX_ONLY`) — ✅ |
| `/api/bank-link` (GET /, POST /link-token, /reconcile, /sync) | GET/POST | `apps/server/src/routes/kernel.ts:3499-3500` (mount), `apps/server/src/routes/bank-link.ts:119-150,152-249,251-344,346-368` | Gate finance role `:66` — ✅ |
| `/api/payment-transactions` (GET ?status=unmatched, POST assign/ignore) | GET/POST | `apps/server/src/routes/kernel.ts:3499-3500` (mount), `apps/server/src/routes/payment-transactions.ts:47-149` | — ✅ |
| `/api/invoices/:id/payments` (phiếu thủ công) | POST | `apps/server/src/routes/kernel.ts:3140-3193` | 201/200/409/422 — ✅ |
| `/api/invoices/:id/rotate-pay-token`, `/payment`, `/transactions` | POST/GET | `apps/server/src/routes/kernel.ts:3196-3209,3212-3220,3224-3264` | — ✅ |
| `/api/student/invoices/:id/payment` (portal QR) | GET | `apps/server/src/routes/student.ts:960-979` | Ranh giới portal — ✅ |
| Hub outbound: token, company, link-token, bank-account, transaction, transaction/create | — | `apps/server/src/lib/bank-hub/bank-hub-client.ts:334-444` | — ✅ |

## §2 Validation

- Body webhook giới hạn 64KB — ✅ `apps/server/src/routes/bank-hub-webhooks.ts:34` (`bodyLimit({ maxSize: 64 * 1024 })`).
- Khóa vòng đời so bằng hằng thời gian; nếu không khớp mới thử khóa IPN; cả hai fail → 401 — ✅ `apps/server/src/routes/bank-hub-webhooks.ts:39-46` + `apps/server/src/lib/safe-equal.ts:9-14`.
- Schema IPN cố ý lỏng: 5 trường bắt buộc, phần còn lại passthrough (thiết kế ack-200) — ✅ `apps/server/src/lib/bank-hub/bank-hub-types.ts:109-126` + docblock `apps/server/src/routes/bank-hub-webhooks.ts:65-69`.
- Sự kiện vòng lifecycle: schema nghiêm, chỉ xử lý nhóm sự kiện tiền tố tài khoản — ✅ `apps/server/src/lib/bank-hub/bank-hub-types.ts:100-107`, `apps/server/src/routes/bank-hub-webhooks.ts:53-61`.
- Lọc ingest: chỉ tiền vào; số tiền phải là số nguyên dương; mã trích theo regex có ranh giới từ — ✅ `apps/server/src/lib/payments/ingest-transaction.ts:58-65`, `packages/api/src/lib/payment-code.ts:7-14`.
- Token link quá ngắn (<10 ký tự) từ chối ngay trước khi truy vấn — ✅ `apps/server/src/routes/public-pay.ts:23-25`.
- Nguồn link phiên phải nằm trong danh sách tin cậy; sandbox cho phép localhost — ✅ `packages/api/src/lib/bank-hub-origins.ts:8-32`, kiểm 2 lần ở route `apps/server/src/routes/bank-link.ts:219-242`.

## §3 Errors (wording NGUYÊN VĂN — đã trích trong Error Matrix spec Mục 6)

- Webhook: `BANKHUB_DISABLED` (503), `unauthorized` (401), `invalid json` (400), `invalid body` (400) — ✅ `apps/server/src/routes/bank-hub-webhooks.ts:37-77`; log format hai chuỗi ở `:73-75` và `:96-98`.
- Bank-link: mã hằng ở `packages/api/src/contracts.ts:2962-2970` — `BANKHUB_DISABLED`, `BANK_LINK_ALREADY_LINKED`, `BANK_LINK_NO_LINKED_ACCOUNT`, `BANK_LINK_BAD_HOSTED_LINK_ORIGIN`, `BANK_LINK_COMPANY_SETTLING`, `BANKHUB_UPSTREAM`, `BANKHUB_RATE_LIMITED` — ✅.
- Đối soát: `{ "error": "reconcile cooldown", "code": "RECONCILE_COOLDOWN" }` (429) — ✅ `apps/server/src/routes/bank-link.ts:277-283`.
- Hàng chờ: `transaction not found`, `invoice not found`, `invoice already paid` + `INVOICE_ALREADY_PAID` — ✅ `apps/server/src/routes/payment-transactions.ts:96-115`.
- Phiếu thủ công: `client-request-id-conflict` (409), `invoice-settled` (422), `amount-exceeds-debt` (422 + `remaining`), `invoice not found` (404) — ✅ `apps/server/src/routes/kernel.ts:3140-3193`.
- Công khai: `not found` (404 chung) — ✅ `apps/server/src/routes/public-pay.ts:23-40`.

## §4 Business Rules (code khẳng định)

- Một org một tài khoản: gate máy chủ chặn khi đang linked mà yêu cầu link — ✅ `apps/server/src/routes/bank-link.ts:172-187` (docblock "Server-side enforcement").
- Cách ly tổ chức: mã hóa đơn đích phải cùng org với giao dịch; org tìm theo tài khoản nhận, fallback qua API hub rồi theo đại diện — ✅ `apps/server/src/lib/payments/ingest-transaction.ts:69-98`.
- Redact hàng chờ: khi lý do là tổ chức khác, nội dung trả null/rỗng, mã học phí không trả — ✅ `apps/server/src/routes/payment-transactions.ts:62-75` + docblock `:14-19` + hợp đồng `packages/api/src/contracts.ts:3042-3057`.
- Trạng thái dính "đã thanh toán" + gợi ý "Chuyển khoản" tính trong cùng câu tính lại — ✅ `apps/server/src/lib/payments/recompute-invoice.ts:19-38`.
- Guard phiếu thủ công trong câu INSERT..SELECT: phiếu chưa đủ và số tiền ≤ còn nợ; trùng mã yêu cầu → no-op — ✅ `apps/server/src/lib/payments/record-manual-payment.ts:97-148`.
- Guard sự kiện trạng thái: chỉ nhận sự kiện cho tài khoản hiện tại; sự kiện cũ hơn thời điểm đã ghi thì thua; hủy → "unlinked", ngừng hoạt động → "inactive" — ✅ `apps/server/src/lib/bank-hub/bank-link-service.ts:188-236`.
- Chọn tài khoản đồng bộ: xid hoạt động cao nhất, kèm các xid cũ; không có tài khoản hoạt động → inactive/none — ✅ `apps/server/src/lib/bank-hub/bank-link-service.ts:119-178`.
- Tạo đại diện trước khi gọi hub để tab/webhook song song thấy được; trùng tạo → đọc lại; chưa kịp có mã đại diện → 409 chờ — ✅ `apps/server/src/lib/bank-hub/bank-link-service.ts:58-108`, `apps/server/src/routes/bank-link.ts:200-208`.
- Hạn mức giao dịch "Unlimited" đặt khi tạo/tạo lại đại diện để IPN được phát — ✅ `apps/server/src/lib/bank-hub/bank-link-service.ts:39-45,58-108`.

## §5 Entities (schema + migration)

- `org_bank_link`: khóa chính là org_id (cascade xóa), cột xid đại diện/tài khoản nullable trong lúc tạo, danh sách xid cũ mặc định "[]", status mặc định "none", 2 unique index trên xid đại diện và xid tài khoản — ✅ `packages/db/src/schema/org-bank-link.ts:18-47`; lifecycle docblock `:10-17`.
- `payment_transaction`: unique (provider, provider_txn_id) = khóa chống trùng; invoice_id text không FK; raw chỉ giữ khi chưa khớp (giới hạn PII); method/recorded_by chỉ phiếu thủ công (migration 0049) — ✅ `packages/db/src/schema/payment-transaction.ts:25-63`; docblock `:11-24`.
- `invoice`: payment_code + pay_token unique (nullable, nhiều NULL phân biệt); paid_amount mặc định 0, tính lại từ sổ — ✅ `packages/db/src/schema/invoice.ts:25-61`.
- Migration khai sinh: `packages/db/src/migrations/0034_familiar_jamie_braddock.sql:1-47` (org_bank_link + payment_transaction + ALTER invoice); `packages/db/src/migrations/0049_shocking_kabuki.sql:1` (ADD method/recorded_by) — ✅.

## §6 Cross-repo hops (luồng nhiều chặng — ghi rõ từng chặng)

1. **Chặng 1 — Hub → dispatcher:** SePay giao cả hai họ payload tới một URL đã ghim; dispatcher chung cho `/events` và `/ipn`, quyết loại theo header khóa, không theo path — ✅ `apps/server/src/routes/bank-hub-webhooks.ts:13-27,36-46,105-106`.
2. **Chặng 2 — Dispatcher → verify:** so khóa hằng thời gian; hub bị tắt → 503; body quá lớn bị chặn 64KB trước đó — ✅ `:34-46`.
3. **Chặng 3 — Phân nhánh họ payload:** vòng lifecycle → schema nghiêm → chỉ nhóm sự kiện tài khoản đi tiếp, còn lại ack rỗng; IPN → schema lỏng, hỏng thì 400 + log, đúng thì ingest — ✅ `:53-94`.
4. **Chặng 4 — Ingest → xác định tổ chức (nhiều bước):** tra bảng liên kết theo xid tài khoản; trống thì gọi API hub lấy tài khoản → lấy xid đại diện → tra lại bảng; API lỗi → trả "api-error" (webhook vẫn 200, đối soát bù); không ra tổ chức → bỏ qua — ✅ `apps/server/src/lib/payments/ingest-transaction.ts:69-87`; log kèm ở `apps/server/src/routes/bank-hub-webhooks.ts:95-99`.
5. **Chặng 5 — Khớp mã trong phạm vi tổ chức:** trích mã từ nội dung; tra hóa đơn cùng org theo mã; đã đủ → lý do "phiếu đã đủ"; không có mã + chế độ IPN → bỏ; chế độ đối soát → giữ "không mã"; mã không thấy → "mã không tồn tại"; mã org khác → "tổ chức khác" — ✅ `:61-65,92-98,103-130`.
6. **Chặng 6 — Ghi sổ nguyên tử:** một statement quyết trạng thái + lý do + raw (CASE SQL), unique chống trùng, rồi tính lại hóa đơn trong cùng batch D1 — ✅ `:103-138` + `apps/server/src/lib/payments/recompute-invoice.ts:19-38`; bất biến được kiểm bởi test `apps/server/src/lib/payments/ledger-invariants.test.ts:73-342`.
7. **Chặng 7 — Bề mặt giáo viên:** hàng chờ chỉ đọc từ sổ (lọc org + chưa khớp, tối đa 50, giảm dần) với redact; gán/bỏ qua cập nhật sổ rồi tính lại trong batch — ✅ `apps/server/src/routes/payment-transactions.ts:47-149`.
8. **Chặng 8 — Đối soát re-enter chặng 4:** kéo từng xid (hiện tại + cũ) tối đa 5 trang × 100, chỉ tiền vào, đẩy qua cùng ingest với chế độ giữ "không mã"; ghi thời điểm đối soát — ✅ `apps/server/src/routes/bank-link.ts:251-343`.
9. **Chặng 9 — Bề mặt phụ huynh:** token → tra hóa đơn (join tổ chức + học viên) → dựng hướng dẫn realtime (còn nợ, mã, memo, QR) → lược ghi chú/hạn → no-store — ✅ `apps/server/src/routes/public-pay.ts:21-53` + `apps/server/src/lib/payment-instructions.ts:62-116`.
10. **Chặng 10 — Liên kết (ghi):** yêu cầu phiên → gate trạng thái → tạo/đọc đại diện → tạo phiên → kiểm nguồn → trả URL; sự kiện vòng lifecycle từ hub cập nhật trạng thái qua guard thời gian — ✅ `apps/server/src/routes/bank-link.ts:152-249` + `apps/server/src/lib/bank-hub/bank-link-service.ts:188-236`.

## §7 Gaps trong bằng chứng

- Không tìm thấy scheduled handler: toàn bộ `apps/server/src/index.ts` (177 dòng) chỉ export app (`:177`) — 🟡 → OQ-1 (negative search).
- Test công khai nằm ở `apps/server/src/public-pay.test.ts` (không colocated trong `routes/`) — ghi chú vị trí để tra cứu, không phải gap hành vi.
- Không thấy test cho việc hai giáo viên bấm đối soát cùng lúc (chỉ test cooldown theo thời gian) — 🟡 → OQ-2.
- Không tìm thấy giới hạn tồn kho hàng chờ hay aging — 🟡 → OQ-4/Gaps.
