---
phase: 3
title: "Phase 3: Cross-Workspace Verification & Build"
status: completed
priority: P1
effort: "0.5h"
dependencies: [1, 2]
---

# Phase 3: Cross-Workspace Verification & Build

## Goal

Verify formatting/linting, TypeScript types across the monorepo (including `@teacher-os/auth`), server/auth/LMS tests, production Vite client builds (confirming zero server-module leakage from `@teacher-os/auth/session-cache`), and a focused Playwright E2E auth-resilience test simulating transient `429`/`503` `/api/auth/get-session` failures during student navigation and reload.

## Files to Create / Modify

- Create (or extend): `apps/e2e/specs/student-auth-resilience.spec.ts` (focused single-spec E2E proving issue #890 recovery — do NOT run full E2E suite locally per `AGENTS.md` <!-- Red-Team RT-13 -->).

## Tasks & Steps

### Task 3.1 — Run workspace lint, typecheck (incl. `@teacher-os/auth`), and affected package tests
- **Goal:** Prove formatting, lint rules, types, and unit tests are green across all touched and downstream packages.
- **Target files and symbols:** Workspace-wide (`packages/auth`, `apps/student`, `apps/web`, `apps/admin`, `apps/lms`, `apps/server`).
- **Steps:**
  1. Run `pnpm check` (`biome check .`); if any formatting/lint issue is reported, fix with `pnpm check:fix` and re-verify with `pnpm check` <!-- Red-Team RT-12 -->.
  2. Run `pnpm check-types` and strict standalone typecheck on `packages/auth/src/session-cache.ts` <!-- Red-Team RT-12 / Kongming CP2 -->.
  3. Run unit tests for `@teacher-os/auth`, `student`, `web`, `admin`, `lms`, and `server` auth/admin tests (`src/auth-roundtrip.test.ts`, `src/auth-role-roundtrip.test.ts`, `src/lib/require-admin.test.ts`).
- **Success criteria:** Biome check exits 0, `pnpm check-types` + standalone `session-cache.ts` `tsc --noEmit` exit 0, and all targeted test suites pass with 0 failures.
- **Verify:** `pnpm check && pnpm check-types && pnpm exec tsc --noEmit --strict --noUncheckedIndexedAccess --verbatimModuleSyntax --skipLibCheck --target ESNext --module ESNext --moduleResolution bundler packages/auth/src/session-cache.ts && pnpm --filter @teacher-os/auth test && pnpm --filter student test && pnpm --filter web test && pnpm --filter admin test && pnpm --filter lms test && pnpm --filter server test -- src/auth-roundtrip.test.ts src/auth-role-roundtrip.test.ts src/lib/require-admin.test.ts` exits 0.

### Task 3.2 — Verify Vite production client builds for all portals + unified LMS
- **Goal:** Prove importing `@teacher-os/auth/session-cache` from browser apps bundles cleanly without pulling in Node/server/DB modules (`drizzle-orm`, `@teacher-os/db`, `better-auth` server).
- **Target files and symbols:** `apps/student`, `apps/web`, `apps/admin`, `apps/lms`.
- **Steps:**
  1. Run Vite production builds for `student`, `web`, `admin`, and `lms` (with `VITE_SERVER_URL=http://localhost:8000`).
- **Success criteria:** All 4 Vite builds exit 0 without bundling errors or unresolved Node builtin warnings from `@teacher-os/auth/session-cache`.
- **Verify:** `VITE_SERVER_URL=http://localhost:8000 pnpm --filter student build && VITE_SERVER_URL=http://localhost:8000 pnpm --filter web build && VITE_SERVER_URL=http://localhost:8000 pnpm --filter admin build && VITE_SERVER_URL=http://localhost:8000 pnpm --filter lms build` exits 0.

### Task 3.3 — Write and run focused single-spec Playwright E2E auth-resilience test (isolated ports)
- **Goal:** Prove end-to-end against the real Hono + Better-Auth + Vite preview LMS stack that transient `429` and `503` responses on `/api/auth/get-session` do NOT kick an active student to `/login?returnUrl=` during navigation or reload, while genuine `200 null` still redirects to `/login?returnUrl=` <!-- Red-Team RT-13 -->.
- **Target files and symbols:** `apps/e2e/specs/student-auth-resilience.spec.ts` (new focused spec).
- **Steps:**
  1. Create `apps/e2e/specs/student-auth-resilience.spec.ts` reusing `seedStudent` / `STUDENT_BASE_URL` helpers from `apps/e2e/specs/helpers.ts` and `origins.ts`:
     - Test 1 (Warm SPA navigation resilience): Sign in student -> load `/student/practice/listening` -> advance past cache TTL or wait/intercept `/api/auth/get-session` with `page.route` returning HTTP `503` (and `429`) -> navigate across student routes (e.g., `/student/practice/reading`, `/student/practice/listening`) -> assert URL NEVER visits `/login` and student content renders cleanly.
     - Test 2 (Cold reload retry recovery): Intercept `/api/auth/get-session` so the 1st request returns HTTP `503` and the 2nd request continues to the real server -> `page.reload()` -> assert student lands back on `/student/practice/listening` without visiting `/login?returnUrl=`.
     - Test 3 (Fail-closed on genuine unauthenticated): Clear cookies / return `200 null` on `/api/auth/get-session` -> reload `/student/practice/listening` -> assert redirect to `/login?returnUrl=%2Fstudent%2Fpractice%2Flistening`.
  2. Confirm E2E override ports (`8100`, `8101`, `8103`, `8104`, `8105`) are free.
  3. Run `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/student-auth-resilience.spec.ts`.
  4. Confirm no orphan background processes remain on those ports.
- **Success criteria:** Focused E2E spec passes all 3 cases and leaves ports clean.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/student-auth-resilience.spec.ts` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
