# Use Case: Tra cứu Sổ công nợ học viên & Quản lý gửi/gửi lại thông báo Email + In-app

> Scope: Teacher OS (`selfomy-alignment` — Chặng 1 `B-core`) · Level: sea

## Primary Actor

Giáo viên độc lập (Solo Teacher), Chủ trung tâm (Center Owner), Quản lý / Giáo vụ (Admin / Staff), Học viên chính thức (Enrolled Student).

## Stakeholders & Interests

| Stakeholder | Interest |
|-------------|----------|
| Giáo viên độc lập / Chủ trung tâm / Giáo vụ | Nắm bắt chính xác tổng phải thu, tổng đã đóng và tổng số dư còn nợ lũy kế của từng học viên qua nhiều đợt thu thay vì phải đối chiếu từng hóa đơn rời rạc; kiểm soát được thông báo nào gửi lỗi để gửi lại ngay |
| Học viên chính thức | Nhận thông báo tức thì qua Email (có thể bấm trả lời trực tiếp về Email của giáo viên/trung tâm) và chuông thông báo trong cổng học viên cho cả 4 sự kiện quan trọng |

## Trigger

Giáo viên / Chủ trung tâm / Giáo vụ mở màn hình **Sổ công nợ học viên** để rà soát học phí và gửi nhắc phí, hoặc hệ thống tự động kích hoạt thông báo khi phát sinh 1 trong 4 sự kiện (*Mời vào lớp, Giao/trả bài tập, Hóa đơn học phí, Thay đổi lịch học*).

## Preconditions

* Tổ chức đã có danh sách Học viên chính thức và các hóa đơn học phí đã phát hành.
* Tên miền gửi Email chung của Teacher OS đã được xác thực và tổ chức đã khai báo Tên hiển thị kèm địa chỉ Email nhận phản hồi (`Reply-To`).

## Guarantees

* __Minimal Guarantee:__ Khi kênh gửi Email bên ngoài gặp sự cố hoặc địa chỉ Email của học viên không nhận được thư, bản ghi thông báo trong ứng dụng (In-app) vẫn được lưu thành công và hệ thống ghi nhận đúng trạng thái *Lỗi gửi (`failed`)* sau 3 lần thử tự động mà không làm gián đoạn thao tác nghiệp vụ gốc.
* __Success Guarantee:__ Sổ công nợ phản ánh chính xác số dư nợ lũy kế theo thời gian thực của từng học viên; thông báo được gửi tới hộp thư Email và chuông thông báo In-app của học viên với trạng thái *Đã gửi (`sent`)* và cập nhật sang *Đã xem (`read`)* khi học viên mở xem.

## Main Success Scenario

1. Giáo viên độc lập, Chủ trung tâm hoặc Giáo vụ mở màn hình **Sổ công nợ học viên** (`FR-selfomy-alignment-009`).
2. Hệ thống tổng hợp và hiển thị danh sách học viên của tổ chức kèm 3 cột số liệu lũy kế: **Tổng phải thu**, **Tổng đã đóng** và **Tổng còn nợ hiện tại**, hỗ trợ bộ lọc chip theo trạng thái (*Tất cả / Còn nợ / Quá hạn / Đã hoàn tất*) và ô tìm kiếm học viên.
3. Người dùng chọn một học viên đang có số dư nợ; hệ thống mở ngăn chi tiết hiển thị dòng thời gian toàn bộ các hóa đơn học phí đã phát hành và lịch sử các giao dịch thanh toán (qua QR Bank-Hub hoặc thu thủ công) của học viên đó (`FR-selfomy-alignment-010`).
4. Người dùng bấm nút **Gửi nhắc học phí** (hoặc khi hệ thống phát sinh sự kiện *Mời vào lớp / Giao-trả bài tập / Thay đổi lịch học*); hệ thống tạo bản ghi thông báo ở trạng thái *Đang chờ gửi (`queued`)* (`FR-selfomy-alignment-001`).
5. Hệ thống hiển thị ngay thông báo trên chuông thông báo cổng học viên (In-app), đồng thời gửi Email từ tên miền chung của Teacher OS với Tên người gửi và địa chỉ trả lời (`Reply-To`) theo giáo viên/trung tâm rồi cập nhật trạng thái bản ghi sang *Đã gửi (`sent`)* (`FR-selfomy-alignment-001`, `FR-selfomy-alignment-002`).
6. Khi Học viên chính thức mở thông báo trên cổng học viên, hệ thống cập nhật trạng thái sang *Đã xem (`read`)* để giáo viên theo dõi trên màn hình **Nhật ký thông báo** (`FR-selfomy-alignment-002`).

## Extensions

__5a. Dịch vụ gửi Email báo lỗi chuyển phát ở lần gọi đầu tiên:__
* 5a1. Hệ thống tự động đưa bản ghi vào hàng đợi thử lại ở chế độ nền tối đa `3 lần` (`FR-selfomy-alignment-003`).
* 5a2. Nếu một trong các lần thử lại thành công, hệ thống chuyển trạng thái bản ghi sang *Đã gửi (`sent`)*.

__5b. Cả 3 lần thử gửi Email tự động đều thất bại (`E-selfomy-alignment-010`):__
* 5b1. Hệ thống chuyển trạng thái bản ghi thông báo sang *Lỗi gửi (`failed`)* và hiển thị chấm trạng thái đỏ kèm lý do lỗi trên màn hình **Nhật ký thông báo**.
* 5b2. Giáo viên hoặc Giáo vụ kiểm tra/cập nhật lại địa chỉ Email của học viên và bấm nút **Gửi lại**; hệ thống đặt lại trạng thái về *Đang chờ gửi (`queued`)* và thực hiện gửi lại ngay (`FR-selfomy-alignment-003`).

__1a. Giáo viên đứng lớp hoặc Trợ giảng cố gắng truy cập đường dẫn Sổ công nợ học viên:__
* 1a1. Hệ thống kiểm tra phân quyền vai trò (`NFR-selfomy-alignment-005`, `FR-selfomy-alignment-029`), chặn truy cập màn hình Sổ công nợ học viên và điều hướng về Bảng điều khiển lớp học được phân công.

## Related Requirements

* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-001|FR-selfomy-alignment-001]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-002|FR-selfomy-alignment-002]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-003|FR-selfomy-alignment-003]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-009|FR-selfomy-alignment-009]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-010|FR-selfomy-alignment-010]]
* [[../srs/selfomy-alignment-spec.md#E-selfomy-alignment-010|E-selfomy-alignment-010]]
