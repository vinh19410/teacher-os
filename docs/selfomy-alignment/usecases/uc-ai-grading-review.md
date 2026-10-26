# Use Case: Chấm nháp Writing/Speaking bằng AI, Trợ giảng rà soát & Giáo viên bấm "Chốt trả bài"

> Scope: Teacher OS (`selfomy-alignment` — Chặng 2 `A-core`, Chặng 3 `A-mở rộng` & Chặng 4 `C-core`) · Level: sea

## Primary Actor

Học viên chính thức (Enrolled Student), Trợ giảng (TA), Giáo viên đứng lớp (Teacher), Giáo viên độc lập (Solo Teacher), Chủ trung tâm (Center Owner).

## Stakeholders & Interests

| Stakeholder | Interest |
|-------------|----------|
| Giáo viên độc lập / Giáo viên đứng lớp | Tiết kiệm tối thiểu `50%` thời gian chấm bài nhờ có sẵn điểm gợi ý 4 tiêu chí IELTS và chú thích sửa lỗi từ AI, đồng thời dùng được khung Trợ giảng Chat AI và công cụ Tạo bài tập nhanh ngay trong không gian làm việc |
| Chủ trung tâm | Đảm bảo chất lượng chuyên môn: không bao giờ để điểm AI chưa qua giáo viên kiểm duyệt lộ ra cho học viên; kiểm soát việc Trợ giảng chỉ được lưu nháp và chỉ Giáo viên đứng lớp / Chủ trung tâm mới được bấm **"Chốt trả bài"** |
| Học viên chính thức | Nhận bài chấm Writing/Speaking có lời phê chất lượng đã được giáo viên kiểm duyệt và xem được lời giải thích đáp án tự động khi làm bài Reading/Listening |

## Trigger

Học viên chính thức bấm nộp bài làm Writing hoặc tệp ghi âm Speaking (hoặc giáo viên chủ động bấm yêu cầu chấm AI / sử dụng tiện ích Tạo bài nhanh & Chat AI).

## Preconditions

* Học viên đã nộp bài làm hợp lệ thuộc lớp học trong tổ chức và đã xác nhận đồng ý điều khoản xử lý dữ liệu cá nhân (`NFR-selfomy-alignment-006`).
* Bài nộp đang ở trạng thái *Mới nộp (`submitted`)* hoặc *Chờ chấm thủ công (`manual_pending`)*.

## Guarantees

* __Minimal Guarantee:__ Bài nộp của học viên luôn được lưu trữ an toàn bất kể Dịch vụ AI hay Ví Credit ở trạng thái nào; kết quả trong vùng **Bản nháp AI** (`ai_drafted` / `teacher_reviewing`) tuyệt đối không hiển thị trên cổng học viên khi chưa có thao tác bấm **"Chốt trả bài"**.
* __Success Guarantee:__ Bản chấm nháp AI được tạo đúng định mức (`Writing = 1 credit` hoặc *Chấm nhanh*, `Speaking = 2 credit` kèm nhãn *"chưa đánh giá phát âm"*); sau khi Giáo viên đứng lớp / Giáo viên độc lập / Chủ trung tâm rà soát và bấm **"Chốt trả bài"**, bài làm chuyển sang trạng thái *Đã trả bài (`published`)* và học viên nhận được thông báo kết quả qua Email & In-app.

## Main Success Scenario

