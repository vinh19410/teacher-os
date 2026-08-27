---
type: tester
date: 2026-08-20
scope: phase-02-d1-migration-safety-recovery
issue: 29
cwd: /Users/vinhtran/Documents/project/personal/worktrees/teacher-os-29-d1-migration-safety-recovery
---

# Test Report — 2026-08-20 — Phase 2 D1 migration safety / recovery

## Summary

**Assigned gates PASS.** Empty + populated `0006` tests 2/2. Topology-drift 2/2 (Google URI còn trong runbook). Biome clean. Kernel write path `operationId` vẫn 51/51 (side-effect vì `vitest run -- file` không filter).

**Concern (ops, not CI):** runbook tự mâu thuẫn về empty upgrade trên staging D1 — đoạn repair nói destroy/recreate; đoạn RPO nói `alchemy destroy --stage staging` **không** chạy.

## Diff-aware mode

```
Diff-aware mode: analyzed 6 changed files
  Changed: packages/db/src/migrations/0006_pink_ender_wiggin.sql
           apps/server/src/comment-bank-existing-data-migration.test.ts (untracked)
           docs/production-release-runbook.md
           plans/260819-2034-production-readiness/phase-02-d1-migration-safety-and-recovery-drill.md
           plans/260819-2034-production-readiness/plan.md
           .gitignore
  Mapped:  apps/server/src/comment-bank-existing-data-migration.test.ts (A + C — reads migrations/)
           scripts/topology-drift.test.mjs (C — reads runbook)
           apps/server/src/kernel.test.ts (C — migrate() applies 0006; POST /api/comment-bank uses operationId)
  Unmapped: .gitignore, phase-02-*.md, plan.md
Ran focused + kernel side-effect: 55 passed, 0 failed
```

| File | Why selected |
|---|---|
| `0006_pink_ender_wiggin.sql` | Table rebuild. Strategy C → existing-data migration test + kernel migrate() |
| `comment-bank-existing-data-migration.test.ts` | New colocated proof. Empty + populated 0006 |
| `docs/production-release-runbook.md` | Append-only D1 section. Strategy C → topology-drift (Google URI lock) |
| `kernel.test.ts` | Unchanged. High fan-out of migrationsDir; write proof `operationId` |
| `.gitignore` (`.wrangler`) | [!] No tests — ignore-list only |
| `phase-02-*.md` / `plan.md` | Plan artifacts. No runtime tests |

Không escalate `--full`: `.gitignore` không phải tsconfig/jest/package.json. Config test helper không đổi.

[!] No tests for `.gitignore` `.wrangler` — ignore local wrangler state; không có runtime contract.

## Commands (exact exit codes)

| # | Command | Exit | Duration | Result |
|---|---------|------|----------|--------|
| 1 | `pnpm --filter server test -- src/comment-bank-existing-data-migration.test.ts` | **0** | 882ms | Vitest **không** filter vì `--`. 2 files, **53/53** (2 0006 + 51 kernel) |
| 1b | `pnpm --filter server exec vitest run src/comment-bank-existing-data-migration.test.ts` | **0** | 145ms / tests 11ms | Isolated **2/2** 0006 |
| 2 | `pnpm exec node --test scripts/topology-drift.test.mjs` | **0** | 52ms | **2/2** (mount path + Google URI) |
| 3 | `pnpm exec biome check apps/server/src/comment-bank-existing-data-migration.test.ts` | **0** | 4ms | Checked 1 file. No fixes |

Không flake (single pass, in-memory libsql). Không weaken test. Không in secret / D1 UUID / cookie / env value.

## Confirmations (assigned)

| Check | Status | Evidence |
|---|---|---|
| Empty `comment_bank` survives 0006 + unique index | **PASS** | `empty comment_bank survives 0006 and unique index` |
| Populated path: 2 rows same org, `operation_id = id`, unique | **PASS** | `two comments in one org survive 0006 with unique operation_id from id` |
| Topology-drift still finds Google URI in runbook | **PASS** | `runbook google redirect URI matches the mount path`; URI còn `docs/production-release-runbook.md:23` + `:75` |
| Biome clean | **PASS** | 0 diagnostic on new test file |
| Runbook append-only (không rewrite topology / Google URI) | **PASS** | `git diff` chỉ **insert** section sau Rollback code; topology table + URI không sửa |

`0006` SQL: table rebuild `__new_comment_bank`, `INSERT … SELECT …, id` làm `operation_id`, drop/rename, unique `comment_bank_org_operation_uidx`, recreate `comment_bank_org_created_idx`. Journal tag `0006_pink_ender_wiggin` giữ nguyên (`meta/_journal.json`).

