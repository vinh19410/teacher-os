---
phase: 1
title: "Helper trạng thái hóa đơn + nhãn dùng chung"
status: pending
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Helper trạng thái hóa đơn + nhãn dùng chung

## Goal

Một pure helper suy ra trạng thái hiển thị của hóa đơn (kể cả "Quá hạn" từ
`due`), `rosterDebtByStudent` trả thêm trạng thái tổng hợp theo lớp, và một
bộ nhãn/màu badge dùng chung thay cho 3 bản sao rải rác.

## Context

- Server chỉ ghi `"unpaid"`/`"paid"`; `"overdue"` chỉ có trong type
  (`apps/web/src/lib/mock-data.ts:58`, `packages/api/src/contracts.ts:1295`).
- `due` là ISO `yyyy-mm-dd` hoặc `""` (legacy). So chuỗi ISO, không parse
  `Date` — tiền lệ bug UTC drift ghi trong `formatDue`.
- Ngày hôm nay theo giờ VN: `todayISOVietnam()` ở `apps/web/src/lib/week-grid.ts:29`.

## Files to Create / Modify

- Modify: `apps/web/src/lib/tuition-from-kernel.ts`
- Modify: `apps/web/src/lib/tuition-from-kernel.test.ts`
- Modify: `apps/web/src/lib/format-invoice.ts`
- Modify: `apps/web/src/lib/format-invoice.test.ts`

## Tasks & Steps

- [ ] **`effectiveInvoiceStatus`** trong `tuition-from-kernel.ts`:
  ```ts
  /** Trạng thái hiển thị: server chỉ ghi unpaid/paid, nên "Quá hạn" suy ra
   * từ `due` (ISO, so chuỗi — không parse Date). Hạn đúng hôm nay chưa quá
   * hạn; hạn rỗng/không hợp lệ giữ "unpaid". Status lạ coi là chưa thu, cùng
   * convention với tuitionTotals. */
  export function effectiveInvoiceStatus(
  	invoice: Pick<Invoice, "status" | "due">,
  	todayISO: string,
  ): InvoiceStatus {
  	if (invoice.status === "paid") return "paid";
  	if (invoice.status === "overdue") return "overdue";
  	const validDue = ISO_DATE_RE.test(invoice.due) && isValidISODate(invoice.due);
  	return validDue && invoice.due < todayISO ? "overdue" : "unpaid";
  }
  ```
  Dời khai báo `ISO_DATE_RE` lên trên (hiện nằm cuối file, sau `packagesEndingSoon`).
- [ ] **`RosterDebt`** thêm `status: InvoiceStatus` — tổng hợp trên các hóa
  đơn của lớp: có hóa đơn `overdue` → `"overdue"`; còn `unpaid` → `"unpaid"`;
  tất cả đã thu → `"paid"`. Cập nhật JSDoc (bỏ chữ "Đã đủ", nói rõ "Chưa lập
  phiếu" = không có entry trong map).
- [ ] **`rosterDebtByStudent(classId, enrollments, invoices, todayISO)`**:
  `invoices` đổi thành `Pick<Invoice, "eid" | "amount" | "status" | "due">[]`;
  dùng `effectiveInvoiceStatus` cho từng hóa đơn; `outstanding` giữ quy tắc
  cũ (status ≠ paid).
- [ ] **`format-invoice.ts`** thêm:
  ```ts
  export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  	paid: "Đã thu",
  	unpaid: "Chưa thu",
  	overdue: "Quá hạn",
  };
  export const INVOICE_STATUS_VARIANT: Record<
  	InvoiceStatus,
  	"success" | "warn" | "danger"
  > = { paid: "success", unpaid: "warn", overdue: "danger" };
  ```
- [ ] **Unit tests** `tuition-from-kernel.test.ts`, khối `describe("effectiveInvoiceStatus")`:
  - paid có hạn quá khứ → `paid`
  - unpaid hạn hôm qua → `overdue`; hạn đúng hôm nay → `unpaid`; hạn ngày mai → `unpaid`
  - hạn `""` → `unpaid`; hạn không có thật `2026-02-30` → `unpaid`
  - status lưu sẵn `overdue`, hạn tương lai → `overdue`
- [ ] **Unit tests** `rosterDebtByStudent`: cập nhật fixture hiện có (thêm
  `due`, truyền `todayISO` cố định `"2026-10-05"`), thêm ca:
  - 1 unpaid hạn tương lai + 1 unpaid quá hạn → `status: "overdue"`, outstanding cộng cả hai
  - tất cả paid → `status: "paid"`, `outstanding: 0`
  - hóa đơn của lớp khác quá hạn không kéo trạng thái lớp này
- [ ] `format-invoice.test.ts`: một assertion map nhãn/variant đủ 3 key.

## Verification

```bash
pnpm --filter web exec vitest run tuition-from-kernel format-invoice
pnpm check-types
```

Pass khi toàn bộ test trên xanh. `check-types` sẽ báo lỗi ở `$classId.tsx`
(thiếu tham số `todayISO`) cho tới khi phase 2 xong — nếu chạy phase riêng lẻ,
cập nhật luôn lời gọi đó trong phase này.