1. Học viên chính thức hoàn thành và bấm nộp bài làm Writing hoặc tệp ghi âm Speaking trên cổng học viên; hệ thống lưu bài nộp ở trạng thái *Mới nộp (`submitted`)*.
2. Hệ thống xác định hạn mức cần kiểm tra: đối với lượt chấm tự động khi học viên nộp bài, hệ thống kiểm tra đồng thời **Ví Credit chung của tổ chức** và **Hạn mức trần cá nhân của Giáo viên đứng lớp phụ trách chính lớp đó** (`BR-selfomy-alignment-011`, `FR-selfomy-alignment-030`).
3. Hệ thống tạm giữ định mức Credit tương ứng (`1 credit` cho Writing hoặc `2 credit` cho Speaking) (`FR-selfomy-alignment-013`, `BR-selfomy-alignment-004`).
4. Nếu là bài **Speaking**, hệ thống gửi tệp ghi âm qua Dịch vụ chuyển giọng nói thành văn bản trước, xác nhận văn bản thu được có `≥ 15 từ` có nghĩa (`BR-selfomy-alignment-006`), sau đó gửi văn bản sang Dịch vụ AI chấm theo tiêu chí IELTS và gắn nhãn bắt buộc *"Gợi ý từ AI (dựa trên văn bản ghi âm — chưa đánh giá tiêu chí phát âm)"* (`FR-selfomy-alignment-019`). Nếu là bài **Writing**, hệ thống gửi thẳng bài luận sang Dịch vụ AI chấm theo 4 tiêu chí IELTS (`FR-selfomy-alignment-018`).
5. Dịch vụ AI trả về điểm band gợi ý và danh sách chú thích sửa lỗi; hệ thống chốt trừ `1` hoặc `2 credit` (ưu tiên trừ credit gói tháng trước Top-up theo `BR-selfomy-alignment-002`) và lưu kết quả vào vùng **Bản nháp AI** với trạng thái *Đã có nháp AI (`ai_drafted`)* hoàn toàn ẩn với học viên (`BR-selfomy-alignment-001`).
6. Ở mô hình Trung tâm, **Trợ giảng (`TA`)** mở màn hình **Chấm bài**, xem vùng **Bản nháp AI**, chỉnh sửa bổ sung lời phê và bấm **Lưu nháp trình duyệt**; hệ thống chuyển trạng thái bài chấm sang *Đang rà soát / Chờ giáo viên duyệt (`teacher_reviewing`)* trong khi giữ nút **"Chốt trả bài"** ở trạng thái khóa đối với Trợ giảng (`FR-selfomy-alignment-020`, `BR-selfomy-alignment-001`).
7. **Giáo viên độc lập**, **Giáo viên đứng lớp** hoặc **Chủ trung tâm** mở bài chấm, kiểm tra lại điểm band 4 tiêu chí cùng lời phê (có thể mở khung **Trợ giảng Chat AI** bên cạnh để tra cứu lịch sử học tập của học viên hoặc nháp nhận xét báo cáo phụ huynh theo `FR-selfomy-alignment-028`), rồi bấm nút **"Chốt trả bài"** (`FR-selfomy-alignment-020`).
8. Hệ thống chuyển trạng thái bài làm sang *Đã trả bài (`published`)*, công bố điểm số và lời phê chính thức trên cổng học viên, đồng thời kích hoạt gửi thông báo kết quả qua Email & In-app (`FR-selfomy-alignment-001`).

## Extensions

__2a. Tổ chức đang ở gói thuê bao tháng hoạt động nhưng `Số dư Credit chính = 0` khi chấm bài Writing (`BR-selfomy-alignment-007`):__
* 2a1. Hệ thống kiểm tra bộ đếm **Chấm nhanh** của tổ chức trong tháng hiện tại còn `< 30 bài` (`FR-selfomy-alignment-014`).
* 2a2. Hệ thống tự động gọi mô hình nhẹ để tạo bản nháp (không trừ credit, tăng bộ đếm *Chấm nhanh* thêm `1`), gắn nhãn *"Bản nháp chấm nhanh"* và tiếp tục bước 6.
* 2a3. Nếu tổ chức đã dùng hết cả `30 lượt` *Chấm nhanh* trong tháng (`E-selfomy-alignment-002`), hệ thống chuyển bài Writing sang trạng thái *Chờ chấm thủ công (`manual_pending`)* và hiển thị cảnh báo `E-selfomy-alignment-002` trên màn chấm bài.

__2b. Tổ chức hết Credit khi chấm bài Speaking (`E-selfomy-alignment-001`), gói quá hạn ân hạn (`E-selfomy-alignment-006`) hoặc Giáo viên đứng lớp chạm trần cá nhân (`E-selfomy-alignment-007`):__
* 2b1. Hệ thống không gọi Dịch vụ AI, chuyển bài nộp sang trạng thái *Chờ chấm thủ công (`manual_pending`)* để bảo toàn bài làm của học viên.
* 2b2. Khi giáo viên mở màn hình chấm bài, hệ thống hiển thị thông báo tương ứng (`E-selfomy-alignment-001` / `E-selfomy-alignment-006` / `E-selfomy-alignment-007`) để giáo viên chấm tay hoặc nạp thêm Credit.

__4a. Văn bản chuyển từ tệp ghi âm Speaking có dưới `15 từ` có nghĩa (`E-selfomy-alignment-009`):__
* 4a1. Hệ thống dừng luồng gọi AI chấm điểm IELTS, giải phóng và **không trừ `2 credit`** của tổ chức (`BR-selfomy-alignment-006`).
* 4a2. Hệ thống chuyển bài sang trạng thái *Chờ chấm thủ công (`manual_pending`)* kèm cờ cảnh báo `E-selfomy-alignment-009` trên màn hình chấm bài.

