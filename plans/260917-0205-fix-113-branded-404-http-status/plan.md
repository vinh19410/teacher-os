---
title: "fix-113-branded-404-http-status"
description: "Fix issue #113: [QC][P1] 404 trắng trơn, HTTP 200 — render branded TeacherOS 404 UI and return HTTP 404 status code for unknown routes and dotfiles"
status: completed
priority: P1
effort: "3h"
tags: [qc, bugfix, 404, routing, worker, ui]
created: 2026-09-17
---

# fix-113-branded-404-http-status

## Overview

Issue #113 reported two related defects when accessing unknown paths like `/this-page-does-not-exist-qc-test`, `/help`, `/about`, `/signup`, `/register`, `/.env`, and `/.git`:
1. **Unbranded 404 UI**: TanStack Router rendered an unstyled 12px "Not Found" message on a blank white screen because no `notFoundComponent` was configured at the root route (`apps/web/src/routes/__root.tsx`) or router level (`apps/web/src/main.tsx`).
2. **HTTP 200 Status Code**: Cloudflare Workers Static Assets served `index.html` with status HTTP 200 for every unmatched path because `packages/infra/alchemy.run.ts` set `notFoundHandling: "single-page-application"` on `Cloudflare.Website.Vite("web")` with no worker routing entry (`main: undefined`).

This plan provides a clean, defense-in-depth fix across the UI and edge layers:
- Render a calm, responsive, branded TeacherOS 404 page with logo, Vietnamese copy, 404 heading, and navigation buttons ("Về bảng điều khiển", "Đăng nhập").
- Wire `notFoundComponent` into `__root.tsx` and `createRouter` while preserving sub-route entity 404 handlers (e.g. `$studentId.tsx` "Không tìm thấy học viên").
- Implement `apps/web/src/routes-matcher.ts` defining exhaustive exact routes, dynamic prefix routes, static assets, and dotfiles.
- Deploy an edge Worker script `apps/web/src/worker.ts` configured in `packages/infra/alchemy.run.ts` (`main: "src/worker.ts"`, `notFoundHandling: "none"`):
  - Block dotfiles (`/.env`, `/.git`) immediately with HTTP 404 plain text.
  - Serve static assets directly from `ASSETS`.
  - Serve known valid routes (`/`, `/login`, `/dashboard`, `/classes/*`, `/students/*`, etc.) with HTTP 200.
  - Return HTTP 404 for unknown routes: HTML requests get `index.html` with status 404 (mounting TanStack Router's branded UI), while non-HTML / curl requests get HTTP 404 plain text.
- Add Vite dev server middleware in `apps/web/vite.config.ts` so dev and E2E test runs mirror the same HTTP 404 behavior.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Render branded TeacherOS 404 page in TanStack Router when encountering any unmatched route | P1 |
| 2 | Return HTTP 404 status code on the wire for unknown routes and dotfiles (`curl` + browser) | P1 |
| 3 | Keep deep linking and page refresh on all valid routes (`/dashboard`, `/classes/*`, etc.) working with HTTP 200 | P1 |
| 4 | Add unit and E2E regression tests verifying both visual branding and HTTP status codes | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Branded 404 UI Component & TanStack Router Integration](./phase-01-branded-404-ui.md) | Completed |
| 2 | [Phase 2: Route Matcher, HTTP 404 Worker, Dev Middleware & E2E Tests](./phase-02-http-status-worker.md) | Completed |

## Success Criteria

