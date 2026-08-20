# Code Review — Phase 2 D1 migration safety (pending)

**Date:** 2026-08-20
**Reviewer:** staff engineer (production-readiness)
**Mode:** `--pending` + spec-compliance + checklist two-pass (base + api overlay)
**Branch:** `feat/29-d1-migration-safety-recovery` @ `b160a9d`
**Plan:** `plans/260819-2034-production-readiness/phase-02-d1-migration-safety-and-recovery-drill.md`
**Fix:** not in scope — report only

## Code Review Summary

### Scope
- Tracked pending:
  - `.gitignore` (+`.wrangler`)
  - `docs/production-release-runbook.md` (append 72 LOC)
  - `packages/db/src/migrations/0006_pink_ender_wiggin.sql` (ALTER → table rebuild)
  - `plans/260819-2034-production-readiness/phase-02-d1-migration-safety-and-recovery-drill.md`
  - `plans/260819-2034-production-readiness/plan.md`
- Untracked product: `apps/server/src/comment-bank-existing-data-migration.test.ts` (95 LOC)
- Untracked reports (out of product review): `plans/reports/red-team-phase02-*.md`
- Product LOC: ~92 (+95 test). Plan churn excluded from quality score.
- Focus: pending Phase 2 D1 0006 safety + runbook recovery. Not full codebase.
- Scout findings: xem mục Edge Cases.

### Overall Assessment

SQL 0006 khớp drizzle schema (unique index, FK cascade, `created_at` default, `operation_id` NOT NULL không constant default, backfill `id`). Test populated **thật** apply 0000–0005 → INSERT không `operation_id` → 0006. Kernel empty-migrate vẫn xanh. Topology Google URI không bị rewrite. Không secret/UUID. Không `/readyz`, không `KernelCommentBankRow`, không `verify-d1-release-state.mjs`.

**Spec vs accepted outcome: PASS with WARN.** WARN = runbook tự mâu thuẫn destroy/recreate staging (câu khẳng định vs câu “was not executed”). Không phải bug SQL. Block merge docs cho đến khi một câu đúng.

Không Critical trên SQL/test/authz.

### Spec compliance

Accepted outcome + phase-02 Related/Steps. Live evidence do lead cung cấp; không re-query D1.

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | 0006 table rebuild, `operation_id = id`, keep journal tag | PASS | `0006_pink_ender_wiggin.sql:11` `SELECT … id` as 3rd col; `_journal.json` tag `0006_pink_ender_wiggin` unchanged |
| 2 | Unique `(org_id, operation_id)` + recreate `comment_bank_org_created_idx` | PASS | SQL `:17-19`; schema `comment-bank.ts:27-35`; snapshot `0006_snapshot.json:681-697` |
| 3 | FK `org_id → organization(id)` ON DELETE cascade, ON UPDATE no action | PASS | SQL `:8`; snapshot `:700-712`; khớp 0005 |
| 4 | `created_at` default `(cast(unixepoch('subsecond') * 1000 as integer))` NOT NULL | PASS | SQL `:7`; schema `:22-24`; snapshot `:671-677` |
| 5 | No constant DEFAULT on `operation_id` | PASS | SQL `:4` NOT NULL, no DEFAULT; snapshot `:649-655` no default |
| 6 | Empty + populated `comment_bank` survive | PASS (CI) | Test empty `:50-66`; populated `:68-94`. Vitest 2/2 + kernel 51/51 pass |
| 7 | Test apply 0000–0005, insert **without** `operation_id`, then 0006 | PASS | `applyThrough(…, "0005_mature_sasquatch.sql")` `:70`; INSERT cols `id, org_id, tag, text` `:76-79`; `applyFile(…0006…)` `:82` |
| 8 | Runbook append-only Time Travel / quiesce / RPO-RTO; no topology rewrite | PASS | Diff `@@ -141,6 +141,78 @@` append only. URI `https://api.<domain>/api/auth/callback/google` còn `:23`, `:75`. `topology-drift.test.mjs` 2/2 pass |
| 9 | No `scripts/verify-d1-release-state.mjs` | PASS | `scripts/` chỉ `ci-workflow.test.mjs`, `topology-drift.test.mjs` |
| 10 | No `/readyz`, no `KernelCommentBankRow` change | PASS | `apps/` 0 hit `/readyz`. `contracts.ts:253-257` `{id,tag,text}`. Không trong diff |
| 11 | Synthetic fixtures only (`fixture-*`) | PASS | Test `fixture-a`/`fixture-b`/`org-fixture`. Runbook cấm copy prod |
| 12 | Never paste secrets/UUIDs/tokens | PASS | Diff + test + phase/plan: 0 UUID v4, 0 token. Bookmark placeholder `--bookmark=<from-info>`. D1 name `teacher-os-database-staging-*` |
| 13 | Phase step 5 empty upgrade = alchemy destroy/recreate staging | **WARN** | Runbook `:203-207` thừa nhận **không** destroy. Phase success `:75` vẫn `[x]` |
| 14 | Staging ledger remaining apply = repaired SQL | **WARN** | `:165-167` claim destroy/recreate. `:203-207` phủ nhận. Staging vẫn filename `0006` từ ALTER cũ (empty schema tương đương, SQL file khác) |

