---
title: Plan in-place attendance tab Buổi học
date: 2026-08-26
summary: "Plan CTA điểm danh tuần tự trên tab Buổi học; issue #91"
---

# Plan in-place attendance tab Buổi học

## What happened
Lập plan điểm danh tại chỗ trên tab Buổi học (`plans/260826-1854-in-place-attendance-on-bui-hc-tab`).

Tab đã ship (PR #90). Check-in kernel upcoming→completed, không date-gate. `ClassSession.rows` là slot bag; `sessionStatus` là prefix count.

## Decision
- Sequential-only + UI date gate `dateISO <= todayISOVietnam()`.
- 1:1 one-click; 1:2+ modal; 1 enrollmentLessonId / sid / click.
- Không mark-absent, không cột date, không fan-out #87 dropdown.
- Red-team: chấp nhận copy/recipe (reload-only, TZ VN, live modal); từ chối nới server/ACL.

## Next steps
Cook: `/ak:cook /Users/vinhtran/Documents/project/personal/teacher-os/plans/260826-1854-in-place-attendance-on-bui-hc-tab/plan.md --advice`
Issue: https://github.com/vinh19410/teacher-os/issues/91

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
