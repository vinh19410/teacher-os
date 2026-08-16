---
phase: 2
title: "Remap bind ports, env, and docs"
status: completed
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Remap bind ports, env, and docs

## Overview

Change local bind ports and the live URL strings that must match them. CI dummy stays until phase 3. No historical plan edits. No secrets.

## Context Links

- Parent: `plan.md`
- Depends on: phase 1 lock
- `packages/infra/alchemy.run.ts:28-30` Worker `dev.port: 3000`
- `packages/infra/alchemy.run.ts:52-54` Website.Vite `dev.port: 3001`
- `packages/infra/alchemy.run.ts:22` `CORS_ORIGIN` from dotenv
- `packages/infra/alchemy.run.ts:24` `BETTER_AUTH_URL: Cloudflare.Worker.URL`
- `packages/infra/alchemy.run.ts:50` `VITE_SERVER_URL: serverWorker.url`
- `apps/web/vite.config.ts:8-10` `server.port: 3001`
- `apps/web/src/lib/auth-client.ts:37` fallback `http://localhost:3000`
- `README.md:48-49`, `:59`
- Consumers (do not edit): `packages/auth/src/index.ts:16,34`; `apps/server/src/index.ts:13,20`; `apps/web/src/components/google-oauth-button.tsx:43`

## Requirements

- Functional: local public API `8000`, web `8001`; dotenv CORS/web/auth URLs match; README local host/port match
- Non-functional: `strictPort` on public binds; env **names** unchanged; OAuth **path** unchanged; no `.env.example`; `.env` not committed

## Architecture

### Data flow after change

```
alchemy.dev.port 8000 (strict)
  → Worker.URL = http://localhost:8000
  → worker env BETTER_AUTH_URL (overrides .env)
  → injected VITE_SERVER_URL for Vite

apps/server/.env CORS_ORIGIN=http://localhost:8001
  → Hono cors origin + better-auth trustedOrigins

alchemy Website.Vite.dev.port 8001 (strict)
  → public web http://localhost:8001

apps/web/vite.config.ts server.port 8001 + strictPort
  → `dev:bare` / `start` / `vite` cannot hop
```

`callbackURL` stays `${window.location.origin}/dashboard` — follows the web origin automatically once CORS lists 8001.

### Exact edits

**`packages/infra/alchemy.run.ts`**

```ts
// Worker (was port: 3000)
dev: {
  port: 8000,
  strictPort: true,
},

// Website.Vite (was port: 3001)
dev: {
  port: 8001,
  strictPort: true,
},
```

Do not change `env` keys, `Cloudflare.Worker.URL`, or `serverWorker.url` wiring.

**`apps/web/vite.config.ts`**

```ts
server: {
  port: 8001,
  strictPort: true,
},
```

Do not set preview port (leave Vite default 4173).

**`apps/web/.env`** (gitignored)

- Set `VITE_SERVER_URL=http://localhost:8000`
- Touch no other keys
- If file missing: create with that single key only

**`apps/server/.env`** (gitignored)

