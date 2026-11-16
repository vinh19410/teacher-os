---
title: "Phase 2: E2E Regression, Docs & Full Verification"
status: todo
---

# Phase 2: E2E Regression, Docs & Full Verification

## Overview

Add E2E regression `apps/e2e/specs/placement-lead-org-drift.spec.ts` covering `TEACHER_EMAILS` org drift, run targeted placement/lead E2E specs + capture 3-viewport POT screenshots, update `docs/production-release-runbook.md` and `CHANGELOG.md`, and pass all local quality gates.

## Requirements

- [x] Extend `apps/e2e/src/boot.ts` with an isolated E2E-only control (`POST /__e2e/teacher-emails` mutating the shared `teacherEmails` array passed to `createAuth` and `buildApp`) so Playwright can simulate `TEACHER_EMAILS` drift cleanly.
- [x] Add `apps/e2e/specs/placement-lead-org-drift.spec.ts` with strict shard/spec isolation:
  - `test.beforeEach` & `test.afterEach` reset `teacherEmails` to `[]`, clear `ip_hash` rate-limit markers, and clean up `e2e-lead-org` placement/lead rows seeded by the test.
  - Signs up a fresh teacher via `/api/auth/sign-up/email`, marks `user.email_verified = 1` in `local.db` before navigating to `/dashboard`, enables `TEACHER_EMAILS = [teacherEmail]` via `/__e2e/teacher-emails`, and loads `/dashboard` so `bootstrapMiddleware` creates a fresh org (`ctx.orgId != "e2e-lead-org"`).
  - Seeds an old QA lead & published placement test in `e2e-lead-org`.
  - Verifies `/placement-test` has no org-mismatch warning banner (`isLeadOrg === true`).
  - Submits an entry test on `apps/profile` (`/kiem-tra-dau-vao/`) using the fallback published test from `e2e-lead-org`.
  - Opens `/leads` in `apps/web`, verifies the new lead & submission appear while the old QA lead from `e2e-lead-org` does NOT leak, opens detail modal, and captures POT screenshots at `1440×900`, `768×1024`, `375×812` + modal light/dark under `plans/reports/`.
- [x] Update `docs/production-release-runbook.md` (document automatic `TEACHER_EMAILS` active-org resolution + `LEAD_ORG_ID` fail-closed/fallback contract) and `CHANGELOG.md` (`## 2026-11-16` / `### Fixed`).
- [x] Run targeted E2E specs (`placement-lead-org-drift.spec.ts`, `profile-placement-test.spec.ts`, `profile-lead-intake.spec.ts`) using isolated E2E ports (`8100`/`8101`/`8103`/`8104`/`8105`).
- [x] Run full local gates: `pnpm exec biome check .`, `CI=1 pnpm check-types`, `CI=1 pnpm test`, `CI=1 pnpm build`.

<!-- Updated: Red Team Session 1 - add beforeEach/afterEach reset, email_verified=1 before dashboard bootstrap, clearRateLimits, and e2e-lead-org cleanup -->

## Todo

- [x] Update `apps/e2e/src/boot.ts` with `/__e2e/teacher-emails`
- [x] Write `apps/e2e/specs/placement-lead-org-drift.spec.ts`
- [x] Update `docs/production-release-runbook.md` and `CHANGELOG.md`
- [x] Run targeted E2E specs and verify POT screenshots
- [x] Run `pnpm exec biome check .`, `CI=1 pnpm check-types`, `CI=1 pnpm test`, `CI=1 pnpm build`

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e placement-lead-org-drift.spec.ts profile-placement-test.spec.ts profile-lead-intake.spec.ts`
- `pnpm exec biome check . && CI=1 pnpm check-types && CI=1 pnpm test && CI=1 pnpm build`
