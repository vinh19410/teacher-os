---
title: fix-108-http-https-redirect-security-headers
date: 2026-09-17
summary: "Fix HTTP to HTTPS redirect, HSTS, and security headers on web app and API"
---

# fix-108-http-https-redirect-security-headers

Fix HTTP to HTTPS redirect, HSTS, and security headers on web app and API

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

## Problem Context
QC reported P1 issue #108 on TeacherOS production (`app.teacheros.io.vn` and `api.teacheros.io.vn`):
1. Plain HTTP requests did not redirect to HTTPS, returning HTTP 200, and neither service issued `Strict-Transport-Security`.
2. The web frontend lacked standard security headers (`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`).

## Solution & Key Decisions
1. **Edge HTTPS Redirection (301 Moved Permanently)**:
   - Implemented in `apps/web/src/worker.ts` and `apps/server/src/app.ts`.
   - Local development hosts (`localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`, `::1`, `*.localhost`, `*.local`) are exempt to prevent breaking dev workflows without TLS.
   - Handled edge cases: never self-redirect requests already on HTTPS, and respect upstream proxy TLS termination when `x-forwarded-proto` is `https`.
2. **Strict-Transport-Security (HSTS)**:
   - Emitted `Strict-Transport-Security: max-age=31536000; includeSubDomains` across all production responses (web assets, SPA shells, 404s, API routes, and 301 redirects).
3. **Web Security Headers**:
   - Centralized in `apps/web/src/security-headers.ts` and applied across all worker response paths.
   - Configured CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com;`.
4. **API Security Headers & Cross-Origin Compatibility**:
   - Integrated `hono/secure-headers` configured with `crossOriginResourcePolicy: "cross-origin"` and `crossOriginOpenerPolicy: false` to ensure cross-subdomain app-to-API communication and Google OAuth authentication remain functional.

## Verification
- Web tests: `apps/web/src/worker.test.ts` covers plain HTTP 301, proxy headers, IPv6 loopback immunity, 200 SPA shell headers, and 404 headers.
- Server tests: `apps/server/src/security.test.ts` covers HTTP 301, proxy headers, loopback immunity, HSTS, CORP, and CORS headers.
- Workspace test suites: 100% green across all 218 server tests, 493 web tests, Biome linting, and TypeScript checks.
