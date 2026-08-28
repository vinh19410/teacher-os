---
title: "fix-staging-session-cookie-browser"
description: "Issue #125 round 2 (QC retest FAIL): staging sign-up/sign-in return 2xx but get-session is 200/null in browsers holding a same-name session cookie from the prod parent-domain zone (Domain=.teacheros.io.vn) — staging's cookie zone nests inside prod's. Fix: stage-scoped cookie namespace on staging (prefixed better-auth cookie names), proven by three live repro experiments, roundtrip tests, and a poisoned-jar deploy smoke."
status: completed
priority: P0
effort: "~0.5 day"
tags: [bug, auth, cookies, staging, qc-blocker]
created: 2026-08-28
---

# fix-staging-session-cookie-browser (issue #125, round 2)

## Overview

QC retest 2026-08-28 ~16:32 ICT: PR #126 removed the silent failure (Layer-2
toasts fire, E1 render + E4 wrong-password PASS) but E2/E3 still fail —
sign-up/sign-in return 2xx, the account exists, yet `GET /api/auth/get-session`
returns `200 null` in QC's browser and the flow stays stuck on
`/login?returnUrl=%2Fdashboard`. Fresh browsers work (verified live post-deploy
by dev, and reproduced in this round's Experiment A).

## Root cause — CONFIRMED by three live repro experiments against staging (2026-08-28, Playwright Chromium)

Throwaway accounts created via API; each experiment drives the real sign-in UI.

- **Experiment A (clean context): PASS.** Sign-in → `/dashboard`, in-page
  get-session returns a live session. Jar holds exactly one
  `__Secure-better-auth.session_token`, `domain=.staging.teacheros.io.vn` — the
  current topology shape (`packages/infra/src/topology.ts:55`).
- **Experiment B (planted host-only `__Secure-better-auth.session_token` for
  `api.staging.teacheros.io.vn`): FAIL, exact QC shape.** After sign-in the jar
  holds two same-name cookies; get-session → `200 null`; Layer-2 toast; stuck
  on `/login`.
- **Experiment C (planted PROD-shaped `__Secure-better-auth.session_token`
  with `Domain=.teacheros.io.vn`): FAIL, exact QC shape.** Identical jar
  coexistence and `200 null` outcome.

Mechanism: browsers store cookies per name+domain+path. The staging cookie
zone (`Domain=.staging.teacheros.io.vn`) **nests inside the prod cookie zone**
(`Domain=.teacheros.io.vn`), and both stages use the same better-auth cookie
names. Any browser that has ever held a prod-era same-name cookie sends it to
the staging API alongside the staging cookie (domain-match). better-auth's
cookie parsing is first-wins (`better-call@1.4.0 dist/cookies.mjs:28-31`,
`if (!cookies.has(key))`), and the older/foreign cookie sorts first → the
foreign token is parsed, fails signature/session lookup against staging's
secret and D1 → `null` session on every auth read. curl-based deploy smokes
pass because their jars start empty.

The exact stale shape inside QC's specific browser cannot be exported remotely;
both candidate shapes (host-only and prod parent-domain) reproduce the failure
identically (Experiments B and C), and the fix below is shape-agnostic: it
removes the name collision itself.

## Fix strategy (decided after red-team adjudication)

**Stage-scoped cookie namespace on staging**: give staging's better-auth
cookies their own name prefix (e.g. `advanced.cookiePrefix: "teacheros-staging"`
→ `__Secure-teacheros-staging.session_token; Domain=.staging.teacheros.io.vn`).
With unique names, foreign/prod cookies can no longer shadow staging cookies —
first-wins parsing only ever sees one cookie per name. Prod keeps the default
`better-auth` prefix and is untouched. Existing staging sessions are
invalidated once (QC re-login — acceptable on staging). The prefix applies
uniformly to every better-auth cookie (session_token, state, code_verifier,
callback_url, …), which also protects Google OAuth state reads from the same
collision class.

Config wiring follows the existing `COOKIE_DOMAIN` pattern:
`packages/auth` accepts an optional `cookiePrefix` input; `packages/infra`
topology (single source of topology) carries a new `authCookiePrefix` field
with a **safe-by-default rule**: the exact prod domain gets no prefix, every
other APP_DOMAIN gets `teacheros-staging` (a future preview/demo domain under
`teacheros.io.vn` must never silently re-enter the prod cookie zone); unset
APP_DOMAIN (local) → no prefix. The value rides an env binding
(`BETTER_AUTH_COOKIE_PREFIX`) into `apps/server`'s lazy `getAuth()`.

Verified in the vendored dist during planning (kongming gate):
`advanced.cookiePrefix` exists in better-auth 1.6.27
(`dist/cookies/index.mjs:26-30` — `options.advanced?.cookiePrefix ||
"better-auth"`; `dist/cookies/index.d.mts:99,109` types it), and it namespaces
every cookie created via `createAuthCookie` — including OAuth
`state`/`oauth_state` (`dist/state.mjs:54,61,83,120`) — so the Google-OAuth
collision class is closed by the same option. Server-side reads look up exact
names only (`dist/cookies/index.mjs:217`), so foreign prod cookies remain
structurally unread regardless of send order. No `advanced.cookies` fallback
needed.

Rejected alternatives:

- **Delete foreign cookies via Max-Age=0 wipe headers** (original design):
  wiping the prod parent-domain shape from staging responses would silently
  log users out of PROD whenever staging auth responds — a recurring side
  effect, and the wipe list must run forever. Also shape-proliferating
  (host-only, parent-domain, prefix-less variants…).
- **Cookie rename via `advanced.cookies` full map**: same effect as the prefix
  but more churn; kept only as the fallback if the prefix key is unsupported.
- **Client-side retry/cleanup**: JS cannot read or clear HttpOnly cookies; any
  cleanup still requires server Set-Cookie cooperation.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Browsers carrying foreign same-name cookies (prod parent-domain or host-only shapes) sign in on staging on the first try, with no client change | P0 |
| 2 | Prod cookie names and behavior are byte-identical to today (no prefix on prod; localhost/workers.dev unchanged) | P0 |
| 3 | The collision class is pinned: roundtrip tests prove foreign-cookie immunity, and the staging deploy smoke reproduces the poisoned-browser shape | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Cookie prefix support in @teacher-os/auth (TDD)](./phase-01-cookie-prefix.md) | Pending |
| 2 | [Phase 2: Wire the stage prefix through infra → env → server (TDD)](./phase-02-stage-prefix-wiring.md) | Pending |
| 3 | [Phase 3: Poisoned-jar staging deploy smoke + name updates](./phase-03-deploy-smoke-poisoned-jar.md) | Pending |

