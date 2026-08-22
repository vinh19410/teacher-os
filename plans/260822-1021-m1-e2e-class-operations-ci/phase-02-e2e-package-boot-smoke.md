---
title: "Phase 2: apps/e2e package + node boot + playwright config + login smoke"
status: todo
priority: P1
effort: 4h
dependencies: [phase-01-start.md]
---

# Phase 2: apps/e2e package + node boot + playwright config + login smoke

## Overview

Tạo package `apps/e2e` (private, script `e2e`, KHÔNG script `test`), node boot shim cho API trên :8000 (libsql file DB + migrate + real better-auth qua `createAuth(input)` từ Phase 1 + `buildApp` + `@hono/node-server`), playwright config với 2 webServer (api + vite dev web), và MỘT login smoke spec (sign-up qua UI → /dashboard). Smoke spec retire sớm rủi ro số 1: Secure cookie `SameSite=None; Secure` cross-origin localhost:8001→8000.

**Data flow boot:**

```
apps/e2e/src/boot.ts (tsx, plain node)
  1. wipe apps/e2e/local.db + local.db-wal + local.db-shm (WAL siblings — tránh replay mồ côi)
  2. createClient(file:local.db) → drizzle libsql → migrate(packages/db/src/migrations)
  3. auth = createAuth({ db, corsOrigin: "http://localhost:8001", secret: <32+ char dummy>, baseURL: "http://localhost:8000", google* dummy })
  4. app = buildApp({ getDb, corsOrigin, getSessionUser: (h) => getSessionUser(auth, h), authHandler: (req) => auth.handler(req) })
  5. serve({ fetch: app.fetch, port: 8000, hostname: "127.0.0.1" }) → health: http://localhost:8000/readyz
  6. SIGTERM/SIGINT → server.close() → exit 0 (Playwright teardown SIGTERM cả chuỗi pnpm→tsx→node)
```

Web: `vite` (port 8001 strictPort từ `apps/web/vite.config.ts:8-10`), env `VITE_SERVER_URL=http://localhost:8000` (fallback mặc định của auth-client cũng là :8000 — `apps/web/src/lib/auth-client.ts:37` — nhưng set tường minh cho deterministic).

## Requirements

- [ ] `apps/e2e` là workspace package tên `e2e`, private, scripts: `e2e` (playwright test), `boot:api` (tsx src/boot.ts), `check-types` (tsc --noEmit). KHÔNG script `test` → turbo task `test` bỏ qua, root `pnpm test` không đổi (contract `scripts/ci-workflow.test.mjs:46-71`).
- [ ] `@playwright/test` pin exact `1.62.1` qua catalog (`pnpm-workspace.yaml`), tham chiếu `"catalog:"` — tiền lệ `better-auth: 1.6.27` (`pnpm-workspace.yaml:15`). `@hono/node-server` pin exact `2.1.1`, `tsx` pin exact `4.23.12` (đã verify npm 2026-08-22; network server dependency không được để `<latest>` trôi).
- [ ] turbo task `e2e`: `{ "cache": false, "passThroughEnv": ["PLAYWRIGHT_*"] }` (không `^build` — web chạy vite dev, không cần build).
- [ ] Boot wipe DB mỗi lần khởi động (mỗi run e2e = state sạch, deterministic) — wipe cả 3 file `local.db`, `local.db-wal`, `local.db-shm`.
- [ ] playwright.config: workers 1, chromium only, `serviceWorkers: "block"` (VitePWA devOptions enabled — `vite.config.ts:33`), `reuseExistingServer: false` cho CẢ 2 server (port bận = fail loud, KHÔNG âm thầm reuse dev server alchemy đang chiếm :8000/:8001 — nếu không spec chạy chống worker D1 cũ, DB không wipe → false-green), timeout 120_000 mỗi webServer, test timeout 120_000 (spec tuyến tính dài + cold vite dev), `retries: process.env.CI ? 1 : 0` (trace on-first-retry có ý nghĩa trên CI).
- [ ] `biome.json` `files.includes` thêm `"!**/playwright-report"` + `"!**/test-results"` (biome có `vcs.useIgnoreFile: false` — .gitignore KHÔNG được tôn trọng; không exclude thì `biome check .` đỏ deterministic sau lần chạy e2e đầu tiên do scan report bundle sinh ra).
- [ ] Smoke spec: sign-up UI thành công, redirect `/dashboard`, nav sidebar hiện "Lớp học" + "Lịch dạy" (`apps/web/src/components/layout/sidebar.tsx:53,107`) = org đã bootstrap qua `GET /api/kernel`.

