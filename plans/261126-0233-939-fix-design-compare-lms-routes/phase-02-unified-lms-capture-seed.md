---
phase: 2
title: "Phase 2: Unified LMS Boot, Capture & Seed Migration"
status: completed
priority: P1
effort: "1h15m"
dependencies: [1]
---

# Phase 2: Unified LMS Boot, Capture & Seed Migration

## Goal

Migrate `scripts/design-compare/capture.mjs` to build `apps/lms`, `apps/web`, and `apps/student` into an isolated `<STATE>/lms-dist` served via `startLmsServer` on 2 ports (`API_PORT`, `LMS_PORT`) with zero-TOCTOU port reservation and SSRF-hardened `waitUrl`, migrate `apps/e2e/scripts/design-seed.ts` to unified LMS auth/bootstrap with `#652` guards, and verify end-to-end execution of `pnpm design:compare`.

## Files to Create / Modify

- Modify: `scripts/design-compare/capture.mjs`
- Modify: `apps/e2e/scripts/design-seed.ts`

## Tests Before

Phase 1 regression tests (`pnpm test:design-compare`) and existing E2E unit tests (`pnpm --filter e2e test`) must already be green before editing `capture.mjs` and `design-seed.ts`.

## Tasks & Steps

### Task 2.1 — Migrate `scripts/design-compare/capture.mjs` to isolated-dist unified `apps/lms` + `startLmsServer`
- **Goal:** Replace the legacy 2-Vite-server boot, warmup, auth login, and screen URL construction with a zero-TOCTOU 2-port isolated-dist `apps/lms` build + `startLmsServer` flow that never touches `apps/*/dist`.
- **Target files and symbols:**
  - `scripts/design-compare/capture.mjs`:
    - Imports from `./harness-lib.mjs` (lines 32-46)
    - `fill` (lines 72-77)
    - `start` (lines 115-139)
    - `waitUrl` (lines 143-166)
    - `syncBackstopCleanup` & `shutdown` (lines 169-278)
    - Port/origin declarations (lines 483-490)
    - `main` boot & seed section (lines 502-596)
    - `main` teacher/student auth storageState section (lines 608-645)
    - `main` screen navigation section (lines 682-716)
