---
title: "Convert open-design v1 to React and remove Better-T mock UI"
description: "Replace all Better-T-Stack scaffold UI in apps/web with production React components converted from open-design/v1/teacher-os.html, preserving the exported visual contract (tokens, layout, interactions, responsive behavior)."
status: pending
priority: P1
effort: "6-7d"
tags: [ui, design-conversion, react, tailwind]
created: 2026-08-15
blockedBy: []
blocks: []
---

# Convert open-design v1 to React and remove Better-T mock UI

## Overview

The web app (`apps/web`) currently renders Better-T-Stack scaffold UI: an ASCII-art home page, a generic `Header`, an empty dashboard stub, and a default dark theme. The repo contains a complete, self-contained design export at `open-design/v1/teacher-os.html` (1,519 lines: full CSS token system, 13 app views, mock data object `D`, interactions, responsive rules) plus `DESIGN-HANDOFF.md` and `DESIGN-MANIFEST.json` as the machine-readable contract.

This plan converts that export into the React app:

1. Remove every piece of Better-T scaffold/mock UI.
2. Freeze the design tokens into the Tailwind v4 theme before any component is written.
3. Port all 13 views as file-based TanStack Router routes under the existing `_auth` layout, driven by a typed in-memory mock-data store (same data as the export), with all interactions (view switching → routing, filters, tabs, modals, check-in, mark-paid, grading, module/lesson CRUD) rebuilt in React.
4. Verify across the 2025–2026 viewport matrix from the handoff (360×800 → 1920×1080) with zero horizontal scroll.

Out of scope (unchanged, still functional): auth **flow** (`login.tsx`, sign-in/up forms, Better-Auth guard chain), server app, DB, infra. Login screen **visuals intentionally adopt the export palette** (single app-wide light design system) and lose the scaffold header — the flow, validation, and navigation behavior are untouched. One palette app-wide is the end state; a scoped dual-token system is explicitly rejected.

## Source of truth

- `open-design/v1/teacher-os.html` — primary entry; `:root` block (lines 8–32) is the token source; `D` object (lines 558–691) is the mock data source; inline `<script>` (lines 550–1517) documents every interaction.
- `open-design/v1/DESIGN-HANDOFF.md` — fidelity contract (tokens, responsive matrix, states, copy).
- `open-design/v1/DESIGN-MANIFEST.json` — machine-readable screen/token/interaction map.
- Preserve real Vietnamese copy and data verbatim. No Open Design chrome (`data-od-id` attributes) in production UI.

## Token extraction map (freeze before coding)

| Export token | Value | Tailwind v4 mapping |
|---|---|---|
| `--bg` | `#ffffff` | `--color-background` |
| `--surface` | `#f5f5f7` | `--color-surface` |
| `--surface-warm` | `#fbfbfd` | `--color-surface-warm` |
| `--fg` / `--fg-2` | `#1d1d1f` / `#424245` | `--color-foreground` / `--color-foreground-2` |
| `--muted` / `--meta` | `#6e6e73` / `#86868b` | `--color-muted-foreground` / `--color-meta` |
| `--border` / `--border-soft` | `#d2d2d7` / `#e8e8ed` | `--color-border` / `--color-border-soft` |
| `--accent` (+hover/active) | `#0071e3` / `#0077ed` / `#0066cc` | `--color-accent` etc. |
| `--success` / `--warn` / `--danger` | `#16a34a` / `#eab308` / `#dc2626` | `--color-success` / `--color-warn` / `--color-danger` |
| `--radius-sm/md/lg/pill` | 8/12/18/980px | `--radius-sm/md/lg/full` overridden individually (export scale is non-linear; do NOT derive from a single `--radius` base) |
| Mobile breakpoint | `max-width:920px` | `--breakpoint-app: 921px` so `app:` fires ≥921 and `max-app:` covers ≤920 — the export boundary is inclusive of 920 (custom token, never stock `md:`/`lg:` for the drawer) |
| `--space-1..12` | 4–48px | default Tailwind spacing already covers; keep CSS vars for exact rhythm |
| `--text-xs..4xl` | 12–80px | `--text-xs` … `--text-4xl` overrides |
| `--motion-fast/base` + `--ease-standard` | 150/220ms, `cubic-bezier(0.28,0,0.22,1)` | `--animate-*` / CSS vars |
| `--focus-ring` | 4px accent ring 65% transparent | `--color-ring` + focus-visible utilities |
| `--sidebar-w` | 248px (280px mobile drawer) | layout constant |
| Fonts | SF Pro Display/Text/Mono stacks | `--font-display` / `--font-body` / `--font-mono` |

Light theme only. The export has no dark mode; the scaffold's default-dark `ThemeProvider`, `ModeToggle`, and the `.dark` CSS block are all removed (deleting `ThemeProvider` matters: `next-themes` persists `"dark"` in localStorage under `vite-ui-theme`, so "light default" alone leaves returning users dark).

