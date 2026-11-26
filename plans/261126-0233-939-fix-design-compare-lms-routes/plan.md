---
title: "Fix design:compare harness for unified apps/lms portal routes (#939)"
description: "Migrate scripts/design-compare and apps/e2e/scripts/design-seed.ts from legacy 2-port Vite dev servers to unified isolated-dist apps/lms + serve-lms.mjs with /teacher and /student base paths and regression tests."
status: completed
priority: P1
effort: "2h"
tags: [bugfix, design-compare, lms, harness, issue-939]
created: 2026-11-26
issue: 939
---

# Fix design:compare harness for unified apps/lms portal routes (#939)

## Overview

After portal unification (`e933d3c2`, `889fe997`, `ce74fc46`), `apps/web` mounts at `/teacher/`, `apps/student` mounts at `/student/`, `apps/lms` serves the root auth/pay gateway (`/login`, `/forgot-password`, `/verify-email`, `/pay/$token`) plus all portal shells on a single origin (`LMS_ORIGIN`), and `apps/e2e/src/boot.ts` trusts only `LMS_ORIGIN`. `scripts/design-compare/capture.mjs` and `apps/e2e/scripts/design-seed.ts` remained on the legacy 2-port Vite dev model (`WEB_PORT` + `STUDENT_PORT`), causing `pnpm design:compare` to time out waiting for `http://localhost:<studentPort>/login` and breaking teacher bootstrap, login selectors, and screen routing.

This plan migrates the `design:compare` harness to the unified 2-port architecture (`API_PORT` + `LMS_PORT`), builds `apps/lms` (with `LMS_SKIP_PORTAL_ASSEMBLE=1`), `apps/web`, and `apps/student` into an isolated `<STATE>/lms-dist` directory served via `startLmsServer({ distDir, host: "127.0.0.1", port })` from `apps/lms/scripts/serve-lms.mjs` (never touching shared `apps/*/dist`), updates `design-seed.ts` to seed the teacher via `/__e2e/seed-user` + `/api/auth/sign-in/email` with `#652` deadline/redirect/redaction guards and sign up the student on unified `/login`, and adds TDD regression tests guarding env sanitization, strict URL resolution, origin-anchored landing regexes, and `screens.json` ↔ router route alignment across root, teacher, and student portals.

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - `scripts/design-compare/harness-lib.mjs` (`buildChildEnv`, `reserveFreePort`, `resolveAppScreenUrl`, `buildTeacherDashboardRegex`, `buildStudentLandingRegex`)
  - `scripts/design-compare/capture.mjs` (2-port `API_PORT`/`LMS_PORT` with zero-TOCTOU port reservation across build, isolated `<STATE>/lms-dist` build for `lms`/`web`/`student`, `startLmsServer` on `127.0.0.1`, hardened `waitUrl` on `127.0.0.1` with `Accept: text/html` + `redirect: "error"` + per-request timeout, pre-auth `ipv6LoopbackListening` checks on both ports, unified `/login` auth capture with anchored regexes, `resolveAppScreenUrl`, encoded `fill()`, cleanup of `<STATE>/lms-dist`)
  - `apps/e2e/scripts/design-seed.ts` (teacher seed via `POST /__e2e/seed-user` + `POST /api/auth/sign-in/email` with `maxRedirects: 0`, `clampTimeoutMs`, `redactCapabilityUrl`, session cookie assertion, fail-fast `/login` redirect check in kernel loop, and `${TEACHER_BASE_URL}/dashboard` bootstrap/rescue; student signup on `${LMS_ORIGIN}/login` via `#panel-signup button[type='submit']`)
  - `scripts/design-compare.test.mjs` (unit tests for sanitized `buildChildEnv`, `reserveFreePort`, strict `resolveAppScreenUrl`, `buildTeacherDashboardRegex`, `buildStudentLandingRegex`, and full 36-screen `screens.json` drift check against `apps/lms/src/routes-matcher.ts` + `apps/student/src/routeTree.gen.ts`)
