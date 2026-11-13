# Use Case: Đăng nhập ứng dụng giáo viên bằng email và mật khẩu

> Scope: auth-signin · Level: sea

## Primary Actor

Giáo viên (bắt đầu ở trạng thái Khách chưa đăng nhập tại trang đăng nhập ứng dụng giáo viên).

## Stakeholders & Interests

| Stakeholder | Interest |
|-------------|----------|
| Giáo viên | Vào nhanh không gian làm việc trung tâm (≤ 2 giây), không phải cấu hình trung tâm thủ công ở lần đầu, và không bị văng phiên oan khi mạng chập chờn ngắn hạn. |
| Chủ trung tâm / Chủ dự án | Đảm bảo chỉ các tài khoản nằm trong danh sách giáo viên được phép mới vào được không gian làm việc trung tâm và không lộ thông tin tài khoản khi có người dò mật khẩu. |

## Trigger

Người dùng mở ứng dụng giáo viên khi chưa có phiên làm việc (hoặc bị điều hướng về trang đăng nhập `/login` kèm đường dẫn đích `returnUrl`), nhập email và mật khẩu rồi bấm nút đăng nhập.

## Preconditions

* Người dùng đã có tài khoản Giáo viên hợp lệ (hoặc mở tab đăng ký khi cấu hình mở đăng ký giáo viên đang bật).
* Dịch vụ xác thực trong khung giờ cam kết hoạt động.

## Guarantees

* __Minimal Guarantee:__ Không tiết lộ cụ thể email có tồn tại hay mật khẩu bị sai khi xác thực thất bại; không tạo phiên làm việc hay khởi tạo trung tâm rác cho tài khoản không hợp lệ; không điều hướng người dùng ra tên miền bên ngoài ứng dụng.
* __Success Guarantee:__ Phiên làm việc hợp lệ được xác nhận ở cả hai bước kiểm tra; trung tâm mặc định được khởi tạo tự động nếu là lần truy cập đầu tiên của Giáo viên; người dùng được đưa vào đúng trang nội bộ đã yêu cầu (`returnUrl`) hoặc trang tổng quan (`/dashboard`).

## Main Success Scenario

1. Người dùng truy cập trang đăng nhập `/login` của ứng dụng giáo viên (mặc định hệ thống chỉ hiển thị biểu mẫu đăng nhập, ẩn hoàn toàn phần tự đăng ký giáo viên khi cờ mở đăng ký đang tắt).
2. Người dùng nhập địa chỉ email và mật khẩu, sau đó bấm nút đăng nhập.
3. Hệ thống tự động cắt bỏ khoảng trắng thừa hai đầu và chuẩn hóa chữ thường cho địa chỉ email, kiểm tra các trường không bị bỏ trống và địa chỉ email đúng định dạng (không kiểm tra độ dài tối thiểu của mật khẩu tại bước đăng nhập).
4. Hệ thống đối chiếu thông tin xác thực và kiểm tra vai trò tài khoản khớp với ứng dụng giáo viên.
5. Hệ thống tạo phiên làm việc mới (thời hạn mặc định 7 ngày, tự gia hạn sau mỗi 1 ngày hoạt động).
6. Ứng dụng thực hiện bước kiểm tra xác nhận thứ hai để đảm bảo phiên làm việc thực sự đã được trình duyệt ghi nhận.
7. Hệ thống kiểm tra tư cách trung tâm của Giáo viên: nếu Giáo viên chưa thuộc trung tâm nào, hệ thống tự động tạo trung tâm mới mang tên hiển thị của Giáo viên và gắn quyền thành viên Giáo viên.
8. Hệ thống kiểm duyệt tham số `returnUrl` (chỉ chấp nhận đường dẫn nội bộ hợp lệ trong cùng ứng dụng) và chuyển người dùng tới trang đích (hoặc mặc định về `/dashboard`).
9. Trong suốt quá trình làm việc sau đó, ứng dụng duy trì ổn định trạng thái phiên trước các gián đoạn kết nối thoáng qua để người dùng không bị đăng xuất nhầm.

## Extensions

__1a. Cấu hình mở đăng ký giáo viên đang bật và người dùng chọn tạo tài khoản mới:__
* 1a1. Người dùng nhập tên hiển thị (2–100 ký tự), email và mật khẩu (tối thiểu 8 ký tự) trên tab đăng ký giáo viên; nếu tên hiển thị/mật khẩu chưa đạt yêu cầu hoặc email sai định dạng, hệ thống báo lỗi trực tiếp dưới trường nhập (`E-auth-signin-031`, `E-auth-signin-003`).
* 1a2. Nếu email không nằm trong danh sách email giáo viên được phép, hệ thống từ chối tạo tài khoản và hiển thị `E-auth-signin-017`.
* 1a3. Nếu email đã tồn tại, gặp lỗi kết nối khi tạo tài khoản hoặc tạo xong nhưng không khởi tạo được phiên, hệ thống hiển thị thông báo tương ứng tại `E-auth-signin-030`.
* 1a4. Nếu hợp lệ, hệ thống gán cố định vai Giáo viên một lần duy nhất, tự động phát thư xác thực email (xem `uc-verify-email`) và chuyển sang bước 5.

