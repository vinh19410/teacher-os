---
phase: 1
title: "Production configuration and support runbook"
status: completed
priority: P1
effort: "1d"
dependencies: []
---

# Phase 1: Production configuration and support runbook

## Overview

Chốt topology production/staging và một runbook không chứa secret, để deploy/recovery/UAT dùng cùng một nguồn cấu hình.

## Requirements

- Encode `app.<domain>` + `api.<domain>` as exact web/server origins, `CORS_ORIGIN`, `BETTER_AUTH_URL`, Google redirect URI and cross-subdomain session-cookie policy; runbook không được là nơi duy nhất thay đổi topology.
- Provision an isolated staging D1 database; it is the mandatory target for Phase 2 rehearsal.
- Liệt kê secret theo tên/owner/rotation path, không ghi giá trị, token, database id hoặc local path.
- Ghi deploy preflight, rollback code, migration forward-only, support triage và điều kiện dừng release.

## Architecture

`packages/infra/alchemy.run.ts` là owner binding: hiện `BETTER_AUTH_URL` và `VITE_SERVER_URL` đều lấy generated Worker URL. Better Auth `trustedOrigins` và Hono CORS phải cùng origin. This phase configures `app.<domain>` + `api.<domain>`, then enables cross-subdomain cookie settings only after Chrome/Safari live smoke confirms them. Không coi URL ghi trong runbook là có hiệu lực nếu runtime chưa đọc nó.

## Related Code Files

- Modify: `README.md` — production/staging release and UAT entry point.
- Modify: `docs/project-roadmap.md` — link evidence only after phase 6 passes.
- Create: `docs/production-release-runbook.md` — operator procedure, secret inventory names, support/recovery pointers.
- Modify as topology requires: `packages/infra/alchemy.run.ts`, `packages/auth/src/index.ts`.
- Inspect: `apps/server/src/app.ts`, `apps/web/src/lib/auth-client.ts`.

## Implementation Steps

1. Inventory effective production variables/bindings and provision an isolated staging D1 with approved operator access.
2. Modify the owning infra/auth configuration so `app.<domain>`, `api.<domain>`, Better Auth base URL/trusted origin, cross-subdomain cookie policy, Hono CORS origin and Google redirect all use one topology; reject trailing-slash/origin mismatches.
3. Write preflight, deploy, rollback-code, support escalation and UAT recording steps. State that historical D1 migrations are never edited after apply.
4. Add an explicit sign-off checklist for deploy/restore authority, DNS/domain readiness, staging availability and sanitized evidence location.

## Success Criteria

- [x] One owner can execute the runbook without secret lookup from source control. (Runbook written; its staging procedure was executed end-to-end during implementation, including the documented two-step CORS bootstrap.)
- [x] Every auth/CORS URL has an exact, mutually consistent runtime value and test step. (`packages/infra/src/topology.ts` + `packages/auth/src/topology.ts` derive all URLs from `APP_DOMAIN`; 25 unit tests cover derivation and rejection cases; the live Chrome/Safari smoke on the production domain runs at Phase 6 with the real domain.)
- [x] Isolated staging D1 exists and is the only target named for recovery rehearsal. (Deployed via `alchemy deploy --stage staging`: server `GET /` → 200 `OK`, web → 200; stage-isolated from `prod`.)
- [x] Runbook defines GO/NO-GO and records who may deploy/restore. (`docs/production-release-runbook.md` — stop conditions, sign-off table, secret inventory by name/owner/rotation path only.)

## Risk Assessment

Load-bearing assumption: cross-subdomain cookie policy works for the selected `app.<domain>` + `api.<domain>` topology. Signal: Google callback or session fails only in browser. Response: stop release; reconcile cookie/domain/CORS configuration and rerun smoke, do not weaken CORS or cookie security.
