---
feature: admin-library
type: reverse-usecase-index
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# usecases/admin-library-reverse-usecase-index — admin-library

| UC | Tên | Actor | Flow | Ghi chú |
|---|---|---|---|---|
| UC-01 | Xem và lọc danh sách đề | Admin | F1 | Điểm vào chính; đọc-thuần |
| UC-02 | Tạo bộ đề mới | Admin | F2, UC-03 | Tạo xong rẽ thẳng vào soạn |
| UC-03 | Soạn nội dung part và nhóm câu | Admin | F3 | Luồng nặng nhất; chốt nhóm hỏng |
| UC-04 | Quản lý audio part nghe | Admin | F4 | Chỉ đề nghe; CAS + dọn nền |
| UC-05 | Xuất bản hoặc hạ ngược đề | Admin | F5 | Cửa draft↔ready duy nhất |
| UC-06 | Xóa đề và xóa part | Admin | F6 | Chặn theo trạng thái |
| UC-07 | Quản lý bài tập thư viện và bộ đề hệ thống | Admin | F7, F8 | Trang /library/packs; BR-13/BR-14 |
| UC-08 | Xem trước bộ đề | Admin | F9 | Phục vụ UC-03/UC-05 |

## Ma trận UC ↔ FR ↔ BR ↔ Error

| UC | FR liên quan | BR liên quan | Error liên quan |
|---|---|---|---|
| UC-01 | FR-01, FR-02, FR-03, FR-05 | (không có BR riêng — UC đọc-thuần) | E-01, E-02, E-03, E-06, E-24 |
| UC-02 | FR-01, FR-03, FR-04, FR-06, FR-07 | BR-01, BR-02, BR-03 | E-03, E-04, E-05, E-06 |
| UC-03 | FR-01, FR-03, FR-04, FR-08, FR-09, FR-10, FR-14, FR-15, FR-16, FR-18, FR-19, FR-37, FR-38, FR-40 | BR-01, BR-04, BR-05, BR-06, BR-09 | E-05, E-06, E-07, E-08, E-10, E-11, E-12, E-13 |
| UC-04 | FR-01, FR-03, FR-22, FR-23, FR-24, FR-25, FR-26, FR-27, FR-28, FR-39 | BR-07, BR-08, BR-10 | E-06, E-07, E-09, E-14, E-15, E-16, E-17, E-19, E-20 |
| UC-05 | FR-01, FR-03, FR-04, FR-11, FR-12, FR-13, FR-40 | BR-04, BR-05, BR-06, BR-09 | E-08, E-11, E-12 |
| UC-06 | FR-01, FR-03, FR-13, FR-20, FR-21 | BR-09, BR-10 | E-06, E-07, E-09 |
| UC-07 | FR-01, FR-03, FR-04, FR-29, FR-30, FR-31, FR-32, FR-33, FR-34 | BR-11, BR-12, BR-13, BR-14, BR-15, BR-16 | E-05, E-21, E-22, E-23, E-24, E-25, E-27 |
| UC-08 | FR-36 | BR-04 | (đọc-thuần, không lỗi nghiệp vụ riêng) |

Ghi chú superset:

- UC-03 là trung tâm: UC-02 kết thúc bằng vào soạn; UC-04/UC-05/UC-08 đều làm trên
  cùng trang soạn (`/library/tests/$testId`).
- UC-07 gộp hai khối (B + C) vì dùng chung một màn hình và chung cơ chế chặn tham
  chiếu; tách chi tiết trong file UC.
- Cổng admin + CSRF là tiền điều kiện của MỌI UC — đặc tả một lần ở spec Mục 2, không
  lặp trong từng UC.
