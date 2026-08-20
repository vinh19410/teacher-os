---
phase: 6
title: "Live UAT and release evidence"
status: pending
priority: P1
effort: "1-2d"
dependencies: [1, 2, 3, 4, 5]
---

# Phase 6: Live UAT and release evidence

## Overview

Run the approved controlled release and browser UAT against the production `app.<APP_DOMAIN>` + `api.<APP_DOMAIN>` topology, then make an evidence-backed GO/NO-GO decision for pilot-ready class operations. Staging or `workers.dev` origins can never substitute for this gate.

## Requirements

- Run the browser flow in incognito Chrome AND incognito Safari. Both are mandatory GO evidence; missing evidence for either browser is NO-GO, not a pass.
- Use a browser-only fault injection procedure, never take production server offline to create evidence.
- UAT data is synthetic `fixture-*` names only; never real student data.
- Evidence sanitization allowlist: HTTP status, sanitized hostname (recorded as `<domain>` redacted form unless the operator explicitly decides otherwise per the runbook), request-id, commit SHA, migration/readiness result, timestamp, runner, pass/fail per step. Never record raw `wrangler tail` lines, raw `curl -i` of authenticated endpoints, OAuth `code`/`state` values, cookies, database IDs, or student PII. Roster proof = row counts or masked DOM text, not screenshots.
- The deploy runs from the main checkout (where the operator env and Alchemy state live) at the exact release commit SHA recorded in evidence, with the sign-off row (operator, approver, domain) written into the runbook before the deploy command runs.
- The GO decision compares against the unified GO table below (superset of the parent plan GO conditions and the runbook stop conditions) — never either list alone.

## Architecture

This is a manual acceptance gate, not a flaky production OAuth CI test. `/readyz` proves runtime/D1 before authenticated flow; browser UAT proves the cross-origin auth/cookie contract; server/kernel tests remain regression protection. Server-side origin enforcement exists only on POST routes (kernel origin guard, better-auth `trustedOrigins`); GET endpoints are enforced by the browser via CORS, not by the server, and are therefore excluded from the negative-origin matrix.

## Related Code Files

- Modify: `docs/project-roadmap.md` — mark the milestone completed only after all gate evidence passes; a `Blocked` status with blocker/evidence links may be recorded any time per the roadmap update convention.
- Modify: `docs/production-release-runbook.md` with observed evidence links, deviations, and the pre-deploy sign-off row.
- GitHub: parent issue and its UAT child issue; sanitized evidence only (allowlist above).

## Implementation Steps

1. **Local gates on the release commit:** `pnpm test`, `pnpm check-types`, `pnpm exec biome check .`, `pnpm build` (CI env parity: `VITE_SERVER_URL` set when building the web app).
2. **Topology gate (before any deploy):** `APP_DOMAIN` is set in the deploy environment and resolves via `resolveDomainTopology`; `CORS_ORIGIN` is absent or exactly `https://app.<APP_DOMAIN>` in every env file Alchemy loads (`packages/infra/.env`, `apps/server/.env`, `apps/web/.env`) — a leftover localhost value overrides the derived default with only a warning (no hard failure); the Cloudflare zone for the domain exists in the account; the Google console has redirect URI `https://api.<APP_DOMAIN>/api/auth/callback/google`. Any failure aborts before deploying: NO-GO plus a blocker issue. Never deploy `--stage prod` with `APP_DOMAIN` unset — that yields a `workers.dev`-shaped "prod" that can still pass `/readyz`.
3. **Staging rehearsal gate:** the staging ledger (`d1_migrations`) shows the repaired `0006` applied on a restaged staging, or the recorded throwaway-D1 proof is the rehearsal evidence. "A live staging D1 exists" alone does not satisfy this gate.
4. **Deploy:** record the sign-off row (operator, approver, domain) in the runbook, deploy from the main checkout at the release SHA, and record the SHA. If the first production deploy fails partway, cleanup of a partial `prod` stage requires explicit restore-authority approval — no improvised procedures.
5. **Post-deploy probes (before any browser):** `curl -sS -i https://api.<APP_DOMAIN>/readyz` → `200 {"ok":true}` with `cache-control: no-store`; `GET /` → `OK`; CORS probe with `Origin: https://app.<APP_DOMAIN>` returns the expected `Access-Control-Allow-Origin`. Any failure: diagnose from Worker logs, fix, redeploy — do not open browsers on a red stage.
6. **Browser UAT — run the full flow in incognito Chrome AND incognito Safari:**
   1. Sign in with the dedicated Google UAT account → lands back on the app (callback consumed at `/api/auth/callback/google`).
   2. Verify session cookie attributes (DevTools → Application → Cookies): `Domain=.<APP_DOMAIN>`, `SameSite=None; Secure; HttpOnly` per the runbook topology table. A host-only cookie while topology is set is NO-GO.
   3. New org bootstrap → create syllabus (`fixture-*`) → create class (`fixture-*`) → class-detail Add Student (`fixture-*`, creates enrollment/package) → student appears in roster → hard reload → data survives → sign-out/sign-in → data survives.
