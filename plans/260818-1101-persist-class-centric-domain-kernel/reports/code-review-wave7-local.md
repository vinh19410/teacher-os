---
type: code-review
date: 2026-08-19
scope: Wave 7 local pre-landing review
base: origin/develop@67d3973
verdict: approve
---

# Code Review Wave 7 — Local Pre-Landing

## Code Review Summary

### Scope

- Files: 34 implementation/plan files excluding this review report; server routes/tests, web store/modal/adapters/tests, API contract, 3 DB schemas, generated SQL/meta, phase plan + red-team reports.
- Focus: Stage 2 quality after independent Stage 1 spec-compliance PASS.
- Scout findings: traced every new loader/schema/action consumer. No N+1, hidden direct fetch, second hydration cache, report/notif writer, or tenant-unscoped consumer found.
- Cycle 1 verification supplied by independent tester: Biome exit 0 (5 warnings + 2 info baseline outside diff), no-cache typecheck 5/5, web 109 + server 50 + CI 1 tests green, focused Wave 7 server 6 + web 38, build green.
- Cycle 2 verification after idempotency fix: server 51/51, web 109/109, no-cache typecheck 5/5, diff-check green. Local review additionally verified the 0005→0006 snapshot predecessor, unchanged tables/meta, required operation column, and composite unique index.
- Cycle 3 verification after payload-binding fix: server 51/51, web 109/109, forced no-cache typecheck 5/5, diff-check green. Local review re-walked same-key concurrency, cross-tenant reuse, mismatched payload, and the user-visible retry state.

### Overall Assessment

Implementation matches the accepted Wave 7 contract and is production-ready for beta: canonical snapshot hydration, explicit DTOs, same-org report relation guard, strict comment input, CSRF guard inheritance, serialized grade→comment order, and no report/notif write routes. Cycle 1's lost-ACK blocker is fully resolved by a per-modal-operation UUID, an atomic tenant-scoped unique constraint, immutable post-grade feedback, and server-side binding of the operation ID to the normalized payload. No Critical or Important issue remains.

Quality score: **9.4/10**. Verdict: **Approve**.

### Critical Issues

None.

### High Priority

None.

### Resolved Important — Cycles 2–3

1. **Lost POST acknowledgement no longer duplicates an append.** GradeModal generates a new UUID per open/assignment and keeps it unchanged through a failed retry (`apps/web/src/components/modals/grade-modal.tsx:28-30`, `apps/web/src/components/modals/grade-modal.tsx:48-58`, `apps/web/src/components/modals/grade-modal.tsx:89-94`). The action and transport preserve that value (`apps/web/src/lib/data-store-reducer.ts:21`, `apps/web/src/lib/repos/kernel.ts:115-119`). D1 enforces unique `(org_id, operation_id)` (`packages/db/src/schema/comment-bank.ts:27-30`; `packages/db/src/migrations/0006_abandoned_tarot.sql:1-2`). Server insert uses atomic conflict handling, then retrieves only the matching row in the authenticated org (`apps/server/src/routes/reporting/index.ts:60-88`). This is race-safe: there is no read-check-write window. Concurrent same-key/same-text requests converge to one row and ID; same-key/different-text requests let one payload win and reject the other. Same UUID in another org does not conflict.

2. **Accepted duplicate-text semantics remain intact.** Different logical grading flows receive different operation IDs, so equal text remains two rows; server regression test proves this (`apps/server/src/kernel.test.ts:1073-1093`). Replaying one operation returns the original ID with one stored row (`apps/server/src/kernel.test.ts:1095-1120`).

3. **An operation cannot silently replay with a different payload.** Zod normalizes text before persistence/comparison; after the grade commits, all score and feedback inputs are disabled while the retry submit remains available (`apps/web/src/components/modals/grade-modal.tsx:31`, `apps/web/src/components/modals/grade-modal.tsx:65-99`, `apps/web/src/components/modals/grade-modal.tsx:161-166`). A custom/stale caller that reuses the key with different normalized text receives 409 and cannot overwrite or receive a false success (`apps/server/src/routes/reporting/index.ts:75-88`; `apps/server/src/kernel.test.ts:1121-1131`). The same operation ID is independently valid in another authenticated org, proved with a distinct committed ID (`apps/server/src/kernel.test.ts:1133-1146`).

