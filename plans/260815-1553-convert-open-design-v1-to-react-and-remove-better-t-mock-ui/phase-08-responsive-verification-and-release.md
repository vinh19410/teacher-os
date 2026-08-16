---
phase: 8
title: "Responsive verification and release"
status: completed
priority: P1
effort: "6h"
dependencies: [7]
---

# Phase 8: Responsive verification and release

## Overview
Verify the converted app against the export across the full 2025–2026 viewport matrix from DESIGN-HANDOFF, run quality gates, and prep the branch for PR.

## Requirements
- Functional: all 9 handoff viewports verified per screen: 360×800, 390×844, 430×932, 600×960, 820×1180, 1024×768, 1366×768, 1440×900, 1920×1080.
- Functional: zero horizontal scroll (`document.scrollingElement.scrollWidth <= innerWidth`) at every viewport; export's 920px sidebar breakpoint holds; tables degrade (export keeps tables but they're narrow — verify wrap behavior matches export, which allows table squeeze not page scroll).
- Non-functional: keyboard navigation spot-check (tab through sidebar, modal focus, Esc close); focus rings visible on all interactive elements.
- Non-functional: performance sanity — devtools route splitting active (autoCodeSplitting already on), no console errors on any route.

## Architecture
Verification-driven phase; no new features. Fixes land in whichever screen file fails. **Tooling (red-team, decided in Phase 4):** the capture harness (authenticated context) built in Phase 4 owns screenshot capture — either the Playwright script or the manual DevTools-device-mode checklist. Dev server: `dev:server` + `dev:web` both running (auth API must be live or every capture lands on `/login`); export reference opened directly from `open-design/v1/teacher-os.html`. **Matrix reduction (red-team):** screenshot pairs at 4 representative viewports (360, 390, 919/920-boundary, 1440) plus one 1920 spot-check on dashboard/schedule; the full 9×13 grid gets the cheap automated overflow assertion only; mobile interaction sweeps already ran in Phases 5/6.

## Related Code Files
- Possibly modify: any `apps/web/src/routes/_auth/**` or `components/**` file that fails a checkpoint
- Read: `open-design/v1/DESIGN-HANDOFF.md` (viewport matrix), `DESIGN-MANIFEST.json` (`responsiveViewports`, `implementationChecklist`)

## Implementation Steps
1. Using the Phase 4 capture harness (authenticated), screenshot export HTML and live app at the 4 representative viewports + 1920 spot-check for the primary screens (dashboard, students, schedule, tuition, assignments, classes, syllabus detail, reports, settings). Numeric threshold: no element offset >8px vs export; identical fonts/colors/radii — applied uniformly to ALL screens (the ≤5px non-primary carve-out is dropped).
2. Automated overflow check per viewport × route across the full 9×13 grid: evaluate `scrollWidth > clientWidth` on document and `.content`; log failures.
3. Fix layout deltas in priority order: horizontal overflow > layout structure > spacing/typography polish > micro-interactions.
4. Interaction regression sweep: confirm the Phases 5/6 inline mobile sweeps (390px) were recorded; spot-retest 3 flows on mobile (check-in, add student, grade).
5. Quality gates: `pnpm run check` (Biome), `pnpm run check-types`, `pnpm run build`; confirm zero errors and reasonable bundle sizes.
6. Keyboard/focus sweep alongside grep gates: tab through sidebar → content on 2 screens, open 2 modals (Esc + trap + focus-return), verify focus rings on chips/tabs/nav items.
7. Grep gates: no hex literals in `apps/web/src/**` component files (tokens only), no `data-od-id`, no console.log leftovers.
8. Route sanity: browser back works from every detail screen; hard reload on each `$id` route renders the same view **for seed entities**; for runtime-created entities reload renders the not-found card (not a crash) — one created id per entity type tested.
9. Hand off: commit work on a feature branch, open PR per repo conventions (user will drive ship stage).

## Success Criteria
- [x] Screenshot comparison export vs app at 4 viewports + 1920 spot-check: threshold ≤8px offsets, identical fonts/colors/radii — primary screens pass
- [x] 0 horizontal-scroll failures across 9 viewports × 13 routes (automated assertion)
- [x] Interaction flows pass on mobile 390px (spot-retest of the inline sweeps)
- [x] Keyboard/focus sweep passes; browser back works from every detail screen; reload on `$id` routes: seed ids render same view, created ids render not-found
- [x] Biome, type-check, build all green
- [x] Grep gates clean (no hardcoded hex in components, no design-process annotations)
- [x] Branch pushed with PR opened

## Risk Assessment
- **Risk: screenshot comparison perfectionism stalls release.** Budget: fix structural and overflow issues; accept ≤5px spacing deltas on non-primary screens. Signal: spending >1h on one screen's polish — response: log as follow-up issue, move on.
- **Risk: table overflow on 360px** (7-column invoice table). Export relies on the page not scrolling because its tables are within the container; if React version overflows, response: `overflow-x:auto` on table wrapper (contained scroll, page intact) — matches handoff's no-horizontal-scroll requirement at page level.
- **Risk: PWA dev-mode caching hides fixes** — hard-reload / disable SW in dev.

<!-- Updated: Red Team - harness from Phase 4, 4-viewport screenshots + full-grid overflow assertion, reload criterion amended, 6h budget -->
