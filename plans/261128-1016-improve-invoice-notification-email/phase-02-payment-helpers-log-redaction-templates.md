---
title: "Phase 2: Payment Helpers, Log Redaction & Templates"
status: todo
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Payment Helpers, Log Redaction & Templates

## Goal
Ẩn `/pay/<token>` trong `createLogMailer`, tách helper dựng thông tin chuyển khoản email từ `payment-instructions.ts`, và nâng cấp `invoiceIssuedEvent` / `tuitionReminderEvent` sử dụng `renderInvoiceEmail`.

## Files to Create / Modify
- Modify: `packages/auth/src/mail/mailer.ts`
- Modify: `packages/auth/src/mail/mail.test.ts`
- Modify: `apps/server/src/lib/payment-instructions.ts`
- Modify: `apps/server/src/lib/notifications/templates.ts`
- Modify: `apps/server/src/lib/notifications/templates.test.ts`
- Modify: `apps/server/src/lib/notifications/notifications.test.ts`

## Tasks & Steps

### Task 2.1 — Redact `/pay/<token>` trong `createLogMailer`
- Goal: Bảo đảm token thanh toán 128-bit trong `text` email không bao giờ ghi thô ra log khi chạy `MAILER_IMPL=log`.
- Target files and symbols: `packages/auth/src/mail/mailer.ts` (`createLogMailer`), `packages/auth/src/mail/mail.test.ts`.
- Steps:
  1. Thêm unit test trong `packages/auth/src/mail/mail.test.ts` kiểm tra `createLogMailer` ghi `/pay/[redacted]` thay cho `/pay/AbCdEf1234567890_xyz` trong `input.text`, đồng thời giữ nguyên `/verify-email?token=123`.
  2. Trong `packages/auth/src/mail/mailer.ts`, thêm `PAY_TOKEN_PATH = /(\/pay\/)[A-Za-z0-9_-]{10,}/g` và redact `input.text` trước khi gọi `console.info`.
- Success criteria: Test `mail.test.ts` pass toàn bộ.
- Verify: `pnpm --filter @teacher-os/auth exec vitest run src/mail/mail.test.ts` exits 0 and prints `passed`.

### Task 2.2 — Tách `buildEmailPaymentInfo` trong `payment-instructions.ts`
- Goal: Tái sử dụng logic dựng memo + VietQR từ bản ghi `orgBankLink` cho email, chặn rõ ràng khi `paymentCode` rỗng hoặc đã thanh toán đủ.
- Target files and symbols: `apps/server/src/lib/payment-instructions.ts` (`buildEmailPaymentInfo`, `loadPaymentInstructions`).
- Steps:
  1. Import `formatInvoiceCode` và `type InvoiceEmailPaymentInfo` từ `@teacher-os/api/invoice-email`; dùng `formatInvoiceCode(inv.id)` trong `loadPaymentInstructions`.
  2. Export hàm thuần `buildEmailPaymentInfo(inv, link)` trả `null` nếu `amountDue <= 0`, `inv.status === "paid"`, `link?.status !== "linked"`, thiếu `accountNumber`/`bin`, hoặc `!inv.paymentCode?.trim()`. Ngược lại trả `{ bankBrandName, accountNumber, holderName, memo, qrUrl }`.
- Success criteria: `buildEmailPaymentInfo` xử lý sạch hóa đơn legacy thiếu `paymentCode` và org chưa liên kết ngân hàng.
- Verify: `no verification needed` (kiểm chứng cùng Task 2.3 qua test server).

### Task 2.3 — Nâng cấp `invoiceIssuedEvent` và `tuitionReminderEvent`
- Goal: Sinh đầy đủ `title`, `body`, `htmlBody`, `textBody` từ `renderInvoiceEmail` trong khi giữ nguyên `linkPath: "/tuition"`, khóa chống trùng, và tương thích ngược cho caller tối giản.
- Target files and symbols: `apps/server/src/lib/notifications/templates.ts` (`resolvePublicPayOrigin`, `buildInvoiceEmailUrls`, `invoiceIssuedEvent`, `tuitionReminderEvent`), `apps/server/src/lib/notifications/templates.test.ts`, `apps/server/src/lib/notifications/notifications.test.ts`.
- Steps:
  1. Cập nhật `templates.test.ts` (assertion ngày VN `15/11/2026` ở `invoiceIssuedEvent` và thêm test cho `resolvePublicPayOrigin`, `invoiceIssuedEvent` đầy đủ, `tuitionReminderEvent` trả góp/quá hạn) và `notifications.test.ts` (assertion ngày VN `01/11/2026` ở `tuitionReminderEvent` + test deliver `htmlBody`/`textBody`).
  2. Cài đặt `resolvePublicPayOrigin` (ưu tiên `studentOrigin` có `/student`, lùi về `appOrigin`, từ chối standalone `/student` port 8003 không có route `/pay/$token`), `buildInvoiceEmailUrls`, và cập nhật `invoiceIssuedEvent` / `tuitionReminderEvent` giữ optional toàn bộ trường mở rộng.
- Success criteria: `templates.test.ts` và `notifications.test.ts` pass 100%.
- Verify: `pnpm --filter server exec vitest run src/lib/notifications/templates.test.ts src/lib/notifications/notifications.test.ts` exits 0 and prints `passed`.

## Todo
- [x] Task 2.1: Redact `/pay/<token>` trong `createLogMailer`
- [x] Task 2.2: Tách `buildEmailPaymentInfo` trong `payment-instructions.ts`
- [x] Task 2.3: Nâng cấp `invoiceIssuedEvent` và `tuitionReminderEvent` + unit tests

## Success Criteria
- Toàn bộ unit test trong `packages/auth` và `apps/server/src/lib/notifications/` pass 100%.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
