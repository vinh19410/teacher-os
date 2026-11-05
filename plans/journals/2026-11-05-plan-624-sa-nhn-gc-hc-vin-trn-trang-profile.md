---
title: Plan 624 sửa nhãn Góc học viên trên trang profile
date: 2026-11-05
summary: "Lập plan và issue #624 sửa chính tả nhãn nút #studentPortalLink trên apps/profile"
---

# Plan 624 sửa nhãn Góc học viên trên trang profile

## What happened

Lập plan một phase cho #624: nút `#studentPortalLink` trên header `apps/profile` ghi sai "Gốc học viên", cần đổi thành "Góc học viên". Nhãn này có từ #560. Plan nằm tại `plans/261105-0624-624-fix-student-corner-label-typo/`. Chưa sửa code.

## Decision

- Phạm vi gồm `apps/profile/public/index.html`, `apps/profile/tests/index.test.mjs`, `docs/codebase-summary.md` và một dòng mới trong `CHANGELOG.md`.
- Giữ nguyên bản ghi lịch sử: dòng #560 trong changelog, plan và journal cũ.
- `pnpm design:compare` không phủ landing `apps/profile` (`t-profile` là route `/profile` của app chính), nên kiểm tra bằng ảnh chụp theo viewport.

## Next steps

Chạy `/ak-cook plans/261105-0624-624-fix-student-corner-label-typo/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
