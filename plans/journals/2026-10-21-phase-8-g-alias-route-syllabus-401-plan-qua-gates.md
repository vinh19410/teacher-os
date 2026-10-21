---
title: "Phase 8 gỡ alias route syllabus (#401): plan qua gates"
date: 2026-10-21
summary: "Plan plans/261021-2113-phase8-remove-syllabus-alias-routes: gỡ 7 cặp method-path alias (/api/syllabi*, /api/classes/:id/{import-syllabus,remove-curriculum}), giữ findSyllabus (POST /classes còn dùng). Gates: ak plan validate OK; red-team 2 reviewer hostile — 8 findings/8 accepted (test đảo phải dùng id thật vì id giả trả 404 cả 2 thế giới; grep gate cần scoped route-registration; CSRF guard 403 trước 404 với Origin lạ; CHANGELOG.md:19 stale; line-anchor drift). Mode: --ship --beta --advice, worktree ai-handle-issue-401."
---

# Phase 8 gỡ alias route syllabus (#401): plan qua gates

Plan plans/261021-2113-phase8-remove-syllabus-alias-routes: gỡ 7 cặp method-path alias (/api/syllabi*, /api/classes/:id/{import-syllabus,remove-curriculum}), giữ findSyllabus (POST /classes còn dùng). Gates: ak plan validate OK; red-team 2 reviewer hostile — 8 findings/8 accepted (test đảo phải dùng id thật vì id giả trả 404 cả 2 thế giới; grep gate cần scoped route-registration; CSRF guard 403 trước 404 với Origin lạ; CHANGELOG.md:19 stale; line-anchor drift). Mode: --ship --beta --advice, worktree ai-handle-issue-401.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
