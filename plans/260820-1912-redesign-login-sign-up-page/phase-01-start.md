---
phase: 1
title: "Auth shell and brand panel"
status: completed
priority: P1
effort: "0.5d"
dependencies: []
---

# Phase 1: Auth shell and brand panel

## Overview

Land the static two-panel shell on `/login`: CSS grid (`minmax(460px,1.12fr) minmax(420px,1fr)`, min-height 100svh — `auth-redesign.html:71-75`), the dark brand panel (logo, kicker, headline, sub copy, static product mock card, footer), and the auth panel skeleton (centered `auth-wrap`, max-width 420px, mobile-brand row). Zero behavior change: the existing `SignInForm`/`SignUpForm` keep rendering inside the new auth wrap, so both auth flows stay live while the shell lands.

## Requirements

Functional:
- `/login` renders `BrandPanel` (left) + auth panel (right) per export markup `auth-redesign.html:513-570`.
- Brand panel copy verbatim, English: kicker "Teacher-first workspace"; headline "Your whole teaching day, in one calm workspace."; sub "Classes, students, syllabi, lessons, invoices and reports — organized around the classes you teach."; footer "© 2026 Teacher OS" (`auth-redesign.html:527-569`).
- Static mock card verbatim (`auth-redesign.html:532-566`): head "Today" / "Thu, Aug 20 · 3 classes"; rows 09:00 "Speaking Club · Group A"/"Room 204"/chip Now, 10:30 "Mathematics 10 · Section B"/"Room 112"/chip Next, 14:00 "Physics Lab · Group C"/"Lab 3"/chip Done; foot "Syllabus · Midterm review" + 120px progress bar 78%.
- Inline logo SVG 34px (accent rounded square + white stroke path, `auth-redesign.html:516-520`) in brand head; 30px variant in the mobile-brand row inside auth wrap (`auth-redesign.html:576-583`).
- Existing sign-in/sign-up forms still render and submit inside `auth-wrap` (intermediate visual state is acceptable; forms get restyled in Phase 2).

Non-functional:
- Responsive collapse at ≤960px per `auth-redesign.html:476-499`: single column; brand panel centers; `brand-head`, `brand-sub`, `mock`, `brand-foot` get `max-[960px]:hidden`; `mobile-brand` becomes visible; auth panel top-aligned (`max-[960px]:items-start`). ≤420px: auth padding `px-4 pt-6 pb-10` (`auth-redesign.html:500-503`). NOTE: 960px is the auth export's own boundary and deliberately diverges from the app-wide `--breakpoint-app: 921px` (`packages/ui/src/styles/globals.css:219`) — use `max-[960px]:` arbitrary variants here and do NOT touch the token.
- Brand panel must NOT engage the app's `.dark` variant (custom variant at `packages/ui/src/styles/globals.css:7`, engages only under an ancestor `.dark` — nothing in `apps/web/src` toggles it, verified by grep). Enforce via explicit arbitrary utilities `bg-[var(--fg)]` / `text-[var(--bg)]`, never scheme-mapped utilities.
- PRESERVE `validateSearch` + `Route` config in `login.tsx` (`apps/web/src/routes/login.tsx:7-17`) verbatim in every rewrite: three `useSearch({ from: "/login" })` consumers (sign-in/sign-up forms, Google button) and the contract test `apps/web/src/lib/kernel-runtime.contract.test.ts` depend on it.
- No new tokens, no `packages/ui` edits, no new dependencies.

## Architecture

Component tree after this phase:

```
/login (login.tsx — shell owner)
├── BrandPanel (components/auth/brand-panel.tsx, static, no props)
│   ├── brand-head: logo SVG 34px + "Teacher OS"
│   ├── brand-mid: copy block + MockCard (all static markup, single file)
│   └── brand-foot: "© 2026 Teacher OS"
└── auth panel (inline in login.tsx)
    └── auth-wrap (max-w-[420px])
        ├── mobile-brand row (hidden >960px; visible branding — NO aria-hidden, it is meaningful visible content)
        └── existing SignInForm | SignUpForm (unchanged this phase)
```

