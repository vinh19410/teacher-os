# SePay Bank Hub — fact sheet cho plan

Đọc từ docs chính thức ngày 2026-10-05 (raw markdown: thêm `.md` vào URL,
index `https://developer.sepay.vn/llms.txt`). Skill `ak-payment-integration`
chỉ nhắc Bank Hub một dòng (`references/sepay/overview.md`); phần VietQR lấy từ
`references/sepay/qr-codes.md`. Mọi giá trị dưới đây là fact có ngày — kiểm tra
lại trong sandbox trước khi pin.

## Môi trường & xác thực

| | Sandbox | Production |
|---|---|---|
| API base | `https://bankhub-api-sandbox.sepay.vn` | `https://bankhub-api.sepay.vn` |

- `POST /v1/token` — `Authorization: Basic base64(client_id:client_secret)`, body rỗng → `201 {code, access_token, ttl}` (`ttl` giây). Gọi lại khi 401.
- Mọi API khác: `Authorization: Bearer {access_token}`. Chỉ gọi từ backend.

## Mô hình

- **Merchant** (TeacherOS) → nhiều **Company** (`POST /v1/company/create {full_name, status: Active|Pending}` → `data.xid`; `full_name` duy nhất trong merchant).
- Company → nhiều **bank account** (`GET /v1/bank-account?company_xid=…`, `GET /v1/bank-account/{xid}` → `xid, company_xid, brand_name, bank_bin, bank_code, account_holder_name, account_number, active, va_list[]`).
- IPN chỉ gửi khi company `Active`/`active: 1` và `transaction_amount` > 0 hoặc `Unlimited` (`GET /v1/company/{xid}`, sửa qua `POST /v1/company/edit/{xid}`).

## Hosted Link

- `POST /v1/link-token/create {company_xid, purpose: LINK_BANK_ACCOUNT|UNLINK_BANK_ACCOUNT|REACTIVATE_BANK_ACCOUNT, bank_account_xid?, completion_redirect_uri?, is_mobile_app?, language?}` → `{xid, hosted_link_url, link_token, expires_at}`. `bank_account_xid` bắt buộc cho UNLINK/REACTIVATE.
- Nhúng `hosted_link_url` vào iframe. postMessage từ origin `https://bankhub.sepay.vn`: `FINISHED_BANK_ACCOUNT_LINK`, `FINISHED_BANK_ACCOUNT_UNLINK`, `BANKHUB_CLOSE_LINK`, `BANKHUB_TOKEN_EXPIRED`, `BANKHUB_SESSION_EXPIRED`; payload `{event, metadata:{account_number, account_type}, timestamp}`.
- OCB/MSB/KienLongBank/TPBank: "huỷ liên kết" chỉ vô hiệu hoá trong Bank Hub (`BANK_ACCOUNT_INACTIVED`) → khôi phục bằng `REACTIVATE_BANK_ACCOUNT`, không cần OTP lại. Giao dịch trong thời gian ngừng không được đồng bộ bù.

## Webhook events (vòng đời liên kết — KHÔNG phải tiền)

- Cấu hình một lần / merchant: `POST /v1/webhook {webhook_url, auth_type: "SECRET_KEY", secret_key, active: 1, allow_events: ["*"]}` (upsert).
- SePay gửi header `X-Secret-Key: {secret_key}`. Envelope `{timestamp, xid (event UUID), version, event, metadata}`.
- Event dùng: `BANK_ACCOUNT_LINKED {bank_account_xid, brand_name, account_type, account_number, link_token_xid}`, `BANK_ACCOUNT_UNLINKED`, `BANK_ACCOUNT_INACTIVED`, (khôi phục: luồng đối xứng — xác nhận tên event trong sandbox).
- Retry chỉ khi lỗi mạng; tối đa 7 lần Fibonacci, ≤ 5 giờ; connect timeout 5 s, chờ phản hồi 8 s.

## IPN biến động số dư (tiền)

- URL IPN do SePay cấu hình (gửi cho SePay); HTTPS công khai.
- Header `Authorization: Apikey {API_KEY}` (key do SePay cấp). Có thể thêm allowlist IP.
- Payload: `{gateway, transaction_date, account_number, bank_account_xid, va, payment_code, content, transfer_type: credit|debit, amount, reference_code, accumulated, transaction_id}`.
- Phản hồi `200` `application/json` `{"success": true}`.
- Retry **chỉ khi lỗi mạng** (7 lần, ~33 phút, ≤ 5 h) → lỗi 5xx của mình KHÔNG được gửi lại ⇒ cần đối soát.
- Chống trùng bằng `transaction_id`.

## Lọc giao dịch

- `POST /v1/merchant-config {transaction_whitelist_remark_keywords: [...]}` — chỉ giao dịch có nội dung chứa từ khoá mới gửi webhook/IPN. Dùng `["TOS"]` ⇒ giao dịch cá nhân của giáo viên không bao giờ tới server.

## Đối soát

- `GET /v1/transaction?bank_account_xid=&start_transaction_date=&end_transaction_date=&transfer_type=credit&page=&per_page=` → `data[]{transaction_id, transaction_date, bank_account_xid, company_xid, account_number, reference_number, transfer_type, amount, transaction_content, payment_code, webhook_success}`, `meta{page, per_page, total, total_pages}`.
- Sandbox: `POST /v1/transaction/create {bank_account_xid, transfer_type, amount, transaction_content}` (403 trên production).

## QR

- VietQR ảnh: `https://vietqr.app/img?acc={account}&bank={bin|code}&amount={int}&des={memo}&template=compact` (host cũ `qr.sepay.vn/img` vẫn chạy).
- VietinBank cá nhân/hộ KD: nội dung **phải** chứa `SEVQR` (Bank Hub tự thêm khi họ tạo QR; mình tự tạo QR nên phải tự thêm `SEVQR `).
- Banks có thể bỏ dấu `-` / đổi hoa thường → mã chỉ dùng `[A-Z0-9]`, so khớp không phân biệt hoa thường.

## Ngân hàng hỗ trợ (2026-10-05)

VPBank (NEO), TPBank, VietinBank, ACB, BIDV, MBBank, OCB, KienLongBank, MSB, Sacombank. Sandbox có tài khoản mẫu (MBBank cá nhân `0123456789`, OTP `12345678`, …).

## Điểm chưa kiểm chứng (xác nhận trong sandbox ở phase 6)

1. Host của `hosted_link_url` sandbox (để thêm vào `frame-src`) — docs chỉ ví dụ `https://bankhub.sepay.vn/link/…`.
2. `transaction_amount` mặc định của company mới tạo (có cần `company/edit` → `Unlimited` không).
3. Tên event webhook của luồng khôi phục.
4. `payment_code` trong IPN có được điền với mã `TOS…` không (nếu không, parse từ `content`).
