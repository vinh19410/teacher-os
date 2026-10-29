---
title: Ship TOS-15 Sổ công nợ học viên — 3 thẻ KPI và lọc theo trạng thái nợ trên URL
date: 2026-10-26
summary: "Ship issue #449: view-model thuần debtLedger, màn /debts với 3 thẻ KPI, chip trạng thái + tìm kiếm debounce 300ms + lọc lớp trên URL, E2E AC-001; PR vào develop (beta)"
---

# Ship TOS-15 Sổ công nợ học viên — 3 thẻ KPI và lọc theo trạng thái nợ trên URL

## What happened
Chạy `ak-vibe --ship --beta --advice` cho issue #449 theo plan `plans/261026-2038-tos-15-debt-ledger-kpi-filters/` trên worktree `ai-handle-issue-449`. Hoàn tất cả 3 phase (view-model thuần `debtLedger`, route `/debts` + điều hướng sidebar/breadcrumb/routes-matcher, và E2E AC-001 kèm screenshot 3 viewport).

## Decision
- Red-team 3 reviewer song song (Security Adversary, Assumption Destroyer, Failure Mode Analyst — 30 claims): chốt 8 accepted findings và từ chối 2 đề xuất ngoài phạm vi (guard `beforeLoad` của TOS-17 #451 và đổi đích thẻ nhắc việc `/dashboard` của TOS-6 #439).
- Xác định hóa đơn còn nợ (`openInvoices`) theo `invoiceRemaining(inv) = Math.max(0, amount - invoiceReceived(inv)) > 0` để loại trừ hóa đơn overpay-clamped (`#340`) khỏi `openInvoiceIds` và tránh đẩy nhầm học viên `remaining = 0` sang `overdue`.
- Chốt 4 nhãn badge trên dòng học viên (`"Quá hạn"`, `"Sắp đến hạn"`, `"Còn nợ"`, `"Đã thu đủ"`) để khớp 100% với AC-002 của TOS-16 (#450); sort `openInvoiceIds` ưu tiên `isValidDue` tăng dần để `openInvoiceIds[0]` luôn là khoản có hạn đóng sớm nhất.
- Đồng bộ 2 chiều giữa ô tìm kiếm (`debounce 300ms`, `replace: true`) và URL search params (`?status=&q=&lop=`), flush ngay `query` khi người dùng bấm chip hoặc đổi lớp để chống race condition.

## Verification
- Unit & Component test: `tuition-from-kernel.test.ts` (64 tests), `list-page-filters.test.ts` (5 tests), `debts/index.test.tsx` (7 tests), `sidebar.test.tsx` (15 tests), `routes-matcher.test.ts` (57 tests) — tổng 146 file / 1527 tests của `apps/web` đều xanh.
- Gate toàn repo: `pnpm check` (0 errors), `pnpm check-types` (8/8 pass), `pnpm test` (10/10 pass + ci-workflow + topology-drift + devserver-watchdog), `pnpm build` (5/5 pass).
- E2E `apps/e2e/specs/debt-ledger-filters.spec.ts` xanh (5.0s), đo thời gian lọc chip ≤ 2000ms ởทั้ง desktop và mobile, chụp screenshot 3 viewport (`1440×900`, `768×1024`, `375×812`) tại `plans/261026-2038-tos-15-debt-ledger-kpi-filters/screenshots/`.

## Open
- Cột `"Thao tác"` và vùng action trên `PageHead` của `/debts` đã chừa sẵn slot (kèm `stopPropagation` cho `onClick` và `onKeyDown` Enter/Space) để TOS-16 (#450) gắn nút `Thu` và TOS-18 (#452) gắn nút `(eye)` / `"Gửi nhắc học phí (N)"`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
