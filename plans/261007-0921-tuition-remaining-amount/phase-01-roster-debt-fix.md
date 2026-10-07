---
title: "Phase 1: Sửa rosterDebtByStudent trừ paidAmount + roster 'còn X' + e2e strings"
status: todo
effort: "1h"
dependencies: []
---

# Phase 1: Sửa rosterDebtByStudent trừ paidAmount + roster "còn X" + e2e strings

## Overview

**Priority:** P2 · **Status:** todo

Sửa root cause của ví dụ user: `rosterDebtByStudent` cộng nguyên `inv.amount` cho hóa đơn chưa paid, bỏ qua ledger `paidAmount` (#320) — Student Test 1 đóng 2.000.000đ/10.000.000đ nhưng ô "Học phí" của tab Học viên hiện `10.000.000đ`. Sau phase này: outstanding = tổng `amount − min(paidAmount, amount)`, ô hiển thị `còn 8.000.000đ`, và e2e exact-match theo chuỗi mới.

## Context Links

- Helper cần sửa: [tuition-from-kernel.ts:88-120](../../apps/web/src/lib/tuition-from-kernel.ts) (`rosterDebtByStudent`; công thức đúng tham chiếu `tuitionTotals` L33)
- Render cần sửa: [class-roster-tab.tsx:35-69](../../apps/web/src/components/class-detail/class-roster-tab.tsx) (`RosterTuitionCell` — badge + `fmtVND(debt.outstanding)` trần)
- `Invoice.paidAmount`: [mock-data.ts:115](../../apps/web/src/lib/mock-data.ts) ("ledger-recomputed paid total; 0 on manually mark-paid rows")
- E2E exact-match: [class-roster-tuition-debt.spec.ts:117-154](../../apps/e2e/specs/class-roster-tuition-debt.spec.ts) (`rosterFee` = `getByText(text, { exact: true })`)
- Test hiện có: [tuition-from-kernel.test.ts](../../apps/web/src/lib/tuition-from-kernel.test.ts) (fixture `inv()` default `paidAmount: 0`, describe `rosterDebtByStudent` L160, case clamp L302-306), [class-roster-tab.test.tsx](../../apps/web/src/components/class-detail/class-roster-tab.test.tsx) (helper `debt()`)
- Token/màu: `DESIGN.md` (không hard-code lệch scale `packages/ui/src/styles/globals.css`)

## Key Insights

- `tuitionTotals` đã giải đúng bài toán partial: `received = Math.min(paidAmount, amount)` — clamp chống overpay âm. Copy convention này, kể cả comment "mark-paid manual rows keep paidAmount 0" (status `paid` không đi qua nhánh cộng outstanding).
- `RosterTuitionCell` đã tách nhãn `text-danger font-semibold` cho Quá hạn (L60-64) — giữ nguyên styling, chỉ thêm prefix `còn `.
- E2e spec dùng `exact: true` → `"400.000đ"` sẽ KHÔNG khớp `"còn 400.000đ"`: 3 assertion L131/138/151 phải sửa cùng commit render.
- Caller duy nhất của `rosterDebtByStudent` là [classes/$classId.tsx:165](../../apps/web/src/routes/_auth/classes/$classId.tsx) truyền full `data.invoices` — thêm `"paidAmount"` vào Pick không phá contract.

## Requirements

- [ ] Outstanding chỉ tính phần chưa thu: `inv.amount - Math.min(inv.paidAmount, inv.amount)` cho mỗi hóa đơn `effectiveInvoiceStatus !== "paid"`.
- [ ] Ô "Học phí" hiển thị `còn {fmtVND(debt.outstanding)}` khi chưa paid; chỉ badge khi paid hoặc `outstanding <= 0` (overpay clamp — tránh "còn 0đ").
- [ ] Unit test pin: partial, partial quá hạn, clamp overpay, partial + hóa đơn đủ cùng học viên.
- [ ] E2e roster spec pass với chuỗi `còn 400.000đ` / `còn 800.000đ`.

## Implementation Steps

1. **`apps/web/src/lib/tuition-from-kernel.ts`** — `rosterDebtByStudent`:
   - Signature: `invoices: Pick<Invoice, "eid" | "amount" | "paidAmount" | "status" | "due">[]`.
   - L110: `cur.outstanding += inv.amount;` → `cur.outstanding += inv.amount - Math.min(inv.paidAmount, inv.amount);`
   - JSDoc cập nhật: nêu convention partial #320 giống `tuitionTotals` (clamp `Math.min`, mark-paid thủ công do status quyết định).
   - JSDoc field `RosterDebt.outstanding` (L68-70) cập nhật theo semantic mới: "Sum of remaining (amount − min(paidAmount, amount)) of unpaid + overdue invoices; 0 possible on overpay clamp" — tránh consumer sau assumption `outstanding > 0 ⇔ chưa paid`.
2. **`apps/web/src/components/class-detail/class-roster-tab.tsx`** — `RosterTuitionCell`:
   - Điều kiện chỉ-badge: `if (debt.status === "paid" || debt.outstanding <= 0) return badge;`
   - Nhánh còn lại: `{badge}` + `<span className={cn("font-mono", debt.status === "overdue" && "font-semibold text-danger")}>{formatRemainingVND(debt.outstanding)}</span>` (giữ wrapper `flex items-center gap-2 whitespace-nowrap`; `formatRemainingVND` từ `format-invoice.ts` — xem phase-02 step 1 — để copy "còn Xđ" đơn nguồn, không hardcode lại template).
   - JSDoc component: ghi rõ "còn X" = số tiền chưa thu của enrollment trong lớp.
3. **`apps/web/src/lib/tuition-from-kernel.test.ts`** — thêm case vào describe `rosterDebtByStudent` (fixture module scope là `invoice()` tại test L39 — KHÔNG dùng `inv()`, fixture đó chỉ tồn tại describe-local trong describe `tuitionTotals` L268):
   - Partial: `invoice({ eid, amount: 10_000_000, paidAmount: 2_000_000, status: "unpaid" })` → `{ outstanding: 8_000_000, status: "unpaid", invoiceCount: 1 }` (thu nhỏ case ví dụ user; chú ý fixture `invoice()` default `amount: 1_000_000`, `eid: ""` — override đủ).
   - Partial quá hạn: `paidAmount: 2_000_000`, `due` quá khứ → `outstanding: 8_000_000, status: "overdue"`.
   - Clamp: `amount: 400_000, paidAmount: 500_000, status: "unpaid"` → `outstanding: 0` (status giữ "unpaid").
   - Mix: partial (10tr/2tr) + hóa đơn unpaid 1.000.000 (`paidAmount: 0`) → outstanding 9.000.000.
   - Composition overpay+partial cùng học viên: `[invoice({ amount: 400_000, paidAmount: 500_000, status: "unpaid" }), invoice({ amount: 1_000_000, paidAmount: 200_000, status: "unpaid" })]` → outstanding 800.000 (pin clamp per-invoice, không clamp trên tổng).
4. **`apps/web/src/components/class-detail/class-roster-tab.test.tsx`** — thêm case `RosterTuitionCell`:
   - `debt({ status: "unpaid", outstanding: 8_000_000 })` → markup chứa `còn 8.000.000đ`.
   - `debt({ status: "unpaid", outstanding: 0 })` → KHÔNG chứa "còn 0đ", có badge "Chưa thu".
   - Case Quá hạn hiện có → assert thêm "còn 800.000đ" kèm class `text-danger`.
5. **`apps/e2e/specs/class-roster-tuition-debt.spec.ts`**:
   - L131: `"400.000đ"` → `"còn 400.000đ"`.
   - L138: `"800.000đ"` → `"còn 800.000đ"`.
   - L151: `rosterFee(page, "800.000đ")` → `rosterFee(page, "còn 800.000đ")` (vẫn `toBeHidden` sau mark-paid).
   - Comment đầu spec (L7-8): "'Chưa thu' + amount" → "'Chưa thu' + 'còn <amount>'".

## Todo

- [ ] Fix `rosterDebtByStudent` (Pick + công thức + JSDoc)
- [ ] `RosterTuitionCell`: prefix `còn ` + edge outstanding ≤ 0
- [ ] Unit tests: 4 case helper + 3 case cell
- [ ] E2e spec: 3 assertion + comment
- [ ] `pnpm --filter web test` pass; e2e roster spec pass (port override 8100/8101/8103)

## Success Criteria

- Lớp ví dụ (`a4c3d7ab…`): Student Test 1 thấy `[Chưa thu] còn 8.000.000đ`; Vinh Tran chỉ `[Đã thu]`.
- `pnpm check-types` + `pnpm --filter web test` pass; `class-roster-tuition-debt.spec.ts` pass.

## Risk Assessment

- **Quên Pick `paidAmount`** → TS error ngay ở L110 (compile-time guard, không rò rỉ runtime).
- **E2e khác assert số tiền roster**: scout chỉ thấy spec này; full suite ở phase-02 là mạng an toàn.

## Security Considerations

- Thay đổi thuần render client từ dữ liệu kernel có sẵn; không thêm API, không lộ dữ liệu mới (số tiền remaining đã thuộc phạm vi dữ liệu trang).

## Next Steps

- Phase 2: nhãn `còn X` ở `/tuition` + hồ sơ học viên, CHANGELOG, gate cuối.
