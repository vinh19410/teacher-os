# Use Case: Mua gói thuê bao/Top-up qua QR Bank-Hub, Quản trị viên cấp hạn mức & Phân quyền Trung tâm 4 vai trò

> Scope: Teacher OS (`selfomy-alignment` — Chặng 2 `A0-lite`, Chặng 3 `A0-billing` & Chặng 4 `C-core`) · Level: sea

## Primary Actor

Giáo viên độc lập (Solo Teacher), Chủ trung tâm (Center Owner), Quản trị viên nền tảng (Platform Admin).

## Stakeholders & Interests

| Stakeholder | Interest |
|-------------|----------|
| Giáo viên độc lập / Chủ trung tâm | Nâng cấp gói thuê bao tháng (`200k / 350k / 500k`) hoặc mua gói Top-up (`149k / 100 credit`) tự động trong vài giây qua mã QR ngân hàng; có `3 ngày` ân hạn khi hết kỳ để không bị đứt quãng việc dạy học |
| Chủ trung tâm (Giai đoạn C) | Mời nhân sự theo đúng 4 vai trò chuẩn, phân công lớp học rõ ràng và đặt trần Credit AI hàng tháng cho từng giáo viên/trợ giảng để bảo vệ ngân sách chung |
| Quản trị viên nền tảng | Cấp phát gói/cộng hạn mức Credit thủ công nhanh chóng ở Chặng 2 (`A0-lite`) và xử lý các giao dịch chuyển khoản lệch số tiền ở Chặng 3 |

## Trigger

Giáo viên độc lập hoặc Chủ trung tâm mở màn hình **Gói cước & Ví Credit AI** để mua gói thuê bao / nạp thêm Credit, hoặc mở màn hình **Nhân sự trung tâm** để mời nhân sự và phân bổ hạn mức trần Credit cá nhân (hoặc Quản trị viên nền tảng cấp hạn mức trên `apps/admin`).

## Preconditions

* Tổ chức đã được khởi tạo trên hệ thống kèm Ví Credit AI mặc định (gói Dùng thử `30 credit` một lần duy nhất theo `FR-selfomy-alignment-011`).
* Ở Chặng 3 (`A0-billing`), luồng nhận thông báo biến động số dư từ dịch vụ đối soát ngân hàng (Bank-Hub) đã sẵn sàng.

## Guarantees

* __Minimal Guarantee:__ Mọi đơn thanh toán QR quá hạn `15 phút` hoặc chuyển lệch số tiền không bao giờ làm cộng nhầm hay mất số dư Credit hiện có của tổ chức; ngay cả khi gói thuê bao chuyển sang trạng thái *Hết hạn gói (`expired`)* sau `3 ngày` ân hạn, toàn bộ dữ liệu lớp học, điểm danh và sổ công nợ vẫn hoạt động bình thường.
* __Success Guarantee:__ Gói thuê bao tháng (`30 ngày`) hoặc lô Top-up (`100 credit`, hạn `12 tháng`) được kích hoạt chính xác ngay khi đối soát khớp lệnh; nhân sự trung tâm được gán đúng 1 trong 4 vai trò, chỉ truy cập được lớp được phân công và chịu sự kiểm soát của trần Credit AI cá nhân hàng tháng.

## Main Success Scenario

