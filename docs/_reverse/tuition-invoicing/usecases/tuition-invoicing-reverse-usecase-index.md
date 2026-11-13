# Danh mục use case — tuition-invoicing

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

## Danh sách UC

| UC | Tên | Actor chính | Flow | File chi tiết |
|---|---|---|---|---|
| UC-01 | Tạo hóa đơn học phí | Người tài chính | F1 | usecases/uc-01-tao-hoa-don-hoc-phi.md |
| UC-02 | Theo dõi doanh thu và KPI | Người tài chính | F4 (phần KPI) | usecases/uc-02-theo-doi-doanh-thu-va-kpi.md |
| UC-03 | Đánh dấu đã thu thủ công | Người tài chính | F4 | usecases/uc-03-danh-dau-da-thu.md |
| UC-04 | Xem chi tiết hóa đơn, QR và lịch sử giao dịch | Người tài chính | F2 | usecases/uc-04-xem-chi-tiet-hoa-don-va-qr.md |
| UC-05 | Quản lý liên kết thanh toán công khai (copy/xoay) | Người tài chính | F2 (xoay) | usecases/uc-05-quan-ly-lien-ket-cong-khai.md |
| UC-06 | Ghi nhận phiếu thu từng phần | Người tài chính | F5 | usecases/uc-06-ghi-nhan-phieu-thu-tung-phan.md |
| UC-07 | Xử lý giao dịch chưa khớp (gán/bỏ qua) | Người tài chính | F6 | usecases/uc-07-xu-ly-giao-dich-chua-khop.md |
| UC-08 | Đối soát tài khoản ngân hàng | Người tài chính | F7 | usecases/uc-08-doi-soat-tai-khoan-ngan-hang.md |
| UC-09 | Quản lý sổ công nợ (lọc/tìm/chọn) | Người tài chính | F8 | usecases/uc-09-quan-ly-so-cong-no.md |
| UC-10 | Gửi nhắc học phí hàng loạt | Người tài chính | F8 (nhắc) | usecases/uc-10-gui-nhac-hoc-phi-hang-loat.md |
| UC-11 | Xem dòng thời gian học viên | Người tài chính | F9 | usecases/uc-11-xem-dong-thoi-gian-hoc-vien.md |
| UC-12 | Phụ huynh thanh toán qua liên kết công khai | Phụ huynh | F10 | usecases/uc-12-phu-huynh-thanh-toan-lien-ket-cong-khai.md |

## Ma trận UC ↔ FR ↔ BR ↔ Error

| UC | FR | BR | Error | NFR |
|---|---|---|---|---|
| UC-01 | FR-01, FR-13 | BR-13, BR-16 | E-001, E-002, E-003, E-007, E-008, E-017, E-018 | NFR-01 |
| UC-02 | FR-02, FR-03, FR-11, FR-13 | BR-01, BR-02, BR-04, BR-08 | E-023, E-024 | NFR-04, NFR-06, NFR-08 |
| UC-03 | FR-03, FR-13 | BR-01, BR-09, BR-15 | E-004, E-007, E-008, E-024 | NFR-01, NFR-06 |
| UC-04 | FR-04, FR-13, FR-14 | BR-03, BR-10, BR-12, BR-17 | E-004, E-026 | NFR-05 |
| UC-05 | FR-04, FR-13 | BR-12 | E-004, E-030 | NFR-03 |
| UC-06 | FR-07, FR-13 | BR-01, BR-03, BR-10, BR-14 | E-010, E-011, E-012, E-019, E-020, E-021, E-022, E-024 | NFR-02 |
| UC-07 | FR-05, FR-06, FR-13 | BR-03, BR-11, BR-15 | E-005, E-006, E-007, E-008, E-009, E-029 | NFR-01, NFR-02, NFR-05 |
| UC-08 | FR-05, FR-13 | BR-11 | E-007, E-008, E-015, E-028 | NFR-02, NFR-09 |
| UC-09 | FR-08, FR-13 | BR-04, BR-05, BR-06, BR-07 | E-023 | NFR-04, NFR-07 |
| UC-10 | FR-10, FR-13 | BR-05, BR-06, BR-07 | E-007, E-008, E-016, E-025 | NFR-01, NFR-04 |
| UC-11 | FR-09, FR-13 | BR-03, BR-05 | E-013 | NFR-04, NFR-05, NFR-07 |
| UC-12 | FR-12, FR-04 | BR-11, BR-12 | E-014, E-027 | NFR-03, NFR-05 |

Đủ vết: 14/14 FR xuất hiện ≥1 UC; 17/17 BR xuất hiện ≥1 UC; 30/30 E xuất hiện ≥1 UC. FR-13 (phân quyền) và các E-007/E-008 (401/403) là vết ngang áp cho mọi UC gọi API tài chính ✅ [S28] packages/auth/src/role.ts:75-87, [S29] apps/server/src/lib/require-finance-role.ts:10-26.
