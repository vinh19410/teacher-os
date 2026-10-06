---
title: "Implement #322 roster tuition status badges"
date: 2026-10-05
summary: "TDD per plan 261005-0844: effectiveInvoiceStatus + RosterDebt.status + shared label/variant maps; RosterTuitionCell replaces the old IIFE fee cell; /tuition + student profile share the helper; e2e dues now relative (VN today). All gates green; 3-viewport screenshots captured."
---

# Implement #322 roster tuition status badges

## Vibes run — issue #322 (feature route, ship beta)

- Worktree: teacher-os-class-roster-tuition-status (feat/class-roster-tuition-status, base develop)
- Plan gates: ak plan validate OK; red-team inline trong plan (3 findings, đã disposition)
- Phase 1 (helper): effectiveInvoiceStatus suy ra overdue từ due (so chuỗi ISO, giờ VN, hạn đúng hôm nay vẫn unpaid); rosterDebtByStudent thêm todayISO + status tổng hợp; INVOICE_STATUS_LABEL/VARIANT trong format-invoice.
- Phase 2 (UI): RosterTuitionCell (invited — / Chưa lập phiếu / Đã thu / Chưa thu + tiền / Quá hạn + tiền đỏ); $classId truyền todayISOVietnam(); /tuition + $studentId bỏ map cục bộ dùng chung helper.
- Tests: unit 22 ca tuition-from-kernel + map format-invoice; component 5 ca RosterTuitionCell; e2e lifecycle đổi hạn tương đối (isoInDaysFromTodayVN) — 5/5 pass; full web suite 1235 pass; check + check-types sạch.
- Screenshot 3 viewport trong plans/261005-0844-class-roster-tuition-status/screenshots/ (spec tạm đã xóa).
- Simplify gate: code-simplifier gộp isValidDue + dedupe badge JSX; re-verify xanh.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
