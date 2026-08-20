---
title: "Ship login redesign (issue #39)"
date: 2026-08-20
summary: "Vibe pipeline: reused 3-phase plan; red-team (3 hostile reviewers, 14 findings accepted — 2 Critical fixed the auth-wiring invariant to real window.location.assign(validateReturnUrl(returnUrl)) and mandated returnUrl/validateSearch/Google-callbackURL preservation); implemented two-panel login with ARIA tabs, AuthField, notices, SubmitButton; kongming GO at plan/impl/ship checkpoints; tester 6/6 PASS; code-review 8/10 0-critical, 3 warnings fixed; browser verification (exact zod messages, localStorage teacher-os-auth-tab, roving tabIndex, responsive 360-1920 no overflow); merged develop (PR #40) clean; integrated 162/162 tests green. Root-cause found en route: worktree lacked apps/web/.env (VITE_SERVER_URL) which blanks the whole app at boot — copied local .env, documented."
---

# Ship login redesign (issue #39)

Vibe pipeline: reused 3-phase plan; red-team (3 hostile reviewers, 14 findings accepted — 2 Critical fixed the auth-wiring invariant to real window.location.assign(validateReturnUrl(returnUrl)) and mandated returnUrl/validateSearch/Google-callbackURL preservation); implemented two-panel login with ARIA tabs, AuthField, notices, SubmitButton; kongming GO at plan/impl/ship checkpoints; tester 6/6 PASS; code-review 8/10 0-critical, 3 warnings fixed; browser verification (exact zod messages, localStorage teacher-os-auth-tab, roving tabIndex, responsive 360-1920 no overflow); merged develop (PR #40) clean; integrated 162/162 tests green. Root-cause found en route: worktree lacked apps/web/.env (VITE_SERVER_URL) which blanks the whole app at boot — copied local .env, documented.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
