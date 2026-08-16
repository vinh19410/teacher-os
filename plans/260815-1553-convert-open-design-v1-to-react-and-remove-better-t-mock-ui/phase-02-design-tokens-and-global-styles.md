---
phase: 2
title: "Design tokens and global styles"
status: completed
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Design tokens and global styles

## Overview
Freeze every token from `open-design/v1/teacher-os.html` `:root` (lines 8–32) into the Tailwind v4 theme and global CSS, per the handoff's "extract tokens before writing components" rule.

## Requirements
- Functional: all export tokens available as Tailwind utilities (`bg-surface`, `text-meta`, `border-border-soft`, `rounded-lg` = 18px, `font-display`, `text-xs` = 12px …) and CSS vars.
- Functional: a custom **920px breakpoint token** (`--breakpoint-app` or similar) because the export's mobile switch is exactly `max-width:920px` and Tailwind v4 stock breakpoints jump 768→1024 — stock `md:`/`lg:` would fire the drawer ~100px off the export contract.
- Functional: shadcn radius scale overridden **per size** (`--radius-sm: 8px; --radius-md: 12px; --radius-lg: 18px`), NOT derived from a single base — shadcn's `calc(var(--radius) ∓ N)` chain is linear and would produce 14/16/18 from an 18px base.
- Non-functional: no component may hardcode a color hex — values come from `@theme` or the `:root` custom properties.
- Non-functional: login screens restyle onto the export palette (accepted end state — one app-wide system); delete the `.dark` block so no dark variant survives Phase 1's ThemeProvider removal.

## Architecture
Edit `packages/ui/src/styles/globals.css` (the single shared stylesheet imported by `apps/web/src/index.css`). Two layers:
1. `:root` custom properties copied 1:1 from the export (`--bg`, `--surface`, `--fg`, `--accent-soft` color-mixes, `--focus-ring`, `--motion-*`, `--ease-standard`, spacing, type scale) — keep original names so ported CSS maps directly.
2. `@theme inline` additions mapping export vars to Tailwind color/typography utilities, plus aliasing existing shadcn vars (`--color-primary: var(--accent)`, `--color-background: var(--bg)`, `--radius: 18px` etc.) so `@teacher-os/ui` primitives inherit the design automatically.

**Token collision (red-team, mandatory):** the export's `--muted` (#6e6e73, a *text* gray) and `--accent` (#0071e3, saturated blue) collide with shadcn's semantics of the same names (`--muted` = background gray, `--accent` = subtle hover surface). Transcribing verbatim while aliasing naively makes `hover:bg-muted` render dark-gray-on-dark and `focus:bg-accent focus:text-accent-foreground` render near-black on saturated blue in every kept auth primitive (dropdown-menu items, outline buttons). Resolution: keep export vars verbatim, but write the shadcn semantic pairs as **explicit re-maps**, not passthroughs:
- `--muted: var(--surface)` (background gray role) and `--muted-foreground: var(--muted-export-text)` — name the export text gray `--muted-fg` in `:root` alongside the verbatim block if needed to avoid the self-alias `--color-muted-foreground: var(--muted)`.
- `--accent: var(--accent-soft)` (hover surface role), `--accent-foreground: var(--fg)`.
- **Complete alias enumeration:** enumerate EVERY var consumed by `packages/ui/src/components/*` (grep `--popover-foreground|--secondary|--secondary-foreground|--input|--accent-foreground|--primary-foreground|--card-foreground|--destructive|--ring|--chart-*|--sidebar-*`) and alias each one explicitly — do not stop at the 7-var starter list. Target: `pnpm --filter @teacher-os/ui build` + a rendered `/login` with zero unchanged-shadcn-palette surfaces.

<!-- Updated: Red Team - complete shadcn alias enumeration + collision resolution -->

Fonts: keep SF Pro stacks with fallbacks (`"SF Pro Display", -apple-system, "Helvetica Neue", …`). No webfont download — system stack matches macOS/iOS rendering of the export.

## Related Code Files
- Modify: `packages/ui/src/styles/globals.css` — replace default oklch shadcn palette with export tokens + aliases; add `@theme inline` mappings (colors, text sizes `--text-xs`…`--text-4xl`, fonts `--font-display/body/mono`, radius scale `--radius-sm/md/lg/full`).
- Modify: `apps/web/src/index.css` — no change needed beyond existing import (verify).
- No component files in this phase.

