---
phase: 6
title: "Wave 5 Tuition persist"
status: pending
priority: P2
effort: "1d"
dependencies: [5]
---

# Phase 6: Wave 5 Tuition persist

## Overview

Bảng `invoice`. Mark-paid persist. `AddInvoiceModal` vẫn no-op. `pkg.remaining` trên màn Tuition đã thật từ wave 4.

## Context Links

- `apps/web/src/routes/_auth/tuition.tsx`
- Stub: `apps/web/src/components/modals/add-invoice-modal.tsx:20-24`
- Reducer: `mark-invoice-paid` `data-store-reducer.ts:146-154`
- Tags `"nợ học phí"` static — không đổi (plan convert)

## Requirements

- Functional: list invoice + mark-paid persist, org-scoped.
- Non-functional: tạo HĐ vẫn stub. Không sửa student tabs khác tuition.

## Architecture

```
invoice: id, orgId, studentId, amount, status, date, type, method
```

POST `/api/invoices/:id/mark-paid` `{ method }`. Không POST create. Test mark-paid dùng helper insert invoice, không mở AddInvoiceModal.

## Related Code Files

- Create: `packages/db/src/schema/invoice.ts`
- Create/Modify: `apps/server/src/routes/invoices/`, `repos/invoices.ts`
- Modify: `tuition.tsx`
- Do not modify: `add-invoice-modal.tsx` behavior (vẫn close no-op), student tabs khác

## Implementation Steps

1. Schema + migrate.
2. GET list + POST mark-paid.
3. Tuition đọc D1. Remaining lấy từ derive wave 4.
4. Org mới: 0 invoice.

## Todo

- [ ] Bảng invoice
- [ ] Mark-paid persist
- [ ] AddInvoiceModal no-op
- [ ] Quality gate

## Success Criteria

- [ ] Reload giữ status paid + method
- [ ] Tạo HĐ vẫn không insert
- [ ] Quality gate xanh

## Risk Assessment

Tuition còn đọc `s.pkg.done` trên type mock. Phải là số derive, không counter. Signal: mark-paid vô tình sửa pkg. Response: invoice không đụng package.

## Security Considerations

Mark-paid chỉ invoice cùng org. Không tin `amount` từ client lúc mark-paid.