Route policy: list screens and detail screens are real `$id` routes (browser back + reload must work); tabs within a detail screen are local state. Port the export's *behavior* with React idioms, not its `innerHTML`/`onclick-string` mechanism — but add Escape-close + focus-trap to the modal kit (handoff demands keyboard states the prototype lacks).

Fidelity pipeline: a tracer-bullet gate after the app shell (Phase 5 step 1 = dashboard only, diffed at 390/920-boundary/1440 against the export) proves tokens/kit/shell before ~20h of remaining screens are built.

## Route map (export view → TanStack Router file)

| Export view id | Route file | Title (topbar) |
|---|---|---|
| `view-dashboard` | `_auth/dashboard.tsx` | Tổng quan |
| `view-students` | `_auth/students/index.tsx` | Học viên |
| `view-student-detail` | `_auth/students/$studentId.tsx` | Học viên |
| `view-schedule` | `_auth/schedule.tsx` | Lịch dạy |
| `view-tuition` | `_auth/tuition.tsx` | Học phí |
| `view-assignments` | `_auth/assignments/index.tsx` | Bài tập |
| `view-assignment-detail` | `_auth/assignments/$assignmentId.tsx` | Bài tập |
| `view-classes` | `_auth/classes/index.tsx` | Lớp học |
| `view-class-detail` | `_auth/classes/$classId.tsx` | Lớp học |
| `view-syllabus` | `_auth/syllabus/index.tsx` | Syllabus |
| `view-syllabus-detail` | `_auth/syllabus/$syllabusId.tsx` | Syllabus |
| `view-reports` | `_auth/reports.tsx` | Báo cáo phụ huynh |
| `view-settings` | `_auth/settings.tsx` | Cài đặt |
| (home `/`) | redirect to `/dashboard` | — |

Modals from the export (add-student, add-invoice, create-report, grade, add-class, add/edit-syllabus, assign-syllabus, add/edit-module, add/edit-lesson, lesson detail) become components rendered per-route, styled on the export modal (max-w 480px, overlay blur, `modal-in` animation).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Zero Better-T scaffold UI remains in the rendered app | P1 |
| 2 | Design tokens frozen in Tailwind v4 theme before component work | P1 |
| 3 | All 13 export views implemented as typed React routes with real Vietnamese copy/data | P1 |
| 4 | All export interactions rebuilt (filters, tabs, modals, check-in, mark-paid, grade, syllabus CRUD, notifications, search) | P1 |
| 5 | Responsive matrix 360–1920 verified, no horizontal scroll, mobile drawer nav | P1 |
| 6 | Auth flow, PWA, build, lint, type-check all still green | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Remove Better-T mock UI and reset shell](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Design tokens and global styles](./phase-02-design-tokens-and-global-styles.md) | Pending |
| 3 | [Phase 3: Mock data layer and shared UI kit](./phase-03-mock-data-layer-and-shared-ui-kit.md) | Pending |
| 4 | [Phase 4: App shell layout and navigation](./phase-04-app-shell-layout-and-navigation.md) | Pending |
| 5 | [Phase 5: Core module screens](./phase-05-core-module-screens.md) | Pending |
| 6 | [Phase 6: Teaching module screens](./phase-06-teaching-module-screens.md) | Pending |
| 7 | [Phase 7: Reports, settings and cleanup](./phase-07-reports-settings-and-cleanup.md) | Pending |
| 8 | [Phase 8: Responsive verification and release](./phase-08-responsive-verification-and-release.md) | Pending |

Phase dependencies: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 (strictly sequential; each phase builds on the previous).

## Success Criteria

- [ ] `apps/web` renders no scaffold UI: no ASCII home, no generic Header, no dark-mode toggle, no empty dashboard stub
- [ ] `/` redirects to `/dashboard` (through `_auth` → `/login` when unauthenticated)
- [ ] Token diff: every color/radius/type/spacing value used by components comes from the frozen theme, not hardcoded hex
- [ ] All 13 views navigable via sidebar with correct active states and topbar titles
- [ ] Interactions verified: student filter chips, assignment filter chips, class/syllabus filters, student/assignment/class/syllabus detail tabs, notification bell panel, check-in (updates numeric counts on dashboard + students + tuition; tags/alerts are static snapshot), mark-paid, grading modal (writes rubric scores + band average), syllabus module/lesson add+edit, assign-syllabus, comment bank append, global search → student
- [ ] Viewport checks pass at 360, 390, 430, 600, 820, 1024, 1366, 1440, 1920 with no horizontal overflow; sidebar becomes drawer with scrim ≤920px
- [ ] `pnpm run check` (Biome), `pnpm run check-types`, `pnpm run build` all pass
- [ ] No `data-od-id` attributes or prototype annotations in shipped code
- [ ] Demo-data disclosure visible in app shell; detail routes show not-found (never crash) on unknown ids

## Risk Assessment

