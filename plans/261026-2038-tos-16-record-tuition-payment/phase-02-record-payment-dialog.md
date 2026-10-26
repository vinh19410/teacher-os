---
phase: 2
title: "Hộp thoại Ghi nhận thu tiền học phí trên /debts"
status: pending
priority: P1
effort: "5h"
dependencies: ["phase-01"]
---

# Phase 2: UI hộp thoại

## Files

- Create: `apps/web/src/components/modals/record-payment-modal.tsx` + `.test.tsx`.
- Modify: `apps/web/src/routes/_auth/debts/index.tsx` (nút `Thu` ở cột Thao tác cho dòng còn nợ), `apps/web/src/lib/data-actions.ts` / `repos/payments.ts` (action `record-invoice-payment` gọi API rồi refetch snapshot), `apps/web/src/routes/_auth/tuition/$invoiceId.tsx` (hiện phương thức "Tiền mặt / Chuyển khoản / Khác" cho dòng manual).

## Nội dung hộp thoại (wireframe [10]–[14])

- Tiêu đề "Ghi nhận thu tiền học phí — {tên học viên}".
- Select "Khoản thu" khi học viên có > 1 khoản còn nợ (D5); dòng tóm tắt Phải đóng · Đã thu · Nợ của khoản đang chọn.
- "Số tiền thực thu lần này (VND) *" (input số, định dạng hàng nghìn) + nút nhanh "Thu toàn bộ {nợ}".
- Radio "Phương thức": Chuyển khoản (mặc định) · Tiền mặt · Khác. Ô "Ghi chú" (≤ 255).
- Dòng thông tin: "Số dư còn nợ sau giao dịch này: X VND → Trạng thái chuyển sang: Còn nợ / Đã thu đủ".
- Nút "Hủy" (ghost) và "Lưu phiếu thu học phí" (primary, trạng thái "Đang lưu…").
- Lỗi server 422 hiện toast + giữ hộp thoại mở (inline error trước khi gửi là việc của TOS-17).

## Tasks & Steps

1. Test component đỏ: chọn khoản mặc định theo `due` sớm nhất; "Thu toàn bộ" điền đúng nợ; dòng "sau giao dịch" đổi theo số nhập; submit gửi đúng body; thành công → đóng hộp thoại + gọi refetch; 422 → hộp thoại vẫn mở.
2. Viết code cho xanh. Form trong `Modal` theo primitive đã sửa ở #416.
3. Verify 3 viewport + bàn phím (Tab tới "Thu toàn bộ", Enter lưu, Esc đóng).

## Verification

- `pnpm --filter web test -- record-payment debts invoiceId`
- `pnpm check`, `pnpm check-types`
