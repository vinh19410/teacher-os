## Parent

#28

## Scope

Add `/readyz` that proves Worker plus required D1 schema without auth, bootstrap side effects or internal-error leakage.

- Phase: `plans/260819-2034-production-readiness/phase-03-add-database-readiness-endpoint.md`
- Depends on: #28 Phase 1

## Acceptance criteria

- [ ] Healthy Worker + required schema returns `200`.
- [ ] D1 error or missing schema returns generic `503`.
- [ ] Probe has no auth/org bootstrap side effect and no secret/PII detail.
- [ ] Handler tests and root quality gates pass.
