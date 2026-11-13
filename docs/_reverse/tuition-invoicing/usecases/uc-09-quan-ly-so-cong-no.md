# UC-09 — Quản lý sổ công nợ (lọc/tìm/chọn)

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

**a. Mô tả**: Người tài chính xem nợ theo học viên: 3 KPI, chip trạng thái, lọc lớp, tìm không dấu, chọn dòng để thao tác (thu, xem dòng thời gian, nhắc).
- Actor chính: Người tài chính. Actor phụ: —.

**b. Kích hoạt & điều kiện trước**: mở `/_auth/debts`; quyền tài chính.

**c. Luồng chính**:
1. Tính sổ nợ mỗi học viên từ snapshot: tổng phải đóng, đã thu, còn nợ, hạn gần nhất, trạng thái 4 mức.
2. Áp lọc lớp + từ khóa **trước**, rồi mới tính chip trạng thái và KPI (KPI theo đúng phạm vi đang lọc).
3. Bảng: tiền còn nợ, hạn + badge màu, trạng thái; dòng đã đủ có ô kiểm khóa.
4. Bấm dòng → sang hồ sơ học viên; nút con mắt → drawer (UC-11); nút Thu → phiếu thu (UC-06).
5. Tìm không dấu debounce; chip/lớp đồng bộ URL.

**d. Luồng thay thế/ngoại lệ**:
- 1a. Không đủ quyền → toast + về bảng điều khiển, không render bảng ✅ [S56] apps/web/src/routes/_auth/debts/index.test.tsx:351-372.
- 2a. Vào URL có sẵn chip/lớp → lọc đúng ngay, KPI theo lớp ✅ [S56] apps/web/src/routes/_auth/debts/index.test.tsx:225-296.
- 2b. Không có hóa đơn / lọc không khớp → 2 trạng thái rỗng ✅ [S56] apps/web/src/routes/_auth/debts/index.test.tsx:337-350.
- 4a. KPI mang nhãn "kỳ này" nhưng tính mọi hóa đơn 🟡 → OQ-10.

**e. Hậu điều kiện**: người dùng có danh sách nợ chính xác theo phạm vi chọn; các dòng còn nợ sẵn sàng cho UC-06/10/11.

**f. Quy tắc nghiệp vụ**: BR-04, BR-05, BR-06 (ngưỡng 7 ngày), BR-07 (phạm vi KPI).

**g. Yêu cầu**: FR-08, FR-13; NFR-04, NFR-07.

**h. Truy vết**:
- Flow: F8. Error: E-023.
- Test: ✅ [S56] apps/web/src/routes/_auth/debts/index.test.tsx:168-399 (11 test: KPI + 4 badge; chip → URL; vào URL lọc sẵn; tìm debounce không dấu; lớp → KPI riêng; điều hướng dòng vs drawer; 2 trạng thái rỗng; gate quyền; ô kiểm khóa dòng đủ; tick + nút nhắc).
- Sources: [S3] apps/web/src/routes/_auth/debts/index.tsx:224-297, 301-612; [S18] apps/web/src/lib/tuition-from-kernel.ts:409-497, 524-686.