## Implementation Steps
1. Read export lines 8–32; transcribe every declaration verbatim into `:root` in `globals.css` (keep `color-mix()` expressions as-is; browsers ≥2024 support them).
2. In `@theme inline`, add color mappings: `--color-bg/--color-surface/--color-surface-warm/--color-fg/--color-fg-2/--color-meta/--color-border-soft/--color-accent/--color-accent-hover/--color-accent-active/--color-success/--color-warn/--color-danger` (+ `-soft` variants via `color-mix`).
3. Alias shadcn tokens per the collision-resolution rules in Architecture: `--color-background: var(--bg)`, `--color-foreground: var(--fg)`, `--color-card: var(--bg)`, `--color-primary: var(--accent)`, `--color-muted-foreground: var(--muted-fg)`, `--color-muted: var(--surface)`, `--color-destructive: var(--danger)`, `--color-ring: var(--accent)`, plus EVERY remaining var from the enumeration grep. Override radius per size in `@theme`: `--radius-sm: 8px; --radius-md: 12px; --radius-lg: 18px; --radius-xl: 18px; --radius-2xl: 980px` (pill) — individual overrides, not a single base. Delete the `.dark` block entirely.
4. Add the 920px breakpoint: `--breakpoint-app: 921px` in `@theme`. **Semantics (red-team):** the export's media query is `max-width:920px` — i.e. 920px itself IS mobile. With a 921px token, `app:` fires at ≥921px and `max-app:` covers ≤920px, matching the export exactly; a naive 920px token would leave the boundary pixel wrong on both sides. All shell/layout code from Phase 4 onward uses `app:`/`max-app:` variants, never stock `md:`/`lg:` for drawer behavior.
5. Add typography: `--font-display`, `--font-body`, `--font-mono` in `@theme inline` + map `--font-sans: var(--font-body)`; override `--text-*` sizes (12/14/17/21/28/40/56/80) and keep `--text-base: 17px` with `--leading-body: 1.47`.
6. Add motion vars (`--motion-fast: 150ms`, `--motion-base: 220ms`, `--ease-standard: cubic-bezier(0.28,0,0.22,1)`) and a `focus-visible` global rule using `--focus-ring`.
7. **Exit gate (red-team):** screenshot `/login` AND open the user-menu dropdown — check outline-button hover (`hover:bg-muted`) renders light surface, dropdown item focus (`focus:bg-accent`) renders accent-soft with fg text, error text renders `text-destructive`, not red-500/indigo-600 leftovers. Any unchanged shadcn surface = alias enumeration incomplete; fix before Phase 3.

## Success Criteria
- [x] Every token in the plan.md extraction table exists in `globals.css` and is usable as a Tailwind utility
- [x] `--breakpoint-app: 921px` defined; verified `app:` fires at ≥921px and `max-app:` covers ≤920px (export's inclusive boundary) at 919/920/921
- [x] Radius scale renders 8/12/18/pill correctly on **app kit components** (app `Button` = pill like export). Scope note (red-team): `packages/ui` primitives hardcode `rounded-none` — auth screens keep square corners; that is outside the export contract (the export has no login screen) and is accepted, not a regression. The "shadcn primitives inherit radius" claim is dropped.
- [x] No `.dark` block, no `.dark` variant classes survive; login renders on export palette
- [x] Shadcn primitives used by auth screens (`Button`, `Input`, `DropdownMenu`) render readable export-palette surfaces — verified via the step-7 exit gate (login + user-menu dropdown focus/hover states), not assumed
- [x] No hex literal appears in any later component file (grep gate in Phase 8)

## Risk Assessment
- **Risk: breaking `@teacher-os/ui` consumers other than web** — the ui package is only consumed by `apps/web` (verified via workspace grep), so palette replacement is safe. Signal if wrong: server or future apps import ui styles — response: scope token overrides to `apps/web/src/index.css` instead.
- **Risk: `color-mix(in oklab, …)` unsupported in older Safari** — acceptable (2025–2026 matrix targets modern evergreen browsers); fallback: precompute soft colors as hex.
- **Risk: incomplete shadcn alias map (red-team)** — the enumeration grep misses a var consumed only under a rare state class. Signal: any surface on `/login` or the user-menu still rendering stock gray/indigo — response: extend the alias map, re-run the exit gate.

<!-- Updated: Red Team - collision resolution, 921px semantics, radius scoping, exit gate -->
