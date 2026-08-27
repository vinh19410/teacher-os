# Red team — Phase 2 scope & complexity critic (contract verifier)

**Target:** `plans/260819-2034-production-readiness/phase-02-d1-migration-safety-and-recovery-drill.md`
**Lens:** Scope/complexity critic + contract verifier. `--yagni` off. Requested issue-29 scope is a constraint, not a cut.
**Date:** 2026-08-20
**Mode:** hostile plan review. No lint/build/test. Claims grep-verified.

## Code Review Summary

### Scope
- Files: phase-02 plan, `plan.md`, runbook, D1 migrations 0005/0006, Alchemy apply path, comment-bank write/read contracts, runbook consumers
- LOC: plan ~50 lines; review is plan-vs-codebase, not a diff
- Focus: gold-plating beyond issue 29; callers of `comment_bank.operation_id`; migration apply paths; runbook consumers
- Scout findings: 0006 is `ADD COLUMN NOT NULL` without default; Alchemy already applied the full journal on staging in Phase 1; snapshot/UI never expose `operation_id`; three migrate apply paths; runbook has no copy/quiesce/Time Travel procedure

### Overall Assessment

Plan đúng hướng (ledger-first, forward-only, staging-only, Time Travel chứ không backup service) nhưng **không execute được như viết**. Decision tree có lỗ; file list cấm sửa SQL mà step 2 bắt sửa; “populated survive 0006” không diễn được trên staging hiện có nếu không bypass Alchemy. Hai procedure “approved” không tồn tại — đó là nam châm gold-plate (clone/backup CLI, maintenance mode) mà issue 29 cấm.

Plan **không** nhét `/readyz` (issue 31), UI fail-safe (issue 33), CI deploy, hay backup scheduler. Nguy hiểm là implementer **đẻ** chúng vì procedure trống.

### Critical Issues

#### 1. Decision tree không cover trạng thái thật sau Phase 1 — rehearsal “populated” sẽ xanh giả

- **Location:** phase-02 step 1–2, Architecture; phase-01 success; runbook deploy
- **Flaw:** Step 2 chỉ có 2 nhánh: (a) 0006 chưa apply trên env “history must stay compatible” → sửa SQL pending; (b) đã apply *anywhere* **và** DB khác có data trước 0006 → NO-GO/rebuild-and-swap. Không có nhánh cho: 0006 **đã** apply trên staging **rỗng**.
- **Evidence:**
  - Phase 1 tuyên bố staging đã `alchemy deploy --stage staging` (`phase-01-production-configuration-and-support-runbook.md:46-47`).
  - Deploy apply **toàn bộ** journal (`docs/production-release-runbook.md:110-113`). Journal đã có tag `0006_pink_ender_wiggin` (`packages/db/src/migrations/meta/_journal.json:47-52`).
  - Alchemy **không** có nút “apply through 0005”. `Cloudflare.D1.Database({ migrationsDir })` ở `packages/infra/alchemy.run.ts:41-43`.
  - 0006 trên bảng rỗng **thành công**: `ALTER TABLE comment_bank ADD operation_id text NOT NULL` (`packages/db/src/migrations/0006_pink_ender_wiggin.sql:1`). Fail chỉ khi bảng **đã có hàng**.
- **Failure:** Implementer INSERT vào staging **sau** 0006 rồi gọi đó là “populated survive upgrade”. AC issue 29 pass trên giấy; ALTER trên data 0005-era **chưa từng chạy**.
- **Fix:** Step 1 phải query ledger **D1** (không `_journal.json`). Nếu 0006 đã apply trên staging rỗng: hoặc destroy/recreate staging sau khi SQL an toàn, hoặc fixture **tách** apply 0000–0005 → seed `comment_bank` **không** `operation_id` → mới apply 0006. Cấm dùng staging post-0006 làm case populated-before-0006.

#### 2. Related Files = Inspect 0006 / Modify runbook — mâu thuẫn step 2 (sửa historical SQL)

- **Location:** phase-02 `Related Code Files` vs Implementation step 2
- **Flaw:** File list chỉ `Modify: docs/production-release-runbook.md` + optional `scripts/verify-d1-release-state.mjs`. 0006/0005/`_journal.json` là **Inspect**. Step 2 lại: “make that pending migration existing-data-safe with unique backfill values”.
- **Evidence:** `phase-02-d1-migration-safety-and-recovery-drill.md:26-30` vs `:34-35`.
- **Failure:** Cook theo file list → chỉ viết runbook, 0006 vẫn `NOT NULL` không default, populated path nổ. Hoặc tạo `0007` — chính plan nói forward migration **không** unblock ledger sớm hơn (`:24`, `:35`).
- **Fix:** Nếu nhánh sửa pending 0006 được chọn: `0006_pink_ender_wiggin.sql` phải là **Modify**. Journal tag giữ nguyên. Snapshot meta chỉ đụng nếu schema đổi. Không nhét seeder vào optional verify script.

