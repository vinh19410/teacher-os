# Red-team: Failure Mode Analyst — Phase 2 D1 migration safety

- Type: red-team (Murphy / recovery / race / rollback)
- Date: 2026-08-20
- Plan: `plans/260819-2034-production-readiness/`
- Role: Flow Tracer — `alchemy deploy` → D1 Time Travel → kernel write/reload
- Scope: ISSUE 29 = Phase 2 only. Plan review, không code, không lint/test.
- Verdict: **NO-GO as written.** Drill hiện tại không chứng minh được upgrade populated `comment_bank`, restore không bị deploy hoàn tác, hay write-quiesce. Implementer sẽ improvise trên D1 thật.

## Code Review Summary

### Scope
- Files: `plans/260819-2034-production-readiness/plan.md`, `phase-02-d1-migration-safety-and-recovery-drill.md`, `phase-01-production-configuration-and-support-runbook.md`, `docs/production-release-runbook.md`, `packages/db/src/migrations/0005_mature_sasquatch.sql`, `packages/db/src/migrations/0006_pink_ender_wiggin.sql`, `packages/infra/alchemy.run.ts`, `apps/server/src/app.ts`, `apps/server/src/routes/kernel.ts`, `apps/server/src/routes/reporting/index.ts`
- LOC: plan Phase 2 ~50 dòng; runbook không có restore/quiesce/smoke kernel
- Focus: 8 failure mode được giao + đường đi thật
- Scout findings: staging đã apply 0006 (empty); Time Travel không fork; không maintenance mode; không wrangler.toml; bootstrap sau restore tạo org mới

### Overall Assessment

Phase 2 bảo “prove existing-data upgrade and restoration”. Live path không hỗ trợ claim đó. `0006` là `ALTER TABLE ... ADD ... NOT NULL` không DEFAULT + unique index. Staging Phase 1 đã deploy full ledger lên D1 trống. Restore in-place ghi đè, rồi `alchemy deploy` apply lại migration pending. Quiesce/smoke/FK check là chữ, không phải lệnh. Murphy thắng.

### Critical Issues

#### F1. `0006` ADD NOT NULL không DEFAULT — populated `comment_bank` chết; empty path qua CI không chứng minh gì

- **Severity:** Critical
- **Location:** `packages/db/src/migrations/0006_pink_ender_wiggin.sql:1`; schema `packages/db/src/schema/comment-bank.ts:19`; Phase 2 step 2–4
- **Flaw:** SQL hiện tại:

```sql
ALTER TABLE `comment_bank` ADD `operation_id` text NOT NULL;
```