7. **Negative-origin matrix** (record status codes only; GET endpoints are excluded — not server-enforced):
   | Method | Endpoint | Session | Origin | Expected |
   |---|---|---|---|---|
   | POST | `/api/classes` (kernel write) | none | absent | `403` |
   | POST | `/api/classes` (kernel write) | none | correct | `401` (proves origin check is not authz) |
   | POST | `/api/auth/sign-out` | valid | foreign | `403` (better-auth `trustedOrigins`) |
   | POST | `/api/auth/sign-up/email` | none | correct | record verdict + risk note on the open self-registration posture; synthetic credential only, or skip with recorded justification — never a real identity |
8. **Fault path:** enable the request-block rule for `/api/kernel` BEFORE the first snapshot fetch (rule on → hard reload with rule active) → the blocking load error renders (no empty workspace) → remove the rule → retry → workspace loads; confirm the server stayed up (`GET /` → `OK`).
9. **Decision:** record sanitized evidence per the allowlist, compare every row against the unified GO table, and declare GO or NO-GO. Any failed or missing row → NO-GO plus a new blocker issue.

### Unified GO table

| # | Condition | Evidence slot |
|---|---|---|
| 1 | Topology resolves at runtime to `app.<domain>`/`api.<domain>` with no redirects or origin mismatch; cookie attributes match the contract | sanitized origin + cookie attribute record |
| 2 | Chrome AND Safari incognito smokes pass (sign-in, callback, reload, sign-out/in) | per-browser pass/fail, timestamp, runner |
| 3 | Released D1 migration rehearsed on staging, forward-only | staging ledger / throwaway proof reference |
| 4 | `/readyz` 200 + liveness `OK` + CORS probe pass | sanitized curl status/body |
| 5 | First-snapshot failure renders blocking error and retry recovers (browser-only injection) | fault-path step record |
| 6 | Negative-origin matrix: every row matches its expected status | status-only matrix |
| 7 | Mutation outcomes truthful during UAT flows (Phase 5 behavior spot-checked) | step record |
| 8 | No secret value, raw cookie/token, OAuth `code`/`state`, database ID, or student PII anywhere in repo/issues/evidence | sanitize self-check before posting |
| 9 | Recovery drill rehearsed (Phase 2 evidence referenced) | runbook ledger reference |

## Success Criteria

- [ ] All UAT steps pass on the production Worker + D1 at the `app.<APP_DOMAIN>` origin — not staging, not `workers.dev`, not local libSQL.
- [ ] Chrome and Safari incognito flows both pass; missing evidence for either is NO-GO.
- [ ] Data survives hard reload and renewed session.
- [ ] Evidence records sanitized URL (redacted form), SHA, migration/readiness result, timestamp, runner, and per-step result.
- [ ] Any failed or missing GO condition results in NO-GO with a new blocker issue; no pilot starts on an ambiguous result.
- [ ] Roadmap milestone status and parent issue accurately link evidence.

## Risk Assessment

Live test requires an approved identity and deployment authority. Signals to stop: missing `APP_DOMAIN`, zone, or Google redirect registration; leftover `CORS_ORIGIN` in any loaded env file; restaged staging not done; missing operator approval; missing Chrome or Safari runner. Response: keep NO-GO, file a blocker issue per missing input, do not substitute staging/local tests, and do not weaken browser/production checks.