## Success Criteria

- [ ] Roundtrip test (https baseURL, per-value `getSetCookie()` assertions): with the prefix, every emitted cookie name carries it; a request bearing BOTH the foreign `__Secure-better-auth.session_token` and the prefixed staging cookie resolves the session from the prefixed one
- [ ] Without the prefix (default/prod/local), cookie names are unchanged (regression guard on prod)
- [ ] Staging deploy smoke: jar poisoned with the prod-shaped parent-domain cookie BEFORE sign-up → sign-up 200 → get-session returns the user; smoke greps updated to the prefixed name
- [ ] All repo quality gates green (biome, test, check-types, build, e2e)

## Out of scope

- Retrying #121 QC (unblocked once #125 passes retest; separate issue)
- Renaming prod cookie names (prod keeps `better-auth`; a future prod prefix change would be its own migration)
- Purging foreign junk cookies from browsers (harmless name-orphans once names are unique)

## Risks

- **`advanced.cookiePrefix` key unsupported in better-auth 1.6.27** — verified from vendored dist before wiring; fallback is the `advanced.cookies` per-cookie map (Phase 1 carries the decision gate).
- **Infra binding typo ships a prefix mismatch between deploy and smoke** — the smoke reads no name constant; it greps the prefixed literal in deploy-staging.yml, and Phase 2's topology unit test pins the derived value (`teacheros-staging`) so drift fails CI.
- **One-time staging session invalidation** — accepted in writing: staging-only, QC/dev re-login; prod unaffected.

## Rollback

Pure revert of the merge commit — no DB migration, no data change. Staging
auto-deploys on push to develop, so a revert push ships automatically. After
rollback, staging sessions issued under the prefix stop resolving (users
re-login) — staging-only impact.

## Red Team Review

