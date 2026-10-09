---
title: "Plan student-paid-invoice-row: dòng hóa đơn đã thanh toán chỉ hiện số tiền + badge"
date: 2026-10-09
summary: "Lập plan 261009-1110 (issue #352): rút gọn dòng hóa đơn đã thanh toán ở student overview và tính đúng hóa đơn thu tay"
---

# Plan student-paid-invoice-row

## What happened
Lập plan qua `ak-plan --github` cho yêu cầu: ở student overview, hóa đơn đã thanh toán chỉ cần hiện
số tiền và badge, vì hai ô "Đã đóng / Còn lại" đã có ở trên. Đã mở issue #352 (`ready to review`).

Khi scout phát hiện thêm: API `GET /student/invoices` tính `amountDue = amount - paidAmount` mà
bỏ qua `status`. Hóa đơn giáo viên đánh dấu thu tay (`status = "paid"`, `paidAmount = 0`) vì vậy bị
student tính vào "Còn lại", trong khi web và server (khi quyết định hiện QR) đều coi là đóng đủ.

## Decision
- Rule "đã thanh toán" dùng chung với server: `status === "paid" || amountDue <= 0`.
- Sửa số liệu thu tay ở client trong `TuitionList`, không đổi API contract (user chọn).
- Badge "Đã thanh toán", tone success `bg-chip text-fg` giống `Badge` bên web; thêm prop
  `success` cho `Tag` của student.

## Next steps
- Thực thi: `/ak:cook plans/261009-1110-student-paid-invoice-row/plan.md`.
- Còn mở: trang `/tuition/$invoiceId` cũng hiện sai số liệu cho hóa đơn thu tay.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
