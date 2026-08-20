---
title: Fail-safe first snapshot load
date: 2026-08-20
summary: Load-gate state machine shipped to develop (issue #33, phase 4) — a failed first kernel snapshot can never mount an empty workspace
---

# Fail-safe first snapshot load

## What happened

Shipped phase 4 of the production-readiness plan: the first `GET /api/kernel` load is now a loading/ready/error state machine instead of a boolean gate, so timeout/network/`5xx`/malformed responses render a blocking retry (or fatal) screen and `401` re-authenticates — never `emptyKernelData` masquerading as an empty org. Beta pipeline (`/ak:vibe --ship --beta --advice`): plan reuse + fresh 3-lens red-team (10 findings applied) → TDD implementation → tester/code-review cycles → PR to develop → merge → CI watch.

## Decisions

- Error taxonomy is three buckets, not two: `401` → best-effort `authClient.signOut()` + redirect `/login?returnUrl=…` (no retry); timeout/network/`5xx`/malformed payload → blocking retry UI; non-`401` `4xx` (real `403` exists on the bootstrap path) → fatal screen with a support hint. Unclassifiable errors fail open to retryable.
- The state machine lives in a pure module (`kernel-load-state.ts`) — the web Vitest env is node-only (no DOM/testing-library), so classification, transitions, the stale-attempt guard and the return-URL guard are unit-testable without new dependencies.
- A `200` only counts after a shape check: every `KernelSnapshot` collection (compile-time-complete key list) must be an array, or the response throws `MalformedSnapshotError` — a proxy page or foreign envelope can never become a workspace.
- The command-bus refresh path shares the re-auth: a typed `401` mid-session fires `onAuthLost` instead of retrying a dead session (the most common 401 in practice); acknowledged comment writes still return their committed id.
- Return URL flows end to end with an open-redirect guard (`validateReturnUrl`): raw passthrough in `login.tsx` `validateSearch`, validated consumption in sign-in/sign-up (`window.location.assign` → fresh boot through the gate), Google `callbackURL`, and the `_auth` guard.
- Each load attempt carries a sequence token; only the newest attempt may settle state, so a stale rejection cannot unmount a running workspace (guard sits before `applySnapshot`).

## Evidence

- Plan: plans/260819-2034-production-readiness/phase-04-fail-safe-on-first-snapshot-load.md (completed; red-team session logged in plan.md)
- Gates: pnpm test (web 141/141, server 60/60, auth 16/16, infra 11/11), check-types, biome, build — exit 0
- Reviews: tester PASS (coverage gaps closed with wiring contract tests); code-reviewer found 2 real defects — C1 control-char open-redirect bypass (WHATWG parser strips tab/LF/CR, so `/\t/evil.com` slipped past raw-string checks) and I1 guard returnUrl serializing the parsed search object to `[object Object]` — both fixed and re-verified with an independent 31-payload battery (0 leaks), final score 9/10
- kongming checkpoints: GO ×4 (post-plan-gates, post-implementation, post-review, ship pre-flight)

## Next steps

- Phase 5 (truthful mutation failure UI) and phase 6 (live UAT) remain; phase 2 (D1 drill) still pending
- Documented residuals: mapper `TypeError` shows a network-flavored message on the blocking screen (fail-safe goal still met); retry double-click protection is implicit via atomic unmount; loading state renders blank as before
