# Production release and support runbook

Operator procedure for deploying, verifying, rolling back, and supporting
Teacher OS on Cloudflare Workers + D1. This runbook contains **no secret
values** — only secret names, owners, and rotation paths.

## Topology — single source of truth

The production topology is `app.<domain>` (web) + `api.<domain>` (API). It is
**encoded in runtime configuration, not in this document**: the deploy-time
variable `APP_DOMAIN` (bare lowercase domain) derives every URL below via
`packages/infra/src/topology.ts`, wired in `packages/infra/alchemy.run.ts`.
Changing topology means changing `APP_DOMAIN` in the operator's deploy
environment — never editing this runbook.

| Setting | Value (APP_DOMAIN set) | Where it comes from |
| --- | --- | --- |
| Web origin | `https://app.<domain>` | Website.Vite `domain: app.<APP_DOMAIN>` |
| API origin | `https://api.<domain>` | Worker `domain: api.<APP_DOMAIN>` |
| `CORS_ORIGIN` (server binding) | `https://app.<domain>` | default derived from `APP_DOMAIN` (explicit override still possible) |
| `BETTER_AUTH_URL` (server binding) | `https://api.<domain>` | derived from `APP_DOMAIN`; worker URL otherwise |
| Better Auth base URL | `https://api.<domain>/api/auth` | `authBaseURL()` in `packages/auth/src/topology.ts` (mount path `/api/auth`) |
| Google redirect URI | `https://api.<domain>/api/auth/callback/google` | derived from the Better Auth base URL |
| Session cookies | cross-subdomain, `Domain=.<domain>`, `SameSite=None; Secure; HttpOnly` | `COOKIE_DOMAIN` binding → `crossSubDomainCookieDomain()` in `packages/auth/src/topology.ts` |
| `VITE_SERVER_URL` (web build) | `https://api.<domain>` | derived from `APP_DOMAIN`; server worker URL otherwise |

With `APP_DOMAIN` unset (local dev and staging), the stack keeps its generated
`workers.dev` URLs, per-host cookies, and an explicit `CORS_ORIGIN` is
required. Derived-value unit tests live in
`packages/infra/src/topology.test.ts` and `packages/auth/src/topology.test.ts`.

## Environments and stages

Alchemy stages isolate state and physical resource names; resources of
different stages never overlap.

| Stage | Purpose | APP_DOMAIN | Data |
| --- | --- | --- | --- |
| `dev_<user>` (default) | Local development | unset | disposable |
| `staging` | Migration/recovery rehearsal, pre-release checks | unset | **rehearsal only** — never production data |
| `prod` | Pilot/production | set to the real domain | real pilot data |

**Never rehearse against the production or pilot D1 database.** The staging
database is the only rehearsal target (see "Provision staging").

## Secret inventory

No values, tokens, or database IDs are stored in this repo or in GitHub.
Each secret lives only in the operator's local environment
(`packages/infra/.env`, gitignored) or the Cloudflare dashboards. dotenv
loads `packages/infra/.env` first — a value there wins over the same name in
`apps/web/.env` or `apps/server/.env`.

| Name | Owner | Where it lives | Rotation path |
| --- | --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Deploy operator | operator env | n/a (identifier, not a credential) |
| `CLOUDFLARE_API_TOKEN` | Deploy operator | operator env | Cloudflare dashboard → My Profile → API Tokens → roll, update `.env` |
| `BETTER_AUTH_SECRET` | Deploy operator | operator env → Worker binding | generate new secret, redeploy **all** stages in one window; invalidates sessions |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud project owner | Google Cloud console → Credentials | console → rotate secret → update `.env` → redeploy |
| D1 database IDs | Deploy operator | Cloudflare dashboard / alchemy state | n/a (identifiers); never paste into issues |

## Deploy preflight (all releases)

1. **Operator authority** — the named release operator (recorded per release
   below) is the only person who may deploy or restore. If you are not that
   operator, stop.
2. **Cloudflare auth** — from `packages/infra`: `pnpm alchemy profile show`
   prints the active provider profile (or use a valid `CLOUDFLARE_API_TOKEN`
   in `.env`). NO-GO if unauthenticated.