SQLite cấm ADD COLUMN NOT NULL nếu không có DEFAULT khác NULL ([lang_altertable.html §4](https://www.sqlite.org/lang_altertable.html)). Bảng có row → `Cannot add a NOT NULL column with default value NULL`. Kernel test apply toàn bộ migration trên DB **trống** (`apps/server/src/kernel.test.ts:46`) rồi mới INSERT kèm `operationId` (`:1006-1011`). CI không bao giờ đi path populated-before-0006.

- **Failure scenario:** Operator seed 2 comment trên schema 0005, `alchemy deploy` apply `0006`. Deploy đỏ. D1 kẹt. Forward-only: không sửa file đã apply. Plan bảo “make pending migration existing-data-safe” nhưng không ghi SQL 12-step (ADD nullable → backfill unique → NOT NULL/index). Implementer copypaste `0006` hiện tại.
- **Evidence:**
  - `0005` tạo `comment_bank` không `operation_id` (`0005_mature_sasquatch.sql:1-8`)
  - `0006` ADD NOT NULL, 0 DEFAULT (`0006_pink_ender_wiggin.sql:1`)
  - Snapshot 0006 `notNull: true`, không default (`0006_snapshot.json:649-654`)
  - Phase 1 đã `alchemy deploy --stage staging` (`phase-01-...md:46`, journal 2026-08-20) → staging **đã** chạy 0006 trên bảng trống. Path “populated survive upgrade” không tồn tại trên target rehearsal đã chốt.

#### F2. Unique index `comment_bank_org_operation_uidx` nổ nếu backfill không unique; 2 statement → schema dở

- **Severity:** Critical
- **Location:** `0006_pink_ender_wiggin.sql:1-2`; `comment-bank.ts:27-30`; write path `apps/server/src/routes/reporting/index.ts:60-72`
- **Flaw:** Statement 2: `CREATE UNIQUE INDEX comment_bank_org_operation_uidx ON comment_bank (org_id, operation_id)`. Wave 7 **cố ý** cho phép 2 comment cùng org, khác id (`kernel.test.ts:1073-1091`). Backfill hằng (`''`, `'legacy'`, `org_id`) → UNIQUE fail. Plan chỉ nói “unique backfill values”, không SQL (`id` PK là ứng viên duy nhất hiển nhiên). `--> statement-breakpoint` tách 2 câu. Nếu ALTER xong, INDEX fail: cột `operation_id` đã có, ledger có thể chưa ghi 0006. Retry: duplicate column. Wrangler docs claim rollback khi apply lỗi; Alchemy `migrationsDir` (`alchemy.run.ts:41-43`) **không** phải `wrangler d1 migrations apply`. Không có bằng chứng Alchemy bọc transaction DDL.
- **Failure scenario:** Implementer `UPDATE comment_bank SET operation_id = 'backfill'`. Index fail. Deploy loop. Staging/prod schema ≠ `_journal.json`. Kernel POST `onConflictDoNothing` trên `(org_id, operation_id)` (`reporting/index.ts:69-71`) giả định index tồn tại — miss index thì idempotency chết, duplicate rows.
- **Evidence:** Test append 2 text giống, 2 `operationId` khác, 2 row (`kernel.test.ts:1075-1091`). Schema unique chỉ `(orgId, operationId)`, không unique `text`.

#### F3. Staging đã apply `0006` — decision tree Phase 2 tự NO-GO hoặc tạo ledger phân nhánh

- **Severity:** Critical
- **Location:** Phase 2 step 1–2; Phase 1 success; runbook deploy
- **Flaw:** Step 2: nếu 0006 chưa apply env nào “history must stay compatible” thì **sửa** 0006; nếu đã apply **và** DB khác còn data pre-0006 → NO-GO copy/rebuild-and-swap. Phase 1 đã apply 0006 lên staging empty. Dev default `dev_<user>` cũng apply qua `alchemy deploy` không `--stage` (README `:108-113`). Sửa file 0006 sau khi staging đã ghi tag vào D1: Alchemy/Wrangler track **filename**, không hash. Staging giữ SQL cũ. Prod lần đầu apply SQL mới. Cùng tag, 2 SQL. “Never infer from source alone” (`phase-02:34`) đúng — rồi plan không chỉ bảng ledger runtime (`d1_migrations` Wrangler vs `__drizzle_migrations` drizzle migrator trong test). Repo 0 reference `d1_migrations`.
- **Failure scenario:** (a) Sửa 0006 → staging không re-apply, populated drill giả trên staging post-0006 INSERT (không phải upgrade). (b) Không sửa → populated apply fail như F1. (c) `alchemy destroy --stage staging` + deploy lại: mất bookmark Time Travel, worker staging chết, không còn “representative history”. Time Travel **không fork/clone** ([docs](https://developers.cloudflare.com/d1/reference/time-travel/)).
- **Evidence:** `phase-01-...md:46` staging deployed. `alchemy.run.ts:41-43` apply cả thư mục migrations. `_journal.json:47-53` tag `0006_pink_ender_wiggin` đã vào source ledger.

#### F4. Restore rồi `alchemy deploy` apply lại `0006` — hoàn tác restore

- **Severity:** Critical
- **Location:** Runbook `:110-113`; Phase 2 step 5; Cloudflare Time Travel restore in-place
- **Flaw:** Đường đi:

  1. `wrangler d1 time-travel restore <name> --bookmark=...` — **destructive overwrite**, hủy query in-flight ([Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)).
  2. Bookmark pre-0006 → bảng `d1_migrations` cũng rollback.
  3. `cd packages/infra && pnpm alchemy deploy --stage staging` (runbook `:95`, `:107`, `:137`) — “Alchemy applies D1 migrations as part of the deploy.”
  4. 0006 pending → apply lại SQL độc (F1). Restore schema/data bị deploy nuốt.

  Plan không cấm deploy sau restore, không cấm `--stage` thiếu, không ghi “restore xong thì **không** deploy cho đến khi ledger khớp bookmark”. Code rollback = `alchemy deploy --stage prod` (runbook `:135-137`) — đúng lệnh hoàn tác data restore trên prod.

- **Failure scenario:** Drill “pass”: restore pre-migration → operator “verify” bằng deploy staging → 0006 chạy lại trên data restored. Populated → deploy fail, D1 nửa schema. Empty → restore vô nghĩa, state = post-0006 như trước. Prod incident: restore data rồi “redeploy last good commit” theo runbook → migration forward lại, RPO vỡ.
- **Evidence:** Runbook `:110` “Alchemy applies D1 migrations as part of the deploy.” Forward-only `:111-113`. Time Travel: in-place, không clone. `packages/infra/package.json:9` `"deploy": "alchemy deploy"` — **không** bake `--stage`.

### High Priority

#### F5. Write-quiesce là fiction — 0 maintenance mode, restore vẫn nhận POST

- **Severity:** High
- **Location:** Phase 2 step 5 “Quiesce mutations by the approved maintenance procedure”; AC `:44`; grep toàn repo
- **Flaw:** “Approved maintenance procedure” không tồn tại. Runbook không có maintenance, drain, read-only, feature flag. App: mọi POST kernel chỉ chặn Origin + JSON (`kernel.ts:42-51`). Worker staging/prod vẫn bind D1 lúc restore. Cloudflare: restore hủy in-flight, **không** chặn request mới sau bookmark. Write giữa bookmark và restore biến mất. Write sau restore (trước “quiesce xong”) nằm trên data restored rồi bị restore-lần-2 xóa. Không outbox — plan parent **reject** audit trail (plan.md finding 12). “Reconcile writes since bookmark” = GV nhớ lại. RPO đo trên staging trống = số giả.
- **Failure scenario:** Drill không quiesce → kernel POST `/api/comment-bank` / `/api/students` (Origin đúng) trong lúc restore → 500 in-flight, row sau restore mất. Prod: 1 GV ghi điểm danh/học phí lúc restore. AC “write-quiesce” xanh vì operator không ghi — không phải vì hệ chặn.
- **Evidence:** Grep `quiesce|maintenance|READ_ONLY` trong `apps/` + `packages/` = 0 (chỉ chữ plan/issue). `kernel.ts:549` comment-bank mounts sau Origin guard — guard **không** phải maintenance. `app.ts:98` `GET /` liveness, không drain.

#### F6. `PRAGMA foreign_key_check` không nằm trên đường Alchemy; plan không có lệnh

- **Severity:** High
- **Location:** Phase 2 req `:19`, step 4 `:37`; `alchemy.run.ts:41-43`; migrations SQL
- **Flaw:** Alchemy chỉ trỏ `migrationsDir`. 0 file SQL gọi `PRAGMA foreign_key_check`. SQLite 12-step ALTER **bắt** check sau rebuild ([§8 step 10](https://www.sqlite.org/lang_altertable.html)). D1 **bật FK mọi query** ([foreign-keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)) — không thay thế check dữ liệu sẵn có / import. `comment_bank.org_id` FK `organization` ON DELETE cascade (`0005:7`). Orphan không bị Alchemy phát hiện. Plan bắt operator chạy check, không ghi `wrangler d1 execute <name> --remote --command "PRAGMA foreign_key_check;"`. Thiếu `--remote` → local persist (docs import: bỏ `--remote` = local). Không `wrangler.toml` (biome ignore `wrangler.jsonc`; source 0 file).
- **Failure scenario:** Implementer skip check, hoặc chạy local, ghi “FK OK”. Staging orphan im lặng đến lúc kernel join. `loadReports` innerJoin student (`snapshot.ts` / reporting loaders) nuốt row; comment_bank loader **không** join org (`reporting/loaders.ts:52-61`) — orphan comment vẫn hiện.
- **Evidence:** Grep `foreign_key_check` = chỉ `phase-02:19,37`. `packages/db/**/*.sql` 0 PRAGMA.

#### F7. Auth/kernel smoke không spec — bootstrap sau restore tạo org rỗng; Origin 403; dễ đụng prod

- **Severity:** High
- **Location:** Phase 2 step 4–5 “auth bootstrap and kernel write/reload”; `app.ts:39-80`; `kernel.ts:42-51,143-147`; `packages/auth/src/index.ts:26-27`
- **Flaw:** 0 curl/HTTP contract. Đường đi thật:

  | Entry | Guard | Side effect |
  |---|---|---|
  | `GET /` | không | liveness `"OK"` — không đụng D1 (`app.ts:98`) |
  | `GET /api/kernel` | session cookie | miss session → 401; 0 membership → **INSERT org+membership** (`app.ts:60-73`) rồi snapshot rỗng |
  | `POST /api/comment-bank` | Origin === `CORS_ORIGIN` + JSON | miss Origin → 403 (`kernel.ts:44-46`); write đổi D1 restored |
  | Google OAuth | staging `APP_DOMAIN` unset, workers.dev | runbook Google URI chỉ production (`runbook:74-76`); staging callback có thể 404 |
  | email/password | `enabled: true` (`auth/src/index.ts:26-27`) | implementer sign-up thẳng staging **hoặc** prod |

  Smoke “write/reload” **sau** restore tự ghi đè bằng chứng restore. Bookmark trước bootstrap + GET `/api/kernel` với session còn sống (account table restore lệch session) → org mới, workspace trống — đúng failure milestone này cố chặn (plan GO #3, `data-provider.tsx:73-79`).

- **Failure scenario:** Operator restore → mở app staging → Google fail (redirect chưa đăng ký) → curl prod `api.<domain>/api/kernel` cookie UAT → bootstrap/smoke trên **pilot D1**. Hoặc Google staging OK, membership 0 → org mới, “smoke pass”, data restore bị bỏ. POST không header Origin → 403, operator nghĩ restore hỏng.
- **Evidence:** Phase 2 0 path HTTP, 0 header, 0 stage URL. Runbook post-deploy smoke chỉ browser production (`:115-127`), không kernel write, không staging. CSRF Origin bắt buộc (`kernel.ts:42-46`).

#### F8. Rehearsal đụng nhầm D1 — default stage, binding vs name, `--remote` thiếu, Time Travel window

- **Severity:** High
- **Location:** README `:108-113`; runbook `:39-44,95-100`; Alchemy id `"database"`; Time Travel limits
- **Flaw:**
  1. Default stage = `dev_<username>`, **không** staging. `pnpm deploy` / `alchemy deploy` không `--stage` → D1 cá nhân. `ALCHEMY_STAGE=prod` trong env operator → prod.
  2. Resource Alchemy id = `"database"` (`alchemy.run.ts:41`). Wrangler Time Travel cần **database name** vật lý, không binding Worker `DB`. Cloudflare cảnh báo binding ≠ name ([migrations](https://developers.cloudflare.com/d1/reference/migrations/)). Repo 0 `wrangler.toml`. Plan cấm paste D1 id vào GitHub — operator đoán tên.
  3. Time Travel restore in-place, 30 ngày Paid / **7 ngày Free** ([limits](https://developers.cloudflare.com/d1/platform/limits/)). Bookmark già → restore fail. Plan 0 bước `time-travel info` trước restore, 0 ghi plan account (Free vs Paid). Max 10 restore / 10 phút — retry drill đụng limit.
  4. “Create/copy representative DB”: Time Travel **chưa** clone. `d1 export --remote` **block request khác**. Copy từ prod = rehearsal trên data cấm (`runbook:43-44`). Copy không được → populated drill bịa trên staging post-0006 (F3).
- **Failure scenario:** `npx wrangler d1 time-travel restore database --bookmark=...` trúng nhầm / fail / local. `alchemy deploy` quên `--stage staging` lúc “re-smoke”. Bookmark Phase 1 già hơn cửa sổ Free. Export prod “cho đại diện” → stall kernel prod + data PII vào staging.
- **Evidence:** README `:108` default `dev_<username>`. Runbook table stage `:39-44`. 0 wrangler.toml. Time Travel: no clone, bookmark >30d invalid, restore overwrite.

### Medium Priority

#### F9. Reconciliation writes-since-bookmark không có nguồn sự thật

- **Severity:** Medium (pilot 1 GV) / High khi UAT song song drill
- **Location:** Phase 2 step 5–6, AC `:45`; plan.md reject audit trail
- **Flaw:** Không mutation log, không outbox, session/lesson/invoice/comment chỉ nằm D1. Restore xóa write sau bookmark. “Document how writes are reconciled” không thể operationalize ngoài “nhập lại”. Đo RPO/RTO trên staging empty không transfer prod. `/readyz` là Phase 3 — Phase 2 smoke không có probe D1 besides kernel (và `GET /` không query DB).
- **Evidence:** plan.md `:171` reject “immutable mutation audit trail”. `GET /` text OK (`app.ts:98`).

### Low Priority

- Journal 2026-08-20 ghi Phase 2 = “secret rotation / uptime / rollback dry-run” — lệch `phase-02-d1-migration-safety-and-recovery-drill.md`. Noise cho implementer.
- Runbook `cp .env.example .env` (`:92`) — `.env.example` không có trong `packages/infra/`. Operator tự bịa env, dễ set nhầm `APP_DOMAIN` lúc drill staging.

### Edge Cases Found by Scout

- Empty vs populated: empty 0006 **có thể** pass (kernel migrate in-memory). Populated là path duy nhất Phase 2 claim, không dựng được trên staging hiện tại.
- Partial 0006: ADD column xong, unique fail, retry duplicate column.
- Restore bookmark trước bootstrap + session còn → org mới, snapshot rỗng, milestone GO #3 fail trên chính drill.
- `wrangler d1 execute` không `--remote` = local, FK check giả.
- `d1 export` block queries — “copy representative” = outage.
- POST kernel 15s abort (`repos/kernel.ts:156`) overlapping restore cancel → client `unknown` write (Phase 5 territory) trong lúc Phase 2 “reconcile”.

### Positive Observations

- Forward-only + cấm sửa historical SQL sau live apply là đúng hướng (plan.md design; Phase 2 step 2 NO-GO). Decision tree không đi hết vì staging **đã** apply 0006.
- Cấm rehearsal trên prod D1 (`runbook:43-44`) đúng. Thiếu cơ chế kỹ thuật (stage flag bắt buộc, dry-run name echo) để enforce.

### Recommended Actions

1. **Dừng sửa `0006` trên staging đã apply.** Nếu populated path vẫn in-scope: D1 **mới**, apply `0000`–`0005` only, INSERT ≥2 `comment_bank` cùng `org_id`, rồi apply SQL **mới** (file `0007_*` hoặc 0006 chỉ khi ledger runtime chứng minh **zero** env đã apply). Backfill = `id` (PK), không hằng. ADD nullable → UPDATE → unique index → siết NOT NULL bằng table-rebuild SQLite 12-step. `PRAGMA foreign_key_check` trong cùng script, `--remote`, echo database name.
2. **Tách 2 drill:** (A) upgrade 0005-populated → schema mới trên D1 throwaway. (B) Time Travel restore **post**-schema, bookmark lấy bằng `time-travel info` ngay trước seed, verify **read** thấy row pre-bookmark, **không** thấy row post-bookmark. Cấm `alchemy deploy` giữa restore và verify.
3. **Quiesce thật:** unbind/disable Worker staging **trước** restore, hoặc chặn POST (maintenance flag). Ghi lệnh. Không “ask the teacher”.
4. **Spec smoke:** `GET /` ≠ kernel. Staging: cookie + `Origin: <CORS_ORIGIN>` ; `GET /api/kernel` expect org **đã seed**, không org bootstrap mới. Write smoke **trước** bookmark, không sau restore. Cấm email/password trên prod. Cấm URL `api.<prod-domain>` trong Phase 2.
5. **Nhận diện D1:** runbook bước copy **name** (không UUID) từ `alchemy plan --stage staging` / dashboard, paste vào mọi wrangler lệnh; require `--stage staging` và `--remote`; fail closed nếu name không chứa `staging`.
6. **Cửa sổ Time Travel:** ghi Paid vs Free (30d/7d); `time-travel info` phải succeed trước restore; không dùng bookmark Phase 1 nếu drill trễ.
7. **RPO:** nói thẳng “writes since bookmark lost; re-enter manually”. Đừng giả reconciliation.

### Metrics
- Type Coverage: n/a (plan review)
- Test Coverage: kernel tests 0 case 0005-populated → 0006
- Linting Issues: n/a (bỏ qua theo brief)

### Unresolved Questions

- Account Cloudflare của staging: Workers Free hay Paid? Cửa sổ Time Travel 7 hay 30 ngày?
- Staging D1 hiện `SELECT name FROM d1_migrations` đã có `0006_pink_ender_wiggin` chưa? Plan cấm infer từ source; review này không query live D1 (không creds).
- Alchemy beta.72 apply migration: transaction per file hay per statement? `node_modules` không có trong worktree — chưa đọc source Alchemy.
- Physical D1 name do Alchemy đặt cho stage `staging` / `prod` / `dev_<user>` — không có trong repo (đúng, secret-adjacent). Không có echo-name trong runbook.

---

Status: DONE
Summary: Phase 2 không đi được trên đường thật: `0006` ADD NOT NULL không DEFAULT, staging đã apply empty, restore in-place bị `alchemy deploy` apply lại, quiesce/smoke/FK check không tồn tại trong code/runbook.
Concerns/Blockers: Implement Phase 2 as-written sẽ rehearsal sai D1 hoặc ghi “pass” trên empty path; populated upgrade và restore-vs-redeploy vẫn tối. Sửa plan trước khi cook.
