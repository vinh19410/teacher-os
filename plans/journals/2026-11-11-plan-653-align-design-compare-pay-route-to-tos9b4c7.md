---
title: "Plan #653: Align design-compare pay route to TOS9B4C7"
date: 2026-11-11
summary: "Chốt kế hoạch TDD --advice sửa lỗi deterministic design pay trắng/rỗng ở desktop-light và tablet-light bằng hóa đơn #/pay/zz3Kpr (TOS9B4C7)"
---

# Plan #653: Align design-compare pay route to TOS9B4C7

## What happened
- Điều tra `ak-debug` trên 214 ảnh design-side xác nhận chỉ đúng 2 tổ hợp `pay/desktop-light` (`0.511%`) và `pay/tablet-light` (`0.842%`) fail pixel check (`minNonDominantRatio = 1.0%`).
- Nguyên nhân gốc: `scripts/design-compare/screens.json:39` trỏ `#/pay/p7Hq2x` (`TOS7K2Q9` đã thanh toán đủ `6.5M / 6.5M`, chỉ vẽ card trắng 4 dòng chữ `"Paid in full. Thank you."` trùng màu nền trắng ở light mode) thay vì `#/pay/zz3Kpr` (`TOS9B4C7` còn dư nợ `3.5M` có mã QR + bảng ngân hàng, khớp `t-invoice`, `seed.payToken` và `phase-05-auth-public-pages.md`).
- Red-team 2 reviewer độc lập (`Security Adversary` + `Assumption Destroyer`) phát hiện 8 điểm cần siết (bỏ lệnh chụp lặp sau xoá `.state`, cô lập `.cache/design-v2` trong worktree, khoá `sha256sum` 6 ảnh sau khi duyệt mắt, allowlist Git chặt, xoá `.mail-log.jsonl`/`local.db*`).

## Decision
- Theo khuyến nghị Kongming (Checkpoint 1 & 2 GO): chọn Option A — đổi `pay.design.hash` sang `#/pay/zz3Kpr`, đồng bộ `phase-01-visual-harness-baseline.md` + `verdict.md` + `CHANGELOG.md`, chụp ghép lại đúng 6 ảnh `screenshots/pay/*.png`; giữ nguyên tuyệt đối `inspectPngBuffer` và `PAY_TOKEN_RE` trong `harness-lib.mjs`.

## Next steps
- Cập nhật tracking comment + label trên issue `#653` và thực thi `/ak-fix --auto plans/261111-0257-653-design-compare-pay-blank/plan.md --advice`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
