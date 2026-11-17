---
phase: 1
title: "Phase 1: Calendar Always Visible & Full-Width Schedule Cards"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Calendar Always Visible & Full-Width Schedule Cards

## Goal

Keep the `/schedule` calendar rendered when no active classes exist and ensure every schedule card fills the full width of its day column.

## Files to Create / Modify

- Modify: `apps/web/src/routes/_auth/schedule.tsx`
- Modify: `apps/web/src/components/schedule/schedule-week-view.tsx`
- Modify: `apps/web/src/components/schedule/schedule-day-view.tsx`
- Modify: `apps/web/src/components/schedule/schedule-month-view.tsx`
- Modify: `apps/web/src/components/schedule/holiday-calendar-card.tsx`
- Modify: `apps/web/src/routes/_auth/schedule.test.tsx`
- Modify: `apps/web/src/lib/empty-states.test.tsx`

## Root Cause Evidence

1. `apps/web/src/routes/_auth/schedule.tsx:196-242` uses a ternary that replaces `ScheduleMonthView` / `ScheduleDayView` / `ScheduleWeekView` with `<Card data-testid="schedule-empty-state">` whenever there are no active classes, events, or historical completed/absent lessons.
2. `apps/web/src/components/schedule/schedule-week-view.tsx:119,173` renders real sessions as `<button type="button" className="lesson-block mt-2 ...">` inside `<div className="min-w-0 flex-1">` without `w-full` or `flex-col` on the wrapper. Because `<button>` defaults to `display: inline-block`, it shrinks to content width (~50% of the day column).

## Tests Before

1. Add failing tests in `apps/web/src/lib/empty-states.test.tsx` (Week view, where `useSearch` defaults to `{}`) and `apps/web/src/routes/_auth/schedule.test.tsx` (Week, Month via `routerState.search = { view: "month", ... }`, Day via `routerState.search = { view: "day", ... }`) asserting:
   - With 0 active classes (and with paused-only classes with no historical attendance), `/schedule` renders `.week-cal` (Week), `schedule-month-grid` (Month), and `schedule-day-agenda` (Day) alongside `schedule-empty-state`, without duplicating `"Không có buổi học nào trong tuần này."` or `"Không có ca học hay sự kiện nào trong ngày này."`.
   - `button.lesson-block` and `div.lesson-block` inside `ScheduleWeekView` include `w-full` (and their parent container uses `flex-col`) so cards fill the column width.
2. Run `pnpm --filter web exec vitest run src/routes/_auth/schedule.test.tsx src/lib/empty-states.test.tsx` to verify red state on new assertions.

## Refactor & Implementation Steps

1. In `apps/web/src/routes/_auth/schedule.tsx`:
   - Compute `hasScheduleSource` from active classes, `data.events.length > 0`, `(data.holidays ?? []).length > 0`, or dated `completed`/`absent` lessons.
   - Render `schedule-empty-state` as a compact responsive banner (`mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`) above the calendar when `!hasScheduleSource` (preserving heading, concise guidance, and `"Quản lý lớp học"` button).
   - Always render the selected calendar view (`ScheduleMonthView`, `ScheduleDayView`, or `ScheduleWeekView`) below.
   - Pass `showEmptyWeekNotice={hasScheduleSource}` to `ScheduleWeekView` and `showEmptyDayNotice={hasScheduleSource}` to `ScheduleDayView` so there are no stacked empty-state notices when `!hasScheduleSource`.
2. In `apps/web/src/components/schedule/schedule-week-view.tsx`:
   - Add `showEmptyWeekNotice = true` prop (default `true` for backward compatibility).
   - Add `min-w-0` to `.day-col` so grid columns stay equal width.
   - Change `<div className="min-w-0 flex-1">` to `<div className="flex min-w-0 flex-1 flex-col">`.
   - Add `w-full min-w-0` to projected `div.lesson-block` and `block w-full min-w-0` to real `button.lesson-block`, plus `break-words` on titles/topics.
   - Add `min-w-0` to the holiday wrapper `<div key={holiday.id} className="mt-2 min-w-0">`.
3. Align sibling calendar card components for consistent full-width behavior and mobile text wrapping:
   - `apps/web/src/components/schedule/schedule-day-view.tsx`: add `showEmptyDayNotice = true` prop (guarding the empty `<Card>` with `items.length === 0 && showEmptyDayNotice`), add `w-full min-w-0` to projected `div.lesson-block`, and add `break-words` to `className`.
   - `apps/web/src/components/schedule/schedule-month-view.tsx`: add `w-full min-w-0` to `.month-item`.
   - `apps/web/src/components/schedule/holiday-calendar-card.tsx`: add `w-full min-w-0` to both `full` and compact card wrappers, and `break-words` to `resolvedName` in `full` mode.

## Tests After

1. Re-run `pnpm --filter web exec vitest run src/routes/_auth/schedule.test.tsx src/lib/empty-states.test.tsx`.
2. Run `pnpm --filter web test`, `pnpm --filter web run check-types`, and `pnpm exec biome check .`.
3. Capture Playwright screenshots of `/schedule` (with 0 classes and with seeded classes) across `1440×900`, `768×1024`, and `375×812` in light and dark themes for POT.

## Verification

- `pnpm --filter web exec vitest run src/routes/_auth/schedule.test.tsx src/lib/empty-states.test.tsx`
- `pnpm --filter web test`
- `pnpm --filter web run check-types`
- `pnpm exec biome check .`
