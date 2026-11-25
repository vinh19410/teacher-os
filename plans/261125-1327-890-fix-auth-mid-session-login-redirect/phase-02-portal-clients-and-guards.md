---
phase: 2
title: "Phase 2: Portal Auth Clients & _auth Preload Guards"
status: completed
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Portal Auth Clients & `_auth` Preload Guards

## Goal

Wire `@teacher-os/auth/session-cache` into `apps/student`, `apps/web`, and `apps/admin`, add cross-tab student user-change cache invalidation and `signOut`/`resetPassword` double-clear, and guard `_auth.beforeLoad` across all three portals against hover-preload `/get-session` churn and destructive cache/storage wipes.

## Files to Create / Modify

- Modify: `apps/student/src/lib/auth-client.ts`
- Modify: `apps/student/src/routes/_auth/route.tsx`
- Modify: `apps/student/src/lib/auth-client.test.ts`
- Create: `apps/student/src/lib/auth-client-runtime.test.ts`
- Modify: `apps/student/test/auth-route-guard.test.ts`
- Modify: `apps/web/src/lib/auth-client.ts`
- Modify: `apps/web/src/routes/_auth/route.tsx`
- Modify: `apps/web/src/lib/auth-client.test.ts`
- Modify: `apps/web/src/routes/_auth/route.test.ts`
- Modify: `apps/web/src/routes/_auth/grading-nav.test.tsx`
- Modify: `apps/admin/src/lib/auth-client.ts`
- Modify: `apps/admin/src/routes/_auth/route.tsx`
- Create: `apps/admin/src/lib/auth-client.test.ts`
- Create: `apps/admin/src/lib/auth-client-runtime.test.ts`
- Modify: `apps/admin/src/routes/_auth/route.test.ts`

## Tests Before (TDD Red Phase)

### Task 2.1 — Add failing regression tests for resolved 429/5xx fallback and `preload: true` guards across portals
- **Goal:** Prove the exact failure modes currently reproduce in `student`, `web`, and `admin` tests before editing production files (with non-phantom hover timing and clean mock migration).
- **Target files and symbols:**
  - `apps/student/src/lib/auth-client.test.ts`
  - `apps/student/test/auth-route-guard.test.ts` (`AuthRouteOptions` extended with `preload?: boolean` <!-- Red-Team RT-10 -->)
  - `apps/web/src/lib/auth-client.test.ts`
  - `apps/web/src/routes/_auth/grading-nav.test.tsx` (`buildTestRouter` with optional `defaultPreloadDelay` <!-- Red-Team RT-10 -->)
  - `apps/admin/src/routes/_auth/route.test.ts` (migrate 10 existing stubs to `getCachedSessionMock` + add `runBeforeLoad(href, { preload })` + dedicated fallback test <!-- Red-Team RT-10 -->)