3. **Zone readiness** — the domain's DNS zone exists in the same Cloudflare
   account (Alchemy infers the zone from `api.<domain>` / `app.<domain>` and
   provisions DNS records and certificates; a zone hosted elsewhere is a
   NO-GO until moved or delegated).
4. **Google OAuth console** — redirect URIs registered for the exact
   production topology: `https://api.<domain>/api/auth/callback/google`
   (plus any staging origin used for live sign-in tests).
5. **Secrets present** — every name in the inventory has a value in the
   operator env; no secret has ever been committed (search the repo if
   unsure).
6. **Staging exists** — the staging stage has been provisioned (below) and
   the pending D1 migration was rehearsed there (Phase 2 gate).
7. **Green local gates** — on the release commit: `pnpm test`,
   `pnpm check-types`, `pnpm exec biome check .`, `pnpm build`.

## Provision staging (one time, and after schema drift)

The staging stage owns its own isolated D1 database — required before any
migration/recovery rehearsal.

```bash
cd packages/infra
cp .env.example .env         # fill non-secret values; secrets per inventory
# First bootstrap only: deploy once to learn the generated web URL, then set
# CORS_ORIGIN in .env to that URL and deploy again (two-step, one time).
pnpm alchemy deploy --stage staging
```

Record the staging D1 name/ID in the release evidence (ID itself stays out of
GitHub — record only "staging D1 exists, rehearsal OK"). Destroy with
`pnpm alchemy destroy --stage staging` — this never touches `prod`.

## Deploy (production)

```bash
cd packages/infra
# .env: APP_DOMAIN=<domain>, secrets per inventory, CORS_ORIGIN unset (derived)
pnpm alchemy deploy --stage prod
```

Alchemy applies D1 migrations as part of the deploy. Migrations are
**forward-only**: never edit, reorder, or delete an applied migration file;
a bad migration is repaired by a new forward migration, rehearsed on staging
first.

## Post-deploy smoke (Chrome and Safari)

Run in a private/incognito window, once in Chrome and once in Safari, from
the production `https://app.<domain>`:

1. Sign in with the dedicated Google UAT account → lands back on the app
   (callback consumed at `/api/auth/callback/google`).
2. Session survives a hard reload and a sign-out/sign-in round trip.
3. A request with a wrong `Origin` is rejected (`403`/CORS failure), and
   direct navigation to a wrong origin does not leak the workspace.

Any browser-only auth failure is a **NO-GO**: reconcile domain/CORS/cookie
configuration and rerun the smoke. Never weaken CORS or cookie attributes to
make the smoke pass.

## Rollback code

Code rollback = redeploy the last known-good commit. Data is **not** rolled
back by editing migrations.

```bash
git revert <bad commits>       # or check out the last good release commit
cd packages/infra && pnpm alchemy deploy --stage prod
```

If a migration must be undone, that is a **restore**, not a rollback: stop,
rehearse the restore path on staging first (Phase 2 drill), and only the
restore authority below may execute it against production.

## Support triage

1. `GET /` on the API origin — liveness (`OK`).
2. Worker logs: Cloudflare dashboard → Workers → `server` (stage `prod`) →
   Logs, or `npx wrangler tail` with operator credentials.
3. Alchemy state: `cd packages/infra && pnpm alchemy plan --stage prod` shows
   the pending plan/drift; never hand-edit Cloudflare resources that Alchemy
   owns.
4. Escalate to the release operator; record findings in the tracking issue.

## Stop conditions (GO/NO-GO)

GO requires every item green with evidence attached to the tracking issue:

- Topology resolves to the exact table above at runtime (no redirects,
  trailing-slash or origin mismatches).
- Chrome **and** Safari smokes pass (sign-in, callback, session reload).
- The released D1 migration was rehearsed on staging, forward-only.
- No secret value appears in the repo, issues, or evidence.

NO-GO if: topology/cookie instability in either browser, unrehearsed
migration, missing operator authority, or missing zone/DNS readiness.

## Release sign-off

| Release | Commit | Operator (deploy) | Restore authority | Staging rehearsal | Smoke (Chrome/Safari) | GO |
| --- | --- | --- | --- | --- | --- | --- |

Fill one row per release; evidence (sanitized command output, screenshots
without secrets) attaches to the tracking issue on GitHub.
