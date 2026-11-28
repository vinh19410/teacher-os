---
title: "Phase 1: Invoice Email Renderer"
status: todo
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Invoice Email Renderer

## Goal
Xây dựng module thuần `renderInvoiceEmail` trong `packages/api/src/invoice-email.ts` theo quy trình TDD để render email HTML Design v2 và bản plain-text cho cả `issued` lẫn `reminder`.

## Files to Create / Modify
- Create: `packages/api/src/invoice-email.test.ts`
- Create: `packages/api/src/invoice-email.ts`

## Tasks & Steps

### Task 1.1 — Viết bộ unit test TDD cho `renderInvoiceEmail` (Red phase)
- Goal: Khóa toàn bộ hợp đồng đầu ra HTML, plain-text, subject, `inboxTitle`, `inboxBody`, bảo mật XSS/URL, dark mode `.qr-plate`, và giới hạn kích thước trước khi cài đặt.
- Target files and symbols: `packages/api/src/invoice-email.test.ts`.
- Steps:
  1. Tạo `packages/api/src/invoice-email.test.ts` kiểm thử các kịch bản:
     - `formatInvoiceCode`, `formatInvoiceVnd`, `isSafeVietQrUrl` (chỉ cho phép `https://vietqr.app/img?...`).
     - `variant: "issued"` đầy đủ (tên học viên, lớp, hạn VN `Thứ ..., dd/mm/yyyy`, ghi chú nhiều dòng, bank + VietQR, `payUrl`, `portalUrl`).
     - `variant: "issued"` tối giản (không lớp, không ghi chú, không bank, không URL).
     - `variant: "reminder"` đóng một phần (`paidAmount > 0`, `totalAmount > amountDue`): chứng minh `inboxBody` chỉ chứa `amountDue` và KHÔNG chứa `totalAmount`, trong khi `html` và `text` hiển thị đủ.
     - `variant: "reminder"` quá hạn (`due < vnToday`): có badge/nhãn quá hạn.
     - Dark mode `.qr-plate` bắt buộc `background-color: #ffffff !important` trong cả `@media (prefers-color-scheme: dark)` và `[data-ogsc]`.
     - Escape XSS ở mọi trường (`studentName`, `className`, `orgName`, `note`, `bankBrandName`, `holderName`, `memo`), chặn URL `javascript:`/`data:`/`http` tương đối và `qrUrl` ngoài `vietqr.app`.
     - `html.length < 15_000`.
  2. Chạy test để xác nhận fail trước khi có implementation.
- Success criteria: Vitest chạy và báo lỗi thiếu module `invoice-email` hoặc assertion fail.
- Verify: `pnpm --filter @teacher-os/api exec vitest run src/invoice-email.test.ts` exits non-zero (expected red state before Task 1.2).

### Task 1.2 — Cài đặt `packages/api/src/invoice-email.ts` (Green phase)
- Goal: Cài đặt `renderInvoiceEmail` và các helper thuần xuất ra để toàn bộ test TDD ở Task 1.1 pass.
- Target files and symbols: `packages/api/src/invoice-email.ts` (`formatInvoiceCode`, `formatInvoiceVnd`, `isSafeVietQrUrl`, `renderInvoiceEmail`, `InvoiceEmailInput`, `InvoiceEmailPaymentInfo`, `RenderedInvoiceEmail`, `InvoiceEmailVariant`).
- Steps:
  1. Import `escapeEmailHtml`, `isSafeEmailUrl` từ `./class-opening-email` và `formatViDateDisplay`, `formatViWeekdayDate` từ `./vietnam-date`.
  2. Chuẩn hóa single-line text (loại control char/CR/LF) và multiline `note` (giữ `\n` thành `<br>` sau `escapeEmailHtml`).
  3. Render badge trạng thái, hero số tiền `tabular-nums`, bảng chi tiết hóa đơn, callout ghi chú tùy chọn, khối chuyển khoản + ảnh QR trong `.qr-plate` nền trắng bất biến (kèm chú thích staleness), khối CTA (`/pay/<token>` ưu tiên làm primary + cổng học viên làm secondary hoặc tự nâng cấp thành primary khi thiếu `payUrl`), footer thương hiệu và bản `text` đầy đủ tương đương.
  4. Chạy lại unit test và kiểm tra TypeScript.
- Success criteria: Mọi test case trong `invoice-email.test.ts` đều xanh, HTML < 15 KB.
- Verify: `pnpm --filter @teacher-os/api exec vitest run src/invoice-email.test.ts` exits 0 and prints `passed`.

## Todo
- [x] Task 1.1: Viết `packages/api/src/invoice-email.test.ts` (red phase)
- [x] Task 1.2: Cài đặt `packages/api/src/invoice-email.ts` (green phase)

## Success Criteria
- Toàn bộ unit test của `@teacher-os/api` (`invoice-email.test.ts`) pass 100%, không cảnh báo type.

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
