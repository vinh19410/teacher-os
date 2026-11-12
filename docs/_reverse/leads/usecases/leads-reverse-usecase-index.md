# Chỉ mục Use case — leads

## Bảng tổng hợp

| Mã UC | Tên | Tác nhân chính | Bài toán | File chi tiết |
|---|---|---|---|---|
| UC-01 | Gửi form đăng ký trên trang landing | Khách truy cập | Để lại thông tin để trung tâm gọi lại | usecases/uc-01-gui-form-dang-ky-cong-khai.md |
| UC-02 | Làm bài kiểm tra đầu vào và đồng bộ kết quả | Thí sinh | Nhận gợi ý khoá học và đưa kết quả về đăng ký | usecases/uc-02-lam-bai-kiem-tra-dau-vao-va-dong-bo-diem.md |
| UC-03 | Tra cứu danh sách đăng ký mới | Giáo viên / chủ trung tâm / quản trị viên | Xem, tìm, lọc đăng ký để gọi lại | usecases/uc-03-tra-cuu-danh-sach-dang-ky.md |
| UC-04 | Cập nhật trạng thái và ghi chú đăng ký | Giáo viên / chủ trung tâm / quản trị viên | Theo dõi tiến trình từng đăng ký | usecases/uc-04-cap-nhat-trang-thai-dang-ky.md |
| UC-05 | Thông báo email đăng ký mới (use case hệ thống) | Hệ thống | Báo trung tâm có khách mới để phản hồi nhanh | usecases/uc-05-thong-bao-email-dang-ky-moi.md |

## Ma trận UC × Yêu cầu

| UC | FR | BR | NFR | Flow | State |
|---|---|---|---|---|---|
| UC-01 | FR-L01, FR-L02, FR-L03, FR-L04, FR-L06, FR-L07, FR-L15, FR-L16 | BR-L01..BR-L10, BR-L12, BR-L18, BR-L19 | NFR-L01..NFR-L05 | F1 | new (khởi tạo) |
| UC-02 | FR-L05, FR-L07, FR-L08 | BR-L03, BR-L05, BR-L07..BR-L10, BR-L19 | NFR-L05, NFR-L06, NFR-L07, NFR-L08, NFR-L09 | F2 | new → (giữ trạng thái, điền kết quả) |
| UC-03 | FR-L11, FR-L13, FR-L14 | BR-L13, BR-L14, BR-L15, BR-L17 | NFR-L04 | F3 | — |
| UC-04 | FR-L12, FR-L13 | BR-L13, BR-L14, BR-L15, BR-L17 | NFR-L04 | F4 | mọi chuyển tiếp giữa 4 trạng thái (không ràng buộc — OQ-L04) |
| UC-05 | FR-L10 | BR-L10, BR-L16 | NFR-L02 | F1 | — |

## Note superset

- UC-05 là use case hệ thống (tác nhân không phải người): được tách riêng để
  hành vi email nền + ngưỡng lỗi nuốt được đặc tả trọn vẹn, vượt ngoài bộ use
  case thuần tác-người — đây là superset có chủ ý của tài liệu.
- UC-01 bao hàm cả nhánh bot (trường bẫy, gửi nhanh) như một luồng riêng biệt:
  hệ thống cố ý trả thành công giả — hành vi không xuất hiện trong mô tả nghiệp
  vụ ban đầu nhưng là ràng buộc của hợp đồng phản hồi (BR-L04).
- Cả 5 UC đều bọc đầy đủ các nhánh lỗi do code định nghĩa; không có use case
  cho xóa/xuất dữ liệu vì tính năng không tồn tại (NS-L01, OQ-L09).
