# UC-10 — Gửi nhắc học phí hàng loạt

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

**a. Mô tả**: Người tài chính chọn nhiều học viên đang nợ và gửi nhắc học phí — đơn vị nhắc là **hóa đơn còn nợ**, chống trùng theo ngày.
- Actor chính: Người tài chính. Actor phụ: Nhật ký thông báo; học viên (người nhận).

**b. Kích hoạt & điều kiện trước**: tick ≥1 dòng còn nợ → nút "Gửi nhắc học phí (n)"; modal xác nhận.

**c. Luồng chính**:
1. Xác nhận hiển thị tổng số hóa đơn sẽ nhận.
2. Máy chủ gom hóa đơn còn nợ của từng học viên (chia lô 50 dòng), tối đa 100 học viên không trùng.
3. Mỗi hóa đơn 1 thông báo với khóa chống trùng theo ngày Việt Nam.
4. Trả {queued, skipped}; toast kèm số đã nhắc hôm nay + link nhật ký; bỏ tick.

**d. Luồng thay thế/ngoại lệ**:
- 4a. Gọi lại cùng ngày → queued=0, thông báo "đã được gửi nhắc học phí trong hôm nay" ✅ [S51] apps/server/src/routes/debt-reminders.test.ts:336-366, [S56] apps/web/src/routes/_auth/debts/index.test.tsx:468-501.
- 2a. Body rỗng/trùng id/vượt 100 → 400 ✅ [S51] apps/server/src/routes/debt-reminders.test.ts:368-386.
- 3a. Lọc lớp khi chọn lớp: chỉ hóa đơn còn nợ thuộc lớp đó, dùng đúng số còn nợ ✅ [S51] apps/server/src/routes/debt-reminders.test.ts:310-335.
- 4b. Lỗi mạng → "Không gửi được nhắc học phí. Vui lòng thử lại." ✅ [S3] apps/web/src/routes/_auth/debts/index.tsx:292-293.
- 2b. Không kiểm trạng thái đăng ký của học viên đã rời lớp 🟡 → OQ-05.

**e. Hậu điều kiện**: nhật ký thông báo có mục mới cho từng hóa đơn; nhắc lại trong ngày không nhân đôi.

**f. Quy tắc nghiệp vụ**: BR-05, BR-06 (badge hạn phản ánh cùng dữ liệu), BR-07.

**g. Yêu cầu**: FR-10, FR-13; NFR-01, NFR-04.

**h. Truy vết**:
- Flow: F8 (phần nhắc). Error: E-016, E-025.
- Test: ✅ [S51] apps/server/src/routes/debt-reminders.test.ts:310-395 (4 test); ✅ [S56] apps/web/src/routes/_auth/debts/index.test.tsx:400-501 (tick, xác nhận, link nhật ký, skipped note).
- Sources: [S7] apps/server/src/routes/kernel.ts:3393-3488; [S30] apps/server/src/lib/notifications/templates.ts:40-54.