Data flow: none new — `BrandPanel` is pure static JSX; login.tsx keeps its existing `showSignIn` state (`apps/web/src/routes/login.tsx:20`) and its `validateSearch` route config untouched this phase.

## Related Code Files

- Create: `apps/web/src/components/auth/brand-panel.tsx` — static brand panel + mock card.
- Modify: `apps/web/src/routes/login.tsx` — wrap existing forms in the shell grid + auth panel; keep the `showSignIn` toggle as-is.
- Reference only: `apps/web/src/components/sign-in-form.tsx`, `sign-up-form.tsx`, `google-oauth-button.tsx` (untouched this phase).

## Implementation Steps

1. Create `apps/web/src/components/auth/brand-panel.tsx`. Root: `relative flex flex-col overflow-hidden bg-[var(--fg)] text-[var(--bg)] px-[clamp(28px,4.5vw,64px)] py-[clamp(32px,4vw,56px)] max-[960px]:items-center max-[960px]:gap-6 max-[960px]:px-6 max-[960px]:py-8 max-[960px]:pb-9 max-[960px]:text-center` (from `auth-redesign.html:78-86,477-483`).
2. Brand head: logo SVG (copy the 34px inline SVG verbatim from `auth-redesign.html:516-520`, `aria-hidden`) + `<span>` "Teacher OS" with `font-display text-[17px] font-semibold tracking-[-0.01em]` (`auth-redesign.html:90-96`). Class `max-[960px]:hidden`.
3. Brand mid: `flex flex-1 flex-col justify-center gap-[clamp(28px,4vh,48px)] py-[clamp(32px,6vh,72px)] max-[960px]:gap-[14px] max-[960px]:py-0`. Copy block: kicker `text-xs font-[590] uppercase tracking-[0.09em] text-[color-mix(in_oklab,var(--bg),transparent_42%)] mb-[14px]`; headline `font-display text-[clamp(30px,3.1vw,46px)] font-[620] leading-[1.1] tracking-[-0.015em] max-w-[15ch] max-[960px]:text-[clamp(24px,6vw,30px)] max-[960px]:max-w-[18ch]`; sub `mt-4 text-[17px] leading-[1.55] text-[color-mix(in_oklab,var(--bg),transparent_36%)] max-w-[46ch] max-[960px]:hidden` (`auth-redesign.html:105-129,484-486`).
4. Mock card (same file, static JSX per `auth-redesign.html:532-566`): root `w-[min(460px,100%)] bg-[var(--bg)] text-[var(--fg)] rounded-[var(--radius-lg)] shadow-[var(--elev-raised)] px-[22px] pt-[22px] pb-[18px] max-[960px]:hidden`. Rows: `grid grid-cols-[52px_1fr_auto] items-center gap-[14px] border-b border-line-soft py-[13px] last:border-b-0`; time `font-mono text-[13px] text-muted-fg`; chips `rounded-[var(--radius-pill)] px-[10px] py-[3px] text-[11px] font-[590] uppercase tracking-[0.06em]` — Now `bg-accent-blue text-accent-on`, Next `bg-surface text-fg-2 shadow-[inset_0_0_0_1px_var(--border)]`, Done `text-meta` (`auth-redesign.html:171-182`). Foot: label `text-xs text-muted-fg flex-1`; bar `h-[6px] w-[120px] rounded-[var(--radius-pill)] bg-surface` with inner `w-[78%] rounded-[var(--radius-pill)] bg-accent-blue`; number `font-mono text-xs text-fg-2`.
5. Footer: `text-xs text-[color-mix(in_oklab,var(--bg),transparent_55%)] max-[960px]:hidden`.
6. Rewrite `apps/web/src/routes/login.tsx` as the shell: KEEP the `Route` config + `validateSearch` block (`login.tsx:7-17`) byte-for-byte. Root `<main className="grid min-h-[100svh] grid-cols-[minmax(460px,1.12fr)_minmax(420px,1fr)] max-[960px]:grid-cols-1">`; right `<section className="flex items-center justify-center px-[clamp(20px,3vw,48px)] py-[clamp(28px,4vh,56px)] max-[960px]:items-start">` wrapping a `w-full max-w-[420px]` div (`auth-redesign.html:201-216`) that contains the mobile-brand row (30px logo + "Teacher OS" in `text-[var(--fg)]`, `hidden max-[960px]:flex items-center justify-center gap-[10px] mb-[26px]` — no `aria-hidden`: on mobile this is the only visible branding) and the existing `showSignIn ? <SignInForm/> : <SignUpForm/>` toggle — logic untouched.
7. Run `pnpm check`, `pnpm check-types`, and dev-server visual check at 1280px and 960px/420px widths.