Extra vs spec:
- `.gitignore` `.wrangler` — không trong phase file. **Justified** (wrangler local D1 có thể chứa data). Không gold-plate.
- Empty-path test riêng — phase nói empty đã cover bởi kernel migrate. Extra hẹp, không hại.
- Plan/red-team markdown — ngoài product.

### Critical Issues

Không.

### High Priority

1. **[Important]** Runbook tự mâu thuẫn destroy/recreate staging.
   - `docs/production-release-runbook.md:165-167`: “Staging was then destroyed and recreated so the only remaining apply of that filename is the repaired SQL.”
   - `:203-207`: “Recreating staging with `alchemy destroy --stage staging` was not executed … empty `0006` already applied on this staging D1.”
   - Impact: operator tin ledger staging đã apply SQL rebuild. Alchemy **không** re-apply cùng filename. Prod lần đầu mới chạy rebuild. Empty rebuilt-SQL trên D1 staging **chưa** diễn ra (chỉ libsql + throwaway populated).
   - Fix: xóa một trong hai câu. Giữ sự thật: destroy **không** chạy; repaired SQL proven trên throwaway + test; staging empty schema từ ALTER cũ, tương đương PRAGMA nhưng `sqlite_master` khác. Đừng `[x]` step 5 cho đến khi destroy thật hoặc lead chấp nhận skip có ghi rõ.

### Medium Priority

1. **[Suggestion]** Populated test không assert `comment_bank_org_created_idx` hay `PRAGMA index_list.unique=1`. Empty test chỉ check tên unique index (`comment-bank-existing-data-migration.test.ts:57-62`). SQL có cả hai index. Nếu drop `CREATE INDEX comment_bank_org_created_idx` (`0006:19`), cả hai test vẫn xanh; drizzle schema thì không. Loader `orderBy(createdAt, id)` (`loaders.ts:61`) phụ thuộc index này cho perf, không cho correctness.
   - Fix: empty và/hoặc populated assert cả hai tên index + `unique === 1` trên uidx; optional `PRAGMA table_info` `notnull=1` / `dflt_value=null` cho `operation_id`.

2. **[Suggestion]** Table rebuild không theo SQLite 12-step (`BEGIN`, `PRAGMA foreign_keys=OFF`, `foreign_key_check` trong txn). `comment_bank` chỉ là child FK → DROP child an toàn. Crash giữa `DROP` (`:13`) và `RENAME` (`:15`) để lại `__new_comment_bank` không tên app. Recovery = Time Travel (đã có runbook). Không incoming FK (grep schema/SQL). Không block.

3. **[Suggestion]** Deploy paragraph `:110-113` vẫn “never edit … applied migration file; … new forward migration”. Section mới cố ý edit 0006 vì staging disposable / prod chưa tồn tại (quyết định đã lock). Hai giọng. Operator sau có thể edit migration đã apply trên prod.
   - Fix: một câu carve-out — exception chỉ rehearsal 0006 trước first prod apply; sau đó forward-only.

### Low Priority

1. Populated test không assert `created_at` copy nguyên. SQL `:11` có `created_at`. Regression rewrite timestamp không bị bắt.
2. `applyThrough` so sánh string filename (`:44`). An toàn với prefix `NNNN_`. Gãy nếu đổi pad. Acceptable.
3. Phase file `status: pending` + plan table Phase 2 Pending trong khi success `[x]`. Lead cập nhật — reviewer không sửa plan.
4. Quiesce “COUNT(*) stable twice” không ghi interval. Đủ cho rehearsal rỗng.

### Edge Cases Found by Scout

- Dependents: `POST /api/comment-bank` dùng unique `(org_id, operation_id)` (`reporting/index.ts:61-71`). GET kernel **không** select `operation_id` (`loaders.ts:54-58`) — đúng cấm đổi `KernelCommentBankRow`. Backfill `operation_id=id` không lộ snapshot.
- Không bảng nào FK **vào** `comment_bank`. Rebuild không orphan child.
- `organization` 0001 chỉ `id, name, created_at` — INSERT test `'org-fixture'` hợp lệ (test đã chạy).
- `applyThrough("0005_mature_sasquatch.sql")` lexicographic: 0000–0005 in, 0006 out. Confirmed 7 file `NNNN_*.sql`.
- Kernel `migrate()` empty DB apply 0006 mới — 51/51 pass. Empty rebuild không phá drizzle migrator.
- Staging đã apply filename 0006 (ALTER). Deploy kế tiếp **không** chạy rebuild trên staging. Race writer-during-rebuild không apply trừ khi recreate D1 / first prod. First prod Alchemy = empty 0000–0006. Populated path bảo vệ incremental/dev DB, không phải happy-path prod create.
- Rebuild online không an toàn: INSERT vào table cũ giữa `INSERT SELECT` và `DROP` bị mất. Không quiesce-before-0006 trong runbook. Hiện không có writer populated. Ghi nhận, không block.
- `.wrangler` gitignore: local D1 dump không vào git. Extra justified.
- Topology-drift lock URI — pass sau append.

