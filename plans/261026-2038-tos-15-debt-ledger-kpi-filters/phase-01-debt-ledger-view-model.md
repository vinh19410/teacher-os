---
phase: 1
title: "View-model debtLedger: gom theo học viên, trạng thái nợ, KPI, parse URL"
status: pending
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: View-model thuần

## Files to Modify

- `apps/web/src/lib/tuition-from-kernel.ts` — thêm `DebtStatus`, `DebtLedgerRow`, `DebtLedgerKpis`, `debtLedger(...)`, `debtStatusOf(...)`.
- `apps/web/src/lib/tuition-from-kernel.test.ts` (tạo nếu chưa có, hoặc file test hiện có của module).
- `apps/web/src/routes/_auth/list-page-filters.test.ts` — thêm case parse search `/debts`.

## Contract

```ts
type DebtStatus = "overdue" | "due_soon" | "due" | "clear";
interface DebtLedgerRow {
  studentId: string; name: string; classNames: string[];
  totalDue: number; totalPaid: number; remaining: number;
  nextDue: string | null; // due sớm nhất của hóa đơn còn nợ
  status: DebtStatus;
  openInvoiceIds: string[]; // TOS-16 dùng để chọn khoản thu
}
interface DebtLedgerKpis {
  receivable: { amount: number; students: number };
  collected: { amount: number; students: number };  // students = số HV clear
  overdue: { amount: number; students: number };
}
function debtLedger(input: { invoices; students; enrollments; classes; todayISO: string;
  classId?: string; q?: string; status?: "overdue" | "due" | "clear" }):
  { rows: DebtLedgerRow[]; kpis: DebtLedgerKpis; counts: Record<"all"|"overdue"|"due"|"clear", number> };
```

`counts` phục vụ badge đếm trên chip (`aria-hidden`), tính trên cùng tập với KPI (D5).

## Tasks & Steps

1. Test đỏ (fixture cố định `todayISO`):
   - Học viên có 2 hóa đơn (1 thu một phần qua ledger, 1 mark-paid thủ công `paidAmount: 0`) → Phải thu/Đã đóng/Còn nợ đúng D3.
   - Trạng thái: `due` hôm qua → `overdue`; `due` = hôm nay + 7 → `due_soon`; + 8 → `due`; còn nợ 0 → `clear`; `due` rỗng/không hợp lệ và còn nợ → `due`.
   - Chip `due` trả cả `due_soon` + `due`.
   - KPI không đổi khi đổi `status`, đổi khi đổi `classId`/`q` (D5).
   - `q` "nguyen minh" khớp "Nguyễn Minh Anh"; khớp email / SĐT.
   - `classId` loại hóa đơn `eid = ""` và hóa đơn lớp khác.
   - Tổng `rows` (không lọc) khớp `tuitionTotals` trên cùng fixture.
   - Parse search: `status=lol` → undefined; `q` trim; `lop` rỗng → undefined.
2. Viết code cho xanh, tái dùng `invoiceReceived`, `effectiveInvoiceStatus`, `isValidDue`, helper bỏ dấu hiện có (tìm trong `apps/web/src/lib/` trước khi viết mới).

## Verification

- `pnpm --filter web test -- tuition-from-kernel list-page-filters`
- `pnpm check-types`
