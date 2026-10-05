---
phase: 5
title: "Phase 5: UI học phí giáo viên và portal học viên"
status: todo
priority: P1
effort: "1.5d"
dependencies: [2, 3, 4]
---

# Phase 5: UI học phí giáo viên và portal học viên

## Overview

Một component hiển thị QR dùng chung (`PaymentQrPanel` trong `packages/ui`) cho
3 bề mặt: modal "Thu học phí" trên trang `/tuition` của giáo viên, trang công
khai `/pay/$token` (web), và trang chi tiết phiếu trong portal học viên. Trang
Học phí của giáo viên thêm trạng thái "Thu một phần", khu "Giao dịch chưa
khớp" và nút "Đối soát".

## Context Links

- `DESIGN.md`, `REVIEW.md`, `AGENTS.md` (quy ước UI, 3 viewport, keyboard)
- `apps/web/src/routes/_auth/tuition.tsx` (bảng phiếu, `INV_LABEL`, `useDirectKernelAction`)
- `apps/web/src/lib/tuition-from-kernel.ts` (`tuitionTotals` — cần tính theo `paidAmount`)
- `apps/student/src/routes/_auth/index.tsx`, `apps/student/src/components/overview/*`, `apps/student/src/lib/repos/student.ts`
- `packages/ui/src/components/` (nơi đặt component dùng chung, cạnh `assignments/`, `quiz/`)
- Skill `ak-payment-integration/references/sepay/qr-codes.md` — "Best Practices" (luôn hiện STK/ngân hàng/số tiền/nội dung dạng chữ cạnh QR, alt text, placeholder)

## Key Insights

- QR chỉ là hướng dẫn; trạng thái "Đã thanh toán" chỉ đến từ server (IPN). UI poll endpoint payment mỗi 5 s **khi panel đang mở và phiếu chưa paid**, dừng khi paid / đóng / tab ẩn (`refetchIntervalInBackground: false`).
- `tuitionTotals` hiện cộng theo `status`; với thanh toán một phần, "Đã thu" phải cộng `paidAmount` của cả phiếu chưa đủ, "Còn nợ" = `amount - paidAmount` của phiếu chưa paid. Phiếu `paid` thủ công (paidAmount 0) tính đủ `amount`.
- Template `tplDebt` của org đã có `{{qr_link}}` → "Sao chép tin nhắc nợ" điền bằng `fillMessageTemplate` (phase 3).

## Requirements

**`PaymentQrPanel`** (props: `PaymentInstructions`, `onCopy?`):
- QR `<img>` 240–280px, `alt="Mã QR chuyển khoản {số tiền} cho {chủ TK}"`, skeleton khi tải, lỗi ảnh → vẫn còn thông tin chữ.
- Dòng chữ có nút sao chép: Ngân hàng, Số tài khoản, Chủ tài khoản, Số tiền (còn nợ), Nội dung — kèm cảnh báo "Giữ nguyên nội dung chuyển khoản để hệ thống tự xác nhận".
- Trạng thái: `PAID` → "Đã thanh toán đủ"; `NO_BANK_LINK` → "Giáo viên chưa thiết lập nhận chuyển khoản"; một phần → "Đã nhận x / y".
- Phản hồi sao chép qua vùng `aria-live="polite"`.

**Giáo viên `/tuition`:**
- Cột trạng thái: thêm "Thu một phần" (dùng token màu warn theo `DESIGN.md`), cột số tiền hiện `paid/amount` khi một phần.
- Hành động dòng "Thu học phí" → `InvoicePaymentModal`: `PaymentQrPanel` + "Sao chép link" (`${location.origin}/pay/${payToken}`) + "Sao chép tin nhắc nợ" + "Tạo link mới" (xoay `pay_token`, xác nhận trước vì link cũ hết hiệu lực). Org chưa liên kết → CTA tới `/settings?tab=payments`.
- Khu "Giao dịch chưa khớp (n)": bảng ngày/số tiền/nội dung/lý do; "Gán vào phiếu" (chọn trong phiếu chưa thu của org) và "Bỏ qua"; nút "Đối soát" (disable khi đang chạy, hiện kết quả `{matched, unmatched}`; 429 → "Vừa đối soát, thử lại sau 1 phút").
- Server: `POST /api/invoices/:id/rotate-pay-token` (org-scoped, sinh token mới).

**Trang công khai `/pay/$token` (web, ngoài `_auth`):** header tên lớp/giáo viên (`orgName`), tên học viên, `PaymentQrPanel`, poll 5 s; token sai → trang lỗi thân thiện (không lộ lý do).

