---
title: "plan(670): đồng bộ vòng đời manual/auto khi nhập hoặc gỡ giáo trình"
date: 2026-11-11
summary: "TDD handover plan for #670 validated and red-teamed across server, web, E2E, and design:compare."
---

# plan(670): đồng bộ vòng đời manual/auto khi nhập hoặc gỡ giáo trình

## What happened
- Investigated Issue #670 where empty classes created in manual mode (0 sessions) failed to transition to auto mode or materialize active student schedules when importing a curriculum template, and ClassSessionsManageModal retained unreachable !sy dead code.
- Authored 3-phase TDD handover plan under --advice at plans/261111-0515-670-manual-class-curriculum-import/ and ran Standard-tier Fact-Checker/Contract-Verifier + 3-reviewer Red Team review (12 findings accepted, 1 out-of-scope RBAC change rejected, 0 unresolved contradictions).

## Decision
- Enforce syllabus.class_id as single source of truth across server (isManualClass, kernel manual session guards) and web (splitSyllabi in schedule-week/day/month).
- Extract materializeScheduleForEnrollment from enrollment-activation.ts with Statement 0 atomic class/lesson guards and org-scoped session_package upsert/reset.
- Use explicit error-code allowlist in ImportSyllabusModal and preserve notice/submitBlocked on reopen.

## Next steps
- Commit and push plan + journal via ak-git cp, sync Issue #670 metadata/labels, and execute /ak-fix --auto --advice.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
