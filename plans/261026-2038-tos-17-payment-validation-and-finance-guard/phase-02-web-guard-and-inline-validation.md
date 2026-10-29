---
phase: 2
title: "Redirect route tài chính, ẩn sidebar, inline error hộp thoại thu tiền"
status: completed
priority: P1
effort: "4h"
dependencies: ["phase-01"]
---

# Phase 2: Guard phía web + validation

## Files to Create or Modify

- Modify: `apps/web/src/lib/mock-data.ts`, `apps/web/src/lib/kernel-state.ts`, `apps/web/src/lib/repos/kernel.ts` (lưu `viewer: KernelViewer` trong `KernelHydratedData`, mặc định `{ role: "teacher", canAccessFinance: true }`, cập nhật `MissingSnapshotKey` và `isSnapshotShape`).
- Create: `apps/web/src/lib/use-finance-route-guard.ts` (hook `useFinanceRouteGuard()` kiểm tra `data.viewer.canAccessFinance`: khi `false` thì `toast.error("Bạn không có quyền xem Sổ công nợ")` 1 lần + `navigate({ to: "/dashboard", replace: true })` và trả `false`).
- Modify: `apps/web/src/routes/_auth/debts/index.tsx`, `apps/web/src/routes/_auth/tuition/index.tsx`, `apps/web/src/routes/_auth/tuition/$invoiceId.tsx` (gọi `useFinanceRouteGuard()`, nếu `false` trả `null`).
- Modify: `apps/web/src/components/layout/sidebar.tsx`, `apps/web/src/components/layout/app-shell.tsx`, `apps/web/src/components/command-search/search-index.ts` (`teacherNavForViewer(canAccessFinance)` ẩn "Doanh thu" và "Công nợ" trên cả Sidebar và ⌘K).
- Modify: `apps/web/src/components/modals/record-payment-modal.tsx` + `apps/web/src/components/modals/record-payment-modal.test.tsx` (inline validation D5).

## Tasks & Steps

### Task 2.1 — Hydrate `viewer` trên web store, ẩn Sidebar/⌘K và chặn route `/debts`, `/tuition`, `/tuition/$invoiceId`
- **Goal:** Khi `snapshot.viewer.canAccessFinance === false`, Sidebar và ⌘K không hiển thị "Doanh thu" / "Công nợ"; mở `/debts`, `/tuition`, hoặc `/tuition/$invoiceId` tự động điều hướng về `/dashboard` kèm toast `"Bạn không có quyền xem Sổ công nợ"`.
- **Target files and symbols:** `apps/web/src/lib/mock-data.ts` (`KernelHydratedData`), `apps/web/src/lib/kernel-state.ts` (`emptyKernelData`), `apps/web/src/lib/repos/kernel.ts` (`mapKernelSnapshot`, `MissingSnapshotKey`, `isSnapshotShape`), `apps/web/src/lib/use-finance-route-guard.ts` (`useFinanceRouteGuard`), `apps/web/src/components/layout/sidebar.tsx` (`teacherNavForViewer`), `apps/web/src/components/layout/app-shell.tsx`, `apps/web/src/components/command-search/search-index.ts` (`buildSearchIndex`), `apps/web/src/routes/_auth/debts/index.tsx`, `apps/web/src/routes/_auth/tuition/index.tsx`, `apps/web/src/routes/_auth/tuition/$invoiceId.tsx`.
- **Steps:**
  1. Mở rộng `KernelHydratedData` thêm `viewer: KernelViewer`, cập nhật `emptyKernelData.viewer = { role: "teacher", canAccessFinance: true }`, cập nhật `mapKernelSnapshot` và `isSnapshotShape` trong `apps/web/src/lib/repos/kernel.ts`.
  2. Thêm `teacherNavForViewer(canAccessFinance: boolean)` trong `sidebar.tsx`, truyền vào `Shell` trong `AppShell` (qua component con đọc `useData()`) và dùng trong `search-index.ts` khi build nav items từ `data`.
  3. Tạo `useFinanceRouteGuard()` và gắn vào `DebtsRoute`, `TuitionRoute`, `InvoiceDetailRoute`.
  4. Viết unit test trong `apps/web/src/routes/_auth/debts/index.test.tsx`, `apps/web/src/routes/_auth/tuition/index.test.tsx`, và `apps/web/src/components/layout/sidebar.test.tsx`.
- **Success criteria:** Unit test cho debts, tuition, sidebar và search-index pass.
- **Verify:** `pnpm --filter web test -- debts tuition sidebar search-index` exits 0.

### Task 2.2 — Inline validation số tiền thu trong `RecordPaymentModal`
- **Goal:** Trong hộp thoại Ghi nhận thu tiền, khi đã chạm/nhập ô tiền mà giá trị rỗng, `<= 0` (như `0`), hoặc `> remaining` (như `3,000,000` khi nợ `2,500,000`) thì hiển thị lỗi inline `"Số tiền thu phải lớn hơn 0 và không vượt quá số tiền còn nợ"`, gắn `aria-invalid="true"` + `aria-describedby`, và khóa nút `"Lưu phiếu thu học phí"`; khi sửa về giá trị hợp lệ (`2,500,000`) thì lỗi biến mất và nút Lưu bật lại.
- **Target files and symbols:** `apps/web/src/components/modals/record-payment-modal.tsx` (`RecordPaymentModal`), `apps/web/src/components/modals/record-payment-modal.test.tsx`.
- **Steps:**
  1. Viết test trong `apps/web/src/components/modals/record-payment-modal.test.tsx` cho các kịch bản: mới mở hộp thoại (chưa đỏ nhưng nút Lưu disabled), nhập `0` (hiện lỗi `"Số tiền thu phải lớn hơn 0 và không vượt quá số tiền còn nợ"`, `aria-invalid="true"`, `aria-describedby` trỏ tới phần tử lỗi, nút Lưu disabled), nhập `3,000,000` khi nợ `2,500,000` (tương tự), sửa về `2,500,000` (hết lỗi, nút Lưu bật), và đổi khoản thu sang khoản có nợ nhỏ hơn số đang nhập (lỗi hiện lại, nút Lưu disabled).
  2. Cập nhật `RecordPaymentModal` trong `apps/web/src/components/modals/record-payment-modal.tsx` với state `amountTouched` (bật khi `onChange`, `onBlur`, hoặc `submit`), tính `isAmountValid = parsedAmount !== null && parsedAmount > 0 && parsedAmount <= remaining`, hiển thị lỗi khi `amountTouched && !isAmountValid`, và `disabled={saving || submitBlocked || !selected || !isAmountValid}` trên nút Lưu.
- **Success criteria:** Toàn bộ test trong `record-payment-modal.test.tsx` xanh.
- **Verify:** `pnpm --filter web test -- record-payment-modal` exits 0.

## Verification

- `pnpm --filter web test -- record-payment debts tuition sidebar search-index`
- `pnpm check && pnpm check-types`

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
