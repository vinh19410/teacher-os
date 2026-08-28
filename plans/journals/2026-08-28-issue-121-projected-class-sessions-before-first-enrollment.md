---
title: "Issue #121: projected class sessions before first enrollment"
date: 2026-08-28
summary: "P0 fix: 0-student classes now show schedule-derived projected sessions (web read-layer, generator parity via @teacher-os/api/skeleton); /schedule is date-accurate"
---

# Issue #121: projected class sessions before first enrollment

## Why

QC #121 (P0, M1 DOD blocker): a class created with a structured schedule showed ZERO sessions — empty "Buổi học" table, 0 buổi on /schedule in every week. Code-read (no guessing) proved the root cause: lesson rows are generated only per enrollment (`POST /api/students` → `generateScheduleLessons`), while `POST /api/classes` inserts only the class row, and every read path renders persisted rows only. A 0-student class therefore has 0 rows and 0 visible sessions.

## What changed

Web read-layer only (no server/schema change — invariant 2 `lesson.enrollmentId NOT NULL` untouched):
- `projectClassSessions` derives a 0-row class's sessions from its schedule skeleton using the SERVER's own pure helpers imported from `@teacher-os/api/skeleton` — generator parity by construction, fail-closed on legacy/invalid inputs, totals capped at the schema max (52).
- `buildClassSessions` gates to the projection only when a class has zero lesson rows + positive sessionsTotal; projected sessions are display-only (`rows: []`, `mode: "v2"` → zero write targets) and render the muted "Dự kiến" badge.
- `/schedule` became date-accurate: dated rows render only in the week containing their date (previously an every-week template), undated legacy rows keep the frozen template, and the header lead counts the rendered week's distinct slots.
- e2e QC regression: API-seeded fixed far-future Monday (the create modal enforces future-only start dates), 12 projected Mondays, week presence/absence, no CTAs, in-page enrollment flips projection to real rows with identical dates. `class-operations` now pins its `?week=` so a VN-Sunday run can't strand "start tomorrow" rows in the next week.

## The tricky bit

My first plan draft inherited the issue's calendar claim "first T2 = 01/09" — but 2026-09-01 is a TUESDAY; the generator's inclusive walk from Friday 28/08 starts Monday 31/08. The red-team (3 hostile reviewers, 10 accepted findings) caught it before implementation; the correction is pinned in literal test dates and flagged to QC on the issue. Second trap: the e2e couldn't seed through the UI modal at all (future-only start dates), so the spec API-seeds a constant 2027-01-04 and derives every pinned week from it.

## Result

All gates green: 355 web + 167 server vitest, 16/16 Playwright, turbo check-types, biome; validated + red-teamed plan; APPROVE code review with 4 minor notes applied. Shipped to beta (PR → develop) for QC re-test against generator-truth dates (31/08, not 01/09).

## What's next

QC re-test of the original fixture; dashboard "today's sessions" still derives from real rows only (projection there is a deliberate non-goal).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
