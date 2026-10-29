---
phase: 1
title: "View-model debtLedger: gom theo học viên, trạng thái nợ, KPI, parse URL"
status: completed
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: View-model thuần `debtLedger`, trạng thái nợ, KPI và parse URL

## Goal
Xây dựng tầng tính toán thuần (pure view-model) trong `apps/web/src/lib/tuition-from-kernel.ts` để gom hóa đơn theo từng học viên thành 3 chỉ số lũy kế (`totalDue`, `totalPaid`, `remaining`), suy ra trạng thái công nợ (`overdue | due_soon | due | clear`), tính 3 thẻ KPI + bộ đếm chip, và parse/chuẩn hóa tham số URL (`validateDebtsSearch`).

## Files to Modify
- `apps/web/src/lib/tuition-from-kernel.ts` — thêm `DebtStatus`, `DebtFilterStatus`, `DebtsSearch`, `DebtLedgerRow`, `DebtLedgerKpis`, `DebtLedgerResult`, `addDaysISO`, `invoiceRemaining`, `debtStatusOf`, `debtLedger`, `validateDebtsSearch`.
- `apps/web/src/lib/tuition-from-kernel.test.ts` — thêm bộ unit test cho `debtLedger`, `debtStatusOf`, `invoiceRemaining`, `addDaysISO`.
- `apps/web/src/routes/_auth/list-page-filters.test.ts` — import `validateDebtsSearch` thật từ `@/lib/tuition-from-kernel` và kiểm tra parse URL `/debts`.

## Contract

```ts
export type DebtStatus = "overdue" | "due_soon" | "due" | "clear";
export type DebtFilterStatus = "overdue" | "due" | "clear";

export interface DebtsSearch {
	status?: DebtFilterStatus;
	q?: string;
	lop?: string;
}

export interface DebtLedgerRow {
	studentId: string;
	name: string;
	classNames: string[];
	totalDue: number;
	totalPaid: number;
	remaining: number;
	/** due hợp lệ (isValidDue) sớm nhất của các hóa đơn còn nợ (invoiceRemaining > 0); null nếu không có. */
	nextDue: string | null;
	status: DebtStatus;
	/** Các hóa đơn có invoiceRemaining > 0, sort theo isValidDue trước (due tăng dần), sau đó createdAt, id. */
	openInvoiceIds: string[];
}

export interface DebtLedgerKpis {
	receivable: { amount: number; students: number };
	collected: { amount: number; students: number }; // students = số HV có status === "clear"
	overdue: { amount: number; students: number }; // amount = Σ invoiceRemaining của hóa đơn quá hạn; students = số HV có status === "overdue"
}

export interface DebtLedgerResult {
	rows: DebtLedgerRow[];
	kpis: DebtLedgerKpis;
	counts: Record<"all" | "overdue" | "due" | "clear", number>;
}
```

## Tasks & Steps (Handover Contract `--advice`)

### Task 1.1 — Viết unit test (Red phase) cho `debtLedger` và `validateDebtsSearch`
- **Goal:** Khóa toàn bộ quy tắc tính toán D3–D7 và parse URL bằng unit test thất bại trước khi viết implementation.
- **Target files and symbols:**
  - `apps/web/src/lib/tuition-from-kernel.test.ts` (describe `"debtLedger & debtStatusOf (TOS-15 #449)"`)
  - `apps/web/src/routes/_auth/list-page-filters.test.ts` (describe `"validateDebtsSearch (TOS-15 #449)"`)
