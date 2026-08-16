---
title: "Class detail enroll student into viewed class"
description: "From class detail, + Thêm học viên creates a student and appends them to the viewed class roster."
status: completed
priority: P1
effort: "2h"
issue: 5
branch: fix/class-detail-enroll-student
tags: [bugfix, frontend]
blockedBy: []
blocks: []
created: 2026-08-16
---

# Class detail enroll student into viewed class

Tracking: #5

## Overview

Issue #5: class detail `+ Thêm học viên` opens `AddStudentModal`, but `add-student` only appends to `data.students`. `cls.studentIds` never changes, so the roster and count stay stale.

Fix: optional `classId` on `add-student`. When present and the class exists, append the new student id to that class's `studentIds` (no duplicates). Students list modal stays global-only.

## Scope Challenge

- Existing: `AddStudentModal`, `add-student` reducer, class detail reads `cls.studentIds`.
- Requested: enroll the new student into the viewed class (issue title). Relabel-only is the rejected alternative.
- Complexity: 4 files, 0 new services, 2 phases.
- Selected mode: HOLD SCOPE. Fast + `--tdd`.

## Outcome

After submit from class detail, the new student appears on that class roster and the "học viên" count increments. `/students` add-student still only creates a global student.

## Non-goals

- Picker to enroll an existing student
- Server, D1, Better-Auth, or persistence
- Changing `open-design/v1/teacher-os.html` (source mock has the same hole)
- Relabeling the button without enroll
- Playwright / component tests

## Load-bearing decisions

1. **Optional `classId` inside `add-student` payload**, not a top-level action field and not a separate `enroll-student`. Matches the current modal payload nest. `assign-syllabus` stays top-level `classId` — do not copy that shape onto `add-student`.
2. **Missing / empty `classId`:** create the student; leave `classes` unchanged. Same for unknown `classId` (`c-missing`). Class detail must pass a real id; `""` is omit, not enroll.
3. **Duplicate id:** append only if `!studentIds.includes(id)`.
4. **Do not mutate other class fields** (`sessionsDone`, notes, syllabus). Lock with exact object equality on the target class except `studentIds`.
5. **Students page** does not pass `classId`. Phase 1 *adds* `expect(next.classes).toEqual(before.classes)` on the omit case — the current test does not assert this yet (`data-store-reducer.test.ts:259-277`).
6. **Reducer tests + source-contract test.** Extend `data-store-reducer.test.ts`. Add `apps/web/src/lib/add-student-enroll.contract.test.ts` (read source files, no RTL) so wiring cannot be skipped. Gate: `pnpm --filter web test`.
7. **No `useState` snapshot of `classId`.** Modal reads the prop at submit. Class detail remounts the add-student modal with a **unique** sibling key `add-student-${cls.id}` so it does not collide with `AssignSyllabusModal`'s `key={cls.id}`.
8. **Demo store, not access control.** Any session can dispatch any id. Tests must keep the existing file comment: not a payment/authz control. Do not add `actorId`.

Issue #5 (verified via `gh issue view`, private repo — public fetch 404 is expected):

> Class detail `+ Thêm học viên` should enroll into the viewed class. The button opens AddStudentModal, but `add-student` only appends to the global student list — `cls.studentIds` never changes.

## Red Team Review

