---
title: Apply Co My Lessons Color Palette on Original apps/profile Layout
date: 2026-11-14
summary: Reverted layout, Cormorant Garamond + Plus Jakarta Sans fonts, header monogram M, footer, emoji/icons, shadows, and test.js to pre-#711 baseline while applying 100% Co My Lessons color palette tokens across /, /kiem-tra-dau-vao/, and /noi-bo/ (#709)
---

# Apply Cô Mỹ Lessons Color Palette on Original `apps/profile` Layout (#709)

## What happened
- After user feedback narrowing #709 to color-only application of the **Cô Mỹ Lessons (`CoMyLessons`)** system, restored the pre-#711 (`5ab00125`) layout, typography (`Cormorant Garamond` + `Plus Jakarta Sans`), `.brand-monogram` / `.brand-badge` `"M"`, `.site-footer`, inline emoji/icons, shadows, and `kiem-tra-dau-vao/test.js`, and removed `apps/profile/public/assets/mascots/*.png`.
- Replaced all legacy forest-green/parchment/gold colors across all 3 surfaces (`/`, `/kiem-tra-dau-vao/`, `/noi-bo/`) and `<meta name="theme-color" content="#0d7c6b">` + inline SVG favicon with the exact 21 `CoMyLessons` color tokens (`19` hex values + `5` RGB triplets), preserving WCAG AA/AAA contrast by pairing dark surface blocks (`.hero-frame`, `.track-card.featured-track`, `.step-card.highlight-step`, `.brand-monogram`, `.result-hero`, `.site-footer`, `.modal-header`) with `--ink` (`#1b2a3a`) / `--ink-raised` (`#2a3a48`) for `--amber` (`#f5a73b`) text, `--ink` (`#1b2a3a`) for links/badges on `--slate` (`#e9ebf1`), and `--blue` (`#205fae`) / `--amber` (`#f5a73b`) `:focus-visible` outlines.

## Verification highlights
- `apps/profile/tests/index.test.mjs` verified RED first, then 35/35 GREEN (including zero non-system hex/rgb checks across all 3 surfaces, original chrome/font checks, and #710 PDF checks).
- Repo gates passed after final edits (`pnpm exec biome check .`, `pnpm check-types`, `pnpm --filter profile test`, `pnpm --filter profile build`).
- Targeted Playwright E2E (`specs/profile-lightbox.spec.ts`, `specs/profile-lead-intake.spec.ts`, `specs/profile-placement-test.spec.ts`) passed all scenarios across desktop, tablet, and mobile viewports.
- Playwright overflow check confirmed `scrollWidth === clientWidth` across `/`, `/kiem-tra-dau-vao/` (Step 1 & Step 2), and `/noi-bo/` at `320x568`, `375x812`, `768x1024`, and `1440x900`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
