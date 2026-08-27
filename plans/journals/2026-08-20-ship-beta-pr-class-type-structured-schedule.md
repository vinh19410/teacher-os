---
title: "Ship beta PR: class type + structured schedule"
date: 2026-08-20
summary: "ak:ship beta for issue #45: merged develop (TanStack rebase), 281/281 tests, pre-landing review SHIP 0 critical, 3 informational noted"
---

# Ship beta PR: class type + structured schedule

## What happened
- /ak:ship beta for issue #45: merged origin/develop into feat/class-type-structured-schedule — develop had moved (TanStack Query data layer + reauth landed concurrently, exactly the cross-plan coordination the plan flagged for repos/kernel.test.ts); merge clean, no conflicts.
- Re-verified merged state: 281/281 tests (web grew to 182 with query-client + reauth suites), biome 0 errors, check-types 5/5, build 2/2. Post-merge worktrees must run `pnpm install` before testing or web suites fail on missing @tanstack/react-query.
- Pre-landing review verdict SHIP: 0 critical, 3 informational — (1) skills column default drift DB '' vs schema '[]' (RENAME keeps old default; runtime unaffected, server always writes explicit), (2) data-store-reducer add-class case is a spec-mirror locked by tests (production read path is data-provider→mapKernelSnapshot), (3) parseSchedule tolerates hand-edited unsorted/dup days (cosmetic). All documented in the PR body rather than fixed, per advisory counsel.

## Decision
- Ship the 2-commit feature branch to develop as a beta PR; defer the 3 informational findings (each is either out-of-scope migration work, architecture clarification, or cosmetic).
- Review hardening from the earlier pass (e0d37c5): skills array bounded + unique; server rejects start==end like the modal — overnight end<start stays valid.

## Next steps
- PR review (/ak:review-pr --fix --reply), ready-to-ship-beta label, merge, watch develop CI.
- Deploy sequence when promoting: stop server → migrate 0007 → deploy server+web together; expect a short stale-bundle 400 window (accepted pre-pilot).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
