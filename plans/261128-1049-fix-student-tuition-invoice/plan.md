---
title: "Fix student tuition invoice contrast, QR title, polling flash, and direct notification link"
description: "Sửa lỗi hiển thị ô Còn lại mất chữ ở portal học viên, ẩn tiêu đề Chuyển khoản theo QR dưới đây khi không có QR, bỏ nháy Đang tải… khi poll 5s trên /student/tuition/$invoiceId, và điều hướng thẳng thông báo hóa đơn/nhắc nợ tới /tuition/$invoiceId."
status: completed
priority: P1
effort: "2h"
tags: [student, tuition, ui, notifications, bugfix]
created: 2026-11-28
---

# Fix student tuition invoice contrast, QR title, polling flash, and direct notification link

## Overview

Sau đợt chuyển đổi token design v1 → v2 (`c308b434`), các ô stat `hot` trong `apps/student` (`$invoiceId.tsx`, `tuition-list.tsx`, và component chưa dùng `stat-card.tsx`) bị gán nhầm `bg-primary` + `text-primary` khiến chữ số tiền trùng màu nền (tàng hình ở light/dark). Đồng thời `PaymentQrPanel` vẫn hiển thị tiêu đề `"Chuyển khoản theo QR dưới đây"` ngay cả khi không có QR (`nolink` / `paid` / thiếu `bank`), trang `/student/tuition/$invoiceId` nháy `"Đang tải…"` mỗi 5s vì nhét biến `reload` vào `queryKey`, và thông báo hóa đơn (`invoice_issued` / `tuition_reminder`) trỏ về danh sách `/tuition` thay vì trang chi tiết hóa đơn `/tuition/$invoiceId`.

## Advisor Scope Lock

- **Locked Scope:**
  1. Chuẩn hoá ô `"Còn lại"` / `hot` stat card trong `apps/student` (`$invoiceId.tsx`, `tuition-list.tsx`, và `stat-card.tsx` — lưu ý `stat-card.tsx` hiện chưa có caller nhưng sửa đồng bộ để tránh lỗi tiềm ẩn) sang thẻ sáng chuẩn design v2 (`rounded-xl border bg-card p-4 text-card-foreground shadow-sm`), số tiền dùng `text-destructive` khi còn nợ > 0 (`hot`) và `text-foreground` khi `0đ`, kèm chuẩn hoá hóa đơn thu tay (`status === "paid"` / `reason === "PAID"` / `amountDue <= 0`) trên `$invoiceId.tsx`.
  2. Ẩn tiêu đề `"Chuyển khoản theo QR dưới đây"` trong `PaymentQrPanel` (`packages/ui/src/components/payments/payment-qr-panel.tsx`) khi không hiển thị QR (`!(data.payable && Boolean(data.bank))`) và fallback `state` sang `"nolink"` nếu `payable: true` nhưng thiếu `bank`; cập nhật 2 test fixture ở `apps/web` và thêm unit test ở `packages/ui`.
  3. Loại bỏ hiện tượng nháy `"Đang tải…"` mỗi 5s trên `/student/tuition/$invoiceId` bằng cách đưa `useQuery` vào `StudentTuitionDetailView` bên trong `StudentPageGate`, dùng `queryKey: ["student", "invoice-payment", orgId, invoiceId]`, `staleTime: 0`, `openedAt` + `isHidden` bằng `useState` (cập nhật ở `visibilitychange` và reset khi đổi `invoiceId`/`orgId`), dừng `refetchInterval` khi `query.state.status === "error"`, giữ QR đã tải khi poll nền lỗi (`!payment.data` mới vào nhánh lỗi), heal cache `["student", "invoices"]` cả lúc mount nếu stale lẫn khi `paidAmount`/`status` đổi, `encodeURIComponent(invoiceId)` ở `fetchStudentInvoicePayment`, thêm `VITE_SERVER_URL` mặc định vào `apps/student/vitest.config.ts`, và thêm link `← Học phí` ở error state.
  4. Cập nhật `linkPath` của `invoiceIssuedEvent` và `tuitionReminderEvent` sang `/tuition/${encodeURIComponent(trimmedId)}` (fallback `"/tuition"` khi ID rỗng hoặc dot-segment `.`/`..`), đồng bộ test server và E2E `notifications-ac-001.spec.ts`.
- **Explicit Non-Goals:**
  - Không sửa logic SePay bank-link backend (`apps/server/src/routes/bank-link.ts`, `apps/server/src/lib/payment-instructions.ts`).
  - Không sửa `StatCard` của giáo viên (`packages/ui/src/components/web-kit/card.tsx`).
  - Không thêm cơ chế `?org=` auto-switch cho multi-org email deep-link ngoài phạm vi 4 mục đã chốt.
  - Không chạy full E2E suite ở local (`AGENTS.md`).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Khôi phục hiển thị chuẩn design v2 Light/Dark cho ô `Còn lại` / `hot` và ẩn tiêu đề QR khi không có QR | P1 |
| 2 | Loại bỏ nháy `"Đang tải…"` khi poll 5s, heal cache đúng chuẩn và điều hướng thông báo hóa đơn thẳng tới `/tuition/$invoiceId` | P1 |
| 3 | Kiểm chứng đầy đủ lint, typecheck, unit test, E2E có mục tiêu, POT 3 viewport Light/Dark và ship beta PR | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: PaymentQrPanel & Student Tuition UI](./phase-01-payment-qr-and-student-tuition-ui.md) | Done |
| 2 | [Phase 2: Invoice Polling & Notification Links](./phase-02-invoice-polling-and-notification-links.md) | Done |
| 3 | [Phase 3: Verification, Targeted E2E & POT](./phase-03-verification-e2e-and-pot.md) | Done |

