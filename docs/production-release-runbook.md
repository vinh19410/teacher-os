# Production release and support runbook

Operator procedure for deploying, verifying, rolling back, and supporting
Teacher OS on Cloudflare Workers + D1. This runbook contains **no secret
values** — only secret names, owners, and rotation paths.

## Topology — single source of truth

The production topology is `teacheros.io.vn` (+ `www.`, landing), `app.<domain>` (web), `student.<domain>` (student portal) + `api.<domain>` (API). It is
**encoded in runtime configuration, not in this document**: the deploy-time
variable `APP_DOMAIN` (bare lowercase domain) derives every URL below via
`packages/infra/src/topology.ts`, wired in `packages/infra/alchemy.run.ts`.
Changing topology means changing `APP_DOMAIN` in the operator's deploy
environment — never editing this runbook.

| Setting | Value (APP_DOMAIN set) | Where it comes from |
| --- | --- | --- |
| Landing origin | `https://<domain>` (+ `https://www.<domain>`) | Website.StaticSite `domain: { name: landingHost, aliases: landingAliases }` |
| Web origin | `https://app.<domain>` | Website.Vite `domain: { name: appHost, aliases: appAliases }` (no aliases) |
| Student portal origin | `https://student.<domain>` | Website.Vite (student) `domain: studentHost` from `packages/infra/src/topology.ts` |
| Admin console origin | `https://admin.<domain>` | Website.Vite (admin) `domain: adminHost` from `packages/infra/src/topology.ts` (plan #413) |
| API origin | `https://api.<domain>` | Worker `domain: api.<APP_DOMAIN>` |
| `CORS_ORIGIN` (server binding) | `https://app.<domain>` | default derived from `APP_DOMAIN`; a disagreeing explicit value fails the run |
| `STUDENT_ORIGINS` (server binding) | `https://student.<domain>` | default derived from `APP_DOMAIN`; an explicit value missing the portal origin fails the run (drives portal sign-up role classification) |
| `ADMIN_ORIGINS` (server binding) | `https://admin.<domain>` | default derived from `APP_DOMAIN` (`alchemy.run.ts`); an explicit value missing the admin origin fails the run (drives admin CSRF + sign-up classification, plan #413) |
| `ADMIN_EMAILS` (server binding) | comma-separated allowlist, **no default — empty means nobody is admin** | operator-set secret-like binding; matched lowercase by `requireAdmin` on every request and by the admin-origin sign-up hook (`ADMIN_SIGNUP_FORBIDDEN`) |
| `TEACHER_EMAILS` (server binding) | comma-separated allowlist, **required on production** (deploy fails if empty); empty elsewhere means unrestricted | operator-set binding (`vars.TEACHER_EMAILS` on GitHub Environment `production`); matched lowercase on every request in `bootstrapMiddleware` (`ACCOUNT_TEACHER_NOT_ALLOWED`) and at teacher sign-up (`TEACHER_SIGNUP_FORBIDDEN`, #513) |
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

Staging is the QC browser target: `https://staging.teacheros.io.vn` (landing), `https://app.staging.teacheros.io.vn` (web), `https://student.staging.teacheros.io.vn` (student portal),
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
| `SEPAY_BANKHUB_CLIENT_ID` / `SEPAY_BANKHUB_CLIENT_SECRET` | SePay Bank Hub merchant owner (operator requests from SePay) | operator env → Worker binding (#320) | request new pair from SePay, update `.env`, redeploy; feature degrades to 503 BANKHUB_DISABLED while blank |
| `SEPAY_BANKHUB_IPN_API_KEY` | SePay (issued per merchant) | operator env → Worker binding | request reissue from SePay; IPN rejects with 401 while mismatched — reconcile button covers the gap |
| `SEPAY_BANKHUB_WEBHOOK_SECRET` | Operator-generated, registered via `apps/server/scripts/bankhub-setup.ts` | operator env → Worker binding | generate new, re-run bankhub-setup, update `.env`, redeploy |
| `SEPAY_BANKHUB_BASE_URL` | Deploy operator | operator env → Worker binding | n/a (endpoint); production MUST set `https://bankhub-api.sepay.vn` — blank falls back to the sandbox host and the feature silently no-ops |
| `GITHUB_WEBHOOK_SECRET` | Operator-generated (`openssl rand -hex 32`) | GitHub environment secret `GH_WEBHOOK_SECRET` → bước deploy CI → Worker binding `GITHUB_WEBHOOK_SECRET` (#421) | sinh mới → cập nhật secret trên trang webhook GitHub và GitHub environment → redeploy; trong lúc lệch, delivery trả 401 và có thể "Redeliver" từ UI. **Cảnh báo:** `withDefault("")` nghĩa là deploy prod/staging NGOÀI CI mà không export `GITHUB_WEBHOOK_SECRET` sẽ ghi đè secret đang chạy về rỗng ⇒ endpoint 503 — deploy tay phải export biến từ `.env` (hoặc chờ CI) |

## Lead intake — form đăng ký msmy.io.vn (#506)

Form đăng ký học trên `msmy.io.vn` POST thẳng vào `POST /public/leads` của API
(route công khai, không đăng nhập; CORS + chống spam riêng trong
`apps/server/src/routes/public-leads.ts`). Cấu hình qua 2 binding:

| Binding | Bắt buộc | Giá trị |
| --- | --- | --- |
| `LEAD_ORG_ID` | Có (prod) — bỏ trống ⇒ endpoint trả 503 `LEAD_INTAKE_DISABLED` (fail-closed, tắt intake bằng cách xoá binding) | `organization.id` của cô Mỹ — query D1: `SELECT id FROM organization;` (đối chiếu email giáo viên qua `membership`) |
| `LEAD_ORIGINS` | Có khi deploy không topology (workers.dev); topology tự mặc định `https://msmy.io.vn,https://www.msmy.io.vn`, dev `http://localhost:8005` | Origin trang profile, phân tách dấu phẩy; sai/ thiếu origin ⇒ POST bị 403 `LEAD_ORIGIN_FORBIDDEN` |

Vận hành:

- **Backup trước migration `lead` (0057):** `wrangler d1 export <db> --remote
  --output backup-<date>.sql` rồi mới apply migration (rule repo cho mọi
  migration D1 có bảng mới).
- **Chống spam:** honeypot + `elapsedMs` < 3s ⇒ 201 giả không ghi; tần suất
  theo IP (HMAC `BETTER_AUTH_SECRET`, ngưỡng 3 lead/10 phút); trần 100 lead
  mới/ngày/org; SĐT gửi lại trong 24 giờ cập nhật lead cũ. Ngưỡng là hằng số
  export trong `public-leads.ts` — chỉnh qua code, không phải env.
- **Build & deploy `apps/profile`:** `LEAD_API_URL=https://api.teacheros.io.vn pnpm --filter profile build` (script `build.mjs` kiểm tra `apps/profile/public/kiem-tra-dau-vao/questions.json` phải có `"status": "approved"` rồi mới copy `public/` sang `dist/` và ghi URL API vào `<meta name="lead-api">` trong `dist/index.html`).
  - **Cổng duyệt nội dung bài kiểm tra đầu vào (#511 — D10/D10b):** `build.mjs` phân biệt hai kênh phát hành (`resolveBuildChannel`): ở kênh `production` (mặc định khi chạy local `pnpm --filter profile build`, PR/push vào `main`, hoặc `APP_DOMAIN=teacheros.io.vn`), `build.mjs` chỉ chấp nhận `"status": "approved"` và dừng ngay với lỗi rõ ràng nếu `status` là `"draft"` hoặc `"beta"`. Ở kênh `beta` (CI của PR nhắm vào `develop`, push lên `develop`, hoặc `PROFILE_CHANNEL=beta`), `build.mjs` chấp nhận `"status": "beta"` hoặc `"approved"` (vẫn chặn `"draft"`), cho phép tích hợp và kiểm thử trên nhánh `develop` trong khi vẫn chặn tuyệt đối việc promote lên `main` hoặc build phát hành `msmy.io.vn` trước khi cô Mỹ duyệt đề, 5 file audio MP3 và bảng ngưỡng quy đổi CEFR (xem `plans/reports/placement-test-content-review.md`). Sau khi cô Mỹ xác nhận, đổi `"status"` sang `"approved"` trong `questions.json`. Khi cập nhật bộ câu hỏi hoặc thay file audio sau phát hành, tăng `"version"` trong `questions.json` (ví dụ `1` → `2`) để trình duyệt học viên tự động xóa tiến độ/lượt nghe lưu nháp cũ (`msmy_placement_attempt_v1`).
  - **Smoke test trên host thật (`https://msmy.io.vn` và `https://www.msmy.io.vn`) sau deploy:** (1) `GET /kiem-tra-dau-vao/` trả `200` HTML; (2) `GET /kiem-tra-dau-vao/audio/clip-1.mp3` trả đúng MIME `audio/mpeg` và hỗ trợ `Range: bytes=0-99` (`206 Partial Content`); (3) nghe thử audio trên Safari iOS; (4) làm bài → bấm đăng ký → gửi form tạo lead có `placement` trên `/leads`.
- **Tùy chọn — WAF rate limiting** trên zone teacheros.io.vn cho path
  `/public/leads` khi có spam thật (lớp 3 của plan; Turnstile chỉ bật khi cần).
- Email báo lead mới gửi mọi thành viên org qua mailer chung (D13); mailer
  lỗi không ảnh hưởng response — check log `[leads]` khi nghi ngờ.

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
deploy (CI/CD)" below) keeps the stage current on every push to the
`staging` branch;
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
as CI and the full Playwright E2E suite (the reusable `e2e.yml`, credential-free)
must both pass — a red E2E blocks the release — then `APP_DOMAIN=<domain> pnpm alchemy deploy --stage prod` (secrets
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
`staging`. Since 2026-09-22 merging into `develop` no longer deploys staging.
Instead, staging deploys on every push to the dedicated `staging` branch —
the QA environment. To hand a build to QA, fast-forward `staging` to the
`develop` commit under test (`git push origin develop:staging`); QA then
checks `https://app.staging.teacheros.io.vn`. The GitHub environment
`staging` allows deployments from the `staging` branch (and `develop` for
manual runs). Manual `workflow_dispatch` remains for migration rehearsal.
Either way the workflow runs the
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
| prod release v0.0.7 (2026-09-28) | merge `e088abb` (PR #277, develop) | automated `deploy.yml` on merge to `main`; promotion run by AI agent (directed by Vinh Tran) | Vinh Tran | not recorded — migrations 0026–0028 are additive-only (rollback notes below) | automated `/readyz` smoke pass (Deploy Production run on `e088abb`, 2026-09-28); Chrome/Safari browser smoke **not recorded** | shipped without a recorded GO — flagged as outstanding in the 2026-09-28 ship journal |
| prod release v0.0.10 (promotion prep) | pending — merge of `develop` at promotion time | pending | Vinh Tran | pending — migrations 0029–0030 additive-only; rehearse on staging per preflight 6 | pending | pending |

Fill one row per release; evidence (sanitized command output, screenshots
without secrets) attaches to the tracking issue on GitHub. One row per **prod
release** (merge to `main`), not per version bump on `develop`: the 0.0.8–0.0.9
bumps never promoted, so no row exists for them and the next release is v0.0.10.

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
  "SELECT l.id,l.class_id,l.enrollment_id,l.day,l.time,l.created_at AS created_at_ms,l.rowid AS seq,l.status FROM lesson l;" \
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

The dump MUST carry `l.status`: inside each enrollment+weekday bucket the planner
stamps completed lessons on the earliest skeleton dates, then cancelled, then the
rest (the order the legacy table renders), and the CLI refuses a dump without
`status`. Every UPDATE also guards `AND status = '<status in the dump>'`, so a
check-in landing between dump and apply leaves that row NULL for the next delta
loop instead of stamping it against a stale ordinal; if that re-plan collides
with an already-stamped date, the duplicate detector below catches it. The
ordering is lossy by nature (it cannot recover which week a teacher really
settled once a mid-course session was cancelled) and the CLI prints
`FUTURE_COMPLETED …` on stderr for any completed lesson it would stamp after
today — resolve those by hand before applying.

Backfill only stamps `date IS NULL` rows. A prior run of the older, status-blind
planner may have stamped completed rows on wrong dates. Detect them with the two
queries below, scoped to rows born BEFORE Step A (`:deploy_ts`, same scoping as
the duplicate detector): a class born dated after Step A can legitimately have a
later session checked in while an earlier one is still open, and before the
future-session guard shipped a teacher could check in a future date. Any row
returned is an operator review item — either fix it by hand or explain on the
issue why it is legitimate; this procedure never auto-corrects prod:

```sql
-- completed lessons stamped in the future
SELECT class_id, enrollment_id, date FROM lesson
WHERE status = 'completed' AND date > :today_vn AND created_at <= :deploy_ts;
-- completed lessons dated AFTER a not-completed lesson of the same enrollment+weekday
SELECT a.class_id, a.enrollment_id, a.day, a.date FROM lesson a
WHERE a.status = 'completed' AND a.date IS NOT NULL AND a.created_at <= :deploy_ts
  AND EXISTS (
    SELECT 1 FROM lesson b
    WHERE b.enrollment_id = a.enrollment_id AND b.day = a.day
      AND b.status <> 'completed' AND b.date IS NOT NULL AND b.date < a.date);
```

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

1. Step B verification output archived on the issue (all three detectors plus the two settled-order detectors; each returned row fixed or explained).
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

## Email verification (Resend) — issue #259

### Environment variables

| Variable | Purpose | Default / Example | Notes |
| --- | --- | --- | --- |
| `MAILER_IMPL` | Implementation driver (`log` or `resend`) | `log` (dev/test) | Prod **bắt buộc** đặt `resend`. Server boot guard sẽ in log cảnh báo đỏ nếu không phải `resend`. |
| `MAIL_FROM` | Sender display name & email | `TeacherOS <onboarding@resend.dev>` | Prod đặt `TeacherOS <no-reply@<domain>>` (domain đã xác thực trên Resend). |
| `RESEND_API_KEY` | Resend HTTP API token (`re_...`) | empty string | Secret operator — cấu hình qua CI/CD secrets hoặc Alchemy environment, **không commit vào code**. Boot sẽ throw ngay nếu `MAILER_IMPL=resend` mà key rỗng. |

### Production procedure

1. **Cấu hình Domain trên Resend**:
   - Tạo tài khoản hoặc đăng nhập vào [Resend Dashboard](https://resend.com/domains).
   - Thêm domain (ví dụ: `teacheros.io.vn`) và cấu hình các bản ghi DNS (DKIM, SPF, MX) theo hướng dẫn trên Cloudflare DNS.
   - Chờ trạng thái domain chuyển sang `Verified`.
2. **Cấu hình Secret**:
   - Tạo API Key tại Resend Dashboard với quyền `Sending access`.
   - Đặt trên GitHub environment `production` (Settings → Environments → production), **trước khi deploy**. `deploy.yml` đọc đúng environment này và truyền sang Alchemy; đặt ở nơi khác (ví dụ chỉ trên Cloudflare dashboard) sẽ bị ghi đè về `log` ở lần deploy kế tiếp:
     ```bash
     gh secret set RESEND_API_KEY --env production
     gh variable set MAILER_IMPL --env production --body "resend"
     gh variable set MAIL_FROM --env production --body 'TeacherOS <no-reply@teacheros.io.vn>'
     ```
   - `MAIL_FROM` phải đủ cặp `< >`; thiếu `>` thì Resend từ chối địa chỉ người gửi.
   - Staging làm tương tự với `--env staging`; để trống thì worker staging chạy log-only.
3. **Deploy & Kiểm tra**:
   - Deploy server worker.
   - Đăng ký thử 1 tài khoản học viên thật trên student portal (`https://student.<domain>` — portal origin derive từ `APP_DOMAIN`, xem bảng topology trên).
   - Kiểm tra email xác thực được gửi đến hộp thư người nhận (inbox, không vào spam) và URL verify hoạt động chính xác.

### Quota & Monitoring

- **Free tier Resend**: 100 email/ngày, tối đa 3.000 email/tháng.
- **Lưu ý quan trọng**: Quota này **chia sẻ chung** giữa việc gửi email xác thực học viên và bất kỳ email xác thực nào từ tài khoản giáo viên đăng ký trên web app (do dùng chung cấu hình auth của server).
- **Monitoring log**: Theo dõi log Workers qua Cloudflare Dashboard / log stream:
  - Tìm các thông điệp `Failed to send verification email` hoặc `resend send failed: 429` (vượt quota).
  - Khi gặp lỗi 429 hoặc 5xx từ Resend, `ResendMailer` tự động retry đúng 1 lần (tôn trọng header `Retry-After`).

### Chống lạm dụng (Abuse Prevention)

- Better-Auth đã tích hợp sẵn rate limiter rule cho endpoint `/send-verification-email`: tối đa 3 requests / 60 giây theo IP client (`rate-limiter/index.mjs`). Trên Cloudflare Workers, bộ đếm memory này được duy trì per-isolate.
- Endpoint có cơ chế chống rò rỉ danh tính (anti-enumeration): luôn trả về `{ status: true }` và duy trì timing floor tối thiểu 500ms ngay cả khi email không tồn tại hoặc đã được xác thực trước đó.
- Không tự ý cấu hình thêm rate limit tầng D1 trừ khi có bằng chứng tấn công mail-bombing thực tế.

### Sự cố thường gặp & Hướng xử lý

1. **Email rơi vào Spam / Junk**:
   - Kiểm tra lại trạng thái DKIM, SPF trên Resend Dashboard. Đảm bảo bản ghi DMARC đã được cấu hình trên domain.
2. **Kích hoạt tài khoản thủ công (Emergency unblock)**:
   - Nếu học viên không nhận được email do sự cố mail server nhưng cần vào lớp gấp, operator có thể kích hoạt trực tiếp trên D1:
     ```bash
     npx wrangler d1 execute teacher-os-db --command "UPDATE user SET email_verified = 1 WHERE lower(trim(email)) = 'student@example.com';"
     ```
   - Sau khi cập nhật, học viên bấm "Tôi đã xác thực — Kiểm tra lại" trên portal sẽ được tự động provision hồ sơ và vào trang tổng quan.
3. **Học viên phản ánh "Đã bấm gửi lại nhưng không nhận được email"**:
   - Kiểm tra xem server có đang chạy ở chế độ `LOG-ONLY` (quên cấu hình `MAILER_IMPL=resend` hoặc thiếu `RESEND_API_KEY`) hay không.
   - Kiểm tra log server xem có lỗi gửi mail từ Resend (quota, invalid recipient).


## GitHub webhook endpoint — issue #421

- **Payload URL:** `https://api.<domain>/webhooks/github` (prod) / `https://api.staging.<domain>/webhooks/github` (staging).
- **Content type:** `application/json` **bắt buộc** — form-encoded bị 415 theo hợp đồng endpoint.
- **Secret:** giá trị `GITHUB_WEBHOOK_SECRET` đã đặt ở GitHub environment; chọn event cần nhận trong trang cấu hình webhook.
- **Kiểm tra:** sau khi thêm webhook, GitHub gửi delivery `ping` — kiểm tra trả 200 trong tab "Recent Deliveries". Secret chưa set ⇒ endpoint trả 503 `GITHUB_WEBHOOK_DISABLED` (tính năng tắt, không ảnh hưởng phần khác).
- **Tên biến:** secret Actions/environment là `GH_WEBHOOK_SECRET` (GitHub Actions cấm tên secret bắt đầu `GITHUB_`); binding Worker là `GITHUB_WEBHOOK_SECRET`.
- Đặt secret ở **cả hai** environment (production và staging):
  ```bash
  gh secret set GH_WEBHOOK_SECRET --env production
  gh secret set GH_WEBHOOK_SECRET --env staging
  ```

## Student Invitation & Multi-Org (Migration 0025) — issue #263

- **Migration file:** `packages/db/src/migrations/0025_spotty_betty_ross.sql`
- **Schema changes:**
  1. `student_invitation`: Bảng mới lưu trữ lời mời học viên (`id`, `org_id`, `inviter_user_id`, `email`, `status`, `created_at`, `updated_at`).
  2. Partial unique index `student_invitation_org_email_pending_uq` trên `(org_id, lower(trim(email))) WHERE status = 'pending'` chống spam duplicate lời mời pending.
  3. Drop index `student_email_uq` (toàn cục) và tạo index `student_org_email_uq` scoped theo `(org_id, lower(trim(email)))` cho phép học viên học cùng lúc nhiều tổ chức (multi-org).
- **Rollback safety:** Forward-only. Dữ liệu `student_invitation` cascade delete theo tổ chức/người dùng.

## Rollback safety: migrations 0026–0032 (additive-only)

Tất cả các migration từ 0026 đến 0032 đều **additive-only** — chỉ thêm cột
nullable/có DEFAULT hoặc tạo bảng mới, không sửa/xóa cột hay bảng hiện có:

- **0026** (`0026_legal_master_chief.sql`): thêm 6 cột nullable vào `student`
  (trường khảo sát onboarding — `exam_interest`, `target_score`,
  `learning_goals`, `learning_goals_note`, `daily_study_hours`,
  `onboarding_completed_at`).
- **0027** (`0027_unknown_lizard.sql`): thêm `assignment_prompt.image_url`
  (`text DEFAULT '' NOT NULL`).
- **0028** (`0028_salty_purifiers.sql`): thêm
  `assignment_prompt.option_bank` (`text DEFAULT '[]' NOT NULL`) — file
  migration có ghi chú deploy-order: chạy migration trước worker mới.
- **0029** (`0029_marvelous_vapor.sql`): tạo bảng `assignment_test` +
  `assignment_test_part` (unique `(test_id, part)`) cho full-test builder.
- **0030** (`0030_previous_drax.sql`): tạo bảng `quiz_attempt` (unique
  `(assignment_id, student_id)` — 1 lượt làm bài mỗi lượt giao) cho luồng học
  viên làm bài trên student portal.
- **0031** (`0031_classy_victor_mancha.sql`): thêm `quiz_attempt.essay`
  (`text DEFAULT '' NOT NULL`) cho bài viết Writing (#304).
- **0032** (`0032_mature_saracen.sql`): thêm 5 cột nullable `media_*` vào
  `quiz_attempt` cho bài nói Speaking (#305).
- **0033** (`0033_adorable_felicia_hardy.sql`): thêm
  `quiz_attempt.grade_scores` (text JSON nullable), `grade_feedback`
  (`text DEFAULT '' NOT NULL`), `graded_at` (integer nullable) cho giáo viên
  chấm bài Writing/Speaking (#319). **DEPLOY ORDER**: migration phải chạy
  TRƯỚC worker; worker mới select cột `grade_*` ở `loadSnapshot` (mọi trang
  giáo viên) và ở select full `quiz_attempt` (màn làm bài/kết quả học viên)
  — thiếu cột thì các trang đó trả 500, trong khi `/readyz` vẫn xanh vì probe
  không kiểm cột.
- **0035** (`0035_ambiguous_freak.sql`): tạo bảng `quiz_attempt_annotation`
  (highlight + ghi chú giáo viên trên bài Writing, FK cascade theo
  `quiz_attempt`, #332). **DEPLOY ORDER**: migration chạy TRƯỚC worker; worker
  mới query bảng này ở GET `/api/grading/:attemptId` và summary học viên đã
  chấm — thiếu bảng thì trả 500, `/readyz` không phát hiện. Rollback code:
  bảng còn sót vô hại, không có bước hoàn tác dữ liệu.

Hệ quả rollback (worker rollback = redeploy commit cũ theo procedure
"Rollback code"):

- Code cũ không đọc/ghi bất kỳ cột hoặc bảng nào ở trên, nên việc bảng/cột mới
  còn sót lại trong D1 sau rollback là vô hại — **không có bước hoàn tác dữ liệu**.
- Mọi migration đều forward-only: không DROP, không sửa file migration đã apply.
- Chiều ngược lại mới rủi ro: worker mới cần bảng của 0029/0030 (và cột của
  0028) — deploy thiếu migration làm `/readyz` trả 503 vì probe tự sinh danh
  sách object bắt buộc từ schema barrel
  ([apps/server/src/routes/readiness.ts](../apps/server/src/routes/readiness.ts)).
  Alchemy apply migration trong cùng deploy; nếu tách bước, chạy migration
  trước worker (deploy-order note trong header file 0028/0029).
- Dữ liệu `quiz_attempt` / `assignment_test` cascade delete theo org /
  assignment / student; rollback worker không đụng tới dữ liệu này (chỉ
  procedure restore Time Travel mới ảnh hưởng).

## Speaking media storage (R2 + migration 0032) — issue #305

Bài nói Speaking của học viên (1 file audio/video ≤ 50 MB mỗi lượt làm bài)
lưu trong bucket R2 private `media`, bind vào Worker server dưới tên `MEDIA`
([packages/infra/alchemy.run.ts](../packages/infra/alchemy.run.ts)). Worker
là đường duy nhất đọc/ghi bucket, qua `/api/student/attempts/:id/media`.

### Preflight (release đầu tiên có #305)

1. **Bật R2 trên tài khoản Cloudflare** (Dashboard → R2 → Purchase/Enable,
   free tier). Chưa bật thì `alchemy deploy` fail ở bước tạo bucket. Cần cả
   cho `alchemy dev` local (bucket local tạo ở lần chạy đầu).
2. **Quyền token**: `CLOUDFLARE_API_TOKEN` của operator và của GitHub
   environment (prod + staging, xem "Automated production deploy") phải có
   quyền **Workers R2 Storage: Edit**. Thiếu quyền thì CI deploy fail giữa
   chừng sau khi đã đổi một phần resource.
3. **Diễn tập trên staging trước** (`deploy-staging.yml`), rồi mới prod.
4. **Backup D1** trước khi apply migration `0031_classy_victor_mancha.sql` +
   `0032_mature_saracen.sql` (theo quy trình Time Travel ở mục "D1 ledger").
   0031 thêm `quiz_attempt.essay` (`text DEFAULT '' NOT NULL`, #304); 0032 gồm
   5 câu `ALTER TABLE quiz_attempt ADD` cột nullable `media_key`, `media_name`,
   `media_type`, `media_size`, `media_uploaded_at`.

### Post-deploy

- `/readyz` chỉ kiểm bảng và index, **không kiểm cột**. Chạy thêm
  `SELECT media_key FROM quiz_attempt LIMIT 0` trên D1 của stage vừa deploy;
  lỗi "no such column" là NO-GO (mọi màn làm bài/kết quả sẽ 500). Tương tự
  cho release chấm bài (#319): chạy
  `SELECT grade_scores, grade_feedback, graded_at FROM quiz_attempt LIMIT 0`.
- Bucket private: `wrangler r2 bucket list` thấy mỗi stage có bucket riêng
  (staging không dùng chung bucket prod), và
  `wrangler r2 bucket dev-url get <tên bucket>` báo dev URL **tắt**. Không bật
  public domain cho bucket này.
- Smoke: học viên mở một đề Speaking, tải 1 file mp3 nhỏ, reload thấy file
  còn, nộp bài, màn kết quả "Nghe lại bài nói" phát được.

### Cửa sổ deploy và rollback

- Field `skill`/`media` mới của summary là optional: bundle student mới +
  server cũ chạy được. Bundle cũ đang mở + server mới có thể lỗi parse ở màn
  kết quả cho tới khi học viên reload (cùng cửa sổ đã chấp nhận ở #304).
- Rollback code an toàn: code cũ không đọc cột `media_*` và không bind
  `MEDIA`; cột và bucket còn sót lại là vô hại. Migration forward-only.
- Thiếu binding `MEDIA` (bucket chưa tạo) thì các route media trả 503, không
  ảnh hưởng Reading/Listening/Writing; đề Speaking không nộp được cho tới khi
  bucket có.
- Object mồ côi (Worker bị huỷ giữa upload và ghi DB, lệnh xoá best-effort
  lỗi, hoặc cascade xoá lượt giao/học viên) không tự dọn ở v1. Không dùng
  lifecycle rule theo prefix `quiz-media/` — nó xoá cả bài đã nộp; dọn bằng
  job đối chiếu với `quiz_attempt.media_key` (follow-up).

## SePay Bank Hub go-live (migration 0034) — issue #320

Tuition transfer matching (#320) ships disabled by default: with the four
`SEPAY_BANKHUB_*` secrets blank, `getBankHub()` returns `undefined` and every
bank route answers `503 BANKHUB_DISABLED` (UI shows "Chưa bật"). Enabling is
a per-stage operation.

### Checklist trước khi bật production

1. Xin credential đối tác từ SePay: `client_id`/`client_secret` (merchant
   TeacherOS) và API key cho IPN. SePay cấu hình URL IPN phía họ:
   `https://api.<domain>/webhooks/sepay/bankhub/ipn`.
2. Set 5 binding env cho stage đó (tên biến trong Secret inventory ở trên,
   KHÔNG bao giờ giá trị): 4 secret + `SEPAY_BANKHUB_BASE_URL=https://bankhub-api.sepay.vn`
   (bắt buộc set tường minh ở production — default rơi về sandbox host).
   Deploy qua CI hiện CHƯA truyền các biến này: bước `pnpm alchemy deploy`
   trong `.github/workflows/deploy.yml` (prod) và `deploy-staging.yml`
   (staging) không có `SEPAY_BANKHUB_*` trong khối `env:`, nên
   `packages/infra/alchemy.run.ts` rơi về default (secret rỗng, base URL
   sandbox) và Worker deploy từ CI luôn ở trạng thái tắt; đặt tay trên
   Cloudflare dashboard cũng bị ghi đè ở lần deploy kế tiếp. Trước khi bật,
   phải mở rộng khối `env:` của bước deploy ở cả hai workflow để đọc 4 secret
   (`secrets.*`) và `SEPAY_BANKHUB_BASE_URL` (`vars.*`) từ GitHub environment
   của stage — cùng pattern với `RESEND_API_KEY`/`MAILER_IMPL` — rồi đặt giá
   trị bằng `gh secret set … --env <stage>` / `gh variable set … --env <stage>`.
3. Chạy `apps/server/scripts/bankhub-setup.ts` (đọc env, không in secret):
   đăng ký webhook lifecycle
   `https://api.<domain>/webhooks/sepay/bankhub/events` (auth `SECRET_KEY`,
   `allow_events: ["*"]`) và merchant-config whitelist
   `transaction_whitelist_remark_keywords: ["TOS"]`.
4. Sandbox gate (trước go-live production, ghi kết quả vào
   `plans/261005-0754-sepay-bank-hub-tuition-qr/reports/sandbox-verification.md`):
   host thật của `hosted_link_url` (cập nhật const `BANK_HUB_LINK_ORIGINS` nếu
   khác); `transaction_amount` mặc định của company mới (nếu 0 → xác nhận
   `company/edit` → `Unlimited`); tên event khôi phục (`REACTIVATE`);
   `payment_code` trong IPN thật + định dạng `transaction_date`; whitelist
   keyword với nội dung chữ thường; `FINISHED_*` postMessage có phát khi
   không có `completion_redirect_uri`.
5. Smoke sau bật: liên kết 1 tài khoản sandbox/production từ trang Hồ sơ
   (`/profile`, card "Nhận học phí qua chuyển khoản" — #338) → tạo
   phiếu → chuyển khoản thử (sandbox `POST /v1/transaction/create`) → phiếu
   "Thu một phần"/"Đã thu" trong ≤ 1 phút; nút "Đối soát" trả `{scanned…}`.
6. Rollback tính năng: blank lại 4 secret → redeploy. Feature flag bằng
   secret-blank, không cần migration revert (migration 0034 additive-only).

### Hạn chế đã biết (chấp nhận cho beta)

- Đối soát quét 7 ngày gần nhất của mọi `bank_account_xid` đã từng liên kết;
  giao dịch trong thời gian TK bị ngân hàng vô hiệu hoá (OCB/MSB/KLB/TPB)
  không được Bank Hub đồng bộ bù — giáo viên đối chiếu sao kê tay nếu có tiền
  trong cửa sổ đó.
- SePay không retry IPN khi nhận 4xx/5xx: parse-lỏng chặn schema-drift, nhưng
  lỗi DB thật vẫn làm mất delivery — nút "Đối soát" là đường bù.

## Built-in vocabulary library (migration 0037) — issue #361

- **Deploy order bắt buộc:** Chạy `db:migrate:deploy` (migration `0037`) **TRƯỚC** khi deploy worker (`snapshot` giáo viên và các route `/api/kernel/vocab-library/*`, `/api/student/vocab/*` đọc các bảng `vocab_library_*` cùng 2 cột `vocab_deck.source_library_deck_id` và `vocab_word.audio_url`).
- **Release train:** `vocabSessionCardSchema` thêm trường `hasAudio` với `.strict()` → `apps/server` và `apps/student` **BẮT BUỘC deploy cùng một bước** (`pnpm alchemy deploy`); không promote riêng lẻ từng gói.
- **Seed dữ liệu thư viện (20 khóa / 968 bài / 10.160 từ):** Xem hướng dẫn chi tiết và **Gate Giấy phép PROD** tại [`packages/db/scripts/README-seed-vocab-library.md`](../packages/db/scripts/README-seed-vocab-library.md). Chỉ chạy `--d1` trên PROD sau khi đã smoke `--d1 --verify` trên Staging và chủ sở hữu dự án đã xác nhận quyền sử dụng nội dung (Open Question 1).

## Independent vocab hub & suggestions (migration 0038) — issue #363

- **Recreate bảng `vocab_deck` (`0038_wise_blizzard.sql`):** SQLite không hỗ trợ `ALTER COLUMN ... DROP NOT NULL`, nên migration `0038` thực hiện chuỗi `PRAGMA foreign_keys=OFF → CREATE TABLE __new_vocab_deck → INSERT SELECT → DROP TABLE vocab_deck → ALTER TABLE RENAME → PRAGMA foreign_keys=ON → CREATE INDEX` (cùng tạo bảng mới `vocab_suggestion`).
- **Diễn tập, Backup & Thời điểm chạy:** Bắt buộc diễn tập trên bản sao dữ liệu Staging trước khi lên Production; **backup/export D1 (hoặc ghi lại bookmark Time Travel)** trước khi apply `0038` trên PROD; chạy trong khung giờ thấp điểm (off-hours) vì cửa sổ ms-level giữa `DROP` và `RENAME` là forward-only, không rollback.
- **Deploy order & Release train:**
  1. Chạy `db:migrate:deploy` (`0038`) **TRƯỚC** khi deploy worker.
  2. Deploy `apps/server` trả trường optional `vocabSuggestions` trong kernel snapshot **TRƯỚC** (hoặc đồng thời trong cùng lượt `pnpm alchemy deploy`) với `apps/web` và `apps/student`.
  3. Mặc dù `vocabOverviewSchema` và `vocabOverviewDeckSchema` dùng `.catch()` fallback cho client mới đọc payload cũ, `apps/server`, `apps/web`, và `apps/student` vẫn phải đi cùng một release train để tránh bundle cũ `.strict()` từ chối trường `suggestions` mới.

## Student full vocabulary courses (migration 0039) — issue #366

- **Recreate bảng `vocab_card` (`0039_ambiguous_prowler.sql`):** Bỏ ràng buộc `FOREIGN KEY (word_id) REFERENCES vocab_word(id)` bằng chuỗi `PRAGMA foreign_keys=OFF → CREATE TABLE __new_vocab_card → INSERT SELECT → DROP TABLE vocab_card → ALTER TABLE RENAME → PRAGMA foreign_keys=ON → CREATE INDEX` (giữ nguyên `FOREIGN KEY (student_id) REFERENCES student(id) ON DELETE cascade` và 3 index) để `vocab_card.word_id` trỏ được tới cả `vocab_word.id` lẫn `vocab_library_word.id` (`libword-*`).
- **Diễn tập, Backup & Thời điểm chạy:** Ghi lại bookmark D1 Time Travel / backup trước khi apply `0039` trên PROD; chạy trong khung giờ thấp điểm (off-hours).
- **Deploy order & Release train:**
  1. Chạy `db:migrate:deploy` (`0039`) **TRƯỚC** khi deploy worker để học viên học bài thư viện (`libdeck-*`) không gặp lỗi khóa ngoại `SQLITE_CONSTRAINT_FOREIGNKEY`.
  2. Deploy đồng bộ `apps/server`, `apps/web`, và `apps/student` trong cùng một release train (vì `vocabStudentProgressDeckSchema` thêm trường `className` trên response `.strict()`).


## Library part groups (migration 0044) — issue #420/#424

- **Migration `0044_library_part_groups.sql` chỉ `ADD COLUMN`:** `ALTER TABLE library_test_part ADD groups text DEFAULT '[]' NOT NULL` — thuần thêm cột có default, không recreate bảng, không cần khung giờ thấp điểm.
- **Backup:** Ghi lại bookmark D1 Time Travel (hoặc backup/export D1) trước khi apply `0044` trên PROD.
- **Deploy order bắt buộc:** Chạy `db:migrate:deploy` (`0044`) **TRƯỚC** khi deploy worker — route admin `PUT /api/admin/library/tests/:testId/parts/:part` ghi cột `groups` ngay khi bundle mới lên.
- **Deploy skew — strict DTO (red-team A2/F3):** `libraryPartDtoSchema` và `libraryPartUpsertSchema` đều `.strict()` với key `groups` → worker server (`apps/server`) và bundle admin (`apps/admin`) **PHẢI cùng một release train** (precedent #304): alchemy deploy cả hai trong cùng một lần deploy; **reload tab admin sau deploy** (tab cũ strict-reject DTO mới → trang sửa đề báo lỗi; tab cũ bấm lưu trước khi reload sẽ bị 400/last-write-wins). Nếu rollback worker về pre-#420, phải rollback/hạ admin cùng lúc — admin mới gửi `groups` làm server cũ 400 mọi lần lưu part. Migration là `ADD COLUMN` nên rollback worker **không phá** dữ liệu `groups` đã ghi.
- **Deploy skew — groups corrupt guard (#425):** 2 key strict mới — `groupsCorrupt` (DTO part) và `discardCorruptGroups` (upsert) — rơi cùng ràng buộc release train ở trên. **Server mới + tab admin cũ:** server emit thêm `groupsCorrupt` vào DTO part, tab admin cũ schema `.strict()` sẽ reject response → trang sửa đề lỗi — **reload tab admin sau deploy, giống dòng trên**. **Admin mới + server cũ:** DTO parse OK nhờ `groupsCorrupt` có `.default(false)`, nhưng bấm «Lưu đè nhóm hỏng» gửi `discardCorruptGroups` → server cũ 400 (strict-reject) — rollback worker về pre-#425 phải hạ admin đồng thời. Chỉ dùng nút «Lưu đè nhóm hỏng» sau khi cả worker lẫn admin cùng bản mới.
- **Render contract (red-team S7):** `questions[].explanation` và `groups[].instruction` là rich text — mọi render site tương lai (PR3 web học viên) **PHẢI** dùng `RichTextBody` (DOMPurify, sink `dangerouslySetInnerHTML` duy nhất tại `packages/ui/src/lib/rich-text-sanitize.ts`); không dùng `dangerouslySetInnerHTML` trực tiếp.

## Admin console go-live (plan #413)

Cổng quản trị Teacher OS (`apps/admin`) chạy trên origin riêng
`https://admin.<domain>` (staging: `admin.staging.teacheros.io.vn`; dev cục
bộ: 8004, E2E: 8104) và API của nó nằm ở `/api/admin` trên Worker API,
ngoài kernel tree.

### Binding bắt buộc

| Binding | Giá trị production | Ghi chú |
| --- | --- | --- |
| `ADMIN_ORIGINS` | `https://admin.<domain>` | Có default từ `APP_DOMAIN` (`alchemy.run.ts`); giá trị explicit thiếu origin admin fail loud khi deploy |
| `ADMIN_EMAILS` | danh sách email phân tách dấu phẩy | **KHÔNG có default** — rỗng (không set) = không ai là admin và không ai đăng ký được account admin; so khớp lowercase trong `requireAdmin` ở MỖI request (gỡ email khỏi danh sách là mất quyền ngay) |
| `TEACHER_EMAILS` | danh sách email phân tách dấu phẩy | **Bắt buộc trên production** (`resolveTeacherEmails` ném lỗi khi deploy nếu rỗng); ở môi trường khác rỗng = không giới hạn. Kiểm lowercase mỗi request ở kernel (`bootstrapMiddleware`) và ở hook sign-up (`TEACHER_SIGNUP_FORBIDDEN`, #513) |
| `LIBRARY_AUDIO` | R2 bucket `library-audio` | Private bucket tạo trong `alchemy.run.ts`; thiếu binding → route audio trả 503 `LIBRARY_AUDIO_DISABLED` |

### Quy trình cấp admin đầu tiên

1. Đặt `ADMIN_EMAILS=<email-vận-hành>` trong môi trường deploy (binding,
   không ghi vào file `.env` cho production) rồi deploy.
2. Người vận hành mở `https://admin.<domain>/register` (route không được
   link công khai) và đăng ký bằng đúng email trong danh sách; server từ
   chối mọi email khác bằng 403 `ADMIN_SIGNUP_FORBIDDEN` (không tạo row
   `user`).
3. Verify email (mail verification của Better Auth) — `requireAdmin` đòi
   `email_verified` bên cạnh `role='admin'` (role được stamp từ Origin
   admin lúc sign-up).
4. Smoke: đăng nhập tại `https://admin.<domain>/login` → shell hiện mục
   "Thư viện đề" và `GET /api/admin/me` trả 200.

### Single-org allowlist giáo viên (`TEACHER_EMAILS`, #513)

1. **Kiểm tra trước khi deploy production:** chạy truy vấn đọc `SELECT email, created_at FROM user WHERE role = 'teacher';` trên D1 production để đối chiếu chính xác địa chỉ email đang lưu của chủ app.
2. Đặt biến `TEACHER_EMAILS` trên GitHub Environment `production` (`gh variable set TEACHER_EMAILS --env production --body "<email-chủ-app>"`, hoặc truyền trong môi trường deploy) khớp đúng email trong kết quả truy vấn. Nếu `TEACHER_EMAILS` rỗng trên `APP_DOMAIN=teacheros.io.vn`, Alchemy fail-closed ngay lúc deploy. Các tài khoản `role = 'teacher'` khác (nếu có) sẽ bị chặn ở mỗi request bằng 403 `ACCOUNT_TEACHER_NOT_ALLOWED`; không xoá dữ liệu trong bước này.
3. **Rollback / đổi danh sách:** đổi hoặc bổ sung email trong binding `TEACHER_EMAILS` rồi deploy lại; có hiệu lực ngay ở request kế tiếp và không cần migration D1.

### Bucket `library-audio` (kho audio đề Listening)

- Bucket R2 riêng `library-audio` (tách khỏi `MEDIA` bài nói) — worker chỉ
  đọc/ghi qua adapter inject tại `/api/admin/library/tests/:id/parts/:slot/
  audio` (PUT upload / GET phát / DELETE dọn theo part, allowlist MIME
  MP3/M4A/WAV/AAC/OGG/WEBM, trần 50 MB).
- Xóa bộ đề/part phải dọn sạch object audio tương ứng; kiểm bằng cách GET
  lại URL audio sau khi xóa — phải trả 404.

### Kiểm domain custom

Sau deploy, xác nhận `https://admin.<domain>` gắn đúng Worker admin,
certificates issue thành công (giống `app.`/`student.`), và session cookie
zone (`Domain=.<domain>`) hoạt động: đăng nhập admin rồi gọi
`https://api.<domain>/api/admin/me` phải 200; một session teacher/student
gọi cùng endpoint phải 403 `ACCOUNT_NOT_ADMIN`.
