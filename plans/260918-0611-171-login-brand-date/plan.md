---
title: "171-login-brand-date"
description: "Render dynamic current date in login brand panel marketing card instead of hardcoded 'Thu, Aug 20'"
status: completed
priority: P3
effort: "small"
tags: ["auth", "brand-panel", "bugfix", "qc"]
created: 2026-09-18
---

# 171-login-brand-date: Dynamic date in login brand panel

## Overview

In `apps/web/src/components/auth/brand-panel.tsx`, the marketing preview card contains a hardcoded date string `"Thu, Aug 20 · 3 classes"`. This was authored on August 20, 2026 and never updated dynamically, causing QA to report that the date is static and out of sync with reality.

We will format the date dynamically using `Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" })` and support an optional `now?: Date` prop (defaulting to current date) for deterministic rendering and testability.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Replace hardcoded "Thu, Aug 20" with dynamic formatted current date | P3 |
| 2 | Allow `now?: Date` prop on `BrandPanel` for deterministic testing | P3 |
| 3 | Add unit tests covering dynamic date rendering in `brand-panel.test.tsx` | P3 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Implementation & Verification](./phase-01-start.md) | Completed |

## Success Criteria

- [x] `BrandPanel` dynamically renders `weekday, Month Day · 3 classes` for the current date.
- [x] Passing a specific `now` prop (e.g. `2026-08-20`) formats as `Thu, Aug 20 · 3 classes`, and another date formats accordingly.
- [x] Unit tests in `apps/web/src/components/auth/brand-panel.test.tsx` pass.
- [x] `pnpm test`, `pnpm check-types`, and `pnpm check` pass with zero errors.
<!-- slug: 171-login-brand-date -->
