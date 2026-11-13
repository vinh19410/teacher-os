---
feature: parent-reports
type: reverse-usecase-index
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# usecases/parent-reports-reverse-usecase-index — parent-reports

| UC | Tên | Actor | Flow | Ghi chú |
|---|---|---|---|---|
| UC-01 | Xem trang Báo cáo phụ huynh | Giáo viên | F1, F2 | Chỉ khả dụng khi cụm bật; đọc-thuần |
| UC-02 | Tạo và gửi báo cáo tuần từ trang báo cáo | Giáo viên | F3 | Hai hành động: Lưu nháp / Gửi báo cáo |
| UC-03 | Tạo báo cáo từ hồ sơ học viên | Giáo viên | F3 | Cùng modal, học viên được chọn sẵn; nút ẩn khi cờ tắt |

## Ma trận UC ↔ FR ↔ BR ↔ Error

| UC | FR liên quan | BR liên quan | Error liên quan |
|---|---|---|---|
| UC-01 | FR-01, FR-02, FR-03, FR-04, FR-05, FR-06 | BR-02, BR-05, BR-07 | E-15, E-16 |
| UC-02 | FR-07, FR-08, FR-09, FR-10, FR-11, FR-12, FR-13, FR-15 | BR-01, BR-02, BR-03, BR-04, BR-06, BR-07, BR-08 | E-01, E-02, E-03, E-04, E-05, E-06, E-07, E-09, E-10, E-11, E-12, E-13, E-14 |
| UC-03 | FR-08, FR-09, FR-10, FR-11, FR-12, FR-14 | BR-01, BR-03, BR-04 | E-09, E-10, E-11, E-12, E-13, E-14 |

Ghi chú phạm vi:

- Cả 3 UC hiện BỊ CHẶN bởi cờ cụm (UC-03 ở mức nút + modal đều bọc cờ) — đặc tả
  mô tả hành vi khi bật. FR-01/FR-02 chính là đặc tả của việc bị chặn.
- Không có UC cho phụ huynh/học viên: họ không đăng nhập và không có màn hình báo
  cáo (negative-search #2 trong reverse-gaps.md).
- Không có UC sửa/xóa/gửi lại: hành vi không tồn tại (FR-15, OQ-05).
