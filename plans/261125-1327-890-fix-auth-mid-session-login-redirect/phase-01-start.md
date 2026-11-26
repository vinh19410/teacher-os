---
phase: 1
title: "Phase 1: Shared Session Cache & Server Rate-Limit Hardening"
status: completed
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Shared Session Cache & Server Rate-Limit Hardening

## Goal

Deliver a pure, browser-safe `@teacher-os/auth/session-cache` helper that handles transient HTTP (`408`/`429`/`5xx`) and network/timeout failures safely without kicking authenticated users, and harden Better-Auth's explicit Cloudflare Worker rate limiting and IP resolution in `packages/auth/src/index.ts` and `apps/server/src/index.ts`.

## Files to Create / Modify

- Create: `packages/auth/src/session-cache.ts`
- Create: `packages/auth/src/session-cache.test.ts`
- Create: `packages/auth/src/auth-rate-limit.test.ts`
- Modify: `packages/auth/src/index.ts`
- Modify: `apps/server/src/index.ts`

## Tests Before (TDD Red Phase)

### Task 1.1 — Write failing unit tests for shared session cache resilience
- **Goal:** Establish failing TDD tests covering strict transient-error classification, bounded warm fallback (`90_000ms` / max 3 consecutive), cold-load & boundary-cliff bounded retries, `allowStale` preload reuse, `requestSeq`/`cacheEpoch` race safety, `Promise.race` hung-fetch timeout guard, abort-listener cleanup, and fail-closed definitive unauthenticated responses.
- **Target files and symbols:** `packages/auth/src/session-cache.test.ts` (testing `createSessionCache`, `isTransientSessionError`, `SESSION_CACHE_TTL_MS`, `SESSION_FALLBACK_CACHE_TTL_MS`, `MAX_FALLBACK_AGE_MS`, `MAX_CONSECUTIVE_FALLBACKS`, `SESSION_REQUEST_TIMEOUT_MS`).
- **Steps:**
  1. Create `packages/auth/src/session-cache.test.ts` importing from `./session-cache`.
  2. Add unit tests (passing mock `onFallback` where testing mechanics, plus a dedicated test verifying the default `onFallback` calls `console.warn` dynamically <!-- Red-Team RT-9 -->) for:
     - `isTransientSessionError` <!-- Red-Team RT-6 -->: returns `true` for `{ status: 408 }`, `{ status: 429 }`, `{ status: 500 }`, `{ status: 502 }`, `{ status: 503 }`, `{ status: 504 }`, `{ status: 0 }`; returns `false` for `null`/`undefined`, `{ status: 0, code: "UNAUTHORIZED" }`, `{ code: "SESSION_EXPIRED" }` (missing numeric `status`), `{ status: Number.NaN }`, `{ status: 400 }`, `{ status: 401 }`, `{ status: 403 }`, `{ status: 404 }`.
     - TTL cache hit (`SESSION_CACHE_TTL_MS = 15_000`), TTL expiration refetch (including when `vi.useFakeTimers()` is enabled *after* `createSessionCache()` is instantiated <!-- Red-Team RT-9 -->), `force: true` bypass, concurrent in-flight deduplication.
     - `allowStale: true`: returns `lastKnownSession` with **0** network calls after `SESSION_CACHE_TTL_MS` expires while within `MAX_FALLBACK_AGE_MS` (`90_000ms`); fetches normally once past `MAX_FALLBACK_AGE_MS` or when `lastKnownSession` is null.
     - Warm navigation (`lastKnownSession` within `90_000ms` and `< 3` consecutive fallbacks <!-- Red-Team RT-4 -->):
       - Resolved `{ data: null, error: { status: 429 } }`, `500`, `502`, `503`, `504`, `408` -> returns `lastKnownSession`, preserves `lastKnownSession`/`lastVerifiedAt`, sets `cachedSession.expiresAt = Math.min(now + 5_000, lastVerifiedAt + 90_000)`, invokes `onFallback`.
       - Thrown network error or internal `5_000ms` timeout (including a hung `fetchSession` promise that ignores `signal` <!-- Red-Team RT-2 -->) -> settles via `Promise.race`, returns `lastKnownSession` immediately (0 retries), invokes `onFallback`.
       - Thrown `4xx` error (e.g. `{ status: 401 }` or `{ status: 403 }`) -> **0 retries, NO fallback**, clears cache, rethrows <!-- Red-Team RT-6 -->.
       - Resolved `{ data: null, error: null }` (`200 null`), `{ data: null, error: { status: 401 } }`, `{ data: null, error: { code: "SESSION_EXPIRED" } }` -> **0 retries**, clears cache (`lastKnownSession` wiped), returns the unauthenticated result.
       - Consecutive fallback cap (`MAX_CONSECUTIVE_FALLBACKS = 3`): 1st/2nd/3rd transient failures return `lastKnownSession`; 4th consecutive failure falls through to cold-load retry and fails closed if retries exhaust; a successful verification resets the counter to `0` <!-- Red-Team RT-4 -->.
       - Boundary cliff (`lastVerifiedAt + 90_000` crossed mid-request) -> falls through to bounded cold-load retries instead of failing with 0 retries <!-- Red-Team RT-7 -->.
     - Cold load (`lastKnownSession === null`):
       - Resolved `{ data: null, error: { status: 500 } }` or `429` followed by valid session on attempt 2 or 3 -> retries with delays `[250, 600]` ms and returns recovered session.
       - Exhausted transient resolved errors (all 3 attempts `503`) -> clears cache and returns final `{ data: null, error: { status: 503 } }`.
       - Exhausted thrown network errors (all 3 attempts reject) -> clears cache and rethrows final error.
       - Timeout (`AbortController` firing after `SESSION_REQUEST_TIMEOUT_MS`) -> caps retries at **1** (2 total attempts) and rethrows on second timeout.
       - Definitive unauthenticated (`200 null`, `401`) -> **0 retries**, returns immediately.
     - Race & cancellation invariants <!-- Red-Team RT-1, RT-2 -->:
       - `clearSessionCache()` mid-flight during fetch -> aborts signal, stale resolved session is NEVER written to cache AND caller receives fail-closed `{ data: null, error: null }` (never stale authenticated data).
       - `clearSessionCache()` mid-flight during cold retry `sleep` -> aborts sleep immediately (no leaked timer), returns `{ data: null, error: null }` without mutating cache or causing unhandled rejection.
       - Concurrent `force: true` while an earlier non-forced request is in flight: earlier request settling late (with stale data, `503` exhaustion, or `finally`) NEVER overwrites the newer forced session, NEVER calls `clearSessionCache()`, and NEVER nulls `inFlightSessionPromise` while the forced request is still active.
       - 15 consecutive TTL-expired calls without `clearSessionCache()` emit zero `MaxListenersExceededWarning` (proving `epochSignal` abort listener cleanup in `finally`).
