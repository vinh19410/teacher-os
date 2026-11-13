# UC-07 — Xử lý giao dịch chưa khớp (gán/bỏ qua)

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

**a. Mô tả**: Người tài chính xem các giao dịch ngân hàng chưa khớp mã (kèm lý do) và quyết định gán vào một hóa đơn còn thiếu, hoặc bỏ qua.
- Actor chính: Người tài chính. Actor phụ: —.

**b. Kích hoạt & điều kiện trước**: hàng đợi trên trang Doanh thu có dòng chưa khớp; có hóa đơn còn thiếu để chọn.

**c. Luồng chính**:
1. Hàng đợi hiển thị: thời gian, số tiền, nội dung (che nếu là mã của tổ chức khác), lý do.
2. Chọn hóa đơn mục tiêu → "Gán": dòng sổ trỏ vào hóa đơn và tính lại số đã thu trong một lô.
3. Dòng rời hàng đợi; KPI và bảng cập nhật.
- 2'. "Bỏ qua": các dòng chưa khớp của tổ chức chuyển sang đã bỏ qua — không tính tiền.

**d. Luồng thay thế/ngoại lệ**:
- 2a. Hóa đơn đã đủ theo sổ → 409 INVOICE_ALREADY_PAID; dòng quay lại hàng đợi sau nạp lại (nút client không đọc body lỗi 🟡 → OQ-16).
- 2b. Gán hai lần / dòng đã xử lý → 404 ✅ [S48] apps/server/src/payment-transactions.test.ts:192-202.
- 2c. Chưa đăng nhập/vai lạ → 401/403 ✅ [S48] apps/server/src/payment-transactions.test.ts (guard route).
- 1a. Nhãn lý do hiển thị: "Mã không tồn tại"/"Phiếu đã đủ tiền"/"Không có mã học phí"/"Chuyển khoản lạ" ✅ [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:254-259.

**e. Hậu điều kiện**: tiền được ghi nhận vào đúng khoản; bỏ qua không đụng tiền; payload ngân hàng bị xóa trắng khi dòng khớp (giữ tối thiểu dữ liệu nhạy).

**f. Quy tắc nghiệp vụ**: BR-03, BR-11 (đã đủ chặn, còn thiếu cho bù), BR-15.

**g. Yêu cầu**: FR-05, FR-06, FR-13; NFR-01, NFR-02, NFR-05.

**h. Truy vết**:
- Flow: F6. Error: E-005, E-006, E-009, E-029.
- Test: ✅ [S48] apps/server/src/payment-transactions.test.ts:137-221 (5 test: liệt kê + che mã lạ; gán tính lại; đủ 409; gán 2 lần 404; bỏ qua chỉ dòng org); ✅ [S73] apps/server/src/bank-hub-ipn.test.ts:264-280 (đủ → hàng đợi kèm lý do, hóa đơn nguyên vẹn); ✅ [S49] apps/server/src/lib/payments/manual-payment.test.ts:269-281 (dòng chưa khớp không tính tiền).
- Sources: [S4] apps/server/src/routes/payment-transactions.ts:47-149; [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:265-445.
