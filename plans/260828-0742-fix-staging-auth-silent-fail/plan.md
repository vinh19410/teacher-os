---
title: "fix-staging-auth-silent-fail"
description: "Issue #125 P0: staging signup/sign-in silent fail — root-caused to the broken PWA service worker layer; remove the SW with a self-healing stub, make auth forms fail loudly, and add a deploy-time auth smoke check."
status: completed
priority: P1
effort: "~0.5 day"
tags: [bug, auth, pwa, staging, qc-blocker]
created: 2026-08-28
---

# fix-staging-auth-silent-fail (issue #125)

## Overview

QC hit a P0 on staging (https://app.staging.teacheros.io.vn): signup/sign-in
"fails silent" — spinner ends, form resets, no toast, and
`GET /api/auth/get-session` returns null, so nothing on staging is testable
(#121 retest is blocked).

Root cause found by live investigation on 2026-08-28 (all reproducible):

1. **The API/auth layer on staging is healthy.** `POST /api/auth/sign-up/email`
   returns 200 with a correct `Set-Cookie`
   (`__Secure-better-auth.session_token=…; Domain=.staging.teacheros.io.vn;
   Path=/; HttpOnly; Secure; SameSite=None`), sign-in works, and get-session
   with that cookie returns a live session (verified with curl AND in a real
   browser via in-page fetch). CORS preflight and allow-origin headers are
   correct. `app.staging`/`api.staging` are same-site (`io.vn` is on the PSL),
   so third-party-cookie blocking is not involved.
2. **The PWA service worker layer breaks the app in real browsers.**
   vite-plugin-pwa (default `generateSW`, `registerType: "autoUpdate"`,
   `devOptions.enabled: true`) precaches `index.html`. In a real browser
   (ZCode in-app Chromium, fresh profile, first visit to the current deploy):
   - With the SW active: the SPA booted to a **blank page** (`#app` empty, no
     redirect to /login) and a dynamic module import failed at the network
     level (`Failed to fetch dynamically imported module`).
   - After unregistering the SW and clearing caches: the **same build on the
     same deploy** renders, redirects to `/login?returnUrl=%2Fdashboard`, and a
     signup completes end-to-end into `/dashboard` with a live session.
   - The precached `index.html` is also the classic stale-shell vector across
     deploys: QC's browser had visited earlier staging deploys (#121 QC), so it
     ran a stale/broken shell where auth fetches fail and every failure is
     **invisible** (see 3).
3. **The auth forms have no failure path for thrown errors.**
   `sign-up-form.tsx` / `sign-in-form.tsx` await `authClient.signUp.email` /
   `signIn.email` with only a `finally`; a rejected fetch (broken SW, network)
   fires neither `onSuccess` nor `onError`, so the spinner stops and the form
   "resets" with **no toast** — exactly QC's report.

Fix strategy (bugfix route via /ak:fix):

- **Phase 1 (root cause):** remove the vite-plugin-pwa SW from the build and
  ship self-unregistering stubs (`/sw.js`, `/dev-sw.js`) plus a no-op
  `/registerSW.js` so browsers that already hold the broken SW self-heal
  without manual DevTools intervention.
- **Phase 2 (kill the "silent"):** auth forms treat the auth call and session
  verification as two separately-handled layers with accurate copy — failures
  always toast, success UI only after the session is confirmed.
- **Phase 3 (deploy-time guards):** staging deploy smoke exercises sign-up →
  get-session (API-level auth) and asserts the stub files are served as real
  JS with network-first cache headers (staging + prod). Honest coverage map:
  browser/SW behavior is guarded by Phase 1's `serviceWorkers: "allow"` e2e
  spec **plus** the manual heal verification done during investigation; in-browser
  SW behavior cannot be caught by deploy-time curls, and e2e does not gate the
  staging deploy (accepted residual risk, recorded in Scope boundary).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Staging app boots and auth works in browsers with and without a previously-installed SW | P0 |
| 2 | Auth failures are always visible (toast), never a silent form reset | P1 |
| 3 | Staging deploys fail loudly when API-level auth breaks | P2 |

## Evidence (2026-08-28, staging)

- Deploy run for `2ab0e02` succeeded 06:36 UTC; QC tested ~07:16 UTC (staging
  was fully live).
- curl round-trip: sign-up 200 + Set-Cookie (attributes above); sign-in 200;
  get-session with cookie → `{"session":{…},"user":{…}}`.
- OPTIONS preflight → `access-control-allow-origin:
  https://app.staging.teacheros.io.vn`, `…allow-credentials: true`.
- Real browser: blank page with SW; after SW removal → renders, signup →
  `/dashboard`, in-page `fetch(get-session, credentials:include)` → 200 with
  session JSON.
- Deployed bundle bakes `VITE_SERVER_URL=https://api.staging.teacheros.io.vn`
  correctly (checked `auth-client-*.js` chunk).
- SW precache manifest (deployed sw.js): `registerSW.js`, `index.html`
  (revision `dc50d48f…`), `manifest.webmanifest`.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Remove the broken PWA service worker](./phase-01-remove-service-worker.md) | Pending |
| 2 | [Phase 2: Auth forms fail loudly](./phase-02-auth-forms-fail-loudly.md) | Pending |
| 3 | [Phase 3: Deploy-time guards: auth round-trip + stub serving](./phase-03-staging-deploy-auth-smoke.md) | Pending |

## Scope boundary

- No changes to better-auth config, cookie attributes, CORS, or topology —
  proven healthy.
- No new PWA/offline features; the SW is removed until it has a real job
  (reintroduction requires: navigateFallback hardened, /api never intercepted,
  stale-shell self-heal, and a browser-level e2e).
- No email-verification work (none is configured; it cannot cause this bug).
- Prod (deploy.yml) gets the same SW removal via the shared vite config and
  the stub-serving assertions — that is intended: prod has the identical
  latent defect. Prod does **not** get the sign-up smoke (junk rows in prod
  D1 are unacceptable); the prod API-auth blind spot is documented in
  Phase 3.
- **Accepted residual risks (in writing):** e2e does not gate the staging
  deploy (e2e.yml runs on develop but Deploy Staging doesn't depend on it —
  changing deploy CI topology is out of scope for this P0); the two-reload
  heal on already-affected browsers is verified manually, not in CI.

## Red Team Review

### Session — 2026-08-28
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer
(hostile lenses, Fact Checker / Flow Tracer / Scope Auditor verification roles).
**Findings:** 13 raw → 9 after dedupe (9 accepted, 0 rejected)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Planned no-SW e2e is a tautology: suite runs `serviceWorkers: "block"` (playwright.config.ts:24) — SW assertions can never fail; "Phase 1's e2e covers the SW layer" claim false | Critical | Accept | Phase 1 (spec uses `serviceWorkers: "allow"`; coverage claims rewritten; manual heal verification documented) |
| 2 | Stub's client-reload loop is dead code: no `clients.claim()` and default `matchAll` excludes uncontrolled clients | High | Accept | Phase 1 (stub adds `clients.claim()` + `includeUncontrolled: true` + per-client catch) |
| 3 | Self-heal depends on `/sw.js` reaching the network (HTTP cache could hold old sw.js ~24h); no cache-header control or assertion | High | Accept | Phase 1 + Phase 3 (assert `cache-control: max-age=0/no-store` in e2e and deploy smoke; Workers assets already serve it) |
| 4 | Deployed `/sw.js`/`/registerSW.js` serving contract verified nowhere; SPA fallback would serve HTML 200 and silently kill the heal | Medium | Accept | Phase 3 (serving assertions in staging + prod smokes) |
| 5 | Phase 2 verify-in-onSuccess: getSession throw lands in auth catch → wrong "couldn't create account" copy + retry → "user already exists" loop; success banner renders before verification | High | Accept | Phase 2 (return-value style, layered try/catch, success state only after verify, distinct copy) |
| 6 | e2e route.fulfill without CORS headers rejects in browser — session-less scenario tests the wrong path; toast copies must be distinguishable | High | Accept | Phase 2 (spec includes allow-origin/allow-credentials headers; asserts distinct copy per layer) |
| 7 | Dev SW lives at `/dev-sw.js?dev-sw`; stub only at `/sw.js` → dev shells never heal; requirement wording says "dev" | Medium | Accept | Phase 1 (`public/dev-sw.js` stub; requirements reworded) |
| 8 | Phase 3 smoke: sign-up needs `name` (400 otherwise); `"$API_READY_URL"./../api/...` derivation invalid; `date +%s` email collision; better-auth default rate limit 3/10s on /sign-up → false-red; password source unspecified | Medium | Accept | Phase 3 (`API_BASE_URL` env; canonical body per auth-roundtrip.test.ts; `github.run_id` email; openssl password; 429 → warning + one retry) |
| 9 | Prod inherits SW removal with readyz-only smoke and no verification; stale README PWA claims + playwright.config comment rationale; cited convention test doesn't cover deploy-staging.yml | Medium | Accept | plan.md scope boundary (prod blind spot + no-signup-smoke-on-prod rationale in writing); Phase 1 (README + comment updates); Phase 3 (honest validity wording) |

**Adjudication notes:** Every finding carried file:line evidence verified
against the worktree (including vendored `@better-fetch`/`better-auth` dist
inspection proving the thrown-error path). Rejected none — the hostile lenses
all independently confirmed the Phase-2 diagnosis (forms have no catch;
better-fetch throws on network failure firing no callback) before finding
flaws, so the plan's factual base stands.

### Whole-Plan Consistency Sweep

Applied findings reconciled across all four files: coverage claims in plan.md
(Fix strategy, Success criteria, Scope boundary) now match Phase 1's
`serviceWorkers: "allow"` spec reality and Phase 3's serving assertions; the
stub body appears once (Phase 1 step 3) and Phase 3 references — not
duplicates — it; Phase 2's layered handler is specified once with copies the
e2e section asserts; no stale "two reloads" or "Phase 1's e2e covers the SW
layer" claims remain. Zero unresolved contradictions.

## Success Criteria

- [ ] Fresh browser on staging: app renders (no blank page), signup lands on
      `/dashboard` with a live session (equivalent to the in-browser repro).
- [ ] Browser with the old broken SW: heals via the stub chain (stale shell at
      most once more, then clean); `/sw.js` serving + cache headers asserted by
      the deploy smoke; heal on real browsers verified manually (evidence:
      investigation repro 2026-08-28).
- [ ] Network-level signup/sign-in failure shows an auth-failure toast; a 2xx
      auth response without a session shows the distinct session toast and
      stays on /login; no success banner in any failure scenario.
- [ ] `pnpm exec biome check .`, `pnpm test`, `pnpm check-types`,
      `pnpm build` pass; existing + new e2e specs pass.
- [ ] deploy-staging.yml smoke asserts sign-up → get-session round-trip;
      staging + prod deploy smokes assert `/sw.js` + `/registerSW.js` serving.
