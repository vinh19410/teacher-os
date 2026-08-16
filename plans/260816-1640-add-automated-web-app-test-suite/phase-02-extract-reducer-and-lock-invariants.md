---
phase: 2
title: "Extract reducer and lock invariants"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Extract reducer and lock invariants

## Overview

Replace the phase-1 stub with the real `Action` + `reducer` + helpers moved from `data-store.tsx`. Expand tests to lock **current** numeric behavior. No behavior change.

## Requirements

- Functional: every existing `dispatch({ type })` still works; `useReducer` uses the extracted `reducer`.
- Non-functional: extract only; do not "fix" `sessionsDone`, cancelled check-in, score range, or hardcoded cards.

## Architecture

```
data-store-reducer.ts   Action, reducer, uid (unexported)
data-store.tsx          DataProvider, useData, `export type { Action } from "./data-store-reducer"`
data-store-reducer.test.ts
```

`data-store-reducer.ts` imports types from `./mock-data` only — never from `./data-store` (cycle).

`data-store.tsx` must bind `Action` in local scope (kongming):

```ts
import { reducer, type Action } from "./data-store-reducer";
export type { Action };
```

`export type { Action } from "./data-store-reducer"` alone does **not** put `Action` in scope for `Dispatch<Action>`. After the move, drop unused type imports that only served `Action` (`Scores`, `SyllabusLesson`, `SyllabusModule`) or biome unused-import fails.

One runtime consumer today: `useReducer(reducer, seedData)` at `data-store.tsx:350`. `Action` is a public named export with **zero** external importers — still re-export it.

Comment at top of the test file: client demo store; no authz; not a payment control; tests may be deleted when this store is replaced by an API.

Do not `expect(next).toEqual(seedData)` on the full object (seed has phone/parent lookalikes; CI logs). Assert numeric/status fields only.

### Fixtures (hard ids)

| Id | Why |
|---|---|
| `l3` | `upcoming`, `sid: s1`, day 2. s1 has tag `sắp hết buổi` so dashboard risk row exists. |
| `l1` | `completed` — no-op, same object ref |
| `l9` | `cancelled`, `sid: s4` — **current hole**: reducer still +1 (lock, do not fix) |
| `INV-084` | overdue 1_000_000, s4 |
| `INV-086` | unpaid 900_000, s1 |
| `a1` | ungraded (`scores: null`) |

There is no `"scheduled"` status (`LessonStatus` = `completed | upcoming | cancelled | absent`).

### Invariants to lock (current behavior)

Use `structuredClone(seedData)` per test.

1. **check-in `l3` (upcoming)**
   - lesson `status` → `"completed"`
   - s1: `pkg.done += 1`, `pkg.remaining = max(0, pkg.total - pkg.done)`
   - other students unchanged
   - `classes` unchanged, including `sessionsDone` (known desync vs `classes/index.tsx:84` and `$classId.tsx:98-99` — lock the gap)
   - `invoices` unchanged
2. **check-in `l1` (completed)** → `toBe` previous state (same reference)
3. **check-in unknown id** → `toBe` previous state
4. **check-in `l9` (cancelled)** → current hole: status becomes `completed`, s4 `pkg.done += 1`. Document, do not change reducer.
5. **mark-invoice-paid `INV-084`** → that invoice `status: "paid"`, `method` set; other invoices' fields unchanged. Unknown id: **deep-equal contents**, not `toBe` (reducer always spreads a new object). Already-paid overwrite of `method` is current behavior — lock it. Do not add early-return.
6. **grade-assignment `a1`** → matching `scores` + `status: "graded"`. Reducer accepts any `Scores` (UI 0–9 lives in `grade-modal.tsx:29-42`). Lock raw scores only; do not claim every band formula. Optional: `averageBand(scores)` from `mock-data.ts:165-171` on the same fixture.
7. **syllabus CRUD — split, do not chain create→add-module expecting 10 to survive**
   - `add-syllabus`: `modules: []` **and** `totalLessons === payload.totalLessons` (create does **not** recompute; modal default `"10"`). `id === payload.id` (no `uid`).
   - `add-module` on seed `sy1`: `totalLessons` stays 12 (0 new lessons).
   - `add-module` on a just-created syllabus: `totalLessons` becomes **0** (recompute). Lock this.
   - `add-lesson` / `edit-lesson`: `totalLessons ===` sum of module lesson counts after that action.
   - `edit-module` does not change `totalLessons`.
   - `assign-syllabus` sets `class.syllabusId` only.
