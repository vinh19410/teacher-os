---
title: "fix-108-http-https-redirect-security-headers"
description: "Fix issue #108: [QC][P1] HTTP không redirect HTTPS, thiếu HSTS và security headers (app + API)"
status: completed
priority: P1
effort: "2h"
tags: [qc, bugfix, security, hsts, csp, headers, worker, api]
created: 2026-09-17
---

# fix-108-http-https-redirect-security-headers

## Overview

Issue #108 reported two critical production security defects on `app.teacheros.io.vn` and `api.teacheros.io.vn`:
1. **HTTP does not redirect to HTTPS and lacks HSTS (app + API)**:
   - Requests to `http://app.teacheros.io.vn` and `http://api.teacheros.io.vn` return HTTP 200 without redirecting to HTTPS, and lack the `Strict-Transport-Security` header.
2. **Missing security headers on web app**:
   - `https://app.teacheros.io.vn/` lacks `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`. Responses currently carry only default Cloudflare cache headers.

This plan resolves both issues at the Cloudflare Worker layer (`apps/web/src/worker.ts`) and API layer (`apps/server/src/app.ts`):
- **HTTP -> HTTPS Redirect (301 Moved Permanently)**: Incoming plain HTTP requests on non-local hostnames redirect immediately to their `https://` equivalents with HTTP status 301.
- **Strict-Transport-Security (HSTS)**: Both the web worker and API server emit `Strict-Transport-Security: max-age=31536000; includeSubDomains` on HTTPS responses.
- **Web Security Headers**: The web worker applies CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy` to all outgoing responses (static assets, SPA shells, 404s).
- **API Security Headers**: The Hono server integrates `hono/secure-headers` configured to protect the API while ensuring `Cross-Origin-Resource-Policy: cross-origin` and open opener policies preserve cross-subdomain app-to-API communication and Google OAuth sign-in.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Redirect plain HTTP requests on `app.teacheros.io.vn` and `api.teacheros.io.vn` to HTTPS with status 301 | P1 |
| 2 | Enforce `Strict-Transport-Security` (HSTS) across both web app and API | P1 |
| 3 | Deliver full security headers suite on web app (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) | P1 |
| 4 | Ensure CORS, cross-subdomain cookies, Better Auth, and local dev workflows remain fully functional without regressions | P1 |
| 5 | Provide comprehensive unit test coverage with TDD for all redirect and header behaviors | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Web App HTTPS Redirect & Security Headers](./phase-01-web-redirect-security-headers.md) | Completed |
| 2 | [Phase 2: API Server HTTPS Redirect, HSTS & Security Headers](./phase-02-api-redirect-security-headers.md) | Completed |

## Success Criteria

- [x] `http://app.teacheros.io.vn/...` returns HTTP 301 redirecting to `https://app.teacheros.io.vn/...`.
- [x] `http://api.teacheros.io.vn/...` returns HTTP 301 redirecting to `https://api.teacheros.io.vn/...`.
- [x] `https://app.teacheros.io.vn/...` responses include:
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`
  - `Content-Security-Policy` with valid directives for TeacherOS SPA assets, Google OAuth, and avatars.
- [x] `https://api.teacheros.io.vn/...` responses include `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, and `Cross-Origin-Resource-Policy: cross-origin`.
- [x] Localhost / 127.0.0.1 requests are exempt from HTTPS redirects so local development and CI testing pass without TLS overhead.
- [x] All unit test suites in `apps/web` and `apps/server` pass green.

## Validation Log

### Verification Results
- Claims checked: 6
- Verified: 6 | Failed: 0 | Unverified: 0
- Tier: Light (Fact Checker)
- Evidence:
  - `apps/web/src/worker.ts` currently lacks HTTP scheme inspection and emits zero security headers [VERIFIED]
  - `apps/server/src/app.ts` currently lacks HTTP redirect and secure headers middleware [VERIFIED]
  - `packages/auth/src/avatar-policy.ts` documents allowed avatar sources (`data:` and `https:`) [VERIFIED]
  - Hono v4.12.32 provides `hono/secure-headers` with customizable header options [VERIFIED]
  - Existing test suite (211 server tests, 486 web tests) establishes baseline in worktree [VERIFIED]
  - Local dev ports (8000 for server, 8001 for web) rely on plain HTTP and must not be redirected [VERIFIED]

## Red Team Review

### Reviewer 1: Security Adversary
- **Finding SEC-1**: Protocol downgrades via reverse-proxy spoofing.
  - *Evidence*: Attackers could send spoofed `X-Forwarded-Proto: https` to an HTTP port if the upstream edge does not sanitize it.
  - *Disposition*: **Accept**. In Cloudflare Workers, `url.protocol` reflects the client-to-Cloudflare scheme directly. Check both `url.protocol === "http:"` and `x-forwarded-proto === "http"`. If either indicates HTTP, trigger the redirect.
- **Finding SEC-2**: Clickjacking and embedding risks.
  - *Evidence*: `X-Frame-Options` and CSP `frame-ancestors` must align to prevent the application from being framed in malicious parent origins.
  - *Disposition*: **Accept**. Set `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`.

### Reviewer 2: Assumption Destroyer
- **Finding ASSUMP-1**: Breaking local development and test environments with forced HTTPS.
  - *Evidence*: If redirects trigger unconditionally on `http:`, running `vite` or `alchemy dev` on `http://localhost:8001` or `http://localhost:8000` will fail or loop.
  - *Disposition*: **Accept**. Check `isLocalHost` (`localhost`, `127.0.0.1`, `0.0.0.0`) and never redirect local hosts to HTTPS.
- **Finding ASSUMP-2**: Breaking cross-origin API calls with default CORP `same-origin`.
  - *Evidence*: Hono's `secureHeaders` defaults to `Cross-Origin-Resource-Policy: same-origin`. Because web is on `app.<domain>` and API is on `api.<domain>`, `same-origin` would block legitimate browser API fetches.
  - *Disposition*: **Accept**. Explicitly configure `crossOriginResourcePolicy: "cross-origin"` in `secureHeaders`.

### Whole-Plan Consistency Sweep
- Both phases (Web and API) use matching HSTS duration (`max-age=31536000; includeSubDomains`).
- Localhost exemption is consistently applied across both web worker and server middleware.
- All red-team findings (SEC-1, SEC-2, ASSUMP-1, ASSUMP-2) are directly addressed in the phase requirements.
- No unresolved contradictions or architectural conflicts.
<!-- slug: fix-108-http-https-redirect-security-headers -->
