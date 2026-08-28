---
phase: 1
title: "Phase 1: Projection core + class detail tab"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Projection core + class detail tab

## Overview

Add a pure projection function that derives a class's chronological sessions
from its schedule + startDate + sessionsTotal when it has **zero lesson
rows**, and render those projected sessions in the class detail "Buổi học"
tab (currently an empty legacy table for 0-student classes). Tests first.
All fixture dates below are generator-corrected (red-team finding #1):
Mon-only from start 2026-08-28 → first session **2026-08-31**.

## Requirements

- Functional: a class with structured schedule + strict startDate +
  sessionsTotal > 0 and 0 lesson rows shows all `sessionsTotal` projected
  sessions chronologically (AC1). Projection is display-only (AC3): projected
  sessions render the muted "Dự kiến" badge instead of "Sắp tới" (red-team
  finding #8) and expose zero write targets.
- Non-functional: fail-closed — any unparseable/legacy input ⇒ no projection
  (AC5); no server/package changes; UTC-anchored date math.

## Architecture

- **Parity by construction (red-team finding #4):** `projectClassSessions`
  imports the server's own pure functions from `@teacher-os/api/skeleton` —
  `parseStoredSchedule`, `parseStartDateStrict`, `skeletonOf` — so projected
  dates are the generator's dates (the package is web-safe; web already
  imports `@teacher-os/api/contracts` in `format-schedule.ts:7`).
  Web-local mirrors (`parseSchedule`, `parseStartDate`) stay untouched for
  the legacy row-derived paths — this also closes red-team finding #3
  (web parser lacks dedupe/sort and the `start === end` rejection; the shared
  parser has both).
- New exported function in `apps/web/src/lib/class-sessions.ts`:
  ```ts
  export function projectClassSessions(input: {
    schedule: string;      // stored class.schedule JSON (days 0-6 Mon-first)
    startDate: string;     // stored class.startDate (yyyy-mm-dd or legacy "")
    sessionsTotal: number; // stored class.sessionsTotal
  }): ClassSession[] | null;
  ```
  - `parseStoredSchedule(input.schedule)` → null on legacy free-text, empty
    days, invalid times, `start === end`, duplicate/unsorted days (it
    normalizes). `parseStartDateStrict(input.startDate)` → null on
    empty/invalid dates (rejects 2026-02-30). `sessionsTotal <= 0` → null.
    Any null ⇒ return null (fail-closed).
  - `skeletonOf(parsed, startISO, total)` → per-weekday ordered dates
    (inclusive walk from startDate, `total*7+14` cap); null on cap trip ⇒
    return null.
  - Flatten to chronological `ClassSession[]`: `index` = chronological
    position, `slotIndex` = 1-based ordinal among same-weekday dates, `day` =
    lesson weekday 1-7, `time = parsed.start`, `dur` = midnight-wrapping
    `(end - start + 1440) % 1440`, `rows: []`, `mode: "v2"` (identity
    semantics; guarantees `sessionRowTargets` = [] and attendance sids = []).
- `buildClassSessions` gains an optional `sessionsTotal?: number`. New gate
  placed at the top: when `lessons.length === 0` and `sessionsTotal` is a
  positive integer → return `projectClassSessions(...)`. All existing
  row-based paths unchanged (projection never mixes with real rows; existing
  callers/tests omit the param and keep compiling — Contract Verifier: 1
  production caller, `class-schedule-table.tsx:98`).
- Caller wiring: `class-schedule-table.tsx` passes
  `sessionsTotal: cls.sessionsTotal`. Render change (finding #8): when the
  class has 0 lesson rows (projection active), the Trạng thái column renders
  a muted "Dự kiến" badge; existing gates already hide every CTA
  (`sessionRowTargets` = [], attendance sids = [], both modals mount null).

## Related Code Files

- Modify: `apps/web/src/lib/class-sessions.ts` (projection fn + gate + param)
- Modify: `apps/web/src/components/class-detail/class-schedule-table.tsx` (pass sessionsTotal + "Dự kiến" badge)
- Test: `apps/web/src/lib/class-sessions.test.ts` (new projection suite)

## Implementation Steps

1. (TDD) Write failing unit tests in `class-sessions.test.ts`:
   - QC fixture: Mon-only (`days:[0]`) 19:00–20:30, start 2026-08-28 (Fri),
     total 12 → 12 sessions, first dateISO `2026-08-31`, all Mondays weekly,
     last `2026-11-16`, chronological.
   - Two-day schedule (e.g. `days:[2,4]` Tue&Fri) total 5 → Tue×3/Fri×2 (extra
     on the array's first day after dedupe+sort); dates match `skeletonOf`.
   - Odd-total multi-weekday parity (kongming DOD): Tue+Fri total 7 →
     Tue×4/Fri×3 with literal dates asserted (the projection shares
     `occurrencesPerDay`/`skeletonOf` with the server generator, so matching
     these literals is date-for-date generator parity without a cross-package
     test import).
   - Un-normalized input parity: `days:[4,1]` and `days:[4,4,1]` behave as
     deduped+sorted (`[1,4]`) — the projection must not diverge from the
     generator (finding #3).
   - Null cases: legacy free-text schedule; empty startDate; invalid date
     (2026-02-30); `start === end`; unparseable JSON; sessionsTotal 0.
   - Projection is inert for write actions: `sessionRowTargets` = [] and
     `sessionAttendanceState(...).sids` = [] for every projected session.
   - Gate: `buildClassSessions` with 0 lessons + sessionsTotal delegates to
     projection; 0 lessons without sessionsTotal still returns null.
2. Implement `projectClassSessions` (shared-skeleton import) + the
   `buildClassSessions` gate.
3. Wire `class-schedule-table.tsx`: pass `sessionsTotal`; render "Dự kiến"
   muted badge when projecting (0 rows for the class).
4. Run web vitest suite; fix until green.

## Success Criteria

- [ ] New unit tests pass (projection + gate + inertness + parity cases)
- [ ] Existing `class-sessions*.test.ts`, contract tests unchanged-green
- [ ] No server/package edits (`git status` clean outside apps/web)

## Risk Assessment

Risk: projected dates drift from the server generator. Signal: AC4 e2e
comparison in Phase 3 or the parity unit cases failing. Response: the shared
import makes drift structural-impossible for the walk itself; if it still
surfaces, the defect is in the flatten/ordering layer — fix there, never by
re-implementing date math.
