# Production release and support runbook

Operator procedure for deploying, verifying, rolling back, and supporting
Teacher OS on Cloudflare Workers + D1. This runbook contains **no secret
values** — only secret names, owners, and rotation paths.

## Topology — single source of truth

The production topology is `teacheros.io.vn` (+ `www.`, landing), `app.<domain>` (web) + `api.<domain>` (API). It is
**encoded in runtime configuration, not in this document**: the deploy-time
variable `APP_DOMAIN` (bare lowercase domain) derives every URL below via
`packages/infra/src/topology.ts`, wired in `packages/infra/alchemy.run.ts`.
Changing topology means changing `APP_DOMAIN` in the operator's deploy
environment — never editing this runbook.

| Setting | Value (APP_DOMAIN set) | Where it comes from |
| --- | --- | --- |
| Landing origin | `https://<domain>` (+ `https://www.<domain>`) | Website.StaticSite `domain: { name: landingHost, aliases: landingAliases }` |
| Web origin | `https://app.<domain>` | Website.Vite `domain: { name: appHost, aliases: appAliases }` (no aliases) |
| API origin | `https://api.<domain>` | Worker `domain: api.<APP_DOMAIN>` |
| `CORS_ORIGIN` (server binding) | `https://app.<domain>` | default derived from `APP_DOMAIN`; a disagreeing explicit value fails the run |
| `BETTER_AUTH_URL` (server binding) | `https://api.<domain>` | derived from `APP_DOMAIN`; worker URL otherwise |
| Better Auth base URL | `https://api.<domain>/api/auth` | `authBaseURL()` in `packages/auth/src/topology.ts` (mount path `/api/auth`) |
| Google redirect URI | `https://api.<domain>/api/auth/callback/google` | derived from the Better Auth base URL |
| Session cookies | cross-subdomain, `Domain=.<domain>`, `SameSite=None; Secure; HttpOnly` | `COOKIE_DOMAIN` binding → `crossSubDomainCookieDomain()` in `packages/auth/src/topology.ts` |
| Auth cookie namespace | default `better-auth` on prod; `teacheros-staging` on any other member of the prod cookie zone (staging) | `BETTER_AUTH_COOKIE_PREFIX` binding → `resolveDomainTopology().authCookiePrefix` in `packages/infra/src/topology.ts`, validated by `authCookiePrefix()` in `packages/auth/src/topology.ts` |
| `VITE_SERVER_URL` (web build) | `https://api.<domain>` | derived from `APP_DOMAIN`; server worker URL otherwise |

First deploy with this topology: custom domain apex (`teacheros.io.vn`) and `www` detach from the web Worker and attach to the landing Worker (`apps/landing`) in the same apply. Staging is deployed first (`staging.teacheros.io.vn`); certificates already exist in the Cloudflare zone.
With `APP_DOMAIN` unset (local dev only), the stack keeps its generated
`workers.dev` URLs and per-host cookies, and `alchemy dev` defaults
`CORS_ORIGIN` to `http://localhost:8001`. Staging resolves the same table with
`APP_DOMAIN=staging.teacheros.io.vn`: `app.staging.teacheros.io.vn` (web) +
`api.staging.teacheros.io.vn` (API), session cookies scoped to
`.staging.teacheros.io.vn` (see "Provision staging"). Derived-value
unit tests live in
`packages/infra/src/topology.test.ts` and `packages/auth/src/topology.test.ts`.

## Environments and stages

Alchemy stages isolate state and physical resource names; resources of
different stages never overlap.

| Stage | Purpose | APP_DOMAIN | Data |
| --- | --- | --- | --- |
| `dev_<user>` (default) | Local development | unset | disposable |
| `staging` | Migration/recovery rehearsal, pre-release checks, QC | `staging.teacheros.io.vn` | **rehearsal only** — never production data |
| `prod` | Pilot/production | set to the real domain | real pilot data |

**Never rehearse against the production or pilot D1 database.** The staging
database is the only rehearsal target (see "Provision staging").