## Architecture

- Import server code bằng subpath exports mới (thêm vào `apps/server/package.json`): `"exports": { ".": "./src/index.ts", "./app": "./src/app.ts", "./session": "./src/session.ts" }`. Boot import `buildApp` từ `server/app`, `getSessionUser` từ `server/session` — KHÔNG bao giờ import entry `server` (= `src/index.ts` → `@teacher-os/env/server` → crash dưới node). Đã grep: không có ai import package `server` theo tên hiện nay → thêm exports an toàn; giữ entry `.` cho alchemy/turbo path hiện hành.
- Boot chạy qua `tsx` vì module graph workspace dùng import extensionless (vd `packages/db/src/index.ts:4`) → node ESM thuần không resolve được; tsx resolve được.
- `/schedule` không cần cho smoke — chỉ login.

## Related Code Files

| Action | Path |
|--------|------|
| Create | `apps/e2e/package.json` |
| Create | `apps/e2e/tsconfig.json` (extends `@teacher-os/config/tsconfig.base.json`, noEmit, include src/specs/playwright.config.ts; pattern theo `apps/server/tsconfig.json` bỏ composite) |
| Create | `apps/e2e/playwright.config.ts` |
| Create | `apps/e2e/src/boot.ts` |
| Create | `apps/e2e/specs/login.smoke.spec.ts` |
| Modify | `pnpm-workspace.yaml` — catalog thêm `"@playwright/test": 1.62.1` (không đổi globs — `apps/*` đã match) |
| Modify | `turbo.json` — thêm task `e2e` |
| Modify | `apps/server/package.json` — thêm exports map (giữ `main`) |
| Modify | `biome.json` — `files.includes` thêm `"!**/playwright-report"`, `"!**/test-results"` (biome bỏ qua .gitignore — generated report phải exclude tường minh như `!**/dist` sẵn có) |
| Modify | `.gitignore` — thêm `apps/e2e/playwright-report/` và `apps/e2e/test-results/` (file `local.db` đã bị ignore bởi pattern `local.db` sẵn có, match mọi depth) |

`apps/e2e/package.json` (khung):

```json
{
	"name": "e2e",
	"private": true,
	"type": "module",
	"scripts": {
		"e2e": "playwright test",
		"boot:api": "tsx src/boot.ts",
		"check-types": "tsc --noEmit"
	},
	"dependencies": {
		"@teacher-os/auth": "workspace:*",
		"@teacher-os/db": "workspace:*",
		"server": "workspace:*"
	},
	"devDependencies": {
		"@hono/node-server": "2.1.1",
		"@libsql/client": "0.17.4",
		"@playwright/test": "catalog:",
		"@teacher-os/config": "workspace:*",
		"@types/node": "catalog:",
		"drizzle-orm": "^0.45.2",
		"tsx": "4.23.12",
		"typescript": "catalog:"
	}
}
```

(Version đã verify trên npm 2026-08-22: `@hono/node-server 2.1.1`, `tsx 4.23.12` — pin exact theo convention repo (`better-auth: 1.6.27`); review diff `pnpm-lock.yaml` trước khi commit gate. `@libsql/client 0.17.4` + `drizzle-orm ^0.45.2` khớp `apps/server/package.json:24,18`.)

