## Parent

#28

## Scope

Prove existing-data migration and recovery on isolated staging; resolve migration `0006` compatibility from real ledger evidence.

- Phase: `plans/260819-2034-production-readiness/phase-02-d1-migration-safety-and-recovery-drill.md`
- Depends on: #28 Phase 1

## Acceptance criteria

- [ ] Empty and populated `comment_bank` data survive selected upgrade path.
- [ ] Ledger determines a valid repair or a NO-GO/rebuild-and-swap escalation; no blind historical migration edit.
- [ ] Recovery drill records bookmark, write quiesce, RPO/RTO and reconciliation; auth/kernel smoke passes after restore.
- [ ] No rehearsal touches pilot/production data.