### Medium Priority

None.

### Low Priority — Suggestions, Non-Blocking

1. **GradeModal’s key state machine is only source-regex tested.** The test checks token presence, not ordering, blank-feedback skip, immutable retry payload, or retry behavior (`apps/web/src/lib/kernel-runtime.contract.test.ts:106-118`). The command-bus refresh/ACK behavior is genuinely executed (`apps/web/src/lib/repos/kernel.test.ts:594-613`), and manual source review confirms grade precedes comment and locks feedback after the grade ACK (`apps/web/src/components/modals/grade-modal.tsx:31`, `apps/web/src/components/modals/grade-modal.tsx:68-99`, `apps/web/src/components/modals/grade-modal.tsx:161-166`). Do not add a DOM dependency or refactor solely for beta; document this gap. When the project adopts a component harness, add deferred-dispatch interaction tests for grade failure, comment failure, blank feedback, and retry-only-comment.

2. **Route-param change can let an old async submit mutate the new modal instance.** The effect explicitly supports `assignmentId` changing while mounted (`apps/web/src/components/modals/grade-modal.tsx:42-58`), but an in-flight closure later calls `setGradeSaved`, `setFeedback`, and `onClose` without checking that identity (`apps/web/src/components/modals/grade-modal.tsx:77-105`). The write still targets the captured old assignment, so no cross-assignment grade corruption was found; impact is transient UI reset/close after browser navigation. Add an operation generation/ref guard before post-await UI mutations when a component harness exists.

3. **Report status and notification dot unions are compile-time only.** Drizzle `$type` narrows TypeScript (`packages/db/src/schema/report.ts:21`, `packages/db/src/schema/notif.ts:18`), while generated SQL has no CHECK constraint (`packages/db/src/migrations/0005_mature_sasquatch.sql:17-18`, `packages/db/src/migrations/0005_mature_sasquatch.sql:29-30`). Loaders trust these values as wire unions (`apps/server/src/routes/reporting/loaders.ts:19-20`, `apps/server/src/routes/reporting/loaders.ts:42-43`), and the notification UI indexes a closed color map (`apps/web/src/components/layout/notif-panel.tsx:20-22`). This does not block beta because there is no public report/notif writer or import surface. Before adding one, enforce DB CHECK constraints or validate/sanitize rows at the server DTO boundary.

### Edge Cases Found by Scout

- Commit succeeded + response lost: retry carries the same operation ID; atomic unique conflict returns the existing row only when normalized payload matches (`apps/server/src/routes/reporting/index.ts:60-88`; `apps/server/src/kernel.test.ts:1095-1120`).
- Same operation ID + different normalized text: server returns 409 and preserves the winner; same operation ID in a different org remains independent (`apps/server/src/kernel.test.ts:1121-1146`).
- POST ACK received + snapshot refresh fails twice: correctly returns comment ID without replay (`apps/web/src/lib/repos/kernel.ts:250-264`), exercised at `apps/web/src/lib/repos/kernel.test.ts:587-601`.
- Comment POST fails after grade success: `gradeSaved` keeps scores and feedback locked, while retry skips grade and resubmits the same text and operation ID (`apps/web/src/components/modals/grade-modal.tsx:31`, `apps/web/src/components/modals/grade-modal.tsx:65-99`, `apps/web/src/components/modals/grade-modal.tsx:161-166`). This intentionally prevents editing a typo after grade commit; cancel/reopen starts a new logical operation, consistent with the accepted plan.
- Feedback trims empty: no comment POST (`apps/web/src/components/modals/grade-modal.tsx:65`, `apps/web/src/components/modals/grade-modal.tsx:89`).
- Malformed report relation: same-org student join suppresses row (`apps/server/src/routes/reporting/loaders.ts:23-29`), exercised at `apps/server/src/kernel.test.ts:1050-1071`.
- Stale assignment param while async work is pending: UI-only concern above; captured action still targets old assignment ID.

### Trust Boundary and API Checklist

