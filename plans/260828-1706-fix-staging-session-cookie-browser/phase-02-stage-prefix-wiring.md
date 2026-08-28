---
phase: 2
title: "Wire the stage prefix through infra → env → server (TDD)"
status: pending
priority: P0
effort: "2h"
dependencies: [1]
---

# Phase 2: Wire the stage prefix through infra → env → server (TDD)

## Overview

Carry the staging cookie prefix from the single source of topology
(`packages/infra`) through the alchemy env binding into the server's lazy
`getAuth()`, with tests at each seam and zero change for prod, localhost, and
workers.dev.

## Requirements

- Functional: staging worker emits `__Secure-teacheros-staging.*` cookies;
  prod/local boot unchanged (no prefix).
- Non-functional: env access stays lazy (bindings are `cloudflare:workers` —
  module-eval access is a deploy-breaking bug); one derivation point
  (`packages/infra/src/topology.ts`), one unit test pinning the derived value.

## Architecture

Following the proven `COOKIE_DOMAIN` pattern exactly, with kongming's
safe-by-default rule (R2):

1. `packages/infra/src/topology.ts`: add `authCookiePrefix` to
   `DomainTopology` — rule is **"prefix for every APP_DOMAIN except the exact
   prod domain"** (prod domain pinned as an exported constant), never a
   `startsWith("staging.")` match: a future preview/demo domain under
   `teacheros.io.vn` must not silently re-enter the prod cookie zone. Unset
   APP_DOMAIN → `undefined`. Value: `teacheros-staging`.
2. `packages/infra/alchemy.run.ts`: bind `BETTER_AUTH_COOKIE_PREFIX:
   topology?.authCookiePrefix ?? ""` next to the existing `COOKIE_DOMAIN`
   binding (empty string means "no prefix", mirroring COOKIE_DOMAIN's
   convention).
3. `packages/env`: add `BETTER_AUTH_COOKIE_PREFIX` to the worker env types
   (empty-string tolerant, same shape as `COOKIE_DOMAIN`).
4. `apps/server/src/index.ts`: inside the lazy `getAuth()` closure, pass
   `cookiePrefix: env.BETTER_AUTH_COOKIE_PREFIX || undefined` into
   `createAuth` — same closure discipline as the other env reads
   (`index.ts:17-33`); never at module scope.

Atomicity constraint (kongming R1): the smoke's name grep
(`deploy-staging.yml:139`), the roundtrip name assertions
(`auth-roundtrip.test.ts:68,87,95`), and the prefix switch must land in ONE
PR — a partial merge reds the staging deploy on its first run.

Production wiring testability: `apps/server/src/index.ts` cannot boot under
plain node (`cloudflare:workers` binding). The prefix plumbing is therefore
tested at its seams: topology unit test (derivation), auth roundtrip
(Phase 1), and the Phase 3 deploy smoke (live staging). The one untestable
line is the env read inside `getAuth()` — kept minimal and pattern-identical
to the COOKIE_DOMAIN read it sits next to.

## Related Code Files

- Modify: `packages/infra/src/topology.ts` (+ its test file)
- Modify: `packages/infra/alchemy.run.ts`
- Modify: `packages/env/env.d.ts` (or the server env surface — follow COOKIE_DOMAIN)
- Modify: `apps/server/src/index.ts`

## Implementation Steps

1. **Test first**: topology test asserting `authCookiePrefix` for all three
   branches — staging domain → `"teacheros-staging"`, the exact prod domain →
   `undefined`, unset/absent → `undefined` — red.
2. Implement the derivation; update alchemy binding + env types + server read — green.
3. Grep-audit for other consumers of cookie names: `grep -rn "better-auth.session_token"`
   outside plans/ — every hit outside deploy-staging.yml must either be
   shape-agnostic (substring still matches) or be updated in Phase 3.
4. Gates: `pnpm test`, biome, check-types, `pnpm build`.

## Success Criteria

- [ ] Topology unit test pins staging prefix + prod no-op
- [ ] `alchemy.run.ts` + env types + server read wired with the lazy pattern
- [ ] Name-consumer audit recorded (list of hits + disposition per hit)
- [ ] All package gates green

## Risk Assessment

A binding typo (env var name mismatch between alchemy and `env.d.ts`) ships an
empty prefix silently — mitigated by the topology test pinning the derived
literal, the Phase 3 smoke asserting the prefixed cookie by name on live
staging, and `alchemy deploy` failing loudly on unknown binding keys.
