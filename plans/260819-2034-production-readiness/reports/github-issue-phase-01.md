## Parent

#28

## Scope

Implement the confirmed `app.<domain>` + `api.<domain>` topology in infra/auth, provision isolated staging D1, and write a secret-free production release/support runbook.

- Phase: `plans/260819-2034-production-readiness/phase-01-production-configuration-and-support-runbook.md`
- Depends on: none

## Acceptance criteria

- [ ] Runtime, CORS, Better Auth, Google redirect and cross-subdomain cookie settings resolve to one exact topology.
- [ ] Chrome and Safari smoke cover session/callback behavior.
- [ ] Isolated staging D1 exists; production/pilot data is never rehearsal target.
- [ ] Runbook defines preflight, deploy, rollback-code, GO/NO-GO and deploy/restore authority without secrets.
