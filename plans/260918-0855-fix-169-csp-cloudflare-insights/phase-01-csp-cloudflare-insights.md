---
phase: 1
title: "Phase 1: Update CSP for Cloudflare Insights Beacon"
status: completed
priority: P2
effort: "1h"
dependencies: []
---

# Phase 1: Update CSP for Cloudflare Insights Beacon

## Overview

Update `apps/web/src/security-headers.ts` and add tests in `apps/web/src/worker.test.ts`.

## Implementation Steps

1. **Test-First (TDD)**:
   - In `apps/web/src/worker.test.ts`, add assertions in `applies full security headers suite to 200 OK SPA responses` checking that `content-security-policy` contains `script-src 'self' https://static.cloudflareinsights.com`.
2. **Implementation**:
   - In `apps/web/src/security-headers.ts`, change:
     `script-src 'self';`
     to:
     `script-src 'self' https://static.cloudflareinsights.com;`
3. **Verification**:
   - Run `pnpm --filter web test` and confirm all tests pass.
   - Run Biome check on touched files.

## Success Criteria

- [x] Test fails before change (or tests the new directive).
- [x] Test passes after change.
- [x] Biome check clean.
