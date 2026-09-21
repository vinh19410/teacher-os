---
title: "Phase 1: Đưa enrollmentId lên Invoice client + helper tính nợ theo lớp"
status: completed
phase: 1
priority: P2
effort: "1.5h"
dependencies: []
---

# Phase 1: Đưa enrollmentId lên Invoice client + helper tính nợ theo lớp

## Overview

Đưa `enrollmentId` từ snapshot row (`KernelInvoiceRow.enrollmentId` — đã có trên wire từ lâu) vào kiểu `Invoice` phía client qua `mapInvoices`, rồi thêm pure helper `rosterDebtByStudent()` vào module tuition: tính tổng tiền chưa thu của từng học viên **chỉ tính theo enrollment của lớp đã cho**. Toàn bộ là tầng mapping + pure function, kèm unit tests — chưa đụng UI.

## Context Links

- Wire row đã có sẵn field: `packages/api/src/contracts.ts:566-580` (`KernelInvoiceRow.enrollmentId: string`)
- Snapshot đã select field: `apps/server/src/routes/snapshot.ts:33-57` (`loadInvoices` chọn `enrollmentId`) — **không đổi server**
- Mapper hiện tại bỏ field: `apps/web/src/lib/repos/invoices.ts:17-29` (`mapInvoices` không map `enrollmentId`)
- Precedent tính nợ: `apps/web/src/lib/tuition-from-kernel.ts:13-26` (`tuitionTotals` — unpaid + overdue đều tính là outstanding)
- Bảng enrollment client: `data.enrollments` là `KernelEnrollmentRow[]` (`{id, classId, studentId, createdAt}`) — `apps/web/src/lib/mock-data.ts:204-205`
- API tạo invoice luôn yêu cầu enrollment hợp lệ: `packages/api/src/contracts.ts:426-434` (`invoiceCreateSchema.enrollmentId` min(1)) + server validate tại `apps/server/src/routes/kernel.ts:1425-1436`

## Requirements

- [ ] `Invoice` client (`apps/web/src/lib/mock-data.ts`) có field `eid: string` (enrollmentId; `""` trên row legacy trước era create API)
- [ ] `mapInvoices` map `eid: row.enrollmentId`
- [ ] Helper `rosterDebtByStudent(classId, enrollments, invoices)` trả `Map<studentId, {outstanding, invoiceCount}>`, chỉ đếm invoice có `eid` thuộc enrollment của `classId`
- [ ] Convention nợ khớp `tuitionTotals`: mọi status ≠ `"paid"` (unpaid, overdue, legacy coerce) đều tính là chưa thu
- [ ] Unit tests phủ: paid bị loại, unpaid/overdue cộng dồn, invoice lớp khác bị loại, `eid: ""` bị loại, nhiều invoice cùng học viên cộng dồn, học viên không có hóa đơn không nằm trong map
- [ ] `pnpm --filter web test` và `pnpm --filter web check-types` xanh

## Implementation Steps

1. `apps/web/src/lib/mock-data.ts` — thêm field vào `Invoice` (sau `sid`, dòng ~78):

```ts
export interface Invoice {
	id: string;
	sid: string;
	/** Enrollment (lớp) phát sinh hóa đơn; "" trên legacy rows tạo trước
	 * create API. Nguồn: KernelInvoiceRow.enrollmentId trên snapshot. */
	eid: string;
	amount: number;
	// ... giữ nguyên phần còn lại
}
```

2. `apps/web/src/lib/repos/invoices.ts` — `mapInvoices` thêm dòng map (giữ thứ tự key khớp interface):

```ts
	return snapshot.invoices.map((row) => ({
		id: row.id,
		sid: row.studentId,
		eid: row.enrollmentId,
		amount: row.amount,
		// ... phần còn lại giữ nguyên
	}));
```

3. `apps/web/src/lib/tuition-from-kernel.ts` — thêm helper mới cuối phần tuition (ngay sau `tuitionTotals`):

