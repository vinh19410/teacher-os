# Use Case: Điểm danh tổng theo ngày & Tạo lịch nghỉ chung tự động dời buổi

> Scope: Teacher OS (`selfomy-alignment` — Chặng 1 `B-core`) · Level: sea

## Primary Actor

Giáo viên độc lập (Solo Teacher), Chủ trung tâm (Center Owner), Quản lý / Giáo vụ (Admin / Staff), Giáo viên đứng lớp (Teacher), Trợ giảng (TA).

## Stakeholders & Interests

| Stakeholder | Interest |
|-------------|----------|
| Giáo viên độc lập / Giáo vụ | Xem ngay các lớp chưa điểm danh trong ngày trên một màn hình duy nhất, hoàn tất điểm danh toàn bộ các lớp trong tối đa `2 phút` và xử lý lịch nghỉ lễ hàng loạt mà không phải sửa tay từng buổi học |
| Chủ trung tâm | Đảm bảo số buổi học đã học và số buổi còn lại trong gói học phí của học viên không bị lệch khi trung tâm nghỉ Lễ/Tết hoặc nghỉ đột xuất |
| Học viên chính thức | Nhận thông báo kịp thời qua Email và chuông thông báo cổng học viên ngay khi buổi học được dời lịch hoặc hủy buổi |

## Trigger

Người dùng mở Bảng điều khiển nhắc việc vào ngày có lịch dạy để thực hiện điểm danh hàng ngày, hoặc mở màn hình Lịch dạy để khai báo một kỳ nghỉ lễ / lịch nghỉ chung mới.

## Preconditions

* Người dùng đã đăng nhập vào không gian làm việc của tổ chức với vai trò hợp lệ.
* Tổ chức đã có tối thiểu 1 lớp học đang hoạt động và có lịch buổi học được xếp trong tuần/tháng hiện tại.

## Guarantees

* __Minimal Guarantee:__ Mọi thay đổi điểm danh hoặc lịch nghỉ chưa bấm xác nhận lưu đều không làm biến đổi số buổi học trong gói học phí của học viên; nếu gửi Email thông báo đổi lịch gặp sự cố thì lịch học mới vẫn được ghi nhận an toàn và thông báo In-app vẫn hiển thị đầy đủ.
* __Success Guarantee:__ Toàn bộ các lớp có ca học trong ngày được lưu trạng thái điểm danh đầy đủ; các buổi học trùng với Lịch nghỉ chung được chuyển trạng thái chính xác (*Đã hủy* hoặc *Nghỉ lễ* kèm sinh bù `+1 buổi` vào ngày học hợp lệ kế tiếp ở cuối khóa) và thông báo đổi lịch được phát đi cho học viên liên quan.

## Main Success Scenario

1. Người dùng mở **Bảng điều khiển (Dashboard)**; hệ thống hiển thị thẻ nhắc việc **Bài chờ chấm** và **Lớp chưa điểm danh trong ngày** thuộc phạm vi lớp mà người dùng phụ trách (`FR-selfomy-alignment-004`).
2. Người dùng bấm vào thẻ **Lớp chưa điểm danh trong ngày**; hệ thống mở màn hình **Điểm danh tổng theo ngày**, tự động lọc danh sách các lớp có ca học trong ngày hiện tại (đã loại trừ các buổi học rơi vào Lịch nghỉ chung) (`FR-selfomy-alignment-005`).
3. Người dùng đánh dấu trạng thái điểm danh (*Có mặt / Vắng có phép / Vắng không phép / Đi muộn*) kèm ghi chú nhanh cho học viên của từng lớp và bấm **Lưu điểm danh hàng loạt**; hệ thống ghi nhận kết quả điểm danh và cập nhật số lượng lớp chưa điểm danh về `0`.
4. Khi cần khai báo kỳ nghỉ lễ hoặc nghỉ đột xuất, Giáo viên độc lập / Chủ trung tâm / Giáo vụ mở màn hình **Lịch dạy** (hỗ trợ chuyển đổi chế độ xem **Tháng / Tuần / Ngày** có tô màu theo khóa học và sự kiện ngoài lớp) và bấm nút **Tạo lịch nghỉ chung** (`FR-selfomy-alignment-006`).
5. Người dùng nhập Tên kỳ nghỉ (`2–100 ký tự`), chọn Khoảng ngày nghỉ (`Ngày bắt đầu ≤ Ngày kết thúc`, tối đa `30 ngày`), chọn phạm vi áp dụng (toàn tổ chức hoặc lớp chọn lọc) và chọn phương án **Dời lịch (+1 buổi)** (`FR-selfomy-alignment-007`).
6. Hệ thống quét và hiển thị danh sách xem trước toàn bộ các buổi học bị trùng trong khoảng ngày nghỉ kèm ngày dự kiến sinh bù ở cuối khóa của từng lớp.
7. Người dùng bấm **Xác nhận áp dụng lịch nghỉ**; hệ thống chuyển trạng thái các buổi học `scheduled` bị trùng sang *Nghỉ lễ* (giữ nguyên các buổi đã điểm danh `completed`), tự động sinh bù `1 buổi` học vào ngày học hợp lệ kế tiếp ở cuối khóa (giữ nguyên số buổi còn lại trong gói học phí của học viên theo `BR-selfomy-alignment-003`) và kích hoạt gửi thông báo đổi lịch qua Email & In-app cho học viên (`FR-selfomy-alignment-008`, `FR-selfomy-alignment-001`).
8. Ngoài ra, trên không gian lớp học, Giáo viên / Giáo vụ mở tab **Bảng điểm ma trận**, lọc theo khoảng thời gian/kỹ năng và tạo cột bài kiểm tra trên giấy để nhập tay điểm số vào hồ sơ học viên (`FR-selfomy-alignment-031`).

