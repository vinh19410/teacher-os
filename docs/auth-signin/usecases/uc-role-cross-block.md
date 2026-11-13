# Use Case: Chặn chéo vai trò giữa các cổng ứng dụng

> Scope: auth-signin · Level: sea

## Primary Actor

Học viên (kịch bản chính khi truy cập nhầm ứng dụng giáo viên), Giáo viên, hoặc Quản trị viên khi thao tác sang cổng ứng dụng không thuộc vai trò của mình.

## Stakeholders & Interests

| Stakeholder | Interest |
|-------------|----------|
| Chủ trung tâm / Chủ dự án | Bảo vệ tuyệt đối ranh giới dữ liệu giữa 3 cổng (Giáo viên, Học viên, Quản trị) ngay cả khi trình duyệt chia sẻ chung phiên đăng nhập giữa các miền phụ; ngăn Học viên làm phát sinh trung tâm ảo trên ứng dụng giáo viên; thu hồi quyền Quản trị tức thì ngay khi gỡ email khỏi danh sách cho phép. |
| Học viên / Giáo viên | Khi mở nhầm đường dẫn cổng khác, nhận được thông báo tiếng Việt rõ ràng giải thích lý do và có nút Đăng xuất để thoát khỏi trạng thái kẹt phiên, thay vì gặp trang trắng hay lỗi kỹ thuật khó hiểu. |

## Trigger

Người dùng thực hiện đăng nhập tại cổng không khớp với vai trò của tài khoản HOẶC người dùng đã có sẵn phiên đăng nhập từ một cổng khác (do chia sẻ phiên trên cùng miền phụ) mở sang cổng ứng dụng còn lại.

## Preconditions

* Hệ thống vận hành 3 cổng riêng biệt: ứng dụng giáo viên, cổng học viên và cổng quản trị.
* Tài khoản người dùng đã được gắn vai trò cố định (`student`, `teacher` hoặc `admin`) từ lúc khởi tạo.

## Guarantees

* __Minimal Guarantee:__ Không rò rỉ bất kỳ dữ liệu nghiệp vụ nào của cổng bị truy cập nhầm; không tự động khởi tạo trung tâm hoặc tư cách thành viên cho tài khoản Học viên/Quản trị trên ứng dụng giáo viên; không gửi mã OTP đăng nhập cho tài khoản Giáo viên/Quản trị.
* __Success Guarantee:__ Yêu cầu sai vai trò bị từ chối nhất quán ở cả bước tạo phiên lẫn bước truy xuất dữ liệu; người dùng trên ứng dụng giáo viên (khi vướng phiên Học viên, ngoài danh sách cho phép hoặc chưa xác thực email) được chuyển sang màn hình bị chặn ổn định (không lặp vô hạn) và có thể chủ động đăng xuất.

## Main Success Scenario

1. Học viên mở trang `/login` của ứng dụng giáo viên và gửi yêu cầu đăng nhập (bằng email/mật khẩu hoặc Google).
2. Tại lớp bảo vệ thứ nhất (khởi tạo phiên): hệ thống phát hiện tài khoản mang vai Học viên không khớp với cổng Giáo viên, lập tức từ chối khởi tạo phiên làm việc.
3. Ứng dụng giáo viên hiển thị thông báo tiếng Việt hướng dẫn rõ (`E-auth-signin-006`), giữ người dùng ở ngoài vùng làm việc.
4. Học viên chuyển sang đúng địa chỉ cổng học viên để đăng nhập và học tập.

## Extensions

__1a. Học viên đã đăng nhập sẵn từ cổng học viên (có phiên chung trên trình duyệt) và mở thẳng địa chỉ ứng dụng giáo viên:__
* 1a1. Tại lớp bảo vệ thứ hai (cổng dữ liệu giáo viên): hệ thống chặn yêu cầu dữ liệu với mã từ chối vai Học viên (`E-auth-signin-010`) trước khi chạy logic khởi tạo trung tâm, đảm bảo không sinh bản ghi trung tâm hay thành viên mới.
* 1a2. Tại lớp bảo vệ thứ ba (giao diện ứng dụng giáo viên): ứng dụng nhận diện mã chặn, đánh dấu chuyển trạng thái đúng một lần duy nhất và thay toàn bộ vùng làm việc bằng màn hình bị chặn có tiêu đề `Đây là tài khoản học viên` kèm nút Đăng xuất.
* 1a3. Người dùng bấm Đăng xuất để xóa phiên hiện tại hoặc mở lại cổng học viên.

