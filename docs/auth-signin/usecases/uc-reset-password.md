# Use Case: Quên và đặt lại mật khẩu qua email

> Scope: auth-signin · Level: sea

## Primary Actor

Khách chưa đăng nhập (người dùng quên mật khẩu và sở hữu hộp thư điện tử của tài khoản).

## Stakeholders & Interests

| Stakeholder | Interest |
|-------------|----------|
| Giáo viên / Người dùng | Tự đặt lại được mật khẩu nhanh chóng qua email mà không cần nhờ quản trị viên cấp lại thủ công; nếu mất thiết bị thì đổi mật khẩu xong sẽ tự đăng xuất khỏi mọi thiết bị cũ. |
| Chủ trung tâm / Chủ dự án | Chống kẻ xấu lợi dụng biểu mẫu quên mật khẩu để dò danh sách email khách hàng/giáo viên hoặc gửi thư rác hàng loạt; đảm bảo nhật ký lỗi không lưu lộ liên kết khôi phục. |

## Trigger

Người dùng chọn liên kết quên mật khẩu từ trang đăng nhập để mở màn hình `/forgot-password`, nhập email và gửi yêu cầu khôi phục.

## Preconditions

* Người dùng truy cập được trang `/forgot-password` của cổng ứng dụng tương ứng với vai trò tài khoản của mình.
* Dịch vụ gửi thư điện tử sẵn sàng (hoặc đang chạy ở chế độ ghi nhận cảnh báo trên môi trường thử nghiệm).

## Guarantees

* __Minimal Guarantee:__ Phản hồi trên giao diện luôn trung tính như nhau bất kể email có tồn tại hay không hoặc thuộc vai trò cổng khác; không gửi thư đặt lại mật khẩu chéo cổng sai vai trò; nhật ký lỗi vận hành tuyệt đối không chứa địa chỉ email hay mã liên kết khôi phục.
* __Success Guarantee:__ Mật khẩu mới (≥ 8 ký tự) được lưu thành công (hoặc bổ sung phương thức mật khẩu cho tài khoản vốn chỉ đăng nhập bằng Google); liên kết khôi phục được đánh dấu đã sử dụng; toàn bộ các phiên làm việc cũ của tài khoản đó trên mọi thiết bị bị thu hồi ngay lập tức.

## Main Success Scenario

1. Tại màn hình `/forgot-password`, người dùng nhập địa chỉ email và bấm gửi yêu cầu đặt lại mật khẩu.
2. Hệ thống phản hồi tức thì thông báo xác nhận trung tính bằng tiếng Việt (`E-auth-signin-019`, thời gian giữ yêu cầu ≤ 150ms) và khóa nút gửi lại trên giao diện trong 60 giây.
3. Ở chế độ nền, hệ thống kiểm tra nếu email tồn tại và vai trò của tài khoản khớp với cổng ứng dụng vừa yêu cầu thì sinh mã liên kết đặt lại mật khẩu dùng một lần (có hạn 1 giờ) và chuyển phát thư tiếng Việt tới hộp thư người dùng.
4. Người dùng mở hộp thư, bấm vào liên kết trong thời hạn 1 giờ để mở màn hình `/reset-password` (mã xác thực không bị giữ lộ trên thanh địa chỉ trình duyệt sau khi nạp trang).
5. Người dùng nhập mật khẩu mới (tối thiểu 8 ký tự) và nhập lại mật khẩu xác nhận trùng khớp, sau đó bấm xác nhận đổi mật khẩu.
6. Hệ thống kiểm tra liên kết còn hiệu lực, cập nhật mật khẩu mới cho tài khoản (nếu tài khoản trước đó chỉ liên kết Google thì bổ sung thêm phương thức đăng nhập mật khẩu cho chính tài khoản đó).
7. Hệ thống hủy hiệu lực mã liên kết vừa dùng và thu hồi toàn bộ các phiên làm việc hiện có của người dùng trên mọi thiết bị.
8. Hệ thống thông báo đổi mật khẩu thành công và dẫn người dùng về trang đăng nhập `/login` để đăng nhập lại bằng mật khẩu mới.

## Extensions

__1a. Bỏ trống ô email hoặc nhập email sai định dạng:__
* 1a1. Hệ thống không gửi yêu cầu đi mà hiển thị thông báo lỗi trực tiếp dưới ô email (`E-auth-signin-001` hoặc `E-auth-signin-003`).

__1b. Người dùng gửi yêu cầu lặp lại quá nhanh (vượt quá 3 lần trong 60 giây):__
* 1b1. Hệ thống từ chối yêu cầu vượt ngưỡng và hiển thị thông báo yêu cầu chờ 1 phút (`E-auth-signin-020`).

__1c. Yêu cầu quên mật khẩu gặp sự cố kết nối trực tiếp lúc gửi biểu mẫu:__
* 1c1. Giao diện hiển thị thông báo lỗi gửi yêu cầu (`E-auth-signin-021`) để người dùng thử lại.

__3a. Email không tồn tại trên hệ thống hoặc thuộc tài khoản của cổng vai trò khác:__
* 3a1. Hệ thống âm thầm bỏ qua việc gửi thư ở chế độ nền (`BR-auth-signin-013`), trong khi màn hình người dùng đã nhận cùng câu thông báo trung tính `E-auth-signin-019` ở bước 2.

__3b. Dịch vụ gửi thư điện tử báo quá tải hoặc lỗi tạm thời khi gửi nền:__
* 3b1. Hệ thống tự động thử gửi lại tối đa 1 lần; nếu vẫn thất bại thì ghi nhận cảnh báo vận hành mà không ghi lộ địa chỉ email hay mã khôi phục vào nhật ký.

__4a. Liên kết đặt lại mật khẩu đã quá hạn 1 giờ, đã từng được sử dụng hoặc sai mã:__
* 4a1. Hệ thống kết thúc biểu mẫu đổi mật khẩu (không cho nhập thử lại trên cùng liên kết đó), hiển thị thông báo `E-auth-signin-022` và cung cấp lối quay về màn `/forgot-password` để xin liên kết mới.

__5a. Mật khẩu mới ngắn hơn 8 ký tự hoặc hai ô mật khẩu không trùng khớp:__
* 5a1. Hệ thống báo lỗi ngay dưới trường nhập (`E-auth-signin-024`) mà chưa gửi yêu cầu lên máy chủ; người dùng sửa lại cho khớp.

__6a. Gặp sự cố mạng hoặc máy chủ bận tạm thời khi bấm lưu mật khẩu mới:__
* 6a1. Hệ thống giữ nguyên mã liên kết hợp lệ trên biểu mẫu hiện tại và hiển thị `E-auth-signin-023` để người dùng bấm lưu lại ngay mà không phải xin thư mới.

## Related Requirements

* **Functional Requirements:** `FR-auth-signin-014`, `FR-auth-signin-015`, `FR-auth-signin-024`
* **Business Rules:** `BR-auth-signin-008`, `BR-auth-signin-010`, `BR-auth-signin-012`, `BR-auth-signin-013`
* **Non-Functional Requirements:** `NFR-auth-signin-002`, `NFR-auth-signin-005`, `NFR-auth-signin-006`, `NFR-auth-signin-008`, `NFR-auth-signin-012`
* **Errors:** `E-auth-signin-001`, `E-auth-signin-003`, `E-auth-signin-019`, `E-auth-signin-020`, `E-auth-signin-021`, `E-auth-signin-022`, `E-auth-signin-023`, `E-auth-signin-024`

<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền ai4ba.com</sub>