Staging is the QC browser target: `https://staging.teacheros.io.vn` (landing), `https://app.staging.teacheros.io.vn` (web),
and `https://api.staging.teacheros.io.vn` (API). It lives in the same
Cloudflare zone but in its own Alchemy stage, with its own D1 database, its
own `BETTER_AUTH_SECRET` value, and cookies scoped to
`.staging.teacheros.io.vn`. Because staging is a subdomain of the prod apex,
browsers also send prod's parent-domain session cookie
(`__Secure-better-auth.session_token`, `Domain=.teacheros.io.vn`) to the
staging API; staging therefore emits its session under the namespaced
`teacheros-staging` prefix (topology table above), so the foreign prod-zone
cookie can never shadow a staging session (issue #125). Nothing on staging
can read or write production.

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
| `BETTER_AUTH_SECRET` | Deploy operator | operator env → Worker binding | per-stage values (staging ≠ prod): generate, update that stage's `.env`, redeploy that stage; invalidates its sessions |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud project owner | Google Cloud console → Credentials | console → rotate secret → update `.env` → redeploy. One OAuth client may serve both stages by registering each stage's callback URI (preflight 4) |
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
   production topology: `https://api.<domain>/api/auth/callback/google`,
   plus the staging callback
   `https://api.staging.teacheros.io.vn/api/auth/callback/google`
   (sign-in on staging fails without it; the `/readyz` smoke works
   regardless).
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
migration/recovery rehearsal — and serves QC on its own subdomain:
`https://app.staging.teacheros.io.vn` (web) +
`https://api.staging.teacheros.io.vn` (API). After first provisioning (or
destroy/recreate), the automated staging deploy (see "Automated staging
deploy (CI/CD)" below) keeps the stage current on every push to `develop`;
run this procedure manually only for first provisioning or
destroy/recreate.

```bash
cd packages/infra
cp .env.example .env         # fill non-secret values; secrets per inventory
# Staging holds its own BETTER_AUTH_SECRET value, distinct from prod (cookie
# isolation defense in depth). APP_DOMAIN is passed inline, never persisted;
# a stray CORS_ORIGIN fails the run instead of shadowing the derived
# https://app.staging.teacheros.io.vn origin.
# A workers.dev-era staging stage must be destroyed first (rehearsal-only
# data; the recreation also completes the pending 0006 empty-upgrade restage
# below).
pnpm alchemy destroy --stage staging    # skip if staging does not exist yet
env APP_DOMAIN=staging.teacheros.io.vn pnpm alchemy deploy --stage staging
```

The deploy registers `app.staging.teacheros.io.vn` and
`api.staging.teacheros.io.vn` as Workers custom domains on the existing
`teacheros.io.vn` zone — DNS records and certificates are provisioned by
Alchemy; never hand-edit them (first cert issuance can take a few minutes).
First sign-in additionally requires the staging callback URI in the Google
console (preflight 4). Verify with
`curl -sS -i https://api.staging.teacheros.io.vn/readyz` → `200 {"ok":true}`.

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
browser smoke after a deploy (the prod workflow's curl smoke proves
readiness, not auth). Manual override/rollback stays available via
`workflow_dispatch` and
the "Rollback code" procedure; rotating any secret means updating both the
operator `.env` and the GitHub repo secret of the same name.

## Automated staging deploy (CI/CD)

`.github/workflows/deploy-staging.yml` is the sibling workflow for stage
`staging`. Since 2026-09-22 staging auto-deploy is disabled: the `push`
trigger on `develop` was removed, so merging code no longer deploys staging.
The workflow runs only on manual `workflow_dispatch` (e.g. to rehearse a
pending migration on staging before promotion) and runs the
same quality gates as CI, then
`APP_DOMAIN=staging.teacheros.io.vn pnpm alchemy deploy --stage staging --yes`
with credentials from the GitHub `staging` environment (same secret names as
production), serialized like prod (`cancel-in-progress: false`) so
forward-only migrations never race. Its post-deploy smoke is broader than
prod's because staging is the QC target: `/readyz` polling, an auth
round-trip (throwaway sign-up → `get-session` with a cookie jar poisoned by a
prod-shaped parent-domain session cookie — the exact shape that broke QC
sign-in before issue #125), and a check that the removed PWA service
worker's stubs (`/sw.js`, `/registerSW.js`) are served as JavaScript with
network-first cache headers. Throwaway smoke accounts are accepted junk rows
in the staging D1; prod deliberately gets no signup smoke. The manual
"Provision staging" procedure below remains the path for first provisioning
or destroy/recreate.

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
curl -sS -i https://api.<domain>/readyz                  # production
curl -sS -i https://api.staging.teacheros.io.vn/readyz   # staging (QC)
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

**Empty upgrade (still pending on live staging):** "Provision staging" above
now performs exactly this — destroy the workers.dev-era stage, then redeploy
with `APP_DOMAIN=staging.teacheros.io.vn` once operator secrets are present.
Confirm `d1_migrations` includes
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
| prod UAT r2 (2026-08-30) | merge of `659e837` (develop) | AI agent (directed by Vinh Tran) | Vinh Tran | recorded throwaway-D1 proof of repaired `0006` (ledger 2026-08-20) | pass — Chrome incognito r2 (2026-08-30) + Safari private r2.1 (2026-08-31), 6/6 steps each | **GO 2026-08-31** (r2 + r2.1; Google OAuth leg by operator-approved deviation — email-auth evidence, Google round-trip to be retired at pilot onboarding) |

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

**2026-08-31 — GO (release `235275c`).** r2 (2026-08-30) passed every
technical gate but held NO-GO on two operator-input gaps. r2.1 closed them:
Safari private leg ran 6/6 pass via agent runner (operator granted
Accessibility), and the Google OAuth leg was resolved by operator-approved
deviation (email-auth incognito evidence + production authorize precheck
without `redirect_uri_mismatch`; the real Google round-trip is to be verified
at pilot onboarding per M4 SLA). Evidence:
`plans/260819-2034-production-readiness/reports/uat-evidence-phase-06-r2.1-2026-08-31.md`.

## Release sequence: occurrence identity (issue #98) — A/B/C deployment shape

Alchemy applies D1 migrations as part of every deploy (forward-only), so the
safety gates below are enforced by SEPARATING PRs, not by feature flags. Do not
compress the sequence into one deploy.

### Step A — code + column migration (one PR, then deploy)

Contents: `lesson.date` column + `lesson_class_date_idx` normal index
(migration 0010), date-attaching generator, occurrence endpoints, web read
path v2 and modal. NO unique-index migration in this PR.

After `pnpm alchemy deploy --stage prod`:

- Old classes have `date IS NULL` ⇒ render the frozen legacy table; the new
  endpoints no-op on them (`{updated: 0}`) because a NULL date never matches.
- NEW classes are born fully dated ⇒ live on v2 immediately. This is safe-on-
  by-default; there is no env toggle.

### Step B — backfill + verification loop (operator)

```
wrangler d1 execute teacher-os-db --remote --json \
  "SELECT l.id,l.class_id,l.enrollment_id,l.day,l.time,l.created_at AS created_at_ms,l.rowid AS seq FROM lesson l;" \
  > dump-undated.json
wrangler d1 execute teacher-os-db --remote --json \
  "SELECT id,schedule,start_date,sessions_total FROM class" > dump-classes.json
npx -y tsx apps/server/scripts/backfill-date.ts dump-classes.json dump-undated.json \
  > backfill.sql        # planned by @teacher-os/api/skeleton buildBackfillPlan
wrangler d1 execute teacher-os-db --remote --file=backfill.sql
```

The LESSON dump must be the WHOLE table — no `WHERE date IS NULL` filter.
conforms() derives count-vectors from the rows it receives; feeding it only the
undated remainder would misread post-A classes and make this delta loop diverge
(review F3). Emitted SQL stays safe on a superset because every UPDATE guards
`AND date IS NULL`.

`backfill-date.ts` prints a per-class conformance summary. ARCHIVE the list of
NULL-staying classes with their fail reason (`schedule-unparseable`,
`start-date-invalid`, `slot-divergence`, `count-vector-mismatch`) to the issue —
that is the permanent legacy blast radius. A class summarised `STAMPED` with zero
UPDATE lines is either empty or fully dated already (post-Step-A traffic); both are
expected noise, not regressions.

Delta re-dump loop: traffic during the dump→apply window (new enrollments)
produces fresh NULL rows inside otherwise-conforming classes. Re-run from the
dump step while

```sql
SELECT class_id, COUNT(*) FROM lesson WHERE date IS NULL GROUP BY class_id;
-- expectation: only archived divergent classes remain
SELECT enrollment_id, date, COUNT(*) c FROM lesson
WHERE date IS NOT NULL AND created_at <= :deploy_ts GROUP BY 1,2 HAVING c>1;
-- dup detector, scoped to PRE-deploy classes (deploy_ts = Step A completion)
SELECT class_id, date, COUNT(DISTINCT enrollment_id) sids,
       (SELECT COUNT(*) FROM enrollment e WHERE e.class_id=lesson.class_id) enrolled
FROM lesson WHERE date IS NOT NULL GROUP BY 1,2;
-- misalignment detector (kongming D5): flag buckets where sids < enrolled
```

passes with those expectations only.

Heal SQL for duplicate `(enrollment_id, date)` (keep one settled row if exactly
one exists in the group; otherwise keep the lowest rowid):

```sql
DELETE FROM lesson WHERE rowid IN (
  SELECT b.rowid FROM lesson b
  JOIN (
    SELECT class_id, enrollment_id, date,
           MIN(CASE WHEN status <> 'upcoming' THEN 0 ELSE 1 END) AS priority,
           MIN(rowid) AS keep_rowid, COUNT(*) c
    FROM lesson WHERE date IS NOT NULL
    GROUP BY 1,2,3 HAVING c>1
  ) d ON d.class_id=b.class_id AND d.enrollment_id=b.enrollment_id AND d.date=b.date
  WHERE b.rowid <> d.keep_rowid
    AND NOT (b.status<>'upcoming' AND d.priority=0);
);
```
Review rows with `status <> 'upcoming'` manually before deleting them — a group
holding TWO differently-settled rows must be reconciled by hand, not bulk-deleted.

Mid-moveDate misalignment (enrollment joined between a generator skeleton and a
moved occurrence) is a DECLARED limitation (#98 Known Limitations): heal is DB-only,
detected by the third query above.

### Step C — unique index PR (only after Step B evidence PASS)

One-line migration adding the unique index `(class_id, enrollment_id, date)`
via drizzle-kit generate in its own PR. Checklist before merge:

1. Step B verification output archived on the issue (all three detectors).
2. Re-run the dup detector once more pre-deploy — post-A traffic may have
   produced duplicates that need the heal SQL above FIRST.

After this deploy, concurrent moveDate writes lose cleanly with
`409 {reason:"date-occupied"}` instead of racing silently.

### Rollback procedure (issue #98 N10)

Worker rollback alone is display-safe (any NULL ⇒ frozen legacy table) but
re-introduces an OLD generator that writes NULL dates again. System stability
therefore requires, after the emergency rollback settles:

1. redeploy the NEW worker image (Step A artifact), then
2. re-run the Step B delta loop until verification passes.

The `date` column itself is forward-only; no data rollback path exists or is needed.

### Rollback procedure: Enrollment invited state (issue #253)

Worker rollback retains migration 0022 (`enrollment.status` column với default `'active'`).
- Các bản ghi `enrollment` ở trạng thái `'invited'` sống qua rollback worker vô hại về mặt schema D1 (cột status giữ nguyên).
- Tuy nhiên, worker code cũ coi mọi enrollment là đang học (không nhận diện trạng thái `invited` và kỳ vọng có `session_package`).
- Nếu cần hoàn tác dữ liệu thủ công về tương thích hoàn toàn với code cũ sau rollback khẩn cấp:

```bash
# 1. Kiểm tra số lượng enrollment invited
npx wrangler d1 execute teacher-os-db --command "SELECT id, class_id, student_id FROM enrollment WHERE status = 'invited';"

# 2. Cập nhật các bản ghi invited thành active nếu cần cho code cũ hoạt động:
npx wrangler d1 execute teacher-os-db --command "UPDATE enrollment SET status = 'active' WHERE status = 'invited';"
```

Cột `enrollment.status` là forward-only; không xóa cột hay sửa file migration.
