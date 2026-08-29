---
phase: 1
title: "Contract + DB migration + wire row"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Contract + DB migration + wire row

## Overview

Định nghĩa contract request `invoiceCreateSchema` trong `packages/api`, mở rộng bảng `invoice` (cột `due`, `note`, `enrollment_id`) qua migration drizzle, và mở rộng `KernelInvoiceRow` + `loadInvoices` để read path trả đủ trường mới.

## Requirements

- Functional: contract `POST /api/invoices` chặt chẽ (`.strict()`), đủ 4 field.
- Non-functional: migration additive, không phá dữ liệu hiện có; contracts là shared surface — không duplicate schema phía server.

## Related Code Files

- Modify: `packages/api/src/contracts.ts` — thêm `invoiceCreateSchema`, `type InvoiceCreate`; mở rộng `KernelInvoiceRow` (thêm `due`, `note`, `enrollmentId`).
- Modify: `packages/db/src/schema/invoice.ts` — 3 cột mới + docblock cập nhật (bỏ câu "Creation is intentionally not exposed").
- Create: `packages/db/src/migrations/00XX_*.sql` (sinh bằng `pnpm db:generate`, không viết tay trừ khi generator lỗi).

## Implementation Steps

1. **Prep test helper:** mở rộng helper `insertInvoice` (nhận optional `due`/`note`/`enrollmentId`) trong `apps/server/src/kernel.test.ts` — assertion route thuộc phase 2 (TDD đỏ/xanh ở phase 2).
2. Thêm vào `contracts.ts` (sau `invoiceMarkPaidSchema`):
   ```ts
   export const invoiceCreateSchema = z
       .object({
           enrollmentId: z.string().min(1),
           amount: z.number().int().min(1),
           due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
           note: z.string().trim().max(500).default(""),
       })
       .strict();
   export type InvoiceCreate = z.infer<typeof invoiceCreateSchema>;
   ```
   Kèm comment: due là ISO lưu DB, roundtrip-guard server-side (precedent moveDate).
3. Mở rộng `KernelInvoiceRow`: `due: string; note: string; enrollmentId: string;`. Docblock cho `due` phải ghi rõ: ISO `yyyy-mm-dd` ở wire (khác `date` display dd/mm và khác docblock "every other date on the wire" của `KernelAssignmentRow.due`) — cần năm để tính overdue; web format hóa là việc #61.
4. `packages/db/src/schema/invoice.ts`: thêm `due`/`note`/`enrollment_id` (`text().notNull().default("")`), index `invoice_enrollment_idx` trên `enrollment_id` (comment: phục vụ totals/timeline #62); cập nhật docblock ("Creation via POST /api/invoices — issue #60").
5. Cập nhật fixture invoice row trong `apps/web/src/lib/repos/kernel.test.ts` (thêm 3 field) — required fields additive sẽ làm vỡ web type nếu bỏ qua.
6. Chạy `pnpm db:generate`, rà file migration sinh ra (phải là 3 cột ADD COLUMN + CREATE INDEX).

## Success Criteria

- [ ] `pnpm check-types` xanh với contract mới.
- [ ] Migration file sinh ra additive (3 cột + 1 index), không destructive.
- [ ] `KernelInvoiceRow` có đủ 3 trường mới; `loadInvoices` chọn đủ cột.
