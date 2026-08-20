# Red-team: Assumption Destroyer + Scope Auditor

Plan: `plans/260819-2034-production-readiness/phase-02-d1-migration-safety-and-recovery-drill.md`
Date: 2026-08-20
Lens: Assumption Destroyer (skeptic)
Verification role: Scope Auditor — lifetime D1 staging singleton, bookmark, mutation write
Scope: ISSUE 29 = Phase 2 only. Phase 1 completed.

Không khen. Chỉ finding có `file:line`. Không ghi D1 UUID, token, env.

Live inspect (schema/count only, no row content): staging D1 `version=production`, 21 tables kể cả `d1_migrations` + `comment_bank`. List API `num_tables=0` là display bug. Không có D1/Worker `teacher-os-*-prod`. Staging server+web Worker đang live.

---

## Finding 1: Nhánh "sửa 0006 nếu chưa apply" đã chết trên đúng D1 rehearsal

- **Severity:** Critical
- **Location:** Phase 2, Implementation Step 2 + Architecture "forward-only"
- **Flaw:** Load-bearing assumption: `0006` còn editable nếu chưa apply lên env "history must stay compatible". Live ledger staging đã ghi `0006_pink_ender_wiggin.sql`. `comment_bank.operation_id` NOT NULL, không default. Unique index `comment_bank_org_operation_uidx` đã có. Runbook Phase 1 đã cấm sửa migration đã apply. Decision tree thiếu nhánh thực tế: 0006 đã apply trên staging trống, không D1 nào khác, cần chứng minh populated path.
- **Failure scenario:** Operator tin Step 2, sửa SQL 0006 (thêm backfill). `d1_migrations` khóa theo **tên file**, không hash. `alchemy deploy --stage staging` skip 0006. Empty path "pass" trên SQL cũ. Prod D1 mới apply SQL đã sửa — hai env cùng tag, khác SQL. Hoặc operator destroy staging để apply SQL mới: mất Time Travel history, drill recovery không còn target.
- **Evidence:**
  - Plan Step 2: "if `0006` has not been applied to any environment whose history must stay compatible, make that pending migration existing-data-safe"
  - `0006_pink_ender_wiggin.sql:1` — `ALTER TABLE comment_bank ADD operation_id text NOT NULL` (no default, no backfill)
  - Live `d1_migrations.name` gồm `0000`…`0006_pink_ender_wiggin.sql`
  - Live `PRAGMA table_info(comment_bank)`: `operation_id TEXT notnull=1 dflt_value=null`
  - Live index: `comment_bank_org_operation_uidx`
  - Runbook `docs/production-release-runbook.md:110-113` — "never edit, reorder, or delete an applied migration file"
  - CF migrations: applied set = files recorded in `d1_migrations` (`developers.cloudflare.com/d1/reference/migrations`)
  - Không có Worker/D1 `teacher-os-*-prod` (list live)
- **Suggested fix:** Đóng nhánh edit-0006. Coi staging ledger đã apply 0006 = frozen. Populated path = reconstruct pre-0006 (xem Finding 2) rồi **0007 forward** với backfill unique, không đụng file 0006. NO-GO nếu ai đó sửa 0006 trên disk.

Điều kiện fail success: "Ledger determines a valid repair or a NO-GO" — tree hiện tại không map state live → operator chọn repair invalid.

---

## Finding 2: Empty + populated không chứng minh được trên một D1 staging hiện có

