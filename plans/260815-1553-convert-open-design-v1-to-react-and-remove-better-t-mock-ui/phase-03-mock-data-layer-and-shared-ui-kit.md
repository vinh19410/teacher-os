---
phase: 3
title: "Mock data layer and shared UI kit"
status: pending
priority: P1
effort: "6h"
dependencies: [2]
---

# Phase 3: Mock data layer and shared UI kit

## Overview
Port the export's mock data object `D` (lines 558–691) into a typed, mutable in-memory store with a React context, and build the shared design-system components every screen needs (buttons, badges, cards, tables, chips, tabs, modals, progress, avatars, form fields).

## Requirements
- Functional: all 8 data collections (students, lessons, invoices, assignments, reports, notifs, commentBank, classes, syllabi) with exact fields and Vietnamese content from the export.
- Functional: mutations that the export performs imperatively become store actions: `checkInLesson` (sets status + increments `pkg.done`, decrements `remaining`), `markInvoicePaid`, `saveGrade`, `addStudent`, `addClass`, `addSyllabus`, `assignSyllabus`, `addModule`, `editModule`, `addLesson`, `editLesson`.
- Functional: derived selectors mirroring export render logic: student risk filters, debt sums, band average `(task+coherence+lexical+grammar)/4`, package progress %, syllabus completion counts.
- Functional: formatters ported as named utils reused everywhere: `fmtVND(n)` (`toLocaleString('vi-VN')+'đ'`), `fmtK(n)`, date helpers (`dayNames`, `dayDates`) — these silently break if reimplemented per screen.
- Functional: modal kit has Escape-close + focus trap + focus-return (handoff demands keyboard states the export prototype lacks).
- Non-functional: pure client-side state (no server calls); resets on reload, matching export behavior.
- Non-functional: components are presentational, typed with shared TS types, no `any`.

## Architecture
```
apps/web/src/
├── lib/mock-data.ts        # types + seed data (verbatim from export D object)
├── lib/data-store.tsx      # React context + useReducer store, actions, selectors
└── components/ui/          # app-level design system (not shared @teacher-os/ui)
    ├── button.tsx          # btn / btn-primary / btn-secondary / btn-ghost / btn-sm, focus ring, active scale
    ├── badge.tsx           # badge + badge-dot + 5 variants (accent/success/warn/danger/muted)
    ├── card.tsx            # card (surface-warm) + card-white (bg) + stat-card
    ├── avatar.tsx          # sm/md/lg circle initials
    ├── tag.tsx             # outline pill tag
    ├── data-table.tsx      # ds-table: thead mono uppercase, hover rows, clickable, num-col right-aligned
    ├── chip-filter.tsx     # chip row with active state (single-select per export)
    ├── tabs.tsx            # underline tabs (settings, student/class detail)
    ├── progress.tsx        # 6px bar + fill variants (default/low/warn)
    ├── modal.tsx           # overlay + blur backdrop + modal-in animation, focus trap, Esc close
    ├── field.tsx           # label + help + input/select/textarea with export focus styles
    ├── section-label.tsx   # mono uppercase 11px label
    └── page-head.tsx       # h1 clamp(28,3.5vw,40) + lead
```
Components replicate export CSS classes exactly (`.btn`, `.badge`, `.ds-table` …) as Tailwind class strings — the exported stylesheet is the reference for every px/weight/transition.

Use existing `@teacher-os/ui` primitives only where they match the design (e.g. `Skeleton`); the app kit lives in `apps/web` to keep `packages/ui` scaffold-neutral.

## Related Code Files
- Create: `apps/web/src/lib/mock-data.ts`
- Create: `apps/web/src/lib/data-store.tsx`
- Create: 13 files under `apps/web/src/components/ui/` as listed above
- Reference (read-only): `open-design/v1/teacher-os.html` lines 96–258 (component CSS), 558–691 (data), 1246–1501 (mutation functions)

## Implementation Steps
1. Define TS interfaces: `Student` (id, name, phone, zalo, parent, targetBand, skills[], examDate, pkg{total,done,remaining,price,mode,start,expiry}, tags[], notes, avatar, atRisk), `Lesson` (sid, day, time, dur, type: '1:1'|'1:2'|'trial'|'mock'|'review', status, topic, zoom), `Invoice`, `Assignment` (+`Scores{task,coherence,lexical,grammar}`), `Report`, `Notif`, `CommentBankItem`, `ClassGroup`, `Syllabus`(+`Module`+`SyllabusLesson`).
2. Copy all seed rows verbatim (5 students, 11 lessons, 6 invoices, 6 assignments, 4 reports, 4 notifs, 8 comment-bank items, 3 classes, 3 syllabi with full module/lesson trees).
3. Build `DataProvider` + `useData()` hook: `useReducer` with typed actions; expose formatted helpers `fmtVND`, `fmtK`, `dayNames`, `dayDates`, `studentName(id)`, `initials(id)`, `averageBand(scores)`.
4. Build the 13 UI components, each mirroring its export CSS block; include hover/active/focus-visible/disabled states from the export (`scale(0.97)` on press, `--focus-ring`, `opacity:.4 pointer-events:none` disabled).
5. Modal: controlled component `{open, onClose, title, children, footer}`; overlay click closes (matches export); add Esc key + basic focus trap as accessibility upgrade.
6. Storybook-free visual check: render a scratch route `/dev/kit` (temporary, deleted in Phase 7) exercising every component variant against the export HTML opened side-by-side.

## Success Criteria
- [ ] `useData()` returns all 8 collections typed; TS strict passes
- [ ] Every mutation action updates state immutably; `checkInLesson` visibly changes remaining counts on all consumers (verified via React DevTools in Phase 5 wiring)
- [ ] All 13 components render with export-identical styling (side-by-side vs `teacher-os.html` in browser)
- [ ] Modal closes on overlay click + Esc; focus is trapped inside while open; focus returns to trigger element
- [ ] No `any` types; Biome passes

## Risk Assessment
- **Risk: state divergence from export behavior** (e.g. check-in should NOT decrement remaining below 0 — export clamps `if(remaining<=0) remaining=0`). Mitigation: port each mutation function line-by-line from export lines 1246–1501, then test the exact scenario (check-in all lessons of one student).
- **Risk: component kit scope creep** (building shadcn-parity giants). Mitigation: only build what the 13 views actually render; defer anything else.
- **Assumption: shared `@teacher-os/ui` primitives can remain unstyled-ish for auth pages.** If auth screens end up visually broken by Phase 2 palette swap, signal = screenshot diff; response: add minimal shadcn alias overrides only for auth route scope.
