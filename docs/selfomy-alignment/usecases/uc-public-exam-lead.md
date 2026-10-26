# Use Case: Khách vãng lai đăng ký thi thử tại Phòng thi ảo công khai & Kiểm soát trần Credit AI

> Scope: Teacher OS (`selfomy-alignment` — Chặng 3 `B-growth`) · Level: sea

## Primary Actor

Học viên vãng lai (Guest / Lead), Giáo viên độc lập (Solo Teacher), Chủ trung tâm (Center Owner), Quản lý / Giáo vụ (Admin / Staff).

## Stakeholders & Interests

| Stakeholder | Interest |
|-------------|----------|
| Giáo viên độc lập / Chủ trung tâm | Thu hút học viên tiềm năng qua đường dẫn thi thử công khai và thu thập đầy đủ Họ tên + Email + SĐT mà không bao giờ bị khách vãng lai hoặc đối thủ đốt quá `20 credit/ngày/phòng thi` |
| Học viên vãng lai | Vào làm bài thi thử IELTS có bấm giờ nhanh chóng mà không cần tạo tài khoản phức tạp, nhận điểm Reading/Listening ngay lập tức |

## Trigger

Học viên vãng lai mở đường dẫn **Phòng thi ảo công khai** do giáo viên/trung tâm chia sẻ và điền thông tin đăng ký bắt đầu làm bài.

## Preconditions

* Giáo viên độc lập, Chủ trung tâm hoặc Giáo vụ đã tạo Phòng thi ảo công khai gắn với tối thiểu 1 bộ đề đã xuất bản và phòng thi đang ở trạng thái mở (`FR-selfomy-alignment-021`).

## Guarantees

* __Minimal Guarantee:__ Tổng số Credit AI bị trừ từ một Phòng thi ảo công khai không bao giờ vượt quá `20 credit/ngày/phòng thi` và không vượt quá `1 lượt AI/khách`; mọi bài nộp của khách vãng lai (kể cả khi chạm trần AI) đều được ghi nhận an toàn kèm thông tin liên hệ.
* __Success Guarantee:__ Hồ sơ *Học viên vãng lai* được lưu trữ (hoặc hợp nhất vào *Học viên chính thức* nếu trùng Email); phần thi Reading/Listening được chấm tự động ngay lập tức (`0 credit`); phần Writing/Speaking được xử lý đúng theo cấu hình bật/tắt AI và trần bảo vệ của phòng thi.

## Main Success Scenario

1. Giáo viên độc lập, Chủ trung tâm hoặc Giáo vụ mở màn hình **Phòng thi ảo công khai**, tạo phòng thi mới (`3–120 ký tự`), gắn bộ đề đã xuất bản, đặt thời lượng làm bài (`5–180 phút`), giữ hoặc bật công tắc chấm AI cho Writing/Speaking (mặc định **TẮT**) và sao chép đường dẫn chia sẻ công khai (`FR-selfomy-alignment-021`).
2. Học viên vãng lai truy cập đường dẫn phòng thi công khai, nhập **Họ và tên (`2–80 ký tự`)**, **Email hợp lệ**, **Số điện thoại Việt Nam (`10 chữ số`, bắt đầu bằng `0`)** và đánh dấu đồng ý điều khoản xử lý dữ liệu cá nhân (`FR-selfomy-alignment-022`, `NFR-selfomy-alignment-006`).
3. Hệ thống chuẩn hóa Email (chữ thường, cắt khoảng trắng) và Số điện thoại, tạo bản ghi **Học viên vãng lai** ở trạng thái *Mới đăng ký (`guest_registered`)* thuộc tổ chức của giáo viên và khởi tạo giao diện làm bài có đồng hồ đếm ngược (`FR-selfomy-alignment-022`).
4. Trong quá trình làm bài, hệ thống tự động lưu tạm các câu trả lời của khách; khi khách bấm **Nộp bài** (hoặc khi đồng hồ đếm ngược về `00:00`), hệ thống khóa lượt thi và chuyển hồ sơ sang trạng thái *Đã có kết quả thi thử (`guest_tested`)*.
5. Đối với phần **Reading / Listening**, hệ thống chấm điểm tự động ngay lập tức (`0 credit`) và hiển thị điểm band cùng lời giải thích đáp án đã lưu đệm cho khách vãng lai (`FR-selfomy-alignment-023`).
6. Đối với phần **Writing / Speaking** (khi phòng thi được giáo viên chủ động bật chấm AI), hệ thống kiểm tra xác nhận khách đó chưa vượt quá `1 lượt AI/khách` VÀ phòng thi chưa tiêu tốn quá `20 credit/ngày/phòng thi` VÀ ví tổ chức còn đủ credit (`BR-selfomy-alignment-008`), sau đó kích hoạt luồng chấm nháp AI (`uc-ai-grading-review`) và thông báo cho khách chờ giáo viên duyệt gửi kết quả chi tiết qua Email (`FR-selfomy-alignment-023`).
7. Giáo viên xem danh sách **Học viên vãng lai**, bấm gửi lời mời vào lớp chính thức (`invited`); khi khách kích hoạt tài khoản trên cổng học viên, hệ thống chuyển hồ sơ sang *Học viên chính thức (`active_student`)* và giữ nguyên lịch sử bài thi thử đầu vào (`BR-selfomy-alignment-009`).