Verified không issue:
- Unique backfill: `id` là PK → `(org_id, operation_id)` với `operation_id=id` không đụng unique.
- `onConflictDoNothing` target khớp index mới.
- Journal tag / filename không đổi.
- Snapshot 0006 không cần regenerate (end-state đã có `operation_id`).

### Positive Observations

Test **không** dùng `drizzle migrate()` / `pnpm db:migrate:deploy` cho populated path — migrate sẽ apply 0006 trước INSERT, false-green đúng bug ALTER NOT NULL gốc. Sequence 0005 → INSERT thiếu cột → 0006 là regression guard thật. 2 tests 11ms, pass.

### Pre-Landing Review (checklist)

Pre-Landing Review: 4 issues (0 critical, 4 informational)

**CRITICAL** (blocking):
- Không. Không injection (SQL tĩnh). Không endpoint mới. Không secret. Không IDOR.

**Issues** (non-blocking):
- `[docs/production-release-runbook.md:165-167]` vs `:203-207` — destroy claimed and denied
  Fix: một sự thật
- `[apps/server/src/comment-bank-existing-data-migration.test.ts:68-94]` — không lock `comment_bank_org_created_idx`
  Fix: assert index list
- `[packages/db/src/migrations/0006_pink_ender_wiggin.sql:13-15]` — DROP/RENAME ngoài txn
  Fix: không bắt buộc; Time Travel đã document
- `[docs/production-release-runbook.md:110-113]` — forward-only vs 0006 edit
  Fix: carve-out rehearsal-only

Suppressions applied: không flag style/formatting; không “consider X”; `.wrangler` extra đã justified.

### Recommended Actions

1. Sửa runbook: **không** claim staging destroy/recreate nếu chưa chạy. Một đoạn evidence: throwaway populated + libsql empty/populated + restore ~5s + POST 201/200/403. (Important, merge-blocking docs)
2. Lead quyết định: destroy staging khi có `BETTER_AUTH_SECRET`/`CORS_ORIGIN`, **hoặc** skip có chủ đích và bỏ `[x]` step 5. (process)
3. Optional: assert `comment_bank_org_created_idx` + unique flag trong test.
4. Optional: carve-out forward-only cho 0006 rehearsal.
5. Commit kèm file test untracked — CI `turbo run test` include `apps/server` `src/**/*.test.ts`. Thiếu file = mất regression.

### Metrics
- Type Coverage: n/a đo %; test TS không `any`. Schema/SQL aligned.
- Test Coverage: 2/2 new pass (11ms). Kernel 51/51 pass (cùng `vitest run`, 0006 mới). topology-drift 2/2 pass.
- Linting Issues: biome on test file = 0. SQL/md ngoài biome include.
- Verification this session: `pnpm --filter server test` (53 pass); `node --test scripts/topology-drift.test.mjs` (2 pass). Không re-query live D1 (lead evidence).

### Plan follow-up (không sửa plan)

- Phase 2 success bullets `[x]` — SQL/test/runbook-append/restore-evidence khớp accepted outcome.
- Step 5 empty upgrade via alchemy destroy: **chưa** làm. Không recommend Completed cho đến khi WARN runbook đóng.
- Phases 3–6: không đụng. `/readyz` vẫn Phase 3.

### Unresolved Questions

- Lead có destroy/recreate staging trước first prod apply không, sau khi `.env` đủ secret?
- Câu “Staging was then destroyed and recreated” là copy-paste plan hay claim cố ý? Cần sửa trước commit.

---

## Checklist behavioral (reviewer)

- [x] Concurrency: rebuild vs writers — noted, no prod traffic
- [x] Error boundaries: migration SQL fail-loud; test throws
- [x] API contracts: `KernelCommentBankRow` unchanged
- [x] Backwards compatibility: 0006 filename/tag kept; first prod apply = new SQL
- [x] Input validation: no new endpoints
- [x] Auth/authz: Origin lock documented, not weakened
- [x] N+1: n/a; created_idx recreated
- [x] Data leaks: no PII/UUID/token in pending files
- [x] Fact-checked vs plan + live files (grep/read/test, not plan-only)
