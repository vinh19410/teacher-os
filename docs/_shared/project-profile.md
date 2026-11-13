---
type: project-profile
updated: 2026-11-12
---

# Hồ sơ dự án dùng chung — Cô Mỹ Dạy Tiếng Anh (Teacher OS)

## 1. Thị trường & Ngôn ngữ mục tiêu

- **Thị trường mục tiêu:** Việt Nam (múi giờ chuẩn `GMT+7`).
- **Ngôn ngữ giao diện người dùng cuối & thư thông báo:** **100% Tiếng Việt** thống nhất trên toàn bộ giao diện ứng dụng, thông báo lỗi/phản hồi, và email giao dịch (các câu tiếng Anh còn sót trong code hiện tại được xem là lỗi lệch chuẩn cần Việt hóa theo SRS).
- **Cách gọi người dùng cuối thống nhất:**
  - `Giáo viên` (Chủ tài khoản trung tâm — vận hành trên ứng dụng giáo viên).
  - `Học viên` (Người học — sử dụng cổng học viên).
  - `Quản trị viên` (Người vận hành hệ thống — sử dụng cổng quản trị).

## 2. Ngưỡng vận hành chung (SLA cơ bản)

- **Khung giờ cam kết khả dụng:** `99.5%` mỗi tháng trong khung giờ vận hành chính `07:00–23:00 (GMT+7)`.
- **Thời gian phản hồi kỳ vọng (tác vụ tương tác nhanh như đăng nhập):** tối thiểu `95%` lượt thao tác nhận kết quả phản hồi trong vòng `≤ 2 giây`.
- **Tải lưu lượng giờ cao điểm (cấp trung tâm nhỏ/single-org):** đáp ứng ổn định tối thiểu `100 lượt đăng nhập/giờ`.

## 3. Chính sách bảo mật, quyền riêng tư & lưu giữ dữ liệu

- **Thời gian lưu giữ dữ liệu tài khoản:** thông tin hồ sơ tài khoản được lưu giữ cho tới khi người dùng có yêu cầu xóa hợp lệ.
- **Thời gian lưu giữ nhật ký phiên đăng nhập:** thông tin phiên làm việc (bao gồm địa chỉ mạng và thông tin thiết bị trình duyệt phục vụ kiểm soát phiên) lưu giữ tối đa `90 ngày`.
- **Phân quyền tra cứu dữ liệu định danh:** chỉ `Chủ trung tâm` (trong phạm vi trung tâm của mình) và `Quản trị viên hệ thống` được phép tra cứu địa chỉ email người dùng.
- **Nhật ký hệ thống:** tuyệt đối không ghi địa chỉ email người dùng, mật khẩu hay mã xác thực/liên kết khôi phục vào nhật ký lỗi vận hành.

## 4. Thiết bị & Khung nhìn chuẩn (Breakpoints)

- Hỗ trợ hiển thị đáp ứng (responsive) trên 3 khung nhìn chuẩn của dự án:
  - Desktop: `1440×900`
  - Tablet: `768×1024`
  - Mobile: `375×812`
