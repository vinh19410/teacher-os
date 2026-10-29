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
- Modify: `apps/web/src/routes/_auth/debts/index.tsx` (nút `Thu` ở cột Thao tác cho dòng còn nợ); `apps/web/src/lib/data-actions.ts` (union `KernelAction` thêm `record-invoice-payment`); `apps/web/src/lib/repos/kernel.ts` (case `kernelCommand` → `POST /api/invoices/:id/payments` — **không** viết fetch riêng trong `repos/payments.ts`, nơi chỉ có query helper; tái dùng query key nếu cần); `apps/web/src/lib/data-store-reducer.ts` (case no-op trả `state` như `create-report` — dữ liệu mới đến từ snapshot refresh); `apps/web/src/routes/_auth/tuition/$invoiceId.tsx` (hiện phương thức "Tiền mặt / Chuyển khoản / Khác" cho dòng manual).

## Nội dung hộp thoại (wireframe [10]–[14])

- Tiêu đề "Ghi nhận thu tiền học phí — {tên học viên}".
- Select "Khoản thu" chỉ khi `row.openInvoiceIds.length > 1` (mặc định phần tử đầu — đã sort `due` tăng dần); số liệu Phải đóng · Đã thu · Nợ tra `data.invoices` theo id trong `openInvoiceIds` của dòng đang chọn (tôn trọng filter lớp đang active).
- "Số tiền thực thu lần này (VND) *" (input số, định dạng hàng nghìn) + nút nhanh "Thu toàn bộ {nợ}". Số nợ hiển thị lấy từ `invoiceRemaining` (đã clamp `Math.min/max`) — KHÔNG tính `amount − paidAmount` thô (dòng bank overpay có `paid_amount` > amount).
- Radio "Phương thức": Chuyển khoản (mặc định) · Tiền mặt · Khác. Ô "Ghi chú" (≤ 255).
- `clientRequestId` = `crypto.randomUUID()` sinh 1 lần khi mở hộp thoại, giữ nguyên qua mọi lần bấm Lưu của phiên hộp thoại đó (idempotency retry).
- Dòng thông tin: "Số dư còn nợ sau giao dịch này: X VND → Trạng thái chuyển sang: Còn nợ / Đã thu đủ".
- Nút "Hủy" (ghost) và "Lưu phiếu thu học phí" (primary; đang lưu chỉ `disabled`, giữ nguyên accessible name theo contract `kernel-form-contract`).
- Xử lý lỗi qua `KernelCommandResult` (reconcile **trước**, setError **sau** — vì `reconcile()` xóa `error` khi thành công): 422 `amount-exceeds-debt` → refetch snapshot (cập nhật số nợ hiển thị) + alert trong hộp thoại, giữ mở; 422 `invoice-settled` → refetch + alert "Hóa đơn đã được ghi nhận đủ trước đó…", **giữ mở** cho GV tự đóng (alert phải đọc được); 409 (key đã dùng với nội dung khác) → refetch + alert + sinh `clientRequestId` mới (key cũ đã burn); `definite-failure` khác → generic "Không lưu được" của hook, giữ mở. Inline error trước khi gửi là việc của TOS-17.

## Tasks & Steps

1. Test component đỏ: chọn khoản mặc định theo `due` sớm nhất; "Thu toàn bộ" điền đúng nợ; dòng "sau giao dịch" đổi theo số nhập; submit gửi đúng body (`clientRequestId` ổn định giữa 2 lần submit); thành công → đóng hộp thoại + gọi refetch; 422 `amount-exceeds-debt` → hộp thoại vẫn mở + `remaining` trong form cập nhật; 422 `invoice-settled` → đóng + refetch.
2. Viết code cho xanh. Form trong `Modal` theo primitive đã sửa ở #416.
3. Verify 3 viewport + bàn phím (Tab tới "Thu toàn bộ", Enter lưu, Esc đóng).

## Verification

- `pnpm --filter web test -- record-payment debts invoiceId`
- `pnpm check`, `pnpm check-types`
