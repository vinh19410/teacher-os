---
phase: 1
title: "Helper studentTuitionSummary + unit test"
status: pending
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Helper `studentTuitionSummary` + unit test

## Goal

Thêm pure helper tính tổng học phí / đã đóng / còn lại của một học viên theo
từng lớp, theo đúng bảng quy tắc trong [plan.md](./plan.md#quy-tắc-tính-đã-chốt-với-user-2026-10-08).

## Files to Create / Modify

- Modify: `apps/web/src/lib/tuition-from-kernel.ts` — thêm `invoiceReceived`, `studentTuitionSummary` và các type đi kèm.
- Modify: `apps/web/src/lib/tuition-from-kernel.test.ts` — thêm `describe("studentTuitionSummary")` và `describe("invoiceReceived")`.

## Thiết kế

```ts
/** Tiền đã thu của MỘT hóa đơn theo rule tuitionTotals: paid → đủ amount
 * (mark-paid thủ công giữ paidAmount 0), còn lại → min(paidAmount, amount). */
export function invoiceReceived(
	invoice: Pick<Invoice, "amount" | "paidAmount" | "status">,
): number;

export interface StudentClassTuition {
	classId: string;
	className: string;
	enrollmentStatus: string;   // "active" | "invited"
	fee: number | null;         // null = lớp chưa thiết lập học phí
	paid: number;               // Σ invoiceReceived trên hóa đơn của enrollment này
	remaining: number;          // fee === null ? 0 : max(0, fee − paid)
	overpaid: number;           // fee === null ? 0 : max(0, paid − fee)
	counted: boolean;           // enrollmentStatus === "active" && fee !== null
}

export interface StudentTuitionSummary {
	classes: StudentClassTuition[];   // thứ tự theo data.classes
	totalFee: number;                 // Σ fee của lớp counted
	totalPaid: number;                // Σ paid của lớp counted
	totalRemaining: number;           // Σ remaining của lớp counted
	countedClasses: number;           // 0 → UI hiện "—"
	unlinkedPaid: number;             // Σ invoiceReceived của hóa đơn có eid không thuộc enrollment hiện tại của học viên
}

export function studentTuitionSummary(
	studentId: string,
	classes: Pick<ClassGroup, "id" | "name" | "tuitionFee">[],
	enrollments: Array<RosterEnrollmentRef & { status: string }>,
	invoices: Pick<Invoice, "sid" | "eid" | "amount" | "paidAmount" | "status">[],
): StudentTuitionSummary;
```

Ghi chú triển khai:

- Lọc `enrollments` theo `studentId`, `invoices` theo `sid === studentId` bên trong helper để caller truyền thẳng `data.*`.
- Map `eid → classId` từ enrollment của học viên; hóa đơn có `eid` không nằm trong map (gồm `""`) cộng vào `unlinkedPaid`.
- Enrollment trỏ lớp không còn trong `classes` thì bỏ qua (không có tên lớp để hiện); hóa đơn của nó tính vào `unlinkedPaid`.
- Dùng `invoiceReceived` thay biểu thức `received` trùng lặp trong `revenueByPeriod` (cùng file, output không đổi). `tuitionTotals` và `$invoiceId.tsx` giữ nguyên.
- Comment helper bằng tiếng Việt, giải thích invariant (cùng giọng các helper khác trong file); không ghi số phase/plan trong comment.

## Tasks & Steps

1. [ ] Thêm `invoiceReceived` và dùng nó trong `revenueByPeriod`.
2. [ ] Thêm type `StudentClassTuition`, `StudentTuitionSummary` và hàm `studentTuitionSummary`.
3. [ ] Viết unit test (mỗi case một `it`):
   - 1 lớp 10.000.000đ, hóa đơn 2.000.000đ `paid` → totalFee 10.000.000, totalPaid 2.000.000, totalRemaining 8.000.000.
   - 2 lớp active có học phí (10.000.000 + 6.000.000) → totalFee 16.000.000; paid/remaining đúng từng lớp.
   - Thu một phần: hóa đơn `unpaid`, `amount` 3.000.000, `paidAmount` 1.000.000 → paid 1.000.000.
   - Mark-paid thủ công: `status: "paid"`, `paidAmount: 0` → paid = amount.
   - `paidAmount > amount` trên hóa đơn chưa paid → clamp về amount.
   - Lớp `invited` có học phí → `counted: false`, không vào tổng.
   - Lớp `tuitionFee: null` → `counted: false`, `remaining 0`; `countedClasses` = 0 khi chỉ có lớp đó.
   - Đóng dư: fee 5.000.000, paid 6.000.000 → remaining 0, overpaid 1.000.000.
   - Hóa đơn `eid: ""` và hóa đơn trỏ enrollment không tồn tại → `unlinkedPaid`, không đổi 3 con số tổng.
   - Hóa đơn/enrollment của học viên khác bị bỏ qua.
   - Học viên không có lớp → `classes: []`, mọi tổng 0, `countedClasses` 0.
4. [ ] Chạy test hẹp rồi lint/type.

## Verification

```bash
pnpm --filter web exec vitest run src/lib/tuition-from-kernel.test.ts
pnpm check
pnpm check-types
```

Pass khi cả ba lệnh exit 0 và test `revenueByPeriod` / `tuitionTotals` cũ vẫn xanh.
