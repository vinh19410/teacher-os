# Research: E2E tooling + CI wiring for teacher-os

Worktree: `feat/59-e2e-class-operations` @ ea8301f.

## A) CODEBASE CONSTRAINTS

### A1. Contract tests — adding `e2e.yml` does NOT break them

- `scripts/ci-workflow.test.mjs:8` reads ONLY `.github/workflows/ci.yml` — does not scan the workflows dir. Assertions (:19-41): `pull_request:`, `push:`, main+develop, `pnpm exec biome check .`, `pnpm check-types`, `pnpm build`, no `biome check --write`, no `${{ secrets.`, needs `VITE_SERVER_URL`, own `pnpm test` step.
- :46-55: root `package.json` script `test` must contain `turbo run test` + `test:ci-workflow` → **do not change root test script to include e2e**.
- :57-71: turbo.json must keep task `test` (object); `apps/web` script `test` must stay exactly `"vitest run"` → don't put playwright in web `test`.
- `scripts/topology-drift.test.mjs` — unrelated to workflows. NOTE :30-32: regex `port:\s*(\d+)` from `apps/web/vite.config.ts` → don't add another `port:` number before the existing one in vite.config.ts.

### A2. turbo.json + pnpm workspace

- `turbo.json:16-18`: `test` = `{"dependsOn": ["^test"]}`. New `e2e` task: `{"cache": false, "passThroughEnv": ["PLAYWRIGHT_*"]}` (no `^build` needed if web runs via vite dev; add `dependsOn: ["^build"]` only if using vite preview).
- `pnpm-workspace.yaml:2-3`: globs `apps/*` + `packages/*` → new `apps/e2e` needs no glob change.
- Catalog pins shared versions (`pnpm-workspace.yaml:9-23`); precedent: `better-auth: 1.6.27` exact → pin `@playwright/test` exact, e.g. `"@playwright/test": "1.62.1"` in catalog, referenced as `"@playwright/test": "catalog:"`.

### A3. Root test script — e2e must stay OUT of `pnpm test`

Root `package.json:19`: `"test": "turbo run test && pnpm test:ci-workflow && pnpm test:topology-drift"`. If the e2e package defines a script named `test`, `turbo run test` pulls Playwright into the quality job (browsers not installed → red) and slows local `pnpm test`. **Name the script `e2e`; e2e is a separate CI job.** Turbo skips packages without the task.

### A4. Server boot — architecture decision (SPIKE VERDICT BELOW)

- Production server is a Cloudflare Worker + D1: `packages/env/src/server.ts:5` re-exports `env` from `cloudflare:workers`; `packages/db/src/index.ts:1-8` `createDb()` = `drizzle(env.DB)` (d1 driver).
- `packages/infra/alchemy.run.ts:66-84`: Worker `main: apps/server/src/index.ts`, D1 binding with `migrationsDir: packages/db/src/migrations` (alchemy applies drizzle migrations), env `CORS_ORIGIN` (dev default `http://localhost:8001`), `BETTER_AUTH_SECRET/URL`, `COOKIE_DOMAIN`, `GOOGLE_CLIENT_ID/SECRET` (no defaults — need dummy values); `dev: {port: 8000, strictPort: true}`; web vite `port 8001` strictPort.
- `apps/server/src/index.ts:11-16` — composition root, hard-wires `createDb()`/`createAuth()`.
- `apps/server/src/app.ts:23-28` — `AppDeps` fully DI: `getDb`, `corsOrigin`, `getSessionUser`, `authHandler`.
- In-process pattern exists: `apps/server/src/readiness.test.ts:22-52`, `kernel.test.ts` — libsql client + `drizzle-orm/libsql` + `migrate(...)` + cast `as unknown as Db`. These stub auth; real better-auth has never run under node (requires `createAuth` refactor to accept injected db + env values, because `packages/auth/src/index.ts` imports `@teacher-os/env/server` top-level → unloadable under node).
- Web: `vite.config.ts:9-10` port 8001 strictPort; VitePWA `devOptions: {enabled: true}` (:33) → service worker active in dev → Playwright needs `serviceWorkers: "block"`.
- Login: signup tab default; email+password enabled; cookie `sameSite:"none", secure:true` — Chromium accepts Secure cookies on `http://localhost` (trustworthy origin). Medium risk: cross-origin localhost:8001→8000 with `credentials:true` CORS — verify in first smoke test (chromium channel only).
- `docs/project-roadmap.md:44` — target KPI: "E2E CI xanh: login → tạo lớp có lịch → thấy buổi → check-in → reload giữ data".

### A5. Playwright not present anywhere (greenfield)

Only `@vitest/browser-playwright` appears in `pnpm-lock.yaml:6249` as optional peer dep of vitest.

### A6. Biome

`biome.json`: tabs, double quotes, includes `**` → new playwright.config.ts + specs must pass `biome check`. Biome does not format YAML → e2e.yml follows ci.yml style manually.

## SPIKE VERDICT (2026-08-22, decisive): `alchemy dev` CANNOT run in CI without Cloudflare credentials

Ran in the worktree with credential-free HOME (`HOME=/tmp/alchemy-spike-home`, no CLOUDFLARE_* env):

```
[10:19:14] ERROR (#2): AuthError: No credentials configured for 'Cloudflare' in profile 'default',
and this process is non-interactive so it can't configure it interactively.
Run `alchemy login --profile default` to configure it, or set CI=1 to use environment-variable credentials.
    at state_store.init (.../alchemy/src/Telemetry/Metrics.ts:160:12)
```