Kernel (side-effect, 51/51): `POST /api/comment-bank` với `operationId` UUID — 201 + replay 200 (`kernel.test.ts` comment append / lost-ack). GET snapshot vẫn `id, tag, text` only — **không** chứng minh cột; CI write path thì có.

## Test Results Overview

- **Assigned focused**: 4 (2 vitest 0006 + 2 node:test topology)
- **Also ran**: 51 kernel (assigned cmd không isolate)
- **Passed**: 55 | **Failed**: 0 | **Skipped**: 0
- **Duration**: 0006 isolated 11ms; kernel+0006 882ms; topology 52ms; biome 4ms

## Coverage Metrics

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Lines / branches / functions | n/a | 80/70/80 | SKIP — không có `test:coverage` |

### Coverage gaps (CI, không fail assigned gate)

| Gap | Risk | Note |
|---|---|---|
| Empty/populated **không** assert `comment_bank_org_created_idx` recreate | Medium schema drift | 0006:19 recreate sau DROP; test chỉ check unique name trên empty path |
| Populated path không `PRAGMA index_list` unique | Low | 2 `operation_id = id` khác nhau ⇒ unique thoả; không prove index tồn tại |
| Không assert `operation_id` NOT NULL / `dflt_value` empty | Low | SQL không default; PRAGMA `table_info` chỉ check tên cột (empty test) |
| Không assert `tag`/`text`/`created_at` giữ nguyên sau rebuild | Low | Fixture chỉ SELECT `id, operation_id` |
| Không thử unique-violation insert sau 0006 | Low | PK `id` đã unique; `(org_id, operation_id)` copy từ `id` |
| Live staging destroy/recreate **không** trong CI | Ops | Đúng plan: CI = in-memory; live drill = runbook |

## Failed Tests

None.

## Performance Metrics

- 0006 isolated: 11ms — không chậm
- Kernel 51: 262ms tests / 882ms wall — ổn
- Topology: <1ms / test
- Không leak / hang

## Build Status

- Assigned: test + biome only. `check-types` / `pnpm build` **không** trong scope.
- Biome: clean trên file mới.
- Deps: resolved (`@libsql/client` đã có trong server devDeps).

## Critical Issues

Không blocking CI merge của SQL + test + runbook append.

**Ops concern — empty upgrade trên staging D1:**

- Phase step 5 + success criteria: destroy/recreate staging để apply **repaired** `0006` trên empty tables.
- Runbook `:162-167` nói staging **đã** destroy/recreate.
- Runbook `:198-207` nói `alchemy destroy --stage staging` **không** chạy (thiếu operator env names — không ghi value). Empty `0006` cũ đã apply; repaired SQL prove trên throwaway D1 rồi xóa.

Hệ quả: staging ledger có thể vẫn là **old ALTER** `0006` (cùng filename). Prod chưa tồn tại → first prod apply sẽ dùng file rebuild trên disk. Schema empty-table của ALTER vs rebuild tương đương (cột + unique; `created_idx` từ 0005 không bị ALTER drop). Gap = “only remaining apply of that filename is repaired SQL” **chưa** đúng trên staging D1.

Tester **không** chạy wrangler/alchemy (secret / D1 id ngoài scope). Không verify live ledger.

## Recommendations

1. **High (ops):** reconcile runbook — một câu: staging ledger hiện apply SQL nào (old ALTER vs rebuilt). Nếu vẫn old filename trong `d1_migrations`, destroy/recreate staging **sau khi** env đủ, hoặc ghi rõ “staging leftover old apply; prod first apply = rebuilt file”.
2. **Medium (test):** populated + empty assert `comment_bank_org_created_idx` + unique flag. Optional: `PRAGMA table_info` `notnull=1` / no default cho `operation_id`.
3. **Low:** document vitest: `pnpm --filter server test -- file` **không** isolate (`vitest run -- <file>`). Dùng `pnpm --filter server exec vitest run <file>`.
4. **Do not:** paste bookmark / D1 UUID / cookie / `comment_bank.text` vào git. Runbook hiện chỉ counts + status codes — OK.

## Next Steps

1. Reviewer: SQL rebuild + journal tag + append-only runbook + Google URI lock.
2. Operator: quyết định destroy/recreate staging trước prod apply, hoặc chấp nhận leftover old 0006 trên empty staging.
3. Optional: bổ sung assert `created_idx` trước merge nếu muốn schema lock chặt.

## Unresolved Questions

- Staging D1 hiện tại đã apply repaired rebuild SQL hay vẫn old ALTER cùng tag? Tester không query remote.
- Time Travel restore drill (bookmark, RPO 5s, kernel POST 201/200) — chỉ claim trong runbook; không reproduce ở session này.
- `.wrangler` ignore: local wrangler cache có từng bị commit trước không? `git status` chỉ thêm ignore, không untrack file đã tracked.