- **Success criteria:** Test file compiles structurally and fails because `./session-cache` does not exist yet.
- **Verify:** `pnpm --filter @teacher-os/auth test -- src/session-cache.test.ts` exits non-zero (module not found; passing is a failure in red phase).

### Task 1.2 — Write failing server tests for explicit Cloudflare IP rate-limit isolation and `/get-session` rule
- **Goal:** Establish failing TDD tests proving `createAuth` does not yet support explicit `rateLimit` / `trustedIpHeaders` options and rejects `/get-session` after 100 requests in a shared bucket.
- **Target files and symbols:** `packages/auth/src/auth-rate-limit.test.ts` (testing `createAuth` from `./index`).
- **Steps:**
  1. Create `packages/auth/src/auth-rate-limit.test.ts` using in-memory `@libsql/client` + `drizzle-orm/libsql` (following `packages/auth/src/auth-unified-origin.test.ts`).
  2. Configure `createAuth({ ..., rateLimit: { enabled: true }, trustedIpHeaders: ["cf-connecting-ip"] })` — NO `process.env.NODE_ENV` mutation <!-- Red-Team RT-5 -->.
  3. Add tests asserting:
     - Calling `GET /api/auth/get-session` `120` times with `cf-connecting-ip: 203.0.113.10` returns HTTP `200` for all `120` requests (under the new `max: 120` per-IP rule).
     - Request `121` from `cf-connecting-ip: 203.0.113.10` returns HTTP `429`, while a concurrent request from `cf-connecting-ip: 203.0.113.11` still gets HTTP `200` (proving per-IP bucket isolation).
     - Calling `POST /api/auth/sign-in/email` 5 times from `cf-connecting-ip: 203.0.113.12` hits HTTP `429` by the 4th request (proving built-in strict `3 / 10s` auth rate limit remains intact).
     - When `trustedIpHeaders` is omitted (non-Cloudflare runtime posture), passing arbitrary `cf-connecting-ip` headers does NOT split rate-limit buckets (spoofing `cf-connecting-ip` cannot bypass `/sign-in/email` limits outside Cloudflare edge <!-- Red-Team RT-5 -->).
