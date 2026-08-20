---
phase: 3
title: "Database readiness endpoint"
status: pending
priority: P1
effort: "0.5d"
dependencies: [1]
---

# Phase 3: Database readiness endpoint

## Overview

Add a safe `/readyz` probe that proves the Worker can make a bounded D1 query; preserve `GET /` as simple liveness if still useful.

## Requirements

- `200` only if a lightweight, schema-dependent query proves D1 binding and required kernel tables are usable; otherwise `503` with generic body.
- Do not authenticate the probe, expose migration/database details, or log credentials/PII.
- Add handler-level tests for healthy and injected-DB failure paths; release smoke consumes `/readyz`.

## Architecture

`buildApp` already receives `getDb` as injectable dependency (`apps/server/src/app.ts:22-27`). Implement the route there or a small route module, using the same dependency so unit tests remain plain Node. Do not make `/readyz` bootstrap an org or invoke Better Auth.

## Related Code Files

- Modify: `apps/server/src/app.ts`.
- Modify: `apps/server/src/kernel.test.ts` or create `apps/server/src/readiness.test.ts`.
- Optional create: `apps/server/src/routes/readiness.ts` if it keeps `app.ts` below a clear composition boundary.
- Modify: `docs/production-release-runbook.md`.

## Implementation Steps

1. Define response contract and a constant-time, schema-dependent D1 probe using the injected DB; `SELECT 1` alone is insufficient.
2. Mount `/readyz` outside `/api/*`; ensure it does not trigger bootstrap middleware.
3. Add healthy, database-error, missing-schema and no-detail-leak test cases.
4. Add release-runbook post-deploy check and expected evidence.

## Success Criteria

- [ ] Healthy Worker + required D1 schema returns `200`; D1/missing-schema failure returns `503` without internals.
- [ ] `/readyz` does not create org/membership or require cookie.
- [ ] Server tests and root quality gate pass.

## Risk Assessment

The query must be cheap and available after migrations. Signal: legitimate deployed service returns `503` while kernel works. Response: revise only the probe query with test proof; do not downgrade readiness to `GET /`.
