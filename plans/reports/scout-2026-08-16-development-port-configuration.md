# Scout: local ports 3000/3001 + localhost URLs

Date: 2026-08-16
Repo: `/Users/vinhtran/Documents/project/personal/teacher-os`
Scope: live bind / env / docs / CI / tests. Historical plans listed only as noise.

## Convention (current)

| Role | Port | Origin |
|------|------|--------|
| Server (Alchemy Worker / Better-Auth) | **3000** | `http://localhost:3000` |
| Web (Alchemy Vite + `vite.config.ts`) | **3001** | `http://localhost:3001` |

`pnpm run dev` → turbo `dev` → **only** `packages/infra` has a `dev` script (`alchemy dev`). Web/server packages have **no** `dev` script. Root `dev:web` / `dev:server` do not bind ports.

No `docs/` tree. No `.env.example`. No `wrangler.toml` in source. No `strictPort`. Vite preview (`apps/web` `serve`) has no port → Vite default **4173**.

## 1. Binds a port (runtime)

| Path:line | What |
|-----------|------|
| `packages/infra/alchemy.run.ts:28-30` | Worker `dev.port: 3000` |
| `packages/infra/alchemy.run.ts:52-54` | Website.Vite `dev.port: 3001` |
| `apps/web/vite.config.ts:8-10` | Vite `server.port: 3001` (used by `dev:bare` / `start`; Alchemy also sets 3001) |

How Alchemy wires URLs at bind time (`packages/infra/alchemy.run.ts`):

- `24` `BETTER_AUTH_URL: Cloudflare.Worker.URL` (overrides `.env` value for the worker)
- `22` `CORS_ORIGIN: Config.string("CORS_ORIGIN")` (from dotenv)
- `50` `VITE_SERVER_URL: serverWorker.url.as<string>()` (injected into Vite)

Dotenv load order (`alchemy.run.ts:7-9`): `packages/infra/.env` (absent) → `apps/web/.env` → `apps/server/.env`.

## 2. Local env (gitignored, live on this machine)

No committed `.env.example`. Gitignores *expect* them (`apps/web/.gitignore:32-33`, `apps/server/.gitignore:32-34`) but files **do not exist**.

| Path:line | Contract |
|-----------|----------|
| `apps/web/.env:1` | `VITE_SERVER_URL=http://localhost:3000` |
| `apps/server/.env:2` | `BETTER_AUTH_URL=http://localhost:3000` |
| `apps/server/.env:3` | `CORS_ORIGIN=http://localhost:3001` |
| `apps/server/.env:5` | comment: register `<BETTER_AUTH_URL>/api/auth/oauth2/callback/google` |

Do not treat `BETTER_AUTH_SECRET` / Google creds as port config.

`packages/env/src/server.ts` does not parse these — it re-exports `cloudflare:workers` env typed from Alchemy (`packages/env/env.d.ts`).

## 3. Public contracts (env + OAuth)

Env var names (live):

| Name | Schema / source | Local value | Prod |
|------|-----------------|-------------|------|
| `VITE_SERVER_URL` | `packages/env/src/web.ts:7` `z.url()` required | `http://localhost:3000` | Alchemy `serverWorker.url` |
| `CORS_ORIGIN` | Alchemy `Config.string` + Hono/auth | `http://localhost:3001` | exact deployed web origin (README) |
| `BETTER_AUTH_URL` | Alchemy `Cloudflare.Worker.URL`; `.env` is human/docs only | `http://localhost:3000` | worker URL |
| `SERVER_URL` | `auth-client.ts:10-13` process.env fallback | **unset / undocumented** | leftover Vercel path |

OAuth / CORS:

- Google redirect (local): `http://localhost:3000/api/auth/oauth2/callback/google`
- Pattern: `<BETTER_AUTH_URL>/api/auth/oauth2/callback/google`
- Auth mount: `/api/auth/*` (`apps/server/src/index.ts:20`)
- Client `baseURL`: `new URL("/api/auth", getServerUrl(env.VITE_SERVER_URL))` (`auth-client.ts:42`)
- Post-login: `${window.location.origin}/dashboard` (`google-oauth-button.tsx:43`)
- `trustedOrigins: [env.CORS_ORIGIN]` (`packages/auth/src/index.ts:16`)
- Hono CORS origin = `env.CORS_ORIGIN` (`apps/server/src/index.ts:13`)

