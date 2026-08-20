# Red-team: Security Adversary

Plan: `plans/260819-2034-production-readiness/phase-02-d1-migration-safety-and-recovery-drill.md`
Date: 2026-08-20
Lens: Security Adversary (attacker: auth bypass, injection, data exposure, privilege escalation, supply chain, OWASP)
Verification role: Fact Checker — sample claims vs codebase
Scope: ISSUE 29 = Phase 2 only. Phase 1 completed + merged. Không đòi implement Phase 3–6.

Không khen. Chỉ finding có `file:line`. Không ghi secret, token, D1 UUID, nội dung env.

---

## Fact check (sample claims)

| Claim | Verdict | Evidence |
|---|---|---|
| Alchemy D1 `migrationsDir` at `packages/infra/alchemy.run.ts:11-13` | **FAILED** | Binding thật `alchemy.run.ts:41-43`. `:11-13` = comment dotenv. |
| `plan.md` cite `alchemy.run.ts:11-63` cho D1+stack | **FAILED** (range lệch) | Range bắt đầu dotenv; D1 = `:41-43`, Worker = `:45-68`, Stack state = `:72-77`. |
| `0006` = `ALTER TABLE comment_bank ADD operation_id text NOT NULL` + unique index, no default/backfill | **VERIFIED** | `packages/db/src/migrations/0006_pink_ender_wiggin.sql:1-2` |
| Journal có tag `0006_pink_ender_wiggin` | **VERIFIED** | `packages/db/src/migrations/meta/_journal.json:47-52` |
| Schema Drizzle `operation_id` NOT NULL + unique `(org_id, operation_id)` | **VERIFIED** | `packages/db/src/schema/comment-bank.ts:19,27-30` |
| Runbook thiếu RPO/RTO, bookmark, write-quiesce, restore drill evidence | **VERIFIED** | `rg RPO\|RTO\|bookmark\|time-travel\|quiesce docs/` = 0 hits |
| Staging là rehearsal only, cấm rehearsal trên prod/pilot | **VERIFIED** | `docs/production-release-runbook.md:40-44` |
| Phase 1 completed, staging provisioned via Alchemy | **VERIFIED** | `phase-01-…md:7` `status: completed`; runbook `:90-96` |
| `plan.md` “Phase 1 will create isolated staging”; Phase 1 status Pending | **FAILED** (stale) | `plan.md:84,111,127-128` vs phase-01 completed |
| Time Travel đã operationalize trong runbook | **FAILED** | `plan.md:98` chỉ URL docs CF; runbook 0 lệnh `time-travel` |
| `scripts/verify-d1-release-state.mjs` tồn tại | **VERIFIED absent** | `scripts/` chỉ `ci-workflow.test.mjs`, `topology-drift.test.mjs` |
| `GET /` liveness | **VERIFIED** | `apps/server/src/app.ts:98` |
| `ci.yml:16-35` quality gate | **VERIFIED** | `.github/workflows/ci.yml:16-35` |
| Repo có `wrangler.toml` / pin D1 name | **FAILED** | 0 `wrangler.toml`; `biome.json:27` ignore `wrangler.jsonc` |
| Repo có `PRAGMA foreign_keys` / `foreign_key_check` | **FAILED** (chỉ plan) | `rg PRAGMA\|foreign_key_check` = 0 trong `*.ts/sql/mjs` |
| Write-quiesce / maintenance mode trong code | **FAILED** | `rg quiesce\|maintenance mode` = 0 ngoài phase-02 plan |
| Ledger runtime tên `d1_migrations` trong source | **FAILED** | 0 reference trong `*.ts/sql`; test migrator dùng `__drizzle_migrations` (`kernel.test.ts:46`) |

---

## Finding 1: Time Travel restore hồi sinh session + OAuth token — auth bypass, plan không invalidate

