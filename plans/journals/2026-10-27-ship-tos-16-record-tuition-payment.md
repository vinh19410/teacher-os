---
title: Ship TOS-16 Ghi nhận thu học phí một phần/toàn bộ trên Sổ công nợ
date: 2026-10-27
summary: "Ship issue #450: hộp thoại Ghi nhận thu tiền học phí trên /debts, phiếu thu thủ công 1 dòng ledger payment_transaction (provider manual) idempotent theo clientRequestId, guard nguyên tử chống vượt nợ, recompute methodHint, E2E AC-002; PR vào develop (beta)"
---

# Ship TOS-16 Ghi nhận thu học phí một phần/toàn bộ

## What happened
Chạy `ak-vibe --ship --beta --advice` cho issue #450 theo plan `plans/261026-2038-tos-16-record-tuition-payment/` trên worktree `ai-handle-issue-450`. Hoàn tất cả 3 phase: migration `0049` (2 cột `method`/`recorded_by` additive, sinh lại sau khi 0048 bị PR #459 chiếm — merge develop, không rebase), route `POST /api/invoices/:id/payments` + helper `recordManualPayment`, hộp thoại Ghi nhận thu tiền trên `/debts`, cột Phương thức ở chi tiết hóa đơn, và E2E AC-002 (2 dòng Examples) kèm screenshot 3 viewport.

## Decision
- Red-team 3 reviewer song song (Security Adversary, Failure Mode Analyst, Assumption Destroyer — 25 raw → 14 unique findings): 11 accepted, 3 rejected có rationale trong `## Red Team Review`. Accepted lớn nhất: guard nguyên tử `status <> 'paid'` + `amount ≤ amount − SUM(matched)` đưa vào WHERE của chính INSERT…SELECT (chặn TOCTOU với `mark-paid` ghi status không ghi ledger), idempotency `clientRequestId` làm `provider_txn_id` (tái dùng UNIQUE sẵn có), `recomputeInvoiceStatement` nhận `methodHint` (thu đủ Tiền mặt không bị đóng dấu "Chuyển khoản"), seed E2E due +10 ngày (tránh cửa sổ `due_soon` +7).
- 2 điều kiện kongming sau plan gates: AC race viết tất định tuần tự (mark-paid trước → 422 `invoice-settled`); tra phiếu cũ scoped `orgId + invoiceId + amount`, lệch → 409 trống (chống IDOR do unique index toàn cục).
- DTO `/invoices/:id/transactions` chỉ thêm `method` dạng nhãn hiển thị — không expose `provider` enum, giữ nguyên bất biến #345 "display fields only" (advisory pass giữa implement).
- Hộp thoại: reconcile **trước**, setError **sau** (reconcile xóa error); 422 `invoice-settled`/`amount-exceeds-debt` giữ hộp thoại mở với alert đọc được; 409 sinh `clientRequestId` mới (key cũ đã burn); committed/unknown chặn replay mù qua `useKernelFormSubmit`.
- Host không pin được Fable/Astra cho `--advice` — các checkpoint kongming (plan gates, trước ship) là same-model counsel.

## Verification
- Server: 952/952 test trên HEAD đã merge develop (13 test mới — partial/settle/`invoice.method = "Tiền mặt"`/replay 200/409 không payload/overpay 422 kèm remaining/fixture `invoice_paid` không tính vào guard/mark-paid tuần tự/concurrent 2 request đúng 1 thành công/404 org khác/400×7/transactions nhãn method/regression transfer giữ "Chuyển khoản").
- Web: 1627/1627 test (12 test modal + contract `kernel-form-contract`: đóng sau refreshed, giữ open khi 422, chặn replay mù, bỏ qua Escape khi đang lưu).
- `pnpm check-types` pass; `pnpm check` còn 19 diagnostic pre-existing của develop (#459 trở về trước: vocab.test.ts, part-form.tsx, github-webhooks.ts…) — không file nào của diff TOS-16.
- E2E `apps/e2e/specs/debt-record-payment.spec.ts` xanh (4.1s); full Playwright 210 pass / 1 fail pre-existing (`schedule-views-and-events` — reproduce trên develop sạch bằng stash, ngoài scope `/debts`) / 1 skipped; screenshot 3 viewport tại `plans/261026-2038-tos-16-record-tuition-payment/screenshots/`.

## Open
- Ba Minor từ review đã chấp nhận: uuid trùng cross-org (xác suất ~0) trả 422/409 thay vì thành công; `readInvoice` sau batch có thể trả 201 stale nhẹ (client tự refetch); guard vai trò tài chính chờ TOS-17 `requireFinanceRole` cho cả họ route `/api/invoices*`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
