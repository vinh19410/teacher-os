---
phase: 1
title: "Lock mapping and file inventory"
status: completed
priority: P1
effort: "0.5h"
dependencies: []
---

# Phase 1: Lock mapping and file inventory

## Overview

Read-only gate. Lock 8000/8001, name every live file, forbid historical rewrites, and record the Google Cloud Console human follow-up. No application edits.

## Context Links

- Parent: `plan.md`
- Scout: `plans/reports/scout-2026-08-16-development-port-configuration.md`
- Research: `plans/reports/researcher-2026-08-16-local-dev-port-remap.md`
- Bind: `packages/infra/alchemy.run.ts:28-30`, `:52-54`; `apps/web/vite.config.ts:8-10`
- Fallback: `apps/web/src/lib/auth-client.ts:37`
- Live docs: `README.md:48-49`, `:59`
- CI dummy: `.github/workflows/ci.yml:20` (edit in phase 3)
- Contract test: `scripts/ci-workflow.test.mjs:36` (key only; do not change)

## Requirements

- Functional: mapping + file list + do-not-touch list agreed before phase 2
- Non-functional: no code, no `.env.example`, no secret reads committed to the plan

## Architecture

### Mapping (locked)

| Role | Origin | Port | Why |
|---|---|---|---|
| API / Better-Auth | `http://localhost:8000` | 8000 | Alchemy Worker public proxy (`dev.port`) |
| Web | `http://localhost:8001` | 8001 | Alchemy `Website.Vite` public proxy + Vite `server.port` |

Offset stays +1. Do not switch to 8100/8101 if 8000 is busy — fail with `strictPort` (phase 2).

### Data flow (current → target)

```
pnpm run dev
  → turbo task `dev`
  → only packages/infra (`alchemy dev`)
  → Worker proxy :8000  → BETTER_AUTH_URL = Worker.URL (no trailing slash)
  → Website.Vite proxy :8001
  → Vite env VITE_SERVER_URL = serverWorker.url  (follows Worker port)
  → CORS_ORIGIN from apps/server/.env only  (must become :8001)
```

Alchemy does **not** inject `CORS_ORIGIN`. `.env` `BETTER_AUTH_URL` is human/docs; worker runtime uses `Cloudflare.Worker.URL` (`alchemy.run.ts:24`).

### Live files to change later

| Phase | File | Change |
|---|---|---|
| 2 | `packages/infra/alchemy.run.ts` | Worker `dev.port` 3000→8000 + `strictPort: true`; Website.Vite `dev.port` 3001→8001 + `strictPort: true` |
| 2 | `apps/web/vite.config.ts` | `server.port` 3001→8001 + `server.strictPort: true` |
| 2 | `apps/web/.env` | `VITE_SERVER_URL=http://localhost:8000` only |
| 2 | `apps/server/.env` | `BETTER_AUTH_URL=http://localhost:8000`, `CORS_ORIGIN=http://localhost:8001` only |
| 2 | `README.md` | local URLs `:48-49` and callback host/port `:59` |
| 2 | `apps/web/src/lib/auth-client.ts` | fallback `:37` `localhost:3000`→`localhost:8000` |
| 3 | `.github/workflows/ci.yml` | dummy `VITE_SERVER_URL` → `http://localhost:8000` |

Create: none. Delete: none. Do not invent `.env.example`.

### Do not touch

- `plans/260815-1553-convert-open-design-v1-to-react-and-remove-better-t-mock-ui/**`
- `plans/260816-1559-add-ci-pipeline-biome-check-types-build/**`
- `plans/260816-1640-add-automated-web-app-test-suite/**`
- `plans/journals/**`
- `plans/reports/**` (stateful scout/research records)
- `apps/web/src/lib/mock-data.ts` (`price: 300000`)
- `pnpm-lock.yaml` caniuse versions
- `scripts/ci-workflow.test.mjs` (asserts key, not port)
- Vite preview / `serve` (default 4173)
- Production Worker URLs, deploy docs origin examples
- Env **names**: `VITE_SERVER_URL`, `BETTER_AUTH_URL`, `CORS_ORIGIN`, `BETTER_AUTH_SECRET`, `GOOGLE_*`
- Google OAuth **path** in README (`/api/auth/oauth2/callback/google`) — port only
- `packages/auth/src/index.ts`, `apps/server/src/index.ts`, `apps/web/src/components/google-oauth-button.tsx` (origin comes from env / `window.location`)