- **Success criteria:** Test suite fails against current `packages/auth/src/index.ts`.
- **Verify:** `pnpm --filter @teacher-os/auth test -- src/auth-rate-limit.test.ts` exits non-zero with assertion/type failure (passing is a failure in red phase).

## Refactor / Implementation

### Task 1.3 — Implement browser-safe `packages/auth/src/session-cache.ts`
- **Goal:** Implement `createSessionCache` and `isTransientSessionError` with zero server/DB/Node-only imports and full race, timeout, timer-type, and leak safety.
- **Target files and symbols:** `packages/auth/src/session-cache.ts` (exports: `SESSION_CACHE_TTL_MS`, `SESSION_FALLBACK_CACHE_TTL_MS`, `MAX_FALLBACK_AGE_MS`, `MAX_CONSECUTIVE_FALLBACKS`, `SESSION_REQUEST_TIMEOUT_MS`, `DEFAULT_COLD_RETRY_DELAYS_MS`, `isTransientSessionError`, `createSessionCache`, plus exported TypeScript types `SessionErrorLike`, `SessionResultLike`, `GetCachedSessionOptions`, `SessionCacheOptions`).
- **Steps:**
  1. Keep imports strictly empty (pure TypeScript using standard globals, and `ReturnType<typeof setTimeout>` for all timer handles so both Node/Workers and DOM-only `tsconfig` compile cleanly <!-- Red-Team RT-12 -->).
  2. Export constants <!-- Red-Team RT-4 -->:
     - `SESSION_CACHE_TTL_MS = 15_000`
     - `SESSION_FALLBACK_CACHE_TTL_MS = 5_000`
     - `MAX_FALLBACK_AGE_MS = 90_000`
     - `MAX_CONSECUTIVE_FALLBACKS = 3`
     - `SESSION_REQUEST_TIMEOUT_MS = 5_000`
     - `DEFAULT_COLD_RETRY_DELAYS_MS = [250, 600] as const`
  3. Implement `isTransientSessionError(error)` <!-- Red-Team RT-6 -->:
     - Return `false` if `!error || typeof error !== "object"`.
     - Read `status = error.status`. Return `false` unless `typeof status === "number" && Number.isFinite(status)`.
     - Return `true` only if `status === 408 || status === 429 || status >= 500 || (status === 0 && !error.code)`.
     - Also implement internal `isDefinitiveClientThrownError(err)`: returns `true` when `err` is an object with finite numeric `status >= 400 && status < 500 && status !== 408 && status !== 429`.
  4. Implement default runtime helpers with **dynamic** global lookup <!-- Red-Team RT-9 -->:
     - `now = () => (options?.now ? options.now() : Date.now())`
     - `onFallback = (reason: unknown) => { if (options?.onFallback) { options.onFallback(reason); } else { console.warn("getSession failed; falling back to last known session", reason); } }`
     - Default `sleep(ms, signal)` uses dynamic `setTimeout`/`clearTimeout` with `ReturnType<typeof setTimeout>`, immediately checks `signal?.aborted`, clears timer on `abort`, and removes `abort` listener on timer completion <!-- Red-Team RT-2, RT-9 -->.
  5. Implement `createSessionCache<TResult extends SessionResultLike>(fetchSession, options)`:
     - Manage `cacheEpoch = 0`, `latestRequestSeq = 0`, `epochAbortController = new AbortController()`, `cachedSession`, `lastKnownSession`, `lastVerifiedAt`, `consecutiveFallbacks = 0`, and `inFlightSessionPromise`.
     - `clearSessionCache()`: increments `cacheEpoch`, increments `latestRequestSeq`, aborts old `epochAbortController` and replaces it with a new `AbortController()`, resets `cachedSession = null`, `lastKnownSession = null`, `lastVerifiedAt = null`, `consecutiveFallbacks = 0`, `inFlightSessionPromise = null`.
     - Helper `isCurrentOwner(requestEpoch, requestSeq)`: `requestEpoch === cacheEpoch && requestSeq === latestRequestSeq` <!-- Red-Team RT-1 -->.
     - Helper `canUseFallback(currentNow, requestEpoch, requestSeq)`: `isCurrentOwner(requestEpoch, requestSeq) && lastKnownSession?.data != null && lastVerifiedAt !== null && currentNow - lastVerifiedAt < maxFallbackAgeMs && consecutiveFallbacks < maxConsecutiveFallbacks` <!-- Red-Team RT-4 -->.
     - Helper `hasFreshAllowStale(currentNow)`: `lastKnownSession?.data != null && lastVerifiedAt !== null && currentNow - lastVerifiedAt < maxFallbackAgeMs`.
     - `runAttempt(epochSignal)` <!-- Red-Team RT-2, RT-12 -->:
       - Creates per-attempt `attemptController = new AbortController()`, `didTimeout = false`, `didEpochAbort = false`.
       - Registers `onEpochAbort` on `epochSignal` (checking `if (epochSignal.aborted)` up front) and `timeoutId: ReturnType<typeof setTimeout>` via dynamic `setTimeout` firing `didTimeout = true; attemptController.abort()`.
       - Wraps `fetchPromise = Promise.resolve().then(() => fetchSession(attemptController.signal))` and attaches `fetchPromise.catch(() => {})` so late rejections after race loss never trigger unhandled rejections.
       - Races `fetchPromise` against `abortPromise` (which rejects immediately on `didTimeout` with a `TimeoutError` sentinel or resolves/rejects immediately on `didEpochAbort`).
       - In `finally`: unconditionally runs `clearTimeout(timeoutId)` and `epochSignal.removeEventListener("abort", onEpochAbort)` (zero timer or listener leaks!).
     - Unified `getCachedSession({ force = false, allowStale = false } = {})` <!-- Red-Team RT-1, RT-2, RT-7 -->:
       - If `!force && cachedSession && now() < cachedSession.expiresAt`: return `cachedSession.data`.
       - If `!force && allowStale && hasFreshAllowStale(now())`: return `lastKnownSession as TResult`.
       - If `!force && inFlightSessionPromise`: return `inFlightSessionPromise`.
       - Capture `requestEpoch = cacheEpoch`, `requestSeq = ++latestRequestSeq`, `epochSignal = epochAbortController.signal`.
       - Create `const promise = (async (): Promise<TResult> => { ... })()` and assign `inFlightSessionPromise = promise`.
       - Inside the async loop (`attempt = 0` up to `coldRetryDelaysMs.length`):
         - If `requestEpoch !== cacheEpoch`: return `{ data: null, error: null } as TResult` (fail-closed, zero cache mutation <!-- Red-Team RT-1, RT-2 -->).
         - Run `runAttempt(epochSignal)`.
         - If `requestEpoch !== cacheEpoch`: return `{ data: null, error: null } as TResult`.
         - On resolved `res`:
           - If `res?.data != null`: if `isCurrentOwner(requestEpoch, requestSeq)`, set `cachedSession = { data: res, expiresAt: now() + ttlMs }`, `lastKnownSession = res`, `lastVerifiedAt = now()`, `consecutiveFallbacks = 0`; return `res`.
           - If `!isTransientSessionError(res?.error)`: definitive unauthenticated (`200 null`, `401`, `403`, missing status) -> if `isCurrentOwner(requestEpoch, requestSeq)`, call `clearSessionCache()`; return `res` (0 retries).
           - Otherwise (transient resolved error):
             - On `attempt === 0` if `canUseFallback(now(), requestEpoch, requestSeq)`: increment `consecutiveFallbacks`, set `cachedSession = { data: lastKnownSession, expiresAt: Math.min(now() + fallbackTtlMs, lastVerifiedAt + maxFallbackAgeMs) }`, call `onFallback(res?.error ?? res)`, return `lastKnownSession`!
             - Else if retries remain (`attempt < coldRetryDelaysMs.length`) and `isCurrentOwner(requestEpoch, requestSeq)`: sleep `delay + jitter` with `epochSignal`; if `requestEpoch !== cacheEpoch` return `{ data: null, error: null } as TResult`; continue.
             - Else (exhausted): if `isCurrentOwner(requestEpoch, requestSeq)` call `clearSessionCache()`; return `res`.
         - On thrown `err`:
           - If `requestEpoch !== cacheEpoch`: return `{ data: null, error: null } as TResult`.
           - If `isDefinitiveClientThrownError(err)`: if `isCurrentOwner(requestEpoch, requestSeq)` call `clearSessionCache()`; throw `err` (0 retries, no fallback).
           - Track `timeoutFailures` if `didTimeout` or `TimeoutError`.
           - On `attempt === 0` if `canUseFallback(now(), requestEpoch, requestSeq)`: increment `consecutiveFallbacks`, set `cachedSession = { data: lastKnownSession, expiresAt: Math.min(now() + fallbackTtlMs, lastVerifiedAt + maxFallbackAgeMs) }`, call `onFallback(err)`, return `lastKnownSession`!
           - Else if retries remain (`attempt < coldRetryDelaysMs.length`) and `(!isTimeout || timeoutFailures <= coldTimeoutMaxRetries)` and `isCurrentOwner(requestEpoch, requestSeq)`: sleep `delay + jitter` with `epochSignal`; if `requestEpoch !== cacheEpoch` return `{ data: null, error: null } as TResult`; continue.
           - Else (exhausted): if `isCurrentOwner(requestEpoch, requestSeq)` call `clearSessionCache()`; throw `err`.
       - In `finally`: `if (inFlightSessionPromise === promise) inFlightSessionPromise = null;` <!-- Red-Team RT-1 -->.