__1b. Giáo viên đã có phiên nhưng email không nằm trong danh sách giáo viên được phép:__
* 1b1. Cổng dữ liệu giáo viên từ chối truy cập (`E-auth-signin-012`) và giao diện hiển thị màn hình bị chặn thông báo không có quyền sử dụng ứng dụng giáo viên kèm nút Đăng xuất.

__1c. Giáo viên nằm trong danh sách được phép nhưng chưa xác thực địa chỉ email:__
* 1c1. Cổng dữ liệu giáo viên từ chối truy cập (`E-auth-signin-013`) và giao diện hiển thị màn hình bị chặn nhánh chưa xác thực email để Giáo viên gửi lại thư hoặc kiểm tra lại trạng thái (xem `uc-verify-email`).

__1d. Quản trị viên truy cập ứng dụng giáo viên:__
* 1d1. Nếu đăng nhập trực tiếp tại `/login` của ứng dụng giáo viên: bị chặn ngay từ bước tạo phiên và trả thông báo sai vai trò quản trị (`E-auth-signin-008`).
* 1d2. Nếu mang sẵn phiên Quản trị mở sang ứng dụng giáo viên: cổng dữ liệu giáo viên từ chối truy cập (`E-auth-signin-011`), không trả dữ liệu và không tạo trung tâm (việc bổ sung màn hình chặn thân thiện riêng cho Quản trị viên được theo dõi tại `OQ-auth-signin-01`).

__1e. Giáo viên hoặc Quản trị viên đăng nhập hoặc gọi dữ liệu tại cổng học viên:__
* 1e1. Nếu đăng nhập trực tiếp tại cổng học viên: hệ thống từ chối tạo phiên và báo `E-auth-signin-007` (với Giáo viên) hoặc `E-auth-signin-008` (với Quản trị viên).
* 1e2. Nếu mang phiên sẵn gọi dữ liệu cổng học viên: cổng học viên từ chối truy cập (`E-auth-signin-014`).
* 1e3. Nếu gọi phương thức đăng nhập bằng mã OTP từ ngoài cổng học viên hoặc dùng đường dẫn OTP không hỗ trợ: hệ thống từ chối trực tiếp (`E-auth-signin-028`); nếu nhập email Giáo viên/Quản trị trên biểu mẫu gửi OTP cổng học viên thì vẫn trả phản hồi trung tính nhưng không gửi mã (chống dò email).

__1f. Tài khoản không thỏa điều kiện truy cập cổng quản trị:__
* 1f1. Nếu tài khoản Học viên hoặc Giáo viên đăng nhập tại cổng quản trị: hệ thống từ chối tạo phiên và báo `E-auth-signin-008`.
* 1f2. Trên mỗi yêu cầu gửi tới cổng quản trị, hệ thống kiểm tra lại cả 3 điều kiện (vai Quản trị + đã xác thực email + email hiện còn nằm trong danh sách quản trị được phép); nếu thiếu bất kỳ điều kiện nào (kể cả vừa bị gỡ khỏi danh sách quản trị khi phiên vẫn còn hạn), hệ thống lập tức từ chối và báo `E-auth-signin-015`.

## Related Requirements

* **Functional Requirements:** `FR-auth-signin-008`, `FR-auth-signin-009`, `FR-auth-signin-010`, `FR-auth-signin-011`, `FR-auth-signin-012`, `FR-auth-signin-013`, `FR-auth-signin-017`
* **Business Rules:** `BR-auth-signin-001`, `BR-auth-signin-004`, `BR-auth-signin-005`, `BR-auth-signin-006`, `BR-auth-signin-009`
* **Non-Functional Requirements:** `NFR-auth-signin-005`, `NFR-auth-signin-010`, `NFR-auth-signin-012`
* **Errors:** `E-auth-signin-006`, `E-auth-signin-007`, `E-auth-signin-008`, `E-auth-signin-010`, `E-auth-signin-011`, `E-auth-signin-012`, `E-auth-signin-013`, `E-auth-signin-014`, `E-auth-signin-015`, `E-auth-signin-028`

<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền ai4ba.com</sub>