- Authentication: reporting subrouters remain inside the authenticated kernel chain (`apps/server/src/routes/kernel.ts:544-549`; `apps/server/src/app.ts:96-99`).
- Authorization/tenant: all reads and comment writes derive `orgId` from session membership; no client tenant field (`apps/server/src/routes/reporting/index.ts:44-63`; `apps/server/src/routes/reporting/loaders.ts:28-29`, `apps/server/src/routes/reporting/loaders.ts:45-46`, `apps/server/src/routes/reporting/loaders.ts:60-61`). The accepted Wave 7 decision not to redesign global roles remains supported: bootstrap creates teacher memberships and no role-management/import surface was added (`apps/server/src/app.ts:53-79`).
- CSRF/content type: comment POST is mounted after exact-Origin + JSON-only middleware (`apps/server/src/routes/kernel.ts:39-53`, `apps/server/src/routes/kernel.ts:544-549`).
- Input/PII: strict trimmed 1–2000 text plus UUID operation ID, server-owned tag, payload-conflict rejection, generic error output (`packages/api/src/contracts.ts:87-95`; `apps/server/src/routes/reporting/index.ts:49-88`). Raw feedback is not logged or emitted in errors; React renders escaped text (`apps/web/src/routes/_auth/assignments/$assignmentId.tsx:132-143`).
- Query efficiency: snapshot starts three direct indexed queries in the existing `Promise.all`; no query loop (`apps/server/src/routes/snapshot.ts:52-129`). All list filters/order match composite org-created-id indexes (`packages/db/src/schema/report.ts:28-31`, `packages/db/src/schema/notif.ts:23-25`, `packages/db/src/schema/comment-bank.ts:19-25`).
- Compatibility: snapshot only adds fields and all monorepo consumers typecheck. Base `origin/develop` ends at migration 0004, so unshipped 0005 creates an empty table before 0006 adds the required operation column/index. Fresh-chain migration is exercised by all 51 server tests. Generated 0005→0006 predecessor and all unrelated tables/views/meta are structurally unchanged.
- No-op contracts: no POST report route and no notif mutation route are mounted (`apps/server/src/routes/reporting/index.ts:34-40`); server tests assert 404/no mutation (`apps/server/src/kernel.test.ts:1187-1204`). Both UI report entry points still share a close-only modal (`apps/web/src/lib/kernel-runtime.contract.test.ts:78-96`).

### Maintainability and Scope

- New files follow existing domain adapter/schema/route boundaries. The small shared list-router helper serves three endpoints; no generic manager or parallel data path was introduced (`apps/server/src/routes/reporting/index.ts:21-43`).
- Large legacy `kernel.ts`/`kernel.test.ts` files were not broadened with new handler logic; reporting implementation lives in a module. Extracting the test block can wait until a real test-boundary benefit appears.
- Fixture changes only satisfy the widened required snapshot contract. Plan and red-team report edits are directly tied to Issue #17. No unrelated source rewrite detected.

### Recommended Actions

1. Proceed with beta ship; no Critical/Important finding remains.
2. Keep GradeModal DOM/state-machine coverage and runtime enum enforcement as documented follow-ups; neither requires a new beta dependency/refactor.

### Metrics

- Type coverage: percentage not instrumented; no-cache typecheck 5/5 packages green.
- Test coverage: percentage not instrumented; Cycle 3 server 51/51 and web 109/109 green. Prior CI/build gates also green.
- Linting issues: 0 new errors; 5 warnings + 2 info are baseline outside diff.
- Blocking findings: 0 Important; 0 Critical.

### Plan Follow-up

- Phase 8 implementation tasks and accepted review fix appear code-complete; project manager may mark this phase complete after the controller's final ship gate.
- Parent plan must remain in progress because Phase 9 is out of this Wave.

### Unresolved Questions

None.

Status: DONE_WITH_CONCERNS
Summary: Cycle 3 payload binding verified; implementation is ready for beta ship.
Findings: 0 Critical, 0 Important, 3 Suggestions non-blocking.
Verdict: Approve
Concerns/Blockers: None; retained concerns are future component-harness and runtime-enum hardening only.
