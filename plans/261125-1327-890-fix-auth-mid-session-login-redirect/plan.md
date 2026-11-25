---
title: "Fix mid-session redirect to /login?returnUrl= followed by auto-login (#890)"
description: "Eliminate spurious mid-session redirects to /login on transient /api/auth/get-session failures, hover-preload state wipes, and Worker-wide Better-Auth rate-limit collisions across student, web, and admin portals."
status: completed
priority: P1
effort: "3h"
tags: [auth, bugfix, student, web, admin, better-auth]
issue: 890
created: 2026-11-25
---

# Fix Mid-Session Redirect to `/login?returnUrl=` (#890)

## Overview

During active student sessions (e.g., IELTS Listening catalog/quiz navigation and reloads on staging), transient `/api/auth/get-session` failures (`429`, `5xx`, `408`, network blips, or >5s timeouts) caused `_auth.beforeLoad` to redirect to `/login?returnUrl=...` without signing out, after which the unified `/login` gateway immediately re-verified the still-valid cookie and bounced the user back.

Root causes proven via source analysis and empirical probes against `better-auth@1.7.16` and `@tanstack/react-router`:
1. `apps/student/src/lib/auth-client.ts` and `apps/web/src/lib/auth-client.ts` rely on `catch (err)` to fall back to `lastKnownSession`, but `better-auth/react` (`@better-fetch/fetch`) **resolves** HTTP `429`/`5xx`/`408` into `{ data: null, error }` instead of throwing — bypassing `catch` and wiping `lastKnownSession` via `clearSessionCache()`.
2. Cold loads/reloads (`lastKnownSession === null`) have zero transient retry before `_auth.beforeLoad` redirects to `/login?returnUrl=...`.
3. `apps/student/src/routes/_auth/route.tsx` runs on hover/focus (`defaultPreload: "intent"`) and executes `syncStudentSessionUser(null)` (clearing `studentQueryClient`, org storage, and reading annotations) plus `clearSessionCache()` even when `preload === true`.
4. `packages/auth/src/index.ts` omits `advanced.ipAddress.ipAddressHeaders: ["cf-connecting-ip"]`, causing Better-Auth in production to collapse all Cloudflare Worker isolate traffic into one shared `100 req/10s` rate-limit bucket for `/api/auth/get-session`. Meanwhile `apps/admin` performs uncached `authClient.getSession()` on every navigation and hover preload.

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - Browser-safe shared session cache (`packages/auth/src/session-cache.ts`, exported as `@teacher-os/auth/session-cache`) with strict transient-error classification, bounded warm fallback (`MAX_FALLBACK_AGE_MS = 90_000`, `MAX_CONSECUTIVE_FALLBACKS = 3`, `SESSION_CACHE_TTL_MS = 15_000`), unified retry fallback on boundary expiry / cold load, `allowStale` preload reuse, race-safe `requestSeq`/`cacheEpoch` ownership, and `Promise.race` timeout/abort safety.
  - Wire shared cache + `preload` guard + cross-tab `ACTIVE_STUDENT_USER_KEY` cache invalidation + `signOut`/`resetPassword` double-clear into all three authenticated portals: `apps/student`, `apps/web`, and `apps/admin`.
  - Server-side Better-Auth hardening in `packages/auth/src/index.ts` and `apps/server/src/index.ts`: explicit `rateLimit?: { enabled?: boolean }` and `trustedIpHeaders?: string[]` inputs in `CreateAuthInput` (enabled with `["cf-connecting-ip"]` in Cloudflare Worker `apps/server/src/index.ts`, omitted in non-CF local/E2E `apps/e2e/src/boot.ts`) plus `rateLimit.customRules["/get-session"] = { window: 10, max: 120 }`.
  - Unit tests (TDD) across `packages/auth`, `apps/student`, `apps/web`, `apps/admin`, plus workspace lint, typecheck (including `packages/auth`), Vite builds, and a focused Playwright E2E auth-resilience test on isolated ports.
- **Explicit Non-Goals:**
  - Do NOT enable Better-Auth `session.cookieCache` (would delay `revokeSessionsOnPasswordReset`, `signOut`, role, and email-verification propagation).
  - Do NOT migrate Better-Auth rate-limit storage from isolate memory to D1 schema tables in this bugfix.
  - Do NOT modify `apps/lms/src/routes/login.tsx`, `apps/admin` `/api/admin/me` -> `?blocked=1` error mapping on real navigation, or `reauth()` 401 redirect behavior on `/api/*`.
  - Do NOT persist session payloads into `localStorage`/`sessionStorage` (memory-only cache).
  - Do NOT run full E2E locally (per `AGENTS.md`).

## Extension Trace