- **Severity:** Critical
- **Location:** Phase 2, Step 3–4 + Success Criteria bullet 1
- **Flaw:** Assumption: một staging DB đủ cho cả empty và populated `comment_bank` upgrade. Lifetime: staging D1 là **singleton**. Time Travel restore ghi đè in-place, **không clone/fork**. History thật: 0000–0006 apply một shot lúc create (Phase 1 deploy). `comment_bank` count=0. State "0005 + rows, chưa 0006" **chưa từng tồn tại**. Bookmark không invent history. Alchemy deploy luôn apply cả `migrationsDir` — không có "stop after 0005".
- **Failure scenario:** Operator Time Travel "về trước 0006". Cùng phút với 0005 (cùng `alchemy deploy`) → bookmark không tách được. Seed row rồi apply 0006 trên DB đã có `operation_id` → ALTER ADD COLUMN fail hoặc no-op, unique index đã có. Empty path đã xảy ra trong quá khứ; populated path không replay được. Success "both survive" tick bằng empty-only. Pilot lần đầu có comment_bank rows thì 0006-equivalent nổ.
- **Evidence:**
  - Plan Success: "Empty and populated representative rows both survive the selected upgrade path"
  - Plan Step 3: "Create/copy a non-production representative database"
  - Plan Step 4: "Apply the selected path against both empty and populated `comment_bank`"
  - Live: `SELECT COUNT(*) FROM comment_bank` = 0; 0006 đã trong ledger
  - CF Time Travel: "overwrite the database in place"; "does not yet allow you to clone or fork" (`d1/reference/time-travel`)
  - Granularity: "any minute within the last 30 days" — không phải per-statement
  - Apply path: `packages/infra/alchemy.run.ts:41-43` `migrationsDir` toàn bộ folder; runbook `:110` "Alchemy applies D1 migrations as part of the deploy"
  - Runbook provision = `alchemy deploy --stage staging` (`:90-96`) — create empty, không copy
  - Schema 0005 tạo table không `operation_id` (`0005_mature_sasquatch.sql:1-8`); 0006 add NOT NULL (`0006_pink_ender_wiggin.sql:1`)
- **Suggested fix:** Tách 2 lifetime: (A) D1 scratch apply 0000–0005 only (tạm move 0006 ra ngoài `migrationsDir` **không** commit), seed ≥2 `comment_bank` rows, put 0006/0007 lại, apply; (B) staging hiện tại chỉ dùng cho restore drill. Ghi rõ: Time Travel không phải copy. Cấm coi empty-pass trên staging hiện tại là populated-pass.

Điều kiện fail success: populated upgrade chưa từng chạy trên data thật → criterion 1 không thể pass trung thực.

---

## Finding 3: Alchemy apply và wrangler Time Travel đánh cùng một D1, hai lifetime state

- **Severity:** Critical
- **Location:** Phase 2 Architecture + Step 5 + runbook Deploy
- **Flaw:** Assumption: Alchemy = apply, wrangler Time Travel = restore, không đánh nhau. `d1_migrations` **sống trong D1** (restore cuốn ledger). Alchemy state **ngoài D1** (`Cloudflare.state()`, Worker `alchemy-state-store` live). Restore in-place hủy query đang bay. Không `wrangler.toml` trong source — restore cần tên D1 Alchemy generate (suffix đổi nếu destroy). Redeploy sau restore là path duy nhất nếu quiesce = unbind Worker.
- **Failure scenario:** Bookmark post-0006 + seed. Restore về bookmark. `d1_migrations` lùi. Operator `alchemy deploy --stage staging` để "bật lại" Worker/smoke. Alchemy đọc `migrationsDir`, thấy 0006 absent trên D1 đã restore → apply lại 0006 (và mọi migration sau bookmark) → **phá evidence restore**. Ngược lại: Alchemy tin resource đã migrate (state store) → skip SQL, schema/data lệch code. Drill "pass" không phải state đã restore.
- **Evidence:**
  - Plan Architecture: "Alchemy points D1 at `packages/db/src/migrations` (`packages/infra/alchemy.run.ts:11-13`)" — line thực `alchemy.run.ts:41-43`
  - Plan Architecture: "platform provides D1 recovery/Time Travel"
  - `alchemy.run.ts:72-77` — `Alchemy.Stack(..., { state: Cloudflare.state() })` tách khỏi D1
  - Live: staging D1 có table `d1_migrations`; Worker `alchemy-state-store` tồn tại độc lập
  - Live: staging server+web Worker bound, created cùng lúc D1
  - Runbook `:110` deploy apply migrations; `:137` rollback code = `alchemy deploy`
  - Không `wrangler.toml` (researcher `plans/reports/researcher-2026-08-18-backend-d1-auth.md:103`; biome ignore `wrangler.jsonc` `biome.json:27`)
  - CF restore: destructive in-place; in-flight cancelled; undo bookmark khác
