---
phase: 3
title: "Phase 3: E2E QC regression + full validation"
status: pending
priority: P2
effort: "3h"
dependencies: [1, 2]
---

# Phase 3: E2E QC regression + full validation

## Overview

Encode the exact QC #121 reproduction as a Playwright e2e regression spec and
run the full validation matrix (web vitest, server vitest, lint/typecheck,
e2e) so the P0 cannot silently regress. Fixture truth (red-team corrected):
Mon-only from start 2026-08-28 → sessions are Mondays 2026-08-31 … 2026-11-16.

## Requirements

- Functional: e2e replicates the QC outcome — a class with the structured
  schedule fixture and NO student shows the 12 projected sessions with the
  correct first date (31/08), `/schedule` shows them only in their weeks
  (24/08: none; 31/08: one; 07/09: one), zero action CTAs anywhere (class
  detail rows AND `/schedule` projected blocks — red-team finding #9), and
  adding a student replaces the projection with real rows carrying identical
  dates (AC1–AC4, AC6).
- Non-functional: seeding and week navigation are explicit new/known infra —
  NO reliance on nonexistent helpers (red-team findings #5, #6).

## Architecture

- **Seeding — API-first (red-team finding #5):** the add-class modal
  enforces a strictly-future startDate (`add-class-modal.tsx:103-106`, input
  `min` at :240), so the fixed QC date can never be entered through the UI.
  Primary seed: extend/reuse `apps/e2e/specs/helpers-dated-class.ts`
  (`POST /api/classes`) with the fixture schedule
  (`days:[0]`, `19:00–20:30`, `sessionsTotal: 12`) and a FIXED far-future
  Monday startDate so all pinned weeks are stable forever — e.g.
  `2027-01-04` (a Monday); derive its 12 session dates and week params in the
  spec from that constant. Optional secondary smoke (no pinned weeks): drive
  the real modal with a relative "tomorrow" date (existing
  `class-operations.spec.ts` convention) and assert the projected table has
  12 rows — keeps the QC UI path covered without brittle dates.
- **Week navigation — new helper (red-team finding #6):** add
  `gotoWeek(page, weekStartISO)` to the e2e helpers (navigates
  `/schedule?week=<iso>`, reusing the route's existing param semantics). No
  existing spec navigates weeks (grep verified) — this is new work, budgeted
  here.
- Assertions:
  - Class detail "Buổi học": 12 rows; first row shows 31/08 (formatSessionDate
    text); every row's badge is "Dự kiến"; zero "Điểm danh"/"Điều chỉnh"
    buttons.
  - `/schedule`: week of the first session date → exactly 1 block in the
    Monday column; previous week → 0 blocks; following week → 1; week after
    the 12th session → 0; projected blocks are not buttons and clicking does
    not open LessonModal.
  - Enroll the first student IN-PAGE on the class detail tab (no navigation —
    kongming DOD: pins the atomic snapshot-refresh path) → rows keep the same
    dates but lose the "Dự kiến" projection character; real check-in CTA
    appears per existing rules.
- Keep one API-seeded variant only; do not multiply specs.

## Related Code Files

- Create: `apps/e2e/specs/projected-sessions.spec.ts`
- Modify: `apps/e2e/specs/helpers-dated-class.ts` (fixture seed + gotoWeek helper)
- Modify (only if the Phase 2 audit demanded): existing schedule/occurrence specs

## Implementation Steps

1. Extend `helpers-dated-class.ts`: fixture seed constant (far-future Monday)
   + `gotoWeek` helper; derive session/week dates from the constant.
2. Draft `projected-sessions.spec.ts` (pre-enrollment asserts fail on
   current behavior only in the sense that the feature must exist — the bug
   is absence of sessions; assert the fixed EXPECTED state).
3. Implement/iterate until green locally against the dev servers
   (`playwright.config.ts` boots :8000/:8001).
4. Full matrix: `pnpm -F web test`, `pnpm --filter web build` (explicit
   gate — proves the `@teacher-os/api/skeleton` import drags no server deps),
   `pnpm -F server test` (unchanged, sanity), lint/typecheck (biome + tsc),
   `pnpm -F e2e e2e`.
5. Update `docs/` if a runbook/feature note describes schedule visibility
   (check `docs/` conventions); keep the change honest and minimal.

## Success Criteria

- [ ] QC repro e2e green (seed → projected sessions → pinned weeks → enroll parity)
- [ ] Full local matrix green (web+server vitest, biome, tsc, e2e)
- [ ] No console/network errors introduced on `/schedule` and class detail

## Risk Assessment

Risk: e2e flakiness on week navigation/timezone. Mitigation: `gotoWeek` pins
the `?week=` param explicitly (never "current week"), week math derived from
the seeded startDate constant, VN-time utilities only where the repo already
uses them.