Note on arbitrary values: spaces inside `var()`/`color-mix()` must be underscores (e.g. `color-mix(in_oklab,var(--bg),transparent_42%)`); `clamp()` likewise. Repo precedent for this utility style: `apps/web/src/components/ui/chip-filter.tsx:24-28`, `badge.tsx:30`, `page-head.tsx:6`.

## Todo

- [x] `apps/web/src/components/auth/brand-panel.tsx` created (static, export-only)
- [x] `login.tsx` renders shell grid + brand panel + auth wrap around existing forms
- [x] ≤960px collapse + ≤420px tightening verified in browser
- [x] Existing sign-in/sign-up flows re-tested manually on dev server
- [x] `pnpm check` + `pnpm check-types` green

## Success Criteria

- [x] At 1280px, brand panel computed background is exactly `#1d1d1f` and text `#ffffff`; mock card shadow matches `--elev-raised`. (DevTools computed styles; screenshot vs export side-by-side.)
- [x] At 960px and below: single column, mock/sub/head/foot absent from layout, mobile-brand visible, auth panel top-aligned. (Browser responsive mode.)
- [x] No horizontal scrollbar at 360–1920px with the shell only.
- [x] Sign-in and sign-up still submit and navigate to the validated returnUrl exactly as before (no props/logic change to the two form components).
- [x] `pnpm check` and `pnpm check-types` green; no `packages/ui` file modified (`git status` shows only the two web files).

## Risk Assessment

| Risk | L×I | Mitigation | Observable signal |
|------|-----|------------|-------------------|
| `.dark` variant leaks into brand panel (wrong tokens under `.dark` ancestor) | L×H | Use only explicit `bg-[var(--fg)]`/`text-[var(--bg)]` arbitrary utilities; never `bg-background`/scheme-mapped utilities. App never adds `.dark` (grep verified), but don't rely on that. | DevTools: add class `dark` to `<html>` → brand panel colors unchanged (still #1d1d1f/#ffffff). |
| Tailwind v4 arbitrary-value typos silently no-op (e.g. spaces in `color-mix()`, wrong underscore) | M×M | Copy exact underscore-form patterns from this doc; spot-check computed styles in DevTools for each clamp/color-mix (headline size, kicker color, focus later). | Computed style resolves to the token value; no `class` present-but-unstyled elements in visual diff. |
| Existing forms visually break inside new wrap (old `mx-auto mt-10 max-w-md p-6` wrapper) | H×L | Accepted intermediate state — Phase 2 replaces the wrappers. Only requirement this phase: forms render, submit, and don't overflow horizontally. | Manual submit of both forms passes; page has no horizontal scroll. |
| 100svh unsupported → panel shorter than viewport on old browsers | L×L | `min-h-[100svh]` is the export value (`auth-redesign.html:74`); pilot targets modern Chrome/Safari. Matrix re-checks in Phase 3. | No clipping at 360×640 in matrix run. |
