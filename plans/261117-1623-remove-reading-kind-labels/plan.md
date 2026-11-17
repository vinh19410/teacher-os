---
title: "Remove redundant Vietnamese reading kind labels on placement test"
description: "Remove redundant Vietnamese passage kind pill badges (Biển báo / Thông báo, Tin nhắn / Email, Bài đọc hiểu, Đoạn văn điền từ) from reading cards in Student Portal and Public Profile placement tests."
status: completed
priority: P2
effort: 1h
branch: fix/remove-reading-kind-labels
tags: [frontend, placement-test, ui, student, profile]
blockedBy: []
blocks: []
created: 2026-11-17
---

# Remove redundant Vietnamese reading kind labels on placement test

## Overview

In the placement test Reading step (`student.msmy.io.vn/placement-test` and the mirrored public test at `apps/profile/public/kiem-tra-dau-vao/test.js`), every reading passage card currently renders a Vietnamese kind pill (`Biển báo / Thông báo`, `Tin nhắn / Email`, `Bài đọc hiểu`, `Đoạn văn điền từ`). Those labels are redundant because the section intro, part labels (`Part 1`, `Part 2`, ...), English instructions, and passage card styles already convey each passage's format. Removing these labels cleans up the student-facing reading UI in both `apps/student` and `apps/profile` while keeping the teacher authoring selector in `apps/web` intact.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Remove redundant Vietnamese `kindLabel` badge and empty `CardHeader` on reading passage cards in `apps/student` (with case-insensitive `passage.kind` normalization) | P1 |
| 2 | Sync the same removal in `apps/profile/public/kiem-tra-dau-vao/test.js` without leaving empty `.clip-badges` or `.passage-header` nodes | P1 |
| 3 | Update and expand TDD unit tests + E2E assertions in `apps/student`, `apps/profile`, and `apps/e2e`, plus capture gated Reading POT screenshots | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Remove redundant reading kind labels & verify UI](./phase-01-start.md) | Pending |

## Success Criteria

- [x] `apps/student/src/components/placement/placement-reading-step.tsx` normalizes `String(passage.kind ?? "passage").trim().toLowerCase()`, no longer renders `PLACEMENT_READING_KIND_LABELS` or `"Bài đọc hiểu"` fallback badge, and omits `<CardHeader>` when `isSignOrMessage || !passageTitle`.
- [x] Unused `PLACEMENT_READING_KIND_LABELS` export and `PlacementReadingPassageKind` import are removed from `apps/student/src/lib/placement-test-helpers.ts`.
- [x] `apps/profile/public/kiem-tra-dau-vao/test.js` no longer defines `READING_KIND_LABELS` or renders the `.question-tag` reading kind badge, exports a pure header-state helper for unit testing, and omits empty `.clip-badges` / `.passage-header` containers.
- [x] Teacher editor in `apps/web/src/components/placement-test/reading-passage-card.tsx` remains unchanged.
- [x] `pnpm --filter student test`, `pnpm --filter profile test`, `pnpm check-types`, `pnpm exec biome check .`, and focused E2E specs (`student-placement-test.spec.ts`, `profile-placement-test.spec.ts`) pass.
- [x] Visual POT screenshots captured via `CAPTURE_POT_ISSUE` for `apps/student` at 1440×900 (light & dark), 768×1024, and 375×812 and for `apps/profile` at 1440×900, 768×1024, and 375×812 (light only, as `apps/profile` has no dark mode), with zero horizontal overflow (`scrollWidth <= clientWidth`).

## Validation Log

### Verification Results
- **Tier:** Light (1 phase)
- **Claims checked:** 5
- **Verified:** 5 | **Failed:** 0 | **Unverified:** 0

### Decisions Confirmed
1. **Sync `apps/profile` alongside `apps/student`:** Confirmed by user — remove the redundant Vietnamese reading kind labels in both Student Portal (`apps/student`) and Public Profile (`apps/profile/public/kiem-tra-dau-vao/test.js`), keeping `apps/web` teacher editor unchanged.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`
- Decision deltas checked: 5 (profile sync confirmation, `CAPTURE_POT_ISSUE` gated screenshots + light-only profile dark-mode distinction, `apps/profile` pure helper + `"Bài đọc hiểu"` token check + E2E DOM assertions, `apps/student` lines 565-566 + empty-title `passage`/`cloze` + scoped `[data-slot="card-header"]`, `passage.kind` `.trim().toLowerCase()` normalization)
- Reconciled stale references: 0 remaining
- Unresolved contradictions: 0

## Red Team Review

### Session — 2026-11-17
**Findings:** 4 deduplicated (2 High, 2 Medium) — 4 accepted, 0 rejected (user approved: "Looks good, apply accepted findings")
**Severity breakdown:** 0 Critical, 2 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | E2E specs lacked Reading POT screenshot capture / student overflow check, and `apps/profile` has no dark mode | High | Accept | `plan.md`, `phase-01-start.md` |
| 2 | `apps/profile` unit tests lacked DOM runtime, missed `"Bài đọc hiểu"` token check, and needed a pure header helper + E2E `.passage-header`/`.clip-badges` assertions | High | Accept | `plan.md`, `phase-01-start.md` |
| 3 | `apps/student` test matrix needed explicit update of lines 565-566, scoped `[data-slot="card-header"]` selectors, and empty-title `passage`/`cloze` case | Medium | Accept | `phase-01-start.md` |
| 4 | `apps/student` compared `passage.kind` strictly instead of normalizing `.trim().toLowerCase()` like `apps/profile` | Medium | Accept | `plan.md`, `phase-01-start.md` |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`
- Decision deltas checked: 4
- Reconciled stale references: 0 remaining
- Unresolved contradictions: 0

<!-- slug: remove-reading-kind-labels -->
