---
phase: 3
title: "Poisoned-jar staging deploy smoke + name updates"
status: in-progress
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: Poisoned-jar staging deploy smoke + name updates

## Overview

Make the Deploy Staging auth smoke reproduce the poisoned browser: the jar is
planted with the prod-shaped parent-domain session cookie BEFORE the auth
flow, and the smoke passes only if the staging flow ignores the foreign cookie
and lands a real session. Update the smoke's cookie-name greps to the staged
prefix.

## Requirements

- Functional: after poisoning, sign-up → 200 and get-session → user, with the
  prefixed cookie present in the jar and the foreign name never consulted.
- Non-functional: single throwaway account per deploy (reuse the existing
  smoke account); `printf` (not `echo -e`) for tab-separated Netscape jar
  lines; retries mirror the existing rate-limit discipline.

## Architecture

Extend the "Smoke check auth (sign-up → get-session)" step in
`.github/workflows/deploy-staging.yml`:

1. The jar is poisoned FIRST (foreign cookie oldest, the order browsers send
   them) inside `attempt_signup` so 429 retries re-poison:
   `printf '#HttpOnly_.%s\tTRUE\t/\tTRUE\t0\t__Secure-better-auth.session_token\tbogus\n' "$PARENT_DOMAIN" >> /tmp/smoke-jar.txt`
   — `PARENT_DOMAIN: teacheros.io.vn` is an explicit workflow env literal (NOT
   derived from APP_DOMAIN: a `#*.` derivation breaks on an apex domain and
   the poison must stay correct even if APP_DOMAIN stops being a prod
   subdomain).
2. The sign-up curl uses **`-b jar -c jar`**: `-b` loads the poison into the
   cookie engine (sent with the request, like a poisoned browser); `-c` ALONE
   would overwrite the jar from an empty in-memory state and destroy the
   poison (verified empirically with curl — the loaded session cookie is
   persisted by `-c` only when it was loaded via `-b`).
3. Assertions, each capable of failing independently:
   - sign-up returned 200 (existing);
   - jar contains `teacheros-staging.session_token` (prefixed name landed);
   - jar STILL contains the foreign line (the fix does not depend on deleting
     foreign cookies — keeps the smoke honest about reproducing the shape);
   - get-session (existing block, `-b jar`) returns `"user"` — the exact
     end state that failed for QC.
4. Update the jar grep `better-auth.session_token` →
   `teacheros-staging.session_token` so the smoke anchors the NEW namespace.
5. Live dry-run (done 2026-08-28 pre-ship): printf-built jar + curl
   `-b jar` against staging get-session sent the foreign cookie and the
   current (unfixed) server returned `200 null` — the poison is live. A full
   end-to-end rehearsal (poison → sign-up with `-b -c` → assertions) against
   the UNFIXED staging showed: assertion A (prefixed cookie in jar) fails as
   expected, assertion B (foreign line survives) passes, but get-session
   returned a LIVE session — curl's jar-file write order made it send the
   real cookie first, while browsers send oldest-first (foreign first →
   null, per Experiment C). Conclusion, recorded honestly: **assertion A is
   the guard that fails on a prefix revert** (the prefixed name can never
   land in the jar); the get-session assertion proves auth works end-to-end
   with a foreign cookie present (the QC end state) but, under curl's
   ordering, is not by itself a revert detector. Post-fix the server reads
   exact names only, so ordering is irrelevant to the outcome.

Prod (`deploy.yml`): no signup smoke (junk rows unacceptable — unchanged
decision); prod keeps the default namespace, so no name updates there.

## Related Code Files

- Modify: `.github/workflows/deploy-staging.yml`

## Implementation Steps

1. Apply the jar-poison block + assertion updates (done in this round's diff).
2. Local dry-run of the jar format and curl behavior (step 5 above — done).
3. Code review found and fixed: missing `-b` on the sign-up curl (Critical —
   jar clobber), apex-unsafe PARENT_DOMAIN derivation, misleading `-b` retry
   suffix. Ship and watch the next real staging deploy run green end-to-end.

## Success Criteria

- [ ] Deploy Staging green including the poisoned-jar assertions on the first real deploy of this fix
- [ ] Smoke fails loudly by construction if the foreign cookie starts winning again (get-session `"user"` assertion depends on the prefixed name resolving)
- [ ] Name greps updated; no prod workflow changes

## Risk Assessment

curl's Netscape jar semantics are the load-bearing external behavior — both
the `-c`-clobbers-without-`-b` hazard and the `#HttpOnly_.domain` parsing were
validated with local curl before shipping. Rate limiting (3/10s/IP) is
absorbed by the existing retry pattern.
