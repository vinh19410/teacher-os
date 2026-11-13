# UC-11 — Xem dòng thời gian học viên

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

**a. Mô tả**: Người tài chính xem toàn bộ diễn biến tài chính của một học viên: các lần phát hành hóa đơn và các lần thu tiền, mới nhất trước, nhóm theo tháng.
- Actor chính: Người tài chính. Actor phụ: —.

**b. Kích hoạt & điều kiện trước**: nút con mắt trên dòng nợ (không điều hướng dòng).

**c. Luồng chính**:
1. Máy chủ lấy tối đa 200 sự kiện phát hành + 200 mục thu, sắp mới nhất trước; cùng mốc thì thu tiền đứng trước phát hành.
2. Mục thu từ luồng ngân hàng bị che nội dung/phương thức/nguồn; phiếu thu hiện nhãn phương thức + ghi chú.
3. Drawer hiện 3 ô tổng, nhóm theo tháng (giờ Việt Nam), link sang chi tiết từng hóa đơn.

**d. Luồng thay thế/ngoại lệ**:
- 1a. Học viên lạ/org khác → 404 không phân biệt ✅ [S52] apps/server/src/routes/billing-timeline.test.ts:356-365.
- 1b. Chưa có hóa đơn → danh sách rỗng ✅ [S52] apps/server/src/routes/billing-timeline.test.ts:347-355.
- 1c. Chưa đăng nhập/vai lạ → 401/403 ✅ [S52] apps/server/src/routes/billing-timeline.test.ts:379-390.
- 2a. Bấm con mắt không kích hoạt điều hướng dòng ✅ [S56] apps/web/src/routes/_auth/debts/index.test.tsx:373-399.

**e. Hậu điều kiện**: người dùng truy được lịch sử đủ để giải trình với phụ huynh mà không lộ dữ liệu thô ngân hàng.

**f. Quy tắc nghiệp vụ**: BR-03 (ô tổng), BR-05 (ngữ cảnh trạng thái).

**g. Yêu cầu**: FR-09, FR-13; NFR-04, NFR-05, NFR-07.

**h. Truy vết**:
- Flow: F9. Error: E-013.
- Test: ✅ [S52] apps/server/src/routes/billing-timeline.test.ts:267-390 (5 test: thứ tự + nguồn/phương thức; che dữ liệu nhạy; rỗng; 404; 401/403).
- Sources: [S7] apps/server/src/routes/kernel.ts:3270-3387; [S25] apps/web/src/components/debts/billing-timeline-drawer.tsx:78-354.