- **Severity:** Critical
- **Location:** Phase 2, Implementation Step 5–6 + Success “post-restore kernel/auth smoke”
- **Flaw:** Restore D1 là restore **toàn bộ** bảng auth. `session.token` unique plaintext; `account` giữ `access_token`, `refresh_token`, `id_token`, `password`. Plan bắt “auth bootstrap and kernel write/reload” sau restore, **không** bước `DELETE FROM session` / rotate `BETTER_AUTH_SECRET` / cấm `SELECT *` dump. Sign-out hoặc stolen cookie trước bookmark trở thành valid lại. Smoke dump table auth → token vào GitHub/issue/terminal scrollback.
- **Failure scenario:** Operator bookmark → Google login (ghi `session` + `account`) → restore về bookmark trước logout. Cookie `better-auth.session_token` cũ (hoặc token copy từ `wrangler d1 execute SELECT`) gửi kèm Origin đúng → `getSessionUser` pass → kernel write. Attacker có issue attachment chứa `account.refresh_token` dùng lại Google grant của tài khoản UAT. Rotate secret (runbook `:58`) **không** xóa row `session`; lookup là DB token, không JWT ký secret.
- **Evidence:**
  - Plan Step 4–5: “auth bootstrap and kernel write/reload”; “rerun smoke”
  - `packages/db/src/schema/auth.ts:21-27` `session.token` `notNull().unique()`
  - `packages/db/src/schema/auth.ts:51-61` `access_token` / `refresh_token` / `id_token` / `password`
  - Session cookie parse trong test: `apps/server/src/kernel.test.ts:49-51` `better-auth.session_token=`
  - `packages/auth/src/index.ts:12-29` drizzleAdapter sqlite, `secret: env.BETTER_AUTH_SECRET`
  - Runbook evidence: `docs/production-release-runbook.md:171-173` “sanitized command output… tracking issue”
  - Plan “command references (without IDs/secrets)” — không cấm dump `session`/`account`
- **Suggested fix:** Runbook bắt buộc post-restore: `DELETE FROM session;` (và không `SELECT` cột token). Cấm paste output `account`/`session` vào issue. Auth smoke = login **mới** sau wipe, không tái sử dụng cookie pre-restore. Evidence chỉ `COUNT(*)` / `PRAGMA table_info`.

---

## Finding 2: “Create/copy representative database” = kênh copy PII học viên + comment giáo dục sang staging public

- **Severity:** Critical
- **Location:** Phase 2, Step 3 “Create/copy a non-production representative database”
- **Flaw:** “Copy” không bị cấm là copy từ prod/pilot/local có data thật. Staging Worker `workers.dev` (APP_DOMAIN unset), internet-reachable, `emailAndPassword.enabled: true`. Schema chứa PII: SĐT học viên/PH, tên PH, `comment_bank.text` “sensitive education data”. Phase 1 runbook cấm production data trên staging — Phase 2 Step 3 mâu thuẫn, không có allowlist cột/nguồn.
- **Failure scenario:** Operator `wrangler d1 export` prod (khi có) hoặc local DB có học viên → import staging “cho đại diện”. Staging URL đoán được từ Alchemy name. Attacker sign-up email/password trên staging **hoặc** đọc evidence SQL dump. Comment ngân hàng nhận xét + SĐT phụ huynh rơi khỏi biên prod. Ngay cả khi kernel org-scope chặn HTTP, dump `SELECT * FROM student` / `comment_bank` lúc verify (Step 4) dính GitHub.
- **Evidence:**
  - Plan Step 3: “Create/copy a non-production representative database by the approved operator procedure”
  - Runbook trái: `docs/production-release-runbook.md:40-44` staging “rehearsal only — never production data”
  - `packages/db/src/schema/student.ts:16-20` `name`, `phone`, `zalo`, `parent_name`, `parent_phone`
  - `packages/db/src/schema/comment-bank.ts:11` “Text may contain sensitive education data”
  - `packages/api/src/contracts.ts:87-90` comment max 2000, “sensitive education data”
  - Staging topology: runbook `:28-29,40` APP_DOMAIN unset → `workers.dev`
  - `packages/auth/src/index.ts:25-27` `emailAndPassword: { enabled: true }`
  - README `:57` email/password enabled
- **Suggested fix:** Cấm copy prod/pilot. Representative = synthetic INSERT ≥2 `comment_bank` trên org seed, text `fixture-*`, không SĐT/tên thật. Verify chỉ `COUNT(*)` + `PRAGMA`. Staging sign-up: tắt email/password trên stage rehearsal hoặc chặn public (CF Access) trong cửa sổ drill.

---

## Finding 3: Time Travel destructive, credential account-wide, không pin tên D1 — privilege escalation / wipe nhầm