- **Token drift** (components hardcode hex instead of theme vars) → mitigated by freezing tokens in Phase 2 before any screen work and reviewing diffs for literal colors.
- **Interaction fidelity loss** (export's imperative DOM JS vs React state) → mitigated by a central mock-data store (Phase 3) that mirrors `D` mutations exactly (`checkIn` increments package counts everywhere it's shown).
- **TanStack Router layout quirks** (`_auth` route already redirects unauthenticated users; new layout must not break that) → mitigated in Phase 4 by keeping `beforeLoad` intact and only replacing the `AuthLayout` component body.
- **shadcn primitives vs custom design** (shadcn dialog/table styling differs from export) → mitigated by styling at the app-component layer (wrapper components own the export look); shared `@teacher-os/ui` package stays untouched except `globals.css` tokens, so auth screens and future apps don't regress.
- **PWA theme mismatch** (manifest `theme_color: #0c0c0c` dark vs light design) → fixed in Phase 7.

## Red Team Review

Reviewed by 4 hostile lenses (Security Adversary, Assumption Destroyer, Failure Mode Analyst, Scope & Complexity Critic) with codebase verification. 20 raw findings → 15 deduplicated → 14 accepted, 1 rejected. Applied 2026-08-15.

| # | Finding | Severity | Disposition |
|---|---------|----------|-------------|
| 1 | Token collision: export `--muted`/`--accent` clobber shadcn semantics; alias list covered 7 of ~20 consumed vars → auth UI breakage | Critical | Accept → phase-02 complete alias enumeration + collision resolution + exit gate |
| 2 | Verification unexecutable: all routes behind `_auth` guard (captures would show `/login`); no Playwright; `dev:web` only | Critical | Accept → authenticated capture harness built in phase-04, manual checklist fallback |
| 3 | Phase 5 self-aborting structure; tracer gate exercised no modals/chips/tabs/fields | Critical | Accept → 5a/5b split; students list added to gate |
| 4 | `/dev/kit` scratch route outside auth guard = unauthenticated seed-data window | High | Accept → dropped entirely; kit validated on real screens |
| 5 | Ephemeral financial mutations with zero disclosure | High | Accept → persistent demo-data indicator (phase-04) + labeled exports (phase-07) |
| 6 | Radius criterion unachievable: `packages/ui` primitives hardcode `rounded-none` | High | Accept → radius criterion scoped to app kit; auth square corners accepted |
| 7 | Login palette deadlock: hardcoded `text-indigo-600`/`text-red-500` in frozen files | High | Accept → ~6-line mechanical class swap permitted in auth forms |
| 8 | Runtime-created entities vanish on reload → `$id` crash; no notFound handling | High | Accept → `notFoundComponent` on all 4 detail routes; phase-08 criterion amended |
| 9 | Phase 8 budget fiction (81 screenshot pairs + 117 checks in 4h) | High | Accept → 4-viewport screenshots + full-grid overflow assertion; 6h; sweeps moved to 5/6 |
| 10 | "Pixel-close" unmeasurable; ≤5px carve-out covered almost nothing | High | Accept → uniform ≤8px offset threshold, fonts/colors/radii identical |
| 11 | Session-less fallback rendered fake teacher card — normalizes guard regression | Medium | Accept → hard invariant redirect; fallback branch deleted; Outlet composition resolved |
| 12 | Phase 3 budget fiction (3h store + ~14 min/component) | High | Accept → 8h; `/dev/kit` dropped |
| 13 | 920px off-by-one (`max-app:` excluded 920 where export includes it); duplicate step numbering | Medium | Accept → `--breakpoint-app: 921px`; steps renumbered |
| 14 | Toaster silently falls to system theme | Medium | Accept → pinned `theme="light"` in phase-01 |
| 15 | Replace seed phone numbers/zalo IDs with placeholders | Medium | **Reject** — DESIGN-HANDOFF.md:37 mandates preserving real export copy verbatim; data is fictional seed from the user's own export. Numeric phone validation accepted (folded into phase-03) |

### Whole-Plan Consistency Sweep
After applying, re-read plan.md + all 8 phase files. Verified: no remaining reference to `/dev/kit` as a created artifact (phase-07 deletion note updated to "never created"); 920px semantics consistent everywhere (`921px` token, `max-app:` ≤920); Phase 5's split referenced consistently in its own file; check-in consistency claims everywhere limited to numeric fields (plan.md success criteria, phase-05 criteria); no contradictory radius claims remain (phase-02 criterion scoped). No unresolved contradictions.

## Validation Log

### Verification Results (validate gate, 2026-08-15)
- Claims checked: 24 (file paths, line ranges, token values, structure, ports, deps)
- Verified: 24 | Failed: 0 | Unverified: 0
- Tier: Full (8 phases, all 4 roles)
- Failures: none. Spot-checks: export `:root` lines 8–32 ✓; `D` object 558–691 ✓; 15 `view-*` sections ✓; `max-width:920px` at line 260 ✓; scaffold files exist as claimed (header/mode-toggle/theme-provider, index ASCII, dashboard stub) ✓; vite port 3001 + PWA `theme_color #0c0c0c` ✓; Tailwind v4.3.3 + `@theme inline` mechanics ✓.