Hardcoded localhost fallback: `apps/web/src/lib/auth-client.ts:37` → `` `http://localhost:3000${normalized}` ``. Only if `VITE_SERVER_URL` is relative (`/`…) **and** no `window` **and** no `VERCEL_*`. Current `.env`/CI values are absolute → fallback unused.

## 4. Dummy CI env (does not bind)

| Path:line | What |
|-----------|------|
| `.github/workflows/ci.yml:19-20` | job env `VITE_SERVER_URL: http://localhost:3000` (satisfies `z.url()` for check-types/build) |
| `scripts/ci-workflow.test.mjs:36` | asserts YAML contains `VITE_SERVER_URL` key — **not** the `:3000` value |

No test starts a server or hits localhost. `apps/web` tests are reducer-only (`vitest.config.ts` node env). `turbo.json` has no ports.

## 5. Docs (live, non-plan)

| Path:line | What |
|-----------|------|
| `README.md:45-49` | `pnpm run dev` → web `http://localhost:3001`, API `http://localhost:3000` |
| `README.md:57-63` | OAuth callback + `CORS_ORIGIN` / `trustedOrigins` |
| `README.md:111` | prod: set `CORS_ORIGIN` in `apps/server/.env` to deployed web origin |

`bts.jsonc`, root `package.json`, `turbo.json`: no port numbers.

## 6. Consumers (no hardcoded port, contract-dependent)

| Path:line | Role |
|-----------|------|
| `packages/env/src/web.ts:7-9` | requires `VITE_SERVER_URL` |
| `packages/env/src/server.ts:5` | CF worker env re-export |
| `packages/auth/src/index.ts:16,34` | `trustedOrigins`, `baseURL` |
| `apps/server/src/index.ts:13,20` | CORS + `/api/auth/*` |
| `apps/web/src/lib/auth-client.ts:4-42` | client auth origin resolution |
| `apps/web/src/components/google-oauth-button.tsx:43` | `callbackURL` web origin |
| `packages/infra/package.json:7` | `dev`: `alchemy dev` (actual process) |
| `apps/web/package.json:8-12` | `serve` / `start` / `dev:bare` — Vite, port from `vite.config.ts` only |

## 7. Historical / not live (do not treat as contract)

- `plans/260816-1559-add-ci-pipeline-biome-check-types-build/**` — dummy `VITE_SERVER_URL=http://localhost:3000`
- `plans/260816-1640-add-automated-web-app-test-suite/reports/**` — same dummy in test logs
- `plans/journals/2026-08-16-ci-quality-gate-for-issue-3.md:16`
- `plans/260815-1553-…/plan.md:160` — spot-check “vite port 3001”

## 8. False positives

- `apps/web/src/lib/mock-data.ts:293` `price: 300000` (VND)
- `open-design/v1/teacher-os.html:564` same
- `pnpm-lock.yaml` `caniuse-lite@1.0.30001809`

## Dual source of truth

Two independent 3001 binds: Alchemy `Website.Vite.dev.port` **and** `vite.config.ts`. No `strictPort` → Vite may increment if busy.

`.env` `BETTER_AUTH_URL=http://localhost:3000` is **not** what the worker receives; Alchemy sets `Cloudflare.Worker.URL`. In local Alchemy that should still be `:3000`. Google Console must match the **actual** worker URL.

## Unresolved

- Confirm Alchemy local `Worker.URL` string (trailing slash? `http` vs `https`) — not in source.
- `SERVER_URL` / `VERCEL_*` in `auth-client.ts` look like unused scaffold; no other writer.
- Root `dev:web` / `dev:server` scripts are stale (no package `dev` task).

Status: DONE
Summary: Live bind is Alchemy 3000/3001 plus Vite 3001; local origins are `localhost:3000` (API/auth) and `localhost:3001` (web/CORS). CI only dummies `VITE_SERVER_URL`.
Concerns/Blockers: none