- **Steps:**
  1. In `apps/student/src/lib/auth-client.test.ts` and `apps/web/src/lib/auth-client.test.ts`, add tests proving:
     - After a verified session is cached and `SESSION_CACHE_TTL_MS` expires, resolved `{ data: null, error: { status: 429 } }` or `{ data: null, error: { status: 500 } }` returns `lastKnownSession` instead of wiping cache and returning `{ data: null }`.
     - `{ allowStale: true }` after TTL expiry returns `lastKnownSession` with 0 `mockGetSession` calls.
     - Cold load (`clearSessionCache()` beforehand) recovers when `mockGetSession` resolves `{ data: null, error: { status: 500 } }` once then resolves a valid session on retry.
  2. In `apps/student/test/auth-route-guard.test.ts`:
     - Extend `AuthRouteOptions` (`line 36`) to `beforeLoad: (args: { location: { href: string }; preload?: boolean }) => Promise<unknown>` <!-- Red-Team RT-10 -->.
     - Add tests proving:
       - `beforeLoad({ location: { href: "/practice/listening?page=1" }, preload: true })` passes `{ allowStale: true }` to `authClient.getCachedSession`.
       - When `preload: true` and `getCachedSession` returns `{ data: null }` or rejects, `beforeLoad` still throws the redirect **without** calling `syncStudentSessionUser(null)` or `clearSessionCache()`.
       - When `preload: true` and `getCachedSession` returns a non-student role (`teacher`), `beforeLoad` clears wrong-role `session-cache` (`clearSessionCache`) so wrong-role sessions are never poisoned into cache, while **not** calling `syncStudentSessionUser(null)` <!-- Red-Team RT-11 -->.
  3. In `apps/web/src/routes/_auth/grading-nav.test.tsx`:
     - Add optional `defaultPreloadDelay = 0` parameter on `buildTestRouter` so hover preload executes immediately and deterministically (avoiding the 50ms phantom test trap <!-- Red-Team RT-10 -->).
     - Add a test advancing `Date.now` past `SESSION_CACHE_TTL_MS`, hovering `<Link>` (`fireEvent.mouseEnter(link)` + flush microtasks), asserting `expect(mockGetSession).toHaveBeenCalledTimes(1)` (0 hover network calls!), then setting `mockGetSession.mockResolvedValueOnce({ data: null, error: { status: 500 } })`, clicking `<Link>`, asserting `expect(mockGetSession).toHaveBeenCalledTimes(2)` AND navigation succeeds to `/grading` without kicking to `/login`.
  4. In `apps/admin/src/routes/_auth/route.test.ts` <!-- Red-Team RT-8, RT-10 -->:
     - Extend `runBeforeLoad(href: string, options?: { preload?: boolean })` to pass `preload: options?.preload`.
     - Add a test proving `beforeLoad` passes `{ allowStale: true }` on `preload: true` and reuses cached `admin` identity on hover without firing `/api/admin/me` again after initial verification.
- **Success criteria:** Newly added regression assertions in `student` and `web` fail against the unpatched portal files.
- **Verify:** `pnpm --filter student test -- src/lib/auth-client.test.ts test/auth-route-guard.test.ts` exits non-zero with assertion failure (passing is a failure in red phase).

## Refactor / Implementation

### Task 2.2 — Wire `@teacher-os/auth/session-cache` into `student`, `web`, and `admin` `auth-client.ts`
- **Goal:** Replace duplicate manual caching in `apps/student` and `apps/web`, add Proxy-wrapped cached session fetching to `apps/admin`, bind student cross-tab `ACTIVE_STUDENT_USER_KEY` cache invalidation, and clear cache both before and in `finally` on `signOut`/`resetPassword`/`updateUser`.
- **Target files and symbols:**
  - `apps/student/src/lib/auth-client.ts` (keep exports: `getServerUrl`, `SESSION_CACHE_TTL_MS`, `rawAuthClient`, `AuthSessionResult`, `SessionDataLike`, `getSessionUserRole`, `isStudentSession`, `clearSessionCache`, `getCachedSession`, `authClient` <!-- Red-Team RT-10 -->)
  - `apps/web/src/lib/auth-client.ts` (keep exports: `getServerUrl`, `SESSION_CACHE_TTL_MS`, `rawAuthClient`, `AuthSessionResult`, `clearSessionCache`, `getCachedSession`, `authClient` <!-- Red-Team RT-10 -->)
  - `apps/admin/src/lib/auth-client.ts` (exports: `getServerUrl`, `SESSION_CACHE_TTL_MS`, `rawAuthClient`, `AuthSessionResult`, `clearSessionCache`, `getCachedSession`, `authClient`)