- **Steps:**
  1. Trong `apps/web/src/lib/tuition-from-kernel.test.ts`, thêm các test case với `todayISO = "2026-10-26"`:
     - Học viên có 2 hóa đơn (1 thu một phần qua ledger `paidAmount: 2_000_000 / 4_500_000`, 1 mark-paid thủ công `status: "paid", paidAmount: 0`) → `totalDue`, `totalPaid`, `remaining` đúng D3; `openInvoiceIds` chỉ chứa hóa đơn còn nợ (`invoiceRemaining > 0`).
     - Hóa đơn `status: "unpaid"` nhưng `paidAmount >= amount` (overpay clamp `#340`) có `invoiceRemaining === 0` → không lọt vào `openInvoiceIds`, học viên có `status = "clear"`.
     - Trạng thái `debtStatusOf` / `row.status`: `due = "2026-10-25"` (hôm qua) → `"overdue"`; `due = "2026-10-26"` (hôm nay) hoặc `"2026-11-02"` (hôm nay + 7) → `"due_soon"`; `due = "2026-11-03"` (+ 8) → `"due"`; `due` rỗng/không hợp lệ (`""`, `"2026-02-30"`) và còn nợ → `"due"` với `nextDue = null`; còn nợ = 0 → `"clear"`.
     - Học viên có cả hóa đơn `due = ""` và hóa đơn `due = "2026-11-05"` cùng còn nợ → `nextDue = "2026-11-05"` (không bị `""` chiếm chỗ) và `openInvoiceIds[0]` là hóa đơn có `due = "2026-11-05"`.
     - Lọc `status = "due"` trả về cả dòng `"due_soon"` và `"due"`.
     - KPI và `counts` không đổi khi đổi `status`, nhưng cập nhật đúng khi đổi `classId` hoặc `q` (D5).
     - Tìm kiếm `q = "nguyen minh"` khớp `"Nguyễn Minh Anh"`; khớp cả `email` và `phone` (không phân biệt hoa/thường, bỏ dấu).
     - Lọc `classId` loại bỏ hóa đơn `eid = ""`, dangling `eid` (enrollment không tồn tại hoặc lớp không tồn tại), và hóa đơn của lớp khác.
     - Trên cùng fixture không lọc (`classId`, `q`, `status` rỗng), tổng `totalPaid` của `rows` bằng `tuitionTotals(invoices).collected` và tổng `remaining` của `rows` bằng `tuitionTotals(invoices).outstanding`.
  2. Trong `apps/web/src/routes/_auth/list-page-filters.test.ts`, import `validateDebtsSearch` từ `@/lib/tuition-from-kernel` và kiểm tra:
     - `status = "overdue" | "due" | "clear"` giữ nguyên; alias `"due_soon" -> "due"`, `"paid" -> "clear"`; giá trị lạ (`"lol"`, `"all"`, `123`) → `undefined`.
     - `q` chỉ chứa khoảng trắng (`"   "`) → `undefined`; `q` có nội dung giữ chuỗi để không mất khoảng trắng khi đang gõ.
     - `lop` rỗng hoặc chỉ khoảng trắng → `undefined`; `lop` hợp lệ được `.trim()`.
- **Success criteria:** Các test mới phản ánh đầy đủ hợp đồng D3–D7 và fail ở bước chạy đầu tiên do chưa có hàm export.
- **Verify:** Chạy `pnpm --filter web test -- tuition-from-kernel list-page-filters` khi chưa thêm hàm (kỳ vọng fail vì thiếu symbol), sau đó chuyển ngay sang Task 1.2.

### Task 1.2 — Hiện thực `debtLedger`, `debtStatusOf`, `validateDebtsSearch` trong `tuition-from-kernel.ts` (Green phase)
- **Goal:** Toàn bộ unit test ở Task 1.1 và typecheck đều pass.
- **Target files and symbols:**
  - `apps/web/src/lib/tuition-from-kernel.ts` (`addDaysISO`, `invoiceRemaining`, `debtStatusOf`, `debtLedger`, `validateDebtsSearch`)
- **Steps:**
  1. Thêm `addDaysISO(iso: string, days: number): string` dựa trên `new Date(\`${iso}T00:00:00Z\`).getTime() + days * 86_400_000` (kiểm tra `isValidDue(iso)` trước, nếu không hợp lệ trả `iso`).
  2. Thêm `invoiceRemaining(invoice: Pick<Invoice, "amount" | "paidAmount" | "status">): number` trả `Math.max(0, invoice.amount - invoiceReceived(invoice))`.
  3. Thêm helper chuẩn hóa tiếng Việt nội bộ (NFD + xóa `[\u0300-\u036f]` + `đ/Đ -> d` + `toLowerCase()`) để tìm kiếm học viên theo `name`, `email`, `phone` mà không tạo circular import với `components/command-search/search-index.ts`.
  4. Hiện thực `debtStatusOf(openInvoices, todayISO)` và `debtLedger(input)` theo đúng quy tắc D3, D4, D5, D6, D7 đã chốt.
  5. Hiện thực `validateDebtsSearch(search: Record<string, unknown>): DebtsSearch`.
- **Success criteria:** Tất cả test trong `tuition-from-kernel.test.ts` và `list-page-filters.test.ts` đều xanh, không có lỗi kiểu dữ liệu.
- **Verify:** `pnpm --filter web test -- tuition-from-kernel list-page-filters` exits 0 và `pnpm --filter web check-types` exits 0.

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
