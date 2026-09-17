---
title: "Phase 2: API Server HTTPS Redirect, HSTS & Security Headers"
status: completed
---

# Phase 2: API Server HTTPS Redirect, HSTS & Security Headers

## Overview

Fix HTTP to HTTPS redirection, HSTS, and security headers on the backend API (`apps/server`). The Hono application (`apps/server/src/app.ts`) handles all kernel routes, Better Auth endpoints, and system probes (`/readyz`, `/`). This phase implements an HTTPS redirect middleware for non-local HTTP requests, and integrates Hono's `secureHeaders` middleware configured to ensure HSTS (`Strict-Transport-Security: max-age=31536000; includeSubDomains`), standard hardening headers (`nosniff`, `DENY`, `strict-origin-when-cross-origin`), and cross-origin compatibility (`crossOriginResourcePolicy: "cross-origin"` and non-blocking opener policy) so `app.teacheros.io.vn` cross-origin API calls and Google OAuth callbacks work seamlessly.

## Requirements

- [x] Plain HTTP requests (`url.protocol === "http:"` or `x-forwarded-proto: http`) to non-localhost hosts redirect with status 301 to `https://<host><pathname><search>`.
- [x] Local development requests (`localhost`, `127.0.0.1`, `0.0.0.0`) are not redirected, preserving local development and testing.
- [x] API responses include:
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Cross-Origin-Resource-Policy: cross-origin`
- [x] Hono CORS middleware and Better Auth routes continue functioning with full cross-origin credentials support.
- [x] Unit tests in `apps/server/src/security.test.ts` verifying redirects, HSTS, and header presence across API endpoints.

## Implementation Steps

1. Create `apps/server/src/security.test.ts` with TDD tests:
   - Request to `http://api.teacheros.io.vn/readyz` or with `x-forwarded-proto: http` returns 301 with `Location: https://api.teacheros.io.vn/readyz`.
   - Request to `http://localhost:8000/readyz` returns 200 without redirect.
   - Assert presence of `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Cross-Origin-Resource-Policy: cross-origin`.
2. Update `apps/server/src/app.ts`:
   - Add HTTPS redirect middleware before route handlers.
   - Add `secureHeaders` middleware from `hono/secure-headers` configured with explicit options.
3. Run `pnpm --filter server test` to verify all tests (including `kernel.test.ts`, `readiness.test.ts`, `auth-roundtrip.test.ts`, and new `security.test.ts`) pass green.

## Todo

- [x] Create `apps/server/src/security.test.ts` (test-first)
- [x] Update `apps/server/src/app.ts` with redirect and secureHeaders middleware
- [x] Verify test suite passes with `pnpm --filter server test`

## Success Criteria

- [x] `apps/server/src/security.test.ts` passes with 100% green assertions.
- [x] All 211+ existing server tests remain 100% passing.
