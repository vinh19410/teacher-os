---
phase: 2
title: "Nút (eye) và drawer dòng thời gian trên /debts"
status: pending
priority: P1
effort: "4h"
dependencies: ["phase-01"]
---

# Phase 2: Drawer timeline

## Files

- Create: `apps/web/src/components/debts/billing-timeline-drawer.tsx` + `.test.tsx`.
- Modify: `apps/web/src/routes/_auth/debts/index.tsx` (icon button `(eye)` với `aria-label="Xem dòng thời gian lịch sử hóa đơn & giao dịch của {tên}"`, stopPropagation như `/tuition`), `apps/web/src/lib/repos/payments.ts` (fetch timeline).

## Nội dung

- Header: tên học viên + 3 số Phải đóng / Đã thu / Còn nợ (từ `debtLedger` row).
- Danh sách nhóm theo tháng: hóa đơn ("Phát hành hóa đơn {mã} · {loại} · {số tiền} · hạn {dd/mm}") và giao dịch ("Thu {số tiền} · QR Bank-Hub" hoặc "· Thu thủ công · Tiền mặt — {ghi chú}"), mỗi mục link `/tuition/$invoiceId`.
- Trạng thái loading (skeleton), lỗi (thử lại), rỗng.
- Sheet bên phải ở desktop, full-screen ở 375; focus vào tiêu đề khi mở, Esc đóng, trả focus về nút (eye).

## Tasks & Steps

1. Test đỏ: render đúng thứ tự + nhãn nguồn; loading/lỗi/rỗng; nút (eye) không kích hoạt điều hướng dòng.
2. Viết code cho xanh; verify 3 viewport + bàn phím.

## Verification

- `pnpm --filter web test -- billing-timeline debts`
- `pnpm check`, `pnpm check-types`
