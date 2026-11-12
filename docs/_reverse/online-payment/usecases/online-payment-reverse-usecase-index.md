---
type: reverse-usecase-index
feature: online-payment
status: draft
updated: 2026-11-12
---
# online-payment — Use case index (reverse)

| UC | Tên | Actor chính | File chi tiết | Nhãn |
|----|-----|-------------|---------------|------|
| UC-01 | Liên kết / hủy / khôi phục tài khoản ngân hàng nhận tiền | Giáo viên (vai trò tài chính) | `uc-01-lien-ket-tai-khoan-ngan-hang.md` | ✅ |
| UC-02 | Nhận và tự khớp giao dịch ngân hàng qua webhook | Hệ thống SePay Bank Hub | `uc-02-nhan-giao-dich-qua-webhook.md` | ✅ |
| UC-03 | Thanh toán qua link công khai | Phụ huynh (chưa đăng nhập) | `uc-03-thanh-toan-qua-link-cong-khai.md` | ✅ |
| UC-04 | Đối soát giao dịch và xử lý hàng chờ chưa khớp | Giáo viên (vai trò tài chính) | `uc-04-doi-soat-va-hang-cho.md` | ✅ |
| UC-05 | Thu học phí thủ công (tiền mặt / kênh khác) | Giáo viên (vai trò tài chính) | `uc-05-thu-hoc-phi-thu-cong.md` | ✅ |

## Ma trận UC × FR

| FR | UC-01 | UC-02 | UC-03 | UC-04 | UC-05 |
|----|-------|-------|-------|-------|-------|
| FR-op-001 sự kiện vòng đời | X | | | | |
| FR-op-002 nhận IPN | | X | | | |
| FR-op-003 xác thực webhook | | X | | | |
| FR-op-004 chống trùng | | X | | X | |
| FR-op-005 trích mã học phí | | X | | X | |
| FR-op-006 cách ly tổ chức | | X | | X | |
| FR-op-007 tính lại hóa đơn | | X | | X | X |
| FR-op-008 phân loại chưa khớp | | X | | X | |
| FR-op-009 lọc giao dịch vô nghĩa | | X | | X | |
| FR-op-010 trang công khai | | | X | | |
| FR-op-011 thu hồi/cấp lại link | | | X | | |
| FR-op-012 QR realtime | | | X | | |
| FR-op-013 tự cập nhật trạng thái | | | X | | |
| FR-op-014 phiên hosted + whitelist nguồn | X | | | | |
| FR-op-015 4 trạng thái liên kết | X | X | | | |
| FR-op-016 hủy/khôi phục + nhớ tài khoản cũ | X | | | X | |
| FR-op-017 đối soát 7 ngày | | | | X | |
| FR-op-018 hàng chờ gán/bỏ qua | | | | X | |
| FR-op-019 phiếu thủ công | | | | | X |
| FR-op-020 lịch sử giao dịch hóa đơn | | | | X | X |
| FR-op-021 cổng mô phỏng dev | | X | | X | |
| FR-op-022 gate vai trò tài chính | X | | | X | X |

## Ghi chú superset

- UC-01 ⊃ UC-02 về sự kiện vòng đời: trạng thái liên kết chỉ đổi khi webhook sự kiện đến, nhưng UC-01 cũng bao gồm đường đồng bộ chủ động (nút sync). — ✅ [S3] `apps/server/src/routes/bank-link.ts:141-148,346-368`.
- UC-02 ⊃ UC-04: đối soát tái dùng đúng đường ingest của IPN, chỉ khác chế độ giữ giao dịch không mã. — ✅ [S4] `apps/server/src/lib/payments/ingest-transaction.ts:32-39`.
- UC-03 ⊃ UC-02 về mặt hiển thị: trang công khai chỉ đọc trạng thái mà UC-02 ghi vào. — ✅ [S2] `apps/server/src/routes/public-pay.ts:41-45`.
- UC-05 độc lập với UC-02 ở đường ghi nhưng chung một bảng sổ và chung phép tính lại hóa đơn. — ✅ [S4] `apps/server/src/lib/payments/recompute-invoice.ts:19-38`.