`playwright.config.ts` (tabs, double quotes — biome):

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./specs",
	timeout: 120_000,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
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
			command: "pnpm run boot:api",
			url: "http://localhost:8000/readyz",
			reuseExistingServer: false,
			timeout: 120_000,
		},
		{
			command: "pnpm --filter web exec vite",
			url: "http://localhost:8001/",
			env: { VITE_SERVER_URL: "http://localhost:8000" },
			reuseExistingServer: false,
			timeout: 120_000,
		},
	],
});
```

(webServer chạy với cwd = thư mục config (apps/e2e); web KHÔNG có script `dev` — dùng `exec vite` (`apps/web/package.json:9` chỉ có `start`/`dev:bare`); `env` trên webServer được hỗ trợ từ Playwright 1.44.)

## Implementation Steps

### Tests Before (TDD)

1. Viết `apps/e2e/specs/login.smoke.spec.ts` TRƯỚC:

```ts
import { expect, test } from "@playwright/test";

test("sign-up dẫn tới dashboard với org bootstrap", async ({ page }) => {
	await page.goto("/login");
	// Context mới → tab mặc định là signup ("Create account")
	await page.locator("#su-name").fill("E2E Teacher");
	await page.locator("#su-email").fill(`e2e-${Date.now()}@test.local`);
	await page.locator("#su-password").fill("password-8chars");
	await page.getByRole("button", { name: "Create account" }).click();
	await expect(page).toHaveURL(/\/dashboard/);
	await expect(page.getByText("Lớp học").first()).toBeVisible();
	await expect(page.getByText("Lịch dạy").first()).toBeVisible();
});
```

(Fact: `/login` default tab signup trừ khi localStorage `teacher-os-auth-tab === "signin"` — context Playwright luôn sạch → deterministic, `apps/web/src/routes/login.tsx:27-34`. Ids `su-name/su-email/su-password` cố định: `apps/web/src/components/sign-up-form.tsx:85,102,121`. Password ≥ 8 chars. Vị trí "Lớp học"/"Lịch dạy" trên sidebar có thể trùng PageHead — dùng `.first()`.)

2. Tạo package/config/boot (dưới) → chạy `pnpm --filter e2e e2e` → RED (chưa có server/web) → boot xong → GREEN.

### Implementation

3. Thêm catalog + turbo task + exports map + gitignore (bảng Related Code Files).
4. `pnpm install` (lockfile cập nhật; commit).
5. Cài browser local: `pnpm --filter e2e exec playwright install chromium`.
6. `apps/e2e/src/boot.ts`:

```ts
import { createClient } from "@libsql/client";
import { rmSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createAuth } from "@teacher-os/auth";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { buildApp, type Db } from "server/app";
import { getSessionUser } from "server/session";

const PORT = 8000;
const HOSTNAME = "127.0.0.1"; // loopback-only — không expose auth thật ra LAN
const CORS_ORIGIN = "http://localhost:8001";
const DB_PATH = new URL("../local.db", import.meta.url).pathname;
const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

// Wipe cả 3 file (db + WAL siblings) — tránh replay WAL mồ côi giữa các run
for (const suffix of ["", "-wal", "-shm"]) {
	rmSync(`${DB_PATH}${suffix}`, { force: true });
}
const client = createClient({ url: `file:${DB_PATH}` });
const libsql = drizzle(client, { schema });
await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });

const auth = createAuth({
	db: libsql,
	corsOrigin: CORS_ORIGIN,
	secret: "e2e-local-secret-0123456789abcdef0123456789abcdef",
	baseURL: `http://localhost:${PORT}`,
	googleClientId: "e2e-dummy",
	googleClientSecret: "e2e-dummy",
});

const app = buildApp({
	getDb: () => libsql as unknown as Db,
	corsOrigin: CORS_ORIGIN,
	getSessionUser: (headers) => getSessionUser(auth, headers),
	authHandler: (req) => auth.handler(req),
});

