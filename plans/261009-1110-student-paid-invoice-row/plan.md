---
title: "Student overview: dòng hóa đơn đã thanh toán chỉ hiện số tiền + badge"
description: "Ở cột Học phí của student overview, hóa đơn đã thanh toán chỉ hiện số tiền và badge 'Đã thanh toán' thay vì '0đ' + 'Đã nhận x / y', đồng thời tính đúng hóa đơn được giáo viên đánh dấu thu tay."
status: completed
priority: P2
effort: 1.5h
issue: 352
branch: feat/student-paid-invoice-row
tags: [frontend, student, tuition, ui]
blockedBy: []
blocks: []
created: 2026-10-09
---

# Dòng hóa đơn đã thanh toán gọn hơn ở student overview

## Overview

Cột "Học phí" trên trang tổng quan của student
([tuition-list.tsx](../../apps/student/src/components/overview/tuition-list.tsx)) đã có hai ô
"Đã đóng" và "Còn lại". Thế nhưng mỗi dòng hóa đơn đã trả đủ vẫn hiện `0đ`, `Hạn …` và
`Đã nhận 5.000.000đ / 5.000.000đ`. Thông tin này trùng với hai ô ở trên và chữ `0đ` đậm dễ bị
hiểu nhầm là số tiền hóa đơn.

Có thêm một lỗi số liệu, đã kiểm tra trong code. API `GET /student/invoices`
([student.ts:739](../../apps/server/src/routes/student.ts)) luôn tính
`amountDue = amount - paidAmount`. Hóa đơn được giáo viên đánh dấu đã thu tay có
`status = "paid"` và `paidAmount = 0`, nên student vẫn thấy cả hóa đơn đó trong "Còn lại".
Web đã coi `status = "paid"` là đóng đủ
([tuition-from-kernel.ts:31](../../apps/web/src/lib/tuition-from-kernel.ts)), và server cũng làm vậy
khi quyết định có hiện QR
([payment-instructions.ts:81](../../apps/server/src/lib/payment-instructions.ts)).

## Quyết định đã chốt với user (2026-10-09)

| Câu hỏi | Lựa chọn |
|---|---|
| Hóa đơn thu tay (`status=paid`, `paidAmount=0`) | Sửa ở client trong `TuitionList`: coi là đã đóng đủ (đã đóng = `amount`, còn lại = 0). Không đổi API contract. |
| Nhãn badge | **Đã thanh toán** |

## Outcome

- Hóa đơn đã thanh toán: dòng chỉ còn tên khoản (vd "Học phí"), số tiền hóa đơn (`amount`) và
  badge "Đã thanh toán". Không còn dòng hạn đóng, không còn "Đã nhận x / y", không còn `0đ`.
- Hóa đơn chưa đóng hoặc đóng một phần: giữ nguyên hiển thị như hiện tại.
- Hai ô "Đã đóng" / "Còn lại" tính đúng cả hóa đơn thu tay.

## Constraints

- Quy tắc "đã thanh toán" phải trùng với server: `status === "paid" || amountDue <= 0`.
- Badge theo `DESIGN.md`: Tag mono 10px uppercase, tone success = `bg-chip` (không dùng cam,
  vì cam là màu cần chú ý).
- Dòng vẫn là link sang `/tuition/$invoiceId` để học viên xem lại chi tiết.
- Heading "Học phí" và link `/Học phí/` đang được e2e `tuition-bank-transfer` dùng, không đổi.

## Non-goals

- Không đổi API `/student/invoices` hay contract `StudentInvoiceItem`.
- Không sửa trang chi tiết `/tuition/$invoiceId` (số liệu thu tay ở đó là vấn đề riêng, xem câu hỏi
  mở).
- Không đổi thứ tự hay lọc bớt hóa đơn đã thanh toán.

## Acceptance criteria

1. Hóa đơn có `amountDue = 0` hiện `5.000.000đ` + badge "Đã thanh toán", không có `0đ`,
   `Hạn …`, `Đã nhận …`.
2. Hóa đơn có `status = "paid"` và `paidAmount = 0` cũng hiện như trên, và được cộng vào
   "Đã đóng" chứ không vào "Còn lại".
3. Hóa đơn chưa đóng và đóng một phần hiện y như trước.
4. Unit test mới trong `apps/student/test/tuition-list.test.tsx` pass, cùng với `pnpm check`,
   `pnpm check-types`, `pnpm --filter student test`.
5. Kiểm tra trực quan ở 1440×900, 768×1024, 375×812 và focus bàn phím (theo `REVIEW.md`), có
   screenshot trong PR.

## Phases

| # | Phase | Status | Effort |
|---|---|---|---|
| 01 | [Dòng hóa đơn đã thanh toán + số liệu thu tay](phase-01-paid-invoice-row.md) | done | 1.5h |

## Câu hỏi mở

- Trang chi tiết `/tuition/$invoiceId` cũng hiện `Đã nhận 0đ / Còn lại x` cho hóa đơn thu tay.
  Có cần một plan riêng để sửa không?
