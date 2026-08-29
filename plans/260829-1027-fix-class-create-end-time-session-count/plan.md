---
title: "fix-class-create-end-time-session-count"
description: "Issue #105: block end-before-start class creation and sessions=0→12 coercion, at both client modal and server contract."
status: completed
priority: P1
effort: "4h"
tags: [bugfix, qc, issue-105]
created: 2026-08-29
issue: 105
branch: fix/class-create-end-time-session-count
ship: beta
route: bugfix
---

# fix-class-create-end-time-session-count

## Overview

QC issue #105 (P1): the create-class modal accepts an end time BEFORE the start
time (e.g. 21:00–08:00), and "Tổng số buổi" 0 is silently coerced to 12.
Root cause is traced, not guessed:

1. `apps/web/src/components/modals/add-class-modal.tsx:99` only rejects
   `startTime === endTime` — `endTime < startTime` passes.
2. `apps/web/src/components/modals/add-class-modal.tsx:109` uses
   `Number.parseInt(total, 10) || 12`; `0` is falsy so 0 becomes 12.
3. `packages/api/src/contracts.ts` `classCreateSchema` deliberately allows
   `end <= start` ("crosses midnight — valid") and `sessionsTotal` `min(0)`
   with `.default(12)` — so the server never blocks either symptom.

Decision (design fork resolved): **tighten the contract at creation time**
(Option A). QC's expected behavior is the source of truth: creation must
reject `end <= start` ("Giờ kết thúc phải sau giờ bắt đầu") and require
sessions ≥ 1. Rationale:

- The whole downstream system already assumes 1..52: the server lesson
  generator returns `[]` for `sessionsTotal <= 0` (kernel.ts:80), and the
  client projection `projectClassSessions` fails closed for
  `sessionsTotal <= 0` and documents the create range as "1..52"
  (class-sessions.ts:122,131). `min(1)` aligns the schema with reality.
- Reversing the "end <= start crosses midnight" design at CREATION time only:
  legacy stored rows keep parsing because `parseStoredSchedule`
  (packages/api/src/skeleton.ts) guards only `start === end` — existing
  classes (including the QC-created `21:00–08:00` row) still display and
  generate. The midnight-wrapping duration math
  (`(end - start + 1440) % 1440`) stays untouched for legacy data.
- `start === end` rejection already exists in both layers; this plan extends
  it to `end <= start` — same mechanism, same error channel.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Server contract rejects `schedule.end <= schedule.start` and `sessionsTotal < 1` at class creation | P1 |
| 2 | Create-class modal blocks both with clear Vietnamese errors before submit | P1 |
| 3 | Legacy rows with `end < start` or stored totals still parse/display (no migration) | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Contract + server tests-first](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Client modal + e2e](./phase-02-client-modal-e2e.md) | Pending |

## Success Criteria

- [ ] `POST /classes` returns 400 for `end < start`, `end === start`, and `sessionsTotal = 0` (server test proves it)
- [ ] `classCreateSchema` keeps `.default(12)` for omitted `sessionsTotal` (existing behavior preserved)
- [ ] Modal shows "Giờ kết thúc phải sau giờ bắt đầu." for 21:00→08:00 and blocks submit
- [ ] Modal shows "Tổng số buổi phải từ 1 đến 52." for 0/empty/non-integer and blocks submit
- [ ] E2e create-class spec asserts the modal error path (no class created)
- [ ] `parseStoredSchedule` unchanged — legacy `end < start` rows still parse (existing tests green)
- [ ] Full web unit suite, server test suite, biome, tsc, build, e2e all green

## Out of Scope

- Editing/migrating already-stored classes with `end < start` (display-only legacy tolerance).
- Changing midnight-wrapping duration math for legacy rows.
- Class-edit endpoints (none exist; see contracts.ts cap comment).
- Any admin/backend override for cross-midnight classes (product can revisit later if a real need appears).

## Red Team Review

Spawned reviewers unavailable (agent provider not configured) — adversarial
review run inline with the Security Adversary + Assumption Destroyer lenses,
evidence-based against the worktree code.

| # | Severity | Finding | Evidence | Disposition |
|---|----------|---------|----------|-------------|
| 1 | Critical | Plan claimed `readBody` returns 422; it returns **400** (`invalid body`) on zod failure | `apps/server/src/routes/kernel.ts:151` | Accept — plan + phase-01 corrected to 400 |
| 2 | Critical | Existing server test **asserts the old behavior**: "invalid time format is 400; overnight end<start is 201" expects 23:00→00:30 → 201. Must be flipped to 400 explicitly or the TDD loop contradicts itself | `apps/server/src/kernel.test.ts:444-452` | Accept — phase-01 step 1 now names the test flip; assertion change is intentional behavior change, not weakening |
| 3 | Medium | E2e helpers/specs might seed `end < start` or `sessionsTotal: 0` and break after the contract change | `apps/e2e/specs/helpers-dated-class.ts:30-33` (defaults 19:00→20:30, 4), specs use totals 12/8/4 | Reject (evidence shows all valid) — verified no e2e fixture violates the new rules |
| 4 | Medium | Other API consumers/seed scripts hit `POST /classes` and would break | grep across `scripts/`, `open-design/`, `packages/` | Reject (no codebase evidence) — only consumer is the web modal |

**Total:** 4 findings — 2 accepted (both fixed in plan before implementation), 2 rejected (no evidence).

### Whole-Plan Consistency Sweep

Re-read `plan.md`, `phase-01-start.md`, `phase-02-client-modal-e2e.md` after
edits: status codes now consistently 400 across all files (no stale "422"
remaining); the flipped-test callout appears only in phase-01 (correct
ownership); phases table lists both phases matching files on disk; success
criteria reference messages identical to phase-02 step texts; no rejected
assumptions or renamed files remain. **Zero unresolved contradictions.**
