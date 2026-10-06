# Sandbox verification — SePay Bank Hub (#320)

> TRẠNG THÁI: CHƯA CHẠY — cần credential sandbox đối tác (`client_id`/
> `client_secret` từ SePay). Đây là gate trước khi bật production, không
> chặn merge vào `develop`. Checklist 6 điểm bên dưới theo phase-06 plan.

## Checklist

| # | Điểm cần chốt | Kết quả | Hành động nếu lệch |
|---|---|---|---|
| 1 | Host thật của `hosted_link_url` sandbox | ☐ | Cập nhật const `BANK_HUB_LINK_ORIGINS` (packages/api/src/lib/bank-hub-origins.ts) — server validate + web CSP dùng chung |
| 2 | `transaction_amount` mặc định của company mới; `company/edit` → `Unlimited` | ☐ | Giữ bước `editCompany` trong `ensureCompany` hoặc bỏ nếu mặc định đã Unlimited |
| 3 | Tên event khôi phục (`REACTIVATE`) | ☐ | Bổ sung vào map status của `applyAccountEvent` |
| 4 | `payment_code` trong IPN thật; định dạng `transaction_date` + `start_transaction_date` (đối soát); so payload thật với zod parse-lỏng | ☐ | Nới/thắt `bankHubIpnSchema`; chỉnh format ngày trong `/bank-link/reconcile` |
| 5 | Whitelist keyword "TOS" với nội dung chữ thường/ký tự lạ qua đường THẬT của SePay (tunnel) | ☐ | Thêm `"tos"` vào keywords trong `bankhub-setup.ts` |
| 6 | `FINISHED_*` postMessage phát khi KHÔNG có `completion_redirect_uri` | ☐ | Đã có poll 5 s dự phòng ở modal — chỉ xác nhận |

Cách chạy: tunnel `cloudflared` về server dev, dùng
`apps/server/scripts/bankhub-setup.ts` (đăng ký webhook + whitelist) và
`BANKHUB_SANDBOX_TX=1` để tạo giao dịch sandbox; lần lượt tick bảng trên.
