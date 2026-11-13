---
feature: reports
type: reverse-usecase-index
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# usecases/reports-reverse-usecase-index — reports

| UC | Tên | Actor | Flow | Ghi chú |
|---|---|---|---|---|
| UC-01 | Xem báo cáo doanh thu | Giáo viên có quyền tài chính | F1, F3, F4 | Đọc-thuần: không có hành động ghi nào thuộc feature |
| UC-02 | Đổi kỳ xem (Tháng/Quý/Năm) | Giáo viên có quyền tài chính | F2 | Kỳ sống trong địa chỉ; share được |
| UC-03 | Giữ kỳ khi sang chi tiết hóa đơn và về | Giáo viên có quyền tài chính | F2 | Hành vi đã chốt #345; màn chi tiết thuộc tuition-invoicing |
| UC-04 | Bị chặn vì thiếu quyền tài chính | Trợ giảng / giáo viên phụ trách | F1 | Cổng 2 tầng: dữ liệu server + giao diện client |
| UC-05 | Trang rỗng hoặc dữ liệu mốc hỏng | Giáo viên có quyền tài chính | F3 | Không bao giờ im lặng với chỉ số tài chính (FR-07) |

## Ma trận UC ↔ FR ↔ BR ↔ Error

| UC | FR liên quan | BR liên quan | Error liên quan |
|---|---|---|---|
| UC-01 | FR-01, FR-03, FR-04, FR-05, FR-06, FR-07, FR-11, FR-13, FR-14 | BR-01, BR-02, BR-03, BR-07 | E-03, E-04, E-05, E-06, E-07 |
| UC-02 | FR-05, FR-08, FR-09 | BR-04, BR-06 | E-02 |
| UC-03 | FR-12 | BR-06 | — |
| UC-04 | FR-02 | BR-05 | E-01 |
| UC-05 | FR-07, FR-10 | — | E-03, E-04 |

Kiểm mồ côi (chạy thủ công trước khi giao):

- FR-01..FR-14: mỗi FR xuất hiện ít nhất 1 dòng UC ở trên — không mồ côi.
- BR-01..BR-07: đủ 7 BR phân bố UC-01/02/04 — không mồ côi.
- E-01..E-07: đủ 7 E phân bố UC-01/02/04/05 — không mồ côi; E-07 (chủ trương
  e2e không assert SVG) gắn UC-01 vì thuộc nghiệm thu màn chính.

Ghi chú phạm vi:

- Không có UC cho phụ huynh/học viên: không màn hình doanh thu nào ngoài app
  giáo viên (negative-search #7 trong reverse-gaps.md).
- Không có UC tạo/sửa/xóa báo cáo: feature chỉ ĐỌC; mọi hành động ghi nằm ở
  tuition-invoicing (FR-14).
- Không có UC nhận báo cáo định kỳ hay xuất tệp: không tồn tại (negative-search
  #1, #5, #6).
- UC-02/UC-03 cùng tài nguyên nhưng tách làm hai UC vì hai ý định khác nhau:
  đổi kỳ NHÌN NHANH và giữ ngữ cảnh khi RỜI trang (FR-12).
