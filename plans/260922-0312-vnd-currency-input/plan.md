---
title: "Input tiền hiển thị format VNĐ có dấu phân cách ngay khi gõ"
description: "Toàn bộ input tiền/phí dùng CurrencyInput chung: chỉ nhận chữ số, tự nhóm hàng nghìn (1,000,000) ngay lúc typing; parse/validate chung, cập nhật 4 modal + settings và e2e."
status: pending
priority: P2
effort: 5h
issue: 230
branch: vinh19410/feat/vnd-currency-input
tags: [feature, frontend]
blockedBy: []
blocks: []
created: 2026-09-22
---

# Input tiền format VNĐ khi gõ (1,000,000)

## Overview

Mọi input liên quan đến tiền/phí hiển thị **nhóm hàng nghìn bằng dấu phẩy ngay lúc gõ** — gõ `1000000` thấy `1,000,000`. Hiện 5 vị trí input tiền đang là `<Input type="number">` thô hoặc text tự do: `edit-class-fee-modal.tsx`, `add-class-modal.tsx` (Học phí), `add-invoice-modal.tsx` (Số tiền), `add-student-modal.tsx` (Đơn giá), `settings.tsx` (Đơn giá mặc định). Giải pháp: 1 util `format-currency.ts` + 1 component `CurrencyInput` (thuần chữ số + `inputMode="numeric"`), thay vào cả 5 vị trí, đổi parse phía submit từ regex `/^\d{1,12}$/` sang `parseVndAmount` (strip non-digits). **DB/wire không đổi** — vẫn số nguyên VND (`.int().min(1)`), chỉ lớp hiển thị/nhập thay đổi.

Quy ước phân cách: dấu **phẩy** (`1,000,000`) theo đúng yêu cầu người dùng. Lưu ý chấp nhận: phía hiển thị `fmtVND` (`mock-data.ts:241`) vẫn dùng `vi-VN` (`1.000.000đ`) — hai dạng cùng tồn tại; thống nhất lại là follow-up nếu muốn.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Gõ số tiền thấy phân cách hàng nghìn ngay khi typing, chỉ gõ được chữ số | P1 |
| 2 | 5 vị trí input tiền dùng chung 1 component + 1 hàm parse (bỏ 3 bản copy `AMOUNT_RE`) | P1 |
| 3 | Không đổi contract/server/DB; thông báo lỗi giữ nguyên; settings vẫn lưu string | P1 |
| 4 | Unit test util + cập nhật e2e bị ảnh hưởng; toàn bộ gate xanh | P1 |

## Phạm vi

**Trong scope:** `format-currency.ts`, `CurrencyInput`, 4 modal tiền, field settings, `settings.test.tsx`, e2e specs liên quan (đổi assertion giá trị/format), unit test mới.

**Out of scope:** format hiển thị `fmtVND` (dots vi-VN) và các bảng/card tiền; contract/API/DB; field không phải tiền (`Tổng số buổi`, `Số buổi gói`, số buổi vắng); caret preservation khi sửa giữa chuỗi (trade-off chấp nhận, xem phase 01).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Nền tảng: util format + CurrencyInput](./phase-01-start.md) | Pending |
| 2 | [Áp dụng vào 5 vị trí input tiền](./phase-02-apply-to-money-inputs.md) | Pending |
| 3 | [Cập nhật e2e + gates toàn diện](./phase-03-e2e-updates-and-gates.md) | Pending |

## Success Criteria

- [ ] Gõ `1000000` vào bất kỳ input tiền nào → hiển thị `1,000,000`; dán `1.000.000đ` → `1,000,000`; gõ `-500` → input rỗng (mask strip)
- [ ] Submit vẫn gửi đúng số nguyên VND; lỗi 0 / rỗng / >12 chữ số giữ nguyên thông báo cũ (trừ 2 case âm đổi hành vi — đã liệt kê ở phase 03)
- [ ] Settings vẫn lưu string qua contract `z.string().min(1)` — không đổi API
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter web test`, e2e specs tiền — exit 0

## Dependencies

- Không phụ thuộc plan nào (rà `plans/`: plan #227 class-tuition-fee đã completed — modal fee của nó nằm trong phạm vi thay đổi nhưng đã merge ổn định; không plan nào khác đang đụng 5 file này).
- Tuân thủ `docs/code-standards.md`: pure frontend (persist-vs-derive không đụng); test colocated `*.test.ts` theo vitest node environment (pattern `renderToStaticMarkup`).

## Validation Log

### Verification Results (2026-09-22, autonomous)

- Claims checked: 26 | Verified: 25 | Failed: 0 | Unverified: 0 (1 claim của scout sửa path rồi verify lại)
- Tier: Standard (3 phases → Fact Checker + Contract Verifier)
- Đối chiếu trực tiếp (read/sed/grep): 3 bản copy `AMOUNT_RE /^\d{1,12}$/` = `add-invoice-modal.tsx:12`, `add-class-modal.tsx:33`, `edit-class-fee-modal.tsx:9` ✓; `Input` thuần props = `field.tsx:93-99` ✓; `parsePackageField` dùng `Number(raw)` = `add-student-modal.tsx:18-22` ✓; contracts tiền = `contracts.ts:625` (amount `.int().min(1)`), `:74` (tuitionFee `.nullish()`), `:124-127` (update `.nullable()`), `:16,:30` (price `.min(0)`) ✓; `defaultUnitPrice` = `contracts.ts:871,:901` + `packages/db/src/schema/settings.ts:9` (default `"400.000đ"`) ✓; `defaultUnitPrice` chỉ tiêu thụ tại settings UI + kernel passthrough (grep toàn repo) ✓; `fmtVND` = `mock-data.ts:241` ✓; vitest environment `node` ✓; e2e assertions = `class-tuition-fee.spec.ts:48-50`, `create-invoice.spec.ts:189-207`, `student-package-validation.spec.ts:77-89` ✓; specs fill số dương không cần sửa = `student-package-without-class.spec.ts:28`, `class-roster-tuition-debt.spec.ts:80` ✓; script `e2e` = `playwright test` ✓; `pnpm check` = biome ✓.
- Claim FAILED của scout: "session-actions-modal.tsx:283" → path đúng là `apps/web/src/components/class-detail/session-actions-modal.tsx:283` (đã verify + sửa trong phase-01).
- Không còn claim FAILED → plan đủ điều kiện implement.

### Whole-Plan Consistency Sweep (2026-09-22)

- Tên thống nhất toàn plan: `format-currency.ts` / `formatVndInput` / `parseVndAmount` / `CurrencyInput` — 3 phase dùng cùng bộ tên, không biến thể.
- Hành vi thay đổi (nhập số âm bị mask strip) được nêu nhất quán ở plan.md (Success Criteria), phase-02 (Risk) và phase-03 (spec updates) — không phase nào mâu thuẫn.
- Effort tổng 5h phân bổ 1.5h + 2h + 1.5h; `issue: 0` là placeholder, backfill số issue thật sau khi tạo GitHub issue (bước `--github`).
- Out-of-scope lặp nhất quán: format hiển thị `fmtVND` (vi-VN dots) không đụng — kế quả chấp nhận `1,000,000` (input) song song `1.000.000đ` (display).
- Kết luận: không còn mâu thuẫn chưa xử lý; recommend proceed to cook.