- **Severity:** High
- **Location:** Phase 2 Architecture “platform provides D1 recovery/Time Travel” + Step 5 restore + optional `scripts/verify-d1-release-state.mjs`
- **Flaw:** Restore CF = overwrite in-place, hủy query in-flight, **không clone**. Repo 0 `wrangler.toml` pin `database_id`. Binding Alchemy id là `"database"` — không phải tên vật lý Wrangler. Token inventory `CLOUDFLARE_API_TOKEN` account-level (cùng token deploy prod). Plan cấm ID trong docs nên operator truyền **tên** tay. Script optional không có allowlist `*-staging-*`, không deny `prod`, không `--remote` bắt buộc. `wrangler d1 execute` thiếu `--remote` = local persist — false green **hoặc** operator “sửa” bằng cách list mọi D1 qua OAuth rồi restore cái gần giống.
- **Failure scenario:** Tab-complete `teacher-os-database-` trúng prod (khi Phase 6 tạo) hoặc `dev_<user>`. `time-travel restore` xóa data live. Hoặc script `verify-d1-release-state.mjs` nội suy `process.argv` vào shell (`wrangler d1 execute ${name}`) — command injection từ tên D1. Drill “pass” trên local SQLite vì quên `--remote`.
- **Evidence:**
  - Plan Architecture: “operationalizes [Time Travel] rather than building a backup service”
  - Plan Related Files: “Optional create: `scripts/verify-d1-release-state.mjs`”
  - `packages/infra/alchemy.run.ts:41-43` `Cloudflare.D1.Database("database", { migrationsDir: ... })`
  - `alchemy.run.ts:72-77` `state: Cloudflare.state()` — state **ngoài** D1
  - Runbook secret inventory `:56-60` `CLOUDFLARE_API_TOKEN` / D1 IDs “never paste into issues”
  - Runbook `:98-100` “Record the staging D1 name/ID in the release evidence” vs Phase 2 “without IDs/secrets”
  - Không `wrangler.toml`; `biome.json:27`
  - Runbook restore prod: `:140-142` “only the restore authority below” — bảng sign-off `:169-170` **trống**
  - `scripts/` không có verify script
- **Suggested fix:** Pin tên D1 staging (không UUID) trong runbook. Mọi lệnh restore/execute: `--remote` + match `*-staging-*` else abort. Token drill scoped D1 staging, tách token prod. Cấm script nội suy argv vào shell; allowlist. Restore authority điền **trước** drill, không sau.

---

## Finding 4: Sửa file `0006` sau apply = supply-chain schema (cùng tag, khác SQL)

- **Severity:** High
- **Location:** Phase 2 Step 2 “make that pending migration existing-data-safe”
- **Flaw:** Cloudflare/Alchemy ledger theo **filename**, không hash nội dung. Phase 1 đã deploy staging — `0006` nằm trong `migrationsDir` nên đã apply (empty table → ALTER NOT NULL không default **thành công**). Runbook cấm sửa migration đã apply. Step 2 vẫn mở nhánh edit `0006`. Test CI migrate libsql (`__drizzle_migrations`) sẽ chạy SQL **mới**; staging D1 giữ SQL **cũ**. Prod D1 lần đầu (chưa tồn tại) nhận SQL mới. Attacker/AI “fix” 0006 trong git = payload chỉ nổ trên env mới.
- **Failure scenario:** Implementer thêm backfill vào `0006_pink_ender_wiggin.sql`. `alchemy deploy --stage staging` skip. Empty drill “pass”. `pnpm test` migrate in-memory pass SQL mới. Prod tạo mới apply backfill; hoặc ngược lại staging empty-SQL, prod populated nổ NOT NULL. Ledger GitHub ghi “0006 rehearsed” — hai SQL.
- **Evidence:**
  - Plan Step 2: “if `0006` has not been applied to any environment whose history must stay compatible, make that pending migration existing-data-safe with unique backfill values”
  - `0006_pink_ender_wiggin.sql:1-2` NOT NULL, 0 DEFAULT, 0 UPDATE
  - `_journal.json:47-52` tag `0006_pink_ender_wiggin`
  - `alchemy.run.ts:41-43` + runbook `:110-113` “never edit… applied migration file”; “Alchemy applies D1 migrations as part of the deploy”
  - README `:38` Alchemy apply on deploy
  - `apps/server/src/kernel.test.ts:32-46` `migrate(..., MIGRATIONS_DIR)` — ledger **khác** (`__drizzle_migrations`)
  - Phase 1 completed: `phase-01-…md:7,46` staging deployed
