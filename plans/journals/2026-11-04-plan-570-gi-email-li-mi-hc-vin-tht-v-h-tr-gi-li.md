---
title: "Plan #570: gửi email lời mời học viên thật và hỗ trợ gửi lại"
date: 2026-11-04
summary: "Hoàn tất điều tra nguyên nhân gốc, red-team 12 điểm và chốt handover plan 3 phase cho #570."
---

# Plan #570: gửi email lời mời học viên thật và hỗ trợ gửi lại

## Chuyện gì đã xảy ra

Điều tra lỗi #570 (mời học viên bằng email không gửi thư và không gửi lại được lời mời) xác định ba nguyên nhân chồng lên nhau:
1. `POST /api/students/invite` (`apps/server/src/routes/kernel.ts:460`) chỉ chèn dòng `student_invitation` rồi trả `201` mà không gọi `mailer.send`, trong khi `InviteStudentModal` vẫn toast `"Đã gửi lời mời tới ..."`.
2. Trên staging và mặc định infra, `MAIL_FROM` có dạng `Display <addr>` (`"TeacherOS <no-reply@teacheros.io.vn>"`). Khi đường thông báo lớp `POST /api/students` truyền `fromName`, hàm `composeFrom` (`packages/auth/src/mail/mailer.ts:12-16`) sinh chuỗi lồng hai dấu ngoặc nhọn `"<org> qua Teacher OS" <TeacherOS <no-reply@teacheros.io.vn>>` bị Resend từ chối `422`.
3. `POST /api/students` bỏ qua gửi email khi `activateNow === true` (mặc định của cả `AddStudentModal` và `EnrollStudentModal`), trả `409 STUDENT_ALREADY_IN_ORG` ở lần nhập lại mà không có trạng thái `"Chờ xác nhận"` hay nút `"Gửi lại lời mời"`.

## Quyết định

- Sửa `composeFrom` tách địa chỉ trần trước khi ghép `fromName`, lọc `\r\n\0`, gắn header `Idempotency-Key` và giới hạn `timeoutMs: 5_000` + `Retry-After <= 2s`.
- Gửi đồng bộ trên `POST /api/students/invite` (xóa bù trừ dòng `pending` khi lỗi `502`/`503`) và best-effort đồng bộ trên `POST /api/students`.
- Mở hai route gửi lại `POST /api/students/invitations/:id/resend` và `POST /api/students/:id/resend-invite` với CAS cooldown 60 giây bằng toán tử `Date` của Drizzle (tương thích D1), cập nhật tại chỗ dòng `notification_record` `class_enrolled:<enrollmentId>` và chặn role chỉ-đọc `ta`.
- Dùng `portalLinked = student.onboardingCompletedAt != null` (giữ optional `portalLinked?: boolean` trên client để chịu deploy skew) và hiển thị `"Chờ xác nhận"` + `"Gửi lại lời mời"` trên các modal và màn danh sách/chi tiết.

## Bước tiếp theo

Triển khai theo TDD 3 phase trong `plans/261104-0625-570-student-invite-email-resend/` qua `/ak-fix --auto --advice`, chạy review, E2E và ship beta.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
