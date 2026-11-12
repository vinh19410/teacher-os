---
feature: student-history
type: reverse-usecases
status: draft
author: vinh19410
updated: "2026-11-12"
source_commit: "develop d6c0f6b5"
---

# Chỉ mục use case — student-history

| UC | Tên | Actor | Luồng |
|----|-----|-------|-------|
| UC-01 | Xem tổng quan hoạt động học tập | Học viên | F1 |
| UC-02 | Xem tuần theo kỹ năng sau khi chọn ngày | Học viên | F3 |
| UC-03 | Lọc và phân trang danh sách hoạt động | Học viên | F4 |
| UC-04 | Xem lại nhận xét bài Writing đã chấm | Học viên | F5 |
| UC-05 | Vào lịch sử từ trang luyện tập | Học viên | F6 |
| UC-06 | Hoạt động mới xuất hiện trong lịch sử | Học viên | F7 |

## Ma trận truy vết UC ↔ FR ↔ BR ↔ E

| UC | FR | BR | E |
|----|----|----|---|
| UC-01 | FR-01, FR-02, FR-03, FR-04, FR-05, FR-06, FR-07 | BR-01, BR-03, BR-04, BR-11, BR-12 | E-01..E-03, E-08, E-11 |
| UC-02 | FR-08, FR-09, FR-10, FR-22 | BR-01, BR-05, BR-08 | E-05, E-08 |
| UC-03 | FR-11..FR-16, FR-23, FR-25, FR-26, FR-27, FR-28 | BR-02, BR-06, BR-07, BR-09, BR-10 | E-06, E-07, E-08 |
| UC-04 | FR-17, FR-18, FR-19, FR-30 | BR-06 | E-09, E-10 |
| UC-05 | FR-20 | BR-02, BR-04 | E-01..E-03 |
| UC-06 | FR-24, FR-25, FR-28 | BR-01, BR-02, BR-05 | (không có lỗi riêng — read-model) |

## Ghi chú phạm vi (superset)

- Bề mặt **viết** (nộp bài luyện tập, làm bài trong lớp, ôn từ, giáo viên chấm) thuộc bộ `docs/_reverse/student-practice/`; các UC ở đây chỉ đặc tả bề mặt đọc của phase 11.
- Guard học viên (401/403, header org) dùng chung mọi route `/api/student` — được đặc tả đầy đủ ở bộ student-practice; tại đây chỉ trích bằng chứng ảnh hưởng trực tiếp tới lịch sử (FR-29).
- Không có use case quản trị cho dữ liệu lịch sử (NEG-03: không consumer nào ngoài app học viên).
