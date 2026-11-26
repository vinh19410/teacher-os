---
phase: 1
title: "Phase 1: Pure Harness Helpers & Regression Tests"
status: completed
priority: P1
effort: "45m"
dependencies: []
---

# Phase 1: Pure Harness Helpers & Regression Tests

## Goal

Define and TDD-verify the pure URL, origin-anchored regex, port-reservation, and sanitized child-env contracts in `scripts/design-compare/harness-lib.mjs` along with a full 36-screen `screens.json` drift test against `apps/lms/src/routes-matcher.ts` and `apps/student/src/routeTree.gen.ts` in `scripts/design-compare.test.mjs`.

## Files to Create / Modify

- Modify: `scripts/design-compare.test.mjs`
- Modify: `scripts/design-compare/harness-lib.mjs`

## Tests Before (TDD Red Phase)

Write failing unit tests first in `scripts/design-compare.test.mjs` covering:
1. Updated `buildChildEnv` contract: strips inherited `E2E_STUDENT_PORT`, `LMS_SKIP_PORTAL_ASSEMBLE`, `LMS_REBUILD_PORTALS`, `E2E_TEACHER_EMAILS`, `E2E_ADMIN_EMAILS`, and `ALCHEMY_CLOUDFLARE_VITE_INJECTED` from `baseEnv`; validates provided ports (integer `1..65535`), omits env keys rather than emitting `"undefined"` when a port is omitted, supports `lmsPort` + `webPort` fallback for `E2E_LMS_PORT`/`E2E_WEB_PORT`, and lets `extraEnv` override explicitly. <!-- Updated: Red Team F2 -->
2. `reserveFreePort({ excludePorts })`: binds dual-stack loopback (`127.0.0.1` + `::1` when IPv6 is available) and holds the port busy (`isPortFreeOnLoopback(port) === false`) until `release()` is called, after which `isPortFreeOnLoopback(port) === true` and repeated `release()` is idempotent. <!-- Updated: Red Team F1 -->
3. `resolveAppScreenUrl(lmsOrigin, auth, appPath)`: fail-closed validation of `lmsOrigin` (`http:`/`https:`, no userinfo/path/query/hash), strict `auth` allowlist (`"teacher" | "student" | null`; rejects `undefined`, `""`, `"admin"`, etc.), rejects control chars, backslashes, `//`, `/\`, `..` (raw and percent-decoded), idempotent prefix handling, and verifies final `new URL` origin and portal prefix containment. <!-- Updated: Red Team F4 -->
4. `buildTeacherDashboardRegex(lmsOrigin)` and `buildStudentLandingRegex(lmsOrigin)`: origin-anchored matching for teacher (`/teacher/dashboard`, `/teacher/dashboard?x=1`) and student (`/student`, `/student/`, `/student?tab=1`, `/student/?tab=1`), rejecting lookalikes (`/student2`, `/teacher/dashboard-evil`, `/login?returnUrl=/teacher/dashboard`, wrong origin). <!-- Updated: Red Team F5 -->
5. Full 36-screen drift test for `scripts/design-compare/screens.json`: resolves every screen through `resolveAppScreenUrl`, verifies `auth === null` against `isValidLmsRootRoute`, strips `/teacher` before verifying `auth === "teacher"` against `isValidTeacherSubRoute`, parses `FileRoutesByTo` from `apps/student/src/routeTree.gen.ts` to verify every `auth === "student"` screen against actual student router routes, and fails closed on unknown `auth`. <!-- Updated: Red Team F4 -->

## Tasks & Steps

### Task 1.1 — Add failing TDD tests in `scripts/design-compare.test.mjs`
- **Goal:** Establish failing regression tests for sanitized `buildChildEnv`, `reserveFreePort`, fail-closed `resolveAppScreenUrl`, `buildTeacherDashboardRegex`, `buildStudentLandingRegex`, and 36-screen route drift detection before editing production helper code.
- **Target files and symbols:**
  - `scripts/design-compare.test.mjs` (imports from `harness-lib.mjs` at lines 25-41; `buildChildEnv` test at lines 234-256; append new tests at end of file)
  - Read-only references: `scripts/design-compare/screens.json`, `apps/lms/src/routes-matcher.ts` (`isValidLmsRootRoute`, `isValidTeacherSubRoute`), `apps/student/src/routeTree.gen.ts` (`FileRoutesByTo`)
- **Steps:**
  1. In `scripts/design-compare.test.mjs`, destructure `reserveFreePort`, `resolveAppScreenUrl`, `buildTeacherDashboardRegex`, and `buildStudentLandingRegex` from `lib`.
  2. Update the `buildChildEnv` test (lines 234-256):
     - Pass a poisoned `baseEnv` containing `{ PATH: "/usr/bin", E2E_STUDENT_PORT: "8103", LMS_SKIP_PORTAL_ASSEMBLE: "1", LMS_REBUILD_PORTALS: "1", E2E_TEACHER_EMAILS: "x@y.z", E2E_ADMIN_EMAILS: "a@b.c", ALCHEMY_CLOUDFLARE_VITE_INJECTED: "1" }` with `{ apiPort: 8000, lmsPort: 8001 }`.
     - Assert `E2E_API_PORT === "8000"`, `E2E_LMS_PORT === "8001"`, `E2E_WEB_PORT === "8001"`, `VITE_SERVER_URL === "http://localhost:8000"`, `VITE_TEACHER_SIGNUP_ENABLED === "true"`, `VITE_STUDENT_PRACTICE_ENABLED === "true"`, `PATH === "/usr/bin"`, and all 6 poisoned keys are `undefined`.
     - Assert fallback `{ apiPort: 8000, webPort: 8002 }` sets both `E2E_LMS_PORT` and `E2E_WEB_PORT` to `"8002"`.
     - Assert omitting `apiPort` (`buildChildEnv({}, { lmsPort: 8001 })`) does NOT emit `E2E_API_PORT` or `VITE_SERVER_URL` (no `"undefined"` strings), and omitting `lmsPort`/`webPort` (`buildChildEnv({}, { apiPort: 8000 })`) does NOT emit `E2E_LMS_PORT`/`E2E_WEB_PORT`.
     - Assert invalid port values (e.g. `0`, `70000`, `NaN`, `"abc"`) throw an Error, and `extraEnv` overrides explicitly.
  3. Add unit test `reserveFreePort: giữ cổng bận trên loopback trong suốt thời gian build và giải phóng sạch khi release()`:
     - Call `const hold = await reserveFreePort()`; assert `typeof hold.port === "number"` and `await isPortFreeOnLoopback(hold.port) === false`.
     - Call `await hold.release()` (and a second idempotent `await hold.release()`); assert `await isPortFreeOnLoopback(hold.port) === true`.
  4. Add unit test `resolveAppScreenUrl: map đúng prefix /teacher, /student, root và fail-closed với auth/path/origin không hợp lệ`:
     - Valid cases: `(origin, null, "/login")`, `(origin + "/", null, "/pay/abc123")`, `(origin, "teacher", "/dashboard")`, `(origin, "teacher", "/teacher/classes/c1")`, `(origin, "student", "/")` → `.../student/`, `(origin, "student", "/practice/vocabulary")`, `(origin, "student", "/student/history")`.
     - Fail-closed rejection cases (all must throw): `auth: undefined`, `auth: ""`, `auth: "admin"`, `lmsOrigin: ""`, `lmsOrigin: "http://user:pass@localhost:8101"`, `lmsOrigin: "http://localhost:8101/sub"`, `appPath: "dashboard"`, `appPath: "//evil.example/pwn"`, `appPath: "/\\evil.example"`, `appPath: "/../student/history"` (with `auth: "teacher"`), `appPath: "/classes/%2e%2e/%2e%2e/student/history"`, `appPath: "/dashboard\n"`.
  5. Add unit test `buildTeacherDashboardRegex & buildStudentLandingRegex: neo chặt origin và path đích`:
     - `buildTeacherDashboardRegex("http://localhost:46291")`: matches `http://localhost:46291/teacher/dashboard`, `http://localhost:46291/teacher/dashboard?x=1`; rejects `http://localhost:46291/login?returnUrl=/teacher/dashboard`, `http://localhost:46291/teacher/dashboard2`, `http://evil.local/teacher/dashboard`.
     - `buildStudentLandingRegex("http://localhost:46291")`: matches `http://localhost:46291/student`, `http://localhost:46291/student/`, `http://localhost:46291/student?tab=1`, `http://localhost:46291/student/?tab=1`; rejects `http://localhost:46291/`, `http://localhost:46291/student2`, `http://localhost:46291/student/classes`, `http://localhost:46291/teacher`, `http://localhost:99999/student`.
  6. Add unit test `screens.json: toàn bộ 36 màn khớp apps/lms/src/routes-matcher.ts và apps/student/src/routeTree.gen.ts`:
     - Import `isValidLmsRootRoute` and `isValidTeacherSubRoute` from `../apps/lms/src/routes-matcher.ts`.
     - Read `apps/student/src/routeTree.gen.ts`, extract the `export interface FileRoutesByTo { ... }` block, parse all route keys `'...'`, and convert `$param` segments to `[^/]+` and `$` splat to `.*` regex matchers (asserting > 10 student routes parsed so the parser itself cannot silently match nothing).
     - Parse `scripts/design-compare/screens.json`, replace `{seed.*}` with `"sample-id"`, resolve each screen via `resolveAppScreenUrl("http://localhost:8101", sc.auth, filled)`, extract `pathname = new URL(resolved).pathname`:
       - `auth === null`: assert `isValidLmsRootRoute(pathname) === true`.
       - `auth === "teacher"`: assert `pathname.startsWith("/teacher/")` and `isValidTeacherSubRoute(pathname.slice("/teacher".length)) === true`.
       - `auth === "student"`: assert `pathname === "/student" || pathname.startsWith("/student/")` and the stripped sub-path (`pathname.slice("/student".length) || "/"`) matches at least one parsed route from `apps/student/src/routeTree.gen.ts`.
       - Any other `sc.auth`: `assert.fail(...)`.
