---
title: "Merge student /vocab into /practice/vocabulary (#387)"
date: 2026-10-21
summary: "Consolidated student vocabulary hub and sub-routes under /practice/vocabulary/* with legacy /vocab/* replace redirects and sidebar cleanup."
---

# Merge student /vocab into /practice/vocabulary (#387)

## Summary
Consolidated student vocabulary routes (`apps/student`) under `/practice/vocabulary/*`, removed duplicate `VocabPracticeCatalog` and top-level sidebar item `"Từ vựng"`, and added `legacyVocabHref` + `/vocab` and `/vocab/$` replace redirects preserving query strings.

## Verification
- `pnpm --filter student test`: 38 files, 339 tests passed
- `pnpm check` & `pnpm check-types`: passed
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e`: 173 passed, 1 skipped, 0 failed

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