## Extensions

__4a. Người dùng là Giáo viên đứng lớp hoặc Trợ giảng trong mô hình Trung tâm:__
* 4a1. Hệ thống chỉ hiển thị trên Bảng điều khiển, màn hình Điểm danh theo ngày và Lịch dạy đúng các lớp học mà nhân sự đó được phân công phụ trách (`FR-selfomy-alignment-029`, `NFR-selfomy-alignment-005`).
* 4a2. Nút **Tạo lịch nghỉ chung toàn trung tâm** được ẩn đối với Trợ giảng.

__5a. Người dùng chọn phương án "Hủy buổi" thay vì "Dời lịch (+1 buổi)":__
* 5a1. Hệ thống hiển thị cảnh báo rõ rằng các buổi học bị trùng sẽ chuyển sang trạng thái *Đã hủy* và không tự động kéo dài ngày kết thúc khóa học.
* 5a2. Khi người dùng xác nhận, hệ thống đánh dấu các buổi trùng là *Đã hủy* và gửi thông báo hủy buổi học cho học viên (`FR-selfomy-alignment-008`).

__6a. Ngày dự kiến sinh bù (+1 buổi) ở cuối khóa lại rơi trúng một Lịch nghỉ chung khác đã khai báo trước đó:__
* 6a1. Hệ thống tự động nhảy qua ngày nghỉ lễ đã biết đó để xếp buổi học bù vào ngày học hợp lệ kế tiếp của lớp theo lịch tuần (`BR-selfomy-alignment-003`).
* 6a2. Hệ thống hiển thị rõ ngày học bù sau khi đã nhảy qua kỳ nghỉ trên bảng xem trước.

__7a. Dịch vụ gửi Email thông báo đổi lịch bị lỗi kết nối sau 3 lần tự động thử lại (`E-selfomy-alignment-010`):__
* 7a1. Hệ thống giữ nguyên lịch học đã dời và thông báo In-app trên cổng học viên, đồng thời đánh dấu bản ghi Email ở trạng thái *Lỗi gửi (`failed`)*.
* 7a2. Giáo viên hoặc Giáo vụ mở màn hình Nhật ký thông báo và bấm **Gửi lại** khi cần (`FR-selfomy-alignment-003`).

## Related Requirements

* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-001|FR-selfomy-alignment-001]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-004|FR-selfomy-alignment-004]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-005|FR-selfomy-alignment-005]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-006|FR-selfomy-alignment-006]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-007|FR-selfomy-alignment-007]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-008|FR-selfomy-alignment-008]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-029|FR-selfomy-alignment-029]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-031|FR-selfomy-alignment-031]]
* [[../srs/selfomy-alignment-spec.md#BR-selfomy-alignment-003|BR-selfomy-alignment-003]]
* [[../srs/selfomy-alignment-spec.md#E-selfomy-alignment-010|E-selfomy-alignment-010]]