8. **Live actions with no issue-named invariant** (minimum shape — extract must not rewrite them)
   - `cancel-lesson`: lesson status `cancelled`; `pkg` unchanged
   - `add-student`: length +1; new `pkg.done === 0`; id matches `/^s-/`
   - `add-class`: length +1; `sessionsDone === 0`; id matches `/^c-/`
   - `update-class-notes`: only that class `notes` changes
9. **Store fields views actually read** (helper in the test file, not product code)

   | View | Fields after check-in / mark-paid |
   |---|---|
   | `students/index.tsx:68-69` | `pkg.remaining` / `pkg.total` |
   | `students/$studentId.tsx:139-140` | `pkg.done`, `pkg.remaining` |
   | `classes/$classId.tsx:139` | `pkg.remaining` / `pkg.total` |
   | `tuition.tsx:76-87` | `pkg.done/total`, `pkg.remaining` |
   | `dashboard.tsx:181` | `pkg.remaining` **only if** student is in risk filter (`:20-25` tags/`atRisk`). Use s1 after `l3`. |
   | `dashboard.tsx:160-166` | unpaid+overdue **sum** — only this cell. After mark-paid `INV-084`, s4 debt drops by 1_000_000. Risk **membership** stays tag-based (s4 keeps `"nợ học phí"`). |

   Do **not** attach invoice sums to students list, student profile package block, class roster, or `tuition.tsx:76-87`.

## Related Code Files

- Replace stub: `apps/web/src/lib/data-store-reducer.ts`
- Modify: `apps/web/src/lib/data-store.tsx` (import reducer; re-export Action; delete moved symbols)
- Modify: `apps/web/src/lib/data-store-reducer.test.ts`

## Tests Before

Expand the test file with the invariant cases **before** replacing the stub. They stay red until the extract lands.

## Refactor

Move the existing functions. Keep switch cases and return shapes identical. `uid` stays file-private in the reducer module.

## Tests After

All invariants above green. No new product behavior.

## Implementation Steps

1. Write the failing invariant tests (import from `vitest` + `./data-store-reducer`).
2. Replace the stub with the moved reducer (do not rewrite).
3. Point `data-store.tsx` at the new module; `export type { Action } from "./data-store-reducer"`.
4. Run `pnpm --filter web test`.
5. Biome-check touched files.

## Success Criteria

- [x] `reducer` is the moved implementation, not the stub
- [x] `data-store.tsx` no longer defines `reducer`; re-exports `Action`
- [x] Fixture `l3` / `l1` / `l9` / `INV-084` / `a1` cases pass
- [x] `add-syllabus` keeps payload `totalLessons`; add-module after create goes to 0
- [x] Four extra live actions have shape tests
- [x] No full-seed `toEqual` dumps

## Risk Assessment

- Accidental behavior change during extract. Signal: seed math fails. Response: diff moved text.
- Generalizing `toBe(state)` to mark-paid/grade. Signal: false red. Response: only check-in unknown/completed uses `toBe`.
- Prefix regex on `add-syllabus`. Signal: `sy-…` fails `/^(s|c|m|l)-/`. Response: assert `id === payload.id`.
- Chaining create→add-module expecting 10. Signal: got 0. Response: that is current behavior; lock it.

## Regression Gate

`pnpm --filter web test` exit 0.