### Session — 2026-08-16
**Findings:** 16 unique after dedupe (8 assumption + 8 security; overlap on isolation/wiring)
**Severity breakdown:** 2 Critical, 10 High, 4 Medium
**Applied:** 9 accepted, 7 rejected

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| A1 / S3 | Wiring not locked by reducer-only TDD | Critical / High | Accept | Plan decision 6; Phase 2 contract test |
| S1 / A4 | `contains` + c2-only leaves c3 / extra ids untested | Critical / High | Accept | Phase 1 exact roster + other-classes equal |
| A2 | Phase 1 "2 failures" / Vitest typecheck is false | High | Accept | Phase 1 red/green contract |
| A3 | `classId` slot ambiguous vs top-level | High | Accept | Decision 1; Phase 1 literal |
| A5 | Missing `key={cls.id}` / useState snapshot | High | Accept | Decision 7; Phase 2 |
| A6 | Phase 1 forbids type change → `tsc` red | High | Accept | Phase 1 may add `classId?: string` to the type only |
| A7 | `check-types` needs `VITE_SERVER_URL` | High | Accept | Gates |
| A8 | Other class fields not locked | Medium | Accept | Phase 1 exact class object |
| S8 | "Existing test already asserts classes" is false | Medium | Accept | Decision 5 |
| S2 | Must add authz / sunset Action | High | Reject | Demo store; comment already exists |
| S4 | Unknown classId must reject create | High | Reject | Decision 2; issue is enroll-on-viewed-class, not 404-on-bad-id |
| S5 | Route param is IDOR | High | Reject | Single-tenant in-memory mock |
| S6 | Must test lesson-join side effects | Medium | Reject | New student has no lessons; exact roster suffices |
| S7 | PII length / double-submit | Medium | Reject | Existing modal; out of issue scope |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-start.md, phase-02-wire-classid-enroll-through-modal.md
- Decision deltas checked: 8 (payload slot, exact roster, type-in-phase-1, contract test, key, env gate, omit assertion wording, demo-no-authz)
- Reconciled stale references: phase 1 "2 failures" / "do not modify reducer type" / "contains c1, equals c2"
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-08-16
**Trigger:** `/ak:plan validate` required by vibe pipeline
**Questions asked:** 0 (issue title already chose enroll over relabel; remaining forks were red-team test-contract issues, not product choices)

#### Verification Results
- **Tier:** Light (Fact Checker)
- **Claims checked:** 12
- **Verified:** 10 | **Failed:** 2 | **Unverified:** 0

Failures (corrected in this revision):
1. Isolation c1-vs-c2 only — seed has c3 (`mock-data.ts:664-671`)
2. "Existing test asserts classes unchanged" — not in `data-store-reducer.test.ts:259-277`

#### Confirmed Decisions
- Enroll, do not relabel — issue title
- `classId` nested in payload — matches modal; not top-level like `assign-syllabus`
- Keep unknown-id create-only — KISS; students-page omit stays the same path
- No authz in this issue — demo store threat model

#### Action Items
- [x] Tighten Phase 1 tests (exact roster, c3, omit characterization)
- [x] Add source-contract test for wiring
- [x] Fix type/tsc and `VITE_SERVER_URL` gates

#### Impact on Phases
- Phase 1: type-only `classId?:`; red only on enroll membership
- Phase 2: contract test + `key={cls.id}` + env-prefixed check-types

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-start.md, phase-02-wire-classid-enroll-through-modal.md
- Decision deltas checked: 8
- Reconciled stale references: 4
- Unresolved contradictions: 0

## Cross-Plan Dependencies

None. Completed test-suite plan (`260816-1640-add-automated-web-app-test-suite`) already extracted the reducer; this plan only extends it.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Lock add-student tests and add enroll cases](./phase-01-start.md) | Pending |
| 2 | [Wire classId enroll through modal](./phase-02-wire-classid-enroll-through-modal.md) | Pending |

## Acceptance Criteria

- [ ] `add-student` without `classId` (and with `classId: ""`) appends a student and leaves `classes` deep-equal
- [ ] `add-student` with valid `classId` sets that class `studentIds` to `[...prev, newId]` only; every other class object is unchanged
- [ ] `add-student` with unknown `classId` still creates the student and leaves `classes` unchanged
- [ ] Source-contract test: class detail passes unique remount key + `classId={cls.id}`; students list omits `classId`
- [ ] `pnpm --filter web test` and `VITE_SERVER_URL=http://localhost:3000 pnpm check-types` pass

## Implementation

- Branch: `fix/class-detail-enroll-student`
- Mode: beta
- Route: bugfix via `/ak:fix`

<!-- slug: class-detail-enroll-student-into-viewed-class -->
