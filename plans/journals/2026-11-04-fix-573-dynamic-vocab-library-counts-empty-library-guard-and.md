---
title: "Fix #573: Dynamic vocab library counts, empty-library guard, and staging D1 seed"
date: 2026-11-04
summary: "Implemented dynamic student vocab library counts, empty-library CTA hiding, and fail-closed staging D1 seed with SHA-256 content parity"
---

# Fix #573: Dynamic vocab library counts, empty-library guard, and staging D1 seed

## What happened
- Executed Phase 1 & Phase 2 of `plans/261104-0644-vocab-courses-empty-cta` via TDD (`ak-fix --auto --advice`).
- Replaced hardcoded `"20 khóa · 968 bài"` in `VocabCoursesCta` and `"20 khóa học từ vựng"` in `StudentVocabEntrySection` with dynamic counts from `useVocabLibraryCourses()`, hiding `VocabCoursesCta` and removing dangling `"bên dưới"` copy when the library is empty or errored, and distinguishing empty library from filter mismatch in `VocabCoursesCatalogView`.
- Extended `packages/db/src/seed/vocab-library.ts` and `packages/db/scripts/seed-vocab-library.ts` with `--d1-stage staging` (fail-closed regex + `total_count` check), `assertNonProdD1Database` license-gate guard, SHA-256 `verifyContentParity` for `--if-needed`, column-0 `::add-mask::`, error redaction, and `429`/`5xx` retry + 20s timeout; wired into `.github/workflows/deploy-staging.yml` and locked against `deploy.yml` / `alchemy.run.ts` in `scripts/ci-workflow.test.mjs`.
- Scoped `packages/db/tsconfig.json` `include` to `["src/schema/**/*.ts", "src/seed/**/*.ts", "scripts/**/*.ts"]` after `KongmingVerifyFail24` escalation so `@teacher-os/db#check-types` runs in <20s without pulling the heavy `@teacher-os/infra/alchemy.run` graph.

## Decision
- Kept `/api/student/vocab/overview` `.strict()` schema untouched; fetched `useVocabLibraryCourses()` in parallel in `VocabOverviewPage` to avoid waterfall and CLS.
- Placed staging D1 seed after `/readyz` in `deploy-staging.yml` without calling `/api/student/*` via smoke user, keeping 0-org staging rehearsal clean and avoiding junk `student` rows.

## Next steps
- Run independent `ak-code-review --pending --advice`, evaluate `ak-test` / `ak-docs`, then ship beta PR (`ak-ship beta --advice`) to `develop`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
