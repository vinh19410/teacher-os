---
phase: 2
title: "D1 migration safety and recovery drill"
status: pending
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 2: D1 migration safety and recovery drill

## Overview

Prove an existing-data upgrade and restoration procedure on a non-production D1 database before pilot data exists.

## Requirements

- Inspect D1 migration ledger and release database state before changing any historical SQL; decide the compatible path for `0006` before applying it to data.
- Exercise representative data migration (both empty and populated `comment_bank`), `foreign_key_check`, kernel read/write smoke, recovery and post-restore verification on non-production.
- Record actual RPO/RTO, recovery bookmark, write-quiesce/reconciliation steps, decision owner, command references (without IDs/secrets), and stop condition in the runbook.

## Architecture

Alchemy points D1 at `packages/db/src/migrations` (`packages/infra/alchemy.run.ts:11-13`). The platform provides D1 recovery/Time Travel; this phase operationalizes it rather than building a backup service. Any migration correction after a live apply is a new forward migration.

## Related Code Files

- Modify: `docs/production-release-runbook.md`.
- Inspect: `packages/db/src/migrations/0005_mature_sasquatch.sql`, `packages/db/src/migrations/0006_pink_ender_wiggin.sql`, `packages/db/src/migrations/meta/_journal.json`.
- Optional create: `scripts/verify-d1-release-state.mjs` only if a secret-free, repeatable check cannot live in the runbook.

## Implementation Steps

1. Confirm `0005`/`0006` ledger status and whether the candidate stage has populated `comment_bank`; never infer from source alone.
2. Decide the repair path before migration: if `0006` has not been applied to any environment whose history must stay compatible, make that pending migration existing-data-safe with unique backfill values. If it has been applied anywhere and another database has populated data before `0006`, declare NO-GO and submit a separately reviewed copy/rebuild-and-swap repair; a forward migration after `0006` cannot unblock the earlier ledger. Stop if ledger evidence is ambiguous.
3. Create/copy a non-production representative database by the approved operator procedure; record a recovery bookmark before testing.
4. Apply the selected path against both empty and populated `comment_bank`; validate ledger, `PRAGMA foreign_key_check`, auth bootstrap and kernel write/reload.
5. Quiesce mutations by the approved maintenance procedure, rehearse restore to the recorded point, measure recovery time, then rerun smoke and document how writes since the bookmark are reconciled.
6. Add observed result, actual RPO/RTO, restore authority and escalation decision to the runbook.

## Success Criteria

- [ ] Empty and populated representative rows both survive the selected upgrade path.
- [ ] Restore procedure is executed once with a recorded bookmark, write-quiesce and post-restore kernel/auth smoke pass.
- [ ] Runbook says when to roll back code versus restore data and reconcile writes; no destructive command is run against pilot data during rehearsal.

## Risk Assessment

Assumption: Phase 1 provisions isolated staging before this phase. Signal: no safe target or authority. Response: block production UAT; do not rehearse on pilot/production.
