---
phase: 3
title: "Polish and verification"
status: completed
priority: P2
effort: "0.25-0.5d"
dependencies: [1, 2]
---

# Phase 3: Polish and verification

## Overview

Add the export's motion layer (auth-wrap rise-in, tabpanel crossfade, tab thumb slide, spinner — every animation disabled under `prefers-reduced-motion`), audit focus rings across all controls, then run the full verification matrix: responsive sweep 360–1920, keyboard pass, side-by-side screenshot diff against the export, final auth regression, and repo gates (`pnpm check`, `pnpm test`). Cleanup of dead code from the old toggle UI closes the phase.

## Requirements

Functional:
- Motion per export, nothing more: auth-wrap rise-in (opacity 0→1 + 8px translateY, 220ms) on mount (`auth-redesign.html:208-216`); tabpanel crossfade (opacity + 4px translateY, 220ms) each time a panel is revealed (`auth-redesign.html:467-473`); tab thumb slide 220ms (landed in Phase 2); submit spinner 0.7s linear spin (`auth-redesign.html:431-439`).
- Every motion disabled under `prefers-reduced-motion` (`auth-redesign.html:504-506`).
- Cleanup: remove any dead code left from the old toggle (unused imports, old wrapper classes); confirm no references to removed props remain.
- Final auth regression on dev server: sign in, sign up (fresh email), Google redirect initiation, unauthenticated guard still redirects to `/login` (`apps/web/src/routes/_auth/route.tsx:7-15`).

Non-functional:
- Focus-visible audit: tabs, both tab panels' inputs, password toggles, forgot link, switch-line link, Google button, submit buttons — all show `--focus-ring` and `outline-none` pairing.
- Responsive matrix: 360, 420, 768, 960, 1280, 1920px — no horizontal scroll; ≤960 collapse and ≤420 tightening per Phase 1 spec; tab labels never truncate; mock card hidden ≤960; switch line wraps gracefully at 360px.
- Repo gates: `pnpm check` (Biome only), `pnpm check-types` (root script: `vite build` + `tsc --noEmit` in apps/web — this is the only gate that catches type breakage), and `pnpm test` (vitest lib contract tests + CI workflow/topology drift scripts) green. No component/e2e test infra exists — verification is browser-manual, evidence = checklist below.

## Architecture

No structural changes — this phase only adds utility classes to existing nodes (motion classes on `auth-wrap` and panels, already-built controls) and deletes leftovers. `tw-animate-css` is already imported globally (`packages/ui/src/styles/globals.css:2`), so `animate-in fade-in slide-in-from-bottom-*` utilities are available without new dependencies or CSS keyframes.

Motion mapping (export → Tailwind):

| Export rule | Utility |
|---|---|
| `.auth-wrap` rise 8px / 220ms (`auth-redesign.html:208-216`) | `animate-in fade-in slide-in-from-bottom-2 duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)] motion-reduce:animate-none` on auth-wrap |
| `.tabpanel` fade 4px (`auth-redesign.html:467-473`) | same family with `slide-in-from-bottom-1` on each panel, re-triggered by keying the class on `hidden` removal (panel re-mounts its animation when unhidden — apply via the panel's `hidden` toggle; if the animation doesn't re-fire on unhide, re-trigger the animation class from a state counter in `login.tsx`. NEVER remount the panels: `key={mode}` wipes TanStack Form state and typed values, violating the Phase 2 criterion) |
| reduced motion (`auth-redesign.html:504-506`) | `motion-reduce:animate-none` (and `motion-reduce:transition-none` where a transition exists purely as decoration) on every animated node |

## Related Code Files

- Modify: `apps/web/src/routes/login.tsx` — rise-in class on auth-wrap.
- Modify: `apps/web/src/components/sign-in-form.tsx`, `sign-up-form.tsx` — crossfade class on panels.
- Modify (only if audit finds gaps): `apps/web/src/components/auth/auth-tabs.tsx`, `auth-field.tsx`, `apps/web/src/components/google-oauth-button.tsx` — focus-ring additions.
- Delete: none expected (old form markup is replaced in place); any file created in Phase 2 stays.

## Implementation Steps

