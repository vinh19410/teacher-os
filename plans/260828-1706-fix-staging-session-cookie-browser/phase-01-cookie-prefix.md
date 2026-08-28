---
phase: 1
title: "Cookie prefix support in @teacher-os/auth (TDD)"
status: pending
priority: P0
effort: "2h"
dependencies: []
---

# Phase 1: Cookie prefix support in @teacher-os/auth (TDD)

## Overview

Teach `createAuth` to emit better-auth cookies under a stage-specific name
prefix so staging cookie names never collide with prod-zone cookies of the
same semantic name. Test-first at the auth-package level, including the
foreign-cookie-immunity proof at header level.

## Requirements

- Functional: `createAuth({ cookiePrefix })` emits every auth cookie with the
  prefix (`__Secure-teacheros-staging.session_token` under https); omitted
  prefix keeps today's names byte-for-byte (prod/local regression guard).
- Non-functional: no better-auth internals monkey-patching; the config key is
  verified from the vendored 1.6.27 dist before wiring.

## Architecture

Decision gate (RESOLVED during planning — kongming verified the vendored dist):
`advanced.cookiePrefix` exists in better-auth 1.6.27
(`dist/cookies/index.mjs:26-30`: `options.advanced?.cookiePrefix ||
"better-auth"`; typed at `dist/cookies/index.d.mts:99,109`), and every cookie
created via `createAuthCookie` — OAuth `state`/`oauth_state` included — flows
through the same getter (`dist/context/create-context.mjs:204`), so one option
namespaces the entire cookie set. Server-side reads look up exact names only
(`dist/cookies/index.mjs:217`). No fallback path required; keep this citation
in the test file comment next to the https-baseURL note.

New input: `cookiePrefix?: string` on `CreateAuthInput`. Value validation
(cookie-name-safe chars) mirrors `crossSubDomainCookieDomain`'s strict style in
`packages/auth/src/topology.ts`.

Roundtrip proof (extends the `auth-roundtrip.test.ts` harness — new sibling
test file so the existing assertions stay untouched):

- Boot A: `baseURL: "https://localhost:8000"` (plain node does not validate
  the scheme; better-auth derives the `__Secure-` prefix from it) +
  `cookiePrefix: "teacheros-staging"` → sign-up/sign-in responses carry ONLY
  `__Secure-teacheros-staging.*` names.
- Foreign-cookie immunity: a GET get-session whose `Cookie` header contains
  BOTH `__Secure-better-auth.session_token=bogus` AND the prefixed staging
  cookie returns the live session (first-wins parsing is per-name, so the
  foreign name is never consulted).
- Boot B (regression guard): no prefix + https baseURL → names are exactly
  `__Secure-better-auth.*` as today.

## Related Code Files

- Modify: `packages/auth/src/index.ts` (input + advanced config merge)
- Create: `packages/auth/src/cookie-prefix.test.ts` (or roundtrip-style sibling)
- Modify: `packages/auth/src/topology.test.ts` only if validation helper lands there

## Implementation Steps

1. Verify the config key from vendored dist; write the decision into the phase log.
2. **Test first**: the three roundtrip scenarios above — red.
3. Implement `cookiePrefix` pass-through — green.
4. `pnpm test --filter @teacher-os/auth`, biome, check-types green.

## Success Criteria

- [ ] Tests prove prefixed names, foreign-cookie immunity, and the no-prefix regression guard
- [ ] Decision gate outcome (prefix knob vs cookies-map fallback) recorded in the phase log
- [ ] Auth package gates green

## Risk Assessment

If neither the prefix knob nor a workable cookies-map exists in 1.6.27, the
namespace-separation strategy needs a better-auth upgrade — STOP and report
instead of hand-rolling cookie rewriting (upgrading better-auth is a decision,
not an implementation detail). The https-baseURL-in-test trick must be
documented in the test file comment so a future reader does not "fix" it to
http and silently change the asserted cookie shapes.