## Extensions

__3a. Địa chỉ Email khách nhập trùng khớp với một Học viên chính thức đã có trong tổ chức (`BR-selfomy-alignment-009`):__
* 3a1. Nếu khách chưa đăng nhập cổng học viên, hệ thống vẫn lưu kết quả lượt thi vào `PublicExamAttempt` và gắn cờ liên kết `matched_student_id` để Giáo viên xác nhận hợp nhất (hoặc tự động hợp nhất ngay khi Học viên chính thức đăng nhập xác thực), tránh việc khách bên ngoài nhập Email người khác làm lệch lịch sử học tập.

__4a. Học viên vãng lai bị mất kết nối mạng hoặc tải lại trình duyệt khi chưa hết giờ làm bài:__
* 4a1. Khi khách mở lại đường dẫn phòng thi trên cùng trình duyệt (hoặc nhập lại đúng Email + Số điện thoại khi thời gian làm bài vẫn còn), hệ thống khôi phục toàn bộ các câu trả lời đã lưu tạm và thời gian đếm ngược còn lại (`FR-selfomy-alignment-022`).

__6a. Phòng thi đang TẮT chấm AI cho Writing/Speaking (mặc định):__
* 6a1. Hệ thống lưu bài làm Writing/Speaking vào danh sách chờ chấm thủ công của giáo viên (`0 credit`) và thông báo cho khách vãng lai rằng giáo viên sẽ chấm và phản hồi qua Email.

__6b. Phòng thi có bật chấm AI nhưng khách đã dùng đủ `1 lượt AI/khách`, HOẶC phòng thi đã chạm trần `20 credit/ngày/phòng thi`, HOẶC ví tổ chức hết Credit (`E-selfomy-alignment-008`):__
* 6b1. Hệ thống vẫn lưu bài nộp Writing/Speaking thành công vào danh sách chờ chấm thủ công của giáo viên nhưng tự động bỏ qua bước gọi Dịch vụ AI.
* 6b2. Hệ thống hiển thị thông báo thân thiện `E-selfomy-alignment-008` cho khách vãng lai (*"Bài làm của bạn đã được ghi nhận thành công! Giáo viên sẽ chấm chi tiết phần bài viết/nói và gửi kết quả qua Email bạn đã đăng ký."*) và gửi cảnh báo chạm trần cho giáo viên.

## Related Requirements

* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-001|FR-selfomy-alignment-001]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-021|FR-selfomy-alignment-021]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-022|FR-selfomy-alignment-022]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-023|FR-selfomy-alignment-023]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-027|FR-selfomy-alignment-027]]
* [[../srs/selfomy-alignment-spec.md#BR-selfomy-alignment-008|BR-selfomy-alignment-008]]
* [[../srs/selfomy-alignment-spec.md#BR-selfomy-alignment-009|BR-selfomy-alignment-009]]
* [[../srs/selfomy-alignment-spec.md#BR-selfomy-alignment-012|BR-selfomy-alignment-012]]
* [[../srs/selfomy-alignment-spec.md#E-selfomy-alignment-008|E-selfomy-alignment-008]]
