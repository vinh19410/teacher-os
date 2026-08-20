---
phase: 3
title: "Database readiness endpoint"
status: completed
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

Mounting outside `/api/*` is sufficient isolation: bootstrap middleware is bound to `/api/*` only, so `getSessionUser`/Better Auth are never invoked. The global `cors()` and `logger()` middlewares still run on `/readyz` — accepted (they leak nothing; logger records method/path/status only). Server-side error logging is allowed for operator triage provided it never contains credentials/PII and never reaches the response.

## Probe design (red-team hardened)

- Probe must be **empty-safe**: success means "the query executes without error and the required schema objects are present", never "a row exists". A freshly migrated deployment has zero organizations/memberships and must still return `200`.
- Probe must be **bounded-cost**: read at most O(number-of-tables) catalog rows via `sqlite_master`; never `SELECT count(*)` on a data table (D1 bills rows-read; an unauthenticated probe must not become a quota-burning vector).
- Probe must be **schema-dependent across migrations**: check an explicit required-objects list — every kernel/auth table **plus every named index** the Drizzle schema declares (derived from the schema barrel, not hardcoded) — in one catalog query, so a database missing any migration fails readiness. Tables alone are insufficient: a migration can alter a table without creating one (0006 added `comment_bank`'s unique index + column), and counting tables only would report healthy on a database stuck before it. `SELECT 1` or probing a single early table (e.g. `organization` from migration 0001) is equally insufficient.
- Suggested shape: `SELECT count(*) FROM sqlite_master WHERE type IN ('table','index') AND name IN (<required tables + indexes>)`; healthy iff count equals the list length. Missing schema → count short (no error); D1 failure → query or `getDb()` throws.

## Response contract

- `200` → JSON `{"ok":true}`; `503` → JSON `{"ok":false}` — byte-identical body for every failure mode (db error vs missing schema must not be distinguishable).
- `Cache-Control: no-store` so monitors never act on a stale 200.
- Every exception in the probe path — including `getDb()` throwing at lazy init and query rejection — maps to the same generic `503`; nothing may escape to Hono's default `onError` (which would answer 500 and leak internals).
- No error text, table names, migration names, or binding details ever appear in any response.

## Related Code Files

- Modify: `apps/server/src/app.ts`.
- Create: `apps/server/src/readiness.test.ts` — keep `kernel.test.ts` untouched; the readiness harness is minimal (no session/cookie helpers).
- Optional create: `apps/server/src/routes/readiness.ts` if it keeps `app.ts` below a clear composition boundary.
- Modify: `docs/production-release-runbook.md`.

No changes needed to alchemy/wrangler config (same worker routes every path), `packages/api/contracts.ts` (not an `/api/*` route, no zod contract), or the web app.

## Implementation Steps

1. Define the response contract above and the bounded-cost, empty-safe, schema-dependent D1 probe using the injected DB; `SELECT 1` alone is insufficient. ("Constant-time" wording from the earlier draft is dropped — it is a crypto term with no readiness threat model here.)
2. Mount `/readyz` outside `/api/*`; ensure it does not trigger bootstrap middleware. Wrap the whole probe in catch-all error handling that returns the generic `503`.
3. Test cases in `readiness.test.ts`:
   - healthy: migrated DB (even with zero rows) returns `200` + `{"ok":true}`;
   - missing schema: non-migrated (or table-dropped) DB returns generic `503`;
   - database error: `getDb()` throws / query rejects → generic `503`, identical body to missing-schema;
   - no-detail-leak: no error text/table/migration names in either failure body;
   - no side effect: `organization`/`membership` remain empty after `/readyz`, and `getSessionUser` is never called (spy).
4. Add release-runbook post-deploy check (curl `/readyz`, expect `{"ok":true}`, record evidence; curl output shows the real domain — operator decision per the existing no-secret rule) and update the Support-triage section to distinguish liveness (`GET /`) from readiness (`/readyz`).

## Success Criteria

- [x] Healthy Worker + required D1 schema returns `200`; D1/missing-schema failure returns `503` without internals.
- [x] `/readyz` does not create org/membership or require cookie.
- [x] Server tests and root quality gate pass.

## Risk Assessment

The query must be cheap and available after migrations. Signal: legitimate deployed service returns `503` while kernel works. Response: revise only the probe query with test proof; do not downgrade readiness to `GET /`.

Accepted risk: the unauthenticated probe costs one catalog query per request; no rate-limit/WAF at pilot scale (one teacher) — revisit only with abuse evidence.

## Validation Log

### Red-team delta — 2026-08-20 (re-run before implementation)

Fresh adversarial review of this phase against the live codebase returned **GO** with findings applied to this file: empty-safe probe requirement (was: risk of permanent 503 on fresh deploy), catch-all → generic 503 (was: exceptions could surface as 500), explicit `REQUIRED_TABLES` list (was: single-table probe missed half-applied migrations), two additional test cases (migrated-but-empty, no-side-effect spy), bounded-cost constraint (no `count(*)` on data tables), pinned response contract (identical 503 bodies, `no-store`), dropped "constant-time" wording, runbook triage-section update, separate `readiness.test.ts` harness. Verdict: no Critical findings; HIGH/MEDIUM items folded into Probe design, Response contract, and Implementation Steps above.

### Code-review delta — 2026-08-20 (pre-ship review cycle)

Local `code-reviewer` review returned REQUEST_CHANGES with one Important finding, now fixed and re-verified: a tables-only catalog count cannot catch a migration that only alters a table (0006 adds `comment_bank`'s unique index + column, no table) — the probe would return 200 on a database stuck before 0006. Fix: the required set now derives **tables + named indexes** from the schema barrel (`getTableConfig().indexes`), the probe counts `sqlite_master WHERE type IN ('table','index')`, and a regression test drops the 0006 index and asserts 503. A Minor finding added the server-side `console.error` cause log inside the catch (the runbook already promises "diagnose from Worker logs"). Optional HEAD support was rejected: no consumer at pilot scale; GET is the documented contract.
