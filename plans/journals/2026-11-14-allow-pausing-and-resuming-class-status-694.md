---
title: "Allow pausing and resuming class status (#694)"
date: 2026-11-14
summary: "Implement reversible active/paused class status across API, Teacher Web, and Student Portal with atomic TOCTOU guards"
---

# Allow pausing and resuming class status (#694)

## What happened
- Triển khai luồng chuyển trạng thái lớp hai chiều `"active" ↔ "paused"` cho Issue `#694` xuyên suốt API (`apps/server`), Teacher Web (`apps/web`), và Student Portal (`apps/student`).
- Khóa nguyên tử (`HTTP 409 CLASS_PAUSED`) cho các thao tác giảng dạy/điểm danh/check-in, tạo buổi thủ công (`POST /classes/:id/sessions`), kỳ nghỉ nhắm theo lớp (`POST /holidays` `scope: "classes"`), tạo/nhận/kích hoạt tuyển sinh (`POST /students`, `POST /classes/:id/enroll`, `accept`), và gửi lại lời mời học viên (`resend-invite` kèm hoàn nguyên `lastInviteEmailAt`), đồng thời kích hoạt `backfillStuckEnrollments` khi lớp mở lại (`paused -> active`).
- Che giấu buổi sắp tới khỏi `/schedule`, `/dashboard`, `dashboard-reminders`, `findScheduleConflicts` và `/api/student/schedule`, nhưng giữ lại lịch sử điểm danh theo ngày ở chế độ chỉ đọc (`classPaused: true`) mà không xóa bất kỳ dòng `lesson` hay `class_session` nào.
- Bổ sung post-write race guards (`clsBeforeNotify`, `findClass` trước khi phát notification `schedule_changed` và `innerJoin classTable.status = "active"` cho `holiday_created`), tự động đóng `EnrollStudentModal` khi lớp chuyển sang `paused`, invalidate cache `daily-attendance` ngay khi đổi trạng thái, và khóa chế độ chụp ảnh POT bằng `CAPTURE_POT=1`.

## Decision
- Giới hạn phạm vi đúng 2 trạng thái `"active" ↔ "paused"` qua `POST /api/classes/:id/status` (giữ `PATCH /api/classes/:id` từ chối `status` và từ chối vai trò `ta` bằng `403`) — không thêm bảng migration DB hay trạng thái `archived`.
- Giữ mở các thao tác quản trị giáo trình/nội dung và chỉnh sửa lịch (chỉnh sửa lớp, ghi chú, học phí, sửa/hủy/xóa buổi, nhập/đồng bộ giáo trình với backfill trì hoãn tới lúc mở lại, giao bài tập và gán bộ đề tự học), nhưng triệt tiêu notification nhắc lịch/tuyển sinh khi lớp đang `paused`.

## Next steps
- Ship Beta PR vào nhánh `develop`, chạy `/ak-review-pr --fix --reply --advice`, gắn nhận xét tư vấn `kongming` lên PR & `#694` trước khi merge, xác nhận CI + `Deploy Staging` xanh và đăng POT kèm screenshot permalink theo SHA lên `#694`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
