---
title: "Phase 2: Route Matcher, HTTP 404 Worker, Dev Middleware & E2E Tests"
status: done
priority: P1
effort: "1.5h"
dependencies: ["Phase 1: Branded 404 UI Component & TanStack Router Integration"]
---

# Phase 2: Route Matcher, HTTP 404 Worker, Dev Middleware & E2E Tests

## Overview

Implement route matching logic, edge Cloudflare Worker routing, and Vite dev server middleware to ensure unknown routes return HTTP 404 on the wire, dotfiles return HTTP 404 plain text, and valid routes return HTTP 200 with SPA shell. Write unit tests for routes matcher and worker, and add Playwright E2E tests verifying both visual 404 branding and HTTP status codes.

## Requirements

- [x] Create `apps/web/src/routes-matcher.ts` exporting:
  - `isValidAppRoute(pathname: string): boolean`
  - `isStaticAssetPath(pathname: string): boolean`
  - `isDotFilePath(pathname: string): boolean`
- [x] Exhaustively cover all exact routes (`/`, `/login`, `/dashboard`, `/profile`, `/reports`, `/schedule`, `/settings`, `/tuition`, `/assignments`, `/classes`, `/students`, `/syllabus`).
- [x] Exhaustively cover all dynamic prefix routes (`/assignments/`, `/classes/`, `/students/`, `/syllabus/`).
- [x] Cover dotfile patterns (`/.env`, `/.git`, `/.git/*`, etc.).
- [x] Cover static asset patterns (`/assets/*`, `/favicon.ico`, `/logo.png`, `/sw.js`, `/registerSW.js`, `/dev-sw.js`, file extensions).
- [x] Write unit tests in `apps/web/src/routes-matcher.test.ts`.
- [x] Create Cloudflare Worker entry point `apps/web/src/worker.ts`:
  - Dotfiles -> 404 plain text "Not Found".
  - Static assets -> pass to `env.ASSETS.fetch(request)`.
  - Valid SPA routes -> serve `index.html` from `env.ASSETS` with HTTP 200.
  - Unknown routes with `Accept: text/html` -> serve `index.html` from `env.ASSETS` with HTTP 404 and no-cache headers.
  - Unknown routes without HTML accept (`curl`, APIs) -> HTTP 404 plain text.
- [x] Write unit tests in `apps/web/src/worker.test.ts` testing worker fetch logic with mocked `env.ASSETS`.
- [x] Add Vite dev server middleware in `apps/web/vite.config.ts`:
  - Intercepts dotfiles and returns 404 plain text.
  - Intercepts unknown routes and serves transformed `index.html` with HTTP 404 for HTML requests, or 404 plain text for non-HTML.
- [x] Update `packages/infra/alchemy.run.ts`:
  - Point `main: "src/worker.ts"` on `Cloudflare.Website.Vite("web")`.
  - Set `notFoundHandling: "none"` so unmatched requests fall through to the Worker.
- [x] Add Playwright E2E spec in `apps/e2e/specs/404-branded-status.spec.ts`:
  - Browser visits `/this-page-does-not-exist-qc-test` -> receives 404 status, verifies branded 404 UI elements.
  - Direct visit to `/help`, `/about`, `/signup`, `/register` -> receives 404 status, branded 404 UI.
  - Direct visit to `/dashboard` and `/login` -> receives 200 status.
  - API request to `/this-page-does-not-exist-qc-test` -> receives 404 status.
  - API request to `/.env` and `/.git` -> receives 404 status, body is NOT HTML.
  - CTA button "Về bảng điều khiển" navigates to `/dashboard` (or redirects to `/login` if unauthenticated).

## Implementation Steps

1. Create `apps/web/src/routes-matcher.test.ts` (TDD first) testing valid routes, prefixes, trailing slashes, static assets, and dotfiles.
2. Implement `apps/web/src/routes-matcher.ts`.
3. Create `apps/web/src/worker.test.ts` (TDD first) testing edge Worker routing with mock `env.ASSETS`.
4. Implement `apps/web/src/worker.ts`.
5. Update `apps/web/vite.config.ts` with custom 404 dev middleware using `routes-matcher`.
6. Update `packages/infra/alchemy.run.ts` with `main: "src/worker.ts"` and `notFoundHandling: "none"`.
7. Create `apps/e2e/specs/404-branded-status.spec.ts` with Playwright tests.
8. Run full test suite (`pnpm test`, `pnpm check-types`, `pnpm build`).

## Todo

- [x] Write `apps/web/src/routes-matcher.test.ts`
- [x] Implement `apps/web/src/routes-matcher.ts`
- [x] Write `apps/web/src/worker.test.ts`
- [x] Implement `apps/web/src/worker.ts`
- [x] Update `apps/web/vite.config.ts`
- [x] Update `packages/infra/alchemy.run.ts`
- [x] Add `apps/e2e/specs/404-branded-status.spec.ts`
- [x] Run test suite and check types

## Verification Commands

```bash
cd apps/web && pnpm vitest run src/routes-matcher.test.ts src/worker.test.ts
cd packages/infra && pnpm tsc --noEmit
pnpm build
pnpm test
```
