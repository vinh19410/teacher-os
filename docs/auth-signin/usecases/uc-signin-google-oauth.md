# Use Case: Đăng nhập bằng tài khoản Google (Google OAuth)

> Scope: auth-signin · Level: sea

## Primary Actor

Giáo viên (thao tác từ trang đăng nhập ứng dụng giáo viên, phối hợp với Dịch vụ định danh Google).

## Stakeholders & Interests

| Stakeholder | Interest |
|-------------|----------|
| Giáo viên | Đăng nhập một chạm bằng tài khoản Google mà không cần nhớ mật khẩu riêng, luôn chủ động chọn đúng tài khoản Google khi dùng máy tính chung. |
| Chủ trung tâm / Chủ dự án | Đảm bảo người dùng đăng nhập qua Google vẫn chịu đúng quy tắc danh sách email cho phép và phân tách vai trò theo cổng như đăng nhập mật khẩu, không cho phép giả mạo thông báo lỗi qua thanh địa chỉ. |

## Trigger

Người dùng bấm nút đăng nhập bằng Google trên trang `/login`.

## Preconditions

* Dịch vụ định danh Google đã được cấu hình kết nối cho môi trường hiện tại.
* Người dùng sở hữu tài khoản Google hoạt động.

## Guarantees

* __Minimal Guarantee:__ Kết quả trả về từ Google luôn được đối chiếu với đúng cổng ứng dụng đã khởi phát; không tạo tài khoản hoặc phiên làm việc nếu vi phạm danh sách email cho phép hoặc lệch vai trò cổng; mọi chuỗi thông báo tự gắn thêm trên thanh địa chỉ URL đều bị bỏ qua.
* __Success Guarantee:__ Hồ sơ người dùng được khởi tạo với vai trò cố định theo cổng (nếu đăng nhập lần đầu) hoặc gộp an toàn vào hồ sơ cùng email đã xác minh; phiên làm việc được thiết lập và người dùng vào đúng không gian làm việc.

## Main Success Scenario

1. Người dùng bấm nút đăng nhập bằng Google trên trang `/login`.
2. Hệ thống ghi nhận dấu hiệu cổng ứng dụng hiện tại vào phiên giao dịch xác thực và xác định địa chỉ đích quay về nội bộ hợp lệ.
3. Hệ thống chuyển hướng người dùng sang Dịch vụ định danh Google với yêu cầu bắt buộc hiển thị màn chọn tài khoản Google mỗi lần đăng nhập.
4. Người dùng chọn tài khoản Google mong muốn và xác nhận đồng ý.
5. Dịch vụ định danh Google chuyển người dùng quay lại hệ thống kèm kết quả xác thực.
6. Hệ thống đọc lại dấu hiệu cổng ứng dụng đã ghi nhận ở bước 2 để phân loại đúng cổng (Giáo viên / Học viên / Quản trị).
7. Nếu đây là lần đầu email này xuất hiện trên hệ thống, hệ thống kiểm tra email thỏa mãn danh sách email được phép của cổng đó và tạo hồ sơ người dùng với vai trò cố định tương ứng; nếu email đã có tài khoản mật khẩu đã xác thực email từ trước và Google xác nhận email đã xác minh, hệ thống tự động liên kết vào cùng một hồ sơ người dùng.
8. Hệ thống đối chiếu vai trò tài khoản khớp với cổng hiện tại, khởi tạo phiên làm việc và đưa người dùng vào không gian làm việc (tự động tạo trung tâm mặc định nếu là lần đầu Giáo viên truy cập).

## Extensions

__4a. Người dùng bấm hủy trên màn hình Google hoặc Dịch vụ định danh Google trả về lỗi kỹ thuật:__
* 4a1. Hệ thống đưa người dùng quay về trang `/login` và hiển thị câu thông báo chung bằng tiếng Việt (`E-auth-signin-009`), không hiển thị nội dung lỗi thô hay chuỗi tự chế trên URL.

__6a. Yêu cầu không xác định được nguồn cổng ứng dụng hợp lệ (thiếu nguồn hoặc từ nguồn ẩn danh của khung nhúng):__
* 6a1. Hệ thống áp dụng nguyên tắc đặc quyền tối thiểu, xếp yêu cầu về cổng Học viên (`BR-auth-signin-002`, `BR-auth-signin-003`).

__7a. Lần đầu tạo tài khoản qua Google nhưng vi phạm danh sách email cho phép:__
* 7a1. Nếu khởi phát từ cổng quản trị với email ngoài danh sách quản trị (ưu tiên kiểm tra trước tiên tại cổng quản trị): từ chối tạo tài khoản và báo `E-auth-signin-016`.
* 7a2. Nếu khởi phát từ ứng dụng giáo viên với email ngoài danh sách giáo viên: từ chối tạo tài khoản và báo `E-auth-signin-017`.
* 7a3. Nếu email thuộc danh sách giáo viên nhưng lại khởi phát từ cổng học viên: từ chối tạo tài khoản để tránh gán nhầm vai Học viên và báo `E-auth-signin-018`.

__7b. Email trùng với tài khoản mật khẩu sẵn có nhưng tài khoản cũ chưa xác thực email:__
* 7b1. Hệ thống không tự động gộp tài khoản để tránh chiếm đoạt hồ sơ và chuyển về trang đăng nhập kèm thông báo thất bại (`E-auth-signin-009`).

__8a. Tài khoản đã tồn tại nhưng có vai trò không khớp với cổng vừa gọi Google:__
* 8a1. Hệ thống từ chối tạo phiên làm việc, chuyển người dùng về `/login` kèm mã lỗi sai vai trò và hiển thị đúng câu thông báo tiếng Việt hướng dẫn sang cổng phù hợp (`E-auth-signin-006`, `E-auth-signin-007` hoặc `E-auth-signin-008`).

__8b. Tài khoản Giáo viên đã tồn tại đăng nhập lại qua Google nhưng email hiện đã bị gỡ khỏi danh sách được phép hoặc chưa xác thực email:__
* 8b1. Sau khi về ứng dụng giáo viên, cổng dữ liệu từ chối cấp quyền vào không gian làm việc và chuyển sang màn hình bị chặn (`E-auth-signin-012` hoặc `E-auth-signin-013` theo `uc-role-cross-block`).

## Related Requirements

* **Functional Requirements:** `FR-auth-signin-005`, `FR-auth-signin-006`, `FR-auth-signin-007`, `FR-auth-signin-008`, `FR-auth-signin-009`, `FR-auth-signin-019`, `FR-auth-signin-020`, `FR-auth-signin-021`
* **Business Rules:** `BR-auth-signin-001`, `BR-auth-signin-002`, `BR-auth-signin-003`, `BR-auth-signin-004`, `BR-auth-signin-005`, `BR-auth-signin-006`, `BR-auth-signin-011`, `BR-auth-signin-012`
* **Non-Functional Requirements:** `NFR-auth-signin-005`, `NFR-auth-signin-007`, `NFR-auth-signin-012`
* **Errors:** `E-auth-signin-006`, `E-auth-signin-007`, `E-auth-signin-008`, `E-auth-signin-009`, `E-auth-signin-012`, `E-auth-signin-013`, `E-auth-signin-016`, `E-auth-signin-017`, `E-auth-signin-018`

<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền ai4ba.com</sub>