### High Priority

#### 3. “Unique backfill values” không làm được bằng một `ALTER ADD COLUMN`

- **Location:** phase-02 step 2; `0006_pink_ender_wiggin.sql:1-2`; unique index
- **Flaw:** Plan bảo sửa pending 0006 “with unique backfill values” như thể một ALTER. SQLite/D1: `ADD COLUMN` default phải constant; hàng cũ nhận **cùng** giá trị. `CREATE UNIQUE INDEX comment_bank_org_operation_uidx (org_id, operation_id)` (`0006:2`, `packages/db/src/schema/comment-bank.ts:27-30`) nổ khi ≥2 hàng cùng org.
- **Contract:** Writer runtime **bắt** UUID: `commentBankCreateSchema.operationId = z.string().uuid()` (`packages/api/src/contracts.ts:88-93`). Insert dùng unique target `(orgId, operationId)` (`apps/server/src/routes/reporting/index.ts:60-72`). Backfill constant/`''`/NULL phá unique **hoặc** idempotency 409.
- **Failure:** Empty staging + `kernel.test.ts` memory DB (bảng rỗng lúc migrate, `apps/server/src/kernel.test.ts:32-46`) xanh. Drill populated đỏ. Implementer “fix” bằng script backfill riêng = gold-plate ngoài runbook.
- **Fix:** Existing-data-safe 0006 = **table rebuild** (create/copy với `operation_id` unique per row — `id` PK đủ unique — drop/rename/recreate index). Ghi rõ trong plan. Không `DEFAULT ''`.

#### 4. Phantom procedure → nam châm backup service / maintenance mode / verify CLI

- **Location:** phase-02 steps 3, 5; runbook hiện tại
- **Flaw:** “Create/copy a non-production representative database **by the approved operator procedure**” (`phase-02:36`). “Quiesce mutations **by the approved maintenance procedure**” (`phase-02:38`). **Không có procedure nào.**
- **Evidence:** Runbook chỉ `pnpm alchemy deploy --stage staging` / `destroy` (`docs/production-release-runbook.md:90-100`). Time Travel được link ở `plan.md:98`, **không** có lệnh. Không `wrangler.toml`. `npx wrangler tail` là ops duy nhất (`runbook.md:148`). Optional script (`phase-02:30`) là chỗ dump: clone D1, seed, hash ledger, wrap wrangler — tức backup toolkit mà non-goal cấm (`plan.md:44`).
- **Không phải cut của issue 29:** rehearsal + bookmark + quiesce + RPO/RTO **là** requested. Cấm **đẻ service**. Quiesce = operator ngừng ghi staging / không deploy trong cửa sổ restore. Copy = one-off `d1 execute` 0000–0005 trong runbook, không CLI mới.
- **Fix:** Viết lệnh Time Travel/bookmark (tên secret/ID cấm). Cấm `scripts/verify-d1-release-state.mjs` trừ khi một check secret-free **không** nhét được vào runbook. Cấm maintenance-mode Worker, scheduler, `/readyz` (phase 3), UI fail-safe (phase 4/5).

#### 5. `operation_id` không có trên kernel read — GET snapshot không chứng minh “survive”

- **Location:** loader/contract/UI vs plan success “kernel write/reload”
- **Consumers (write-side only):**
  | Caller | Path | Dùng `operation_id`? |
  | --- | --- | --- |
  | Schema + unique | `packages/db/src/schema/comment-bank.ts:19,27-30` | column + unique `(orgId, operationId)` |
  | Migration | `0006_pink_ender_wiggin.sql:1-2` | ADD NOT NULL + unique index |
  | POST insert/conflict | `apps/server/src/routes/reporting/index.ts:65,70,81` | write + `onConflictDoNothing` + 409 |
  | Wire body | `packages/api/src/contracts.ts:91` | UUID required |
  | Client command | `apps/web/src/lib/repos/kernel.ts:89-93` | POST body |
  | Grade modal | `apps/web/src/components/modals/grade-modal.tsx:28-30,89-94` | UUID per open, stable across retry |
  | Action type | `apps/web/src/lib/data-actions.ts:8` | field only |
  | Tests | `apps/server/src/kernel.test.ts` comment-append/409; `apps/web/src/lib/repos/kernel.test.ts` transport | |
- **Non-consumers (read path — không thấy column):**
  - `loadCommentBank` select `id, tag, text` only (`apps/server/src/routes/reporting/loaders.ts:54-58`)
  - `KernelCommentBankRow` `{id, tag, text}` (`packages/api/src/contracts.ts:253-256`)
  - `CommentBankItem` same (`apps/web/src/lib/mock-data.ts:81-85`)
  - Snapshot ráp `commentBankRows` (`apps/server/src/routes/snapshot.ts:65,236`)
  - UI assignments map text (`apps/web/src/routes/_auth/assignments/$assignmentId.tsx`)
  - Reducer `add-comment-bank` inert (`apps/web/src/lib/data-store-reducer.ts:81-83`)