- **Success criteria:** Running `pnpm test:design-compare` fails specifically on the missing exports and legacy `buildChildEnv` behavior.
- **Verify (expected RED):** `pnpm test:design-compare` exits non-zero with failures in the newly added/updated tests (exit 0 here is a failure).

### Task 1.2 — Implement hardened unified LMS helpers in `scripts/design-compare/harness-lib.mjs`
- **Goal:** Make all Phase 1 unit tests pass cleanly with fail-closed validation and zero impact on existing helpers.
- **Target files and symbols:**
  - `scripts/design-compare/harness-lib.mjs` (`buildChildEnv` at lines 59-73; add `reserveFreePort`, `resolveAppScreenUrl`, `buildTeacherDashboardRegex`, `buildStudentLandingRegex`)
- **Steps:**
  1. Update `buildChildEnv(baseEnv, { apiPort, lmsPort, webPort, extraEnv } = {})`:
     - Copy `baseEnv` into a fresh object and delete conflicting inherited keys: `E2E_STUDENT_PORT`, `LMS_SKIP_PORTAL_ASSEMBLE`, `LMS_REBUILD_PORTALS`, `E2E_TEACHER_EMAILS`, `E2E_ADMIN_EMAILS`, `ALCHEMY_CLOUDFLARE_VITE_INJECTED`.
     - Validate any defined port via a helper `validatePortValue(name, val)` requiring integer `1..65535` (throwing on invalid values).
     - When `apiPort !== undefined`, set `E2E_API_PORT: String(apiPort)` and `VITE_SERVER_URL: \`http://localhost:${apiPort}\``.
     - Compute `effectiveLmsPort = lmsPort ?? webPort`; when `effectiveLmsPort !== undefined`, set `E2E_LMS_PORT: String(effectiveLmsPort)` and `E2E_WEB_PORT: String(effectiveLmsPort)`.
     - Always set `VITE_TEACHER_SIGNUP_ENABLED: "true"`, `VITE_STUDENT_PRACTICE_ENABLED: "true"`, then apply `...extraEnv`.
  2. Export `reserveFreePort({ excludePorts } = {})`:
     - Loop up to 10 attempts: bind `v4 = net.createServer()` on `(0, "127.0.0.1")`; obtain `port = v4.address().port`; skip if in `excludePorts`; try binding `v6 = net.createServer()` on `(port, "::1")`.
     - If `v6` succeeds (or fails with `EADDRNOTAVAIL`/`EAFNOSUPPORT`), keep the bound socket(s) open and return `{ port, release }` where `release()` idempotently closes `v4` and `v6` and awaits both `"close"` callbacks.
     - On `v6` busy, close `v4` and retry; throw after 10 failed attempts.
  3. Export `resolveAppScreenUrl(lmsOrigin, auth, appPath)`:
     - Parse `lmsOrigin` with `new URL(lmsOrigin)` (strip trailing `/` only if pathname is `/`): require `protocol === "http:" || protocol === "https:"`, empty `username`/`password`/`search`/`hash`, and `pathname === "/"`.
     - Validate `auth === null || auth === "teacher" || auth === "student"`; throw otherwise.
     - Validate `typeof appPath === "string" && appPath.startsWith("/")`, no control characters (`code <= 0x1f || code === 0x7f`), no backslashes `\`, no `//` prefix, and no `..` path segment either raw or after `decodeURIComponent` (throw on malformed URI encoding too).
     - Compute `prefixedPath`:
       - `auth === null`: `appPath`
       - `auth === "teacher"`: `/^\/teacher(?:\/|\?|#|$)/.test(appPath) ? appPath : \`/teacher${appPath}\``
       - `auth === "student"`: `/^\/student(?:\/|\?|#|$)/.test(appPath) ? appPath : \`/student${appPath}\``
     - Construct `parsed = new URL(prefixedPath, expectedOrigin)` and verify `parsed.origin === expectedOrigin` and:
       - if `auth === "teacher"`, `parsed.pathname === "/teacher" || parsed.pathname.startsWith("/teacher/")`;
       - if `auth === "student"`, `parsed.pathname === "/student" || parsed.pathname.startsWith("/student/")`.
     - Return `parsed.href`.
  4. Export `buildTeacherDashboardRegex(lmsOrigin)` and `buildStudentLandingRegex(lmsOrigin)`:
     - Parse & normalize `lmsOrigin` via the same strict origin validator, escape regex metacharacters, and return:
       - `buildTeacherDashboardRegex`: `new RegExp(\`^${escaped}/teacher/dashboard(?:[/?#].*)?$\`)`
       - `buildStudentLandingRegex`: `new RegExp(\`^${escaped}/student/?(?:\\?.*)?$\`)`
- **Success criteria:** All tests in `scripts/design-compare.test.mjs` pass and Biome reports 0 lint/format issues.
- **Verify:** `pnpm test:design-compare && pnpm exec biome check scripts/design-compare/harness-lib.mjs scripts/design-compare.test.mjs` exits 0 and prints `fail 0`.

## Regression Gate

- `pnpm test:design-compare` exits 0 (`fail 0`).
- `pnpm exec biome check scripts/design-compare/harness-lib.mjs scripts/design-compare.test.mjs` exits 0.

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
