# UC-12 — Phụ huynh thanh toán qua liên kết công khai

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

**a. Mô tả**: Phụ huynh mở liên kết `/pay/<token>` (không cần tài khoản) để xem số tiền và QR chuyển khoản; trang tự cập nhật khi tiền về.
- Actor chính: Phụ huynh (không đăng nhập). Actor phụ: Hệ thống (poll + webhook tiền vào).

**b. Kích hoạt & điều kiện trước**: nhận link từ giáo viên; token còn hiệu lực (chưa xoay).

**c. Luồng chính**:
1. Trang gọi dữ liệu công khai — không phiên, không cache.
2. Hiện: tổ chức, tên học viên, số tiền, QR — **không** hạn đóng, **không** ghi chú (cố ý để chia sẻ an toàn).
3. Poll 5 giây khi còn phải thu, trần 15 phút; hết trần → nút "Làm mới".
4. Tiền về (qua luồng webhook nền) → trang đổi sang trạng thái đã nhận đủ và dừng poll.

**d. Luồng thay thế/ngoại lệ**:
- 1a. Token ngắn/không tồn tại/xoay → 404 chung, không tiết lộ tồn tại ✅ [S72] apps/server/src/public-pay.test.ts:83-92.
- 2a. Hóa đơn đã đủ → trả trạng thái không khả dụng kèm lý do; chưa liên kết tài khoản → lý do riêng ✅ [S72] apps/server/src/public-pay.test.ts:93-111.
- 1b. Link chết ở giao diện → "Link thanh toán không tồn tại hoặc đã bị thu hồi." ✅ [S17] apps/web/src/routes/pay.$token.tsx:72-80.

**e. Hậu điều kiện**: tiền về được ghi qua UC (webhook) — trang công khai chỉ đọc; phụ huynh thấy xác nhận đủ ngay trên link.

**f. Quy tắc nghiệp vụ**: BR-11, BR-12 (QR theo hiện trạng).

**g. Yêu cầu**: FR-12, FR-04; NFR-03, NFR-05.

**h. Truy vết**:
- Flow: F10. Error: E-014, E-027.
- Test: ✅ [S72] apps/server/src/public-pay.test.ts:66-111 (5 test: không hạn/ghi chú; 404 chung; token ngắn; đã đủ; chưa liên kết); quy tắc poll pin tại ✅ [S60] apps/web/src/components/modals/invoice-payment-modal.test.tsx:140-186 (5s/15m cap, dừng khi đủ, reset khi quay lại tab).
- Sources: [S16] apps/server/src/routes/public-pay.ts:10-56; [S17] apps/web/src/routes/pay.$token.tsx:25-116; [S64] apps/server/src/app.ts:423 (mount ngoài /api).
