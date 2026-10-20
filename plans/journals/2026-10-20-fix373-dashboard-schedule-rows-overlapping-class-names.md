---
title: "fix(#373): dashboard schedule rows overlapping class names"
date: 2026-10-20
summary: "Giờ học text-lg tabular-nums, cột auto min-w-5ch, ScheduleRow dùng chung, formatClassSessionMeta bỏ chấm · thừa; h2 text-xl; tests + visual 3 viewport dark/light pass"
---

# fix(#373): dashboard schedule rows overlapping class names

# fix(#373): dashboard lịch chồng chữ sau redesign

## Cause
- Hàng lịch `grid-cols-[80px_1fr]` + giờ `font-mono text-2xl`; redesign #350 đặt `--text-2xl: 40px` nên DM Mono 40px (~120px) tràn cột 80px đè tên lớp.
- Meta ghép cứng `{dur}' · {type} · {topic}` → `·` treo khi topic rỗng.

## Fix
- `formatClassSessionMeta(g)` (dashboard-from-kernel.ts): nối `[dur', type, topic.trim()].filter(Boolean).join(" · ")`.
- `ScheduleRow` cục bộ (dashboard.tsx) thay 2 khối JSX lặp; `grid-cols-[auto_1fr] items-baseline`, giờ `text-lg tabular-nums whitespace-nowrap min-w-[5ch]`, tên lớp `min-w-0 break-words`.
- 2 h2 section `text-2xl` → `text-xl`; không đổi token toàn cục.

## Verification
- `pnpm check` ✓ (35 warnings pre-existing, stable), `pnpm --filter web check-types` ✓, `pnpm --filter web test` ✓ 1510/1510 (thêm unit formatClassSessionMeta + route test topic rỗng).
- Visual: e2e stack worktree port 8200/8201, /dashboard seed class dated + enroll accept; screenshots 1440×900/768×1024/375×812 dark+light đạt; keyboard Tab→"Xem tuần →"→Enter→/schedule ✓.

## Notes
- Lesson chỉ sinh khi enrollment activate (`POST /api/enrollments/:id/accept`); schedule API days dùng Mon=0.
- Red-team inline (subagent model unavailable): 0 accepted / 5 rejected; kongming gate: GO.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
