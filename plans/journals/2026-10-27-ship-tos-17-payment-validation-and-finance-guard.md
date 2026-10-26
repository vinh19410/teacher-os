---
title: Ship TOS-17 Chặn số tiền thu không hợp lệ và phân quyền tài chính Sổ công nợ
date: 2026-10-27
summary: "Ship issue #451: inline validation số tiền thu trong RecordPaymentModal, allowlist vai trò tài chính canAccessFinance + middleware requireFinanceRole (403 finance-forbidden), ẩn invoices trong snapshot kèm viewer.canAccessFinance, ẩn Doanh thu/Công nợ trên Sidebar/⌘K và redirect /debts /tuition* về /dashboard, E2E AC-003; PR vào develop (beta)"
---

# Ship TOS-17 Chặn số tiền thu không hợp lệ và phân quyền tài chính Sổ công nợ

## What happened
Chạy `ak-vibe --ship --beta --advice` cho issue #451 theo plan `plans/261026-2038-tos-17-payment-validation-and-finance-guard/` trên worktree `ai-handle-issue-451`. Hoàn tất cả 3 phase:
1. **Phase 1 (Server & Snapshot):** Định nghĩa `FINANCE_ROLES = ["teacher", "owner", "admin"]` và `canAccessFinance(role)` trong `@teacher-os/auth`; mở rộng `KernelCtx.role` trong `bootstrapMiddleware`; thêm middleware `requireFinanceRole` trả `403 { error: "finance-forbidden" }` (bảo toàn `401 unauthorized` khi chưa đăng nhập) cho toàn bộ `/api/invoices`, `/api/invoices/*`, `/api/payment-transactions/*`, `/api/bank-link/*`; cập nhật `loadSnapshot` trả `viewer: { role, canAccessFinance }` và `invoices: []` khi không có quyền tài chính; ẩn `tuition` trong `GET /api/dashboard/reminders` cho vai trò không có quyền tài chính.
2. **Phase 2 (Web Guard & Inline Validation):** Thêm `useFinanceRouteGuard()` trên `/debts`, `/tuition`, `/tuition/$invoiceId` (điều hướng về `/dashboard` kèm toast `"Bạn không có quyền xem Sổ công nợ"` deduplicated theo id `"finance-forbidden"`, trả `null` ngay để không bắn request API tài chính từ component con); thêm `teacherNavForViewer(canAccessFinance)` ẩn `"Doanh thu"` và `"Công nợ"` trên cả Sidebar và Command Palette ⌘K; cập nhật `RecordPaymentModal` hiển thị lỗi inline `"Số tiền thu phải lớn hơn 0 và không vượt quá số tiền còn nợ"` (`aria-invalid="true"`, `aria-describedby`) và khóa nút `"Lưu phiếu thu học phí"` khi số tiền rỗng, `<= 0`, hoặc `> remaining`.
3. **Phase 3 (E2E AC-003):** Thêm helper `seedOrgMember` và E2E spec `apps/e2e/specs/debt-payment-validation-and-guard.spec.ts` phủ cả 2 scenario AC-003 kèm screenshot 3 viewport (1440×900, 768×1024, 375×812).

## Decision
- **Red-Team & Kongming Plan Gate (6 findings accepted):**
  1. Đặt guard route web trong `useFinanceRouteGuard()` bên dưới `DataProvider` (kết hợp wrapper `InvoiceDetailRoute` trước `InvoiceDetailContent`) để hoạt động đồng nhất trên cả trình duyệt thật lẫn unit test `renderWithKernel` và không ném nhầm `notFound()` khi `invoices: []`.
  2. Giữ `viewer?: KernelViewer` là optional trên `KernelSnapshot` và `KernelHydratedData`, loại trừ `"viewer"` khỏi `MissingSnapshotKey` (vốn chỉ kiểm mảng) và kiểm tra kiểu object trong `isSnapshotShape`, giữ nguyên `emptyKernelData` chỉ chứa 18 mảng rỗng (`kernel-state.test.ts` xanh 100%).
  3. Ẩn trường `tuition` khỏi `GET /api/dashboard/reminders` khi `!canAccessFinance(ctx.role)` để khi `ta`/`class_teacher` về `/dashboard` không bị lộ tổng nợ học phí của tổ chức.
  4. Đăng ký cả `kernel.use("/invoices", requireFinanceRole)` và `kernel.use("/invoices/*", requireFinanceRole)` ngay sau CSRF middleware trong `kernelRoutes`.
  5. Dùng chung `teacherNavForViewer` cho cả `AppShellFrame` và `buildSearchIndex` (⌘K).
  6. Reset `amountTouched` trước `await reconcile()` trong nhánh server 422 của `RecordPaymentModal` để tránh render đúp 2 phần tử `role="alert"` trong lúc snapshot đang đồng bộ lại.

## Verification
- `@teacher-os/auth`: 8 files / 86 tests passed (`role.test.ts`).
- `server`: 70 files / 963 tests passed (`require-finance-role.test.ts`, `dashboard-reminders.test.ts`, `invoice-payment.test.ts`, `invoice-transactions.test.ts`, `payment-transactions.test.ts`, `bank-link.test.ts`).
- `web`: 155 files / 1637 tests passed (`sidebar.test.tsx`, `search-index.test.ts`, `debts/index.test.tsx`, `tuition/index.test.tsx`, `tuition/$invoiceId.test.tsx`, `record-payment-modal.test.tsx`, `kernel-state.test.ts`).
- `e2e`: 16/16 Playwright tests passed (`debt-payment-validation-and-guard.spec.ts`, `debt-record-payment.spec.ts`, `create-invoice.spec.ts`, `invoice-detail.spec.ts`), kèm screenshot 3 viewport tại `plans/261026-2038-tos-17-payment-validation-and-finance-guard/screenshots/`.
- `pnpm check` & `pnpm check-types`: 8/8 packages typecheck + build pass.

## Open
- UI mời nhân sự 4 vai trò (`owner`, `admin`, `class_teacher`, `ta`) và phân công lớp thuộc TOS-48 (US-010, đang tạm hoãn); cần dùng đúng vocabulary `"class_teacher"` và `"ta"` đã chốt ở `packages/auth/src/role.ts`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
