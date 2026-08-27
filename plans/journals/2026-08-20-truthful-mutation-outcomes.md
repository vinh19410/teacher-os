---
title: Truthful mutation outcomes
date: 2026-08-20
summary: Kernel mutation contract shipped to develop (issue #32, phase 5) — the UI only closes/resets on a confirmed refreshed commit and can never blindly replay an unknown outcome
---

# Truthful mutation outcomes

## What happened

Shipped phase 5 of the production-readiness plan: the kernel command bus now resolves a discriminated `KernelCommandResult` (`refreshed | committed | definite-failure | outcome-unknown`) instead of `Promise<string | undefined>`, and all 14 `KernelAction` call sites (16 dispatch sites, matrix artifact committed) react to the truthful outcome — modals close/reset/navigate only on `refreshed`, definite failures preserve the entered input, and an unknown outcome blocks the submit path until a queue-serialized snapshot reconcile succeeds. Beta pipeline (`/ak:vibe --ship --beta --advice`): plan reuse + 3-lens red-team (24 raw → 9 applied) → TDD implementation → tester/code-review cycles → mid-flight merge with phase 4 (same three files) → PR to develop → merge → CI watch.

## Decisions

- Only a 4xx response proves non-commit. 5xx/408/429 and transport losses classify as outcome-unknown because an edge 502/504 can follow an origin commit — classifying those as "definite failure" was exactly the duplicate-create hole (red-team Critical #3).
- Classification happens at the transport boundary: `postKernelCommand` throws phase-4's `HttpError` (reused from kernel-load-state, not a new class) carrying the status; `classifyWriteFailure` maps it. A committed-but-unrefreshed write resolves `committed` with the id as metadata — never a failure, never navigation permission (the old comment-bank-only exception is absorbed into the uniform result).
- Blind-replay blocking lives in the hook (`useKernelFormSubmit.submitBlocked`), not just the disabled button, so the Enter/form-submit path is guarded too; mid-save close is blocked so a pending outcome always has a surface. Direct actions get per-target pending state plus `planDirectOutcome` toasts; a duplicate-guard 409 heals the stale store instead of reporting a false write failure.
- Comment-bank idempotency survives unknown outcomes: the `operationId` parks in a module-level map on unknown (reopen reuses it → server dedupes to 200), and regenerates only after a definite failure (avoids the operationId-payload 409 on edited text).
- The phase-4 overlap was resolved in the merge commit: snapshot shape guard and 401 re-auth (`onAuthLost`) preserved; write 401 → definite-failure + re-auth, refresh/reconcile 401 → committed + re-auth (the write landed before the session died — the PR review caught the reconcile path swallowing the 401).
- No DOM test infra (red-team decision, repo is node-env Vitest): bus classification/dedupe/refresh-serialization locked in unit tests, modal gating + operationId lifecycle in source-scan contract tests, UI flows owned by phase-6 UAT.

## Evidence

- Plan: plans/260819-2034-production-readiness/phase-05-make-mutation-failure-truthful-in-the-ui.md (completed; red-team + review-fix log in plan file); matrix: plans/260819-2034-production-readiness/reports/action-caller-matrix-phase-05.md
- Gates on the merged tree: pnpm test (web 161/161 incl. 46 bus tests and 4 rewritten 401/auth tests, server/auth/infra green), check-types, build, biome — exit 0
- Reviews: tester PASS (6/6 criteria); code-reviewer REQUEST-CHANGES (Critical: submit stayed enabled after unknown — the blind-replay hole; Important: 409 duplicate-guard toasted as a false write failure) → both fixed → re-verified APPROVE; merge-resolution review APPROVE with 1 Low (refresh-401) fixed in 7f5cc5c
- PR #40 merged to develop (10e430a), develop CI green; kongming GO ×6 with the post-PR assessment posted on PR #40 and issue #32

## Next steps

- Phase 6 (live UAT) should exercise create → network loss → reconcile notice, the 409 heal flow, and the 401 re-auth path; phase 2 (D1 drill) still pending
- Documented residuals: 409 "lesson enrollment mismatch" shows the duplicate-guard message (follow-up: carry the server error body in `HttpError`); reconcile-success closes and resets the form even when the write may have been lost (user re-enters; accepted trade-off)
