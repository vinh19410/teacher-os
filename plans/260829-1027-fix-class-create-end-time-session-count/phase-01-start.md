---
phase: 1
title: "Contract + server tests-first"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Contract + server tests-first

## Overview

Tighten `classCreateSchema` in `packages/api/src/contracts.ts` so class
creation rejects `schedule.end <= schedule.start` and `sessionsTotal < 1`,
proven by failing-first server tests against `POST /classes`.

## Requirements

- Functional: `POST /classes` returns **400** (`readBody`'s
  `safeParse` failure response — apps/server/src/routes/kernel.ts:139,151)
  when `end < start` (e.g. 21:00 → 08:00), when `end === start`, and when
  `sessionsTotal = 0`.
- Functional: omitted `sessionsTotal` still defaults to 12 (no behavior change
  for existing consumers that omit the field).
- Non-functional: legacy stored rows unaffected — `parseStoredSchedule` in
  `packages/api/src/skeleton.ts` is NOT changed (it guards only `start === end`);
  existing kernel/skeleton tests must stay green.

## Architecture

Single edit point: `classCreateSchema` superRefine in
`packages/api/src/contracts.ts`. The existing `start === end` issue becomes
`end <= start` (same path `["schedule","end"]`, message
"Giờ kết thúc phải sau giờ bắt đầu"). `sessionsTotal` changes
`z.number().int().min(0).max(52).default(12)` → `min(1)`. The schema is the
only server gate — `POST /classes` (apps/server/src/routes/kernel.ts:463)
validates through `readBody(c, classCreateSchema)` and needs no route change.

Update the now-stale comment on `schedule.end`
("end <= start means the session crosses midnight — valid") to state the new
creation-time rule and why legacy parsing stays tolerant.

## Related Code Files

- Modify: `packages/api/src/contracts.ts` (classCreateSchema superRefine + sessionsTotal min + comment)
- Modify: `apps/server/src/kernel.test.ts` (new failing-first cases)

## Implementation Steps

1. (TDD) In `apps/server/src/kernel.test.ts` create-class coverage:
   FLIP the existing `"invalid time format is 400; overnight end<start is 201"`
   test — it currently asserts `end < start` (23:00 → 00:30) returns **201**;
   the new expectation is **400** ("invalid time format is 400; end<start is
   400"). This is an intentional assertion flip (behavior change per issue
   #105), not a weakening. Then ADD cases: `end < start` (21:00 → 08:00) →
   400; `sessionsTotal: 0` → 400; omit `sessionsTotal` → 201 and the created
   class stores 12 (`end === start is 400` already exists — keep). Run them:
   the flipped/new rejection cases must FAIL (201/0 accepted today).
2. Change `classCreateSchema`: superRefine rejects `end <= start` with message
   "Giờ kết thúc phải sau giờ bắt đầu"; `sessionsTotal` `min(1)`.
3. Re-run the new tests — all green; run the full server suite
   (`pnpm --filter server test` or workspace equivalent) — pre-existing tests
   must stay green (watch for fixtures posting `end < start` or `sessionsTotal: 0`;
   fix fixtures, never weaken assertions).

## Success Criteria

- [x] New tests fail before the schema change, pass after
- [x] Full server test suite green
- [x] `parseStoredSchedule` and skeleton tests untouched and green

## Risk Assessment

- Risk: an existing test/fixture creates classes with `end <= start` on purpose
  (midnight-crossing fixtures). Signal: server suite fails after the schema
  change. Response: update the fixture to a same-day time — do NOT loosen the
  new validation; midnight-crossing fixtures are exactly what issue #105 bans.
  CONFIRMED by red team: `kernel.test.ts` "overnight end<start is 201"
  asserts 201 — flipped per Implementation Step 1.
- Risk: an API consumer depends on `end <= start` creation. Signal: none in
  this repo (single consumer is the web app; no seed scripts hit
  `api/classes`). Accepted: contract tightened per QC expectation; documented
  in the PR.
