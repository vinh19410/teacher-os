---
title: "Ship image pins #271 phase4"
date: 2026-09-28
summary: "Ship phase 4/4 authoring UX (issue #271): image pins reading diagram + listening map; contract pin {x,y} 0-100% + inner .strict(); save-time pin errors sau war story dropped-click e2e; 2 cook subagent chết im lặng -> controller inline. Gate: web 990/990, server 364/364, e2e 23/23."
---

# Ship image pins #271 phase4

# Ship image pins #271 phase4

Phase 4/4 (cuối) của authoring UX plan (issue #271, `plans/260925-0724-assignment-authoring-ui-ux/`): image pins cho reading diagram + listening map trên branch `vinh19410/feat/assignment-authoring-ui-ux`. Plan khép tại đây.

## What happened

- Hai cook subagents chết IM LẶNG (timeout 600s inactivity) trước khi viết nổi một dòng — không partial output, không error, chỉ im lặng. Controller phải tự implement inline. Bài học đắt: đừng tin "agent đang suy nghĩ" mãi mà không thấy diff.
- Contract: `pin {x,y}` 0–100% trên question items; inner question object đổi `.strict()` — field lạ giờ 400 ầm ầm thay vì bị strip âm thầm (nguồn cái kiểu bug "sao field này biến mất" dai dẳng).
- Image gates theo skill: reading:diagram + listening:map bắt buộc image URL + per-question pin + answer khi ready. Writing task1 `map` chủ động KHÔNG gate — bẫy shared-type-id red-team #1, có regression test chặn.
- Snapshot `parseQuestions` forward pins qua numeric guard (corrupt → null) để label không biến mất khi reload.
- PinEditor: click-to-place qua pure `pointerToPercent`, Enter/Space pin tâm ảnh, pin→row selection, dead-URL fallback. PinOverlay dùng chung student preview + bank aside → snapshot round-trip assert được e2e end-to-end.

## Debug war story (đắt giá nhất phase)

- e2e click "Thêm câu" bị rớt IM LẶNG sau answer-chip clicks. Trace bằng native-event probe: mousedown → focusout → blur re-render lộ row error → layout shift giữa mousedown và mouseup → click rơi trúng container. Click không bị "ăn mất" — nó không còn chỗ để hạ cánh.
- Fix: pin errors chỉ hiện lúc save (không blur), vì pin cố định trên ảnh chứ không thuộc row. Hazard dropped-click vốn nằm ở phase-1 blur-error display (mọi click lộ row error đều nguy cơ shift layout giữa chừng) — ghi nhận làm nợ, KHÔNG phải regression phase-4.
- e2e flakiness: route-mock SVG 200×100 deterministic (example.com không load → broken image không có size cho percent-click); `getByLabel` "Mục A" phải exact-match vì substring khớp nhầm nút xoá "Xóa mục A".

## Verify

web vitest 990/990, server 364/364 (5 test contract/snapshot mới), e2e 23/23 (reading-types + map-listening + create), tsc + biome sạch.

## Next steps

- Authoring UX plan #271 khép 4/4 — viết tổng kết plan.
- Nợ theo dõi: dropped-click hazard của blur-error display; subagent cook cần watchdog báo failure thay vì chết im.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