- **Explicit Non-Goals:**
  - No edits to `packages/auth/*`, `apps/lms/src/*`, `apps/lms/scripts/*`, `apps/e2e/src/boot.ts`, `apps/e2e/playwright.config.ts`, `apps/web/*`, `apps/student/*`, or `scripts/design-compare/fetch-design.sh`.
  - No new CLI flags or legacy Vite dev fallback mode for `design:compare`.
  - No full E2E suite run locally (per `AGENTS.md`).

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Add pure, TDD-verified helpers for sanitized unified LMS env, port reservation, fail-closed screen URL resolution, origin-anchored landing regexes, and 36-screen route drift detection | P1 |
| 2 | Migrate `capture.mjs` and `design-seed.ts` to isolated-dist 2-port unified `apps/lms` + `startLmsServer` and verify `pnpm design:compare` succeeds end-to-end | P1 |

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Phase 1: Pure Harness Helpers & Regression Tests](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Unified LMS Boot, Capture & Seed Migration](./phase-02-unified-lms-capture-seed.md) | Completed |

## Success Criteria

- [x] `pnpm test:design-compare` passes 100%, including regression tests for sanitized `buildChildEnv`, `reserveFreePort`, fail-closed `resolveAppScreenUrl`, `buildTeacherDashboardRegex`, `buildStudentLandingRegex`, and 36-screen `screens.json` alignment with `apps/lms/src/routes-matcher.ts` and `apps/student/src/routeTree.gen.ts`.
- [x] `pnpm --filter e2e test` and `pnpm --filter e2e check-types` pass with 0 errors.
- [x] `pnpm exec biome check scripts/ apps/e2e/` passes with 0 errors.
- [x] Live run of `pnpm design:compare --side app --force --screens login-teacher,t-dashboard,s-dashboard` and full `pnpm design:compare --side app --force` exit 0 with no `errors.log`, no orphaned `boot:api`/`serve-lms`/`vite` processes, and no pollution of `apps/{lms,web,student,admin}/dist`.

## Red Team Review

### Session — 2026-11-26
**Reviewers:** Security Adversary (Fact Checker) + Assumption Destroyer (Fact Checker) — parallel independent subagents.
**Findings:** 5 deduplicated (5 accepted, 0 rejected)
**Severity breakdown:** 1 Critical, 4 High, 0 Medium (after merging overlapping findings)

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | TOCTOU 240s port-hijack window on `LMS_PORT`/`API_PORT`, `waitUrl` SSRF/tarpit, and late IPv6 check | Critical | Accept | Phase 1, Phase 2 |
| 2 | `process.env` inheritance poisoning in `buildChildEnv` (`LMS_SKIP_PORTAL_ASSEMBLE`, `E2E_TEACHER_EMAILS`, `E2E_STUDENT_PORT`) and `apiPort` `"undefined"` bug | High | Accept | Phase 1, Phase 2 |
| 3 | In-place overwriting/poisoning of shared `apps/{lms,web,student,admin}/dist` with ephemeral `API_PORT` and debug flags | High | Accept | Plan, Phase 2 |
| 4 | `resolveAppScreenUrl` missing traversal/origin checks, `auth === undefined` fail-open, unencoded `fill()`, and student phantom test / teacher prefix mismatch in drift test | High | Accept | Phase 1, Phase 2 |
| 5 | Unanchored teacher login regex, no-op `waitForURL` in `design-seed.ts`, and missing `maxRedirects: 0` / `SEED_DEADLINE` / redaction on teacher seed & sign-in | High | Accept | Phase 1, Phase 2 |

## Validation Log

### Session 1 — 2026-11-26
### Verification Results
- **Tier:** Light (2 phases; Fact Checker active across all cited files, symbols, lines, and routes)
- **Claims checked:** 18
- **Verified:** 18 | **Failed:** 0 | **Unverified:** 0
- **CLI format validation:** `ak plan validate plans/261126-0233-939-fix-design-compare-lms-routes --json` → `valid: true`, `errors: null`.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-unified-lms-capture-seed.md`
- Decision deltas checked: 5 (isolated `<STATE>/lms-dist` build + `startLmsServer`, `reserveFreePort` + post-build `LMS_PORT` + hardened `waitUrl`, sanitized `buildChildEnv`, fail-closed `resolveAppScreenUrl` + real student `routeTree.gen.ts` drift test + `encodeURIComponent` in `fill()`, `buildTeacherDashboardRegex` + `#652`-compliant `design-seed.ts` teacher auth/fail-fast kernel loop)
- Reconciled stale references: 5 (removed all references to `LMS_REBUILD_PORTALS=1`, `pnpm --filter lms run serve`, `seedUserViaE2e` raw call, `auth === undefined` fallback, and unanchored `/\/teacher\/dashboard/`)
- Unresolved contradictions: 0

<!-- slug: 939-fix-design-compare-lms-routes -->