- **Failure:** Smoke `GET /api/kernel` sau migrate “pass” dù unique index fail hoặc mọi row cùng sentinel. POST retry idempotency (201 rồi 200 cùng id, 409 text khác — `reporting/index.ts:73-88`) **không** nằm trong plan.
- **Fix:** Survive = (1) `PRAGMA table_info(comment_bank)` / unique index, (2) `SELECT operation_id` distinct per `(org_id, id)`, (3) POST `/api/comment-bank` UUID mới + replay cùng payload. Không tin snapshot `{id,tag,text}`.

### Medium Priority

#### 6. Ba apply path, hai ledger; citation Alchemy đã mục ruỗng

- **Location:** phase-02 Architecture `:24`; `plan.md:23`
- **Apply paths:**
  1. **Alchemy deploy** — `packages/infra/alchemy.run.ts:41-43` `migrationsDir`. Production/staging. Ledger D1 (wrangler-style), không phải file journal.
  2. **libsql migrator** — `apps/server/src/kernel.test.ts:32-46` `migrate(..., MIGRATIONS_DIR)` trên `file::memory:`. CI. Bảng **rỗng**. Ledger `__drizzle_migrations`.
  3. **Orphan `drizzle-kit migrate`** — `packages/db/package.json:14-15` `db:migrate:deploy`; `packages/db/drizzle.config.ts:8-13` `driver: "d1-http"` **không** `dbCredentials`. Không gắn root/turbo/CI.
- **Stale cite:** Plan nói `alchemy.run.ts:11-13`. Hiện 11-13 là `dotenv` paths. `migrationsDir` là 41-43 (Phase 1 nhét topology lên trên). `plan.md:23` còn `alchemy.run.ts:11-63` — file giờ ~103 dòng.
- **Failure:** Cook “fix” topology trong phase 2 (scope bleed phase 1). Hoặc chạy `db:migrate:deploy` tạo ledger thứ hai. Sửa 0006 SQL sau khi staging đã apply → hash mismatch lúc `alchemy deploy --stage staging` trừ khi destroy. Plan không ghi destroy/recreate.
- **Fix:** Cite `alchemy.run.ts:41-43`. Cấm `db:migrate:deploy` cho drill. Ledger check = query D1, không đọc `_journal.json` một mình. Nếu sửa 0006: destroy staging rehearsal (history disposable), không prod.

#### 7. Một bookmark trước test vs smoke sau restore — schema lệch; auth cùng D1

- **Location:** phase-02 steps 3–5; `apps/server/src/app.ts:96-99`; auth tables cùng schema
- **Flaw:** Bookmark “before testing” rồi apply 0006, rồi restore về bookmark. Restore **gỡ** 0006. “kernel write/reload” sau restore POST `operationId` → column missing. Auth session/user/org **cùng** D1; restore rewind session. “auth bootstrap” sau restore = sign-in lại, không phải session cũ sống.
- **Gold-plate risk:** “auth bootstrap” đọc thành Google OAuth trên staging (`APP_DOMAIN` unset, `workers.dev`, CORS two-step — `runbook.md:28-30,90-96`). Đó là Phase 6 + topology staging, không issue 29. `GET /` chỉ liveness `OK` (`app.ts:98`), không auth, không kernel.
- **Fix:** Hai mốc hoặc một restore target **tường minh**: (A) rewind failed migration = bookmark pre-0006, smoke post-restore trên schema 0005; (B) rewind data loss = bookmark post-0006, smoke POST comment-bank. Auth smoke = session mới sau restore qua `/api/kernel` (bootstrap org), **không** UAT Google trừ khi staging OAuth đã có sẵn từ Phase 1 và không đụng Phase 6 matrix.

#### 8. Runbook là shared contract — Phase 2 rewrite topology phá consumer CI

- **Consumers:**
  | Consumer | Path | Contract |
  | --- | --- | --- |
  | Topology drift test | `scripts/topology-drift.test.mjs:20-26` | runbook **phải** chứa `https://api.<domain>${AUTH_MOUNT_PATH}/callback/google` |
  | Root test | `package.json:19` `pnpm test` → `test:topology-drift` | fail CI nếu URI bị viết lại |
  | README entry | `README.md:120` | runbook = release entry point |
  | Phase 2/3/6 | cả ba `Modify: docs/production-release-runbook.md` | tuần tự, dễ đè |
  | Preflight | `runbook.md:81` “Phase 2 gate” | circular: Phase 2 ghi đúng chỗ này |
  | Rollback | `runbook.md:140-142` | trỏ “Phase 2 drill” — chưa có lệnh |
