---
title: "Phase 1: Core Org Resolver & Server Routes (TDD)"
status: todo
---

# Phase 1: Core Org Resolver & Server Routes (TDD)

## Overview

Implement `resolveLeadTargetOrg` and `loadPublishedPlacementSnapshot` in `apps/server/src/lib/resolve-lead-org.ts` and integrate them across `public-leads.ts`, `public-placement-test.ts`, `placement-test.ts`, and `kernel.ts`, driven by unit and integration tests.

## Requirements

- [x] `resolveLeadTargetOrg(db, { leadOrgId, teacherEmails })`:
  - Returns `null` if `leadOrgId?.trim()` is empty (fail-closed `503`).
  - Returns `leadOrgId.trim()` when `teacherEmails` is empty or has no active matching member.
  - When `teacherEmails` is non-empty, resolves `orgId` from `membership` joined with `user` (`inArray(membership.role, [...FINANCE_ROLES])`, `or(isNull(user.role), notInArray(user.role, ["student", "admin"]))`, and `lower(trim(user.email))` matching normalized `teacherEmails`), ordered by `TEACHER_EMAILS` position first, then `membership.createdAt ASC, membership.id ASC`. Does NOT filter `user.emailVerified = 1` in SQL so `AUTH_ASSUME_EMAIL_VERIFIED="true"` on staging works.
- [x] `loadPublishedPlacementSnapshot(db, targetOrgId, fallbackLeadOrgId)`:
  - Checks `targetOrgId` first; parses `published` via `normalizePublishedPlacementSnapshot`.
  - If `targetOrgId` has no valid published snapshot and `fallbackLeadOrgId !== targetOrgId`, falls back to `fallbackLeadOrgId`.
  - Returns `{ snapshot, publishedVersion, sourceOrgId } | null`.
- [x] `public-leads.ts` (`PublicLeadRouteDeps` adds `teacherEmails?: string[]`):
  - Resolves `leadOrgId` via `resolveLeadTargetOrg` for INSERT, daily cap check, 24h phone dedupe, UPDATE, and `notifyNewLead`.
- [x] `public-placement-test.ts` (`PublicPlacementTestRouteDeps` adds `teacherEmails?: string[]`):
  - `GET /`: uses `resolveLeadTargetOrg` + `loadPublishedPlacementSnapshot`.
  - `GET /audio/:id`: checks `targetOrgId` first; only falls back to `configuredLeadOrgId` when `configuredLeadOrgId !== targetOrgId` AND `loadPublishedPlacementSnapshot` indicates `targetOrgId` has NOT published its own test (`sourceOrgId === configuredLeadOrgId`), preventing cross-tenant `LEAD_ORG_ID` audio exposure after teacher publishes.
  - `POST /submissions`: uses `resolveLeadTargetOrg` for write org (daily cap, dedupe/merge on `lead`, `lead` insert, `placementTestSubmission` insert) and `loadPublishedPlacementSnapshot` for snapshot & version.
  - `PUT /submissions/:id/speaking-media` and `GET /results/:token`: scope lookup to `inArray(placementTestSubmission.orgId, unique([targetOrgId, configuredLeadOrgId]))` (and use `sub.orgId` for `speakingMediaKey` & CAS update) so in-flight fallback submissions remain valid across transition without opening arbitrary 3rd-org access.
- [x] `kernel.ts` & `placement-test.ts`:
  - `kernelRoutes` deps accepts `teacherEmails?: string[]` and passes it to `placementTestRoutes`.
  - `GET /api/placement-test` computes `isLeadOrg` against `resolveLeadTargetOrg(db, deps)`.

<!-- Updated: Red Team Session 1 - gate audio fallback on !teacherPublished, exclude student/admin user.role, scope capability routes to [targetOrgId, configuredLeadOrgId] -->

## Test Matrix (TDD)

1. `apps/server/src/lib/resolve-lead-org.test.ts`:
   - Empty/whitespace `leadOrgId` -> `null`.
   - Empty `teacherEmails` -> `leadOrgId`.
   - Non-empty `teacherEmails` with no matching user/membership -> fallback to `leadOrgId`.
   - Member with `ta`/`class_teacher` (outside `FINANCE_ROLES`) or `user.role = 'student'`/`'admin'` ignored; `teacher`/`owner`/`admin` membership roles accepted.
   - `emailVerified = false` still resolves (staging compatibility).
   - `TEACHER_EMAILS` ordering takes precedence; multiple memberships for same email pick earliest `(createdAt ASC, id ASC)`.
   - `loadPublishedPlacementSnapshot`: prefers `targetOrgId` published over `fallbackLeadOrgId`; falls back when `targetOrgId` has `null` or draft-only row; returns `null` when neither published.
2. `apps/server/src/routes/public-leads.test.ts`:
   - Drift scenario (`LEAD_ORG_ID = "org-qa"`, `teacherEmails = ["comy@x.vn"]` in `"org-teacher"`): `POST /public/leads` writes into `"org-teacher"`, sends email to `"comy@x.vn"`, appears in `GET /api/leads` for teacher in `"org-teacher"`, does NOT merge with existing `"org-qa"` lead with same phone, and `"org-qa"` leads stay hidden.
3. `apps/server/src/routes/leads-placement-submission.test.ts`:
   - Drift scenario: `GET /public/placement-test` & `GET /public/placement-test/audio/:id` fallback to `"org-qa"` published test when `"org-teacher"` hasn't published; `POST /submissions` + `PUT /speaking-media` write to `"org-teacher"` and appear in `GET /api/leads` & `GET /api/leads/:id/placement-submission`; `GET /results/:token` returns graded result; once `"org-teacher"` publishes its own test, public route serves `"org-teacher"` test and `"org-qa"` audio returns 404; in-flight `"org-qa"` upload/result tokens remain valid.
4. `apps/server/src/routes/placement-test.test.ts`:
   - `GET /api/placement-test` returns `isLeadOrg: true` for active `TEACHER_EMAILS` org even when `leadOrgId` points to `"org-qa"`, and `isLeadOrg: false` for non-target org.

## Implementation Steps

1. Write failing unit tests in `apps/server/src/lib/resolve-lead-org.test.ts` and integration tests in `public-leads.test.ts`, `leads-placement-submission.test.ts`, `placement-test.test.ts`.
2. Create `apps/server/src/lib/resolve-lead-org.ts` with `resolveLeadTargetOrg` and `loadPublishedPlacementSnapshot`.
3. Update `apps/server/src/routes/public-leads.ts`, `apps/server/src/routes/public-placement-test.ts`, `apps/server/src/routes/placement-test.ts`, and `apps/server/src/routes/kernel.ts`.
4. Run `pnpm --filter server test` and verify all tests pass.

## Todo

- [x] Write TDD tests in `resolve-lead-org.test.ts`, `public-leads.test.ts`, `leads-placement-submission.test.ts`, `placement-test.test.ts`
- [x] Implement `apps/server/src/lib/resolve-lead-org.ts`
- [x] Wire resolver into `public-leads.ts`, `public-placement-test.ts`, `placement-test.ts`, `kernel.ts`
- [x] Verify `pnpm --filter server test` passes

## Verification

- `pnpm --filter server test`