- **Steps:**
  1. In `apps/student/src/lib/auth-client.ts`:
     - Import `createSessionCache`, `SESSION_CACHE_TTL_MS` from `@teacher-os/auth/session-cache` and re-export `SESSION_CACHE_TTL_MS`.
     - Instantiate `const { getCachedSession, clearSessionCache } = createSessionCache((signal) => rawAuthClient.getSession({ fetchOptions: { signal } }))`.
     - In browser (`typeof window !== "undefined"`), listen to `window.addEventListener("storage", (e) => { if (e.key === null || e.key === ACTIVE_STUDENT_USER_KEY) clearSessionCache(); })` so cross-tab logout or account switch invalidates `lastKnownSession` immediately <!-- Red-Team RT-3 -->.
     - Keep `Proxy` wrapping `rawAuthClient` with overrides: `getCachedSession`, `clearSessionCache`, `signOut` (calling `clearSessionCache()` before AND in `finally` <!-- Red-Team RT-1 -->), and `resetPassword` (calling `clearSessionCache()` before AND in `finally` <!-- Red-Team RT-11 -->).
  2. In `apps/web/src/lib/auth-client.ts`:
     - Apply the same `createSessionCache` wiring, preserving `AuthSessionResult` export and `Proxy` overrides for `getCachedSession`, `clearSessionCache`, `signOut`, `updateUser`, and `resetPassword` (each calling `clearSessionCache()` before AND in `finally` <!-- Red-Team RT-1, RT-11 -->).
  3. In `apps/admin/src/lib/auth-client.ts`:
     - Create `rawAuthClient = createAuthClient(...)`, wire `createSessionCache((signal) => rawAuthClient.getSession({ fetchOptions: { signal } }))`, export `SESSION_CACHE_TTL_MS`, `rawAuthClient`, `AuthSessionResult`, `getCachedSession`, `clearSessionCache`, and wrap `rawAuthClient` in a `Proxy` overriding `getCachedSession`, `clearSessionCache`, `signOut`, and `resetPassword` (each calling `clearSessionCache()` before AND in `finally` <!-- Red-Team RT-1, RT-11 -->).
- **Success criteria:** All 3 portals share one tested cache implementation, preserve all native `better-auth/react` proxy methods, and pass `auth-client.test.ts`.
- **Verify:** `pnpm --filter student test -- src/lib/auth-client.test.ts && pnpm --filter web test -- src/lib/auth-client.test.ts src/lib/auth-client-runtime.test.ts` exits 0.

### Task 2.3 — Guard `_auth/route.tsx` `beforeLoad` against `preload` side effects in `student`, `web`, and `admin`
- **Goal:** Ensure hover preloads (`preload: true`) pass `{ allowStale: true }` to `getCachedSession`, avoid destructive wipes on hover, avoid wrong-role cache poisoning, and clear admin/web cache on revocation or role mismatch.
- **Target files and symbols:**
  - `apps/student/src/routes/_auth/route.tsx` (`Route.options.beforeLoad`)
  - `apps/web/src/routes/_auth/route.tsx` (`Route.options.beforeLoad`)
  - `apps/admin/src/routes/_auth/route.tsx` (`Route.options.beforeLoad`, `clearAdminGateCacheForTests`)
  - `apps/admin/src/routes/_auth/route.test.ts` (migrate 10 existing tests to `getCachedSessionMock` + add dedicated fallback-to-`getSession` test <!-- Red-Team RT-10 -->)