No `docs/`, no committed `.env.example`, no `wrangler.toml`.

### Alchemy `strictPort` (verified)

- Worker `dev.strictPort?: boolean` — `packages/infra/node_modules/alchemy/src/Cloudflare/Workers/Worker.ts:904-909`
- `Cloudflare.Website.Vite` `ViteProps` extends `Omit<WorkerProps, "vite" | "main" | "assets">` — `Website/Vite.ts:15-16` → **inherits** `dev.strictPort`
- Public URL = WorkerProxy on `dev.port`; trailing slash stripped — `LocalWorkerProvider.ts:980`
- Inner Vite child uses ephemeral port + hardcoded `strictPort: false` — `ViteChildRunner.ts:133`. Do not edit `node_modules`.

If implement-time types reject Website.Vite `strictPort` (unexpected vs 2.0.0-beta.72), keep Vite `server.strictPort` and Worker `dev.strictPort`; skip only the Website field.

### Google Cloud Console (human, not code)

After phase 2, a human must add Authorized redirect URI(s) for the new API origin. Exact path is whatever is already registered — this plan does **not** fix the README `oauth2/` vs Better-Auth social `/api/auth/callback/google` mismatch.

- Add: `http://localhost:8000` + the **existing** callback path (README currently documents `/api/auth/oauth2/callback/google`)
- Keep the old `localhost:3000` URI until local clients have moved
- If Authorized JavaScript origins lists `http://localhost:3001`, add `http://localhost:8001`
- Do not delete production URIs
- Do not put client secrets in git or in this plan

## Related Code Files

- Create: none
- Modify: none
- Delete: none

## Implementation Steps

1. Confirm `lsof -nP -iTCP:8000 -sTCP:LISTEN` and `:8001` (IPv4 and IPv6/`[::1]`). If occupied, stop and free the port or wait — do not change the mapping.
2. Re-read the live file list above. Confirm no extra `localhost:3000`/`3001` in app/source outside the listed files (`rg 'localhost:300[01]'` excluding `plans/`).
3. Confirm `.env` files exist locally (gitignored). Do not print secrets. Expected URL keys only:
   - `apps/web/.env`: `VITE_SERVER_URL`
   - `apps/server/.env`: `BETTER_AUTH_URL`, `CORS_ORIGIN`
4. Confirm historical plan/journal paths will not be edited.
5. Record Google Console follow-up for the human operator (above). Do not open Console from this phase.

## Todo

- [x] 8000/8001 listen check done (or collision documented; mapping still 8000/8001)
- [x] Live file inventory confirmed; no extra source hits
- [x] Historical rewrite ban confirmed
- [x] Google Console follow-up noted (human)

## Success Criteria

- [x] Mapping locked: API 8000, web 8001
- [x] Exact modify list matches phase 2 + phase 3 ownership
- [x] Zero edits in this phase
- [x] Operator knows Console must gain the new localhost port

## Risk Assessment

| Risk | LxI | Signal | Response |
|---|---|---|---|
| 8000 taken (FastAPI/Uvicorn/`python -m http.server`) | M x H | `lsof` shows LISTEN; later `strictPort` crash | Free the process. Do not hop. Do not remap to 8100 without a new user decision |
| IPv6 `[::1]:8000` taken while IPv4 free | L x H | Alchemy dual-bind collision | Same as above |
| `.env` missing | L x M | phase 2 cannot patch URLs | Create **only** the three URL keys locally if files are absent. No secrets. No `.env.example` |
| Scout `.env` existence contradicted itself | L x L | scout said both “missing” and listed lines | Treat as local gitignored files; patch URL keys if present, create URL-only keys if absent |
| Operator “fixes” OAuth path while remapping | M x M | README path rewritten | Reject. Path fix is out of scope |

## Security Considerations

- Do not cat/commit `BETTER_AUTH_SECRET` or Google client secrets.
- Console change is additive (new localhost port). Keep prod URIs.

## Rollback

Nothing to revert. Phase is read-only.

## Next Steps

Phase 2 edits bind ports, `.env` URLs, README, and auth-client fallback.
