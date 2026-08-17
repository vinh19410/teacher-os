---
title: Remap local dev ports to 800x
date: 2026-08-16
summary: "Local API 8000 / web 8001 with strictPort; README, env URLs, auth-client fallback, and CI dummy follow."
---

# Remap local dev ports to 800x

## What happened

`/ak:cook --auto` remapped teacher-os local-dev binds from 3000/3001 to 8000/8001.

Bind sources: Alchemy Worker `dev.port` 8000, Website.Vite `dev.port` 8001, Vite `server.port` 8001. All three now set `strictPort: true` so a collision fails instead of hopping (hop would desync `.env` CORS and Google OAuth).

Live URL strings updated: `apps/web/.env` `VITE_SERVER_URL`, `apps/server/.env` `BETTER_AUTH_URL`/`CORS_ORIGIN` (gitignored, URL keys only), README local links + OAuth callback host/port, `auth-client.ts` SSR fallback, CI dummy `VITE_SERVER_URL`.

## Decision

Keep +1 offset. User contract wins over researcher note to leave CI dummy at :3000. Do not rewrite historical plans. Do not change OAuth path (only port). Do not invent `.env.example`.

## Verification

Tester: `pnpm test` 21/21, biome 0 errors, `VITE_SERVER_URL=http://localhost:8000 pnpm check-types` 4/4. Review 9/10, 0 critical.

## Next steps

Human: add Google Cloud Console redirect URI `http://localhost:8000` + existing callback path; add JS origin `http://localhost:8001` if 3001 was listed. Keep 3000 until clients move. Restart `pnpm run dev`; unregister PWA SW if 3001 is cached.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