- [x] Navigating to `/this-page-does-not-exist-qc-test`, `/help`, `/about`, `/signup`, `/register` renders the branded TeacherOS 404 UI (logo, heading, Vietnamese message, navigation buttons).
- [x] Sub-route 404 handlers (`$studentId.tsx`, `$classId.tsx`, `$syllabusId.tsx`, `$assignmentId.tsx`) remain intact and continue rendering their entity-specific cards.
- [x] `curl -i` to `/this-page-does-not-exist-qc-test` returns HTTP 404 status code.
- [x] `curl -i` to `/.env` and `/.git` returns HTTP 404 status code (plain text, never SPA HTML).
- [x] Direct navigation to valid routes (`/`, `/login`, `/dashboard`, `/schedule`, `/students`, `/classes`, `/tuition`, `/reports`, `/profile`, `/settings`, and dynamic IDs) returns HTTP 200.
- [x] Unit tests for `NotFoundPage`, `routes-matcher`, and `worker` pass.
- [x] Playwright E2E specs for 404 UI and HTTP status pass.
- [x] All existing test suites (`pnpm test`, `pnpm check-types`, `pnpm build`) pass green.


## Validation Log

### Verification Results
- Claims checked: 8
- Verified: 8 | Failed: 0 | Unverified: 0
- Tier: Light (Fact Checker)
- Evidence:
  - Root layout `apps/web/src/routes/__root.tsx:12-32` lacks `notFoundComponent` [VERIFIED]
  - Main router `apps/web/src/main.tsx:10-16` lacks `defaultNotFoundComponent` [VERIFIED]
  - Sub-route `apps/web/src/routes/_auth/students/$studentId.tsx:18-33` defines entity `notFoundComponent` [VERIFIED]
  - Infra config `packages/infra/alchemy.run.ts:100-106` sets `notFoundHandling: "single-page-application"` [VERIFIED]
  - Route tree `apps/web/src/routeTree.gen.ts:116-151` enumerates all exact and prefix routes [VERIFIED]
  - E2E setup `apps/e2e/playwright.config.ts:43-53` boots `vite` dev server [VERIFIED]
  - Worktree environment dependencies installed and baseline test suite passes [VERIFIED]

## Red Team Review

### Reviewer 1: Security Adversary
- **Finding SEC-1**: Path traversal in route matching.
  - *Evidence*: `apps/web/src/routes-matcher.ts` will parse incoming pathnames. Requests with encoded dots or traversal sequences (e.g. `/%2e%2e/`, `/assets/../.env`) must not evade dotfile / static asset filtering.
  - *Disposition*: **Accept**. `isDotFilePath` will normalize/decode the pathname before evaluation and explicitly check for `..` segments and dot-prefix paths.
- **Finding SEC-2**: Dotfile responses must never disclose server internals or return HTML shells.
  - *Evidence*: `packages/infra/alchemy.run.ts:104` previously served SPA `index.html` with HTTP 200 for `/.env`.
  - *Disposition*: **Accept**. Return minimal plain-text `Not Found` with `Content-Type: text/plain; charset=utf-8` and `Cache-Control: no-store` so sensitive paths never leak markup or cache.

### Reviewer 2: Assumption Destroyer
- **Finding ASSUMP-1**: Route list drift between `routeTree.gen.ts` and `routes-matcher.ts`.
  - *Evidence*: If a developer adds a new route to `apps/web/src/routes/` in the future, `routeTree.gen.ts` will regenerate, but `routes-matcher.ts` could drift and cause valid routes to return 404.
  - *Disposition*: **Accept**. Add an automated contract test in `routes-matcher.test.ts` that imports `routeTree` or extracts routes from `routeTree.gen.ts` and asserts that every declared route passes `isValidAppRoute`. This turns route-drift into an immediate test failure!
- **Finding ASSUMP-2**: `htmlHandling: "auto-trailing-slash"` redirect edge cases.
  - *Evidence*: Cloudflare asset handling may request paths with or without trailing slashes.
  - *Disposition*: **Accept**. `isValidAppRoute` normalizes trailing slashes before matching (`pathname.replace(/\/+$/, '') || '/'`).

### Whole-Plan Consistency Sweep
- All accepted findings (SEC-1, SEC-2, ASSUMP-1, ASSUMP-2) integrated into phase-02 tasks.
- No unresolved contradictions or architectural conflicts. Plan is consistent across all files.
<!-- slug: fix-113-branded-404-http-status -->