- **Suggested fix:** Đóng nhánh edit 0006. Frozen. Populated-safe = **0007 forward** (nullable add → unique UPDATE per row → index), rehearsal trên D1 scratch apply 0000–0005 + seed rồi 0007. NO-GO nếu git diff đụng `0006_pink_ender_wiggin.sql`.

---

## Finding 5: “Unique backfill” không spec SQL — phá unique idempotency hoặc fail unique index

- **Severity:** High
- **Location:** Phase 2 Step 2 “unique backfill values” + `comment_bank` write path
- **Flaw:** `(org_id, operation_id)` unique là **idempotency key** của POST comment-bank. Client `operationId` phải UUID. SQLite `ADD COLUMN … NOT NULL` trên bảng có row **bắt buộc** default hằng — default hằng + unique index nổ khi ≥2 row cùng org. Plan không ghi 3 bước (add nullable / UPDATE unique / index). `onConflictDoNothing({ target: [orgId, operationId] })` **cần** unique index; drop index “cho migrate pass” = retry tạo duplicate, mất anti-replay.
- **Failure scenario:** Operator `ADD operation_id text NOT NULL DEFAULT ''` → `CREATE UNIQUE INDEX` fail trên 2 comment cùng org → migrate abort. Hoặc bỏ unique index → attacker/replay cùng `operationId` insert nhiều row; Phase 5 “truthful mutation” dựa trên idemptency chết. Hoặc backfill non-UUID (`legacy-1`) — POST sau này UUID không đụng, nhưng row cũ không đi qua contract `z.string().uuid()`, snapshot/UI giả định UUID.
- **Evidence:**
  - Plan Step 2: “unique backfill values”
  - `0006_pink_ender_wiggin.sql:2` `comment_bank_org_operation_uidx` (`org_id`,`operation_id`)
  - `packages/db/src/schema/comment-bank.ts:19,27-30`
  - `packages/api/src/contracts.ts:91` `operationId: z.string().uuid()`
  - `apps/server/src/routes/reporting/index.ts:60-88` insert + `onConflictDoNothing({ target: [commentBank.orgId, commentBank.operationId] })` rồi 409 payload conflict
- **Suggested fix:** Forward migration: add column nullable → `UPDATE comment_bank SET operation_id = id WHERE operation_id IS NULL` (`id` đã UUID PK) → create unique index. Không DEFAULT `''`. Không drop unique index. Rehearse ≥2 row cùng `org_id`.

---

## Finding 6: Kernel/auth smoke không khóa CSRF Origin — bypass guard hoặc nhét cookie vào evidence

- **Severity:** High
- **Location:** Phase 2 Step 4 “auth bootstrap and kernel write/reload”
- **Flaw:** POST kernel fail-closed nếu `Origin !== corsOrigin`. Staging CORS = generated web URL, **không** `app.<domain>`. Plan không spec: cookie jar, header Origin, cấm email/password, cấm `curl` không Origin, cấm SQL-insert thay POST. Operator gặp 403 sẽ (a) SQL seed qua wrangler (smoke không chứng minh authz) hoặc (b) nới CORS/Origin “cho drill pass” — đúng anti-pattern Phase 1 cấm. `hono/logger` log method+path; `wrangler tail` attach issue có thể kèm cookie header nếu request dump.
- **Failure scenario:** `curl -X POST https://<staging-api>/api/comment-bank` không Origin → 403. Operator `wrangler d1 execute INSERT INTO comment_bank` → tick “kernel write”. Restore xong Worker thật vẫn 403/401. Hoặc họ POST kèm cookie copy vào runbook. Hoặc sign-up email/password trên staging Worker public, bootstrap `teacher` membership (`app.ts:60-69`) — tài khoản ngoài UAT có workspace trên D1 rehearsal.
- **Evidence:**
  - Plan Step 4: “auth bootstrap and kernel write/reload” — 0 header/origin
  - `apps/server/src/routes/kernel.ts:39-46` POST Origin check → 403 `"origin not allowed"`
  - `apps/server/src/app.ts:86-95` CORS `origin: deps.corsOrigin`, `credentials: true`
  - `apps/server/src/app.ts:35-69` bootstrap: no membership → INSERT org + `role: "teacher"`
  - `packages/auth/src/index.ts:18,25-27` `trustedOrigins: [CORS_ORIGIN]`, email/password on
  - Runbook `:126-127` “Never weaken CORS or cookie attributes” (prod smoke) — Phase 2 không inherit
  - Staging: runbook `:28-29` workers.dev + explicit `CORS_ORIGIN`
