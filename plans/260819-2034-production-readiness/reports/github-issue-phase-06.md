## Parent

#28

## Scope

Run controlled live release/UAT after Phase 1–5 gates; make GO/NO-GO evidence-based.

- Phase: `plans/260819-2034-production-readiness/phase-06-execute-live-uat-and-record-release-evidence.md`
- Depends on: all prior child issues

## Acceptance criteria

- [ ] Incognito Google sign-in → bootstrap → syllabus/class → class-detail add student → roster → reload → sign-out/sign-in passes on Worker + D1.
- [ ] `/readyz`, liveness and negative-origin auth/kernel matrix have sanitized evidence.
- [ ] Browser-only block of `/api/kernel` renders blocking error; unblocking + retry recovers without server outage.
- [ ] Evidence records sanitized URL, SHA, migration/readiness, timestamp, runner and per-step result.
- [ ] Any failed GO condition produces NO-GO and a blocker issue.