__3a. Bỏ trống trường bắt buộc hoặc email sai định dạng:__
* 3a1. Hệ thống không gửi yêu cầu xác thực đi mà hiển thị thông báo lỗi trực tiếp ngay dưới trường tương ứng (`E-auth-signin-001`, `E-auth-signin-002` hoặc `E-auth-signin-003`).
* 3a2. Người dùng chỉnh sửa lại dữ liệu và bấm đăng nhập lại từ bước 2.

__4a. Sai email, sai mật khẩu hoặc gián đoạn kết nối lúc gửi đăng nhập:__
* 4a1. Hệ thống hiển thị duy nhất một câu thông báo chung bằng tiếng Việt (`E-auth-signin-004`), không cho biết trường nào sai.
* 4a2. Người dùng thử nhập lại hoặc bấm chuyển sang luồng quên mật khẩu (`uc-reset-password`).

__4b. Tài khoản mang vai Học viên hoặc Quản trị đăng nhập tại trang giáo viên:__
* 4b1. Hệ thống từ chối tạo phiên và xử lý theo luồng chặn chéo vai trò (`uc-role-cross-block`: mã lỗi `E-auth-signin-006` với Học viên hoặc `E-auth-signin-008` với Quản trị viên).

__6a. Xác thực thành công nhưng bước kiểm tra thứ hai không ghi nhận được phiên:__
* 6a1. Hệ thống không chuyển vào vùng làm việc mà hiển thị thông báo rõ ràng về sự cố khởi tạo phiên (`E-auth-signin-005`), phân biệt với lỗi sai mật khẩu.

__7a. Giáo viên chưa xác thực email hoặc email không còn trong danh sách được phép:__
* 7a1. Cổng dữ liệu từ chối cấp quyền vào không gian làm việc và chuyển sang màn hình bị chặn (`uc-role-cross-block`, mã lỗi `E-auth-signin-012` hoặc `E-auth-signin-013`).

__8a. Đường dẫn `returnUrl` không tồn tại, trỏ ra tên miền ngoài hoặc chứa ký tự điều khiển bất thường:__
* 8a1. Hệ thống bỏ qua `returnUrl` không an toàn và đưa Giáo viên về trang tổng quan `/dashboard`.

__9a. Đường truyền mạng chập chờn thoáng qua khi đang kiểm tra phiên:__
* 9a1. Hệ thống chờ tối đa 5 giây và giữ nguyên trạng thái phiên gần nhất để Giáo viên không bị văng khỏi màn hình đang làm việc.

__9b. Phiên làm việc hết hạn hoặc bị thu hồi khi ứng dụng đang mở:__
* 9b1. Hệ thống thực hiện đăng xuất sạch một lần duy nhất (kể cả khi nhiều yêu cầu dữ liệu cùng báo hết phiên đồng thời) và chuyển về `/login` kèm đường dẫn trang đang đứng (`returnUrl`) và thông báo `E-auth-signin-029`.

## Related Requirements

* **Functional Requirements:** `FR-auth-signin-001`, `FR-auth-signin-002`, `FR-auth-signin-003`, `FR-auth-signin-004`, `FR-auth-signin-008`, `FR-auth-signin-009`, `FR-auth-signin-018`, `FR-auth-signin-019`, `FR-auth-signin-020`, `FR-auth-signin-021`, `FR-auth-signin-022`, `FR-auth-signin-023`
* **Business Rules:** `BR-auth-signin-001`, `BR-auth-signin-002`, `BR-auth-signin-004`, `BR-auth-signin-006`, `BR-auth-signin-011`, `BR-auth-signin-014`
* **Non-Functional Requirements:** `NFR-auth-signin-001`, `NFR-auth-signin-003`, `NFR-auth-signin-004`, `NFR-auth-signin-005`, `NFR-auth-signin-007`, `NFR-auth-signin-009`, `NFR-auth-signin-011`, `NFR-auth-signin-012`
* **Errors:** `E-auth-signin-001`, `E-auth-signin-002`, `E-auth-signin-003`, `E-auth-signin-004`, `E-auth-signin-005`, `E-auth-signin-006`, `E-auth-signin-008`, `E-auth-signin-012`, `E-auth-signin-013`, `E-auth-signin-017`, `E-auth-signin-029`, `E-auth-signin-030`, `E-auth-signin-031`

<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền ai4ba.com</sub>
