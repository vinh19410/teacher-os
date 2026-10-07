---
title: "Trạng thái học phí hiển thị số tiền còn lại khi chưa đóng đủ"
description: "Sửa rosterDebtByStudent bỏ qua paidAmount (đóng một phần vẫn hiện đủ số tiền gốc) và hiển thị nhãn 'còn Xđ' thống nhất ở tab Học viên, /tuition và hồ sơ học viên."
status: completed
priority: P2
effort: "2h"
issue: 340
branch: develop
tags: [frontend, fix, tuition]
blockedBy: []
blocks: []
created: 2026-10-07
---

# Trạng thái học phí hiển thị số tiền còn lại khi chưa đóng đủ

## Overview

Yêu cầu: trạng thái học phí phải cho thấy **số tiền còn lại** khi học viên chưa đóng đủ. Ví dụ thực tế: lớp `a4c3d7ab-0fec-4726-aa50-0b672061db89` có Student Test 1 đóng 2.000.000đ/10.000.000đ (phải thấy **còn 8.000.000đ**) và Vinh Tran đã đóng đủ (chỉ badge "Đã thu").

Scout thấy root cause là **bug tính toán**, không chỉ thiếu hiển thị: `rosterDebtByStudent` ([tuition-from-kernel.ts:110](../../apps/web/src/lib/tuition-from-kernel.ts)) cộng nguyên `inv.amount` cho mọi hóa đơn chưa paid — **bỏ qua `paidAmount`** (ledger thu một phần từ #320) — nên ô "Học phí" của tab Học viên hiện `10.000.000đ` thay vì `8.000.000đ`. Trong khi đó `tuitionTotals` (cùng file, L33) đã đúng công thức `amount − Math.min(paidAmount, amount)`.

Ngoài roster, 2 surface trạng thái học phí khác cũng chưa cho thấy số còn lại tường minh: `/tuition` (cell Số tiền có `2.000.000 / 10.000.000` nhưng badge "Thu một phần" không kèm số còn lại) và hồ sơ học viên tab Học phí (chỉ hiện `fmtVND(amount)` + badge, không thấy paid lẫn remaining). Plan này sửa helper, thêm nhãn `còn Xđ` thống nhất cả 3 surface, cập nhật unit test + e2e exact-match.

```text
TAB HỌC VIÊN (lớp)          TRƯỚC                      SAU
Student Test 1   Học phí:  [Chưa thu] 10.000.000đ  →  [Chưa thu] còn 8.000.000đ
Vinh Tran        Học phí:  [Đã thu]                →  [Đã thu]                 (giữ nguyên)

/TUITION — cột Trạng thái   [Thu một phần]            →  [Thu một phần] còn 8.000.000đ
HỒ SƠ HỌC VIÊN              [Chưa thu]                →  [Chưa thu] còn 8.000.000đ
```

## Key Decisions

1. **Sửa công thức trong `rosterDebtByStudent`, không đụng server.** `paidAmount` đã có sẵn trên `Invoice` (mock-data.ts:115, "ledger-recomputed paid total; 0 on manually mark-paid rows") từ #320; Pick type thêm `"paidAmount"` và `outstanding += inv.amount - Math.min(inv.paidAmount, inv.amount)` — cùng convention clamp với `tuitionTotals` (L33) và test clamp có sẵn (tuition-from-kernel.test.ts L302-306). Mark-paid thủ công (`paidAmount: 0`, status `paid`) giữ nguyên nhánh status-decides như comment L26-29.
2. **Nhãn `còn Xđ` là chỉ báo partial thống nhất, helper dùng chung.** `invoiceRemainingLabel()` mới trong `format-invoice.ts` (module đã là nguồn nhãn/variant chung #322) trả `còn {fmtVND(remaining)}` (qua `formatRemainingVND` — copy đơn nguồn) hoặc `null` khi: `status === "paid"`, `paidAmount <= 0` (chưa thu gì — cell Số tiền đã hiện đủ amount, thêm nhãn là thừa), hoặc remaining ≤ 0 sau clamp (overpay, ledger chưa reconcile → tránh "còn 0đ"). **Hai rule hiển thị có chủ ý** (không phải lệch copy): roster luôn hiện `còn X` khi chưa paid kể cả `paidAmount === 0` vì ô roster KHÔNG có cột Số tiền riêng (nhãn là chỗ duy nhất thấy số); `/tuition` + hồ sơ chỉ hiện khi partial vì cell Số tiền đã có amount — e2e roster pin hành vi unpaid-in-full `"còn 400.000đ"` (spec L131), đừng "unify" roster qua helper per-invoice. Roster dùng aggregate `debt.outstanding` (đã fix) — nguồn dữ liệu khác nên không qua `invoiceRemainingLabel`, chỉ dùng chung `formatRemainingVND`.
3. **Badge không đổi ở cả 3 surface.** Roster + hồ sơ giữ badge theo `effectiveInvoiceStatus` (Chưa thu/Quá hạn); `/tuition` giữ badge "Thu một phần" có sẵn. Chỉ thêm text `còn Xđ` cạnh badge (flex gap-2, `font-mono`, `text-danger font-semibold` khi Quá hạn — đúng pattern hiện có của `RosterTuitionCell` L60-64). Token theo `DESIGN.md`, không hard-code giá trị lệch scale.
4. **E2E exact-match phải đi cùng thay đổi render.** `class-roster-tuition-debt.spec.ts` assert `getByText(text, { exact: true })` với `"400.000đ"`/`"800.000đ"` (L131/138/151) — sau khi thêm prefix `còn `, 3 assertion này fail. Cập nhật trong cùng phase với thay đổi render để suite không đỏ.

## Non-Goals

- Không đổi API/server — `paidAmount` đã có trên wire; đây là thay đổi tính toán render client (`apps/web`).
- Không thêm badge "Thu một phần" vào roster/hồ sơ học viên (chỉ `/tuition` có badge đó từ trước); không đổi nhãn/variant badge nào.
- Không đổi cell Số tiền ở hồ sơ học viên sang `paid / total` (giữ `fmtVND(amount)` — số còn lại nằm ở cột Trạng thái).
- Không đổi `tuitionTotals` (KPI đã đúng partial), `UnmatchedTransactions` (đã có "còn X"), `InvoicePaymentModal` (QR-only).
- Không thêm e2e scenario partial-payment: cần fake transaction ingest qua wrapper `/dev/bank-hub/mock-transaction` (auth IPN key + content matching — playbook Postman #320) trong khi unit test đã phủ đủ math + render; follow-up riêng nếu cần.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Sửa rosterDebtByStudent trừ paidAmount + roster "còn X" + e2e strings](./phase-01-roster-debt-fix.md) | Pending |
| 2 | [Nhãn "còn X" ở /tuition và hồ sơ học viên + CHANGELOG + gate cuối](./phase-02-tuition-profile-consistency.md) | Pending |

Chạy tuần tự 1 → 2. Phase 2 chỉ chạy khi Phase 1 pass unit test (`pnpm --filter web test`) và e2e roster spec.

## Success Criteria

- [ ] Roster tab Học viên: Student Test 1 (hóa đơn 10.000.000đ, paid 2.000.000đ) hiện `[Chưa thu] còn 8.000.000đ`; học viên đã đóng đủ chỉ badge "Đã thu" (không có số). Unit test pin cả partial, partial quá hạn, clamp overpay, multi-invoice.
- [ ] `/tuition`: hóa đơn một phần hiện `[Thu một phần] còn 8.000.000đ`; hóa đơn chưa thu gì / đã thu không có nhãn thừa.
- [ ] Hồ sơ học viên tab Học phí: hóa đơn một phần hiện badge trạng thái + `còn Xđ` cạnh.
- [ ] `apps/e2e/specs/class-roster-tuition-debt.spec.ts` pass với chuỗi `còn 400.000đ` / `còn 800.000đ` mới.
- [ ] Gate theo AGENTS.md: `pnpm check` → `pnpm check-types` → `pnpm --filter web test` → `pnpm --filter e2e e2e` (full suite — PR vào develop không có CI).
- [ ] CHANGELOG entry mới (nhóm `### Fixed`), UI verify 3 viewport theo REVIEW.md, screenshot kèm PR.

## Risk

- **Overpay (paidAmount > amount, status chưa paid)**: ledger chưa reconcile — hiển thị badge không số thay vì "còn 0đ" (clamp đã có convention test L302-306). Không tự đánh dấu paid.
- **Học viên nhiều hóa đơn một phần**: outstanding là tổng remaining các hóa đơn chưa paid của enrollment trong lớp — nhãn "còn X" vẫn đúng tổng; không liệt kê theo hóa đơn (out of scope).
- **E2E khác assert số tiền?** Ba spec đụng chuỗi tiền (red-team audit): `class-roster-tuition-debt.spec.ts` (exact-match roster — cập nhật trong phase-01), `tuition-bank-transfer.spec.ts` (L267/273/340/350 — locator `hasText` substring + cell Số tiền giữ nguyên + modal/pay non-goal nên không vỡ), `create-invoice.spec.ts` (assert badge "Chưa thu", không đổi). Full e2e suite ở gate là mạng an toàn cuối.

## Red Team Review

### Session — 2026-10-07
**Findings:** 7 sau dedupe (2 reviewer: Security Adversary + Assumption Destroyer) — 6 accepted, 1 rejected
**Severity breakdown:** 0 Critical, 1 High, 6 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Phase 2 tự mâu thuẫn: `/tuition` thiếu class `text-danger` cho Quá hạn (badge "Thu một phần" luôn chiếm slot trạng thái với hóa đơn partial) | High | Accept | Phase 2 step 3 |
| 2 | Overpay: `UnmatchedTransactions` trừ thô ra số âm + /tuition thiếu tín hiệu đối soát | Medium | Reject (pre-existing, Non-Goals chặn; ghi follow-up ở Risk) | Phase 2 Risk |
| 3 | JSDoc `RosterDebt.outstanding` không cập nhật theo semantic mới | Medium | Accept | Phase 1 step 1 |
| 4 | Roster hardcode `còn {fmtVND(...)}` — copy 2 nguồn, drift không gate bắt | Medium | Accept | Phase 1 step 2 + Phase 2 step 1 (`formatRemainingVND`) |
| 5 | Thiếu unit case composition overpay+partial (clamp per-invoice vs clamp-on-total) | Medium | Accept | Phase 1 step 3 |
| 6 | Plan chỉ fixture `inv()` nhưng describe `rosterDebtByStudent` dùng fixture `invoice()` (module scope) — dán nguyên văn là compile error | Medium | Accept | Phase 1 step 3 |
| 7 | Claim "chỉ roster spec assert tiền" sai — `tuition-bank-transfer.spec.ts` cũng assert (trace: không vỡ) | Medium | Accept | plan.md Risk + Phase 2 Risk |
| 8 | "Thống nhất" mâu thuẫn: roster hiện nhãn cả unpaid-in-full, /tuition+profile không | Medium | Accept (doc) | plan.md Key Decision 2 |

**Fact-check kèm theo:** mọi line ref load-bearing của plan khớp codebase (±0-3 dòng); caller duy nhất `rosterDebtByStudent` là `$classId.tsx:165`; không cycle import `format-invoice` → `mock-data`; student portal + `/pay` + InvoicePaymentModal đã có sẵn số còn lại (enum 3 surface đủ).

### Whole-Plan Consistency Sweep

- Decision delta: thêm `formatRemainingVND` (copy đơn nguồn) → đồng bộ phase-01 step 2, phase-02 step 1/2, Key Decision 2. Fixture `invoice()` → đồng bộ phase-01 step 3 + Context Links. Rule 2 nhãn → Key Decision 2 + Success Criteria /tuition ("chưa thu gì không nhãn" giữ đúng cho /tuition+profile; roster vẫn hiện — không mâu thuẫn vì khác surface rule có chủ ý).
- Sửa typo `#341` → `#340` (issue #341 không tồn tại).
- Tìmterm cũ: `inv({` (phase-01) đã thay `invoice({`; `còn {fmtVND(` (phase-01) đã thay `formatRemainingVND(`. Không còn claim "scout chỉ thấy 1 spec".
- Không còn contradiction chưa giải.
