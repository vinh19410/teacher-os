---
title: "Issue #60: API tạo invoice + validation (amount/due/enrollment)"
date: 2026-08-29
summary: "Shipped PR #134 (beta → develop): POST /api/invoices với invoiceCreateSchema strict (amount int min1, due ISO roundtrip-guard, note max500); server resolve enrollment org-scoped + verify student cùng org (chặn invisible-row bug); migration 0013 additive (due/note/enrollment_id + index); KernelInvoiceRow mở rộng additive; 126 server tests + 373 web tests xanh; red-team 3 fixes + code review PASS WITH NOTES 2 notes đều đã áp."
---

# Issue #60: API tạo invoice + validation (amount/due/enrollment)

Shipped PR #134 (beta → develop): POST /api/invoices với invoiceCreateSchema strict (amount int min1, due ISO roundtrip-guard, note max500); server resolve enrollment org-scoped + verify student cùng org (chặn invisible-row bug); migration 0013 additive (due/note/enrollment_id + index); KernelInvoiceRow mở rộng additive; 126 server tests + 373 web tests xanh; red-team 3 fixes + code review PASS WITH NOTES 2 notes đều đã áp.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
