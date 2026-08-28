---
title: Issue 125 round 2 — staging session shadowed by prod parent-domain cookies
date: 2026-08-28
summary: "Staging cookie zone nests inside prod's; same-name cookies shadowed sessions. Fixed with stage-scoped cookie namespace (advanced.cookiePrefix), red-teamed + kongming GO x2."
---

# Issue 125 round 2 — staging session shadowed by prod parent-domain cookies

QC P0 round 2: PR #126 removed silent fail but get-session still 200/null in seasoned browsers. Live repro (Playwright A/B/C): staging cookie zone nests inside prod zone (Domain=.teacheros.io.vn vs .staging.teacheros.io.vn) — same-name cookies coexist, better-auth first-wins parsing reads the foreign token. Fix: stage-scoped cookie namespace (advanced.cookiePrefix teacheros-staging for non-prod members of the prod zone, safe-by-default via PROD_APP_DOMAIN gate in infra topology; prod byte-identical). Red-teamed 15 verified findings (design pivoted from wipe-headers after the Critical cluster: no provenance for host-only staging cookies; prod parent-domain shape unwipeable without prod logout; scheme-blind wipes would delete live cookies on http boots); kongming GO x2. Local review caught a Critical smoke bug (curl -c without -b clobbers the poisoned jar — verified empirically), fixed + re-approved. Gates: 6/6 packages, biome, check-types, build; poisoned-jar smoke dry-run validated live both directions. Lessons: 'legacy shape' hypotheses need provenance evidence (git archaeology refuted the first root-cause narrative); curl jar semantics (-b required to load, -c alone clobbers, jar write order != browser send order) must be tested before CI relies on them.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
