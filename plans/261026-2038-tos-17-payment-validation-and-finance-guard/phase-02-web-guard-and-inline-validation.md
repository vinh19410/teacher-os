---
phase: 2
title: "Redirect route tài chính, ẩn sidebar, inline error hộp thoại thu tiền"
status: pending
priority: P1
effort: "4h"
dependencies: ["phase-01"]
---

# Phase 2: Guard phía web + validation

## Files

- Modify: `apps/web/src/routes/_auth/debts/index.tsx`, `apps/web/src/routes/_auth/tuition/index.tsx`, `apps/web/src/routes/_auth/tuition/$invoiceId.tsx` (`beforeLoad` → redirect `/dashboard` khi `!viewer.canAccessFinance`, kèm toast một lần).
- Modify: `apps/web/src/components/layout/sidebar.tsx`, `apps/web/src/components/command-search/search-index.ts` (ẩn "Doanh thu", "Công nợ").
- Modify: `apps/web/src/lib/kernel-state.ts` / `data-store-reducer.ts` (lưu `viewer`).
- Modify: `apps/web/src/components/modals/record-payment-modal.tsx` + test (D5).

## Tasks & Steps

1. Test đỏ:
   - Snapshot `viewer.canAccessFinance = false` → điều hướng `/debts` kết thúc ở `/dashboard`, toast hiện; sidebar không có 2 mục.
   - Hộp thoại nợ 2.500.000: nhập `0` → sau blur lỗi "Số tiền thu phải lớn hơn 0 và không vượt quá số tiền còn nợ", nút Lưu disabled, input `aria-invalid="true"`; `3.000.000` → giống vậy; `2.500.000` → hết lỗi; mở hộp thoại chưa nhập → không đỏ nhưng nút Lưu disabled; đổi khoản thu có nợ nhỏ hơn số đang nhập → lỗi hiện lại.
2. Viết code cho xanh. Verify bàn phím: lỗi được đọc qua `aria-describedby`.

## Verification

- `pnpm --filter web test -- record-payment debts tuition sidebar`
- `pnpm check`, `pnpm check-types`
