---
title: "Cải thiện template email thông báo hóa đơn học phí"
description: "Nâng cấp template email HTML + plain-text cho thông báo hóa đơn (invoice_issued) và nhắc học phí (tuition_reminder) theo chuẩn Design v2 kèm VietQR, hướng dẫn chuyển khoản và liên kết thanh toán."
status: completed
priority: P1
effort: "4h"
tags: [notifications, email, tuition, design-v2]
created: 2026-11-28
---

# Cải thiện template email thông báo hóa đơn học phí

## Overview

Nâng cấp cả hai email thuộc nhóm học phí (`invoice_issued` và `tuition_reminder`) từ đoạn văn bản 1 dòng + nút xanh mặc định sang template HTML & plain-text theo chuẩn Design v2 (`packages/api/src/class-opening-email.ts`), hiển thị đầy đủ mã hóa đơn, số tiền cần thanh toán, học viên, lớp học, hạn thanh toán tiếng Việt (`Thứ ..., dd/mm/yyyy`), ghi chú hóa đơn, khối chuyển khoản kèm mã VietQR trên nền trắng bất biến (khi tổ chức đã liên kết ngân hàng và hóa đơn có `paymentCode`), cùng nút CTA tới trang thanh toán trực tuyến `/pay/<payToken>` và link dự phòng cổng học viên `/tuition/<invoiceId>`.

## Locked Scope & Non-Goals

- **Scope:** `packages/api/src/invoice-email.ts`, `packages/auth/src/mail/mailer.ts` (redact `/pay/<token>`), `apps/server/src/lib/payment-instructions.ts`, `apps/server/src/lib/notifications/templates.ts`, `apps/server/src/routes/kernel.ts` (`POST /invoices`, `POST /debt-reminders`), test tương ứng và `apps/e2e/specs/notifications-ac-001.spec.ts`.
- **Non-Goals:** Không đổi DB schema / không tạo migration; không sửa các template email ngoài nhóm `tuition`; không thêm preview UI phía giáo viên; không encode QR base64; không thêm package ngoài.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Pure HTML + plain-text invoice email renderer trong `@teacher-os/api` đạt chuẩn Design v2 và an toàn XSS/dark-mode | P1 |
| 2 | Hỗ trợ thanh toán chuyển khoản + VietQR trên nền trắng bất biến, log redaction `/pay/<token>`, và nâng cấp `invoiceIssuedEvent` / `tuitionReminderEvent` | P1 |
| 3 | Nối dữ liệu không N+1 ở `POST /invoices` và `POST /debt-reminders`, xác minh ảnh chụp POT và vượt qua toàn bộ gate + E2E lẻ | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Invoice Email Renderer](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Payment Helpers, Log Redaction & Templates](./phase-02-payment-helpers-log-redaction-templates.md) | Pending |
| 3 | [Phase 3: Server Routes, Visual Verify & E2E](./phase-03-server-routes-visual-verify-e2e.md) | Pending |

## Success Criteria

- [ ] `renderInvoiceEmail` render cả `issued` và `reminder` (bao gồm quá hạn, đóng một phần, có/không có ngân hàng, có/không có ghi chú), `.qr-plate` ép nền trắng `#ffffff !important` ở dark mode, escape XSS toàn diện, HTML < 15 KB.
- [ ] `createLogMailer` ẩn `/pay/<token>` thành `/pay/[redacted]`; `buildEmailPaymentInfo` trả `null` khi thiếu `paymentCode` hoặc chưa liên kết ngân hàng.
- [ ] `POST /invoices` và `POST /debt-reminders` truyền đủ ngữ cảnh với số query org cố định, giữ `leftJoin(enrollment)` cho hóa đơn legacy, giữ `linkPath: "/tuition"`, giữ `tuition_reminder` inbox `body` chỉ ghi số tiền còn nợ.
- [ ] `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, và `notifications-ac-001.spec.ts` chạy xanh kèm ảnh POT ở `plans/reports/`.

<!-- slug: improve-invoice-notification-email -->