1. Giáo viên độc lập hoặc Chủ trung tâm mở màn hình **Gói cước & Ví Credit AI**, xem số dư Credit định kỳ trong tháng, số dư Credit Top-up còn lại và chọn nâng cấp gói thuê bao tháng (*Cơ bản `200.000đ/70 credit`*, *Chuyên nghiệp `350.000đ/130 credit`*, *Nâng cao `500.000đ/200 credit`*) hoặc mua thêm gói **Top-up (`149.000đ/100 credit`, hạn `12 tháng`)** (`FR-selfomy-alignment-024`).
2. Hệ thống tạo đơn hàng ở trạng thái *Chờ thanh toán (`pending`)* có hiệu lực trong `15 phút` và hiển thị mã QR chuyển khoản ngân hàng trên nền trắng kèm số tiền chính xác và nội dung chuyển khoản định danh duy nhất (`FR-selfomy-alignment-024`, `BR-selfomy-alignment-010`).
3. Người dùng quét mã QR trên ứng dụng ngân hàng và xác nhận chuyển khoản; dịch vụ **Bank-Hub** gửi thông báo giao dịch về hệ thống Teacher OS (`FR-selfomy-alignment-025`).
4. Hệ thống đối soát khớp đúng số tiền và mã định danh đơn hàng trong hạn `15 phút`, chuyển đơn sang trạng thái *Đã thanh toán (`paid`)*, kích hoạt gói thuê bao tháng mới (`active`, chu kỳ `30 ngày`) hoặc cộng lô `100 credit` Top-up (hạn `12 tháng`) vào ví tổ chức và gửi Email xác nhận thành công (`FR-selfomy-alignment-025`, `BR-selfomy-alignment-002`).
5. Khi mở rộng lên mô hình Trung tâm (Chặng 4), **Chủ trung tâm** mở màn hình **Nhân sự trung tâm**, nhập địa chỉ Email của nhân sự mới và chọn đúng 1 trong 4 vai trò: *Chủ trung tâm (`Owner`)*, *Quản lý/Giáo vụ (`Admin/Staff`)*, *Giáo viên đứng lớp (`Teacher`)* hoặc *Trợ giảng (`TA`)* (`FR-selfomy-alignment-029`).
6. Chủ trung tâm (hoặc Giáo vụ) gán **Giáo viên đứng lớp** và **Trợ giảng** phụ trách từng lớp học cụ thể, đồng thời Chủ trung tâm thiết lập **Hạn mức trần Credit AI cá nhân hàng tháng** (`số nguyên ≥ 0`) cho từng nhân sự (`FR-selfomy-alignment-029`, `FR-selfomy-alignment-030`).
7. Khi nhân sự đăng nhập và làm việc, hệ thống tự động cô lập dữ liệu theo vai trò (Giáo viên đứng lớp và Trợ giảng chỉ thấy các lớp được giao) và kiểm soát mọi lượt gọi AI có phí theo quy tắc kép: kiểm tra đồng thời **Trần cá nhân trong tháng** VÀ **Ví Credit chung của tổ chức** (`BR-selfomy-alignment-011`).
8. Cuối tháng hoặc trong kỳ vận hành, Chủ trung tâm / Giáo vụ xem **Bảng chấm công ca dạy** tự động tổng hợp từ các buổi học đã hoàn tất điểm danh, theo dõi thanh tiến độ **Mục tiêu doanh thu tháng** và lọc lớp học / sổ công nợ theo từng **Cơ sở (`campus_id`)** (`FR-selfomy-alignment-032`).

## Extensions

__1a. Ở Chặng 2 (`A0-lite` — khi chưa mở cổng thanh toán QR tự động) hoặc khi cần xử lý đối soát thủ công:__
* 1a1. Giáo viên liên hệ nâng cấp gói; **Quản trị viên nền tảng** mở cổng quản trị (`apps/admin`), chọn tổ chức tương ứng, kích hoạt gói thuê bao tháng hoặc cộng/điều chỉnh số dư Credit AI kèm ghi chú lý do đối soát (`FR-selfomy-alignment-012`).
* 1a2. Hệ thống cập nhật ngay trạng thái gói và số dư Ví Credit AI của tổ chức, đồng thời ghi vết vào nhật ký giao dịch.

__3a. Người dùng đóng trình duyệt sau khi đã quét mã QR chuyển khoản trên điện thoại:__
* 3a1. Hệ thống vẫn nhận thông báo giao dịch từ Bank-Hub ở chế độ nền, kích hoạt gói cước / cộng Credit bình thường và gửi Email xác nhận.

