---
phase: 2
title: "D1 migration safety and recovery drill"
status: completed
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 2: D1 migration safety and recovery drill

## Overview

Prove an existing-data upgrade and restoration procedure on the isolated staging D1 before pilot data exists. Ledger evidence, not source files, selects the `0006` repair.

## Requirements

- Query live `d1_migrations`, `PRAGMA table_info(comment_bank)`, and `COUNT(*)` on the staging D1 before changing historical SQL. Do not trust `wrangler d1 list` `num_tables` (it reports 0 while tables exist).
- Exercise empty and populated `comment_bank` upgrade paths, `PRAGMA foreign_key_check`, and kernel write proof that actually uses `operation_id`.
- Record bookmark, write-quiesce, observed RPO/RTO, reconciliation, restore authority, and stop conditions in the runbook. Commands only; no database UUIDs, tokens, session rows, or `comment_bank.text`.

## Architecture

Alchemy applies the whole `packages/db/src/migrations` folder at deploy (`packages/infra/alchemy.run.ts:41-43`). D1 Time Travel restores **in place** (no clone). `d1_migrations` lives inside D1, so a restore rewinds the ledger; Alchemy state does not. Never `alchemy deploy` between restore and read-only verify.

`0006` currently is `ALTER TABLE comment_bank ADD operation_id text NOT NULL` plus unique `(org_id, operation_id)` with no default (`packages/db/src/migrations/0006_pink_ender_wiggin.sql:1-2`). SQLite rejects that ALTER on a table that already has rows. GET `/api/kernel` selects `id, tag, text` only (`apps/server/src/routes/reporting/loaders.ts:54-58`) and does not prove the column.

A later `0007` cannot unblock an earlier unsafe `0006`: prod does not exist yet, so the first production apply of `0006` must already be existing-data-safe.

## Ledger-driven decision (verified 2026-08-20)

| Check | Result |
| --- | --- |
| Staging D1 | Isolated `teacher-os-database-staging-*`; rehearsal only |
| Prod / pilot D1 | None in the account D1 list |
| `d1_migrations` | `0000` through `0006_pink_ender_wiggin.sql` applied at staging create |
| `comment_bank` rows | 0 |
| `organization` / `user` | 0 |
| `operation_id` | TEXT NOT NULL, no default; unique index present |

**Selected repair:** rewrite `0006` as a table rebuild that copies `operation_id` from `id` (PK, unique per row), then destroy and recreate staging so the only remaining apply of that filename is the repaired SQL. Staging history is disposable rehearsal, not an environment whose history must stay compatible.

**NO-GO** only if a later inspect finds a non-rehearsal database that applied the old `0006` **and** another database still has populated `comment_bank` from before `0006`. Then stop and open a separately reviewed rebuild-and-swap. Do not edit `0006` in that case.

Do not treat inserts into the current post-`0006` staging table as the populated upgrade path.

## Related Code Files

- Modify: `packages/db/src/migrations/0006_pink_ender_wiggin.sql` (keep the journal tag; table-rebuild SQL).
- Modify: `docs/production-release-runbook.md` — **append only** a D1 ledger / Time Travel / quiesce / RPO-RTO section. Do not rewrite topology, secret inventory, or the Google redirect URI (`scripts/topology-drift.test.mjs` locks that string).
- Modify: kernel/migration tests so CI covers populated-before-`0006` (apply through `0005`, insert ≥2 `comment_bank` rows same org, apply `0006`, assert unique `operation_id = id`).
- Inspect: `packages/db/src/migrations/0005_mature_sasquatch.sql`, `packages/db/src/migrations/meta/_journal.json`.
- Do **not** create `scripts/verify-d1-release-state.mjs`. Commands live in the runbook.
- Do **not** add `/readyz`, maintenance-mode flags, backup services, or change `KernelCommentBankRow`.

## Implementation Steps

