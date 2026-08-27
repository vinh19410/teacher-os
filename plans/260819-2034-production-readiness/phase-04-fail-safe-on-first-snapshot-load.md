---
phase: 4
title: "Fail-safe first snapshot load"
status: completed
priority: P1
effort: "1d"
dependencies: []
---

# Phase 4: Fail-safe first snapshot load

## Overview

Keep the authenticated workspace unmounted until a valid first kernel snapshot exists; failed load shows a blocking retry/re-auth state, never `emptyKernelData` as if it were an empty org.

## Requirements

- Classify failures into three buckets: `reauth` (`401`), `retryable` (timeout, network, `5xx`, malformed payload), and `fatal` (non-`401` `4xx` such as `403`/`429` — deterministic, retry is pointless). Retry UI is offered for `retryable` only; `fatal` shows a blocking error with a support-oriented message; `reauth` never offers retry.
- `fetchKernelSnapshot` must throw a typed error carrying the HTTP status when one exists (`HttpError{status}`), and wrap no-status failures: `DOMException` `TimeoutError` → timeout, `TypeError` → network, `res.json()` `SyntaxError` or shape-validation failure → malformed payload. Unclassifiable errors default to `retryable` with a generic message.
- A `200` response is only "valid" after a minimal shape check inside `fetchKernelSnapshot`: the parsed JSON is an object and every kernel collection key (the keys of `emptyKernelData`) is an array. Failure throws the malformed-payload error — a wrong-shape `200` (proxy page, foreign envelope) must never mount a workspace.
- On `401` from the first load, run a best-effort `authClient.signOut()` (fire-and-forget with `catch` — component state dies via unmount anyway; the session cookie is what actually needs clearing), then redirect to `/login` with a safe return URL. No retry loop.
- The same typed `401` arriving through the command-bus refresh path (mid-session expiry) must not be retried by the bus; it triggers the same re-auth handling as the first load.
- Preserve the PDR load-gate and do not introduce client-side mock fallback.

## Architecture

Replace the boolean `kernelLoaded` state in `apps/web/src/lib/data-provider.tsx` with an explicit loading/ready/error state machine. Extract the machine as pure functions in a new module `apps/web/src/lib/kernel-load-state.ts` (state type + `classifyLoadError(error)` → `reauth|retryable|fatal` + transition/reducer), so the classification and transitions are unit-testable in the existing node Vitest environment (`apps/web/vitest.config.ts` has no DOM; do not add jsdom/testing-library in this phase). `fetchKernelSnapshot` throws the typed errors; the provider maps them through `classifyLoadError` and renders accordingly. Children mount only in `ready`.

In-flight safety: each load attempt carries a sequence token; only the latest attempt may settle state (a stale rejection must not flip `ready` → `error` and unmount a running workspace). The retry button is disabled while an attempt is in flight.