__4a. Quá `15 phút` mà hệ thống chưa nhận được giao dịch thanh toán, hoặc giao dịch chuyển khoản bị lệch số tiền / báo về trễ (`E-selfomy-alignment-012`):__
* 4a1. Nếu quá `15 phút` chưa nhận tiền, hệ thống tự động chuyển đơn hàng sang trạng thái *Hết hạn (`expired`)* và hiển thị thông báo hướng dẫn tạo lại mã QR mới.
* 4a2. Nếu nhận được giao dịch nhưng số tiền không khớp với đơn hàng hoặc giao dịch Bank-Hub báo về trễ sau khi đơn đã *Hết hạn (`expired`)*, hệ thống tự động chuyển đơn sang trạng thái *Cần đối soát (`mismatch`)*, thông báo cho người dùng (`E-selfomy-alignment-012`) và đẩy vào danh sách chờ Quản trị viên nền tảng xử lý qua `FR-selfomy-alignment-012`.

__4b. Gói thuê bao tháng chạm ngày hết hạn chu kỳ `30 ngày` mà chưa có giao dịch gia hạn (`BR-selfomy-alignment-010`):__
* 4b1. Hệ thống chuyển trạng thái gói sang **Đang ân hạn (`grace_period`)** trong `3 ngày` (`72 giờ`), hiển thị băng rôn nhắc gia hạn đầu trang nhưng vẫn cho phép tổ chức sử dụng số dư Credit còn lại (`FR-selfomy-alignment-026`).
* 4b2. Nếu quá `72 giờ` ân hạn mà vẫn chưa thanh toán, hệ thống chuyển gói sang **Hết hạn gói (`expired`)**, khóa các tác vụ gọi AI (`E-selfomy-alignment-006`) nhưng giữ nguyên toàn bộ chức năng quản lý lớp học, điểm danh và công nợ.

__7a. Nhân sự trung tâm gọi AI khi đã dùng chạm hạn mức trần Credit cá nhân trong tháng (`E-selfomy-alignment-007`):__
* 7a1. Hệ thống chặn lệnh gọi AI và hiển thị thông báo `E-selfomy-alignment-007` mặc dù Ví Credit chung của tổ chức vẫn còn số dư.
* 7a2. Chủ trung tâm mở màn hình Nhân sự trung tâm để nâng hạn mức trần tháng cho nhân sự đó nếu đồng ý cấp thêm.

## Related Requirements

* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-011|FR-selfomy-alignment-011]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-012|FR-selfomy-alignment-012]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-024|FR-selfomy-alignment-024]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-025|FR-selfomy-alignment-025]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-026|FR-selfomy-alignment-026]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-029|FR-selfomy-alignment-029]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-030|FR-selfomy-alignment-030]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-032|FR-selfomy-alignment-032]]
* [[../srs/selfomy-alignment-spec.md#BR-selfomy-alignment-002|BR-selfomy-alignment-002]]
* [[../srs/selfomy-alignment-spec.md#BR-selfomy-alignment-007|BR-selfomy-alignment-007]]
* [[../srs/selfomy-alignment-spec.md#BR-selfomy-alignment-010|BR-selfomy-alignment-010]]
* [[../srs/selfomy-alignment-spec.md#BR-selfomy-alignment-011|BR-selfomy-alignment-011]]
* [[../srs/selfomy-alignment-spec.md#E-selfomy-alignment-001|E-selfomy-alignment-001]]
* [[../srs/selfomy-alignment-spec.md#E-selfomy-alignment-006|E-selfomy-alignment-006]]
* [[../srs/selfomy-alignment-spec.md#E-selfomy-alignment-007|E-selfomy-alignment-007]]
* [[../srs/selfomy-alignment-spec.md#E-selfomy-alignment-012|E-selfomy-alignment-012]]