1. Re-query staging with `wrangler d1 execute <staging-name> --remote` (`SELECT name FROM d1_migrations ORDER BY name`, `PRAGMA table_info(comment_bank)`, counts). Abort if the name does not contain `staging`. Abort if a prod/pilot D1 now exists with populated pre-`0006` data.
2. Rewrite `0006` as SQLite table rebuild: new table with `operation_id` NOT NULL, `INSERT … SELECT …, id AS operation_id`, drop/rename, recreate `comment_bank_org_created_idx` and unique `comment_bank_org_operation_uidx`. No constant default. Keep the drizzle journal tag.
3. Add a regression test for the populated path (empty path is already covered by in-memory migrate). Do not use `pnpm db:migrate:deploy`.
4. **Populated upgrade (throwaway, not the live post-`0006` staging):** apply `0000`–`0005` only (temporarily keep `0006` out of `migrationsDir` **uncommitted**, or apply SQL via `wrangler d1 execute --remote` on a throwaway/recreated D1), seed synthetic `organization` + ≥2 `comment_bank` rows **without** `operation_id`, text `fixture-*` only (no student/PII copy, no prod export). Put `0006` back and apply. Verify `PRAGMA foreign_key_check`, `PRAGMA table_info`, `SELECT COUNT(DISTINCT operation_id)`, and that `operation_id = id`.
5. **Empty upgrade:** CI applies repaired `0006` on an empty libsql database. Live staging already applied this filename on empty tables (original ALTER). Destroy/recreate staging when operator secrets are present so Alchemy’s remaining apply of the filename is the table-rebuild; until then do not `alchemy deploy --stage staging`. Do not destroy until populated-upgrade evidence (counts/PRAGMA, not row text) is recorded outside the D1 (runbook/issue).
6. **Kernel write proof** on staging web origin after empty upgrade: session **new** login; POST `/api/comment-bank` with `Origin` equal to staging `CORS_ORIGIN` and a UUID `operationId`; replay same payload (idempotent 200); never wrangler-INSERT as the write proof; never weaken CORS. Evidence = status codes + counts, never cookies or token columns.
7. **Restore drill** on the recreated post-schema staging, separate from the populated-upgrade fixture:
   1. Quiesce: do not POST, do not `alchemy deploy`, optionally unbind/disable the staging Worker. Confirm counts stable twice.
   2. `wrangler d1 time-travel info <staging-name>` must succeed (window is 7 days Free / 30 days Paid). Record how to obtain the bookmark, not a durable ID in git.
   3. Insert one synthetic marker row (or rely on the POST from step 6), bookmark, then restore to the pre-marker bookmark.
   4. Read-only verify **before** any deploy or login: marker absent, schema still post-`0006`, `PRAGMA foreign_key_check`.
   5. `DELETE FROM session` (do not `SELECT` token columns). Then new login smoke. Bootstrap may create a new org — that is expected; do not hand-insert `membership`.
   6. Forbidden between restore and verify: `alchemy deploy` (re-applies migrations and undoes the restore).
8. Append observed RPO/RTO, commands (names not UUIDs), restore authority, and this stop list to the runbook: writes since bookmark are **lost** and must be re-entered; roll back **code** with deploy of last good commit; restore **data** only with Time Travel after quiesce. Never run restore against a name that does not contain `staging` during rehearsal.

## Success Criteria

- [x] Empty and populated representative `comment_bank` rows both survive the repaired `0006` (populated proven on a pre-`0006` fixture, not by inserting into post-`0006` staging).
- [x] Restore executed once with bookmark, operator quiesce, read-only SQL verify before deploy/login, session wipe, then new-login kernel POST with correct `Origin`.
- [x] Runbook append-only section records RPO/RTO, when to roll back code vs restore data, staging-name pin, `--remote` required, and that rehearsal never targeted prod/pilot.

## Risk Assessment

Assumption: staging remains the only teacher-os D1 and is disposable. Signal: a prod D1 or populated pre-`0006` ledger appears. Response: stop; do not rewrite `0006`; escalate rebuild-and-swap.

Assumption: D1 Time Travel is available on this account. Signal: `time-travel info` fails. Response: stop the restore drill; do not invent a backup exporter.

Assumption: operator-controlled staging has no concurrent writers. Signal: counts change during quiesce. Response: abort restore, re-quiesce.

<!-- Updated: Red Team Session 2026-08-20 - ledger branch, table rebuild, split drills, no verify script -->
