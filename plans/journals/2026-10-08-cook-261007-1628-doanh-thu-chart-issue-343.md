---
title: Cook 261007-1628 doanh thu chart (issue 343)
date: 2026-10-08
summary: "Cook xong 3 phase plan doanh thu: 7 lesson recharts tick clip, snapshot-once store, e2e seed quirks"
---

# Cook 261007-1628 doanh thu chart (issue 343)

## Vibe run — cook plan 261007-1628 (issue #343)

**Kết quả:** 3 phase xong trong worktree `feat/343-revenue-stats-chart`. Gates: check/check-types xanh, web 1335✓, server 639✓, e2e nhóm tuition 15/15✓ (full suite 139 pass + 2 flake ngoài diff đều green solo), screenshot 3 viewport + focus ring.

**Lessons:**

1. **recharts tick bị clip y=282 > height 260** — custom tick element khiến recharts đẩy baseline axis ra mép dưới SVG; `toBeVisible()` của Playwright vẫn pass vì bbox tồn tại dù bị clip → assert DOM không đủ, phải xác nhận bằng screenshot. Fix: `BarChart margin.bottom = 24`.
2. **Kernel store nạp snapshot MỘT LẦN lúc login** — seed SQL sau sign-up phải `page.goto()` full reload, không click sidebar (store stale → KPI 0đ).
3. **`waitForURL` không chờ bootstrap** — membership tạo trong GET /api/kernel, trễ hơn URL đổi; SQL query ngay sau sign-up phải poll DB.
4. **Script node đặt ở apps/e2e/ phải dùng `./local.db`** (không phải `../local.db` như spec trong specs/); bảng student không có cột `status`.
5. **Toggle chồng nhãn Q** — cửa sổ 8 quý lặp nhãn Q1-Q4 → getByText exact match 2 node, strict mode violation → `.first()`.
6. Fixture churn thật nhỏ hơn ước tính plan (49 literal → ~10 edit) vì test dùng helper `invoice(partial)`.
7. `ak plan search --issue` lỗi CLI nhưng index vẫn update OK bằng `ak plan update teacher-os/261007-1628`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
