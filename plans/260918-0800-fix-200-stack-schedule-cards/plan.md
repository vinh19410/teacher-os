---
title: "Fix #200: Xếp card buổi dạy bên dưới nhãn thứ/ngày trên Lịch dạy"
description: "day-col đang flex ngang (label trái, cards phải) ở cả desktop lẫn mobile qua max-app overrides. Đổi sang flex-col thống nhất, dọn override mã hóa arrangement ngang, today nổi bật bằng màu accent-blue trên cả nhãn thứ và ngày."
status: in-progress
priority: P2
effort: 1h
issue: 200
branch: fix/200-stack-schedule-cards
tags: [frontend, ui, schedule]
blockedBy: []
blocks: []
created: 2026-09-18
---

# Fix #200: Stack card buổi dạy bên dưới nhãn ngày

## Overview

`/schedule` (`schedule.tsx`) mỗi cột ngày `day-col flex` xếp label thứ/ngày bên trái và cards bên phải trên cùng hàng (desktop và mobile qua `max-app:*` overrides). Yêu cầu owner (#200): card nằm **bên dưới** label. Thuần presentation, 1 file; hook e2e `button.lesson-block` giữ nguyên.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `day-col` → `flex flex-col` thống nhất mọi breakpoint: label dòng đầu, cards xếp dọc dưới, đủ bề ngang | P1 |
| 2 | Dọn `max-app:*` overrides mã hóa arrangement ngang (items-stretch/gap-3/min-w-16/border-l-*/pl-3/text-left/pt-0/pb-0) | P1 |
| 3 | Tín hiệu today giữ rõ: cả nhãn thứ và ngày chuyển `text-accent-blue` khi hôm nay | P1 |

## Non-Goals

- Không đổi logic dữ liệu/hook `.lesson-block` (e2e phụ thuộc).
- Không đổi grid 7 cột desktop / 1 cột mobile của `week-cal`.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Stack layout + dọn max-app + today signal](./phase-01-stack-day-col.md) | Pending |

## Success Criteria

- [ ] `day-col` không còn `max-app:` override arrangement; layout dọc cả desktop/mobile
- [ ] Today: nhãn thứ + ngày đều accent-blue
- [ ] `check-types` + vitest apps/web xanh; biome repo-wide exit 0; CI e2e (projected-sessions, schedule-session-modal, session-occurrence chạy trong suite) xanh

## Verification Commands

```bash
cd apps/web && npx vite build && npx tsc --noEmit && npx vitest run
pnpm exec biome check . (exit 0, KHÔNG qua pipe)
```

## Red-Team Record (4 personas, 2026-09-18)

**Assumptions** — "card bên dưới" áp cả desktop lẫn mobile (issue nói rõ "ở cả desktop lẫn mobile"). Không blocker.

**Failure** — (F1) bỏ border-l mobile mất today signal trên mobile → bù bằng accent-blue trên cả hai dòng text. (F2) `mt-2` giữa cards giữ nhịp dọc; empty state "—" vẫn render. (F3) e2e chỉ hook `.lesson-block` + text — không phụ thuộc arrangement. Không blocker.

**Scope** — 1 file, thuần class layout. Không scope creep.

**Security** — không đổi data/auth. Không blocker.

**Verdict: GO**.