const server = serve({ fetch: app.fetch, port: PORT, hostname: HOSTNAME }, () =>
	console.log(`[e2e-boot] api on http://${HOSTNAME}:${PORT}`),
);

// Playwright teardown SIGTERM cả chuỗi pnpm → tsx → node; đóng server sạch
// để lần chạy kế tiếp không đụng port/state (reuseExistingServer: false).
const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
```

(Pattern migrate + cast y hệt `apps/server/src/kernel.test.ts:33-50`. `/readyz` mount ngoài `/api/*`, trả lời từ schema catalog — chạy được dưới libsql, đã chứng minh bởi `readiness.test.ts`.)

7. Chạy `pnpm --filter e2e e2e` — Playwright tự boot 2 webServer, chờ health URLs, chạy smoke.

### Tests After

8. Smoke xanh 2 lần liên tiếp (flake check): `pnpm --filter e2e e2e && pnpm --filter e2e e2e`.
9. `pnpm test` vẫn xanh và KHÔNG chứa playwright (turbo chỉ chạy task `test`; package e2e không có).

### Regression Gate

```bash
pnpm install --frozen-lockfile && pnpm exec biome check . && pnpm test && pnpm check-types && pnpm --filter e2e e2e
```

## Success Criteria

- [ ] `pnpm --filter e2e e2e` xanh local: sign-up UI → `/dashboard` → sidebar nav hiện "Lớp học", "Lịch dạy".
- [ ] Cookie session hoạt động cross-origin :8001→:8000 (smoke xanh = bằng chứng; KHÔNG đổi `sameSite/secure` trong `packages/auth`).
- [ ] `pnpm test` không kéo playwright (grep output turbo: không có task e2e).
- [ ] `apps/e2e/local.db`, `playwright-report/`, `test-results/` không xuất hiện trong `git status`.
- [ ] Biome + check-types xanh (kể cả `apps/e2e`).

## Risk Assessment

| Risk (wrong assumption) | Observable signal | Pre-decided response |
|---|---|---|
| Chromium chặn Secure cookie trên http cross-origin localhost | Sau sign-up, redirect về `/dashboard` rồi bounce ngược `/login?returnUrl=...` (route guard `_auth/route.tsx:7-21` không thấy session) | localhost là trustworthy origin → cookie Secure được chấp nhận; nếu vẫn fail: kiểm tra `credentials` trên authClient fetch (`auth-client.ts`), set `fetchOptions: { credentials: "include" }`; TUYỆT ĐỐI không đổi cookie flags trong packages/auth (đó là hành vi prod) |
| `tsx` không resolve `server/app` exports | boot crash `ERR_MODULE_NOT_FOUND` | Kiểm tra exports map đã thêm; tsx tôn trọng exports field; fallback: import trực tiếp file `apps/server/src/app.ts` không qua package name |
| Health `/readyz` không respond dưới node boot | webServer timeout 120s ở entry api | `readiness.test.ts` đã chứng minh route chạy với libsql; nếu vẫn timeout → đổi url health thành `http://localhost:8000/` (route `/` trả text "OK", `app.ts:99`) |
| Port 8000/8001 bận (dev server alchemy đang mở) | webServer fail EADDRINUSE NGAY (reuseExistingServer: false — KHÔNG âm thầm reuse server cũ; tránh false-green chạy chống worker D1 không wipe) | Tắt dev server trước khi chạy e2e: `lsof -ti:8000,8001 \| xargs kill`; đây là hành vi mong muốn — fail loud tại boot thay vì spec xanh rỗng |
| PWA service worker phá vite dev dưới playwright | Trang trắng / stale assets | Đã set `serviceWorkers: "block"`; nếu vẫn thấy SW → thêm `contextOptions` bỏ register; không disable VitePWA trong vite.config (prod behavior) |
| `pnpm check-types` đỏ vì tsconfig apps/e2e thiếu option | tsc lỗi module resolution | Chỉnh tsconfig apps/e2e theo base config (bundler-style resolution); KHÔNG đụng tsconfig các package khác |
