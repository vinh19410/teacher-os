---
title: "Fix student tuition invoice contrast, QR heading, polling flash, and notification link (#1059)"
date: 2026-11-28
summary: "Sửa lỗi hiển thị ô Còn lại tàng hình, ẩn tiêu đề Chuyển khoản theo QR dưới đây khi không có QR, bỏ nháy Đang tải… khi poll 5s, và trỏ thẳng link thông báo hóa đơn tới /tuition/ (#1059)."
---

# Fix student tuition invoice contrast, QR heading, polling flash, and notification link (#1059)

# Sửa hiển thị hóa đơn học phí, QR thanh toán, polling 5s và link thông báo (#1059)

**Date**: 2026-11-28
**Severity**: High
**Component**: `packages/ui` (`PaymentQrPanel`), `apps/student` (`$invoiceId.tsx`, `tuition-list.tsx`, `stat-card.tsx`), `apps/server` (`templates.ts`), `apps/e2e`
**Status**: Resolved

## What Happened

Issue #1059 gom 4 lỗi ảnh hưởng trực tiếp trải nghiệm nhận thông báo và xem hóa đơn học phí của học viên: ô `Còn lại` tàng hình do chữ trùng màu nền, tiêu đề `"Chuyển khoản theo QR dưới đây"` vẫn hiện dù chưa có QR/đã đóng, trang chi tiết nháy `"Đang tải…"` mỗi 5 giây khi polling, và thông báo `invoice_issued`/`tuition_reminder` trỏ về danh sách `/tuition` thay vì hóa đơn cụ thể.

## The Brutal Truth

Các lỗi UI/UX nhỏ nhưng cộng hưởng trực tiếp lên bước thanh toán học phí: học viên mở thông báo hóa đơn không vào thẳng đúng hóa đơn, vào được thì không thấy số tiền còn nợ, lại còn nhấp nháy loading mỗi 5 giây ngay lúc đang quét mã QR.

## Root Causes & Decisions

1. **Token `hot` lệch chuẩn sau migration Design v1 → v2**: Chuyển các tile trong `apps/student` (`$invoiceId.tsx`, `tuition-list.tsx`, `stat-card.tsx`) sang light card (`bg-card border shadow-sm`) và giá trị `text-destructive` khi còn nợ > 0 / `text-foreground` khi `0đ`, đồng thời chuẩn hoá hóa đơn thu tay (`status === "paid"` / `reason === "PAID"` / `amountDue <= 0`).
2. **`PaymentQrPanel` thiếu guard cho heading & thiếu `bank`**: Gộp điều kiện `showQrInstructions = state === "open" || state === "partial"` (fallback `state = "nolink"` khi `payable: true` thiếu `bank`).
3. **Polling flash mỗi 5s trên `/student/tuition/$invoiceId`**: Bỏ biến `reload` khỏi `queryKey`, đưa `useQuery` vào `StudentTuitionDetailView` bên trong `StudentPageGate` với `refetchInterval`, `orgId` trong `queryKey`, state `pollWindow` + `isHidden`, guard `!payment.data`, dừng poll khi `status === "error"` / `hidden` / quá 15 phút, tự hồi phục qua `visibilitychange`, và heal cache `["student", "invoices"]`.
4. **Notification deep link**: Cập nhật `invoiceIssuedEvent` và `tuitionReminderEvent` trỏ tới `/tuition/${encodeURIComponent(trimmed)}` kèm guard chặn chuỗi rỗng / `.` / `..` fallback về `"/tuition"`.

## Technical Challenge

Trong Vitest 4 (`@sinonjs/fake-timers`), timer nội bộ của TanStack Query `notifyManager` sinh ra trong `advanceTimersByTimeAsync(5000)` không thể drain bằng `advanceTimersByTimeAsync(0)`; cần dùng `advanceTimersByTimeAsync(1)` hai lần liên tiếp để kiểm tra polling 5 giây ổn định.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
