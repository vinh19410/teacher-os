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
| `CORS_ORIGIN` (server binding) | `https://app.<domain>` | default derived from `APP_DOMAIN`; a disagreeing explicit value fails the run |
| `BETTER_AUTH_URL` (server binding) | `https://api.<domain>` | derived from `APP_DOMAIN`; worker URL otherwise |
| Better Auth base URL | `https://api.<domain>/api/auth` | `authBaseURL()` in `packages/auth/src/topology.ts` (mount path `/api/auth`) |
| Google redirect URI | `https://api.<domain>/api/auth/callback/google` | derived from the Better Auth base URL |
| Session cookies | cross-subdomain, `Domain=.<domain>`, `SameSite=None; Secure; HttpOnly` | `COOKIE_DOMAIN` binding → `crossSubDomainCookieDomain()` in `packages/auth/src/topology.ts` |
| `VITE_SERVER_URL` (web build) | `https://api.<domain>` | derived from `APP_DOMAIN`; server worker URL otherwise |

With `APP_DOMAIN` unset (local dev and staging), the stack keeps its generated
`workers.dev` URLs and per-host cookies. `alchemy dev` defaults `CORS_ORIGIN`
to `http://localhost:8001`; staging deploys require it inline. Derived-value
unit tests live in
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
   the pending D1 migration was rehearsed per the Phase 6 gate: a restaged
   staging ledger showing the repaired migration, or the recorded
   throwaway-D1 proof (a live staging D1 alone is not the acceptance).
7. **Green local gates** — on the release commit: `pnpm test`,
   `pnpm check-types`, `pnpm exec biome check .`, `pnpm build`.

## Provision staging (one time, and after schema drift)

The staging stage owns its own isolated D1 database — required before any
migration/recovery rehearsal.

```bash
cd packages/infra
cp .env.example .env         # fill non-secret values; secrets per inventory
# First bootstrap only: deploy once to learn the generated web URL, then pass
# that URL as an inline CORS_ORIGIN and deploy again (two-step, one time).
# Never persist CORS_ORIGIN into .env — a leftover value shadowed origins in
# the 2026-08-20 NO-GO and deploys now fail hard on that mismatch.
CORS_ORIGIN=http://localhost:8001 pnpm alchemy deploy --stage staging
CORS_ORIGIN=<staging-web-url> pnpm alchemy deploy --stage staging
```

Record the staging D1 name/ID in the release evidence (ID itself stays out of
GitHub — record only "staging D1 exists, rehearsal OK"). Destroy with
`pnpm alchemy destroy --stage staging` — this never touches `prod`.

## Automated production deploy (CI/CD)

`.github/workflows/deploy.yml` deploys stage `prod` automatically on every
push to `main` (i.e. merging `develop` into `main` is the release trigger).
The workflow reproduces this runbook's gates in order: the same quality steps
as CI, then `APP_DOMAIN=<domain> pnpm alchemy deploy --stage prod` (secrets
come from GitHub repo secrets mirroring the inventory above — same names, no
values in Git), then a `/readyz` smoke that must return `200 {"ok":true}`
within ~10 minutes or the run is marked failed. Deploys are serialized
(`cancel-in-progress: false`) so forward-only D1 migrations never race.

Scope of automation: code + bindings + migrations only. The operator gates
this file cannot decide remain manual per the preflight above — rehearsing a
pending migration on staging before it reaches prod, and the Chrome/Safari
browser smoke after a deploy (the workflow's curl smoke proves readiness, not
auth). Manual override/rollback stays available via `workflow_dispatch` and
the "Rollback code" procedure; rotating any secret means updating both the
operator `.env` and the GitHub repo secret of the same name.

## Deploy (production)

```bash
cd packages/infra
# Secrets per inventory stay in .env. APP_DOMAIN and CORS_ORIGIN are never
# persisted: APP_DOMAIN is passed inline (read -rs keeps the hostname out of
# shell history) and the derived https://app.<domain> CORS origin wins.
printf "APP_DOMAIN (bare domain, not echoed): " && read -rs APP_DOMAIN && echo
env "APP_DOMAIN=$APP_DOMAIN" pnpm alchemy deploy --stage prod
```

Alchemy applies D1 migrations as part of the deploy. Migrations are
**forward-only**: never edit, reorder, or delete an applied migration file;
a bad migration is repaired by a new forward migration, rehearsed on staging
first.

## Post-deploy smoke (Chrome and Safari)

Readiness first (no browser needed):

```bash
curl -sS -i https://api.<domain>/readyz
```

- GO: `200` with body `{"ok":true}` and `cache-control: no-store` — the Worker
  can run a schema-dependent D1 catalog query (every required table present).
- NO-GO: `503` with body `{"ok":false}` — D1 binding or schema trouble (e.g. a
  migration did not apply). Check Worker logs and migration state before any
  browser smoke. The body is the same generic JSON for every failure mode and
  never exposes internals; diagnose from Worker logs, not from the response.

`GET /` stays plain liveness ("is the Worker up"); `/readyz` proves "Worker +
D1 schema usable". Record the sanitized curl output (status + body) as release
evidence; whether the real domain appears in that evidence is an operator
decision under the no-secret rule above.

Then run in a private/incognito window, once in Chrome and once in Safari,
from the production `https://app.<domain>`:

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
cd packages/infra
printf "APP_DOMAIN (bare domain, not echoed): " && read -rs APP_DOMAIN && echo
env "APP_DOMAIN=$APP_DOMAIN" pnpm alchemy deploy --stage prod
```

If a migration must be undone, that is a **restore**, not a rollback: stop,
rehearse the restore path on staging first (Phase 2 drill), and only the
restore authority below may execute it against production.

## D1 ledger, migration 0006, and recovery drill

Inspect the live database, never `_journal.json` alone. `wrangler d1 list`
`num_tables` can report 0 while tables exist — query `d1_migrations` instead.
Every `wrangler d1` command in this section requires `--remote` and a database
name that contains `staging` (or a disposable scratch name used only for the
populated upgrade). Abort if the name contains `prod` or does not match.

```bash
# Ledger (counts / schema only — never SELECT token or comment text)
wrangler d1 execute <staging-name> --remote --command \
  "SELECT name FROM d1_migrations ORDER BY name;"
