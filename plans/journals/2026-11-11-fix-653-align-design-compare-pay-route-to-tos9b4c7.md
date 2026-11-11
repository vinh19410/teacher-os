---
title: "Fix #653: Align design-compare pay route to TOS9B4C7"
date: 2026-11-11
summary: "Hoàn tất sửa lỗi deterministic design pay trắng/rỗng ở desktop-light và tablet-light qua #/pay/zz3Kpr (TOS9B4C7), cập nhật 6 ảnh composite và vượt qua các lượt kiểm chứng"
---

# Fix #653: Align design-compare pay route to TOS9B4C7

## What happened
- Thực thi kế hoạch TDD `--advice` cho issue #653 trên nhánh `fix/653-design-compare-pay-blank`.
- Phase 1: chứng minh TDD Red (`--screens pay --side design --force` thoát `1` với `4 ảnh, 2 lỗi`: `pay/desktop-light` `0.511%`, `pay/tablet-light` `0.842%`); cập nhật `scripts/design-compare/screens.json:39` từ `#/pay/p7Hq2x` sang `#/pay/zz3Kpr` (`TOS9B4C7`) và đồng bộ `phase-01-visual-harness-baseline.md:37`; TDD Green đạt `6 ảnh, 0 lỗi` (riêng `pay`), `214 ảnh, 0 lỗi` (toàn bộ 36 màn phía design), `pnpm test:design-compare` đạt `23/23 pass`.
- Phase 2: trên máy VM 4 core dùng chung nhiều agent, lượt `run2` ban đầu gặp 1 lần flake tồn tại sẵn `#652` (`verify-email` timeout trong `design-seed.ts`) và 1 lần timeout IPC `compose()` khi `loadavg` vọt lên `40.76`. Tuân thủ `Failure Protocol`, dừng ngay và tham vấn `kongming` 2 lần, cài cổng chờ `loadavg < 4.5` và hoàn tất trọn 3 lượt (`run1` `18 ảnh, 0 lỗi`, `run2` `18 ảnh, 0 lỗi`, `run3` cache-hit `0 ảnh, 0 lỗi`), duyệt trực quan 6 ảnh `screenshots/pay/*.png`, cập nhật `verdict.md` + `CHANGELOG.md`, dọn sạch artifact nhạy cảm và vượt qua toàn bộ cổng chất lượng local.

## Decision
- Giữ nguyên tuyệt đối `inspectPngBuffer` (`minNonDominantRatio = 0.01`), `PAY_TOKEN_RE`, `capture.mjs`, và `design-seed.ts`; chỉ chỉnh 9 file trong allowlist đã khoá với Kongming.

## Next steps
- Chạy local code review (`--pending --advice`), ship PR beta vào `develop` (`ak-ship beta --advice`), review/reply/merge PR, canh CI `develop` xanh và đăng đánh giá Kongming + POT lên issue #653.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