- **Failure:** Phase 2 “operationalize recovery” viết lại mục Topology/Secrets → `topology-drift` đỏ, hoặc nuốt inventory Phase 1. Phase 3 thêm `/readyz` lên bản đã phình.
- **Fix:** Append section “D1 ledger / 0006 decision / Time Travel / quiesce / RPO-RTO / reconciliation”. Cấm sửa bảng topology. Không nhét probe `/readyz`.

### Low Priority

- `PRAGMA foreign_key_check` (`phase-02:19,37`) không có trong issue 29; rẻ, giữ như validation nếu seed `comment_bank` **sau** `organization` (FK `org_id` — `0005_mature_sasquatch.sql:1-7`). Không viết helper.
- Effort `1d` không phải finding; table-rebuild + fixture 0005-era + Time Travel một lần vẫn trong scope nếu không đẻ CLI.

### Edge Cases Found by Scout

- Empty 0006 apply **không** chứng minh populated 0006. `kernel.test.ts` migrate empty memory — CI mù.
- Unique `(org_id, operation_id)` cho phép trùng `operation_id` khác org; backfill global-constant vẫn vỡ trong **một** org nhiều hàng.
- Snapshot omit `operation_id` là **cố ý** (idempotency server-side). Repair không được thêm field vào `KernelCommentBankRow` (đó là đổi public contract, ngoài issue 29).
- Restore Time Travel in-place, không clone. “Create/copy representative DB” ≠ Time Travel restore.
- Staging `destroy` không đụng `prod` (`runbook.md:100`) — đây là nút reset ledger rehearsal, plan không dùng.

### Positive Observations

- Architecture đúng: không backup service; forward-only sau live apply; staging-only; optional script đã gated. Không `/readyz`, không UI, không CI deploy. Non-goal `plan.md:40-44` khớp issue 29.

### Recommended Actions

1. Bẻ decision tree: query D1 ledger; nhánh “0006 applied on empty rehearsal DB”; populated-before-0006 = fixture 0000–0005 + seed, không staging hiện tại.
2. Nếu sửa pending 0006: table rebuild, `Modify` SQL; destroy/recreate staging; cấm `0007` như cách “unblock”.
3. Survive proof = pragma + distinct `operation_id` + POST `/api/comment-bank` idempotency. Không GET snapshot.
4. Viết lệnh bookmark/quiesce/Time Travel trong runbook. Cấm script/clone/maintenance mode. Append-only; giữ URI cho `topology-drift.test.mjs`.
5. Cite `alchemy.run.ts:41-43`. Cấm `db:migrate:deploy`. Auth smoke ≠ Phase 6 Google matrix.

### Metrics
- Type Coverage: n/a (plan review)
- Test Coverage: n/a — CI không cover populated 0006
- Linting Issues: n/a
- Findings: 8 (2 critical, 3 high, 3 medium)
- Gold-plate extras in plan text: `/readyz` CI UI scheduler = **không**. Magnets: optional verify script, phantom copy/quiesce procedures, “auth bootstrap”, stale Alchemy cite.

### Unresolved Questions

- Staging D1 live: 0006 đã apply chưa? Plan cấm infer từ source; review này **không** query Cloudflare. Phase 1 deploy + journal khiến “đã apply, bảng rỗng” là default cho đến khi operator dump `d1_migrations`.
- Prod D1 đã tồn tại chưa? Quyết định “history must stay compatible” vs destroy staging.
- Restore drill chọn rewind migration hay rewind data? Plan gộp một bookmark.

---

## Contract inventory (verifier)

### `comment_bank.operation_id`
Write-only idempotency key. Không round-trip snapshot. Unique `(org_id, operation_id)`. Body UUID. Repair/backfill không được lộ ra UI hay đổi `KernelCommentBankRow`.

### Migration apply
Owner: Alchemy `migrationsDir` lúc deploy. Test owner: drizzle-orm libsql migrator (empty). `drizzle-kit migrate` leftover, không dùng. Không có apply-until-N.

### Runbook consumers
`scripts/topology-drift.test.mjs` (string URI), `README.md:120`, Phase 2/3/6 writers, preflight “Phase 2 gate”. Phase 2 chỉ được **thêm** recovery evidence.

---

Status: DONE
Summary: Phase 2 plan under-specified for the real post-Phase-1 ledger (0006 likely already on empty staging) and over-specified as phantom copy/quiesce procedures that will spawn a backup CLI. Empty vs populated 0006 is not the same ALTER.
Concerns/Blockers: Cook sẽ false-green trừ khi plan buộc fixture pre-0006, table-rebuild SQL, D1 ledger query, và POST idempotency proof. Optional `verify-d1-release-state.mjs` nên mặc định không tạo.