```ts
/** Structural enrollment ref — KernelEnrollmentRow và mọi fixture test đều
 * gán được, module này không cần import contracts. */
export interface RosterEnrollmentRef {
	id: string;
	classId: string;
	studentId: string;
}

/** Per-student tuition debt scoped to ONE class's enrollments. */
export interface RosterDebt {
	/** Sum of unpaid + overdue invoice amounts (VND) for this class. */
	outstanding: number;
	/** All invoices of the class's enrollments, any status — để phân biệt
	 * "Đã đủ" (có hóa đơn, đã thu đủ) với "—" (chưa có hóa đơn nào). */
	invoiceCount: number;
}

/**
 * Roster-tab debt (issue này): tiền chưa thu của từng học viên CHỈ theo
 * enrollment của lớp đã cho. Invoices của lớp khác và legacy rows
 * (`eid: ""`) không tính; status ≠ "paid" đều là chưa thu, cùng convention
 * với tuitionTotals. Edge đã biết: học viên rời lớp rồi enroll lại thì hóa
 * đơn cũ trỏ enrollmentId đã xóa (invoice.enrollmentId là text, không FK)
 * và không được đếm — chấp nhận vì hóa đơn đó thuộc enrollment cũ.
 */
export function rosterDebtByStudent(
	classId: string,
	enrollments: RosterEnrollmentRef[],
	invoices: Pick<Invoice, "eid" | "amount" | "status">[],
): Map<string, RosterDebt> {
	const eidToSid = new Map<string, string>();
	for (const e of enrollments) {
		if (e.classId === classId) eidToSid.set(e.id, e.studentId);
	}
	const acc = new Map<string, RosterDebt>();
	for (const inv of invoices) {
		const sid = eidToSid.get(inv.eid);
		if (!sid) continue;
		const cur = acc.get(sid) ?? { outstanding: 0, invoiceCount: 0 };
		cur.invoiceCount += 1;
		if (inv.status !== "paid") cur.outstanding += inv.amount;
		acc.set(sid, cur);
	}
	return acc;
}
```

4. `apps/web/src/lib/repos/invoices.test.ts` — fixture hiện tại là `KernelInvoiceRow` (bắt buộc có `enrollmentId` nên đã có sẵn). Thêm 1 test assert map qua: input row `enrollmentId: "ENR-9"` → output `eid` bằng `"ENR-9"`.

5. `apps/web/src/lib/tuition-from-kernel.test.ts` — thêm describe `rosterDebtByStudent` với các case ở Requirements. Fixture inline theo structural type (không cần full `KernelEnrollmentRow`), ví dụ enrollment `[{id: "E1", classId: "C1", studentId: "S1"}, {id: "E2", classId: "C2", studentId: "S1"}]` + invoice eid `"E1"`, `"E2"`, `""` để phủ cả 3 nhánh lọc.

## Todo

- [ ] Thêm `eid` vào `Invoice` interface
- [ ] Map `eid` trong `mapInvoices` + test map
- [ ] Helper `rosterDebtByStudent` + unit tests
- [ ] Chạy `pnpm --filter web test` + `pnpm --filter web check-types`

## Success Criteria

- `pnpm --filter web test` xanh (bao gồm toàn bộ test hiện có dùng `Invoice` — type mới có field bắt buộc, nếu chỗ nào dựng literal thiếu `eid` thì typecheck sẽ chỉ ra và được sửa).
- `pnpm --filter web check-types` exit 0.
- Helper là pure function, không import provider/store — same pattern module thuần như `tuitionTotals`.

## Risk Assessment

- **Field bắt buộc mới trên `Invoice`**: mọi literal `Invoice` trong code/test thiếu `eid` sẽ đỏ typecheck. Đã rà: chỉ `mapInvoices` dựng `Invoice`; các consumer (`add-invoice-modal`, `tuition.tsx`, `data-provider`) chỉ đọc. Typecheck là lưới an toàn.
- **Data legacy `eid: ""`**: chủ động loại khỏi tính nợ theo lớp — nợ đó vẫn hiện ở trang Học phí / `/students` (tính theo student), không mất dữ liệu.

## Security Considerations

- Không đụng server/DB; dữ liệu enrollmentId đã thuộc snapshot có sẵn sau auth org (`bootstrapMiddleware`), không mở thông tin mới theo role.