**Portal học viên:**
- Overview: khu "Học phí" liệt kê phiếu chưa thu (số tiền còn nợ, hạn, trạng thái); rỗng thì ẩn.
- Route `/_auth/tuition/$invoiceId`: `PaymentQrPanel` + poll; header org lấy theo `x-student-org-id` hiện hành (org-switcher).

## Related Code Files

- Create: `packages/ui/src/components/payments/payment-qr-panel.tsx` (wildcard export `./components/*` đã phủ, không sửa `package.json`)
- Create: `apps/web/src/components/ui/payment-qr-panel.test.tsx` — `packages/ui` không có script `test`; component dùng chung được test trong suite web (cùng mẫu `rich-text-body.test.tsx`)
- Create: `apps/web/src/components/modals/invoice-payment-modal.tsx`, `apps/web/src/components/tuition/unmatched-transactions.tsx`, `apps/web/src/lib/repos/payments.ts` (+ tests)
- Modify: `apps/web/src/routes/_auth/tuition.tsx`, `apps/web/src/lib/tuition-from-kernel.ts` (+ test), `apps/web/src/routes/pay.$token.tsx`
- Modify: `apps/server/src/routes/kernel.ts` (`rotate-pay-token`) + test
- Create: `apps/student/src/routes/_auth/tuition/$invoiceId.tsx`, `apps/student/src/components/overview/tuition-list.tsx`
- Modify: `apps/student/src/routes/_auth/index.tsx`, `apps/student/src/lib/repos/student.ts`

## Implementation Steps

1. `PaymentQrPanel` + test (render chữ đủ 5 trường, alt text, trạng thái PAID/NO_BANK_LINK/partial, copy gọi `navigator.clipboard.writeText`).
2. `tuition-from-kernel.ts`: cập nhật `tuitionTotals` theo `paidAmount` + test (một phần, paid thủ công, overdue).
3. Repo `payments.ts` (TanStack Query: `['invoice-payment', id]` với `refetchInterval` có điều kiện; `['payment-transactions','unmatched']`; mutations assign/ignore/reconcile/rotate invalidate `['kernel']` + list).
4. `InvoicePaymentModal`, `UnmatchedTransactions`, sửa `tuition.tsx`.
5. Route `rotate-pay-token` + test org isolation.
6. Trang `/pay/$token` hoàn thiện.
7. Portal học viên: repo `getStudentInvoices`, `getStudentInvoicePayment`; `TuitionList` trên overview; route chi tiết.
8. Verify 3 viewport (1440×900, 768×1024, 375×812) cho `/tuition`, modal, `/pay/$token`, portal; keyboard: Tab qua nút copy, Esc đóng modal, focus trả về nút mở; chụp screenshot cho PR.

## Todo

- [ ] `PaymentQrPanel` (packages/ui) + test
- [ ] `tuitionTotals` theo `paidAmount` + test
- [ ] Repo `payments.ts` + polling có điều kiện
- [ ] `InvoicePaymentModal` (copy link, copy tin nhắc nợ, tạo link mới)
- [ ] `UnmatchedTransactions` + nút Đối soát
- [ ] `POST /api/invoices/:id/rotate-pay-token` + test
- [ ] Trang công khai `/pay/$token`
- [ ] Portal: danh sách học phí + trang chi tiết QR
- [ ] Verify 3 viewport + keyboard + screenshot

## Success Criteria

- `pnpm --filter web test` (gồm `payment-qr-panel.test.tsx`), `pnpm --filter student test`, `pnpm --filter @teacher-os/ui check-types` xanh.
- Phiếu một phần hiển thị "Thu một phần 200.000đ / 500.000đ" ở cả 3 bề mặt; tổng "Đã thu/Còn nợ" khớp số liệu sổ cái.
- Poll dừng khi phiếu paid (kiểm bằng test hook hoặc network tab).

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| Poll 5 s nhân số tab mở → tải D1 | Chỉ poll khi panel mở + phiếu chưa paid + tab hiển thị; dừng sau 15 phút không đổi |
| `navigator.clipboard` không có (http/iframe) | Fallback chọn sẵn text để người dùng tự copy |
| Ảnh `vietqr.app` lỗi/ chặn | Thông tin chữ luôn hiển thị đủ để chuyển khoản tay |

## Security Considerations

- Trang công khai không có thao tác ghi; "Tạo link mới" chỉ ở phía giáo viên (kernel CSRF guard).
- Không render HTML từ `content` giao dịch (text thuần) — nội dung chuyển khoản do người ngoài nhập.

## Next Steps

Phase 6 chạy E2E với fake Bank Hub và kiểm thử thật trên sandbox.