- **Next credible variant:** Adding a 4th authenticated portal (e.g., `/parent` or guarded routes inside `apps/lms`).
- **Stable contract:** `createSessionCache(getSession, options)` in `@teacher-os/auth/session-cache` remains purely functional and framework-agnostic; no portal-specific logic enters the helper.
- **Pieces that change for a new portal:** Only the new portal's `src/lib/auth-client.ts` (wrapping `rawAuthClient` via Proxy) and `src/routes/_auth/route.tsx` (passing `{ allowStale: Boolean(preload) }`).
- **Proof:** Wiring the identical contract cleanly across `apps/student`, `apps/web`, and `apps/admin` with dedicated unit + unmocked runtime proxy tests and clean Vite client builds.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Prevent transient `/api/auth/get-session` failures (`408`, `429`, `5xx`, network, timeout) from wiping session cache or redirecting active/reloading users to `/login` | P1 |
| 2 | Eliminate hover-preload `/get-session` churn and destructive state clears (`studentQueryClient`, `localStorage`) when `preload === true`, with cross-tab user-change cache invalidation | P1 |
| 3 | Fix Cloudflare Worker per-IP rate limiting (explicit `rateLimit.enabled` + `cf-connecting-ip` on Worker only) and raise `/get-session` per-IP allowance to `120 / 10s` without weakening `/sign-in/*` or `/sign-up/*` limits | P1 |
| 4 | Unify session caching across `student`, `web`, and `admin` while keeping auth strictly fail-closed on genuine `200 null` / `4xx` / exhausted cold loads | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Shared Session Cache & Server Rate-Limit Hardening](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Portal Auth Clients & `_auth` Preload Guards](./phase-02-portal-clients-and-guards.md) | Completed |
| 3 | [Phase 3: Cross-Workspace Verification & Build](./phase-03-verification-and-build.md) | Completed |

## Success Criteria

- [x] Active navigation during transient `408`/`429`/`5xx`/network/timeout `/api/auth/get-session` errors stays in-app via `lastKnownSession` (bounded to `90_000ms` and max 3 consecutive fallbacks) without wiping cache or redirecting to `/login`; if the fallback cap expires mid-flight, falls through to bounded cold-load retries before failing closed.
- [x] Cold reload recovers from transient `/api/auth/get-session` failures via bounded retries (up to 2 retries `[250, 600]ms` on fast errors, 1 retry on timeout) and fails closed if retries exhaust or if server returns definitive unauthenticated (`200 null`, `400`/`401`/`403`/`404`, or non-network error object without transient status).
- [x] Hovering links (`preload: true`) reuses `lastKnownSession` (and `lastKnownAdmin` for same `userId` in `apps/admin`) with 0 `/api/auth/get-session` calls within the `90_000ms` window, never executes `syncStudentSessionUser(null)` or clears valid cache on hover failure, and clears student session cache immediately when another tab changes/clears `ACTIVE_STUDENT_USER_KEY`.
- [x] On the Cloudflare Worker (`apps/server/src/index.ts`), `createAuth` explicitly enables rate limiting with `trustedIpHeaders: ["cf-connecting-ip"]`, isolates buckets per IP, permits up to `120 req / 10s` per IP on `/get-session`, and preserves strict rate limiting (`3 / 10s`) on `/sign-in/email`, without trusting spoofable `cf-connecting-ip` on non-Cloudflare runtimes.
- [x] `pnpm check`, `pnpm check-types`, strict standalone `tsc --noEmit` on `packages/auth/src/session-cache.ts`, targeted unit tests (`@teacher-os/auth`, `student`, `web`, `admin`, `server`, `lms`), Vite client builds (`student`, `web`, `admin`, `lms`), and focused Playwright E2E resilience test pass cleanly.

## Red Team Review