Return URL contract: `/login` gains a `validateSearch` schema accepting an optional `returnUrl`; the value is valid only if, after decoding, it starts with exactly one `/` and does not start with `//` or `/\` and contains no scheme/origin (open-redirect guard, implemented as a pure helper in `kernel-load-state.ts` and unit-tested). `SignInForm` navigates to the validated URL on success (fallback `/dashboard`); the Google button passes the validated URL as its OAuth `callbackURL`; the `_auth` route guard passes the current location as `returnUrl` when it redirects, so guard-redirects and 401-redirects behave the same.

## Related Code Files

- Modify: `apps/web/src/lib/data-provider.tsx`.
- Modify: `apps/web/src/lib/repos/kernel.ts` (typed errors in `fetchKernelSnapshot`; bus does not retry `401` refreshes — add an `onAuthLost` hook to `KernelCommandBusDeps`).
- Create: `apps/web/src/lib/kernel-load-state.ts` (pure state machine, error classification, `validateReturnUrl`).
- Modify: `apps/web/src/lib/kernel-runtime.contract.test.ts` — its current regexes lock the old `kernelLoaded` shape (`/if \(!kernelLoaded\)/`, `/return null/`, `/useState\(emptyKernelData\)/`, `/setData\(mapKernelSnapshot\(snapshot\)\)/`) and WILL fail once the boolean is replaced; rewrite the "gates children on kernel load" test to lock the new gate (children render only in `ready`, error branch renders the retry UI) instead of variable names.
- Create: focused Vitest tests under `apps/web/src/lib/` (`kernel-load-state.test.ts` for classification/transitions/returnUrl; `repos/kernel.test.ts` additions mocking `globalThis.fetch` for timeout/`5xx`/`401`/malformed/shape-guard/retry paths — node env, no DOM).
- Create: `apps/web/src/components/kernel-load-error.tsx` (blocking error screen; `role="alert"`, retry button auto-focused, uses the shared UI button; distinct message for `fatal`).
- Modify: `apps/web/src/routes/login.tsx` (`validateSearch` for `returnUrl`), `apps/web/src/components/sign-in-form.tsx` and `apps/web/src/components/sign-up-form.tsx` (navigate to validated return URL, fallback `/dashboard`), `apps/web/src/components/google-oauth-button.tsx` (dynamic OAuth `callbackURL`).
- Modify: `apps/web/src/routes/_auth/route.tsx` — guard redirect carries `returnUrl` from the current location.
- Inspect: `apps/web/src/lib/auth-client.ts` (best-effort `signOut`, precedent in `apps/web/src/components/layout/sidebar.tsx:275`).

## Implementation Steps

1. Create `kernel-load-state.ts` with the three-bucket classification, the loading/ready/error transition logic, and `validateReturnUrl`; characterize them with unit tests first (TDD).
2. Rework `fetchKernelSnapshot` to throw typed errors (`HttpError{status}`, timeout, network, malformed) and to shape-check `200` payloads (every `emptyKernelData` key is an array); mock `globalThis.fetch` in tests to cover timeout/`401`/`5xx`/malformed/shape-guard before changing the provider.
3. Replace `kernelLoaded` in the provider with the state machine (sequence-token guarded); only `ready` mounts children; rewrite the `kernel-runtime.contract.test.ts` gate test to lock the new behavior.
4. Bus refresh: `401` (and only `401`) skips retries and fires `onAuthLost` → same re-auth path as first load.
5. `401` handling: best-effort `authClient.signOut()` (catch-and-continue), then redirect `/login?returnUrl=<validated current path>`.
6. Wire the return URL end to end: `login.tsx` `validateSearch` → `sign-in-form.tsx`/`sign-up-form.tsx` navigate to it (fallback `/dashboard`), `google-oauth-button.tsx` uses it as `callbackURL`, `_auth/route.tsx` guard passes it on redirect.
7. Build `kernel-load-error.tsx` (`role="alert"`, auto-focused retry, `fatal` variant without retry); render it from the provider for `retryable`/`fatal`.
8. Final test sweep: timeout, `401` redirect, `5xx`, malformed payload, wrong-shape `200`, `403` fatal state, successful retry hydrating once; then web tests, types and build.

## Success Criteria

- [x] No route mounts before a valid snapshot maps successfully, including wrong-shape `200` payloads.
- [x] Failure cannot display empty students/classes as a legitimate workspace.
- [x] Retry that succeeds hydrates once and mounts the app; a stale attempt cannot unmount a running workspace.
- [x] `401` (first load and bus refresh) signs out best-effort and redirects to `/login` with a validated return URL that all three login flows honor; no retry is offered.
- [x] Non-`401` `4xx` renders the fatal blocking state, not a retry loop.
- [x] Web tests, types and build pass (including the rewritten contract test).

## Risk Assessment

Do not confuse a true new org (valid empty snapshot) with load failure. Signal: first user cannot access a valid empty org. Response: assert both cases separately using transport success versus failure, not array length. A valid empty org passes the shape check (all collections are empty arrays) and mounts; a wrong-shape `200` fails the shape check and never mounts.

Secondary risks accepted after red-team: malformed payload stays `retryable` (proxies/partial deploys are transient; retry is user-driven, not automatic) with a distinct message; the return-URL open-redirect surface is closed by the pure `validateReturnUrl` guard with decode-then-recheck.
