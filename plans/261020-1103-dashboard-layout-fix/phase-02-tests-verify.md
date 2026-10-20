---
phase: 2
title: "Tests và verify 3 viewport"
status: pending
effort: 1h
---

# Phase 2: Tests và verify 3 viewport

## Files

| File | Action |
|---|---|
| `apps/web/src/lib/dashboard-from-kernel.test.ts` | modify: case cho `formatClassSessionMeta` |
| `apps/web/src/routes/_auth/dashboard.test.tsx` | modify: case topic rỗng |

## Steps

1. **Unit helper**: có topic thì ra `90' · 1:1 · Line chart`; topic `""` hoặc `"  "` thì ra `90' · 1:1`.
2. **Route test**: thêm lesson hôm nay với `topic: ""`. Assert dòng meta không kết thúc bằng `·` (`not.toMatch(/·\s*$/)`). Các assert cũ (`19:00`, `Bar chart`) vẫn pass.
3. **Gates local**: `pnpm check`, `pnpm check-types`, `pnpm --filter web test`. PR vào `develop` không có CI, nên local là gate.
4. **Verify trực quan** (dev stack port 8001, theo `REVIEW.md`): `/dashboard` ở 1440×900, 768×1024, 375×812, cả dark và light. Dữ liệu cần có lớp tên dài và lesson thiếu topic. Kiểm keyboard focus link `Xem tuần →`. Chụp screenshot trước/sau để đính vào PR.

## Done khi

- Mọi acceptance criteria trong `plan.md` được tick, kèm screenshot 3 viewport.
