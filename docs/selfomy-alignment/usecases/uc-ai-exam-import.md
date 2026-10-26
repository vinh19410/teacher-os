# Use Case: Nhập đề thi IELTS từ tệp PDF/ảnh bằng AI có kiểm tra trùng & tạm giữ Credit

> Scope: Teacher OS (`selfomy-alignment` — Chặng 2 `A0-lite + A-core`) · Level: sea

## Primary Actor

Giáo viên độc lập (Solo Teacher), Chủ trung tâm (Center Owner), Giáo viên đứng lớp (Teacher).

## Stakeholders & Interests

| Stakeholder | Interest |
|-------------|----------|
| Giáo viên độc lập / Giáo viên đứng lớp | Chuyển đổi nhanh tệp đề thi PDF/ảnh chụp thành đề thi có cấu trúc đoạn đọc, câu hỏi và đáp án nháp trong vòng `≤ 120 giây`, giữ lại trên `70%` câu hỏi hợp lệ và sửa tay miễn phí trước khi xuất bản |
| Chủ trung tâm | Đảm bảo không bị trừ phí trùng `5 credit` khi nhân sự tải lại cùng một tệp đề thi đã trích xuất và được hoàn trả `100%` credit tự động nếu dịch vụ AI gặp lỗi |

## Trigger

Người dùng mở màn hình **Soạn đề** và bấm nút **Nhập đề bằng AI (5 Credit)**.

## Preconditions

* Người dùng đã đăng nhập với vai trò Giáo viên độc lập, Chủ trung tâm hoặc Giáo viên đứng lớp.
* Tổ chức đang ở gói Dùng thử hoặc gói thuê bao tháng chưa bị khóa (`active` hoặc `grace_period`).

## Guarantees

* __Minimal Guarantee:__ Nếu tệp tải lên không hợp lệ, trùng với tệp cũ, dịch vụ AI phản hồi quá `120 giây` hoặc không trích xuất được cấu trúc câu hỏi nào, ví Credit AI của tổ chức và hạn mức trần cá nhân của nhân sự bảo toàn nguyên vẹn (tự động giải phóng và hoàn trả đủ `5 credit` tạm giữ).
* __Success Guarantee:__ Hệ thống tạo bản đề nháp gồm đoạn đọc hiểu, danh sách câu hỏi và đáp án từ tệp PDF/ảnh, chốt trừ đúng `5 credit` (ưu tiên trừ credit gói tháng trước Top-up) và mở màn hình chỉnh sửa đề miễn phí cho người dùng.

## Main Success Scenario

1. Người dùng trên màn hình **Soạn đề** bấm nút **Nhập đề bằng AI** và chọn tải lên tệp đề thi từ máy tính (`FR-selfomy-alignment-015`).
2. Hệ thống kiểm tra điều kiện tệp: định dạng thuộc `.pdf`, `.png`, `.jpg`, `.jpeg`, dung lượng `≤ 15 MB`, số trang `≤ 20 trang` và tệp PDF không khóa mật khẩu (`FR-selfomy-alignment-015`).
3. Hệ thống tính mã nhận diện nội dung tệp và xác nhận tệp này chưa từng được trích xuất thành công trước đó trong cùng tổ chức (`BR-selfomy-alignment-005`).
4. Hệ thống kiểm tra Ví Credit AI của tổ chức còn `≥ 5 credit` khả dụng (và hạn mức trần cá nhân của người thực hiện còn `≥ 5 credit` nếu ở mô hình Trung tâm), sau đó thực hiện **tạm giữ `5 credit`** (`FR-selfomy-alignment-013`, `BR-selfomy-alignment-004`).
5. Hệ thống gửi tệp đề thi sang Dịch vụ AI để bóc tách cấu trúc đoạn văn, nhóm câu hỏi và đáp án trong thời gian tối đa `120 giây` (`FR-selfomy-alignment-016`).
6. Dịch vụ AI trả về cấu trúc đề hợp lệ (có tối thiểu 1 đoạn nội dung hoặc 1 nhóm câu hỏi đọc được); hệ thống **chốt trừ `5 credit`** (ưu tiên trừ từ số dư gói tháng trước, số dư Top-up sau theo `BR-selfomy-alignment-002`), ghi nhật ký sử dụng và phát cảnh báo nếu tổng mức dùng trong kỳ chạm `80%` hoặc `100%` (`FR-selfomy-alignment-013`).
7. Hệ thống nạp toàn bộ nội dung vừa bóc tách vào màn hình **Soạn đề nháp**; người dùng rà soát, chỉnh sửa tay văn bản, câu hỏi và đáp án với chi phí `0 credit` rồi bấm **Lưu nháp** hoặc **Xuất bản đề** (`FR-selfomy-alignment-017`).

