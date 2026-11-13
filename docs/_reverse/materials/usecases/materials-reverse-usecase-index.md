---
feature: materials
type: reverse-usecase-index
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# usecases/materials-reverse-usecase-index — materials

| UC | Tên | Actor | Flow | Ghi chú |
|---|---|---|---|---|
| UC-01 | Xem và tìm kiếm ngân hàng tài liệu | Giáo viên, Trợ giảng | F1 | Đọc-thuần; bộ lọc sống trong URL; vai chỉ-đọc không thấy nút ghi |
| UC-02 | Tổ chức thư mục tài liệu | Giáo viên có quyền ghi | F3 | Tạo con/gốc, đổi tên, di chuyển, xóa chỉ-khi-rỗng |
| UC-03 | Thêm liên kết vào ngân hàng | Giáo viên có quyền ghi | — | Luồng đơn POST /materials/links (FR-10); kiểm URL an toàn |
| UC-04 | Tải file lên ngân hàng | Giáo viên có quyền ghi | F2 | Kiểm trước ở client + 4 lớp kiểm ở server |
| UC-05 | Sửa tài liệu | Giáo viên có quyền ghi | — | Chỉ tiêu đề/mô tả/thư mục; loại và object không đổi |
| UC-06 | Xóa tài liệu | Giáo viên có quyền ghi | F6 | Chặn khi đang dùng; xóa row trước, object sau |
| UC-07 | Mở / tải file tài liệu | Giáo viên, Trợ giảng | F5 | Range 206/416; media inline, tài liệu attachment |
| UC-08 | Quản lý tài liệu buổi học | Giáo viên có quyền ghi | F4 | Xem direct + giáo trình; gắn/gỡ/tải thẳng; guard nghỉ lễ |
| UC-09 | Học viên xem tài liệu buổi học | Học viên | F7 | Đường API học viên riêng; projection không cột giáo viên |

## Ma trận UC ↔ FR ↔ BR ↔ Error

| UC | FR liên quan | BR liên quan | Error liên quan |
|---|---|---|---|
| UC-01 | FR-01, FR-02, FR-03, FR-04, FR-05, FR-06, FR-07, FR-08, FR-09, FR-26 | BR-01, BR-02, BR-18 | E-01, E-02, E-06, E-29 |
| UC-02 | FR-04, FR-09, FR-15, FR-16, FR-17, FR-25 | BR-01, BR-02, BR-03, BR-04, BR-05 | E-01, E-02, E-05, E-08, E-09, E-10, E-11, E-12, E-13, E-27, E-29 |
| UC-03 | FR-10, FR-25 | BR-01, BR-06, BR-17 | E-01, E-02, E-05, E-08, E-27, E-29 |
| UC-04 | FR-11, FR-24, FR-25, FR-26 | BR-01, BR-02, BR-07, BR-08, BR-09, BR-10, BR-19 | E-01, E-02, E-08, E-20, E-21, E-22, E-23, E-24, E-27, E-28, E-29 |
| UC-05 | FR-12, FR-25 | BR-01, BR-06 | E-01, E-02, E-05, E-07, E-08, E-29 |
| UC-06 | FR-13, FR-25 | BR-01, BR-10, BR-11 | E-01, E-02, E-07, E-14, E-23, E-29 |
| UC-07 | FR-14, FR-25 | BR-01, BR-02, BR-07 | E-01, E-02, E-07, E-23, E-25 |
| UC-08 | FR-18, FR-19, FR-20, FR-21, FR-25, FR-26 | BR-01, BR-02, BR-11, BR-12, BR-13, BR-14 | E-01, E-02, E-05, E-06, E-07, E-15, E-16, E-17, E-18, E-19, E-20, E-21, E-22, E-23, E-24, E-29 |
| UC-09 | FR-22, FR-23 | BR-01, BR-15, BR-16 | E-01, E-18, E-23, E-25, E-26 |

Ghi chú phạm vi:

- 9 UC phủ toàn bộ 26 FR; không có FR mồ côi. FR-24 (kiểm trước ở client) và
  FR-26 (quyền trên UI) là yêu cầu ngang, gắn vào UC ghi tương ứng.
- Không có UC riêng cho học viên ở trang /materials: học viên bị 403 qua gate vai
  khi chạm ngân hàng; đường đọc của họ là UC-09 (đường API học viên riêng).
- Tạo buổi học KÈM tài liệu và soạn nội dung giáo trình (gắn/gỡ tài liệu khỏi
  bài) thuộc feature Lớp học / Syllabus — mượn component MaterialPicker và ghi
  bảng syllabus_lesson_material, không lập UC ở đây (spec Mục 1 — Ngoài phạm vi).
- E-01/E-02 áp cho mọi UC ghi; liệt kê trọn để matrix tra cứu được độc lập.
- E-03 (415 sai Content-Type JSON) và E-04 (thân JSON hỏng) là lỗi giao thức ở
  tầng parse, trả trước khi vào nghiệp vụ nên cố ý không gắn UC cụ thể.