- **Steps:**
  1. Import `buildStudentLandingRegex`, `buildTeacherDashboardRegex`, `reserveFreePort`, and `resolveAppScreenUrl` from `./harness-lib.mjs`. Define `const LMS_DIST = path.join(STATE, "lms-dist");` and `const SERVE_LMS_MODULE = path.join(ROOT, "apps/lms/scripts/serve-lms.mjs");`.
  2. Harden `fill(tpl)` (`capture.mjs:72-77`): encode substituted `{seed.*}` values with `encodeURIComponent(String(seed[k]))` so a seed value can never inject `/`, `..`, `?`, or `#` into screen paths. <!-- Updated: Red Team F4 -->
  3. Replace `WEB_PORT`, `STUDENT_PORT`, `WEB`, `STUDENT` module variables with `LMS_PORT`, `LMS`, and `let apiPortHold = null;` (keeping `API_PORT`, `API`, `DESIGN`).
  4. Update `start()` (`capture.mjs:122-127`) to pass `{ apiPort: API_PORT, lmsPort: LMS_PORT, extraEnv: opts.env }` to `buildChildEnv`.
  5. Harden `waitUrl(url, { timeoutMs = 150_000, name = url, child, headers } = {})` (`capture.mjs:143-166`):
     - Compute `const remainingMs = timeoutMs - (Date.now() - t0);` before each `fetch`.
     - Pass `{ ...(headers ? { headers } : {}), redirect: "error", signal: AbortSignal.timeout(Math.min(5_000, Math.max(500, remainingMs))) }` to `fetch(url, ...)` so neither SSRF redirects nor tarpit sockets can bypass or hang `waitUrl`. <!-- Updated: Red Team F1 -->
  6. In `shutdown()` and `syncBackstopCleanup()`:
     - Release `apiPortHold` if still held.
     - Remove `LMS_DIST` (`rmSync(LMS_DIST, { recursive: true, force: true })`) on exit so ephemeral-port bundles never linger on disk. <!-- Updated: Red Team F3 -->
  7. In `if (needApp)` (`capture.mjs:503-596`) — zero-TOCTOU isolated-dist boot sequence: <!-- Updated: Red Team F1, F2, F3 -->
     - Reserve `API_PORT` before building: `apiPortHold = await reserveFreePort(); API_PORT = apiPortHold.port; API = \`http://localhost:${API_PORT}\`;`.
     - Build the 3 needed bundles sequentially into isolated `LMS_DIST` (never touching `apps/{lms,web,student,admin}/dist` and never building `admin`):
       1. `lms`: `pnpm --filter lms exec vite build --outDir ${LMS_DIST} --emptyOutDir` with `buildChildEnv(process.env, { apiPort: API_PORT, extraEnv: { LMS_SKIP_PORTAL_ASSEMBLE: "1" } })`, `timeoutMs: 120_000`, tracked under `activeChildren.set("lms-build", c)`.
       2. `web`: `pnpm --filter web exec vite build --outDir ${path.join(LMS_DIST, "teacher")} --emptyOutDir` with `buildChildEnv(process.env, { apiPort: API_PORT })`, `timeoutMs: 120_000`, tracked under `activeChildren.set("web-build", c)`.
       3. `student`: `pnpm --filter student exec vite build --outDir ${path.join(LMS_DIST, "student")} --emptyOutDir` with `buildChildEnv(process.env, { apiPort: API_PORT })`, `timeoutMs: 120_000`, tracked under `activeChildren.set("student-build", c)`.
       - If any build returns `code !== 0`, delete from `activeChildren`, log redacted output, and `return 1`.
     - After builds complete, probe `LMS_PORT = await probeFreePort({ excludePorts: new Set([API_PORT]) })` and set `LMS = \`http://localhost:${LMS_PORT}\``.
     - Release `apiPortHold` (`await apiPortHold.release(); apiPortHold = null;`) immediately before spawning `apiChild` and `lmsChild` back-to-back:
       - `apiChild = start("api", "pnpm", ["--filter", "e2e", "run", "boot:api"], { env: { E2E_HOSTNAME: "127.0.0.1" } })`
       - `lmsChild = start("lms", process.execPath, ["--input-type=module", "-e", 'import { pathToFileURL } from "node:url"; const [modPath, distDir, host, port] = process.argv.slice(1); const { startLmsServer } = await import(pathToFileURL(modPath).href); startLmsServer({ distDir, host, port: Number(port) });', "--", SERVE_LMS_MODULE, LMS_DIST, "127.0.0.1", String(LMS_PORT)])`
     - Poll readiness directly on `127.0.0.1` (immune to `[::1]` hijack during wait):
       - `await waitUrl(\`http://127.0.0.1:${API_PORT}/readyz\`, { name: "api", child: apiChild })`
       - `startChildWatchdog()`
       - `await waitUrl(\`http://127.0.0.1:${LMS_PORT}/login\`, { name: "lms", child: lmsChild, headers: { Accept: "text/html" } })`
       - `await waitUrl(\`http://127.0.0.1:${LMS_PORT}/teacher/dashboard\`, { timeoutMs: 15_000, name: "lms/teacher", child: lmsChild, headers: { Accept: "text/html" } })`
       - `await waitUrl(\`http://127.0.0.1:${LMS_PORT}/student/\`, { timeoutMs: 15_000, name: "lms/student", child: lmsChild, headers: { Accept: "text/html" } })`
     - Verify NO `[::1]` listener hijacks `localhost` on EITHER port BEFORE `warm()`, `design-seed.ts`, or browser login:
       - `if (await ipv6LoopbackListening(API_PORT))` → throw hijack error.
       - `if (await ipv6LoopbackListening(LMS_PORT))` → throw hijack error.
     - Warm unified gateway once: `await warm(\`${LMS}/login\`, "#signin-email")`.
     - Update `design-seed.ts` `spawnAsync` env to `buildChildEnv(process.env, { apiPort: API_PORT, lmsPort: LMS_PORT })`, and update error log header from `(api/web/student)` to `(api/lms)`.
  8. Update Teacher auth login block (`capture.mjs:610-625`):
     - Open `${LMS}/login`, click `#tab-signin`, fill `#signin-email` with `seed.teacherEmail`, fill `#signin-password` with `seed.teacherPassword`, click `page.locator("#panel-signin button[type='submit']")`, and wait for `page.waitForURL(buildTeacherDashboardRegex(LMS), { timeout: 30_000 })`. <!-- Updated: Red Team F5 -->
  9. Update Student auth login block (`capture.mjs:626-645`):
     - Open `${LMS}/login`, click `#tab-signin`, fill `#signin-email` with `seed.studentEmail`, fill `#signin-password` with `seed.studentPassword`, click `page.locator("#panel-signin button[type='submit']")`, and wait for `page.waitForURL(buildStudentLandingRegex(LMS), { timeout: 30_000 })`.
  10. Update screen capture navigation (`capture.mjs:695-703`):
      - Compute `const targetUrl = resolveAppScreenUrl(LMS, sc.auth, fill(sc.app));` and navigate `tPage` (teacher), `sPage` (student), or `aPage` (`null`) to `targetUrl`.
  11. Update top file comment in `capture.mjs` to describe the unified 2-port isolated-dist `apps/lms` boot accurately.
