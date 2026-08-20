---
phase: 5
title: "Truthful mutation failure UI"
status: completed
priority: P1
effort: "2-3d"
dependencies: []
---

# Phase 5: Truthful mutation failure UI

## Overview

Make every current kernel mutation expose a precise commit/refresh outcome, retain input on a definite failure, and prevent blind retry after an unknown outcome.

## Requirements

- Inventory every current `KernelAction` and dispatch call site, including create/update class notes, syllabus module/lesson, assignment grade and comment bank; the matrix is a required artifact and classifies each action by its actual acknowledgment (create `{ id }` 201, grade-assignment update `{ id }` 200, comment-bank `{ id }` 201-or-dedupe-200, plain update `{ ok: true }`) — never by response body shape alone.
- Replace `Promise<string | undefined>` with a discriminated command result that distinguishes committed, refreshed, definite failure and outcome-unknown. `id` is optional metadata, not the success signal — but callers that need an id to navigate (add-syllabus) may only navigate on the refreshed state.
- Failure classification is transport-aware, produced where the HTTP status is still visible (`postKernelCommand` throws a typed error carrying HTTP status vs transport cause): 4xx responses are definite failure (server did not commit); 5xx responses (502/503/504/…), 408/429, fetch rejection and timeout are outcome-unknown (a committed write may have lost its response).
- Pending UI prevents duplicate submit per target; all direct actions await the result. The bus must not run a second identical dispatch that was queued while one was pending (drop or no-op it), and a server 409 duplicate-guard response arriving after a successful identical action must not surface as a write failure.
- Definite failure preserves entered input. Outcome-unknown first performs a snapshot reconciliation and must not offer a blind replay that could duplicate a create.
- Committed-but-refresh-failed is not a failed write, but it is also not permission to navigate: navigation to store-backed routes only on refreshed; committed-unrefreshed keeps the modal open (or shows a saved-not-refreshed state) with a reconcile affordance.
- Reconciliation semantics (no correlation key exists for creates, and endpoint behavior is preserved): reconcile = fetch the latest snapshot through the serialized apply path, show the user the current state, and require explicit confirmation before reissuing a create — it is a "latest state + possible-duplicate warning", never an automatic "not written" verdict. The residual race (a lost-response write committing after the snapshot was fetched) is an accepted remaining risk and must be stated in the UI copy.
- Comment-bank idempotency depends on `operationId` lifecycle: keep the same `operationId` for any replay after an outcome-unknown (server dedupes to 200 `{ id }`); regenerate it only when retrying after a definite failure with edited text (avoids the server's operationId-payload 409). Do not silently change comment-bank idempotency semantics.
- Consolidate error surfacing: the new discriminated result absorbs the `onError(kind)` channel (no parallel duplicate signals); the global error toast no longer claims definite "chưa được ghi" for unknown outcomes; modal-owned failures suppress the global toast; direct actions keep the toast/per-row state as their visible outcome channel.
- Preserve endpoint behavior and product flows; do not add optimistic persistence.

## Architecture

`postKernelCommand` returns `json.id` for create-shaped endpoints (`apps/server/src/routes/kernel.ts` creates at :207/:252/:405/:441/:502, plus grade-assignment `{ id }` 200 and comment-bank dedupe `{ id }` 200), while plain update endpoints return `{ ok: true }` (:278/:299/:347/:377/:464/:541). The bus today collapses three distinct terminal states into `string | undefined`: write failure → undefined, refresh failure → undefined for everything except `add-comment-bank` (which resolves the id, see `kernel.ts:224-238`), success → id. It also reports HTTP errors and network loss through one exception path (`kernel.ts:158-160`, `:219-222`), so callers cannot tell definite non-commit from response loss.

Normalize the client result contract around HTTP acknowledgment (2xx status + typed error cause) and snapshot status, then make consumers react to that contract: 2xx + snapshot applied → refreshed; 2xx + refresh failed → committed (id carried as metadata); 4xx → definite failure; 5xx/408/429/transport throw → outcome-unknown. A successful commit with refresh failure is not a failed write, while a response-loss outcome is not safe to replay.

Close-as-success (form modals) requires refreshed; close-as-navigation (`schedule/lesson-modal.tsx` cancel/check-in) may close immediately but must surface the action's pending/outcome state elsewhere (row state or toast) — do not lock user navigation behind the serialized queue.

## Related Code Files

- Modify: `apps/web/src/lib/data-provider.tsx`, `apps/web/src/lib/repos/kernel.ts`, `apps/web/src/lib/data-actions.ts` only if types require it.
- Modify: `apps/web/src/components/modals/add-class-modal.tsx`, `add-student-modal.tsx`, `add-syllabus-modal.tsx`, `assign-syllabus-modal.tsx`, `add-module-modal.tsx`, `edit-module-modal.tsx`, `add-lesson-modal.tsx`, `edit-lesson-modal.tsx`, `grade-modal.tsx`.
- Modify: `apps/web/src/components/schedule/lesson-modal.tsx`, `apps/web/src/routes/_auth/dashboard.tsx`, `apps/web/src/routes/_auth/tuition.tsx`, `apps/web/src/routes/_auth/classes/$classId.tsx`.
- Modify: `apps/web/src/lib/repos/kernel.test.ts` and `apps/web/src/lib/kernel-runtime.contract.test.ts` — both lock the current `Promise<string | undefined>` contract and modal source shape; their assertions must be rewritten to the new discriminated contract (characterize first, then replace — never delete coverage).
- Create: node-env Vitest unit/contract tests for the discriminated result, transport-aware classification, dedupe/queue behavior, and the consumer helper. The repo has no DOM test infrastructure (`apps/web/vitest.config.ts` is `environment: "node"`; no jsdom/@testing-library) — do not add DOM test deps in this phase; modal/direct-action UI behavior is verified in Phase 6 UAT.

## Implementation Steps

1. Produce the action-to-caller matrix from all 14 `KernelAction` members (16 call sites: `lesson-modal.tsx:66,75`, `dashboard.tsx:74`, `tuition.tsx:174`, `classes/$classId.tsx:224`, nine modals); resolve every consumer before code changes. The matrix records each action's acknowledgment shape, create/update kind, replay safety, and per-caller gating rule (close-as-success vs close-as-navigation).
2. Characterize in `kernel.test.ts`: create `{ id }` 201, grade-assignment `{ id }` 200, comment-bank `{ id }` 201 and dedupe-200, plain update `{ ok: true }`, 4xx definite failure, 5xx/408/429 response-loss, fetch rejection, and refresh-failure paths — including today's comment-bank id-after-refresh-failure exception.
3. Implement the typed transport error (HTTP status vs transport cause) in `postKernelCommand`, the discriminated result in the bus (absorbing `onError(kind)`), in-flight identical-dispatch dedupe, and a minimal consumer helper only where it removes duplicate branching.
4. Make every matrix target await resolution; close/reset/navigate only after the refreshed result (committed-unrefreshed never navigates to store-backed routes). For direct actions: per-target pending state, disabled while pending, visible outcome; 409 duplicate-guard after a successful identical action is not a failure. Outcome-unknown: reconcile via a snapshot refresh exposed through the store (the store's public surface gains a reconcile/refresh function), show latest state + possible-duplicate warning, and require explicit user confirmation before reissuing a create.
5. Rewrite the existing kernel/bus and source-scan contract tests to the new contract, and add unit tests for each action family's failure/success/pending/reconciliation classification.

## Success Criteria

- [x] Action/caller matrix covers every current `KernelAction` and has no unresolved caller. (artifact: `reports/action-caller-matrix-phase-05.md`)
- [x] No target action closes/resets/navigates after a definite write failure; unknown outcome cannot be replayed blindly (reconcile + explicit confirmation first); committed-unrefreshed never navigates to a store-backed route.
- [x] Direct check-in/cancel/mark-paid/notes has visible outcome and cannot double-submit while pending; a duplicate-guard 409 is not reported as a write failure.
- [x] Successful `{ id }` (201 and 200) and `{ ok: true }` commands all resolve committed, with server-confirmed commit and explicit snapshot status; 5xx/transport loss classifies as outcome-unknown, 4xx as definite failure.
- [x] Comment-bank replays after unknown outcome reuse the same `operationId`; definite-failure retry with edited text regenerates it; existing idempotency exception behavior retained.
- [x] `kernel.test.ts` and `kernel-runtime.contract.test.ts` rewritten to the new contract (no coverage deleted); new unit tests cover the classification matrix.
- [x] Root test/type/build gates pass. (verified 2026-08-20: test 123/123 web + server/auth/infra green, check-types 5/5, build green, biome clean of new diagnostics)

## Risk Assessment

Load-bearing behavior: network response loss can follow a committed server write. Signal: transport throws or a 5xx/timeout response arrives before the client can confirm commit. Response: reconcile snapshot first (refresh + latest state + possible-duplicate warning) and require user confirmation before reissuing a potentially duplicating create; preserve comment-bank's documented idempotency exception. Residual risk: a write can still commit after the reconciliation snapshot was fetched (client timeout ≠ server abort) — accepted and surfaced in UI copy, not silently resolved. Cross-phase note: phase-04 rewrites `data-provider.tsx` and `repos/kernel.ts` too; whoever runs phase-4 next must reconcile with this contract change (kept out of `dependencies:` because issue #32 scopes this phase as independent).

## Red Team Review

### Session — 2026-08-20
**Findings:** 24 raw from 3 reviewers (Security Adversary/Fact Checker, Failure Mode Analyst/Flow Tracer, Assumption Destroyer/Scope Auditor) → 10 deduplicated
**Severity breakdown:** 3 Critical, 5 High, 2 Medium (deduplicated)
**Disposition:** 10 adjudicated — 9 Accept, 1 Reject

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Response-shape taxonomy wrong: grade-assignment returns `{ id }` 200 (update), comment-bank dedupe returns `{ id }` 200; classify by matrix + 2xx status, not body shape | Critical | Accept | Requirements, Architecture, Step 1-2 |
| 2 | committed-but-refresh-failed has no UI policy → 404 navigation on stale store / duplicate create; navigate only on refreshed | Critical | Accept | Requirements, Step 4, Success Criteria |
| 3 | 5xx/408/429 responses classified as definite failure reopens duplicate-create hole; only 4xx is definite; typed error needed where status is visible | Critical | Accept | Requirements, Architecture, Step 3 |
| 4 | Snapshot reconciliation unspecified and unverifiable: no correlation keys for creates; spec as refresh + latest state + confirmation warning; residual race acknowledged | High | Accept | Requirements, Step 4, Risk Assessment |
| 5 | Comment-bank operationId lifecycle breaks idempotency across unknown-outcome replay; 409 trap on same operationId + edited text | High | Accept | Requirements, Success Criteria |
| 6 | `kernel.test.ts` + `kernel-runtime.contract.test.ts` lock current contract and will fail; missing from file list | High | Accept | Related Code Files, Step 5 |
| 7 | "Component-level tests matching current conventions" invokes nonexistent DOM-test convention; decide node-env only, UAT in phase 6 | High | Accept | Related Code Files, Step 5 |
| 8 | Direct actions lack pending state; bus queue runs duplicate dispatch; 409 after success shows false-failure toast; close-as-navigation vs close-as-success conflated | Medium | Accept | Requirements, Architecture, Step 4 |
| 9 | Global toast makes definite-claim ("chưa được ghi") for unknown outcomes; `onError(kind)` must be consolidated with the new result | Medium | Accept | Requirements, Step 3 |
| 10 | Phase-5 should depend on phase-04 (same files) | Medium | Reject | Issue #32 scopes this phase "Depends on: none"; cross-phase reconciliation note added to Risk Assessment instead |

### Whole-Plan Consistency Sweep
Swept `plan.md` + all six phase files after applying findings. No stale references to the replaced `Promise<string \| undefined>` contract exist outside phase-05 (umbrella `plan.md` describes phase-5 only at goal level: "UI chỉ close/reset sau commit xác nhận" — consistent with the stricter refreshed-only navigation rule). Phase-06 UAT checklist unchanged and remains the verification surface for modal/direct-action UI behavior per finding 7. No unresolved contradictions.
