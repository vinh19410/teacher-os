---
title: "Phase 1 production config: single-source domain topology and release runbook"
date: 2026-08-20
summary: "APP_DOMAIN topology single-source, latent better-auth baseURL bug fixed, staging provisioned live, runbook validated end-to-end (issue #34 Phase 1, f9d5c1e)"
---

# Phase 1 production config: single-source domain topology and release runbook

**Date**: 2026-08-20
**Severity**: Medium
**Component**: packages/infra topology, packages/auth, deploy pipeline, docs
**Status**: Resolved
**Refs**: issue #34 Phase 1, plan plans/260819-2034-production-readiness, branch feat/34-production-config-runbook, commit f9d5c1e

## What Happened

Phase 1 of production-readiness landed: domain topology encoded as code, a release runbook, and staging provisioned live. Gates all green: 189/189 tests, check-types 5/5, biome clean, build 2/2.

APP_DOMAIN is now the single source of truth. `packages/infra/src/topology.ts` (11 tests) derives app/api origins, the CORS default, Better Auth base URL, Google redirect URI, and the cross-subdomain cookie domain; `packages/auth/src/topology.ts` (16 tests) mirrors the auth side. Cross-subdomain cookies (SameSite=None/Secure/HttpOnly kept) only activate when the COOKIE_DOMAIN binding is set — workers.dev/dev behavior unchanged.

## The Brutal Truth

The better-auth baseURL was missing the `/api/auth` mount path. Every Google login in production would have 404'd at the callback. We found it while reading code for the refactor, not by testing the real mount — exactly the kind of bug that ships when dev is forgiving and nobody walks the production path. `authBaseURL()` now appends the mount path idempotently.

## What We Tried

- **Cross-package devDep to share AUTH_MOUNT_PATH between infra and auth**: rejected — it would create a workspace cycle env→infra→auth→env. Instead `scripts/topology-drift.test.mjs` does text-level asserts: AUTH_MOUNT_PATH identical across both packages, and the runbook's redirect URI matches the derivation.
- **Node ESM vs composite tsconfigs**: alchemy runtime needs `.ts` import extensions, composite tsconfigs reject them. Resolution: `allowImportingTsExtensions` + `emitDeclarationOnly` on apps/server, `noEmit` on infra. Ugly but contained.
- **Silent CORS override**: when CORS_ORIGIN disagreed with the derived app origin it silently broke both Hono CORS and better-auth trustedOrigins (the review's top finding). Now it warns loudly at deploy time.

## Outcome

Staging provisioned live via isolated alchemy stages (own D1) and verified: server GET / → 200 OK, web → 200. The runbook's two-step CORS bootstrap was validated end-to-end during actual provisioning, not on paper. `docs/production-release-runbook.md` is secret-free: preflight/deploy/rollback/GO-NO-GO/sign-off, with real alchemy beta.72 commands only (reviewer verified the CLI registry).

## Lessons Learned

- Encode topology once, derive everything — five config knobs agreeing by accident is not a strategy.
- Text-level drift guards are the honest answer when a type-level import would create a workspace cycle.
- Silent env overrides are landmines; disagree loudly at deploy time.
- Walk the production auth path (including mount paths) before trusting a callback URL.

## Next Steps

Phase 2 of issue #34: production secret rotation cadence, uptime checks, and a dry-run of the rollback path. Owner: this branch's reviewer + infra.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
