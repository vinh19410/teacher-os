---
phase: 2
title: "Client modal + e2e"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Client modal + e2e

## Overview

Make the create-class modal block the two QC symptoms before any network
call, and pin the fix with an e2e spec reproducing the exact QC repro
(21:00 → 08:00, sessions 0).

## Requirements

- Functional: submitting with `endTime <= startTime` shows
  "Giờ kết thúc phải sau giờ bắt đầu." and does not submit.
- Functional: submitting with total `0`, empty, or non-integer shows
  "Tổng số buổi phải từ 1 đến 52." and does not submit; total > 52 keeps the
  existing "Tổng số buổi tối đa là 52." error.
- Functional: default `19:00 → 20:30` and the auto-advance of end time
  (`changeStart`) keep working untouched.
- Non-functional: server remains the second gate — client validation mirrors
  the contract, it does not replace it.

## Architecture

Validation lives in the `submit` handler of
`apps/web/src/components/modals/add-class-modal.tsx`, extending the existing
`startTime === endTime` check to `endTime <= startTime` and replacing the
`Number.parseInt(total, 10) || 12` coercion (line 109 — the `0 → 12` bug)
with a strict integer parse: non-integer or outside 1..52 → error. The
payload keeps sending `sessionsTotal: parsedTotal` unchanged. The number
input's `min={0}` becomes `min={1}` to match.

## Related Code Files

- Modify: `apps/web/src/components/modals/add-class-modal.tsx` (submit validation + input min)
- Create/Modify: `apps/e2e/specs/class-operations.spec.ts` (or a sibling spec) — modal error path
- Test: web unit tests for any extracted helper if the repo pattern prefers
  pure-function tests over component tests (follow existing layout:
  `apps/web/src/lib/*.test.ts`)

## Implementation Steps

1. (TDD) If a unit-testable seam exists (extracted validator), write failing
   unit tests first; otherwise the e2e spec is the failing-first harness:
   extend the create-class e2e to open the modal, fill the QC repro
   (name QC-TEST-CLASS-E2E, start 21:00, end 08:00, sessions 0, pick a day),
   submit, and assert the visible error + that the class list did NOT gain
   the class.
2. In `submit`: replace the equality check with `endTime <= startTime` →
   `setError("Giờ kết thúc phải sau giờ bắt đầu.")`.
3. Replace `const parsedTotal = Number.parseInt(total, 10) || 12;` with a
   strict parse (`Number.parseInt` + `Number.isInteger` check); invalid or
   `< 1` → "Tổng số buổi phải từ 1 đến 52."; keep the `> 52` check and its
   existing message. Empty input now errors instead of silently defaulting
   to 12 — intentional (QC: sessions ≥ 1, no silent coercion).
4. Set the number input `min={1}`.
5. Run the web unit suite and the e2e create-class spec; fix the pre-existing
   e2e flows only if they relied on the coercion (they should not — they use
   defaults).

## Success Criteria

- [x] QC repro blocked in the modal with the expected Vietnamese messages
- [x] Existing default create flow (19:00–20:30, 12 buổi) unchanged
- [x] E2e spec proves no class is created on invalid input
- [x] Web unit suite + biome + tsc + build green

## Risk Assessment

- Risk: e2e specs elsewhere create classes with custom end times that could
  now fail server-side. Signal: e2e suite red. Response: adjust those specs'
  inputs to valid times — validation is the intended behavior.
- Risk: users who genuinely want cross-midnight classes now blocked. Signal:
  future QC/product feedback. Response: out of scope per issue #105; product
  can introduce an explicit "qua đêm" toggle later — the legacy parser keeps
  supporting such rows.