- **Suggested fix:** Runbook cấm `alchemy deploy` giữa restore và verify ledger/data. Verify bằng `wrangler d1 execute`/`PRAGMA`/`SELECT COUNT` **trước** mọi deploy. Nếu phải redeploy: expect re-apply; đo schema trước/sau; ghi conflict này là stop condition. Pin D1 name; destroy = mất bookmark.

Điều kiện fail success: "Restore procedure is executed once with a recorded bookmark" — post-restore deploy biến bookmark thành no-op.

---

## Finding 4: Quiesce không tồn tại; Worker staging đang ghi vào đúng D1 drill

- **Severity:** High
- **Location:** Phase 2 Step 5 + Success "write-quiesce" + runbook (thiếu section)
- **Flaw:** Assumption: "approved maintenance procedure" chặn mutation trước restore. Runbook không có maintenance/quiesce/drain. App không có flag. Kernel POST sống nếu có session + Origin (`kernel.ts:42-50`). Staging Worker live. Time Travel hủy in-flight ≠ chặn POST mới. Scope: mutation write và restore share lifetime singleton D1.
- **Failure scenario:** Operator bookmark, "quiesce" = không click UI. Staging URL workers.dev vẫn nhận POST (sign-up, kernel, bootstrap). Restore chạy. Write mới commit sau bookmark / xen giữa restore. RPO đo được ≠ RPO thật. Runbook ghi RPO giả.
- **Evidence:**
  - Plan Step 5: "Quiesce mutations by the approved maintenance procedure"
  - Plan Success: "write-quiesce and post-restore kernel/auth smoke pass"
  - Grep `quiesce|maintenance` trong `docs/production-release-runbook.md`: 0 hit
  - `apps/server/src/routes/kernel.ts:42-50` — POST chỉ check Origin + JSON; không drain
  - `apps/server/src/app.ts:96-99` — `/api/*` luôn bootstrap; `GET /` không chặn write
  - Live: Worker `teacher-os-server-staging-*` + `teacher-os-web-staging-*` modified cùng ngày provision
  - CF: restore cancels in-flight, không pause Worker
- **Suggested fix:** Procedure cụ thể trước restore: unbind D1 khỏi Worker **hoặc** disable route write (không có code → phải unbind), confirm zero write (COUNT + log), rồi restore. Redeploy chỉ sau verify (Finding 3). Ghi lệnh không chứa ID.

Điều kiện fail success: RPO/RTO trong runbook không phải observed bound nếu write không dừng.

---

## Finding 5: Post-restore auth/kernel smoke tự ghi đè bookmark — không có /readyz

- **Severity:** High
- **Location:** Phase 2 Step 3–5 + Success bullet 2; Phase 3 `/readyz` pending
- **Flaw:** Assumption: smoke auth/kernel sau restore chứng minh data đã về bookmark, không cần `/readyz`, không cần Google prod. Step 3 bookmark **trước test**. Step 4 mới auth bootstrap. Restore về bookmark → user/session/org = 0 (live hiện tại: users=0, orgs=0, sessions=0). Smoke bắt buộc sign-in/sign-up. `bootstrapMiddleware` INSERT org+membership khi membership rỗng. `GET /` chỉ `"OK"`, không đụng D1. `/readyz` là Phase 3. Email/password bật — Google không bắt buộc — nhưng **mọi** auth path đều write.
- **Failure scenario:** Restore xong. Operator sign-up email (hoặc Google workers.dev — runbook chỉ đăng ký redirect prod). GET `/api/kernel` 200. Tick "smoke pass". Bookmark contents không được đọc: org mới không có trong bookmark. Liveness `GET /` 200 kể cả D1 trống/sai schema. Họ chứng minh "app ghi được sau restore", không phải "restore giữ data".
- **Evidence:**
  - Plan Step 3: "record a recovery bookmark before testing"
  - Plan Step 4: "auth bootstrap and kernel write/reload"
  - Plan Success: "post-restore kernel/auth smoke pass"
  - `apps/server/src/app.ts:59-70` — first authenticated non-auth request INSERT organization+membership
  - `apps/server/src/app.ts:98` — `app.get("/", (c) => c.text("OK"))`
  - `apps/server/src/routes/kernel.ts:143-146` — GET `/kernel` 401 nếu không `kernelCtx`
  - Phase 3 `phase-03-add-database-readiness-endpoint.md:14-24` — `/readyz` chưa có; cấm bootstrap
  - `packages/auth/src/index.ts:19-27` — Google + `emailAndPassword.enabled: true`
  - `apps/web/src/components/sign-in-form.tsx:30-31` email sign-in; `:64` Google button
  - Runbook smoke Google trên `https://app.<domain>` (`:115-121`); staging `APP_DOMAIN` unset (`:38-41`, `alchemy.run.ts:16`)
  - Live counts: users=0, orgs=0, sessions=0, memberships=0, comment_bank=0
