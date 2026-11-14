---
title: Apply Co My Lessons Design System across apps/profile
date: 2026-11-14
summary: Applied Co My Lessons (CoMyLessons) tokens, DM Sans + Be Vietnam Pro typography, Lucide SVGs, flat-vector mascots, and light-ground single-dark-block budget across /, /kiem-tra-dau-vao/, and /noi-bo/ (#709)
---

# Apply Cô Mỹ Lessons Design System across `apps/profile` (#709)

## What happened
- Extracted design tokens, typography (`DM Sans` + `Be Vietnam Pro`), `PageFooter`, `SpeakUp`, `LessonPlan`, `UnitHero`, and 4 flat-vector mascot PNG illustrations (`mascot-checklist.png`, `mascot-chunks.png`, `mascot-give-opinion.png`, `mascot-listening.png`) from the user-supplied `CoMyLessons` artifact into `apps/profile`.
- Applied the tokens, light editorial framing, zero decorative `box-shadow` rule (ring only on `:focus-visible`), `.ml-unit-badge` (`CÔ MỸ`), inline Lucide SVGs (`class="ml-icon"`, `.ml-contact-disc`), and single `--ink` (`#1b2a3a`) block budget uniformly across all 3 public/internal surfaces:
  - `/` (`apps/profile/public/index.html`) — preserving the 8-section landing flow, `#studentPortalLink`, lead form, and `#706` lightbox modal fixes.
  - `/kiem-tra-dau-vao/` (`index.html`, `test.css`, `test.js`) — preserving all 5 steps, lead-gate contract, audio play limits, CEFR explorer, and adding `[data-part="vocabulary"]` / `[data-part="listening"]` accents plus DOM-safe `createElementNS` SVG helpers.
  - `/noi-bo/` (`apps/profile/public/noi-bo/index.html`) — preserving `noindex,nofollow`, `../` return link, clipboard script, and exact `<pre id="s0|s1|s2">` copy scripts verbatim.

## Verification highlights
- `apps/profile/tests/index.test.mjs` verified RED first, then 34/34 GREEN after implementation.
- Repo gates passed after implementation edits (`pnpm exec biome check .`, `pnpm check-types`, `pnpm test`).
- Targeted Playwright E2E (`specs/profile-lightbox.spec.ts`, `specs/profile-lead-intake.spec.ts`, `specs/profile-placement-test.spec.ts`) passed all 10 scenarios across desktop, tablet, and mobile viewports (`375x812`, `428x926`, `768x1024`, `1440x900`).
- Playwright overflow check confirmed `scrollWidth === clientWidth` across `/`, `/kiem-tra-dau-vao/`, and `/noi-bo/` at `320x568`, `375x812`, `768x1024`, and `1440x900`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
