---
title: "Plan trang chi tiết hóa đơn (#345)"
date: 2026-10-08
summary: Lập plan /tuition/$invoiceId hiển thị đủ thông tin hóa đơn + API giao dịch theo hóa đơn
---

# Plan trang chi tiết hóa đơn (#345)

## What happened
- Lập plan `plans/261008-1209-invoice-detail-page/` (3 phase, ~7h) cho yêu cầu: click dòng hóa đơn để xem toàn bộ thông tin; issue #345.
- Scout phát hiện: snapshot đã có đủ trường hóa đơn, `/api/invoices/:id/payment` có memo/bank/QR/payToken, nhưng KHÔNG có API trả giao dịch ngân hàng đã khớp theo từng hóa đơn (`payment-transactions.ts` chỉ trả `unmatched`).

## Decision
- User chốt: thêm `GET /api/invoices/:id/transactions` (org-scoped, chỉ field hiển thị, không lộ `raw`/`providerTxnId`); trang detail có đủ hành động thu tiền; row click ở cả `/tuition` và tab Học phí hồ sơ học viên.
- Route `/tuition/$invoiceId` → phải chuyển `tuition.tsx` sang `tuition/index.tsx` (route id đổi thành `/_auth/tuition/`, cập nhật `routeTitles` + 2 test đọc path).
- Tách hook/actions copy-link/rotate/poll khỏi `InvoicePaymentModal` để modal và trang dùng chung.

## Next steps
- `/ak:cook plans/261008-1209-invoice-detail-page/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