wrangler d1 execute <staging-name> --remote --command \
  "PRAGMA table_info(comment_bank);"
wrangler d1 execute <staging-name> --remote --command \
  "SELECT COUNT(*) AS n FROM comment_bank;"
```

**0006 repair (ledger 2026-08-20):** staging had already applied
`0006_pink_ender_wiggin.sql` on empty tables; no production D1 existed.
The file was rewritten as a table rebuild that copies `operation_id` from
`id` so populated `comment_bank` rows survive. A later `0007` cannot unblock
an earlier unsafe `0006`. The repaired SQL was proven on a throwaway D1
(apply `0000`–`0005`, seed two synthetic comments, apply `0006`, then delete
that D1) and in CI. Staging was **not** destroyed/recreated in this
rehearsal (operator `.env` lacked `BETTER_AUTH_SECRET` / `CORS_ORIGIN`).
The live staging D1 still has the original empty-table apply of this
filename; schema at runtime matches (`operation_id` NOT NULL + unique
index). Do not `alchemy deploy --stage staging` until staging is destroyed
and recreated with the repaired file, or Alchemy will refresh its SQL hash
while skipping the already-named migration. First production D1 (none yet)
will apply the git table-rebuild.

**Populated upgrade:** apply `0000`–`0005` on a throwaway D1 (not the live
post-`0006` staging), insert a synthetic `organization` plus ≥2 `comment_bank`
rows with text `fixture-*` (never copy production/pilot data), apply `0006`,
then `PRAGMA foreign_key_check` and `SELECT id, operation_id` (ids only).
Destroy the throwaway D1 when done.

**Empty upgrade (still pending on live staging):** when operator secrets are
present, `cd packages/infra && pnpm alchemy destroy --stage staging` then
`pnpm alchemy deploy --stage staging`. Confirm `d1_migrations` includes
`0006_pink_ender_wiggin.sql` and `comment_bank` has `operation_id`. Until
that restage, treat empty-path proof as CI + the original empty staging
apply, not as “staging already rebuilt.”

**Quiesce (approved maintenance procedure):** do not POST to the staging
Worker, do not `alchemy deploy`, optionally disable/unbind the staging
Worker. Confirm `COUNT(*)` stable twice. There is no in-app maintenance flag.

**Restore (Time Travel, in-place, no clone):**

```bash
wrangler d1 time-travel info <staging-name>
# Window is 7 days (Workers Free) or 30 days (Paid). If this fails, stop.
wrangler d1 time-travel restore <staging-name> --bookmark=<from-info>
```

Do **not** `alchemy deploy` between restore and read-only verify — deploy
re-applies migrations and undoes the restore. After SQL verify:
`DELETE FROM session;` (never `SELECT` token columns). Sign in again. Do not
hand-insert `membership`. Kernel write proof is `POST /api/comment-bank` with
`Origin` equal to the staging CORS origin; never wrangler `INSERT` as the
write proof; never weaken CORS.

**RPO / RTO (observed 2026-08-20 rehearsal):** writes after the bookmark are
**lost** and must be re-entered by the teacher. There is no mutation log.
Time Travel restore of the staging D1 after a synthetic marker insert returned
counts to the pre-marker state in **5 seconds**. `time-travel info` succeeded
(Paid/Free window not exhausted). Bookmarks are not durable evidence — export
counts/`PRAGMA` before restore.

**Kernel write proof:** new session on the staging web origin; replay the same
`operationId` UUID (idempotent). Evidence = HTTP status + `COUNT(*)` only.
2026-08-20 staging: `GET /` → 200 `OK`; `GET /api/kernel` without cookie → 401;
`POST /api/comment-bank` with staging web `Origin` → 201 then replay 200;
same POST without `Origin` → 403. Fixture session/comment rows were deleted
after the proof. Do not paste cookies, tokens, or `comment_bank.text`.

## Support triage

1. `GET /` on the API origin — liveness (`OK`): the Worker process is up.
2. `GET /readyz` on the API origin — readiness: `200 {"ok":true}` proves a
   schema-dependent D1 query works; `503 {"ok":false}` points at the D1
   binding or a missing/partial migration. The response deliberately carries
   no detail — use Worker logs for diagnosis.
3. Worker logs: Cloudflare dashboard → Workers → `server` (stage `prod`) →
   Logs, or `npx wrangler tail` with operator credentials.
4. Alchemy state: `cd packages/infra && pnpm alchemy plan --stage prod` shows
   the pending plan/drift; never hand-edit Cloudflare resources that Alchemy
   owns.
5. Escalate to the release operator; record findings in the tracking issue.

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

**2026-08-20 — NO-GO before deploy (no sign-off row: no release occurred).**
Phase 6 pre-deploy gates ran and the topology gate failed: `APP_DOMAIN` unset in
every env file (a leftover dev `CORS_ORIGIN` in `apps/server/.env` would also
override the derived default with only a warning, no hard failure), and no
production redirect URI was registrable until the domain is chosen.
Additionally, the Google UAT account and the Safari runner were not supplied
(separate blockers, not topology). No deploy command was run. Blocker inputs
tracked in issue #41; evidence in
`plans/260819-2034-production-readiness/reports/uat-evidence-phase-06.md`.
