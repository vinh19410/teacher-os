---
title: "Remap local dev ports to 800x"
description: "Move local Alchemy/Vite binds from 3000/3001 to 8000/8001 and align live env, README, fallback, and CI dummy URL."
status: completed
priority: P1
effort: "2h"
branch: develop
tags: [infra, local-dev]
blockedBy: []
blocks: []
created: 2026-08-16
---

# Remap local dev ports to 800x

## Overview

Local `pnpm run dev` binds API `3000` + web `3001`. Remap to `8000` / `8001` (keep +1 offset). Live `.env`, README local URLs, auth-client fallback, and CI dummy `VITE_SERVER_URL` follow. Production Worker URLs, env var names, historical plans, and OAuth path strings stay.

## Outcome

Local stack + docs use 800x. Occupied ports fail loudly (`strictPort`). Google Console is a human follow-up, not a code change.

## Constraints / Non-goals

- Keep relative offset (old `3000`/`3001` → `8000`/`8001`).
- Do not rename env vars. Do not change production Worker URLs.
- Do not rewrite historical `plans/**` or journals.
- Do not change Google OAuth **path** strings; only the localhost port.
- Do not invent `.env.example`. Do not commit secrets.
- Out of scope: new services, auth redesign, OAuth path-doc fix, Vite preview `4173`, production deploy, new test frameworks.

## Locked mapping

| Role | Old | New | Bind source |
|------|-----|-----|-------------|
| API / Better-Auth | `http://localhost:3000` | `http://localhost:8000` | `packages/infra/alchemy.run.ts` Worker `dev.port` |
| Web | `http://localhost:3001` | `http://localhost:8001` | Alchemy `Website.Vite` `dev.port` + `apps/web/vite.config.ts` `server.port` |

## Load-bearing decisions

1. **8000/8001 + `strictPort: true`.** Hopping would desync `.env` + Google. Occupied → fail, do not pick 8100.
2. **Alchemy `Website.Vite` accepts `dev.strictPort`.** `ViteProps` extends `WorkerProps` minus `vite`/`main`/`assets` (`packages/infra/node_modules/alchemy/src/Cloudflare/Website/Vite.ts:15-16`). Worker field: `Worker.ts:904-909`. Set it on both Worker and Website.Vite. Vite child still binds ephemeral `port: 0` with hardcoded `strictPort: false` (`ViteChildRunner.ts:133`) — public URL is WorkerProxy on `dev.port`.
3. **CI dummy → `http://localhost:8000`.** Researcher said leave `3000`; accepted contract overrides. `scripts/ci-workflow.test.mjs:36` asserts the key only.
4. **`.env` URL hosts/ports only.** Alchemy injects `BETTER_AUTH_URL` + `VITE_SERVER_URL` at bind time; `CORS_ORIGIN` is dotenv-only (`alchemy.run.ts:22,24,50`).
5. **Historical plans stay.** Live contract = alchemy + vite + `.env` + README + CI YAML.

## Cross-Plan Dependencies

| Relationship | Plan | Status |
|---|---|---|
| None | `260816-1559-add-ci-pipeline-biome-check-types-build` completed; do not edit | completed |
| None | `260816-1640-add-automated-web-app-test-suite` completed; do not edit | completed |
| None | `260815-1553-convert-open-design-v1-to-react-and-remove-better-t-mock-ui` completed; do not edit | completed |

## Phases

| Phase | Name | Status | Depends |
|---|---|---|---|
| 1 | [Lock mapping and file inventory](./phase-01-start.md) | Completed | — |
| 2 | [Remap bind ports, env, and docs](./phase-02-remap-bind-ports-env-and-docs.md) | Completed | 1 |
| 3 | [Align CI dummy URL and verify](./phase-03-align-ci-dummy-url-and-verify.md) | Completed | 2 |

## Acceptance Criteria

- [x] `packages/infra/alchemy.run.ts` server `dev.port = 8000`, web `dev.port = 8001`, both `dev.strictPort = true`
- [x] `apps/web/vite.config.ts` `server.port = 8001` and `server.strictPort = true`
- [x] `apps/web/.env` `VITE_SERVER_URL=http://localhost:8000`
- [x] `apps/server/.env` `BETTER_AUTH_URL=http://localhost:8000` and `CORS_ORIGIN=http://localhost:8001` (those URL hosts/ports only)
- [x] `README.md` local web/API URLs and Google local callback **host/port** updated; path string unchanged
- [x] `apps/web/src/lib/auth-client.ts` fallback `localhost:8000`
- [x] `.github/workflows/ci.yml` dummy `VITE_SERVER_URL: http://localhost:8000`
- [x] Historical plans/journals unchanged
- [x] `pnpm test`, `pnpm exec biome check .`, `pnpm check-types` pass with the new dummy URL

## File ownership

| Phase | May modify |
|---|---|
| 1 | none (read-only lock) |
| 2 | `packages/infra/alchemy.run.ts`, `apps/web/vite.config.ts`, `apps/web/.env`, `apps/server/.env`, `README.md`, `apps/web/src/lib/auth-client.ts` |
| 3 | `.github/workflows/ci.yml` only |

## Evidence

- Scout: `plans/reports/scout-2026-08-16-development-port-configuration.md`
- Research: `plans/reports/researcher-2026-08-16-local-dev-port-remap.md`
- Tester: `plans/reports/tester-2026-08-16-remap-local-dev-ports-to-800x.md` — 21/21 pass; biome 0 err; check-types 4/4
- Code review: `plans/reports/code-review-2026-08-16-remap-local-dev-ports-to-800x.md` — score 9/10; 9/9 AC PASS

<!-- slug: remap-local-dev-ports-to-800x -->
