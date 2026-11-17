---
title: "Calendar Always Visible & Full-Width Schedule Cards"
description: "Keep the /schedule calendar visible when no active classes exist and make schedule cards span full column width."
status: completed
priority: P1
effort: 2h
branch: vinh19410/murre
tags: [frontend, bugfix, ui]
blockedBy: []
blocks: []
created: 2026-11-17
---

# Calendar Always Visible & Full-Width Schedule Cards

## Overview

Fix two UX/layout defects on `/schedule`:
1. Render the calendar (`ScheduleWeekView`, `ScheduleMonthView`, `ScheduleDayView`) even when there are no active classes yet, converting `schedule-empty-state` into a compact banner above the calendar instead of hiding the calendar.
2. Make all session and calendar cards span 100% of their day column width instead of shrinking to ~50% (`<button>` defaulting to `inline-block` without `w-full`).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Keep calendar views visible on `/schedule` when zero active classes exist | P1 |
| 2 | Make all schedule cards span full width of their calendar column | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Start](./phase-01-start.md) | Pending |

## Success Criteria

- [x] `/schedule` always displays the selected calendar view (Week, Month, Day), even when `hasScheduleSource` is false (0 active classes, 0 events, 0 holidays, and 0 dated `completed`/`absent` lessons), showing a compact `schedule-empty-state` guidance banner linking to `/classes` above the calendar only when `!hasScheduleSource`.
- [x] All cards inside `.week-cal`, `.month-cal`, and day agenda (`button.lesson-block`, `div.lesson-block`, `HolidayCalendarCard`, `OrgEventChip`) span 100% of their column width (`w-full`).
- [x] `pnpm --filter web exec vitest run src/routes/_auth/schedule.test.tsx src/lib/empty-states.test.tsx`, `pnpm exec biome check .`, `pnpm --filter web run check-types`, and `pnpm --filter web test` pass.
- [x] Visual POT screenshots across 3 viewports (`1440×900`, `768×1024`, `375×812`) in light and dark themes verify layout and card width.

## Red Team Review

### Session — 2026-11-17
**Findings:** 5 unique (4 accepted, 0 rejected, 1 duplicate merged)
**Severity breakdown:** 0 Critical, 0 High, 5 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `hasScheduleSource` ignores `data.holidays` | Medium | Accept | Phase 1 |
| 2 | `ScheduleDayView` stacked empty-state `<Card>` under `schedule-empty-state` | Medium | Accept | Phase 1 |
| 3 | `plan.md` Success Criterion #1 wording vs paused historical attendance | Medium | Accept | `plan.md` |
| 4 | `empty-states.test.tsx` hardcodes `useSearch: () => ({})` to Week view | Medium | Accept | Phase 1 |
| 5 | Banner mobile wrapping and sibling `min-w-0` / `break-words` gaps | Medium | Accept | Phase 1 |

## Validation Log

### Session 1 — 2026-11-17
- Verification: `ak plan validate` passed (exit 0); all file paths, line numbers, selectors, and test assumptions verified against codebase (`Failed: 0`).
- Decisions applied:
  - Include `(data.holidays ?? []).length > 0` in `hasScheduleSource`.
  - Pass `showEmptyDayNotice={hasScheduleSource}` to `ScheduleDayView` as well as `showEmptyWeekNotice={hasScheduleSource}` to `ScheduleWeekView`.
  - Keep Week-view empty-state assertions in `empty-states.test.tsx` and test Month/Day empty-calendar rendering in `schedule.test.tsx`.
  - Use `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between` on `schedule-empty-state`, `min-w-0` on Week holiday wrapper, and `break-words` on Day/Holiday titles.

<!-- slug: schedule-empty-calendar-full-width-cards -->
