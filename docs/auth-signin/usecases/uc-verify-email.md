# Use Case: Xác thực địa chỉ email và gửi lại liên kết xác thực

> Scope: auth-signin · Level: sea

## Primary Actor

Giáo viên vừa tạo tài khoản chưa xác thực địa chỉ email (hoặc người dùng bấm liên kết xác thực từ hộp thư).

## Stakeholders & Interests

| Stakeholder | Interest |
|-------------|----------|
| Giáo viên | Xác nhận quyền sở hữu email chỉ bằng một cú bấm liên kết rồi được tự động đăng nhập thẳng vào ứng dụng mà không phải gõ lại mật khẩu; dễ dàng tự gửi lại thư nếu thư đầu bị thất lạc hoặc hết hạn. |
| Chủ trung tâm / Chủ dự án | Đảm bảo mọi tài khoản Giáo viên và Quản trị viên truy cập dữ liệu thật đều đã xác minh quyền sở hữu hộp thư thật (nghiêm cấm bỏ qua bước xác thực email trên môi trường vận hành chính thức). |

## Trigger

Tài khoản mới được tạo thành công (tự động kích hoạt gửi thư xác thực) HOẶC người dùng bấm vào liên kết xác thực trong email / bấm nút gửi lại thư xác thực.

## Preconditions

* Tài khoản người dùng đã tồn tại và đang ở trạng thái chưa xác thực email.
* Người dùng có quyền truy cập hộp thư điện tử đã đăng ký.

## Guarantees

* __Minimal Guarantee:__ Việc gửi thư xác thực lần đầu gặp sự cố không làm hủy bỏ tài khoản vừa tạo; ngược lại, khi người dùng chủ động bấm gửi lại mà lỗi thì phải thông báo rõ ràng; liên kết xác thực mở nhầm cổng khác vai trò không được phép tạo phiên làm việc sai cổng.
* __Success Guarantee:__ Hồ sơ người dùng chuyển sang trạng thái Đã xác thực email (một chiều, không quay ngược); người dùng được tự động khởi tạo phiên đăng nhập hợp lệ vào đúng cổng ứng dụng và thấy trang xác nhận kèm nút đi vào không gian làm việc.

## Main Success Scenario

1. Ngay sau khi tài khoản được tạo mới, hệ thống tự động sinh liên kết xác thực email có hiệu lực 1 giờ và phát thư xác thực tiếng Việt tới hộp thư của người dùng.
2. Người dùng mở hộp thư và bấm vào liên kết xác thực trong vòng 1 giờ.
3. Hệ thống kiểm tra liên kết xác thực còn hiệu lực và đối chiếu vai trò của tài khoản với cổng ứng dụng đích của liên kết.
4. Hệ thống cập nhật trạng thái tài khoản thành Đã xác thực email và tự động tạo phiên làm việc mới cho người dùng.
5. Hệ thống đưa người dùng tới trang xác nhận thành công (`/verify-email`) hiển thị nút để người dùng đi vào không gian làm việc trung tâm (nếu người dùng bấm lại liên kết còn hạn 1 giờ của tài khoản đã xác thực thì hệ thống vẫn xử lý êm và đưa tới trang xác nhận này).

## Extensions

__1a. Dịch vụ gửi thư gặp lỗi tạm thời ngay lúc tạo tài khoản:__
* 1a1. Hệ thống thử gửi lại tối đa 1 lần; nếu vẫn lỗi thì vẫn giữ nguyên tài khoản vừa tạo (chính sách tha thứ trên đường tạo tài khoản; nhật ký lỗi không ghi lộ địa chỉ email — xem `OQ-auth-signin-04`) để người dùng có thể chủ động bấm gửi lại từ màn hình bị chặn sau đó.

__2a. Giáo viên chưa bấm liên kết trong thư nhưng đã đăng nhập vào ứng dụng giáo viên:__
* 2a1. Cổng dữ liệu chặn quyền truy cập và hiển thị màn hình bị chặn dành riêng cho Giáo viên chưa xác thực email (`E-auth-signin-013`), hiển thị rõ địa chỉ email hiện tại kèm nút gửi lại thư xác thực và nút kiểm tra lại trạng thái.
* 2a2. Giáo viên bấm nút gửi lại thư xác thực: nếu thành công, hệ thống báo đã gửi thư mới; nếu dịch vụ gửi thư lỗi, hệ thống báo lỗi rõ ràng (`E-auth-signin-027`).
* 2a3. Nếu Giáo viên đã xác thực ở một tab trình duyệt khác và quay lại bấm gửi lại hoặc bấm kiểm tra lại trạng thái, hệ thống nhận biết đã xác thực xong và tự động tải lại trang để đưa vào không gian làm việc.

__3a. Liên kết xác thực đã quá hạn 1 giờ hoặc sai chữ ký/mã không hợp lệ:__
* 3a1. Hệ thống hiển thị màn hình thông báo liên kết không khả dụng (`E-auth-signin-025`) kèm nút yêu cầu gửi lại liên kết mới và lối về trang đăng nhập.
* 3a2. Người dùng bấm gửi lại liên kết mới: nếu thành công thì nhận thư mới 1 giờ; nếu gửi thất bại thì hệ thống hiển thị thông báo lỗi rõ ràng (`E-auth-signin-026`); nếu tài khoản thực tế đã được xác thực trước đó thì tự động chuyển tiếp vào ứng dụng.

__3b. Người dùng mở liên kết xác thực email hợp lệ nhưng chéo sang cổng ứng dụng không khớp vai trò tài khoản:__
* 3b1. Do chủ hộp thư đã chứng minh quyền sở hữu địa chỉ email, hệ thống **vẫn đánh dấu tài khoản sang trạng thái Đã xác thực email**, nhưng **từ chối tự động tạo phiên làm việc** ở cổng sai vai trò và chuyển hướng về trang kết quả kèm cờ lỗi sai vai trò (`ROLE_MISMATCH`, hiển thị màn thông báo `E-auth-signin-025`) để người dùng chuyển sang đăng nhập tại đúng cổng.

## Related Requirements

* **Functional Requirements:** `FR-auth-signin-008`, `FR-auth-signin-013`, `FR-auth-signin-016`, `FR-auth-signin-024`
* **Business Rules:** `BR-auth-signin-004`, `BR-auth-signin-007`
* **Non-Functional Requirements:** `NFR-auth-signin-008`, `NFR-auth-signin-012`
* **Errors:** `E-auth-signin-013`, `E-auth-signin-025`, `E-auth-signin-026`, `E-auth-signin-027`

<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền ai4ba.com</sub>