- **Suggested fix:** Tách 2 verify: (1) read-only SQL so khớp COUNT/hash với pre-restore (secret-free); (2) smoke auth **sau** khi đã ghi nhận restore khớp. Seed user+session **vào** representative data trước bookmark nếu muốn GET `/kernel` read-only. Không dùng `GET /` làm D1 proof. Không đợi Phase 3 nhưng cũng không giả `/readyz`.

Điều kiện fail success: smoke pass không imply restore đúng → criterion 2 giả.

---

## Finding 6: Kernel read không chứng minh 0006; write path mới đụng `operation_id`

- **Severity:** High
- **Location:** Phase 2 Step 4 "kernel write/reload" + Success "rows survive"
- **Flaw:** Assumption: kernel smoke = upgrade path đã an toàn với existing data. Loader SELECT `id, tag, text` — **bỏ** `operation_id`. GET `/kernel` / GET `/comment-bank` xanh dù cột chưa có. Unique `(org_id, operation_id)` chỉ fail lúc INSERT. "Kernel write" có thể là POST `/students` — không đụng `comment_bank`.
- **Failure scenario:** Populated 0006 fail (NOT NULL no default). Schema đứng ở 0005. GET kernel 200, comment list hiện rows. Tick "survive". POST comment-bank (grade modal) 500/constraint. Pilot mất append comment. `PRAGMA foreign_key_check` cũng không bắt unique/NOT NULL backfill.
- **Evidence:**
  - Plan Step 4: "validate ledger, `PRAGMA foreign_key_check`, auth bootstrap and kernel write/reload"
  - `apps/server/src/routes/reporting/loaders.ts:54-58` — select không gồm `operation_id`
  - `apps/server/src/routes/reporting/index.ts:60-67` — INSERT set `operationId: body.data.operationId`
  - `packages/api/src/contracts.ts:89-91` — `operationId` uuid bắt buộc trên create
  - `packages/db/src/schema/comment-bank.ts:19,27-29` — `operationId` notNull + unique index
  - `0006_pink_ender_wiggin.sql:1-2` — ADD NOT NULL + unique index
- **Suggested fix:** Bắt buộc POST `/api/comment-bank` với `operationId` mới + replay cùng id (200 idempotent) + SELECT `operation_id IS NOT NULL` + unique 2 rows cùng org. Cấm tick bằng GET snapshot.

Điều kiện fail success: "rows survive" pass khi cột/index 0006 không usable.

---

## Finding 7: Inspect-before-edit bị `num_tables=0` + drizzle-kit mù lòa đánh lừa

