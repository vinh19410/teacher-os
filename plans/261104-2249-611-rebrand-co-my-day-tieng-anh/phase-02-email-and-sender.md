---
phase: 2
title: "Email, tên người gửi, MAIL_FROM"
status: pending
dependencies: []
---

# Phase 2: Email, tên người gửi, MAIL_FROM

## Context

Server dựng `fromName` bằng literal ở 5 chỗ trong `kernel.ts` và 1 chỗ trong `deliver.ts`. Template mail của `packages/auth` lặp tên ở tiêu đề, tiêu đề thẻ, nội dung và footer. Hai nơi không dùng chung package nên mỗi nơi có một hằng số riêng.

## Files được sửa

- Mới: `apps/server/src/lib/brand.ts` xuất `BRAND_NAME = "Cô Mỹ Dạy Tiếng Anh"`; mới: `packages/auth/src/mail/brand.ts` xuất cùng hằng số.
- `apps/server/src/routes/kernel.ts` (dòng 286, 590, 858, 1028, 1302), `apps/server/src/lib/notifications/deliver.ts` (dòng 105, 189), `apps/server/src/lib/notifications/invite-email.ts` (dòng 35, 37, 39, 58), `apps/server/src/routes/grading.ts:774` (`source: "Teacher OS Demo"` → `${BRAND_NAME} Demo`; kiểm xem giá trị này có được lưu DB và đọc ngược lại không trước khi đổi).
- `packages/auth/src/mail/{reset-password,verification,otp}-email-template.ts`
- `packages/infra/alchemy.run.ts:220` và `packages/infra/.env.example:54` (mặc định `MAIL_FROM`)
- Test: `apps/server/src/lib/notifications/notifications.test.ts`, `apps/server/src/student-invitation.test.ts`, `packages/auth/src/mail/mail.test.ts`, `apps/e2e/specs/notifications-ac-001.spec.ts`

## Bước

1. Tạo hai file `brand.ts`, rồi thay literal bằng hằng số ở các file trên.
2. Template mail: thay mọi `Teacher OS` / `TeacherOS` bằng `BRAND_NAME`; footer `&copy; 2022 TeacherOS` đổi tên và giữ năm hiện có (không tự ý đổi năm).
3. Đổi mặc định `MAIL_FROM` thành `Cô Mỹ Dạy Tiếng Anh <onboarding@resend.dev>` ở hai file infra. Không đổi địa chỉ email/domain.
4. Cập nhật 4 file test cho khớp.
5. Với `grading.ts`, chỉ đổi khi giá trị `source` không dùng để lọc/so khớp; nếu có, giữ nguyên và ghi vào báo cáo.

## Kiểm chứng

- `pnpm --filter server test`, `pnpm --filter @teacher-os/auth test`: xanh, gồm `mail.test.ts` kiểm chuỗi mới.
- e2e `notifications-ac-001` xanh local.
- Staging: đặt `MAIL_FROM` staging, gửi một mail OTP và một mail hóa đơn tới hộp thư thật, xác nhận tên người gửi có dấu hiển thị đúng và không lọt vào spam.

## Việc vận hành ngoài repo (cần người dùng xác nhận trước khi làm)

Biến GitHub `MAIL_FROM` ở environment staging và production hiện là `TeacherOS <no-reply@teacheros.io.vn>`. Đổi phần tên thành `Cô Mỹ Dạy Tiếng Anh`, giữ địa chỉ. Ghi lại trong `docs/production-release-runbook.md` (phase 4).

## Rủi ro và lui

Nhà cung cấp mail từ chối display name có dấu: giữ biến `MAIL_FROM` cũ trên prod, mã mới vẫn chạy vì biến ghi đè mặc định. Lui bằng revert commit.