- **Steps:**
  1. In `apps/student/src/routes/_auth/route.tsx`:
     - Update `beforeLoad: async ({ location, preload }) =>`.
     - Call `authClient.getCachedSession({ allowStale: Boolean(preload) })`.
     - On `!session?.data`: if `!preload`, call `syncStudentSessionUser(null)` and `authClient.clearSessionCache?.()`; then `throw redirect(...)`.
     - On `!isStudentSession(session.data)`: ALWAYS call `authClient.clearSessionCache?.()` (preventing wrong-role cache poisoning <!-- Red-Team RT-11 -->); only call `syncStudentSessionUser(null)` when `!preload`; then `throw redirect(...)`.
     - On valid student session: only call `syncStudentSessionUser(session.data.user.id)` when `!preload` (never mutate storage/QueryClient on speculative hover).
  2. In `apps/web/src/routes/_auth/route.tsx`:
     - Update `beforeLoad: async ({ location, preload }) =>`.
     - Call `typeof authClient.getCachedSession === "function" ? authClient.getCachedSession({ allowStale: Boolean(preload) }) : authClient.getSession()`.
     - On `!session?.data` when `!preload`: call `authClient.clearSessionCache?.()` before throwing redirect.
     - On wrong-role redirect (`role && resolveUserRole(role) !== "teacher"`): call `authClient.clearSessionCache?.()` before throwing redirect <!-- Red-Team RT-11 -->.
  3. In `apps/admin/src/routes/_auth/route.tsx` <!-- Red-Team RT-8 -->:
     - Maintain a small module-scoped `lastKnownAdmin: { userId: string; admin: AdminMe } | null = null` (plus export `clearAdminGateCache()` / cleared on signOut/401/403/role-mismatch/unauthenticated).
     - Update `beforeLoad: async ({ location, preload }) =>`.
     - Call `typeof authClient.getCachedSession === "function" ? authClient.getCachedSession({ allowStale: Boolean(preload) }) : authClient.getSession()`.
     - On `!session?.data`: if `!preload`, clear `lastKnownAdmin` and call `authClient.clearSessionCache?.()`; throw redirect.
     - On wrong-role redirect: clear `lastKnownAdmin` and call `authClient.clearSessionCache?.()`; throw redirect.
     - If `preload === true && lastKnownAdmin && sessionUserId && lastKnownAdmin.userId === sessionUserId`: return `{ admin: lastKnownAdmin.admin }` without hitting `/api/admin/me` on hover (0 network calls on hover!).
     - On real navigation (`!preload`, or cold `preload` with no `lastKnownAdmin`): call `await apiJson<AdminMe>("/api/admin/me")`; on success update `lastKnownAdmin`; on catch clear `lastKnownAdmin` and on `status === 401 || status === 403` call `authClient.clearSessionCache?.()`, keeping the exact `?returnUrl=` / `?blocked=1&error=...` redirect contract unchanged!
  4. In `apps/admin/src/routes/_auth/route.test.ts`:
     - Update `vi.mock("@/lib/auth-client")` to provide `getCachedSession`, `clearSessionCache`, `getSession`, `signOut`, migrate all 10 existing tests to stub `getCachedSessionMock` (clearing `lastKnownAdmin` in `beforeEach`), add tests for `preload: true` (`allowStale: true` + zero redundant `/api/admin/me` call on hover), verify `clearSessionCache()` is called on 401/403, and add a dedicated test verifying fallback to `getSession()` when `getCachedSession` is absent.
- **Success criteria:** All `_auth` route guard unit tests pass across `student`, `web`, and `admin`.
- **Verify:** `pnpm --filter student test -- test/auth-route-guard.test.ts && pnpm --filter web test -- src/routes/_auth/route.test.ts src/routes/_auth/grading-nav.test.tsx && pnpm --filter admin test -- src/routes/_auth/route.test.ts` exits 0.

## Tests After & Regression Gate

### Task 2.4 — Add admin cache tests, unmocked runtime proxy tests for `student` & `admin`, and web preload tests
- **Goal:** Guarantee full coverage across all three portals including real unmocked `better-auth/react` Proxy integrity (in separate files without hoisted `vi.mock("better-auth/react")` <!-- Red-Team RT-10 -->).
- **Target files and symbols:**
  - Create: `apps/admin/src/lib/auth-client.test.ts`
  - Create: `apps/admin/src/lib/auth-client-runtime.test.ts`
  - Create: `apps/student/src/lib/auth-client-runtime.test.ts`
  - Modify: `apps/web/src/routes/_auth/route.test.ts` (assert `preload: true` passes `{ allowStale: true }` and `!preload` passes `{ allowStale: false }`)
- **Steps:**
  1. Create `apps/admin/src/lib/auth-client.test.ts` (with mocked `better-auth/react`) covering TTL hit, dedupe, resolved `429`/`500` warm fallback, `allowStale: true`, `clearSessionCache`, `signOut` and `resetPassword` clearing cache.
  2. Create unmocked `apps/admin/src/lib/auth-client-runtime.test.ts` and `apps/student/src/lib/auth-client-runtime.test.ts` mirroring `apps/web/src/lib/auth-client-runtime.test.ts` to verify real `better-auth/react` proxy methods (`signIn.email`, `signIn.social`, `signUp.email`, `useSession`, `getSession`, `getCachedSession`, `clearSessionCache`, `signOut`, `resetPassword`).
  3. Update `apps/web/src/routes/_auth/route.test.ts` to verify `{ allowStale: true }` on `preload: true` and `{ allowStale: false }` on normal navigation.
  4. Run the full test suites of `apps/student`, `apps/web`, and `apps/admin`.
- **Success criteria:** Zero failures across all three portal test suites.
- **Verify:** `pnpm --filter student test && pnpm --filter web test && pnpm --filter admin test` exits 0.

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
