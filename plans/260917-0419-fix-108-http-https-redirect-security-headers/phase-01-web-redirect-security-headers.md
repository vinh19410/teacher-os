---
title: "Phase 1: Web App HTTPS Redirect & Security Headers"
status: completed
---

# Phase 1: Web App HTTPS Redirect & Security Headers

## Overview

Fix HTTP to HTTPS redirection, HSTS, and missing security headers on the web frontend (`apps/web`). The Cloudflare Worker (`apps/web/src/worker.ts`) serves both static assets, valid SPA routes, and branded 404 responses. This phase ensures any plain HTTP request to non-local domains is permanently redirected (301) to HTTPS, and all web responses include standard modern security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).

## Requirements

- [x] Plain HTTP requests (`url.protocol === "http:"` or `x-forwarded-proto: http`) to non-localhost hosts redirect with status 301 to `https://<host><pathname><search>`.
- [x] Local development requests (`localhost`, `127.0.0.1`, `0.0.0.0`) do not redirect to HTTPS, preserving local dev workflows.
- [x] All web responses (static assets, 200 OK SPA shells, 404 responses, and dotfile rejections) include:
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com;`
- [x] TDD unit tests in `apps/web/src/worker.test.ts` verifying redirects and headers.

## Implementation Steps

1. Create `apps/web/src/security-headers.ts` exporting `SECURITY_HEADERS` dictionary and helper functions `applySecurityHeaders(headers: Headers): Headers` and `isHttpRedirectNeeded(request: Request): string | null`.
2. Update `apps/web/src/worker.ts`:
   - Inspect request URL and protocol; if HTTP redirect is needed, return `Response.redirect(httpsUrl, 301)`.
   - Wrap or augment outgoing responses with `applySecurityHeaders`.
3. Update `apps/web/src/worker.test.ts` with comprehensive unit test coverage:
   - Plain HTTP request returns 301 with `Location: https://...`.
   - `x-forwarded-proto: http` triggers 301 redirect.
   - Localhost / 127.0.0.1 requests are not redirected.
   - Verified presence of all 6 security headers across 200, 404, dotfile, and static asset responses.

## Todo

- [x] Create `apps/web/src/security-headers.ts`
- [x] Add unit test assertions in `apps/web/src/worker.test.ts` (test-first)
- [x] Update `apps/web/src/worker.ts` to implement redirection and headers
- [x] Run `pnpm --filter web test` and verify green

## Success Criteria

- [x] `apps/web/src/worker.test.ts` passes with 100% assertions for HTTP redirect and security headers.
- [x] All existing web tests pass without regression.
