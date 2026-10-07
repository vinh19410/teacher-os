---
title: "Phase 2: Nhãn 'còn X' ở /tuition và hồ sơ học viên + CHANGELOG + gate cuối"
status: todo
effort: "1h"
dependencies: [1]
---

# Phase 2: Nhãn "còn X" ở /tuition và hồ sơ học viên + CHANGELOG + gate cuối

## Overview

**Priority:** P2 · **Status:** todo

Mang nhãn `còn Xđ` sang 2 surface trạng thái học phí còn lại — bảng Hóa đơn của `/tuition` (badge "Thu một phần" đang đứng một mình) và tab Học phí của hồ sơ học viên (badge không kèm số) — rồi kết bằng CHANGELOG và bộ gate local theo AGENTS.md. Helper dùng chung `invoiceRemainingLabel` đặt trong `format-invoice.ts` (module nhãn/variant chung của #322) để 2 surface không lệch copy.

## Context Links

- Module helper chung: [format-invoice.ts](../../apps/web/src/lib/format-invoice.ts) (`INVOICE_STATUS_LABEL/VARIANT` — precedent "cùng nguồn để không lệch nhãn") + [format-invoice.test.ts](../../apps/web/src/lib/format-invoice.test.ts)
- `/tuition` cột Trạng thái: [tuition.tsx:221-241](../../apps/web/src/routes/_auth/tuition.tsx) (badge "Thu một phần" nhánh `i.paidAmount > 0`; precedent text "còn" tại `UnmatchedTransactions` L292)
- Hồ sơ học viên: [$studentId.tsx:280-303](../../apps/web/src/routes/_auth/students/$studentId.tsx) (tab `tuition`, badge theo `effectiveInvoiceStatus`)
- Pattern styling: `RosterTuitionCell` phase-01 (`font-mono`, Quá hạn → `font-semibold text-danger`)
- `CHANGELOG.md` (root) — nhật ký theo ngày, thêm entry mới không sửa entry cũ

## Key Insights

- Helper trả `null` khi: `status === "paid"`, `paidAmount <= 0` (cell Số tiền đã hiện đủ amount — nhãn thừa), hoặc remaining ≤ 0 sau clamp (overpay) — surface chỉ render khi non-null, không có "còn 0đ".
- `/tuition` cell Số tiền đã có `2.000.000 / 10.000.000` cho partial (L208-214) — giữ nguyên; nhãn `còn` chỉ thêm ở cột Trạng thái, cạnh badge.
- Hồ sơ học viên: badge đã dùng `INVOICE_STATUS_VARIANT/LABEL` — thêm span `còn Xđ` cạnh badge trong cùng cell, cùng pattern flex của roster.
- Không có route test render bảng hóa đơn `/tuition`/profile → helper thuần + unit test là lớp verify chính; e2e full suite là lớp hội tụ.

## Requirements

- [ ] `invoiceRemainingLabel`: pure, test đầy đủ 5 nhánh (paid / chưa thu gì / partial / partial quá hạn / clamp overpay).
- [ ] `/tuition` + hồ sơ: hóa đơn một phần hiện `còn {remaining}đ` cạnh badge; các trạng thái khác không đổi.
- [ ] Nhãn dùng `font-mono`; khi hóa đơn Quá hạn kèm `font-semibold text-danger` — nhất quán roster, token theo `DESIGN.md`.
- [ ] CHANGELOG entry mới dưới ngày chạy, nhóm `### Fixed` (bản chất: hiển thị sai số tiền còn lại khi đóng một phần).

## Implementation Steps

1. **`apps/web/src/lib/format-invoice.ts`** — thêm helper (import `fmtVND` từ `./mock-data` — module đã import type `InvoiceStatus` từ đó, không tạo cycle):
   ```ts
   export function formatRemainingVND(amount: number): string {
       return `còn ${fmtVND(amount)}`;
   }

   export function invoiceRemainingLabel(
       invoice: Pick<Invoice, "amount" | "paidAmount" | "status">,
   ): string | null {
       if (invoice.status === "paid") return null;
       const remaining = invoice.amount - Math.min(invoice.paidAmount, invoice.amount);
       return invoice.paidAmount > 0 && remaining > 0
           ? formatRemainingVND(remaining)
           : null;
   }
   ```
   `formatRemainingVND` là nguồn duy nhất của prefix `còn ` + format VND — roster (aggregate, phase-01) và helper per-invoice đều gọi nó để không lệch copy. JSDoc: nguồn #320/#340, convention clamp `tuitionTotals`, lý do bỏ nhánh `paidAmount <= 0`.
2. **`apps/web/src/lib/format-invoice.test.ts`** — 5 case: `{paid, 10tr, 0}` → null; `{unpaid, 10tr, 0}` → null; `{unpaid, 10tr, 2tr}` → `"còn 8.000.000đ"`; `{overdue, 10tr, 2tr}` → `"còn 8.000.000đ"`; `{unpaid, 4tr, 5tr}` → null (clamp). Thêm 1 case `formatRemainingVND(8_000_000)` → `"còn 8.000.000đ"` pin copy dùng chung.
3. **`apps/web/src/routes/_auth/tuition.tsx`** — nhánh badge "Thu một phần" (L229-241): bọc `flex items-center gap-2 whitespace-nowrap`, giữ `<Badge variant="warn" dot>Thu một phần</Badge>`, thêm `<span className={cn("font-mono", status === "overdue" && "font-semibold text-danger")}>{invoiceRemainingLabel(i)}</span>` (chỉ render khi non-null — helper đã tự chặn overpay; `status` từ `effectiveInvoiceStatus` tại L198 đã có sẵn trong scope — nhãn đỏ khi hóa đơn quá hạn dù badge là "Thu một phần", nhất quán styling nhãn với roster + hồ sơ). Nhánh status `paid` và `paidAmount === 0` giữ nguyên.
4. **`apps/web/src/routes/_auth/students/$studentId.tsx`** — cell Trạng thái (L292-299): khi `invoiceRemainingLabel(inv)` non-null, bọc badge + `<span className={cn("font-mono", status === "overdue" && "font-semibold text-danger")}>{label}</span>` trong `flex items-center gap-2 whitespace-nowrap`; ngược lại giữ badge trần như hiện tại.
5. **`CHANGELOG.md`** — entry mới dưới `## <ngày chạy>` nhóm `### Fixed`:
   `- Trạng thái học phí hiển thị đúng số tiền còn lại khi hóa đơn được thanh toán một phần: tab Học viên trong lớp, /tuition và hồ sơ học viên kèm nhãn "còn Xđ" cạnh badge (#340)`
6. **Verify UI 3 viewport** (1440×900, 768×1024, 375×812) trên class-detail tab Học viên, `/tuition`, hồ sơ học viên: nhãn không tràn cột, token theo `DESIGN.md`, focus/keyboard không đổi (chỉ thêm span tĩnh) theo `REVIEW.md`; screenshot kèm PR.
7. **Gate cuối theo AGENTS.md (tuần tự):**
   ```sh
   pnpm check
   pnpm check-types
   pnpm --filter web test
   pnpm --filter e2e e2e   # full suite — PR vào develop không có CI checks
   ```
   (E2e chạy với override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103`.)

## Todo

- [ ] Helper `invoiceRemainingLabel` + JSDoc
- [ ] 5 unit case format-invoice
- [ ] `/tuition` render nhãn cạnh badge "Thu một phần"
- [ ] Hồ sơ học viên render nhãn cạnh badge trạng thái
- [ ] CHANGELOG entry `### Fixed`
- [ ] Screenshot 3 viewport (3 surface)
- [ ] Gate cuối pass đủ 4 lệnh, gồm full e2e suite

## Success Criteria

- `/tuition`: hóa đơn một phần `[Thu một phần] còn 8.000.000đ`; chưa-thu-gì và đã-thu không có nhãn thừa.
- Hồ sơ học viên: hóa đơn một phần hiện badge + `còn 8.000.000đ` (Quá hạn → `text-danger`).
- CHANGELOG có entry `### Fixed` kèm số issue; gate 4 lệnh pass.

## Risk Assessment

- **Helper lệch copy giữa surface** — copy "còn Xđ" đơn nguồn qua `formatRemainingVND` + test pin chuỗi `"còn 8.000.000đ"`; roster gọi cùng helper format (aggregate) nên phase-01 pin chuỗi ở cell test.
- **E2e specs đụng chuỗi tiền trên /tuition — 3 spec, không spec nào vỡ** (red-team trace từng assertion): (1) `class-roster-tuition-debt.spec.ts` — exact-match tiền roster, đã cập nhật strings trong phase-01; (2) `tuition-bank-transfer.spec.ts` (L267/273/340/350) — locator `hasText` substring + cell Số tiền (`2.000.000 / 10.000.000`) giữ nguyên + modal/pay non-goal nên không vỡ (nhãn `còn X` không chứa substring số tiền trần); (3) `create-invoice.spec.ts` (L143/150/155) — assert badge "Chưa thu" không đổi.
- **Full e2e suite đỏ do nguyên nhân ngoài** (flaky): retry theo playbook repo; nếu fail từ spec khác đụng text tiền, cập nhật trong PR này kèm lý do.
- **Viewport hẹp (375px)**: nhãn `còn Xđ` cạnh badge dùng `whitespace-nowrap` như roster (đã chạy sạch ở 375px) — verify bằng mắt theo checklist REVIEW.md.
- **Overpay (ngoài scope, follow-up)**: `UnmatchedTransactions` (tuition.tsx L292) trừ thô `amount - paidAmount` không clamp → overpay hiện "còn -Xđ"; /tuition hiện badge "Thu một phần" + số tiền trần không tín hiệu đối soát. Pre-existing, Non-Goals chặn — ghi follow-up issue riêng.

## Security Considerations

- Không thêm query/mutation mới; nhãn derive từ `Invoice` đã render trên trang. CHANGELOG không chứa secret/env.

## Next Steps

- PR vào `develop` (gate là bộ lệnh local — CI/E2E chỉ trigger target `main`); issue giữ OPEN chờ ship, kèm screenshot 3 viewport.
