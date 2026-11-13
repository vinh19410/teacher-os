# UC-02 — Theo dõi doanh thu và KPI

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

**a. Mô tả**: Người tài chính mở trang Doanh thu để xem 4 chỉ số (đã thu, còn phải thu, số hóa đơn chưa đủ tiền, doanh thu theo kỳ) và bảng gói học/bảng hóa đơn.
- Actor chính: Người tài chính. Actor phụ: —.

**b. Kích hoạt & điều kiện trước**: mở `/_auth/tuition`; quyền tài chính đã kiểm trước khi render.

**c. Luồng chính**:
1. Nạp snapshot hóa đơn + lớp.
2. Tính chỉ số: đã thu = tổng tiền đã thu theo quy tắc trạng thái; còn phải thu chỉ cộng hóa đơn **chưa** đánh dấu đủ.
3. Đếm "chưa khớp" = số hóa đơn chưa đủ tiền (cùng tiêu chí với danh sách cho phép gán).
4. Biểu đồ doanh thu chọn kỳ 12 tháng/8 quý/5 năm; mốc thời gian hỏng bị đếm "dropped", không bỏ im lặng.
5. Bảng hóa đơn hiển thị mã ngắn, học viên, hạn (dd/mm), số tiền, trạng thái, còn lại.

**d. Luồng thay thế/ngoại lệ**:
- 2a. Trạng thái lạ trên dữ liệu cũ → tính vào còn phải thu (an toàn) ✅ [S18] apps/web/src/lib/tuition-from-kernel.ts:44-46.
- 1a. Không đủ quyền → toast + chuyển về bảng điều khiển, không render ✅ [S27] apps/web/src/lib/use-finance-route-guard.ts:12-30.
- 4a. Nợ 0 đồng là trung tính, không tô đỏ ✅ [S54] apps/web/src/routes/_auth/tuition/index.test.tsx:83-102.

**e. Hậu điều kiện**: người dùng có bức tranh nợ hiện tại; mọi con số truy được về kho dữ liệu máy chủ (không tự chế).

**f. Quy tắc nghiệp vụ**: BR-01, BR-02, BR-04, BR-08.

**g. Yêu cầu**: FR-02, FR-03, FR-11, FR-13; NFR-04, NFR-06, NFR-08.

**h. Truy vết**:
- Flow: F4 (KPI đổi chiều sau mark-paid). Error: E-023, E-024.
- Test: ✅ [S54] apps/web/src/routes/_auth/tuition/index.test.tsx:67-101 (KPI từ dữ liệu; nợ 0 trung tính); ✅ [S57] apps/web/src/lib/tuition-from-kernel.test.ts:1-1470 (64 test mọi helper KPI/kỳ/trạng thái); ✅ [S62] apps/web/src/lib/format-invoice.test.ts:36-41 (bảng nhãn trạng thái khớp badge).
- UI sources: [S1] apps/web/src/routes/_auth/tuition/index.tsx:40-90, 342-376; [S18] apps/web/src/lib/tuition-from-kernel.ts:34-48, 112-184; [S40] apps/web/src/components/tuition/revenue-chart.tsx:1-258; [S44] apps/web/src/lib/mock-data.ts:134-155.
