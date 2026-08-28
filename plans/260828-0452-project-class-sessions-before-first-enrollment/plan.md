---
title: "Project class sessions before first enrollment (issue #121)"
description: "P0: class created with a structured schedule shows 0 sessions everywhere because lesson generation is per-enrollment; project schedule-derived sessions on read for classes with zero lesson rows, and make /schedule date-accurate."
status: in-progress
priority: P1
effort: "1d"
tags: [bug, issue-121, p0, schedule, web]
created: 2026-08-28
blockedBy: []
blocks: []
---

# Project class sessions before first enrollment (issue #121)

## Overview

Issue #121 (P0, M1 DOD blocker): a class created via the "Tạo lớp" modal with a
structured schedule (fixture `QC-CTA-CLASS`: Mon 19:00–20:30, start
2026-08-28, 12 sessions) shows **zero** sessions on the class detail
"Buổi học" table and on `/schedule` in any week.

**Verified root cause** (code-read, not a guess): lesson rows are generated
only per enrollment — `POST /api/students` runs `generateScheduleLessons`
(`apps/server/src/routes/kernel.ts:415-426`); `POST /api/classes`
(`kernel.ts:445-505`) inserts only the class row. Every read path renders
persisted rows only: class detail hits the
`lessons.length === 0 → return null` gate in `buildClassSessions`
(`apps/web/src/lib/class-sessions.ts:117`) and falls back to an empty legacy
table; `/schedule` filters `data.lessons` by weekday only
(`apps/web/src/routes/_auth/schedule.tsx:106-108`). A class with 0 students
therefore has 0 lesson rows and 0 visible sessions — exactly the QC report
(sĩ số 0, table trống, /schedule 0 buổi).

**Fix direction — projected sessions on read (web-only):** when a class has a
structured schedule + strict startDate and **zero lesson rows**, derive its
sessions from the schedule skeleton (same math as the server generator:
weekday cycle from `startDate`, per-weekday occurrence counts from the
generator formula) and render them as display-only projections. No schema
change, no API contract change, no server change.

**Why not generate rows at class create (rejected alternative):**
`lesson.enrollmentId` is NOT NULL with FK to enrollment (invariant 2: a lesson
belongs to a class + exactly one enrollment,
`packages/db/src/schema/lesson.ts:39-41`). Class-level rows would need a
migration, break the invariant, create check-in-orphan placeholder rows, and
need delete/merge semantics when a student later enrolls. Projection delivers
the user-visible outcome (sessions visible from the schedule) without touching
the write model, and preserves the codebase's fail-closed convention: classes
whose schedule is legacy free-text or whose startDate is invalid keep exactly
today's rendering.

**Fixture calendar note (red-team corrected):** the issue text says "T2 đầu
tiên = 01/09", but 2026-09-01 is a **Tuesday**. The server generator
(`skeletonOf`, inclusive walk from startDate,
`packages/api/src/skeleton.ts:112-129`) places the first Monday on/after
Fri 2026-08-28 at **2026-08-31**. Correctness = parity with the server
generator; all pinned dates below follow the generator (Mondays
2026-08-31 … 2026-11-16), and the discrepancy vs the issue text is flagged in
the pipeline issue comment so QC re-tests against generator truth.

**Secondary defect fixed in scope:** `/schedule` ignores `lesson.date` — it
renders every dated class as a weekly template repeated in all weeks
(weekday-only filter, `schedule.tsx:106-108`). The issue's acceptance
("weeks containing the 12 Tuesdays from start date, max 12") requires
date-accurate weeks: dated rows render only in the week containing their
date; legacy undated rows keep today's template behavior.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Class with structured schedule + 0 lesson rows shows projected chronological sessions on the class detail "Buổi học" tab | P1 |
| 2 | Same sessions appear on `/schedule` only in the weeks that contain their dates | P1 |
| 3 | `/schedule` renders dated real rows in their true week (fixes the week-agnostic template) | P2 |
| 4 | Fail-closed preserved: legacy/invalid inputs render exactly as today | P1 |
| 5 | Projected sessions are display-only: zero write targets (no check-in, no adjust modal) | P1 |

## Non-goals

- Server/API changes, DB migration, backfill — none needed.
- Dashboard "today's sessions" / at-risk kernel views — not part of the issue.
- Changing the per-enrollment generation contract from #55.
- Edit/move/cancel of projected sessions (they become actionable once real
  rows exist after the first enrollment).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Projection core + class detail tab](./phase-01-projection-core-and-class-detail.md) | Pending |
| 2 | [Phase 2: /schedule week-accurate rendering](./phase-02-schedule-week-accuracy.md) | Pending |
| 3 | [Phase 3: E2E QC regression + full validation](./phase-03-e2e-regression-and-validation.md) | Pending |