### Session — 2026-11-25
**Reviewers:** Security Adversary (Fact Checker), Assumption Destroyer (Contract Verifier), Failure Mode Analyst (Fact Checker + Contract Verifier)
**Findings:** 13 deduplicated (5 Critical, 5 High, 3 Medium) — **13 accepted, 0 rejected**

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| RT-1 | Concurrent `force: true` shares `cacheEpoch` with `inFlightSessionPromise`; `signOut` window re-caches | Critical | Accept | Phase 1 (Task 1.1, 1.3), Phase 2 (Task 2.2) |
| RT-2 | Ambiguous epoch-abort return contract during retry sleep; missing `Promise.race` timeout guard; `epochSignal` listener leak | Critical | Accept | Phase 1 (Task 1.1, 1.3) |
| RT-3 | Hover-preload `allowStale` (5 min) + skipped `syncStudentSessionUser` exposes cross-tab quiz loaders | Critical | Accept | Phase 1 (Task 1.3), Phase 2 (Task 2.2, 2.3) |
| RT-4 | 5-min fallback + 30s TTL weakens revocation guarantees (`apps/web` `staleTime: Infinity`) | Critical | Accept | Plan, Phase 1 (Task 1.1, 1.3) |
| RT-5 | Implicit `NODE_ENV=production` dependency (unset in `alchemy.run.ts`) & unconditional `cf-connecting-ip` trust | Critical | Accept | Plan, Phase 1 (Task 1.2, 1.4) |
| RT-6 | `isTransientSessionError` over-broadly treats missing `status` / thrown 4xx errors as transient | High | Accept | Phase 1 (Task 1.1, 1.3) |
| RT-7 | Warm-branch 90s boundary cliff (0 fallback AND 0 retry when request crosses cap mid-flight) | High | Accept | Phase 1 (Task 1.1, 1.3) |
| RT-8 | `apps/admin` `_auth.beforeLoad` still calls uncached `/api/admin/me` on hover and omits `clearSessionCache()` on 401/403 | High | Accept | Plan, Phase 2 (Task 2.3) |
| RT-9 | Capturing `Date.now`/`setTimeout`/`console.warn` by reference breaks `vi.useFakeTimers()` & `vi.spyOn` | High | Accept | Phase 1 (Task 1.1, 1.3) |
| RT-10 | Existing test contracts: 10 `apps/admin` route tests, separate unmocked `auth-client-runtime.test.ts`, 50ms `defaultPreloadDelay`, `AuthRouteOptions` + `AuthSessionResult` | High | Accept | Phase 2 (Task 2.1–2.4) |
| RT-11 | Wrong-role cache poisoning on `preload: true`; missing `clearSessionCache()` on `resetPassword` and `apps/web` guard | Medium | Accept | Phase 2 (Task 2.2, 2.3) |
| RT-12 | Dual-runtime `setTimeout` typing (`ReturnType<typeof setTimeout>`), missing `tsc --noEmit` on `@teacher-os/auth`, `pnpm check` vs `pnpm check:fix` | Medium | Accept | Phase 1 (Task 1.3, 1.5), Phase 3 (Task 3.1) |
| RT-13 | Phase 3 Task 3.3 E2E (`lms-unified-domain.spec.ts`) lacked transient `429`/`503` interception test | Medium | Accept | Phase 3 (Task 3.3) |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-portal-clients-and-guards.md`, `phase-03-verification-and-build.md`
- Decision deltas checked: 13 (RT-1 through RT-13)
- Reconciled stale references: Updated TTL (`30_000` -> `15_000`), fallback cap (`5 * 60_000` -> `90_000` + max 3 consecutive), `/get-session` limit (`300` -> `120`), `NODE_ENV` -> explicit `CreateAuthInput` options, `pnpm check` -> `pnpm check:fix`, `packages/auth` typecheck command, `apps/admin` preload/test migration, and E2E resilience spec across all 4 files.
- Unresolved contradictions: 0

## Validation Log

### Session — 2026-11-25
### Verification Results
- **Tier:** Standard (3 phases: Fact Checker + Contract Verifier)
- **Claims checked:** 32
- **Verified:** 32 | **Failed:** 0 | **Unverified:** 0
- All cited file paths, symbols, exports (`AuthSessionResult`, `SessionDataLike`, `SESSION_CACHE_TTL_MS`, `ACTIVE_STUDENT_USER_KEY`), `package.json` scripts (`check`, `check:fix`, `check-types`), `tsconfig.json` compiler options, and existing test files verified directly against current workspace source.
- **Decisions confirmed (aligned with Kongming Checkpoint 1 + Red-Team adjudication):**
  1. `SESSION_CACHE_TTL_MS = 15_000`, `MAX_FALLBACK_AGE_MS = 90_000`, `MAX_CONSECUTIVE_FALLBACKS = 3`.
  2. Explicit `rateLimit: { enabled: true }` and `trustedIpHeaders: ["cf-connecting-ip"]` passed only by Cloudflare Worker (`apps/server/src/index.ts`), with `/get-session` capped at `120 / 10s` per IP.
  3. Unified warm/cold retry flow with `requestSeq` + `cacheEpoch` + `Promise.race` timeout/abort cleanup and dynamic `() => Date.now()` / `setTimeout` / `console.warn`.
  4. Separate unmocked `auth-client-runtime.test.ts` files for `student` and `admin`, plus focused E2E transient `429`/`503` resilience test.
- **Unresolved contradictions:** 0 (eligible for implementation after Kongming Checkpoint 2).

<!-- slug: 890-fix-auth-mid-session-login-redirect -->
