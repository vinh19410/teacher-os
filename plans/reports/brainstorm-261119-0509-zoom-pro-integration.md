# Brainstorm — Tích hợp Zoom Pro qua API (thay Google Meet)

- Ngày: 2026-11-19
- Bối cảnh: Google Meet + recording vừa ship ở #816/#819 (`class_session_meeting`, `apps/server/src/lib/google-meet/*`, cron `*/10 * * * *`). Field "Link Zoom" nhập tay đã bị gỡ khỏi form ở #821, nhưng cột `class_session.zoom` / `lesson.zoom` vẫn là nguồn cho biến nhắc lịch `{{zoom_link}}`.

## Quyết định của người dùng

1. **Thay hẳn Google Meet** bằng Zoom (không đa provider).
2. **Server-to-Server OAuth**: một tài khoản Zoom Pro của trung tâm, secret nằm ở Worker; giáo viên không phải đăng nhập Zoom.
3. **Phạm vi**: tạo link họp tự động + cloud recording + tự điểm danh.
4. **Một license Zoom Pro**, mỗi thời điểm chỉ một giáo viên dạy → một host duy nhất cho mọi meeting.
5. **Link chung** cho cả lớp (nhắc lịch và portal học viên dùng cùng một join URL).
6. **Chưa có link Meet nào được tạo** → migration bỏ thẳng cột Google, không cần giữ dữ liệu.

## Outcome

Mỗi buổi học online có ngày cụ thể tự có Zoom meeting (tạo/sửa/huỷ/dời đồng bộ theo buổi). Sau buổi học, hệ thống tự lấy link cloud recording và danh sách người tham gia, gắn recording vào buổi và điền điểm danh cho học viên. Giáo viên và học viên thấy nút "Vào lớp (Zoom)" và "Xem recording" như hiện tại với Meet. Toàn bộ đường Google Meet/Calendar/Drive bị gỡ; đăng nhập Google vẫn giữ.

## Constraints

- Chạy trên Cloudflare Worker (Hono, D1). Secret mới qua alchemy: `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`.
- Token S2S sống 1 giờ, lấy bằng `grant_type=account_credentials`; cache trong isolate, không lưu DB.
- Zoom Pro một license: mọi meeting cùng một host (cấu hình `ZOOM_HOST_USER`, mặc định `me`). Người dùng xác nhận không có hai buổi dạy trùng giờ, nên không làm cảnh báo trùng lịch.
- Zoom giới hạn khoảng 100 request tạo/sửa meeting mỗi user host mỗi ngày → giữ trần tạo hàng loạt hiện có (`MAX_BULK_CREATE_PER_CALL = 12`, auto-provision 5).
- Cloud recording Pro có dung lượng giới hạn trên mỗi license; hết dung lượng thì recording thất bại và phải hiện trạng thái `failed` rõ ràng.
- Giữ `{{zoom_link}}` hoạt động (mirror join URL vào `class_session.zoom` / `lesson.zoom` như cơ chế mirror Meet hiện tại).
- Migration D1 phải backup trước; chưa có dữ liệu Meet nên được phép bỏ cột Google.

## Hướng đã chọn

- **Một Zoom meeting loại scheduled (type 2) cho mỗi buổi `(classId, date)`**, khớp đúng khoá của `class_session_meeting` và tái dùng luồng `ensureSessionMeeting` / bulk / sync khi sửa-huỷ-dời. Meeting đặt `auto_recording: "cloud"`.
- **Host**: một user Zoom duy nhất của account (`ZOOM_HOST_USER`).
- **Recording + điểm danh bằng cron có sẵn** (poll `GET /meetings/{id}/recordings` và participants của past meeting sau khi buổi kết thúc), không làm webhook ở bản đầu.
- **Điểm danh dựa trên khớp tên**: vì dùng link chung (không bật registration), cron đọc participants của buổi, chuẩn hoá tên hiển thị (bỏ dấu, viết thường) rồi khớp với tên học viên active của lớp. Khớp chắc chắn thì đánh "có mặt"; người không khớp hiện cho giáo viên gán tay. Học viên nên được dặn đặt tên Zoom đúng tên thật.
- **Schema**: thay các cột Google (`googleCalendarEventId`, `googleMeetSpaceName`, `googleMeetCode`, `googleOwnerUserId`, `recordingFileId`) bằng cột Zoom (`zoomMeetingId`, `zoomMeetingUuid`, passcode recording…); đổi `meetUrl` → `joinUrl`. Lưu danh sách participant chưa khớp để giáo viên gán.

