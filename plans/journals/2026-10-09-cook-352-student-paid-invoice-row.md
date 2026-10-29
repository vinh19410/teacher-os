---
title: "Cook #352 — student paid invoice row"
date: 2026-10-09
summary: "Implement plans/261009-1110-student-paid-invoice-row: TuitionList client-side settled rule (status=paid || amountDue<=0) khop server; dong da thanh toan render gon (ten + fmtVnd(amount) + Tag success bg-chip 'Da thanh toan'); totals paidOf/dueOf tinh dung hoa don thu tay. Tag them tone success. TDD: 2 red-first + 2 characterization + 1 mixed-totals case sau review; 255/255 student test, pnpm check, check-types pass. Review: 0 Critical / 1 Important (test chua pin tong Da dong) da fix."
---

# Cook #352 — student paid invoice row

Implement plans/261009-1110-student-paid-invoice-row: TuitionList client-side settled rule (status=paid || amountDue<=0) khop server; dong da thanh toan render gon (ten + fmtVnd(amount) + Tag success bg-chip 'Da thanh toan'); totals paidOf/dueOf tinh dung hoa don thu tay. Tag them tone success. TDD: 2 red-first + 2 characterization + 1 mixed-totals case sau review; 255/255 student test, pnpm check, check-types pass. Review: 0 Critical / 1 Important (test chua pin tong Da dong) da fix.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
