---
phase: 1
title: "Lock add-student tests and add enroll cases"
status: pending
priority: P1
effort: "45m"
dependencies: []
---

# Phase 1: Lock add-student tests and add enroll cases

## Overview

TDD: add `classId?: string` to the **type only**, extend omit/unknown as green characterization, add a red enroll-membership test. Do not implement enroll.

<!-- Updated: Red Team 2026-08-16 — exact roster, payload slot, type-in-phase-1 -->

## Context Links

- Issue: https://github.com/vinh19410/teacher-os/issues/5
- Action: `apps/web/src/lib/data-store-reducer.ts:21-29` (payload has no `classId` today)
- Case: `apps/web/src/lib/data-store-reducer.ts:165-190` (returns students only)
- Test: `apps/web/src/lib/data-store-reducer.test.ts:259-277`
- Seed classes: `c1`/`c2`/`c3` in `apps/web/src/lib/mock-data.ts:632-678`
- Vitest does **not** typecheck (`apps/web/vitest.config.ts:7-9`). `tsc --noEmit` does, and includes `*.test.ts`.

## Requirements

- Functional: tests describe omit / empty / unknown / valid `classId` before enroll behavior exists
- Non-functional: keep Vitest, no globals, no `@testing-library`

## Architecture

Allowed production change this phase: add `classId?: string` to the `add-student` payload type. Do **not** read it in the case body. Enroll stays unimplemented so the valid-`classId` membership test stays red.

Exact action shape (copy-paste; `classId` is inside `payload`, never top-level):

```ts
{
  type: "add-student",
  payload: {
    name: "Test Student",
    phone: "0900",
    parentName: "P",
    total: 8,
    price: 100,
    mode: "Online",
    classId: "c1", // omit this key on the omit case
  },
}
```

## Related Code Files

- Modify: `apps/web/src/lib/data-store-reducer.ts` (type field only)
- Modify: `apps/web/src/lib/data-store-reducer.test.ts`
- Do not modify: case body enroll logic, modal, routes

## Tests Before

1. Existing `add-student appends with pkg.done 0 and s- id` (omit `classId`):
   - keep `pkg.done === 0`, `remaining === 8`, `id` `/^s-/`
   - **add** `expect(next.classes).toEqual(before.classes)` — this assertion is new
   - stays green
2. Add `add-student with unknown classId leaves classes unchanged`:
   - payload includes `classId: "c-missing"`
   - student count +1
   - `next.classes` deep-equals `before.classes`
   - **green now** (characterization). Do not expect this to fail.
3. Add `add-student with empty classId leaves classes unchanged`:
   - `classId: ""`
   - same as omit
   - **green now**
4. Add `add-student with classId enrolls only that class`:
   - payload includes `classId: "c1"` (see literal above)
   - new student last in `students`, id `/^s-/`
   - exact roster: `nextC1.studentIds` equals `[...beforeC1.studentIds, added.id]` (no extra ids)
   - `expect(next.classes.find((c) => c.id === "c1")).toEqual({ ...beforeC1, studentIds: [...beforeC1.studentIds, added.id] })`
   - `expect(next.classes.filter((c) => c.id !== "c1")).toEqual(before.classes.filter((c) => c.id !== "c1"))` — locks c2 **and** c3
   - **red** until phase 2 (membership does not change)

After this phase: 1–3 green, 4 red. Not "2 new failures".

## Refactor

Type-only: `classId?: string` on the payload. Case body still `{ ...state, students: [...state.students, student] }`.

## Tests After

None in this phase.

## Implementation Steps

1. Add `classId?: string` to the action type.
2. Edit the test file with the four cases above.
3. Run `pnpm --filter web test`. Expect exactly the enroll-membership test to fail.
4. Do not implement the map-over-classes enroll yet.

## Todo

- [x] Add `classId?: string` to the payload type
- [x] Extend omit characterization (`classes` unchanged)
- [x] Add unknown + empty `classId` characterization (green)
- [x] Add exact-roster enroll test (red)
- [x] Confirm only the enroll-membership test fails

## Success Criteria

- [x] Omit / empty / unknown stay green
- [x] Valid `classId` test fails on roster membership, not on types
- [x] `tsc` accepts the new payload field (type added this phase)

## Risk Assessment

- Vitest will **not** fail on excess properties. Do not treat `pnpm --filter web test` as a type gate.
- If someone implements enroll in this phase, stop and revert the case body so TDD stays honest.

## Regression Gate

`pnpm --filter web test` — allowed to fail only on `add-student with classId enrolls only that class`.
