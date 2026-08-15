---
phase: 8
title: "Responsive verification and release"
status: pending
priority: P1
effort: "4h"
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
Verification-driven phase; no new features. Fixes land in whichever screen file fails. Tooling reality: the repo has **no Playwright/screenshot tooling installed** — budget 1–2h for a throwaway capture script (`npx playwright screenshot` per viewport, no test-suite setup) or run the matrix manually in DevTools device mode; either is acceptable, decide at phase start. Dev server: `pnpm run dev:web` (port 3001); export reference opened directly from `open-design/v1/teacher-os.html`.

## Related Code Files
- Possibly modify: any `apps/web/src/routes/_auth/**` or `components/**` file that fails a checkpoint
- Read: `open-design/v1/DESIGN-HANDOFF.md` (viewport matrix), `DESIGN-MANIFEST.json` (`responsiveViewports`, `implementationChecklist`)

## Implementation Steps
1. Start `pnpm run dev:web`; screenshot export HTML and live app at each of the 9 viewports for the primary screens (dashboard, students, schedule, tuition, assignments, classes, syllabus detail, reports, settings).
2. Automated overflow check per viewport × route: evaluate `scrollWidth > clientWidth` on document and `.content`; log failures.
3. Fix layout deltas in priority order: horizontal overflow > layout structure > spacing/typography polish > micro-interactions.
4. Interaction regression sweep: every Phase 5/6 success-criteria action repeated once at 390px (mobile) in addition to desktop.
5. Quality gates: `pnpm run check` (Biome), `pnpm run check-types`, `pnpm run build`; confirm zero errors and reasonable bundle sizes.
6. Keyboard/focus sweep alongside grep gates: tab through sidebar → content on 2 screens, open 2 modals (Esc + trap + focus-return), verify focus rings on chips/tabs/nav items.
7. Grep gates: no hex literals in `apps/web/src/**` component files (tokens only), no `data-od-id`, no console.log leftovers.
8. Route sanity: browser back works from every detail screen; hard reload on each `$id` route renders the same view.
9. Hand off: commit work on a feature branch, open PR per repo conventions (user will drive ship stage).

## Success Criteria
- [ ] Screenshot comparison export vs app: primary screens pixel-close at 1440×900 and 390×844
- [ ] 0 horizontal-scroll failures across 9 viewports × 13 routes
- [ ] All interaction flows from Phases 5–6 pass on mobile 390px
- [ ] Keyboard/focus sweep passes; browser back works from every detail screen; reload on `$id` routes renders same view
- [ ] Biome, type-check, build all green
- [ ] Grep gates clean (no hardcoded hex in components, no design-process annotations)
- [ ] Branch pushed with PR opened

## Risk Assessment
- **Risk: screenshot comparison perfectionism stalls release.** Budget: fix structural and overflow issues; accept ≤5px spacing deltas on non-primary screens. Signal: spending >1h on one screen's polish — response: log as follow-up issue, move on.
- **Risk: table overflow on 360px** (7-column invoice table). Export relies on the page not scrolling because its tables are within the container; if React version overflows, response: `overflow-x:auto` on table wrapper (contained scroll, page intact) — matches handoff's no-horizontal-scroll requirement at page level.
- **Risk: PWA dev-mode caching hides fixes** — hard-reload / disable SW in dev.