__5a. Dịch vụ AI hoặc Dịch vụ chuyển giọng nói gặp lỗi / quá thời gian chờ (`E-selfomy-alignment-004`):__
* 5a1. Hệ thống tự động thử lại tối đa `2 lần` ở chế độ nền.
* 5a2. Nếu sau `2 lần` thử lại vẫn thất bại, hệ thống hoàn trả ngay `1` hoặc `2 credit` tạm giữ về ví tổ chức (`BR-selfomy-alignment-004`), chuyển bài sang *Chờ chấm thủ công (`manual_pending`)* và hiển thị thông báo `E-selfomy-alignment-004` kèm nút **Thử chấm lại bằng AI**.

__6a. Hai nhân sự (ví dụ Trợ giảng và Giáo viên đứng lớp) cùng mở và lưu đè một bài chấm, hoặc bấm gọi chấm AI trùng lặp (`E-selfomy-alignment-011`):__
* 6a1. Hệ thống phát hiện phiên bản dữ liệu trên màn hình đã cũ (hoặc tiến trình AI đang chạy), chặn thao tác ghi đè và hiển thị cảnh báo `E-selfomy-alignment-011`.
* 6a2. Người dùng bấm tải lại phiên bản mới nhất trên màn hình trước khi tiếp tục rà soát.

__7a. Giáo viên dùng công cụ Tạo bài tập nhanh hoặc Học viên xem Giải thích đáp án tự động (`FR-selfomy-alignment-027`, `FR-selfomy-alignment-028`):__
* 7a1. Với câu hỏi Reading/Listening đã có lời giải thích trong bộ nhớ đệm của câu hỏi, hệ thống hiển thị ngay với chi phí `0 credit` và không tính vào hạn mức ngày (`BR-selfomy-alignment-012`).
* 7a2. Với yêu cầu tạo bài tập mới, giải thích câu hỏi mới hoặc Chat AI cơ bản, hệ thống trừ vào hạn mức công bằng `100 lượt miễn phí/ngày/tổ chức`. Nếu tổ chức đã dùng hết `100 lượt/ngày` (`E-selfomy-alignment-005`) hoặc người dùng chọn chế độ **Phân tích sâu**, hệ thống đề xuất trừ `0,5 credit/lượt`.

## Related Requirements

* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-013|FR-selfomy-alignment-013]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-014|FR-selfomy-alignment-014]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-018|FR-selfomy-alignment-018]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-019|FR-selfomy-alignment-019]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-020|FR-selfomy-alignment-020]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-027|FR-selfomy-alignment-027]]
* [[../srs/selfomy-alignment-spec.md#FR-selfomy-alignment-028|FR-selfomy-alignment-028]]
* [[../srs/selfomy-alignment-spec.md#BR-selfomy-alignment-001|BR-selfomy-alignment-001]]
* [[../srs/selfomy-alignment-spec.md#BR-selfomy-alignment-004|BR-selfomy-alignment-004]]
* [[../srs/selfomy-alignment-spec.md#BR-selfomy-alignment-006|BR-selfomy-alignment-006]]
* [[../srs/selfomy-alignment-spec.md#BR-selfomy-alignment-007|BR-selfomy-alignment-007]]
* [[../srs/selfomy-alignment-spec.md#BR-selfomy-alignment-011|BR-selfomy-alignment-011]]
* [[../srs/selfomy-alignment-spec.md#BR-selfomy-alignment-012|BR-selfomy-alignment-012]]
* [[../srs/selfomy-alignment-spec.md#E-selfomy-alignment-001|E-selfomy-alignment-001]]
* [[../srs/selfomy-alignment-spec.md#E-selfomy-alignment-002|E-selfomy-alignment-002]]
* [[../srs/selfomy-alignment-spec.md#E-selfomy-alignment-004|E-selfomy-alignment-004]]
* [[../srs/selfomy-alignment-spec.md#E-selfomy-alignment-005|E-selfomy-alignment-005]]
* [[../srs/selfomy-alignment-spec.md#E-selfomy-alignment-006|E-selfomy-alignment-006]]
* [[../srs/selfomy-alignment-spec.md#E-selfomy-alignment-007|E-selfomy-alignment-007]]
* [[../srs/selfomy-alignment-spec.md#E-selfomy-alignment-009|E-selfomy-alignment-009]]
* [[../srs/selfomy-alignment-spec.md#E-selfomy-alignment-011|E-selfomy-alignment-011]]