- **Success criteria:** `capture.mjs` has no references to `WEB_PORT`, `STUDENT_PORT`, `#su-name`, `#si-email`, or `${STUDENT}/login`, passes syntax check and Biome lint.
- **Verify:** `node --check scripts/design-compare/capture.mjs && pnpm exec biome check scripts/design-compare/capture.mjs` exits 0.

### Task 2.2 — Migrate `apps/e2e/scripts/design-seed.ts` to unified LMS auth and `/teacher` bootstrap
- **Goal:** Seed the teacher account via `POST /__e2e/seed-user`, sign in via `POST /api/auth/sign-in/email` with full `#652` redirect/deadline/redaction/cookie guards, bootstrap org at `/teacher/dashboard` with fail-fast `/login` redirect detection, and sign up/verify the student via unified `/login`.
- **Target files and symbols:**
  - `apps/e2e/scripts/design-seed.ts` (imports at lines 15-28; step 1 teacher bootstrap at lines 134-260; step 7 student signup at lines 570-689; output JSON at lines 748-788)
- **Steps:**
  1. Import `API_ORIGIN, LMS_ORIGIN, TEACHER_BASE_URL` from `../specs/origins` (replacing `WEB_ORIGIN`/`STUDENT_ORIGIN` imports).
  2. Replace Step 1 UI teacher sign-up (`design-seed.ts:134-181`): <!-- Updated: Red Team F5 -->
     - Seed verified teacher account directly via `ctx.request.post(\`${API_ORIGIN}/__e2e/seed-user\`, { headers: { "Content-Type": "application/json" }, data: { email: teacherEmail, password: PASSWORD, name: "Nguyễn Hoàng Lan", role: "teacher", emailVerified: true }, maxRedirects: 0, timeout: clampTimeoutMs(SEED_DEADLINE, 30_000, "teacher seed-user") })`; if `status() !== 200`, throw `new Error(\`[design-seed] teacher seed-user thất bại: HTTP ${res.status()} ${redactCapabilityUrl((await res.text()).slice(0, 200))}\`)`.
     - Sign in on the same `ctx` cookie jar via `ctx.request.post(\`${API_ORIGIN}/api/auth/sign-in/email\`, { headers: { "Content-Type": "application/json", Origin: LMS_ORIGIN }, data: { email: teacherEmail, password: PASSWORD }, maxRedirects: 0, timeout: clampTimeoutMs(SEED_DEADLINE, 30_000, "teacher sign-in") })`; if `!res.ok()`, throw redacted HTTP error.
     - Assert a non-empty `*.session_token` cookie exists in `await ctx.cookies(API_ORIGIN)` before navigating (matching Step 7's `assertVerifiedEmailRedirect` cookie check).
     - Register `kernelObs` listeners on `page`, then navigate via `await gotoStable(page, \`${TEACHER_BASE_URL}/dashboard\`)` (dropping the no-op `waitForURL(/\/teacher\/dashboard/)`).
  3. Harden the kernel wait loop (`design-seed.ts:190-260`): <!-- Updated: Red Team F5 -->
     - Inside the wait loop, if `new URL(page.url()).pathname === "/login"` (auth session rejected by `_auth` beforeLoad), fail fast with `throw new Error(\`[design-seed] phiên giáo viên bị chuyển về /login (${redactCapabilityUrl(page.url())})\`)` instead of burning 120s.
     - Update the rescue `page.goto` (`design-seed.ts:229`) from `${WEB_ORIGIN}/dashboard` to `${TEACHER_BASE_URL}/dashboard` (and observation failure prefix to `goto /teacher/dashboard`).
     - Include `url=${redactCapabilityUrl(page.url())}` in the `orgIdForTeacherEmail` failure message.
  4. Update Step 7 student sign-up (`design-seed.ts:577-635`):
     - Navigate to `${LMS_ORIGIN}/login`.
     - Replace `studentPage.getByRole("button", { name: "Tạo tài khoản" }).click({ timeout: signUpTimeout })` with `studentPage.locator("#panel-signup button[type='submit']").click({ timeout: signUpTimeout })`.
     - Pass `studentOrigin: LMS_ORIGIN` to `assertVerifiedEmailRedirect` and `Origin: LMS_ORIGIN` to `quiz/start` POSTs.
  5. In the written `design-seed.json` object (`design-seed.ts:751-780`), include `lmsOrigin: LMS_ORIGIN` alongside `apiOrigin: API_ORIGIN`, `webOrigin: LMS_ORIGIN`, `studentOrigin: LMS_ORIGIN`.
- **Success criteria:** `pnpm --filter e2e check-types`, `pnpm --filter e2e test`, and `pnpm exec biome check apps/e2e/scripts/design-seed.ts` all pass with 0 errors.
- **Verify:** `pnpm --filter e2e check-types && pnpm --filter e2e test && pnpm exec biome check apps/e2e/scripts/design-seed.ts` exits 0.

### Task 2.3 — Live end-to-end verification of `pnpm design:compare` and cleanup check
- **Goal:** Prove with live execution that `pnpm design:compare` boots `api` + isolated unified `lms`, seeds teacher + student cleanly, captures all 36 screens without blank screenshots or `errors.log`, and leaves zero orphaned processes, zero `apps/*/dist` pollution, and clean `git status`.
- **Target files and symbols:**
  - Runtime verification of `scripts/design-compare/capture.mjs` and `apps/e2e/scripts/design-seed.ts`
- **Steps:**
  1. Run focused smoke across all 3 auth tiers (`null`, `teacher`, `student`): `pnpm design:compare --side app --force --screens login-teacher,t-dashboard,s-dashboard`.
  2. Run full app capture across all 36 screens in `screens.json`: `pnpm design:compare --side app --force` (and if `teacheros-design-v2` is accessible, also run a targeted `--side both --force --screens login-teacher,t-dashboard,s-dashboard` check — restoring any tracked screenshot diffs afterward if UI did not change).
  3. Verify `scripts/design-compare/.state/errors.log` and `scripts/design-compare/.state/lms-dist` do NOT exist after exit, check `ps` for zero lingering `boot:api`, `serve-lms`, or `design-compare` child processes, and verify `apps/{lms,web,student,admin}/dist` were not created/modified by the run.
  4. Run the full local quality gates: `pnpm exec biome check .`, `pnpm check-types`, `pnpm test:design-compare`, `pnpm --filter e2e test`.
- **Success criteria:** Smoke + full 36-screen app capture exit 0 with `0 lỗi`, no `errors.log`, no lingering `lms-dist`, no orphan processes, and all lint/type/unit tests pass.
- **Verify:** `pnpm design:compare --side app --force --screens login-teacher,t-dashboard,s-dashboard` exits 0 and prints `0 lỗi`; `pnpm test:design-compare && pnpm --filter e2e test && pnpm exec biome check . && pnpm check-types` exits 0.

## Tests After & Regression Gate

- `pnpm test:design-compare` exits 0 (`fail 0`).
- `pnpm --filter e2e test` exits 0 (`fail 0`).
- `pnpm exec biome check .` exits 0.
- `pnpm check-types` exits 0.
- Live `pnpm design:compare --side app --force` exits 0 with `0 lỗi`.

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