- **Suggested fix:** Spec smoke: browser/incognito **staging web origin**, POST có `Origin` đúng, cookie session **mới**. Cấm wrangler INSERT cho kernel write. Cấm email/password. Evidence: status code + `COUNT(*)`, không header Dump. 403 → stop, không nới CORS.

---

## Finding 7: Bootstrap sau restore = org mới; “fix” membership = privilege grant không audit

- **Severity:** High
- **Location:** Phase 2 Step 4–5 auth bootstrap post-restore
- **Flaw:** Bootstrap idempotent theo `membership.userId`; không membership → org UUID mới, `role=teacher`. Unique membership là `(orgId, userId)` — một user **nhiều** org; request dùng org `createdAt` sớm nhất. Restore về bookmark **trước** login: Google user mới → org trống; `comment_bank` seed nằm org orphan. Restore về bookmark **có** membership khác user id (SQL seed) → UAT Google tạo org thứ hai. Operator “sửa” bằng `INSERT INTO membership …` gắn user UAT vào org có data = **privilege grant** tay, không qua authz, không ghi runbook.
- **Failure scenario:** Seed populated `comment_bank` với `org_id` fixture. Restore. UAT login. `GET /api/kernel` trả org rỗng (bootstrap mới). Operator tin data mất, INSERT membership (UAT user → org fixture) hoặc UPDATE `user_id`. Attacker nắm runbook làm y chang trên prod restore: gắn user của họ vào org giáo viên. Earliest-org-wins: membership cũ hơn (seed timestamp) thắng — UAT bị gán org fixture kể cả khi họ đã có org riêng.
- **Evidence:**
  - `apps/server/src/app.ts:35-78` bootstrap; `orderBy(asc(membership.createdAt), asc(membership.id))`; earliest wins
  - `packages/db/src/schema/membership.ts:22,28` `role` default `"teacher"`; unique `(orgId, userId)` **không** unique `userId`
  - Plan Step 4 “auth bootstrap” không: cấm INSERT membership tay; không verify `org_id` seed == session org
  - Kernel list org-scoped: `apps/server/src/routes/reporting/index.ts:27-30` `ctx.orgId`
- **Suggested fix:** Seed chỉ **sau** UAT login, dùng `org_id` từ membership thật. Post-restore: `SELECT org_id FROM membership WHERE user_id=?` phải = org seed. Cấm DML tay trên `membership`/`user`/`account`. Nếu restore xóa membership → login lại, **re-seed synthetic**, không rebind.

---

## Finding 8: Worker staging vẫn nhận mutation trong cửa sổ restore — không quiesce = lost-write + split-brain

- **Severity:** High
- **Location:** Phase 2 Step 5 “Quiesce mutations by the approved maintenance procedure”
- **Flaw:** “Approved maintenance procedure” **không tồn tại** sau Phase 1. Không feature flag, không unbind Worker, không CF Access lock. Cookie `SameSite=None; Secure` + Origin = staging web → POST vẫn commit trong lúc `time-travel restore` (CF hủy in-flight, overwrite). Stolen/UAT session ghi đè lên bookmark. RPO đo trên drill có write song song là số giả. Procedure này sẽ copy sang prod (`runbook.md:140-142`).
- **Failure scenario:** Bookmark T0. Teacher (hoặc cookie leak Finding 1) POST comment. Restore về T0. Write mất, UI vẫn hiện id. Reconcile “document how writes since the bookmark are reconciled” không có nguồn — không mutation log (plan.md Finding 12 đã **reject** audit trail). Prod incident: restore khi giáo viên đang điểm danh → mất row, không replay.
- **Evidence:**
  - Plan Step 5: “Quiesce mutations by the approved maintenance procedure”
  - `rg quiesce|maintenance mode|write-lock` = 0 trong code/runbook
  - Worker bound D1: `alchemy.run.ts:51-52` `env.DB: db`
  - CSRF/cookie vẫn cho phép write: `kernel.ts:39-46`; `auth/src/index.ts:31-34` `sameSite: "none"`, `secure`, `httpOnly`
  - Runbook `:110` deploy không bước pause traffic; `:147-148` worker logs/tail — Worker live
  - `plan.md:171-172` reject “immutable mutation audit trail”
