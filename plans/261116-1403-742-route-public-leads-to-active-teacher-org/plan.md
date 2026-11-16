---
title: "742-route-public-leads-to-active-teacher-org"
description: "Route public leads and placement test reads/submissions to the active TEACHER_EMAILS org while preserving fail-closed LEAD_ORG_ID and fallback placement test loading"
status: completed
priority: P1
effort: "4h"
tags: [bugfix, server, leads, placement-test, tdd]
created: 2026-11-16
---

# Fix: Route Public Leads & Placement Submissions to Active Teacher Org (#742)

## Outcome & Root Cause

- **Issue:** [#742](https://github.com/vinh19410/teacher-os/issues/742) (`fix(server): route public leads and placement submissions to active teacher org`)
- **Root Cause (proven):**
  1. `LEAD_ORG_ID` on staging holds an older QA organization UUID created before `TEACHER_EMAILS` was enforced.
  2. When an allowlisted teacher (`TEACHER_EMAILS`) logs in via `bootstrapMiddleware` (`apps/server/src/app.ts:258-313`), they receive a separate active organization (`ctx.orgId != LEAD_ORG_ID`).
  3. `public-leads.ts` (`POST /public/leads`) and `public-placement-test.ts` (`GET /`, `GET /audio/:id`, `POST /submissions`, `PUT /submissions/:id/speaking-media`, `GET /results/:token`) read and write solely against `deps.leadOrgId` instead of resolving the active `TEACHER_EMAILS` org, while `GET /api/leads` (`apps/server/src/routes/leads.ts:267`) queries `ctx.orgId`.
  4. `GET /api/placement-test` (`apps/server/src/routes/placement-test.ts:167-170`) compares `deps.leadOrgId === ctx.orgId` directly for `isLeadOrg`, producing a false org-mismatch warning.

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Add `resolveLeadTargetOrg` & `loadPublishedPlacementSnapshot` in `apps/server/src/lib/resolve-lead-org.ts` and wire them into `public-leads.ts`, `public-placement-test.ts`, `placement-test.ts`, and `kernel.ts` with full TDD unit/integration tests. | P1 |
| 2 | Add E2E regression `apps/e2e/specs/placement-lead-org-drift.spec.ts`, verify existing placement/lead E2E specs, capture 3-viewport POT screenshots, and update `docs/production-release-runbook.md` & `CHANGELOG.md`. | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: Core Org Resolver & Server Routes (TDD)](./phase-01-start.md) | Pending |
| 2 | [Phase 2: E2E Regression, Docs & Full Verification](./phase-02-e2e-and-docs.md) | Pending |

## Success Criteria

- [ ] Fail-closed `503 LEAD_INTAKE_DISABLED` / `503 PLACEMENT_DISABLED` preserved when `LEAD_ORG_ID` is empty.
- [ ] When `TEACHER_EMAILS` has an active `FINANCE_ROLES` (`teacher`, `owner`, `admin`) member (excluding `student`/`admin` user roles; no SQL `user.email_verified = 1` filter for staging `AUTH_ASSUME_EMAIL_VERIFIED="true"` compatibility), `POST /public/leads`, `POST /public/placement-test/submissions`, `PUT /submissions/:id/speaking-media`, `GET /results/:token`, and `notifyNewLead` route to the active teacher org (ordered by `TEACHER_EMAILS` position, then `membership.createdAt ASC, membership.id ASC`).
- [ ] Public test & audio (`GET /public/placement-test`, `POST /submissions` grading snapshot, `GET /public/placement-test/audio/:id`) fall back to `LEAD_ORG_ID` ONLY when the active teacher org has not published its own test, and automatically prefer/isolate the teacher org once published; capability endpoints (`speaking-media`, `results/:token`) accept submissions in either `[targetOrgId, configuredLeadOrgId]` so in-flight fallback submissions do not break on transition; old QA leads in `LEAD_ORG_ID` are never merged or exposed.
- [ ] `GET /api/placement-test` `isLeadOrg` reflects the resolved target org.
- [ ] Unit/integration tests (`resolve-lead-org.test.ts`, `public-leads.test.ts`, `leads-placement-submission.test.ts`, `placement-test.test.ts`, `pnpm --filter server test`) pass.
- [ ] Targeted E2E (`placement-lead-org-drift.spec.ts`, `profile-placement-test.spec.ts`, `profile-lead-intake.spec.ts`), `pnpm exec biome check .`, `CI=1 pnpm check-types`, `CI=1 pnpm test`, and `CI=1 pnpm build` pass.

## Red Team Review

### Session — 2026-11-16
**Findings:** 12 total across 2 lenses (Security Adversary: 7; Assumption Destroyer: 5; 2 overlapping on E2E email verification) -> 8 accepted/partially accepted, 4 rejected/deferred as out-of-scope.

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | Unconditional audio fallback exposes `LEAD_ORG_ID` audio after teacher publishes | Critical | Accept (gate fallback on `!teacherHasPublished`) | Phase 1 |
| 2 | `resolveLeadTargetOrg` missing `user.role` & `emailVerified` guards | Critical | Partial Accept (exclude `user.role IN ('student','admin')`; keep no SQL `emailVerified` filter per #742 staging requirement) | Phase 1 |
| 3 | E2E `403 TEACHER_EMAIL_UNVERIFIED` deadlock on fresh sign-up under `TEACHER_EMAILS` | Critical | Accept (set `email_verified = 1` before `/dashboard` bootstrap) | Phase 2 |
| 4 | Priority divergence vs `bootstrapMiddleware` / `student-provisioning.ts` | High | Documented boundary (single-org primary teacher converges; keep #742 order) | Phase 1 |
| 5 | No version pinning between `GET /` and `POST /submissions` on transition | High | Reject (requires out-of-scope public schema/client contract change) | — |
| 6 | E2E global `teacherEmails` mutation poisoning across specs | High | Accept (`beforeEach` + `afterEach` reset in `placement-lead-org-drift.spec.ts`) | Phase 2 |
| 7 | `notifyNewLead` emails non-allowlisted members in `targetOrgId` | Medium | Documented boundary (single-org teacher membership; out of #742 scope) | — |
| 8 | Global `ip = "unknown"` rate-limit collision across E2E specs | High | Accept (`clearRateLimits()` in `beforeEach` and `afterEach`) | Phase 2 |
| 9 | Shared `e2e-lead-org` DB primary-key & lead count collisions | High | Accept (cleanup before seeding & in `afterEach`) | Phase 2 |
| 10 | Capability endpoints (`speaking-media`, `results/:token`) break across fallback->teacher transition | High | Accept (scope lookup to `[targetOrgId, configuredLeadOrgId]`) | Phase 1 |

## Validation Log

### Session — 2026-11-16
- Verification Results: Passed all codebase fact checks (`app.ts`, `index.ts`, `kernel.ts`, `public-leads.ts`, `public-placement-test.ts`, `placement-test.ts`, `leads.ts`, `lead-notify.ts`, `packages/auth/src/role.ts`, `packages/db/src/schema/*`, `apps/e2e/src/boot.ts`, `apps/e2e/specs/helpers.ts`). Failed: 0.
- Consistency Sweep: Phase 1 and Phase 2 cover every acceptance criterion in Issue #742 and incorporate all accepted red-team mitigations. Proceed to TDD implementation.

<!-- slug: 742-route-public-leads-to-active-teacher-org -->
