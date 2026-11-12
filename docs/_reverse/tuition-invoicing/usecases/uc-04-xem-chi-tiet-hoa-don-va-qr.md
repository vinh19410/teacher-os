# UC-04 — Xem chi tiết hóa đơn, QR và lịch sử giao dịch

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

**a. Mô tả**: Người tài chính mở một hóa đơn để xem đủ trường thông tin, 3 ô số, QR chuyển khoản và mọi giao dịch đã khớp vào hóa đơn này.
- Actor chính: Người tài chính. Actor phụ: —.

**b. Kích hoạt & điều kiện trước**: bấm dòng hóa đơn trên trang Doanh thu; hóa đơn thuộc tổ chức của phiên.

**c. Luồng chính**:
1. Nạp thông tin QR của hóa đơn (backfill lười mã/token cho dòng cũ nếu thiếu).
2. Hiển thị: mã đầy đủ, học viên, lớp, hạn, ghi chú, trạng thái; 3 ô số phải đóng/đã thu/còn lại; ghi chú thu thủ công nếu có.
3. Nạp lịch sử giao dịch khớp (mới nhất trước) — chỉ trường hiển thị, không dữ liệu thô.
4. Nếu tiền về khi trang đang mở: giá trị số đã thu thay đổi → tự nạp lại snapshot và lịch sử.

**d. Luồng thay thế/ngoại lệ**:
- 1a. Id lạ/org khác → 404 không phân biệt; trang 404 riêng có nút quay lại ✅ [S2] apps/web/src/routes/_auth/tuition/$invoiceId.tsx:93-103.
- 2a. Hóa đơn dòng cũ thiếu ghi chú/ngày/mốc → gạch ngang, không lỗi ✅ [S55] apps/web/src/routes/_auth/tuition/$invoiceId.test.tsx:221-235.
- 3a. Chưa có giao dịch → danh sách rỗng, không lỗi ✅ [S47] apps/server/src/invoice-transactions.test.ts:268-272.
- 4a. Không tải được QR/lịch sử → thông báo lỗi riêng từng khối ✅ [S2] apps/web/src/routes/_auth/tuition/$invoiceId.tsx:280-282, 350-353.

**e. Hậu điều kiện**: người dùng thấy chính xác vị trí nợ; QR luôn dựng từ tài khoản liên kết hiện hành (không lưu QR).

**f. Quy tắc nghiệp vụ**: BR-03 (còn lại kẹp ≥0), BR-10 (nhãn phương thức), BR-12 (QR không lưu), BR-17 (mã ngắn INV-…).

**g. Yêu cầu**: FR-04, FR-13, FR-14; NFR-05.

**h. Truy vết**:
- Flow: F2. Error: E-004, E-026.
- Test: ✅ [S55] apps/web/src/routes/_auth/tuition/$invoiceId.test.tsx:188-234 (đủ trường một phần; mark-paid hiện đủ tiền + ghi chú tay; dòng cũ gạch ngang); ✅ [S47] apps/server/src/invoice-transactions.test.ts:196-272 (8 test: 401/403/404/org; chỉ giao dịch khớp; chỉ trường hiển thị; ISO); ✅ [S46] apps/server/src/invoice-payment.test.ts:142-168 (dòng cũ được cấp mã ổn định khi đọc đầu tiên).
- Sources: [S2] apps/web/src/routes/_auth/tuition/$invoiceId.tsx:142-358; [S14] apps/server/src/lib/payment-instructions.ts:21-116; [S7] apps/server/src/routes/kernel.ts:3212-3264.