- **Suggested fix:** Quiesce = (1) stop Worker / unbind DB hoặc CF Access deny-all trừ operator, (2) `COUNT(*)` stable 2 lần, (3) bookmark, (4) restore, (5) verify, (6) mới enable. Cấm `alchemy deploy` giữa restore và verify (deploy re-apply migration, phá evidence). Ghi RPO = “writes sau bookmark **mất**, không replay” — đúng sự thật vì không có audit trail.

---

## Finding 9: Evidence path tự rò ID/secret — runbook vs Phase 2 mâu thuẫn

- **Severity:** Medium
- **Location:** Phase 2 Requirements “command references (without IDs/secrets)” vs runbook provision
- **Flaw:** Phase 2 cấm ID/secret trong runbook update. Runbook hiện **bắt** record staging D1 name/ID trong release evidence, rồi “ID stays out of GitHub”. Sign-off table trống. Không allowlist field được ghi (COUNT, PRAGMA, duration) vs cấm (UUID, token, email, SQL row). Optional script + `wrangler d1 list` in UUID. Operator làm đúng runbook `:98` là fail Phase 2 requirement.
- **Failure scenario:** Issue #29 comment dán output `wrangler d1 list` / `time-travel info` (bookmark chứa internal id) / `SELECT * FROM session`. Token + database UUID vào GitHub — đúng thứ inventory bảo “never paste”.
- **Evidence:**
  - Phase 2 Requirements: “command references (without IDs/secrets)”
  - Runbook `:60` “never paste into issues”
  - Runbook `:98-99` “Record the staging D1 name/ID in the release evidence (ID itself stays out of GitHub”
  - Runbook `:169-173` sign-off trống + “screenshots without secrets”
  - `plan.md:111` “credentials never enter the repository or GitHub issue”
- **Suggested fix:** Template evidence: stage name `staging`, `COUNT(*)`, `PRAGMA table_info` column names, RTO seconds, bookmark **cách lấy** (`time-travel info`) không giá trị sống. Redact UUID. Xóa câu “record D1 ID”.

---

## Scout / edge (Phase 2 unsafe nếu bỏ qua)

- Alchemy apply cả folder lúc create — **không** dừng sau 0005. Populated-before-0006 không tồn tại trên staging singleton; Time Travel không fork (CF docs). Empty-pass ≠ populated-pass.
- `d1_migrations` sống **trong** D1: restore lùi ledger; `alchemy deploy` sau restore có thể apply lại 0006 → phá drill.
- `plan.md:11-13` citation chết; implementer mở dotenv tưởng đó là D1 binding.
- `/readyz` (Phase 3) chưa có — Step 4 không được dùng `GET /` (`app.ts:98`) làm kernel/D1 proof.

---

## Recommended actions (Phase 2 only)

1. Đóng edit `0006`. Forward `0007` nếu cần existing-data-safe. Scratch D1 cho populated path; staging hiện tại chỉ restore drill.
2. Cấm copy prod. Synthetic seed. Verify `COUNT`/`PRAGMA` only.
3. Post-restore: wipe `session`; login mới; cấm dump `account`/`session`.
4. Pin D1 staging name; `--remote`; token scoped; deny prod; restore authority điền trước.
5. Quiesce = pause Worker trước bookmark; cấm deploy giữa restore và verify; RPO = mất write.
6. Smoke = Origin + session thật; cấm SQL kernel write; cấm email/password trên staging drill.
7. Cấm DML tay `membership`. Seed sau login, cùng `org_id`.
8. Sửa citation `alchemy.run.ts:41-43`. Stale `plan.md` Phase 1 pending.

---

## Unresolved questions

- Staging live `d1_migrations` đã chứa `0006_pink_ender_wiggin`? Plan cấm infer từ source; review này không dump UUID/row. Assumption-destroyer session khác đã live-inspect — Fact Checker không tái query creds.
- Alchemy 2.x sau Time Travel: diff `d1_migrations` live hay tin `Cloudflare.state()`? Source trong repo không chứng minh. Treat as stop-condition đến khi operator đo.
- CF account Free vs Paid Time Travel window (7d/30d) — không có trong repo.

Status: DONE
Summary: Phase 2 không an toàn để execute: restore hồi sinh session/OAuth token, “copy” mở kênh PII, Time Travel không pin target, nhánh sửa 0006 là schema supply-chain, không quiesce, smoke có thể bypass CSRF/authz.
Concerns/Blockers: Đóng edit-0006; cấm copy prod; wipe session sau restore; pin staging D1 + `--remote`; spec quiesce/smoke Origin trước khi implement.
