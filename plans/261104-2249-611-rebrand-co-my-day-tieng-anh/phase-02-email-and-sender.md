---
phase: 2
title: "Email, tên người gửi, MAIL_FROM"
status: completed
dependencies: []
---

# Phase 2: Email, tên người gửi, MAIL_FROM

## Context

Server dựng `fromName` ở các endpoint thông báo trong `kernel.ts` và `deliver.ts`. Template mail của `packages/auth` lặp tên ở tiêu đề, tiêu đề thẻ, nội dung, footer, và Better-Auth config tiêu đề email subject.

## Files được sửa

- Mới: `apps/server/src/lib/brand.ts` xuất `BRAND_NAME = "Cô Mỹ Dạy Tiếng Anh"` và helper `formatSenderName(senderName?: string | null): string` (tránh tạo chuỗi trùng lặp nếu senderName đã là BRAND_NAME); mới: `packages/auth/src/mail/brand.ts` xuất cùng hằng số.
- `apps/server/src/routes/kernel.ts` (dùng helper `formatSenderName`), `apps/server/src/lib/notifications/deliver.ts` (thêm `<meta charset="utf-8">` và dùng `formatSenderName`), `apps/server/src/lib/notifications/invite-email.ts` (thay fallback orgLabel và nội dung lời mời), `apps/server/src/routes/grading.ts:774` (`source: "Teacher OS Demo"` → `${BRAND_NAME} Demo`).
- `packages/auth/src/mail/{reset-password,verification,otp}-email-template.ts`
- `packages/auth/src/index.ts` (dòng 285, 310, 584: cập nhật subject email Better-Auth sang BRAND_NAME)
- `packages/auth/src/mail/mailer.ts` (`composeFrom`: đảm bảo display name có dấu được bọc quote `"${name}" <${email}>` đúng chuẩn RFC 5322 khi caller không truyền fromName riêng)
- `packages/infra/alchemy.run.ts:220` và `packages/infra/.env.example:54` (mặc định `MAIL_FROM` = `"Cô Mỹ Dạy Tiếng Anh" <onboarding@resend.dev>`)
- Test: `apps/server/src/lib/notifications/notifications.test.ts`, `apps/server/src/student-invitation.test.ts`, `packages/auth/src/mail/mail.test.ts`, `apps/e2e/specs/notifications-ac-001.spec.ts`

## Bước

1. Tạo hai file `brand.ts` với chuỗi NFC chuẩn, triển khai `formatSenderName`.
2. Thay literal bằng hằng số và helper ở các file server & mail.
3. Template mail: thay mọi `Teacher OS` / `TeacherOS` bằng `BRAND_NAME`; footer `&copy; 2022 TeacherOS` đổi tên và giữ năm hiện có (không tự ý đổi năm).
4. `packages/auth/src/index.ts`: đổi subject email thành `Cô Mỹ Dạy Tiếng Anh`.
5. `composeFrom`: chuẩn hóa quote display name cho RFC 5322.
6. Đổi mặc định `MAIL_FROM` thành `"Cô Mỹ Dạy Tiếng Anh" <onboarding@resend.dev>` ở hai file infra. Không đổi địa chỉ email/domain.
7. Cập nhật các file test cho khớp.
## Kiểm chứng

- `pnpm --filter server test`, `pnpm --filter @teacher-os/auth test`: xanh, gồm `mail.test.ts` kiểm chuỗi mới.
- e2e `notifications-ac-001` xanh local.
- Staging: đặt `MAIL_FROM` staging, gửi một mail OTP và một mail hóa đơn tới hộp thư thật, xác nhận tên người gửi có dấu hiển thị đúng và không lọt vào spam.

## Việc vận hành ngoài repo (cần người dùng xác nhận trước khi làm)

Biến GitHub `MAIL_FROM` ở environment staging và production hiện là `TeacherOS <no-reply@teacheros.io.vn>`. Đổi phần tên thành `Cô Mỹ Dạy Tiếng Anh`, giữ địa chỉ. Ghi lại trong `docs/production-release-runbook.md` (phase 4).

## Rủi ro và lui

Nhà cung cấp mail từ chối display name có dấu: giữ biến `MAIL_FROM` cũ trên prod, mã mới vẫn chạy vì biến ghi đè mặc định. Lui bằng revert commit.
