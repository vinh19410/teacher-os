---
feature: student-tuition
type: reverse-usecase-index
status: draft
author: vinh19410
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# usecases/student-tuition-reverse-usecase-index — student-tuition

| UC | Tên | Actor | Flow | Ghi chú |
|---|---|---|---|---|
| UC-01 | Xem danh sách hóa đơn học phí | Học viên | F1 | Điểm vào chính của phân hệ A; đọc-thuần |
| UC-02 | Xem chi tiết phiếu học phí và QR | Học viên | F2 | Trạng thái đích của mọi khoản chưa xong |
| UC-03 | Nhận tiền về tự động khi đang xem | Học viên | F3 | Poll 5s / tab hiển thị / cap 15 phút |
| UC-04 | Vào mục học phí từ thông báo | Học viên | F4, F1 | Điểm vào thứ hai; linkPath cố định |
| UC-05 | Xem tổng hợp học phí theo lớp trên hồ sơ học viên | Giáo viên | F5 | Phân hệ B (#347) |
| UC-06 | Mở hóa đơn từ hồ sơ học viên | Giáo viên | F6 | Mở chi tiết hóa đơn phía giáo viên trong cùng app web (cross-ref tuition-invoicing) |

## Ma trận UC ↔ FR ↔ BR ↔ Error

| UC | FR liên quan | BR liên quan | Error liên quan |
|---|---|---|---|
| UC-01 | FR-01, FR-02, FR-03, FR-04, FR-05, FR-06, FR-07, FR-08, FR-09, FR-10, FR-11, FR-12, FR-13 | BR-01, BR-02, BR-03, BR-04, BR-05, BR-09 | E-01..E-07 |
| UC-02 | FR-14, FR-15, FR-16, FR-17, FR-18, FR-19, FR-20, FR-21, FR-22, FR-23, FR-24, FR-25 | BR-01, BR-04, BR-05, BR-06 | E-08, E-09, E-10, E-11, E-13 |
| UC-03 | FR-14, FR-19, FR-26, FR-23 | BR-04, BR-05, BR-06 | E-10 |
| UC-04 | FR-01, FR-02 (đích F1) | BR-01, BR-02 | — |
| UC-05 | FR-27, FR-28, FR-29, FR-30, FR-31, FR-32, FR-33 | BR-07, BR-08, BR-09, BR-10, BR-11 | E-12 |
| UC-06 | FR-33 | BR-01 | — |

Ghi chú:

- UC-03 không phải hành động người dùng — là hành vi tự động gắn với UC-02; đặc tả riêng
  vì có máy trạng thái + cap riêng (srs/...states.md máy 3).
- UC-05/UC-06 thuộc phân hệ B; kernel tính tiền dùng chung với trang Doanh thu (INF-1).
- UC-06 mở chi tiết hóa đơn PHÍA GIÁO VIÊN (cùng app web) — không nối sang UC-02/F2 của
  portal; khối chi tiết đó thuộc tuition-invoicing (S2 của bộ đó).