## Extensions

__2a. Tệp tải lên sai định dạng, vượt quá `15 MB`, vượt quá `20 trang` hoặc có mật khẩu (`E-selfomy-alignment-003`):__
* 2a1. Hệ thống chặn ngay tại hộp thoại tải tệp, không tạm giữ credit và hiển thị thông báo `E-selfomy-alignment-003`.
* 2a2. Người dùng tách nhỏ tệp hoặc chọn tệp hợp lệ khác để tải lên lại.

__3a. Tệp tải lên trùng mã nhận diện với một tệp đã trích xuất thành công trước đó trong cùng tổ chức (`BR-selfomy-alignment-005`):__
* 3a1. Hệ thống không gọi lại Dịch vụ AI và không trừ `5 credit`.
* 3a2. Hệ thống hiển thị thông báo phát hiện tệp trùng và mở thẳng bản đề nháp đã bóc tách trước đó để người dùng tiếp tục chỉnh sửa.

__4a. Ví Credit AI của tổ chức còn `< 5 credit` (`E-selfomy-alignment-001`) hoặc gói thuê bao đã quá hạn ân hạn 3 ngày (`E-selfomy-alignment-006`):__
* 4a1. Hệ thống từ chối thực hiện tác vụ và hiển thị hộp thoại thông báo `E-selfomy-alignment-001` (hoặc `E-selfomy-alignment-006`).
* 4a2. Người dùng bấm chuyển sang luồng mua gói thuê bao / nạp thêm gói Top-up `100 Credit` (`uc-subscription-and-center-staff`) hoặc đóng hộp thoại để nhập đề thủ công.

__4b. Nhân sự trung tâm đã chạm hạn mức trần Credit cá nhân trong tháng (`E-selfomy-alignment-007`):__
* 4b1. Hệ thống chặn lệnh gọi AI và hiển thị thông báo `E-selfomy-alignment-007` hướng dẫn liên hệ Chủ trung tâm nâng hạn mức.

__5a. Người dùng đóng trình duyệt hoặc mất kết nối mạng trong lúc Dịch vụ AI đang bóc tách đề:__
* 5a1. Tiến trình bóc tách vẫn chạy ngầm trên máy chủ đến khi hoàn tất và lưu thành bản *Đề nháp mới nhập từ AI*.
* 5a2. Khi người dùng mở lại màn hình Soạn đề, hệ thống hiển thị ngay bản đề nháp vừa trích xuất xong.

__6a. Dịch vụ AI phản hồi quá `120 giây` hoặc trả về kết quả rỗng/lỗi không đọc được cấu trúc đề (`E-selfomy-alignment-004`):__
* 6a1. Hệ thống tự động hủy tiến trình, giải phóng và **hoàn trả đủ `5 credit` tạm giữ** về đúng ví của tổ chức và hạn mức nhân sự (`BR-selfomy-alignment-004`).
* 6a2. Hệ thống hiển thị thông báo `E-selfomy-alignment-004` để người dùng bấm thử lại hoặc nhập thủ công.

## Related Requirements

* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-013|FR-selfomy-alignment-013]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-015|FR-selfomy-alignment-015]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-016|FR-selfomy-alignment-016]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-017|FR-selfomy-alignment-017]]
* [[../srs/selfomy-alignment-spec.md#BR-selfomy-alignment-002|BR-selfomy-alignment-002]]
* [[../srs/selfomy-alignment-spec.md#BR-selfomy-alignment-004|BR-selfomy-alignment-004]]
* [[../srs/selfomy-alignment-spec.md#BR-selfomy-alignment-005|BR-selfomy-alignment-005]]
* [[../srs/selfomy-alignment-spec.md#E-selfomy-alignment-001|E-selfomy-alignment-001]]
* [[../srs/selfomy-alignment-spec.md#E-selfomy-alignment-003|E-selfomy-alignment-003]]
* [[../srs/selfomy-alignment-spec.md#E-selfomy-alignment-004|E-selfomy-alignment-004]]
* [[../srs/selfomy-alignment-spec.md#E-selfomy-alignment-006|E-selfomy-alignment-006]]
* [[../srs/selfomy-alignment-spec.md#E-selfomy-alignment-007|E-selfomy-alignment-007]]
