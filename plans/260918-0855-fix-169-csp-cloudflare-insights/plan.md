---
title: "fix-169-csp-cloudflare-insights"
description: "Fix issue #169: [QC][P2] CSP script-src 'self' chặn Cloudflare Insights beacon — analytics không chạy"
status: completed
priority: P2
effort: "1h"
issue: 169
branch: fix/169-csp-cloudflare-insights
tags: [qc, bugfix, security, csp, cloudflare, analytics]
created: 2026-09-18
---

# fix-169-csp-cloudflare-insights

## Overview

Issue #169 reported a Content Security Policy (CSP) violation on `https://app.staging.teacheros.io.vn` (and production):
```
Loading the script 'https://static.cloudflareinsights.com/beacon.min.js/...' violates CSP directive "script-src 'self'".
```

When issue #108 / PR #160 added security headers, `Content-Security-Policy` was set to:
`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com;`

Because Cloudflare Web Analytics automatically injects the beacon script from `https://static.cloudflareinsights.com`, the browser blocks it and logs an error in the console.

### Resolution
Update `SECURITY_HEADERS["Content-Security-Policy"]` in `apps/web/src/security-headers.ts`:
- Append `https://static.cloudflareinsights.com` to `script-src`.
- Note: `connect-src` already specifies `'self' https:`, which permits outbound telemetry calls to `https://cloudflareinsights.com`.
- Add unit tests verifying `script-src` contains `https://static.cloudflareinsights.com` across 200 and 404 responses.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Allow Cloudflare Web Analytics beacon script in CSP without console violations | P2 |
| 2 | Keep all other CSP directives strict ('self', frame-ancestors 'none', object-src 'none') | P2 |
| 3 | TDD: Unit test coverage in `apps/web/src/worker.test.ts` pinning the CSP configuration | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Update CSP for Cloudflare Insights Beacon](./phase-01-csp-cloudflare-insights.md) | Completed |

## Success Criteria

- [x] `apps/web/src/security-headers.ts` includes `https://static.cloudflareinsights.com` in `script-src`.
- [x] `apps/web/src/worker.test.ts` verifies `script-src` includes `https://static.cloudflareinsights.com`.
- [x] `pnpm --filter web test` passes with 100% success.
- [x] No regression on existing security headers (HSTS, nosniff, DENY, etc.).
