---
phase: 5
title: "Truthful mutation failure UI"
status: pending
priority: P1
effort: "2-3d"
dependencies: []
---

# Phase 5: Truthful mutation failure UI

## Overview

Make every current kernel mutation expose a precise commit/refresh outcome, retain input on a definite failure, and prevent blind retry after an unknown outcome.

## Requirements

- Inventory every current `KernelAction` and dispatch call site, including create/update class notes, syllabus module/lesson, assignment grade and comment bank; the matrix is a required artifact.
- Replace `Promise<string | undefined>` with a discriminated command result that distinguishes committed, refreshed, definite failure and outcome-unknown. `id` is optional metadata, not the success signal.
- Pending UI prevents duplicate submit; all direct actions await the result.
- Definite failure preserves entered input. Outcome-unknown first performs a snapshot reconciliation and must not offer a blind replay that could duplicate a create.
- Preserve endpoint behavior and product flows; do not add optimistic persistence. Do not silently change comment-bank idempotency semantics.

## Architecture

`createKernelCommandBus` currently returns `json.id`, but successful non-create endpoints return `{ ok: true }`; it also collapses network uncertainty and definite error. Normalize the client result contract around HTTP acknowledgment and snapshot status, then make consumers react to that contract. A successful commit with refresh failure is not a failed write, while a response-loss outcome is not safe to replay.

## Related Code Files

- Modify: `apps/web/src/lib/data-provider.tsx`, `apps/web/src/lib/repos/kernel.ts`, `apps/web/src/lib/data-actions.ts` only if types require it.
- Modify: `apps/web/src/components/modals/add-class-modal.tsx`, `add-student-modal.tsx`, `add-syllabus-modal.tsx`, `assign-syllabus-modal.tsx`, `add-module-modal.tsx`, `edit-module-modal.tsx`, `add-lesson-modal.tsx`, `edit-lesson-modal.tsx`, `grade-modal.tsx`.
- Modify: `apps/web/src/components/schedule/lesson-modal.tsx`, `apps/web/src/routes/_auth/dashboard.tsx`, `apps/web/src/routes/_auth/tuition.tsx`, `apps/web/src/routes/_auth/classes/$classId.tsx`.
- Modify/create: targeted Vitest/component-level contract tests matching current project conventions.
- Inspect: `apps/web/src/components/modals/grade-modal.tsx`, `apps/web/src/lib/data-provider.tsx`.

## Implementation Steps

1. Produce action-to-caller matrix from all `KernelAction` members; resolve every current consumer before code changes.
2. Characterize create (`{ id }`), non-create (`{ ok: true }`), HTTP error, response-loss and refresh-failure behavior in `kernel` tests.
3. Implement the discriminated result and a minimal consumer helper only where it removes duplicate branching.
4. Make every matrix target await resolution; close/reset/navigate only after committed result. Reconcile snapshot before any manual retry after unknown outcome.
5. Add failure/success/pending/reconciliation tests for each action family.

## Success Criteria

- [ ] Action/caller matrix covers every current `KernelAction` and has no unresolved caller.
- [ ] No target action closes/resets/navigates after a definite write failure; unknown outcome cannot be replayed blindly.
- [ ] Direct check-in/cancel/mark-paid/notes has visible outcome and cannot double-submit while pending.
- [ ] Successful `{ id }` and `{ ok: true }` commands both retain expected behavior, with server-confirmed commit and explicit snapshot status.
- [ ] Root test/type/build gates pass.

## Risk Assessment

Load-bearing behavior: network response loss can follow a committed server write. Signal: transport throws before client receives a response. Response: reconcile snapshot first and require user confirmation before reissuing a potentially duplicating create; preserve comment-bank’s documented idempotency exception.
