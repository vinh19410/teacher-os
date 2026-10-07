---
title: "Plan: trạng thái học phí hiển thị số còn lại — bug rosterDebtByStudent bỏ qua paidAmount"
date: 2026-10-07
summary: "ak:plan #340: rosterDebtByStudent cộng nguyên inv.amount bỏ qua ledger paidAmount (#320) — sửa công thức amount−min(paidAmount,amount) + nhãn 'còn Xđ' 3 surface"
---

# Plan: trạng thái học phí hiển thị số còn lại — bug rosterDebtByStudent bỏ qua paidAmount

## What happened

`ak:plan --github` cho yêu cầu "trạng thái học phí hiển thị số tiền còn lại nếu chưa đóng đủ" (ví dụ lớp `a4c3d7ab-0fec-4726-aa50-0b672061db89`: Student Test 1 đóng 2.000.000đ/10.000.000đ, Vinh Tran đủ). Scout phát hiện đây là **bug tính toán** chứ không chỉ thiếu hiển thị:

- `rosterDebtByStudent` (`apps/web/src/lib/tuition-from-kernel.ts:110`) cộng nguyên `inv.amount` cho hóa đơn chưa paid — **bỏ qua `paidAmount`** (ledger partial từ #320). Pick type thậm chí không có `"paidAmount"`.
- `tuitionTotals` (cùng file, L33) đã đúng: `amount − Math.min(paidAmount, amount)`.
- 2 surface khác cũng thiếu remaining tường minh: `/tuition` (cell có `2.000.000 / 10.000.000`, badge "Thu một phần" không kèm số) và hồ sơ học viên (chỉ `fmtVND(amount)`).

Plan 2 phase tại `plans/261007-0921-tuition-remaining-amount/`, issue #340 (label `ready to review`): Phase 1 = fix helper + `RosterTuitionCell` hiển thị `còn Xđ` + unit tests + e2e exact-match strings; Phase 2 = helper `invoiceRemainingLabel` (format-invoice.ts) + `/tuition` + hồ sơ học viên + CHANGELOG + gate.

## Decision

1. **Sửa helper, không đụng server** — `paidAmount` đã có trên wire từ #320; thuần render client.
2. **Nhãn `còn Xđ` thống nhất, helper dùng chung** `invoiceRemainingLabel` trả null khi paid / `paidAmount <= 0` (cell Số tiền đã hiện đủ amount, nhãn thừa) / remaining ≤ 0 sau clamp (overpay → tránh "còn 0đ").
3. **Badge không đổi** ở cả 3 surface — chỉ thêm text cạnh badge (pattern flex + `font-mono` + `text-danger` khi Quá hạn của `RosterTuitionCell`).
4. **E2e exact-match phải đi cùng commit render**: `class-roster-tuition-debt.spec.ts` dùng `getByText({ exact: true })` với `"400.000đ"`/`"800.000đ"` (L131/138/151) — thêm prefix `còn ` làm 3 assertion này fail nếu không sửa cùng lúc.
5. **Không thêm e2e partial-payment**: cần fake transaction ingest qua `/dev/bank-hub/mock-transaction` (auth IPN key + content matching) trong khi unit test phủ đủ math+render — ghi Non-Goals, follow-up riêng.

## Next steps

- `/ak:cook plans/261007-0921-tuition-remaining-amount/plan.md`
- Gate: `pnpm check` → `pnpm check-types` → `pnpm --filter web test` → `pnpm --filter e2e e2e` (PR vào develop không có CI).
- Files plan/journal chưa commit (chưa được yêu cầu).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
