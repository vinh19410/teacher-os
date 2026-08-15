---
phase: 2
title: "Design tokens and global styles"
status: pending
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

Fonts: keep SF Pro stacks with fallbacks (`"SF Pro Display", -apple-system, "Helvetica Neue", …`). No webfont download — system stack matches macOS/iOS rendering of the export.

## Related Code Files
- Modify: `packages/ui/src/styles/globals.css` — replace default oklch shadcn palette with export tokens + aliases; add `@theme inline` mappings (colors, text sizes `--text-xs`…`--text-4xl`, fonts `--font-display/body/mono`, radius scale `--radius-sm/md/lg/full`).
- Modify: `apps/web/src/index.css` — no change needed beyond existing import (verify).
- No component files in this phase.

## Implementation Steps
1. Read export lines 8–32; transcribe every declaration verbatim into `:root` in `globals.css` (keep `color-mix()` expressions as-is; browsers ≥2024 support them).
2. In `@theme inline`, add color mappings: `--color-bg/--color-surface/--color-surface-warm/--color-fg/--color-fg-2/--color-meta/--color-border-soft/--color-accent/--color-accent-hover/--color-accent-active/--color-success/--color-warn/--color-danger` (+ `-soft` variants via `color-mix`).
3. Alias shadcn tokens: `--color-background: var(--bg)`, `--color-foreground: var(--fg)`, `--color-card: var(--bg)`, `--color-primary: var(--accent)`, `--color-muted-foreground: var(--muted)`, `--color-destructive: var(--danger)`, `--color-ring: var(--accent)`. Override radius per size in `@theme`: `--radius-sm: 8px; --radius-md: 12px; --radius-lg: 18px; --radius-xl: 18px; --radius-2xl: 980px` (pill) — individual overrides, not a single base. Delete the `.dark` block entirely.
4. Add the 920px breakpoint: `--breakpoint-app: 920px` in `@theme` so `app:` / `max-app:` variants match the export media query exactly. All shell/layout code from Phase 4 onward uses this, never stock `md:`/`lg:` for drawer behavior.
4. Add typography: `--font-display`, `--font-body`, `--font-mono` in `@theme inline` + map `--font-sans: var(--font-body)`; override `--text-*` sizes (12/14/17/21/28/40/56/80) and keep `--text-base: 17px` with `--leading-body: 1.47`.
5. Add motion vars (`--motion-fast: 150ms`, `--motion-base: 220ms`, `--ease-standard: cubic-bezier(0.28,0,0.22,1)`) and a `focus-visible` global rule using `--focus-ring`.
6. Verify login page still renders correctly (light theme, blue accent buttons) — screenshot comparison.

## Success Criteria
- [ ] Every token in the plan.md extraction table exists in `globals.css` and is usable as a Tailwind utility
- [ ] `--breakpoint-app: 920px` defined; verified `app:` variant matches `@media (min-width:920px)` behavior at the 919/920/921 boundary
- [ ] Radius scale renders 8/12/18/pill correctly on kit components (button = pill like export, not shadcn default `rounded-md`)
- [ ] No `.dark` block, no `.dark` variant classes survive; login renders on export palette
- [ ] Shadcn primitives (`Button`, `Input`, `DropdownMenu`) render in export colors without per-component overrides
- [ ] No hex literal appears in any later component file (grep gate in Phase 8)

## Risk Assessment
- **Risk: breaking `@teacher-os/ui` consumers other than web** — the ui package is only consumed by `apps/web` (verified via workspace grep), so palette replacement is safe. Signal if wrong: server or future apps import ui styles — response: scope token overrides to `apps/web/src/index.css` instead.
- **Risk: `color-mix(in oklab, …)` unsupported in older Safari** — acceptable (2025–2026 matrix targets modern evergreen browsers); fallback: precompute soft colors as hex.
