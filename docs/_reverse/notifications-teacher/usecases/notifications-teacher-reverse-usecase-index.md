# usecases/notifications-teacher-reverse-usecase-index — notifications-teacher

| UC | Tên | Actor | Flow | Ghi chú |
|---|---|---|---|---|
| UC-01 | Xem nhật ký thông báo đã gửi | Giáo viên | F1 | Bảng 6 cột + trạng thái màn (loading/empty/lỗi); dữ liệu org-scoped |
| UC-02 | Lọc, tìm kiếm và phân trang nhật ký | Giáo viên | F1 | URL là nguồn trạng thái; debounce 300ms; chip badge theo counts server |
| UC-03 | Xem chi tiết một thông báo | Giáo viên | F2 | Dialog client-only; không đổi dữ liệu |
| UC-04 | Gửi lại một thông báo lỗi | Giáo viên | F3, F6 | Reset nguyên tử trên cùng dòng + deliver lại ≤ 3 lượt |
| UC-05 | Gửi lại tất cả mục lỗi theo bộ lọc | Giáo viên | F4, F6 | Modal xác nhận; limit 50; skipped no_email |
| UC-06 | Đọc thông báo in-app (đổi nguồn trạng thái "Đã xem") | Học viên (portal) | F7 | Boundary — học viên là actor, tác động lên nhật ký GV |
| UC-07 | Phát sinh dòng nhật ký khi nghiệp vụ gửi thông báo | Hệ thống (route nghiệp vụ) | F5, F6 | Boundary — nơi GHI bản ghi; fail-open |

Ranh giới giữa các UC: UC-01/02/03 chỉ đọc; UC-04/05 là toàn bộ khả năng ghi của màn [5] (reset + deliver lại — không có sửa/xóa nội dung); UC-06/07 không thao tác trên màn [5] nhưng là nguồn biến đổi trạng thái mà GV nhìn thấy.

## Ma trận UC ↔ FR ↔ BR ↔ Error

| UC | FR liên quan | BR liên quan | Error liên quan |
|---|---|---|---|
| UC-01 | FR-01, FR-04, FR-07, FR-10, FR-11, FR-12, FR-19, FR-20 | BR-07, BR-10, BR-11, BR-13 | E-01, E-02, E-11, E-15 |
| UC-02 | FR-02, FR-03, FR-04, FR-05, FR-06, FR-10, FR-11 | BR-07, BR-09 | E-03 |
| UC-03 | FR-07, FR-08, FR-09 | BR-13 | E-10 |
| UC-04 | FR-13, FR-15, FR-17, FR-18, FR-19 | BR-01, BR-03, BR-05, BR-12 | E-06, E-07, E-08, E-09, E-10, E-13, E-14 |
| UC-05 | FR-14, FR-15, FR-19 | BR-01, BR-05, BR-06, BR-09 | E-04, E-05, E-08, E-09, E-12, E-14 |
| UC-06 | FR-18 | BR-03, BR-04 | (không có E riêng — đọc in-app không trả lỗi ngoài 404 "Không tìm thấy thông báo") |
| UC-07 | FR-16, FR-17 | BR-02, BR-04, BR-08, BR-13 | (fail-open nuốt lỗi emit — E-10 là kết quả cuối nhìn thấy trên nhật ký) |

Ghi chú phủ đệm (chống mồ côi):

- Mọi FR-01..FR-20 xuất hiện ít nhất 1 dòng; mọi BR-01..BR-13 xuất hiện ít nhất 1 dòng; mọi E-01..E-15 xuất hiện ít nhất 1 dòng.
- UC-04 và UC-05 dùng chung cơ chế reset + deliver (F6); khác biệt ở phạm vi chọn dòng (1 id vs bộ lọc + limit 50) và UI xác nhận.
- UC-06/UC-07 là UC biên (actor ngoài GV): chúng giải thích 2 hướng biến đổi trạng thái trên nhật ký — "Đã xem" đến từ học viên (UC-06), dòng mới đến từ nghiệp vụ (UC-07).