### Session — 2026-08-28
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer
(hostile lenses; Fact Checker / Contract Verifier verification roles, Standard
tier, vendored better-auth@1.6.27 / better-call@1.4.0 / hono@4.13.2 dist
inspected for every cookie-semantics claim).
**Findings:** 23 raw → 15 after dedupe/merge (15 accepted, 0 rejected) —
**4 Critical, 7 High, 4 Medium**. The Critical cluster invalidates the
original fix design (legacy-cookie wipe headers) and forced a design pivot to
stage-scoped cookie namespace separation, applied to all phases above.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | No historical provenance for "pre-topology host-only staging cookies": domain + COOKIE_DOMAIN landed atomically (git archaeology); `staging.teacheros.io.vn` first appears with PR #124 — the staging API never deployed without crossSubDomainCookies | Critical | Accept | plan.md Root cause (restated as cookie-zone nesting; shape-agnostic fix; exact QC jar shape declared unexportable, both candidate shapes proven by Experiments B+C) |
| 2 | Most probable real-world shape is the PROD parent-domain cookie (`Domain=.teacheros.io.vn`) — sent to staging by domain-match, un-wipeable without silently logging users out of prod; original wipe list didn't cover it | Critical | Accept | plan.md Fix strategy (pivot: namespace separation via stage cookie prefix — red-team option (b)) |
| 3 | Wipe design scheme-blind: unprefixed domain-scoped wipe would delete the LIVE cookie on http boots (better-auth derives `__Secure-` prefix from baseURL scheme); dev boots with APP_DOMAIN set + http server would self-destruct sessions | Critical | Accept (superseded) | plan.md Fix strategy (wipes dropped entirely with the pivot) |
| 4 | Deploy smoke poisoned AFTER sign-up: fresh cookie sorted first → final assertion passes unconditionally; `\t` in YAML `echo` is a literal backslash-t (curl silently skips malformed line → poison inert) | Critical | Accept | Phase 3 (poison-first with `printf`, independent per-assertion failure modes, foreign-line-still-present guard) |
| 5 | Roundtrip "coexistence" assertion at header level is tautological for the deletion risk it claimed to mitigate | High | Accept | Phase 1 (foreign-cookie-immunity assertion replaces coexistence; jar semantics live in the deploy smoke) |
| 6 | Phase-2 sketch initialized hygiene at module scope — `env` is a `cloudflare:workers` binding (eval-time access crashes the isolate; `/readyz` dies) and would move COOKIE_DOMAIN validation failure timing | High | Accept | Phase 2 (lazy read inside `getAuth()` closure, pattern-identical to COOKIE_DOMAIN) |
| 7 | OAuth `state` cookie collision breaks Google sign-in for the same poisoned-browser class ("transient cookies are harmless" is false; better-call parse is first-wins) | High | Accept | plan.md Fix strategy (prefix applies uniformly to ALL better-auth cookies incl. state) |
| 8 | Roundtrip harness boots http://localhost:8000 → better-auth emits NO `__Secure-` prefix → planned `__Secure-` assertions unsatisfiable as written | High | Accept | Phase 1 (boot the https-baseURL scenario explicitly, documented in-test) |
| 9 | Local Playwright poisoned-browser repro infeasible (browser rejects `Domain=.staging…` on localhost; boot shim lacks cookieDomain wiring; wrong e2e paths cited) and plan.md vs phase-02 contradicted on whether it gates done | High | Accept | plan.md Success criteria (revised: header-level roundtrip + live deploy smoke; local browser repro dropped with documented reason) |
| 10 | curl cookie send-order is not RFC-6265 browser order in all cases → smoke end-state assertion could pass via fresh-first even with a broken fix | High | Accept | Phase 3 (poison-first ordering + prefixed-name-presence + foreign-line-present + get-session-user as independent assertions) |
| 11 | Production wiring line untested by any gate (roundtrip builds its own deps; 4 test suites stub authHandler) | Medium | Accept | Phase 2 (seam tests: topology derivation pinned; server read kept minimal + pattern-identical; live smoke covers the wiring end-to-end) |
| 12 | No rollback plan for an auth-response-touching change that auto-ships to staging | Medium | Accept | plan.md Rollback section (revert = full rollback; staging-only session invalidation noted) |
| 13 | try/catch swallow in the wrapper would make partial hygiene bugs unobservable | Medium | Accept (superseded) | plan.md Fix strategy (no wrapper exists after pivot) |
| 14 | Roundtrip https-baseURL requirement and `__Secure-`-anchored smoke greps unspecified → shape-drift tests could stay green while staging shape changed | Medium | Accept | Phase 1 + Phase 3 (https boot documented; smoke greps anchored to the prefixed literal) |
| 15 | Latent same-name collision class for `session_data`/`dont_remember_token` if cookieCache/dontRememberMe are ever enabled | Medium | Accept | plan.md Fix strategy (uniform prefix covers every cookie name; no config-conditional exposure) |

**Adjudication notes:** Every finding carried file:line (or vendored-dist)
evidence and passed the evidence filter; none rejected. Findings 1–4 form a
coherent Critical cluster: the original fix treated an unproven cookie shape
with a mechanism (wipes) that risks live-cookie deletion, while the most
probable shape (prod parent-domain cookie, verified live in Experiment C
after the finding) was out of scope. The pivot to stage-scoped cookie names
(delete the collision, not the cookies) was chosen over the parent-domain
wipe precisely because of finding 2's prod-logout side effect.

### Verification Results
- **Tier:** Standard (Fact Checker + Contract Verifier)
- **Claims checked:** 30 spot-checks across the three reviewers
- **Verified:** 27 | **Failed:** 3 | **Unverified:** 0
- Failures (all fixed by the rewrite): "topology wiring = PR #124" (actually
  atomic since 2026-08-20); "e2e shim already passes libsql + env with
  cookieDomain" (shim wires neither); "apps/web/e2e/…" path (e2e lives in
  `apps/e2e/`)

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-cookie-prefix.md, phase-02-stage-prefix-wiring.md, phase-03-deploy-smoke-poisoned-jar.md
- Decision deltas checked: 4 (wipe design → namespace separation; success
  criteria rewrite; smoke poison-first redesign; rollback section added)
- Reconciled stale references: wipe-header strings removed from all phase
  files (only the pivot design remains); old phase file names replaced
  (phase-01-legacy-cookie-hygiene / phase-02-server-wiring-roundtrip deleted,
  links updated); "no client change" claim kept (still true — cookie names
  are HttpOnly, server-side only); smoke grep update now anchors
  `teacheros-staging.session_token`
- Unresolved contradictions: 0
