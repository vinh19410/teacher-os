---
title: "Ship #345 trang chi tiết hóa đơn /tuition/$invoiceId"
date: 2026-10-08
summary: "PR #346 squash 7031f95 vào develop 2026-10-08. API GET /invoices/:id/transactions (org-scoped, matched-only, display fields) + trang detail đầy đủ (QR, link /pay, lịch sử giao dịch, số tiền theo tuitionTotals) + row click từ /tuition và hồ sơ học viên. Red-team 10 findings (1C: routes-matcher thiếu prefix /tuition/ → deep-link 404 prod) vá trước khi cook; review sau cook bắt 2 Important: baseline hole usePaidAmountWatch (heal bằng baselinePaidAmount) và poll transactions thiếu cap/isError gate. e2e mới 9 test + fix flake parallel: fake hub cấp xid tuần tự, specs hardcode ba-e2e-1 → đọc xid thật từ DB. Gates: check/check-types/web 1352/server 19/e2e 150 xanh."
---

# Ship #345 trang chi tiết hóa đơn /tuition/$invoiceId

PR #346 squash 7031f95 vào develop 2026-10-08. API GET /invoices/:id/transactions (org-scoped, matched-only, display fields) + trang detail đầy đủ (QR, link /pay, lịch sử giao dịch, số tiền theo tuitionTotals) + row click từ /tuition và hồ sơ học viên. Red-team 10 findings (1C: routes-matcher thiếu prefix /tuition/ → deep-link 404 prod) vá trước khi cook; review sau cook bắt 2 Important: baseline hole usePaidAmountWatch (heal bằng baselinePaidAmount) và poll transactions thiếu cap/isError gate. e2e mới 9 test + fix flake parallel: fake hub cấp xid tuần tự, specs hardcode ba-e2e-1 → đọc xid thật từ DB. Gates: check/check-types/web 1352/server 19/e2e 150 xanh.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
