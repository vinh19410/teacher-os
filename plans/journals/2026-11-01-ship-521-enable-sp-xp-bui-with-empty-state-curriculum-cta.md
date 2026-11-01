---
title: "Ship #521: Enable Sắp xếp buổi with empty-state curriculum CTA"
date: 2026-11-01
summary: "Completed TDD implementation, E2E verification, design:compare screenshots, and local review for issue #521."
---

# Ship #521: Enable Sắp xếp buổi with empty-state curriculum CTA

## What happened
- Implemented Issue #521 fix in `apps/web/src/routes/_auth/classes/$classId.tsx` and `apps/web/src/components/class-detail/class-sessions-manage-modal.tsx`.
- Added unit test in `apps/web/src/routes/_auth/classes/$classId.test.tsx` and E2E test in `apps/e2e/specs/syllabus-class-curriculum.spec.ts` (3 viewports + keyboard Enter activation).
- Updated `DESIGN.md`, `CHANGELOG.md`, and regenerated `t-class-detail` comparison screenshots via `pnpm design:compare`.

## Decision
- Local code review (`LocalCodeReviewer`) and `kongming` (`KongmingImplReviewCheckpoint`) approved shipping to `develop` with 0 Critical / 0 Important / 0 Minor findings.

## Next steps
- Commit, push, and open PR into `develop`, then run `/ak-review-pr --fix --reply --advice`, merge into `develop`, and watch CI to green.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