## Trade-offs

| Lựa chọn | Giả định chịu lực | Hỏng đầu tiên khi |
|---|---|---|
| Meeting per-session (chọn) | Trần ~100 create/update/ngày/host đủ cho số buổi tạo trong ngày | Tạo hàng loạt cả khoá cho nhiều lớp trong một ngày dưới cùng một host |
| Một recurring meeting cho cả lớp | Học viên thích một link cố định | Recording/participants phải tách theo occurrence UUID, sửa một buổi dễ ảnh hưởng chuỗi |
| Cron poll (chọn) | Trễ ~10 phút cho recording/điểm danh là chấp nhận được | Cần recording/điểm danh gần như tức thì |
| Webhook `recording.completed` | Có endpoint công khai + verify chữ ký HMAC và CRC | Secret webhook lệch hoặc Zoom gửi lại trùng → cần idempotency |
| Điểm danh theo registrant (bỏ, vì chọn link chung) | Học viên dùng đúng link riêng | Học viên vào bằng link chung |
| Điểm danh khớp tên + giáo viên xác nhận (chọn) | Học viên đặt tên Zoom gần đúng tên thật | Trẻ vào bằng tên thiết bị/biệt danh, hoặc hai học viên trùng tên → rơi vào danh sách gán tay |

Better approaches: none — hướng khuyến nghị là hướng người dùng yêu cầu (S2S phù hợp giai đoạn single-org #539; khung `class_session_meeting` + cron đã có sẵn để thay provider).

## Non-goals

- Giữ song song Google Meet hoặc chọn provider theo lớp/org.
- OAuth Zoom cho từng giáo viên, Zoom Marketplace app công khai.
- Webhook Zoom (để sau nếu trễ cron là vấn đề).
- Nhúng cuộc họp vào app (Zoom Meeting SDK/Zoom Apps), webinar.
- Chuyển recording Meet cũ sang Zoom, hay quản lý license/dung lượng Zoom từ app.
- Gỡ đăng nhập bằng Google.

## Acceptance criteria

1. Migration D1 chuyển `class_session_meeting` sang cột Zoom (bỏ cột Google); test schema/contract pass.
2. Thiếu secret Zoom thì app vẫn chạy, nút tạo Zoom báo lỗi rõ (`ZOOM_NOT_CONFIGURED`), không crash cron.
3. Tạo/sửa/huỷ/dời/bù lễ một buổi online tạo/cập nhật/xoá đúng Zoom meeting; join URL mirror vào `zoom` để `{{zoom_link}}` vẫn đúng; có nút tạo đơn lẻ và hàng loạt.
4. Mọi meeting tạo dưới một host `ZOOM_HOST_USER`, có `auto_recording: cloud`, không bật registration.
5. Cron tìm buổi đã kết thúc, gán link recording (kèm passcode nếu có) với trạng thái `pending/ready/failed`; nút đồng bộ tay vẫn hoạt động.
6. Cron đọc participants, điền "có mặt" cho học viên khớp tên chắc chắn; người không khớp hiển thị để giáo viên gán tay; không ghi đè điểm danh giáo viên đã sửa tay.
7. Toàn bộ code, scope OAuth và UI Google Meet/Calendar/Drive bị gỡ; đăng nhập Google vẫn pass test.
8. `apps/web` và `apps/student` hiện "Vào lớp (Zoom)" (link chung) và "Xem recording" đúng trạng thái ở 3 viewport.
9. Server test dùng fake Zoom client (thay `fake-client.ts`), không gọi mạng thật; local gates `pnpm exec biome check .`, `pnpm check-types`, `pnpm test` pass.

## Cập nhật sau validate (2026-11-19)

Người dùng bỏ **tự điểm danh qua Zoom** (giáo viên tự điểm danh sau buổi), cho học viên vào trước host, chấp nhận giới hạn nhiều phiên, giữ copy landing. Các mục điểm danh ở trên không còn hiệu lực; nguồn chuẩn là `plans/261119-0617-zoom-pro-integration/plan.md`.

## Câu hỏi còn mở

Không còn — ba câu hỏi đã được người dùng trả lời (1 license, link chung, chưa có dữ liệu Meet).
