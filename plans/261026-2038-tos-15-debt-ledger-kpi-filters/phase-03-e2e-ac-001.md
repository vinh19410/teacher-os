---
phase: 3
title: "E2E AC-001"
status: pending
priority: P1
effort: "2h"
dependencies: ["phase-02"]
---

# Phase 3: E2E AC-001

## Files

- Create: `apps/e2e/specs/debt-ledger-filters.spec.ts` (tái dùng `signUpViaUi`, `seedStudent`, `isoInDaysFromTodayVN` trong `apps/e2e/specs/helpers`; tạo hóa đơn qua UI như `create-invoice.spec.ts`).

## Kịch bản

Seed 3 học viên: A có hóa đơn quá hạn (due hôm qua), B có hóa đơn due + 3 ngày, C có hóa đơn đã "Đã nhận" đủ.

1. Mở sidebar "Công nợ" → 3 dòng; KPI "Tổng phải thu kỳ này" = tổng 3 hóa đơn, "3 học viên"; "Tổng còn nợ quá hạn" = hóa đơn A, "1 học viên".
2. Bấm chip "Quá hạn" → URL có `status=overdue`, chỉ còn A; thời gian từ click tới dòng A hiển thị ≤ 2000ms (`performance.now()` quanh `expect`).
3. Bấm "Đã thu đủ" → chỉ còn C; reload → vẫn chỉ C.
4. Gõ tên B không dấu → URL có `q=` sau debounce, chỉ còn B (chip về "Tất cả").
5. Lặp bước 2 ở 375×812.

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e debt-ledger-filters`
- Trước khi merge vào `develop`: full suite Playwright.
