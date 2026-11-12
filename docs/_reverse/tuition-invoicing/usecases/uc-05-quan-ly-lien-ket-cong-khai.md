# UC-05 — Quản lý liên kết thanh toán công khai (copy/xoay)

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

**a. Mô tả**: Người tài chính copy liên kết công khai để gửi phụ huynh, hoặc tạo liên kết mới (xoay token) khi link cũ rò rỉ.
- Actor chính: Người tài chính. Actor phụ: Phụ huynh (người nhận link).

**b. Kích hoạt & điều kiện trước**: modal thu học phí hoặc trang chi tiết; hóa đơn **còn phải thu** thì mới có nút xoay.

**c. Luồng chính**:
1. Bấm copy → link vào clipboard, nhãn nút đổi để phản hồi ✅ [S60] apps/web/src/components/modals/invoice-payment-modal.test.tsx:93-103.
2. Bấm "Tạo liên kết mới" → cảnh báo link cũ sẽ chết → xác nhận.
3. Máy chủ phát token mới; nạp lại dữ liệu QR.
4. Link cũ từ giờ trả 404 chung.

**d. Luồng thay thế/ngoại lệ**:
- 2a. Hủy xác nhận → không thay đổi gì, trạng thái xác nhận nằm nội bộ và reset khi mở lại ✅ [S60] apps/web/src/components/modals/invoice-payment-modal.test.tsx:104-124, 125-139.
- 1a. Hóa đơn đã đủ → footer thao tác ẩn (chỉ còn xem QR) ✅ [S55] apps/web/src/routes/_auth/tuition/$invoiceId.test.tsx:252-258.
- 3a. Id lạ → 404 ✅ [S7] apps/server/src/routes/kernel.ts:3196-3209.

**e. Hậu điều kiện**: đúng một token hiệu lực cho hóa đơn; an toàn: token đủ dài, không đoán được.

**f. Quy tắc nghiệp vụ**: BR-12 (QR/link luôn theo trạng thái hiện hành).

**g. Yêu cầu**: FR-04, FR-13; NFR-03.

**h. Truy vết**:
- Flow: F2 (phần xoay). Error: E-004, E-030.
- Test: ✅ [S55] apps/web/src/routes/_auth/tuition/$invoiceId.test.tsx:252-266 (đã đủ giữ copy ẩn xoay; còn nợ có luồng xác nhận); ✅ [S60] apps/web/src/components/modals/invoice-payment-modal.test.tsx:84-139 (QR + copy + xoay + reset); ✅ [S46] apps/server/src/invoice-payment.test.ts:196-218 (xoay cấp token mới, giới hạn org).
- Sources: [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:196-252; [S15] packages/api/src/lib/payment-code.ts:35-43.