1. Add rise-in classes to `auth-wrap` in `login.tsx` (mapping table above).
2. Add crossfade classes to both panel `<form>` elements; verify the animation re-fires on each tab switch (DevTools animations panel); if it doesn't re-fire on unhide, re-trigger the animation class from a state counter in `login.tsx` — never remount the panels (`key={mode}` is forbidden: it wipes typed values, Phase 2 criterion).
3. Focus-ring sweep: keyboard-tab through the entire page (tabs → panel controls → switch line → Google) and add missing `focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none`.
4. Reduced-motion check: OS "Reduce motion" on (macOS Settings → Accessibility → Display) → reload → no rise/crossfade/thumb/spinner animation; thumb still switches instantly (state, not animation, carries meaning).
5. Responsive matrix at 360/420/768/960/1280/1920 (DevTools device toolbar): no horizontal scrollbar; breakpoints behave per spec; type/spacing eyeball vs export.
6. Screenshot diff: render the export HTML and the app /login side by side at 1280px (and 375px); log deltas; fix visible ones (spacing/rounding/color only — no behavior).
7. Cleanup pass: `grep -rn "onSwitchTo\|showSignIn" apps/web/src` → zero hits; no unused imports (Biome flags them in `pnpm check`).
8. Final auth regression (Success Criteria) + `pnpm check` + `pnpm check-types` + `pnpm test`.
9. Update this plan's statuses (`plan.md` phases table, phase frontmatter) after gates pass.

## Todo

- [x] Motion classes added; re-fire on tab switch verified
- [x] Reduced-motion verified zero-animation
- [x] Focus-ring audit complete (keyboard walk)
- [x] Responsive matrix 6 widths recorded, no horizontal scroll
- [x] Screenshot diff vs export at 1280px + 375px; deltas fixed
- [x] Cleanup grep clean; no unused imports
- [x] Auth regression pass (sign in / sign up / Google / guard; `/login?returnUrl=` round-trip)
- [x] Typed values still survive tab switches after motion changes (Phase 2 criterion re-verified)
- [x] `pnpm check` + `pnpm check-types` + `pnpm test` green; plan statuses updated

## Success Criteria

- [x] Motion: rise-in plays once on load; crossfade plays on every tab switch; thumb slides; spinner spins during real submits — and ALL of it is off with Reduce Motion enabled. (DevTools animations panel + OS toggle.)
- [x] Keyboard walk: every interactive element reachable and visibly ringed; tab order sane (tabs → active panel → switch line); no focus trap between the two mounted forms (hidden panel's controls are not tabbable — the `hidden` attribute removes them from tab order).
- [x] Responsive matrix: zero horizontal scroll at all 6 widths; ≤960 shows centered brand block + mobile-brand + top-aligned auth; ≤420 shows 24px title and tighter padding per export.
- [x] Screenshot diff vs `auth-redesign.html`: no unexplained visible deltas at 1280px and 375px (font loading differences acceptable; layout/color/spacing must match).
- [x] Auth regression: sign-in, sign-up, Google initiation all pass; `/dashboard` guard redirects signed-out users to `/login` with the new page rendering the persisted tab; sign-in from `/login?returnUrl=/classes` lands on `/classes` (returnUrl round-trip intact).
- [x] `pnpm check`, `pnpm check-types`, and `pnpm test` green; `git status` shows changes only in `apps/web/src`; no new dependencies in any `package.json`.

## Risk Assessment

| Risk | L×I | Mitigation | Observable signal |
|------|-----|------------|-------------------|
| Crossfade doesn't re-fire on unhide (animation ran once while `hidden`) | M×M | Verify with DevTools animations panel; if it doesn't re-fire, re-trigger the animation class from a state counter in `login.tsx` — remounting (`key={mode}`) is FORBIDDEN (wipes typed values). | Animation entry appears in DevTools on every tab click. |
| Hidden panel still tabbable (focus escapes into invisible form) | L×H | `hidden` attribute on the inactive `<form>` removes it from a11y tree + tab order (export relies on same rule, `auth-redesign.html:468`); keyboard walk proves it. | Tab key never lands on a control of the inactive mode; axe scan clean. |
| Reduced-motion leaks one animation (e.g. spinner or thumb) | M×M | Enumerate every animated node in step 4; `motion-reduce:animate-none`/`motion-reduce:transition-none` per node — no global CSS override needed since motion is per-utility. | OS Reduce Motion: page fully static during load, tab switch, submit. |
| Screenshot-diff rabbit hole (chasing sub-pixel font rendering) | M×L | Only fix deltas visible at 100% zoom side-by-side; accept SF-Pro-availability differences (both export and app fall back to the same stack from `globals.css` tokens). | Logged delta list with fix/no-fix decision each. |
| Matrix regression in Phase 1/2 code discovered late (e.g. 360px overflow from long switch line) | L×M | Matrix is run in this phase precisely to catch it; fixes are class-level (wrap, padding) with gates re-run. | All 6 widths scroll-clean after fix; `pnpm check` still green. |
