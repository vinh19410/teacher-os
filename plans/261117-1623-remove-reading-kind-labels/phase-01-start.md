---
phase: 1
title: "Remove redundant reading kind labels & verify UI"
status: done
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Remove redundant reading kind labels & verify UI

<!-- Updated: Validation & Red Team Session 1 - synced apps/profile scope, added pure header helper, E2E POT capture & DOM checks, empty-title test case, and passage.kind normalization -->

## Goal

Remove the redundant Vietnamese reading passage kind labels from the student-facing placement test in `apps/student` and the synced public placement test in `apps/profile`, keeping clean card spacing and verifying with unit tests, typecheck, lint, and E2E/screenshot checks.

## Files to Create / Modify

- Modify: `apps/student/src/components/placement/placement-reading-step.tsx`
- Modify: `apps/student/src/lib/placement-test-helpers.ts`
- Modify: `apps/student/test/placement-test.test.tsx`
- Modify: `apps/profile/public/kiem-tra-dau-vao/test.js`
- Modify: `apps/profile/tests/placement-test.test.mjs`
- Modify: `apps/e2e/specs/student-placement-test.spec.ts`
- Modify: `apps/e2e/specs/profile-placement-test.spec.ts`

## Test Matrix (TDD)

1. `apps/student/test/placement-test.test.tsx`:
   - Update full-flow assertions at lines 565-566 from `.toContain("Biển báo / Thông báo")` / `.toContain("Đoạn văn điền từ")` to `.not.toContain(...)`, and also assert `.not.toContain("Tin nhắn / Email")` and `.not.toContain("Bài đọc hiểu")`.
   - Scope `[data-slot="card-header"]` queries to `[data-passage-id="..."]` (to avoid matching the step's intro `<CardHeader>`):
     - `sign` and `message` passages (including mixed-case/padded `kind` like `" Sign "`) render `[data-passage-kind="..."]` without `[data-slot="card-header"]` and hide secret passage titles.
     - `passage` / `cloze` with `title: ""` or `title: "(B1)"` (empty after `stripInlineCefrLabel`) do NOT render `[data-slot="card-header"]`.
     - `passage` / `cloze` with a non-empty title (e.g., `"Daily Routine"`) render `[data-slot="card-header"]` containing only `passageTitle` with no kind pill `<span>`.
2. `apps/profile/tests/placement-test.test.mjs`:
   - Static invariant check verifying `apps/profile/public/kiem-tra-dau-vao/test.js` no longer contains `READING_KIND_LABELS`, `"Biển báo / Thông báo"`, `"Tin nhắn / Email"`, `"Bài đọc hiểu"`, or `"Đoạn văn điền từ"`.
   - Unit test exported pure helper `resolveReadingPassageHeaderState(passage, prevPassage)` from `test.js` covering:
     - First passage in a part (`showPartLabel: true`, `hasHeader: true`, `showBadges: true`)
     - Subsequent `sign`/`message` passage in the same part (`showPartLabel: false`, `displayTitle: ""`, `showInstruction: false` -> `hasHeader: false`, `showBadges: false`)
     - `passage`/`cloze` with non-empty title (`displayTitle` present -> `hasHeader: true`, `showBadges` matches `showPartLabel`)
     - `passage`/`cloze` with empty/CEFR-only title in same part (`displayTitle: ""`, `showPartLabel: false` -> `hasHeader: false`)
3. `apps/e2e/specs/student-placement-test.spec.ts` & `apps/e2e/specs/profile-placement-test.spec.ts`:
   - `student-placement-test.spec.ts`: verify on `placement-step-reading` that none of the 4 redundant reading labels appear, `[data-passage-id]` cards with `sign`/`message` have 0 `[data-slot="card-header"]`, check `scrollWidth <= clientWidth` across 1440×900, 768×1024, 375×812, and when `CAPTURE_POT_ISSUE` is set capture Reading screenshots at those 3 viewports + 1440×900 dark mode.
   - `profile-placement-test.spec.ts`: assert `.reading-passage-card .question-tag` has count 0, cards without part label/title/instruction omit `.passage-header` and `.clip-badges`, and when `CAPTURE_POT_ISSUE` is set capture Reading light-mode screenshots at 1440×900, 768×1024, 375×812.

## Tasks & Steps

1. Update unit tests first (`apps/student/test/placement-test.test.tsx` and `apps/profile/tests/placement-test.test.mjs`) per the Test Matrix and run them to confirm the failing baseline (Red).
2. Edit `apps/student/src/components/placement/placement-reading-step.tsx`:
   - Remove `PLACEMENT_READING_KIND_LABELS` import and `kindLabel` computation.
   - Normalize `const normalizedKind = String(passage.kind ?? "passage").trim().toLowerCase();` and compute `isSignOrMessage = normalizedKind === "sign" || normalizedKind === "message"`.
   - Remove the `<div className="flex flex-wrap items-center gap-2">...</div>` badge block.
   - Conditionally render `<CardHeader className="pb-3"><CardTitle className="text-lg">{passageTitle}</CardTitle></CardHeader>` only when `!isSignOrMessage && Boolean(passageTitle)`.
3. Edit `apps/student/src/lib/placement-test-helpers.ts`:
   - Remove unused `PLACEMENT_READING_KIND_LABELS` constant and unused `PlacementReadingPassageKind` type import.
4. Edit `apps/profile/public/kiem-tra-dau-vao/test.js`:
   - Remove `READING_KIND_LABELS` constant (lines 63-68) and the `.question-tag` span inside `renderReadingStep` (lines 2083-2086).
   - Add and export pure helper `resolveReadingPassageHeaderState(passage, prevPassage)` and use explicit `if (readingHeader.hasHeader) { card.appendChild(...); }` (never passing `null` to `card.appendChild`) so empty `.clip-badges` and `.passage-header` nodes are omitted.
5. Re-run `pnpm --filter student test`, `pnpm --filter profile test`, `pnpm check-types`, and `pnpm exec biome check .` (Green).
6. Update `apps/e2e/specs/student-placement-test.spec.ts` and `apps/e2e/specs/profile-placement-test.spec.ts` with Reading DOM assertions and `CAPTURE_POT_ISSUE`-gated Reading screenshot capture; run both focused specs on isolated E2E ports (`8100/8101/8103/8104/8105`).

## Verification

- `pnpm --filter student test`
- `pnpm --filter profile test`
- `pnpm check-types`
- `pnpm exec biome check .`
- `CAPTURE_POT_ISSUE=<issue-number> E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/student-placement-test.spec.ts specs/profile-placement-test.spec.ts`
