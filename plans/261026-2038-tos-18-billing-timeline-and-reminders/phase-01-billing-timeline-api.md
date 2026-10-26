---
phase: 1
title: "GET /api/students/:id/billing-timeline"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: API dòng thời gian

## Files to Modify

- `packages/api/src/contracts.ts` — `BillingTimelineEvent` (union `invoice_issued` | `payment`), `BillingTimelineResponse`.
- `apps/server/src/routes/kernel.ts` (hoặc file route mới `billing-timeline.ts` gắn vào kernel nếu `kernel.ts` đã quá dài) — handler; đặt dưới guard tài chính của TOS-17 (nếu TOS-17 chưa merge: ghi chú để TOS-17 thêm vào danh sách test 403).
- Test: `apps/server/src/routes/billing-timeline.test.ts`.

## Contract

```ts
type BillingTimelineEvent =
  | { kind: "invoice_issued"; at: string; invoiceId: string; code: string; type: string; amount: number; due: string; status: "unpaid" | "paid" }
  | { kind: "payment"; at: string; invoiceId: string; code: string; amount: number; source: "bank_hub" | "manual"; method: string; note: string };
```

`at` là ISO datetime giờ VN; sắp xếp giảm dần theo `at`, rồi `createdAt`, rồi `id`.

## Tasks & Steps

1. Test đỏ:
   - Học viên 2 hóa đơn + 1 giao dịch bank-hub matched + 2 phiếu thu manual → 5 sự kiện đúng thứ tự, đúng `source`/`method`.
   - Giao dịch `unmatched` hoặc của học viên khác không xuất hiện; không có trường `raw`/`content` gốc của bank-hub ngoài `note` đã lọc.
   - Học viên org khác / không tồn tại → 404.
2. Viết code cho xanh (1 query hóa đơn theo `studentId` + 1 query giao dịch `invoiceId IN (...)`).

## Verification

- `pnpm --filter server test -- billing-timeline`
- `pnpm check`, `pnpm check-types`