- **Severity:** High
- **Location:** Phase 2 Step 1 "never infer from source alone" + Related "optional verify script"
- **Flaw:** Assumption: operator inspect được ledger trước khi đụng historical SQL. Wrangler/list API live trả `num_tables=0` cho **mọi** D1 (staging 21 tables, file_size>0). `drizzle.config.ts` driver `d1-http` **không** `accountId`/`databaseId` — không inspect qua drizzle-kit. Không wrangler.toml. Runbook cấm paste D1 id. Optional script chưa có. Operator tin list = empty unmigrated → sửa 0006 (Finding 1).
- **Failure scenario:** `wrangler d1 list` → staging `num_tables=0`. Kết luận 0006 chưa apply. Sửa SQL. Deploy skip. False proof. Plan Step 1 tưởng đã "confirm ledger".
- **Evidence:**
  - Plan Step 1: "Confirm `0005`/`0006` ledger status … never infer from source alone"
  - Plan Related: optional `scripts/verify-d1-release-state.mjs` nếu runbook không chứa check secret-free — file **không tồn tại**
  - `packages/db/drizzle.config.ts:8-14` — `driver: "d1-http"`, zero binding id
  - Live list API: staging `num_tables=0`; `SELECT name FROM sqlite_master WHERE type='table'` = 21 rows gồm `comment_bank`, `d1_migrations`
  - Runbook `:60` "D1 database IDs … never paste into issues"; `:98-99` chỉ ghi "staging D1 exists"
- **Suggested fix:** Runbook lệnh inspect: `SELECT name FROM d1_migrations ORDER BY name;` + `PRAGMA table_info(comment_bank);` + `SELECT COUNT(*) FROM comment_bank;` qua wrangler execute (tên DB, không UUID trong git). Cấm tin `num_tables` từ list. Script secret-free **bắt buộc**, không optional.

Điều kiện fail success: Step 1 fail đóng → mọi repair decision dựa trên ledger giả.

---

## Finding 8: Bookmark không phải snapshot song song; destroy staging xóa cả cửa sổ 30 ngày

- **Severity:** Medium
- **Location:** Phase 2 Step 3 + runbook Provision staging destroy + CF Time Travel limits
- **Flaw:** Assumption: "record a recovery bookmark" là evidence RPO bền. Bookmark = pointer vào history **cùng** D1, invalid sau 30 ngày (7 ngày Free). `alchemy destroy --stage staging` tạo D1 **mới** (tên suffix mới) — history cũ chết. Step 3 "copy" không tồn tại. Drill empty, populated, restore tuần tự trên singleton: restore bước 5 xóa proof bước 4 trừ khi export SQL ra ngoài D1.
- **Failure scenario:** Làm populated upgrade, tick. Restore về bookmark pre-test để drill RTO. Populated proof biến mất. Ghi runbook "cả hai path pass" từ nhớ. Hoặc destroy/recreate staging giữa chừng vì 0006 edit (Finding 1) → bookmark file trong issue trỏ DB không còn. Pilot 31 ngày sau: bookmark rehearsal invalid, restore prod theo runbook fail.
- **Evidence:**
  - Plan Step 3: "Create/copy … record a recovery bookmark before testing"
  - Plan Step 5: restore "to the recorded point" rồi "document how writes since the bookmark are reconciled"
  - Runbook `:99-100` — `alchemy destroy --stage staging` "never touches prod" (cũng xóa staging history)
  - CF: bookmarks >30 ngày invalid; no fork/copy; restore in-place
  - Live D1 `version=production` (Time Travel có) nhưng chỉ 1 staging DB
- **Suggested fix:** Export schema+count (không PII) ra evidence **trước** mỗi restore. Cấm destroy staging cho đến khi Phase 2 sign-off. Bookmark trong runbook = cách lấy (`time-travel info`), không phải giá trị sống mãi. Copy path: D1 thứ hai hoặc export/import, không Time Travel.

Điều kiện fail success: không giữ được đồng thời populated-upgrade evidence và restore evidence trên một lifetime.

---

## Scope Auditor — lifetime map

