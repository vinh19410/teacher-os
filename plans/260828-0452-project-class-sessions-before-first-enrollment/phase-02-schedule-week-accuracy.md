---
phase: 2
title: "Phase 2: /schedule week-accurate rendering"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: /schedule week-accurate rendering

## Overview

Make `/schedule` render sessions in the week they actually occur: dated real
lesson rows render only in the week containing their `date`; undated legacy
rows keep today's weekday-template behavior; classes with zero lesson rows get
projected blocks (from Phase 1's helper) in their date's weeks. This is what
makes AC2 true — QC must see the session in the week of 31/08 and NOT in the
week of 24/08. Fixture truth (red-team corrected): Mon-only from start
2026-08-28 → sessions are Mondays 2026-08-31 … 2026-11-16.

## Requirements

- Functional: week membership by `date` for dated rows (AC6); projected
  occurrences for 0-row classes appear in their weeks only (AC2); header lead
  count = distinct non-cancelled slots actually rendered in the viewed week
  (AC8 — red-team finding #10a makes this an owned, tested criterion).
- Non-functional: projected blocks are non-interactive and unit-asserted as
  such (AC3 — red-team finding #9); no data-store/API changes; legacy undated
  rows render exactly as today.

## Architecture

- Extract pure selection logic into `apps/web/src/lib/schedule-week.ts` so
  unit tests need no React:
  ```ts
  // Column selection for one weekday column i of the viewed week.
  selectWeekColumnLessons(lessons, day, dates): Lesson[]
  // → l.day === day && (l.date == null || dates.includes(l.date))
  // Projected blocks for 0-row classes, filtered to the viewed week.
  selectProjectedWeekBlocks(classes, lessons, dates): ProjectedBlock[]
  // → for classes with zero rows in `lessons`, projectClassSessions(...)
  //    occurrences whose dateISO ∈ dates[]
  // Distinct non-cancelled slots actually rendered (AC8).
  weekSlotCount(renderedReal, renderedProjected): number
  // → union of `day|time` across dated in-week + undated template real
  //   rows and projected blocks; cancelled excluded; deduped across sources.
  ```
- `apps/web/src/routes/_auth/schedule.tsx` consumes the helpers:
  - Real-lesson column filter becomes date-aware (rule above).
  - Projected blocks render as non-clickable elements (`div`, no
    `setOpenLesson`, no `role="button"`): time, class name (no student),
    meta line "chưa có học viên", muted upcoming style with color class
    `typeBlockClass["1:1"]` — matching what the server will generate on first
    enrollment so pre/post-enrollment visuals line up (red-team finding
    #10b; `ClassGroup.type` is `"ielts"|"communication"`, NOT a LessonType).
  - `weekSlotCount` switches to the week-scoped union (AC8).
  - Keep `resolveWeek`/`validateSearch` usage inside schedule.tsx —
    `kernel-runtime.contract.test.ts:190-213` source-contracts this file
    (named audit hazard, red-team finding #7); check the contract before and
    after the rewrite.
- No changes to the data store, repos, or mock-data `Lesson` type (projection
  stays out of `data.lessons` — no fake ids near the write paths).

## Related Code Files

- Create: `apps/web/src/lib/schedule-week.ts` (pure selection helpers)
- Modify: `apps/web/src/routes/_auth/schedule.tsx` (use helpers + projected blocks)
- Test: `apps/web/src/lib/schedule-week.test.ts` (new)

## Implementation Steps

1. (TDD) Failing unit tests in `schedule-week.test.ts`:
   - Dated row in week W renders in W's column, not in other weeks.
   - Undated row keeps weekday-template behavior in every week.
   - 0-row class with the fixture (Mon-only, start 2026-08-28, total 12):
     week 2026-08-24 → 0 blocks; week 2026-08-31 → 1 block (Mon 31/08); week
     2026-09-07 → 1; mid-course week 2026-10-19 → 1 (session #8); week
     2026-11-16 → 1 (12th); week 2026-11-23 → 0 (red-team finding #2).
   - Class with ≥1 real row contributes no projected blocks.
   - Legacy schedule / invalid startDate class contributes no blocks.
   - AC8 mixed week: dated in-week + dated out-of-week + undated template +
     projected slot + a cancelled row → count dedups `day|time` across
     sources and excludes cancelled.
2. Implement `schedule-week.ts` + rewire `schedule.tsx`.
3. Audit existing tests/specs that assert `/schedule` rendering; update the
   dated-fixture ones to pin `?week=` derived from the seed's startDate.
   Named hazards (red-team finding #7): `class-operations.spec.ts:65-85`
   asserts the CURRENT week for a "start tomorrow" seed — deterministic
   failure when CI runs on a VN Sunday once the filter ships; pin its week.
   `kernel-runtime.contract.test.ts:190-213` source-contracts schedule.tsx —
   verify the contract still holds after the rewrite.
4. Run web vitest; fix until green.

## Success Criteria

- [ ] New unit tests pass; existing suite green (updated where behavior intentionally changed)
- [ ] QC fixture weeks render per AC2 (unit-verified, corrected dates)
- [ ] Projected blocks render no `button`/`role="button"` and open no modal (unit-asserted)
- [ ] AC8 lead count pinned by the mixed-week unit test

## Risk Assessment

Risk: existing e2e/specs rely on template rendering of dated rows. Signal:
failing schedule specs in Phase 3. Response: update those expectations to
date-accurate weeks with pinned `?week=` params — that IS the accepted
behavior change (AC6); if a spec reveals a legitimate template use-case, stop
and re-plan rather than special-casing rows.
