# Phase 6. Chuẩn bị prod (trạng thái 2026-10-29)

Chưa deploy gì lên prod. Chưa chốt ngày giờ release.

## 6.3 Cấu hình prod khớp bảng gating (đọc tên, không đọc giá trị)

GitHub environment `production`:
- Secrets có: BETTER_AUTH_SECRET, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, RESEND_API_KEY.
- Vars có: MAILER_IMPL=resend, MAIL_FROM.
- Không có SEPAY_BANKHUB_* → route ngân hàng trả 503 `BANKHUB_DISABLED` (đã thấy đúng hành vi này ở rehearsal Phase 3).
- Không có ADMIN_EMAILS → không ai là admin (default rỗng).
- Không có AI_ENABLED, và `deploy.yml` không truyền nó → mặc định "false" → AI tắt (PR #496, #497).
- Không có GH_WEBHOOK_SECRET → webhook GitHub tắt.
- Cổng học viên: PR #495 chưa merge, nên prod giữ nguyên cổng hiện (xem lý do trong phase 4).

## 6.2 Bookmark D1 Time Travel (prod)

Bookmark tham chiếu đọc lúc chuẩn bị, KHÔNG dùng để restore khi release:
`0000005b-00000000-00005113-f9288f8149906007486a0f0261cd4a6c`
Phải đọc lại ngay trước khi merge vào `main`.

## Rủi ro còn lại cần nhìn trước deploy

1. Deploy đầu tiên tạo worker `admin`, domain `admin.<domain>`, bucket `library-audio` và binding Workers AI. Domain mới có thể chờ DNS/cert; smoke `/readyz` poll tối đa ~10 phút. Token Cloudflare cần quyền Workers AI và R2: chưa xác minh được từ đây, staging đã deploy được với cùng config nên rủi ro thấp nhưng token prod là token khác.
2. Cờ AI/cổng học viên là build-time cho web: đổi cần deploy lại.
3. Safari private và Chrome có giao diện chưa kiểm trên staging (mục 4.4, cần người).
4. Gửi lại/retry thông báo chưa kiểm được trên staging (không sinh dòng lỗi); có test server bao phần này.
5. Ngày giờ release chưa chốt; Vinh cần có mặt ≥1 giờ sau deploy.
6. Học viên prod đang dùng cổng `student.<domain>` sẽ vẫn dùng bình thường (cổng không bị ẩn).
Bookmark ngay trước deploy: 2026-10-29T06:55:16Z
⚠️ The current bookmark is '0000005d-00000000-00005113-d220675d1d6eddae95fe41c1dd5a9207'