| State | Instantiation | Lifetime | Isolation | Leak / collision |
|---|---|---|---|---|
| Staging D1 | `Cloudflare.D1.Database("database")` + `--stage staging` | Env singleton | Tên `teacher-os-database-staging-*`; không overlap prod (prod chưa có) | Mọi Step 3–5 mutate cùng object |
| `d1_migrations` | CF/Alchemy apply | Trong D1 | Restore cuốn theo | Edit file 0006 không đổi row đã ghi |
| Alchemy state | `Cloudflare.state()` / Worker `alchemy-state-store` | Account-global store, per-stack | Không nằm trong D1 | Restore D1 ≠ restore Alchemy |
| Time Travel bookmark | `wrangler d1 time-travel info` | Pointer 7–30 ngày, cùng UUID D1 | Không copy | Destroy/recreate → pointer chết |
| Kernel/auth writes | `bootstrapMiddleware` INSERT; POST kernel; better-auth user/session | Request → durable rows trên D1 | Org-scoped sau bootstrap | Smoke sau restore = write mới |
| Staging Workers | Alchemy deploy | Live, bound D1 | Stage suffix | Không quiesce → write xuyên restore |

Không có field/module-level duplicate của bookmark trong app. Plan giả procedure, không giả code state — lỗ là lifetime **ops**, không phải singleton in-process.

---

## Verification Results

- **Tier:** Full (plan 6 phase; review scoped Phase 2) + Scope Auditor
- **Claims checked:** 12
- **Verified:** 10 | **Failed:** 2 | **Unverified:** 1

| Claim | Result |
|---|---|
| 0006 ADD NOT NULL no default/backfill | VERIFIED `0006_pink_ender_wiggin.sql:1` |
| Staging D1 exists, isolated from prod | VERIFIED live name stage `staging`; no prod teacher-os D1 |
| List `num_tables=0` | VERIFIED display bug — sqlite_master 21 tables |
| 0006 chưa apply / còn edit được | FAILED — live `d1_migrations` có 0006 |
| Runbook chưa có RPO/RTO/recovery drill | VERIFIED — grep quiesce/RPO/bookmark = 0 trong runbook |
| Forward-only đã trong runbook | VERIFIED `docs/production-release-runbook.md:110-113` |
| Alchemy `migrationsDir` | VERIFIED `alchemy.run.ts:41-43` (plan cite `:11-13` stale) |
| `/readyz` chưa có | VERIFIED `app.ts:98` liveness only; Phase 3 pending |
| Time Travel clone/copy | FAILED vs plan Step 3 "copy" — CF docs no fork |
| Staging Worker live | VERIFIED list workers staging server+web |
| Alchemy re-apply exact algorithm sau restore | UNVERIFIED source (alchemy D1 module 404); mechanism conflict VERIFIED qua 2 state stores |

Plan `plan.md` phases table vẫn "Phase 1 Pending" trong khi `phase-01-*.md` status completed — stale, không phá Phase 2 success trừ khi operator đợi "Phase 1 provision". Live staging đã có.

---

## Unresolved questions

- Alchemy 2.0.0-beta.72: sau Time Travel, `alchemy deploy` diff `d1_migrations` live hay tin state store? Source path không fetch được trong session này.
- Staging D1 Time Travel có bookmark **trước** 0006 trong cùng phút create không? Không dump bookmark (có thể chứa internal id). Cần operator `time-travel info --timestamp` lúc `created_at` vs `created_at+60s`.
- Workers plan Free vs Paid — cửa sổ 7 vs 30 ngày. Không đọc billing.

---

Status: DONE_WITH_CONCERNS
Summary: Phase 2 gãy trên 3 assumption load-bearing: 0006 đã apply trên staging singleton nên không được sửa; empty+populated không replay được vì pre-0006 populated chưa từng tồn tại và Time Travel không clone; Alchemy deploy sau wrangler restore có thể apply lại migration và xóa evidence. Quiesce/runbook recovery chưa có; kernel GET không chứng minh 0006.
Concerns/Blockers: Không cook Phase 2 theo Step 2 "edit 0006". Cần tách D1 scratch cho populated upgrade vs staging hiện tại cho restore; cấm deploy giữa restore và SQL verify; thêm quiesce thật (unbind) và comment-bank POST proof.