## Success Criteria

- [x] Ô `"Còn lại"` trên `/student/tuition/$invoiceId`, `TuitionList` và `StatCard` hiển thị rõ số tiền (`text-destructive` khi còn nợ > 0, `text-foreground` khi `0đ`, kể cả hóa đơn thu tay `status === "paid"`), đạt contrast AA ở cả Light & Dark.
- [x] `PaymentQrPanel` ẩn `"Chuyển khoản theo QR dưới đây"` khi `paid`, `nolink`, hoặc thiếu `bank` (và fallback `state` sang `"nolink"` khi thiếu `bank`); toàn bộ unit test `packages/ui`, `apps/web`, `apps/lms` pass.
- [x] Trang `/student/tuition/$invoiceId` chỉ fetch sau khi qua `StudentPageGate`, poll mỗi 5s khi `payable: true` mà không nháy `"Đang tải…"`, dừng ngay khi tab ẩn/`status === "error"`/chạm 15 phút, tự hồi phục khi quay lại tab, giữ QR khi poll nền lỗi thoáng qua, heal/invalidate `["student", "invoices"]` đúng lúc, và có back link `← Học phí` ở error state.
- [x] `invoiceIssuedEvent` và `tuitionReminderEvent` phát `linkPath` trỏ thẳng `/tuition/<id>` (an toàn với dot-segment); `templates.test.ts`, `debt-reminders.test.ts`, `kernel.test.ts`, `notifications-ac-001.spec.ts`, `tuition-bank-transfer.spec.ts` đều pass.
- [ ] PR merge vào `develop`, CI/staging deploy xanh, và POT kèm screenshot 3 viewport (Light + Dark) được đăng đầy đủ trên GitHub issue bằng commit SHA sau merge.

## Validation Log

### Verification Results (Self-Verify + Red-Team Cross-Check — 2026-11-28)
- **Tier:** Standard (3 phases)
- **Claims checked:** 18 (verified file paths, line ranges, callers, Vitest configs, `screens.json`, `StudentPageGate`/`StudentShell`, `studentQueryClient`)
- **Verified:** 14 | **Failed (propagated & resolved):** 4 (`apps/student/vitest.config.ts` thiếu `VITE_SERVER_URL`, `StudentPageGate` bọc trong `StudentTuitionDetailView`, `design:compare` `screens.json` không chứa `/student/tuition`, `E2E_LMS_PORT` precedence) | **Unverified:** 0

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-payment-qr-and-student-tuition-ui.md`, `phase-02-invoice-polling-and-notification-links.md`, `phase-03-verification-e2e-and-pot.md`
- Decision deltas checked: 8 (tách `StudentTuitionDetailView` thuần bên trong `StudentPageGate`; thêm `VITE_SERVER_URL` vào `apps/student/vitest.config.ts`; thêm `orgId` vào `queryKey`, `isHidden` state, error guard `!payment.data` + dừng `refetchInterval` khi `status === "error"`, heal cache khi mount; fallback `state="nolink"` khi thiếu `bank`; chặn `.`/`..` trong `invoiceTuitionLinkPath`; tách rõ `stat-card.tsx` là dead code; sửa `E2E_LMS_PORT` & `pnpm --filter lms test`; chỉnh lại scope `design:compare`, thêm ảnh POT `/student/tuition` + `PAID`, và chốt thứ tự SHA/plan close)
- Reconciled stale references: 8
- Unresolved contradictions: 0

## Red Team Review

### Session — 2026-11-28
**Findings:** 11 deduplicated across 3 lenses (Security Adversary, Failure Mode Analyst, Assumption Destroyer) — 10 accepted & propagated, 1 out-of-scope (`?org=` query param auto-switch) recorded in Explicit Non-Goals.
**Severity breakdown:** 1 Critical, 6 High, 4 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `apps/student/vitest.config.ts` thiếu `VITE_SERVER_URL` và `StudentTuitionDetailView` dính `StudentPageGate`/`StudentShell`/`NotificationBell` | Critical | Accept | Phase 2 |
| 2 | `payment.isError || !payment.data` xóa mất QR khi poll nền lỗi và `refetchInterval` không dừng khi `error` | High | Accept | Phase 2 |
| 3 | `useQuery` payment chạy trước `StudentPageGate` và `queryKey` thiếu `orgId` | High | Accept | Phase 2 |
| 4 | Không heal cache `["student", "invoices"]` lúc mount nếu cache 30s cũ hơn detail | High | Accept | Phase 2 |
| 5 | `isHidden` không ở state nên tab chuyển ẩn vẫn bắn thêm 1 tick poll | High | Accept | Phase 2 |
| 6 | `invoiceTuitionLinkPath` chưa chặn dot-segment `.`/`..` (và multi-org `?org=` ngoài scope) | High | Accept (dot-segment guard) | Phase 2, `plan.md` |
| 7 | `design:compare` không bao phủ `/student/tuition` và `POT` thiếu `/student/tuition` + `PAID` | High | Accept | Phase 3 |
| 8 | `PaymentQrPanel` tạo khối rỗng khi `payable: true` thiếu `bank` | Medium | Accept | Phase 1 |
| 9 | `StatCard` (`stat-card.tsx`) chưa có caller thực tế | Medium | Accept | `plan.md`, Phase 1 |
| 10 | Phase 3 thiếu `pnpm --filter lms test` và dùng `E2E_STUDENT_PORT`/`E2E_ADMIN_PORT` thay vì `E2E_LMS_PORT` | Medium | Accept | Phase 3 |
| 11 | Thứ tự `plan.md` `completed`/`ak plan close` và SHA permalink POT trước khi squash-merge | Medium | Accept | Phase 3 |

<!-- slug: fix-student-tuition-invoice -->
