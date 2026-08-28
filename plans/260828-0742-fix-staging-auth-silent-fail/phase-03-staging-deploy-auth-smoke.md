---
phase: 3
title: "Deploy-time guards: auth round-trip + stub serving"
status: pending
priority: P2
effort: "1.5h"
dependencies: [1]
---

# Phase 3: Deploy-time guards: auth round-trip + stub serving

## Overview

The staging deploy shipped green while auth was QC-blocking, and the only
deploy-time smoke is `/readyz`. Add two deploy-time guards:

1. **Auth round-trip (staging only):** curl-level sign-up → get-session
   sequence; catches API-level auth regressions (cookie config, CORS, secret,
   D1 session store).
2. **Stub serving (staging + prod):** assert `/sw.js` and `/registerSW.js` are
   served as real JavaScript with cache headers that keep the SW update check
   on the network — the one browser-layer fact a deploy job *can* verify, and
   the anchor of Phase 1's self-heal chain.

Honest scope: neither guard can catch in-browser SW behavior; the heal chain
on real browsers was verified manually during investigation (SW removal → app
renders, auth round-trips) and is documented in Phase 1. Also accepted in
writing (red-team): e2e does **not** gate the staging deploy — `e2e.yml` runs
on develop but `Deploy Staging` doesn't depend on it; changing deploy topology
is out of scope for this P0.

## Requirements

- Functional: after the `/readyz` poll passes, the staging deploy job runs the
  auth smoke; on failure the deploy goes red with a clear `::error::`.
- Functional: staging **and** prod deploy jobs assert stub serving
  (status 200, `content-type: text/javascript`, body contains `unregister`,
  `cache-control` with `max-age=0`, `no-store`, or `no-cache`).
- Non-functional: no secrets or token values echoed; throwaway smoke
  credentials generated per run, never committed; no signup smoke against
  **prod** (junk rows in prod D1 are not acceptable) — prod gets the serving
  assertions only, and the prod auth blind spot is documented here.

## Architecture

Extend `.github/workflows/deploy-staging.yml` and `.github/workflows/deploy.yml`
with bash steps in the existing style (curl + cookie jar + `::error::`).
A new `API_BASE_URL` env sits beside `API_READY_URL` as the single URL source —
no `/readyz/../` splicing.

Rate-limit reality (red-team): better-auth's default special rule allows 3
requests / 10s per IP for `/sign-up*`; GitHub runner IPs are shared. The smoke
uses one signup per deploy, treats 429 as a warning + single retry with a
fresh email (not a silent pass), and treats unexpected 4xx as red.

## Related Code Files

- Modify: `.github/workflows/deploy-staging.yml` — `API_BASE_URL` env, auth
  smoke step, stub-serving assertions.
- Modify: `.github/workflows/deploy.yml` — same `API_BASE_URL` +
  stub-serving assertions (prod; no signup smoke).

## Implementation Steps

1. Add to `deploy-staging.yml` env: `API_BASE_URL: https://api.staging.teacheros.io.vn`.
2. Auth smoke step (after readyz), following the canonical request shape from
   `apps/server/src/auth-roundtrip.test.ts` (name + email + password, JSON
   content-type):
   ```bash
   email="smoke-${{ github.run_id }}@smoke.teacheros.internal"
   pass="$(openssl rand -hex 16)"   # never echoed
   code=$(curl -sS -c /tmp/smoke-jar.txt -o /tmp/signup.json -w '%{http_code}' \
     -X POST "$API_BASE_URL/api/auth/sign-up/email" \
     -H "Content-Type: application/json" \
     -H "Origin: https://app.staging.teacheros.io.vn" \
     -d "{\"name\":\"Deploy Smoke\",\"email\":\"$email\",\"password\":\"$pass\"}")
   # 429 → ::warning:: + one retry with run_id-b suffix; other non-200 → ::error:: + exit 1
   # assert jar contains better-auth.session_token, else ::error:: + exit 1
   code=$(curl -sS -b /tmp/smoke-jar.txt -o /tmp/session.json -w '%{http_code}' \
     "$API_BASE_URL/api/auth/get-session")
   # assert 200 and grep -q '"user"' /tmp/session.json, else ::error:: + exit 1
   ```
   One junk user per staging deploy is accepted (documented in a workflow
   comment; `github.run_id` keeps emails unique across queued runs —
   `date +%s` can collide within the same second).
3. Stub-serving assertions (both workflows, after readyz):
   ```bash
   for f in sw.js registerSW.js; do
     body=$(curl -sS -D /tmp/h.txt "$APP_ORIGIN/$f" -o /tmp/$f)  # APP_ORIGIN env
     grep -qi '^content-type: text/javascript' /tmp/h.txt || fail
     grep -q unregister /tmp/$f || fail   # skipped for registerSW.js (no-op)
     grep -Eiq "^cache-control:.*(max-age=0|no-store|no-cache)" /tmp/h.txt || fail
   done
   ```
4. Redaction: print only HTTP codes and pass/fail; never echo tokens or the
   generated password.
5. Pre-decided fallback (advisory condition): if the serving header assertion
   ever fails because Workers assets change their default, the fix is an
   `apps/web/public/_headers` file pinning `Cache-Control: max-age=0` for
   `/sw.js` + `/registerSW.js` (Vite copies it to dist; Workers assets honor
   it) — decided now, not improvised at deploy time.
6. Workflow validity: no `secrets.*` in ci/e2e workflows (existing convention
   test covers ci.yml/e2e.yml only — this file is validated by Actions' own
   YAML parse on push; visual review in the PR covers the rest).

## Success Criteria

- [x] Both workflows updated; YAML valid; no secrets echoed.
- [x] Manual dry-run of the exact curl sequence against staging passes (auth
      round-trip + serving assertions).
- [x] Plan.md records the accepted residual risks (e2e not deploy-gating;
      prod auth smoke deliberately omitted to avoid prod junk rows).
