---
title: Complete import hardening
status: completed
---

# Changes
1. Preserve parser field caps and run existing syllabus-import tests.
2. Add Hono bodyLimit to POST /syllabi only after the kernel's existing authentication middleware, before readBody. Max serialized bytes 2 * 1024 * 1024; JSON 413 with explanatory Vietnamese error.
3. Disable count input when importResult?.ok is true and explain count derives from import; existing removal clears result and restores editing.

# Test-first verification
- Run existing parser tests.
- Add route regression covering oversized body with/without Content-Length, 413 and no persistence; keep existing valid-create coverage. Do not reproduce third-party vulnerabilities; local defensive boundary tests only.
- Extend existing browser import scenario for count disable/remove transitions if suitable; otherwise exercise real local UI with browser and record result.
- Run pnpm --filter web exec vitest run src/lib/syllabus-import.test.ts; focused server tests; affected type checks.
- Independent review must clear Important/Critical findings before beta ship.

# Non-goals
No parser rewrite, grouping changes, migrations, replacement-route policy changes, or production promotion.

## Evidence
Parser 28 and server 150 tests passed; affected type checks/build passed. Browser verified imported-count lock/removal. Full Playwright replay not run: existing signup helper selectors are stale; see plan verification receipt.