- **Success criteria:** All tests in `packages/auth/src/session-cache.test.ts` pass with 0 warnings/leaks.
- **Verify:** `pnpm --filter @teacher-os/auth test -- src/session-cache.test.ts` exits 0 and reports all test cases passed.

### Task 1.4 — Wire explicit Cloudflare Worker rate limiting & `cf-connecting-ip` in `packages/auth/src/index.ts` and `apps/server/src/index.ts`
- **Goal:** Explicitly enable Better-Auth rate limiting with per-IP `cf-connecting-ip` isolation on the Cloudflare Worker while keeping non-Cloudflare runtimes safe against IP header spoofing.
- **Target files and symbols:**
  - `packages/auth/src/index.ts` (`CreateAuthInput`, `createAuth`)
  - `apps/server/src/index.ts` (`getAuth`, comment at lines 78–80)
- **Steps:**
  1. In `packages/auth/src/index.ts`, extend `CreateAuthInput` with optional fields <!-- Red-Team RT-5 -->:
     - `rateLimit?: { enabled?: boolean };`
     - `trustedIpHeaders?: string[];`
  2. In `createAuth`'s `betterAuth({ ... })` config:
     - Add:
       ```ts
       rateLimit: {
         ...(input.rateLimit?.enabled !== undefined && {
           enabled: input.rateLimit.enabled,
         }),
         customRules: {
           "/get-session": {
             window: 10,
             max: 120,
           },
         },
       },
       ```
     - Inside `advanced`:
       ```ts
       ...(input.trustedIpHeaders &&
         input.trustedIpHeaders.length > 0 && {
           ipAddress: {
             ipAddressHeaders: input.trustedIpHeaders,
           },
         }),
       ```
  3. In `apps/server/src/index.ts` inside `getAuth()` (`createAuth({ ... })`), pass:
     - `rateLimit: { enabled: true },`
     - `trustedIpHeaders: ["cf-connecting-ip"],`
     And update lines 78–80 comment to note per-IP (`cf-connecting-ip`) isolate bucketing and the `120 req/10s` `/get-session` rule.