alchemy 2.0.0-beta.72's state store demands Cloudflare credentials even for local dev with emulated resources. GitHub runners have none, and the repo's CI contract forbids `${{ secrets.*` usage. **⇒ Option "alchemy dev as Playwright webServer" is DEAD. The node boot shim (buildApp DI + libsql + real better-auth behind a small auth DI refactor) is the primary architecture.** This also removes the beta-CLI-in-CI and watch-mode flakiness risks.

## B) EXTERNAL BEST PRACTICE (verified 2026-08)

1. `@playwright/test` **1.62.1** current stable.
2. CI: no official setup-playwright action; `microsoft/playwright-github-action` deprecated. Current standard: `pnpm exec playwright install --with-deps chromium` + `actions/cache` (v6) of `~/.cache/ms-playwright` keyed by OS+version; apt deps still need `--with-deps` each run. Verified action versions: checkout v7, setup-node v7 (repo already uses), cache v6, upload-artifact v7.
3. Monorepo (Turborepo guide): dedicated playwright package per app-under-test, task `e2e` with `passThroughEnv: ["PLAYWRIGHT_*"]`, `cache: false`. Playwright `webServer` supports an array (one entry per server), `url` health-check polling, `reuseExistingServer: !process.env.CI`.
4. Auth: for a single linear scenario, UI sign-up inside the test is the most robust (exercises the real flow, no internal API coupling); `storageState`/setup project only pays off with many tests.
5. Server process shape for E2E: spawn a dedicated node process that assembles `buildApp` DI + `@hono/node-server` on :8000; web via `vite dev` on :8001 with `VITE_SERVER_URL=http://localhost:8000`.

## C) RECOMMENDED ARCHITECTURE (post-spike)

| Item | Choice | Why |
|---|---|---|
| Tool | Playwright 1.62.1 (exact pin via catalog) | De-facto standard; webServer/storageState/CI docs mature |
| Location | new `apps/e2e` package (`private`, script `e2e`, NO `test` script) | Turborepo guide; no contract violations |
| API boot | node entry: libsql file DB + drizzle migrate (packages/db/src/migrations) + real better-auth via DI-refactored `createAuth` + `buildApp` + `@hono/node-server` :8000 | Spike killed alchemy dev; pattern proven by readiness/kernel tests |
| Web boot | `vite dev` :8001, `VITE_SERVER_URL=http://localhost:8000` | strictPort + CORS contract match exactly |
| Auth in test | UI sign-up inside the single spec | Most robust for one scenario |
| CI | new `.github/workflows/e2e.yml`, separate `e2e` job; quality job untouched | contract tests only read ci.yml |
| Test DB | temp/local file sqlite under `apps/e2e` (gitignored), wiped per run | inspectable, deterministic |

Required production-code refactor (small, DI-style, matches existing AppDeps philosophy):
1. `packages/auth/src/index.ts`: `createAuth()` → `createAuth(input)` with explicit `{ db, corsOrigin, secret, baseURL, cookieDomain, googleClientId, googleClientSecret }`; remove top-level `@teacher-os/env/server` import (cloudflare-only). Default-less: callers pass values.
2. `apps/server/src/session.ts`: `getSessionUser(headers)` → accepts an auth instance (no per-request createAuth).
3. `apps/server/src/index.ts`: composition root reads `env` once, passes into createAuth/getSessionUser (worker behavior unchanged).
4. `packages/auth` types: db param typed to accept the drizzle sqlite instance (libsql) — same cast precedent as tests.

### CI workflow sketch (e2e.yml)

```yaml
name: E2E
on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]
concurrency:
  group: e2e-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
permissions:
  contents: read
jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
        with: { version: 10.33.1 }
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - uses: actions/cache@v6
        with:
          path: ~/.cache/ms-playwright
          key: playwright-1.62.1-ubuntu-latest
      - run: pnpm --filter e2e exec playwright install --with-deps chromium
      - run: pnpm --filter e2e e2e
      - uses: actions/upload-artifact@v7
        if: failure()
        with:
          name: playwright-report
          path: apps/e2e/playwright-report/
          retention-days: 7
```

### playwright.config.ts sketch (tabs, double quotes — biome clean)

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./specs",
	timeout: 30_000,
	workers: 1,
	reporter: [["list"], ["html", { open: "never" }]],
	use: {
		baseURL: "http://localhost:8001",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		serviceWorkers: "block",
	},
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
	webServer: [
		{
			command: "<api boot command>",
			url: "http://localhost:8000/readyz",
			reuseExistingServer: !process.env.CI,
			timeout: 120_000,
		},
		{
			command: "<vite dev command with VITE_SERVER_URL>",
			url: "http://localhost:8001",
			reuseExistingServer: !process.env.CI,
			timeout: 120_000,
		},
	],
});
```

## RISKS (post-spike ranking)

1. **Secure cookie cross-origin localhost:8001→8000** (medium): Chromium treats localhost as trustworthy → should work; verify in the first smoke spec (chromium-only).
2. **better-auth drizzleAdapter over libsql drizzle** (medium): standard better-auth pattern, but never exercised in this repo; the createAuth refactor unit test must boot real better-auth + libsql and complete a real sign-up + session round-trip.
3. **vite dev in CI cold start** (low-medium): webServer timeout 120s; vite dev needs no build.
4. **Service worker PWA** (low): `serviceWorkers: "block"`.
5. **Future contract-drift** (low): optionally extend scripts/ci-workflow.test.mjs with e2e.yml assertions (exists, PR/push triggers, no secrets) to lock the contract.

## UNRESOLVED (for planner)

- None architecture-level; all spike-dependent forks resolved. Planner decides phase split + exact file list.
