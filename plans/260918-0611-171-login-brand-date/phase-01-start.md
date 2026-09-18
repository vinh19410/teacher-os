---
title: "Phase 1: Implementation & Verification"
status: completed
---

# Phase 1: Implementation & Verification

## Overview

Update `apps/web/src/components/auth/brand-panel.tsx` to dynamically format the date displayed on the marketing preview card, and add unit test coverage in `apps/web/src/components/auth/brand-panel.test.tsx`.

## Requirements

- [x] Replace `"Thu, Aug 20 · 3 classes"` in `brand-panel.tsx` with dynamic formatting: `${formatBrandPanelDate(now)} · 3 classes`.
- [x] Support an optional `now?: Date` prop on `BrandPanel` defaulting to `new Date()`.
- [x] Add unit tests verifying `formatBrandPanelDate` and `BrandPanel` rendered output with custom and default dates.
- [x] Verify `pnpm test`, `pnpm check-types`, and `pnpm check`.

## Implementation Steps

1. Add helper function `formatBrandPanelDate(date: Date): string` using `Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" })`.
2. Update `BrandPanel({ now = new Date() }: { now?: Date })` in `apps/web/src/components/auth/brand-panel.tsx`.
3. Create `apps/web/src/components/auth/brand-panel.test.tsx` using `renderToStaticMarkup`.
4. Run `pnpm test`, `pnpm check-types`, and `pnpm check`.

## Success Criteria

- Dynamic date format matches `Thu, Aug 20` pattern.
- All tests and linters pass cleanly.