- **Success criteria:** Production rate-limit tests pass, no missing-IP warnings are emitted when `trustedIpHeaders: ["cf-connecting-ip"]` is passed, `/get-session` permits `120 / 10s` per IP, `/sign-in/email` stays capped at `3 / 10s`, and omitting `trustedIpHeaders` ignores spoofed `cf-connecting-ip`.
- **Verify:** `pnpm --filter @teacher-os/auth test -- src/auth-rate-limit.test.ts` exits 0 and reports all test cases passed.

## Tests After & Regression Gate

### Task 1.5 — Run full `@teacher-os/auth` package tests and strict typecheck on touched auth files
- **Goal:** Confirm zero regressions in `packages/auth` tests and strict TypeScript cleanliness (including `noUncheckedIndexedAccess` and `verbatimModuleSyntax`) on `packages/auth/src/session-cache.ts` and `apps/server` (which compiles `packages/auth/src/index.ts`; note `packages/auth` has 19 pre-existing `tsc` errors in unrelated legacy tests/scripts out of scope for #890).
- **Target files and symbols:** `packages/auth/src/session-cache.ts`, `packages/auth/src/index.ts`, `apps/server/src/index.ts`, and all tests in `packages/auth`.
- **Steps:**
  1. Run `pnpm --filter @teacher-os/auth test`.
  2. Run strict standalone typecheck on `packages/auth/src/session-cache.ts` and `pnpm --filter server check-types`.
- **Success criteria:** Every test suite in `packages/auth` passes and both typechecks exit 0.
- **Verify:** `pnpm --filter @teacher-os/auth test && pnpm exec tsc --noEmit --strict --noUncheckedIndexedAccess --verbatimModuleSyntax --skipLibCheck --target ESNext --module ESNext --moduleResolution bundler packages/auth/src/session-cache.ts && pnpm --filter server check-types` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
