# 2026-10-31 — Plan #513 (single-org theo chính sách)

- Bối cảnh: chủ app muốn app chỉ phục vụ mình, sau đó mới thương mại hoá. Brainstorm ban đầu hướng tới "đổi cấu trúc lớn".
- Scout:
  - `orgId`/`organizationId` xuất hiện khoảng 2.379 lần trong 168 file.
  - Phía giáo viên vốn đã chạy single-org (`bootstrapMiddleware` tự tạo org và lấy membership đầu tiên).
  - `TeamSwitcher` của học viên chỉ hiện dropdown khi có nhiều hơn một org.
- Quyết định: không gỡ schema org. Thêm allowlist `TEACHER_EMAILS` theo pattern `ADMIN_EMAILS` (rỗng = không giới hạn, production fail-closed), gate cả hook sign-up lẫn kernel mỗi request. Hoãn A0 (subscription/credit) và giai đoạn C (nhiều nhân sự).
- Supervision `--advice`: kongming (Fable) không chạy được vì hết usage credit. Plan chưa có duyệt go/no-go độc lập.
- Câu hỏi mở: đăng ký học viên giữ mở hay chỉ cho khi có lời mời; ngưỡng cụ thể của cổng thương mại hoá.
