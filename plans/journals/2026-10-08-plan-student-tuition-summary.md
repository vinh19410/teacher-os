---
title: Plan student tuition summary
date: 2026-10-08
summary: "Planned accurate total/paid/remaining tuition on student detail tab across active classes (#347)"
---

# Plan student tuition summary

## What happened
The "Học phí" tab on `/students/$studentId` only listed invoices. Student Test 1 (class [TEST] Foundation 2, fee 10,000,000đ, one 2,000,000đ paid invoice) looked fully paid. Local D1 query confirmed the invoice's `enrollment_id` points at the Foundation 2 enrollment, so per-class computation is possible from the existing snapshot.

## Decision
- Client-only: pure helper `studentTuitionSummary` + `invoiceReceived` in `apps/web/src/lib/tuition-from-kernel.ts`; new `student-tuition-summary.tsx` above the invoice table.
- Totals count only `active` enrollments with `tuitionFee !== null`; invited and unset-fee classes are listed but not summed.
- Invoices not linked to a current enrollment are excluded from the three totals and surfaced as a separate note.
- Received follows the `tuitionTotals` rule (paid → full amount, else `min(paidAmount, amount)`); per-class remaining clamps at 0, overpay shows "Dư Xđ".

## Next steps
- `/ak:cook plans/261008-1427-student-tuition-summary/plan.md` (3 phases, ~5h), issue #347 labelled `ready to review`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