## Acceptance Criteria (from issue #121, dates generator-corrected)

Fixture truth (Mon-only, start 2026-08-28): sessions are the Mondays
2026-08-31, 2026-09-07, …, 2026-11-16 (12th). Week of 2026-08-24 → 0.

- [ ] AC1 Class created with structured schedule, 0 students: class detail
      "Buổi học" table lists all projected sessions chronologically (fixture:
      12 rows, first = Monday 2026-08-31, then weekly Mondays).
- [ ] AC2 `/schedule`: week 2026-08-31 → session Mon 31/08 visible; week
      2026-08-24 → 0 sessions; week 2026-09-07 → session 07/09; mid-course
      week 2026-10-19 → 1 (session #8); weeks after 2026-11-16 → 0.
- [ ] AC3 Projected sessions carry no action targets: no "Điểm danh" CTA, no
      "Điều chỉnh" modal, no LessonModal write actions (asserted on BOTH the
      class detail table and `/schedule` projected blocks).
- [ ] AC4 Adding the first student replaces projection with the real generated
      rows (same dates/slots — generator parity) — no duplicates, no visual
      regression.
- [ ] AC5 Legacy free-text schedule, `start === end`, or missing/invalid
      startDate: rendering identical to today (empty legacy table / weekday
      template), never fabricated dates. Duplicate/unsorted `days` follow
      generator parity (normalized via the shared parser, matching what the
      server would generate) — review note M4: this is deliberate, not the
      frozen legacy rendering originally written here.
- [ ] AC6 Dated real rows on `/schedule` render only in their date's week;
      undated legacy rows keep the template behavior.
- [ ] AC7 All existing vitest suites + Playwright e2e green (server has no
      code change).
- [ ] AC8 `/schedule` header lead ("N buổi") counts the distinct non-cancelled
      slots actually rendered in the viewed week (dated in-week rows, undated
      template rows, projected slots — deduped by `day|time` across sources);
      pinned by a mixed-week unit test.

## Constraints

- `lesson.enrollmentId` stays NOT NULL (invariant 2 untouched).
- No server/package changes; the fix is web read-layer only.
- Weekday convention: schedule JSON days 0-6 Mon-first; lesson day 1-7 Mon=1;
  never JS `getDay()`; date math on UTC-anchored `yyyy-mm-dd` strings.
- Generator-cycle rule: `days` array cycles in order; an odd total gives the
  extra occurrence to the array's first day (deduped + ascending), not the
  first class day after startDate — projection must use the generator formula,
  not raw chronology.
- Shared-skeleton import (red-team amended): the projection core imports
  `parseStoredSchedule` / `parseStartDateStrict` / `skeletonOf` from
  `@teacher-os/api/skeleton` — the package is explicitly web-safe ("No
  db/server/web imports here", `packages/api/src/skeleton.ts:5-7`) and web
  already imports `@teacher-os/api/contracts` (`format-schedule.ts:7`).
  Structural parity: projected dates CANNOT drift from the server generator.
  The pre-existing web-local mirrors (`parseSchedule`, `parseStartDate` in
  class-sessions.ts) stay untouched for the legacy row-derived paths.

## Risks

| Risk | Mitigation |
|------|-----------|
| Projection drifts from server generator dates | Structurally prevented for new code: projection imports `skeletonOf`/`parseStoredSchedule` from `@teacher-os/api/skeleton` (same functions the server generator uses); unit tests assert the corrected fixture dates (31/08, 07/09, …) and odd-total day distribution. |
| Projected sessions expose write actions on fake ids | Projected `ClassSession`s carry `rows: []` → `sessionRowTargets` = [] and attendance sids = [] → existing render gates hide every CTA; e2e asserts zero action buttons AND that projected `/schedule` blocks are not buttons/open no modal. Defense-in-depth: server writes are org+id-scoped and occurrence edits 404 on empty buckets (`kernel.ts:324-340`), so even a forged projected id cannot mutate data. |
| `/schedule` week-filter breaks existing e2e expectations written for the template view | Phase 2 audits and updates affected specs, pinning `?week=` derived from each seed's startDate. Known hazards (red-team): `class-operations.spec.ts` asserts the current week for a "start tomorrow" seed (fails when run on Sundays) and `kernel-runtime.contract.test.ts:190-213` source-contracts schedule.tsx internals — both named in the phase audit list. |
| Double-render after first enrollment (projection + real rows) | Projection fires only when the class has exactly 0 lesson rows; ≥1 row switches entirely to the existing row-derived paths. Unit + e2e cover the transition. |
| Timezone drift on week boundaries | All date math stays UTC-anchored `yyyy-mm-dd` (week-grid convention); week membership via string compare against `dates[]`. |
| Past-dated projected sessions read as "upcoming" | Projected sessions render a distinct muted "Dự kiến" badge (planned, no attendance data) instead of the "Sắp tới" badge, on both class detail and `/schedule` blocks — honest display-only semantics regardless of date. |
| e2e week navigation is new infrastructure (no existing helper) | Phase 3 explicitly budgets a `gotoWeek(page, iso)` helper driving `?week=`; seeding uses the API helper with a fixed far-future Monday (the add-class modal rejects non-future dates, so UI-modal creation cannot pin fixed weeks). |

## Red Team Review

### Session — 2026-08-28
Three hostile reviewers (Security Adversary/Fact Checker, Assumption
Destroyer/Contract Verifier, Failure Mode Analyst/Flow Tracer) reviewed the
plan against the codebase. 17 raw findings → 10 after dedup/cap → evidence
filter rejected 0 (all carried file:line citations). Disposition: 10 accepted,
0 rejected. The plan was amended in place before implementation.

**Findings:** 10 (2 Critical, 4 High, 4 Medium)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Fixture dates impossible: 2026-09-01 is a Tuesday; first Monday after start 2026-08-28 is 2026-08-31 (walk is startDate-inclusive) | Critical | Accept | plan.md AC1/AC2 + fixture note, Phase 1, Phase 2, Phase 3 |
| 2 | Phase 2 "week 2026-10-19 → 0" false (contains session #8); empty week starts 2026-11-23 | High | Accept (merged into #1) | Phase 2 |
| 3 | Web `parseSchedule` not at generator parity (no dedupe/sort, no `start===end` rejection) → projection could render sessions the server never generates | High | Accept (subsumed by #4's shared import) | Phase 1 |
| 4 | "Mirror, don't import" premise false: web already imports `@teacher-os/api`, skeleton.ts is web-safe | High | Accept — projection imports shared skeleton functions | plan.md Constraints, Phase 1 |
| 5 | e2e seeding via UI modal impossible for fixed dates (modal enforces strictly-future startDate) | Critical | Accept — API-seed primary with fixed far-future Monday | Phase 3 |
| 6 | No existing e2e week-nav helpers (`?week=` grep in specs = zero hits) | High | Accept — budget `gotoWeek` helper as new work | Phase 3 |
| 7 | Phase 2 audit misses `kernel-runtime.contract.test.ts` source contract + `class-operations.spec.ts` current-week Sunday hazard; mitigation text wrong ("fixtures without dates" — the breaking fixtures are dated) | High | Accept | plan.md Risks, Phase 2 |
| 8 | Past-dated projected sessions render "Sắp tới" forever (v2 status requires rows) | Medium | Accept — distinct muted "Dự kiến" badge for all projected sessions | plan.md Risks, Phase 1, Phase 2 |
| 9 | AC3 non-interactivity untested at the `/schedule` surface; server 404 backstops unrecorded | Medium | Accept — unit + e2e assertions, backstop noted in Risks | Phase 2, Phase 3, plan.md Risks |
| 10 | (a) `weekSlotCount` redefinition unowned/ambiguous; (b) `typeBlockClass` keyed by LessonType, not class type (`"ielts"|"communication"`) — projected color spec unimplementable | Medium | Accept — AC8 + mixed-week unit test pins the count; projected blocks use `typeBlockClass["1:1"]` matching post-enrollment server rows | plan.md AC8, Phase 2 |

Reviewer-cleared items (no finding, verified in code): snapshot org-scoping
(no cross-tenant leak), single-store atomic hydration (no partial-snapshot
projection flicker), `rows: []` provably yields zero CTAs on class detail,
schema cap sessionsTotal ≤ 52 (no cap-trip/perf risk), midnight-wrap `dur`
identical both sides, rollback safe (web-only, pure read-side).

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-projection-core-and-class-detail.md,
  phase-02-schedule-week-accuracy.md, phase-03-e2e-regression-and-validation.md
- Decision deltas checked: 10 (dates 01/09→31/08 family; shared-skeleton
  import replaces mirror constraint; API-seed replaces UI-seed; "Dự kiến"
  badge; AC8 lead count; `typeBlockClass["1:1"]`; gotoWeek helper; audit list
  additions)
- Reconciled stale references: all phase files rewritten against the amended
  plan; no "mirror don't import", no 01/09/2026 fixture, no "reuse e2e week
  helpers", no UI-modal fixed-date seeding remains anywhere.
- Unresolved contradictions: 0
