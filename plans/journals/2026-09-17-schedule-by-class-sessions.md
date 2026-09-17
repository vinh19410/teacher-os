---
title: Schedule by class sessions
date: 2026-09-17
summary: "Ship #162: /schedule groups one physical class session per block with ClassSessionModal roster actions."
---

# Schedule by class sessions

## What happened
Implemented issue #162: weekly /schedule grid now groups dated lessons by (classId, date) and legacy rows by (classId, day, time). One block shows the class name. Clicking opens ClassSessionModal with per-student attendance/cancel and dated whole-session edit.

Local review found two Important issues: edit outcome state leaked across student targets, and dated edits were labeled as student-specific while the server updates the whole occurrence. Both were fixed in ClassSessionModal (reconcile-before-leave, whole-class copy, focus restore after row actions).

## Decision
Keep server semantics (occurrenceUpdate for dated lesson-edit). Surface the scope in the UI instead of adding a new API. Projected QC #121 blocks stay display-only.

## Verification
- pnpm test: web 508, server 218, ci-workflow 2, topology-drift 6
- Playwright: schedule-session-modal (2), class-operations (2), projected-sessions (1), session-occurrence (2)
- Biome + web check-types on touched files

## Next steps
Open beta PR to develop, review-pr --fix --reply --merge, watch CI.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