- Set `BETTER_AUTH_URL=http://localhost:8000`
- Set `CORS_ORIGIN=http://localhost:8001`
- Touch no secrets (`BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
- Leave comments as-is (including any `oauth2/` path comment)
- If file missing: create **only** those two URL keys. Do not invent secrets. Stack will still need existing secrets to actually sign in.

**`README.md`**

- `:48` `http://localhost:3001` → `http://localhost:8001` (link text + href)
- `:49` `http://localhost:3000` → `http://localhost:8000`
- `:59` `http://localhost:3000/api/auth/oauth2/callback/google` → `http://localhost:8000/api/auth/oauth2/callback/google`
- Keep `:58` pattern `<BETTER_AUTH_URL>/api/auth/oauth2/callback/google`
- Do not edit production URI `:60` or `:111`

**`apps/web/src/lib/auth-client.ts:37`**

```ts
return `http://localhost:8000${normalized}`;
```

No other logic changes. `SERVER_URL` / `VERCEL_*` branches stay.

### Alchemy `strictPort` fallback

Website.Vite inherits `dev` from `WorkerProps` (`Website/Vite.ts:15-16`). Set `strictPort` there. If `pnpm --filter @teacher-os/infra check-types` rejects the field, drop **only** Website.Vite `strictPort` and keep Worker `strictPort` + Vite `server.strictPort`. Do not patch `node_modules`.

## Related Code Files

- Create: none unless a local `.env` is missing (URL keys only, gitignored)
- Modify: `packages/infra/alchemy.run.ts`
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/.env` (URL only)
- Modify: `apps/server/.env` (URL only)
- Modify: `README.md`
- Modify: `apps/web/src/lib/auth-client.ts`
- Delete: none
- Do **not** modify: `.github/workflows/ci.yml` (phase 3), `scripts/ci-workflow.test.mjs`, any `plans/**` except this plan dir

## Implementation Steps

1. Edit `alchemy.run.ts` ports + `strictPort` on Worker and Website.Vite.
2. Edit `vite.config.ts` `server.port` + `server.strictPort`.
3. Patch `.env` URL hosts/ports only. Do not stage `.env` (`git check-ignore` / leave untracked).
4. Update README local URLs and local callback **port** only.
5. Update auth-client fallback.
6. `rg 'localhost:300[01]'` on `apps/`, `packages/`, `README.md` — remaining hits must be none except comments we left on purpose (none expected).
7. Confirm `git status` does not include `.env` or historical plans.
8. Optional smoke (not a merge gate): restart `pnpm run dev`, confirm logs bind 8000/8001 with no hop warning; hard-refresh / unregister PWA SW if the old 3001 origin is cached (`vite-plugin-pwa` `devOptions.enabled: true`).

## Todo

- [x] Alchemy Worker 8000 + `strictPort`
- [x] Alchemy Website.Vite 8001 + `strictPort` (or documented type fallback)
- [x] Vite `server.port` 8001 + `strictPort`
- [x] `.env` URL hosts/ports only; secrets untouched; not staged
- [x] README local host/port updated; OAuth path unchanged
- [x] auth-client fallback `localhost:8000`
- [x] No historical plan edits

## Success Criteria

- [x] `alchemy.run.ts` Worker `dev.port === 8000` and `dev.strictPort === true`
- [x] `alchemy.run.ts` Website.Vite `dev.port === 8001` and `dev.strictPort === true` (unless type fallback recorded)
- [x] `vite.config.ts` `server.port === 8001` and `server.strictPort === true`
- [x] Local `VITE_SERVER_URL` / `BETTER_AUTH_URL` / `CORS_ORIGIN` use 8000/8001
- [x] README `:48-49` and `:59` use 800x; path still `/api/auth/oauth2/callback/google`
- [x] `auth-client.ts:37` uses `localhost:8000`
- [x] `git diff` does not include `plans/260815-*`, `plans/260816-1559-*`, `plans/260816-1640-*`, journals, or `.env`

## Risk Assessment

| Risk | LxI | Signal | Response |
|---|---|---|---|
| Port hop without `strictPort` | H x H | log “port in use, trying next”; Google/CORS mismatch | Keep `strictPort: true`; fail instead of hop |
| `.env` CORS left on 3001 | H x H | browser CORS / OAuth redirect blocked | Phase 2 must edit `CORS_ORIGIN`; Alchemy will not inject it |
| Secrets edited or staged | L x H | `.env` in `git diff --cached` | Unstage; restore secret values from backup if overwritten |
| PWA SW still points at 3001 | M x M | stale assets / wrong API | Hard refresh / unregister SW |
| Website.Vite `strictPort` type error | L x M | infra `tsc` fail | Fallback: omit Website field only |
| Inner Vite child still `strictPort: false` | — | expected (`ViteChildRunner.ts:133`) | Ignore; public URL is the proxy |

## Security Considerations

- `.env` stays gitignored (`apps/web/.gitignore:32-33`, `apps/server/.gitignore:32-34`).
- Do not print or commit Google secrets.
- Cookie `sameSite: none` / `secure` unchanged — not port-related.

## Rollback

Revert the six listed files (or the four tracked files + restore `.env` URL values to `:3000`/`:3001`). No migration. No DB. Restart `pnpm run dev`. Google Console: leave both 3000 and 8000 URIs until rollback is confirmed, then drop 8000 if desired.

## Next Steps

Phase 3 sets CI dummy `VITE_SERVER_URL` to `http://localhost:8000` and runs test / types / biome.
