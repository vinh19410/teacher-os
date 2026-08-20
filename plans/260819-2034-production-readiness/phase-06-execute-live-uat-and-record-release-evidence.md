---
phase: 6
title: "Live UAT and release evidence"
status: pending
priority: P1
effort: "1-2d"
dependencies: [1, 2, 3, 4, 5]
---

# Phase 6: Live UAT and release evidence

## Overview

Run the approved controlled release and browser UAT against the actual stage, then make an evidence-backed GO/NO-GO decision for pilot-ready class operations.

## Requirements

- Use an incognito browser; verify Google OAuth, session cookie, bootstrap, CORS and data persistence. Use a browser-only fault injection procedure, never take production server offline to create evidence.
- Record URL, commit SHA, migration/readiness result, timestamp, runner, pass/fail per step and sanitized diagnostics in the parent issue/runbook.
- Exercise a browser-blocked first-snapshot failure path; it must show retry/error, not an empty workspace.

## Architecture

This is a manual acceptance gate, not a flaky production OAuth CI test. `/readyz` proves runtime/D1 before authenticated flow; browser UAT proves the cross-origin auth/cookie contract; server/kernel tests remain regression protection.

## Related Code Files

- Modify: `docs/project-roadmap.md` only after all gate evidence passes.
- Modify: `docs/production-release-runbook.md` with observed evidence links and deviations.
- GitHub: parent issue and its UAT child issue; no secrets, raw cookies, database IDs or student data.

## Implementation Steps

1. Run local CI-equivalent checks and the runbook preflight.
2. Deploy approved production stage using the authorized operator, then confirm `/readyz` and root liveness.
3. In incognito, perform Google sign-in → new org bootstrap → create syllabus → create class → use class-detail Add Student (creates enrollment/package) → confirm the new student appears in the class roster → hard reload → sign-out/sign-in.
4. Verify negative-origin matrix: kernel write, auth sign-out and enabled email/password auth mutation have expected rejection/redirect behavior without recording cookies.
5. Block only the browser request to `/api/kernel` through DevTools/network tooling; verify blocking error, remove the rule, retry successfully and confirm no server outage.
6. Record sanitized evidence, compare every result with the GO conditions, and declare GO or NO-GO.

## Success Criteria

- [ ] All UAT steps pass on real Worker + D1, not local libSQL.
- [ ] Data survives hard reload and renewed session.
- [ ] Any failed GO condition results in NO-GO with a new blocker issue; no pilot starts on an ambiguous result.
- [ ] Roadmap milestone status and parent issue accurately link evidence.

## Risk Assessment

Live test requires an approved identity and deployment authority. Signal: credentials, stage or restore authority missing. Response: keep NO-GO, do not substitute local tests or weaken browser/production checks.
