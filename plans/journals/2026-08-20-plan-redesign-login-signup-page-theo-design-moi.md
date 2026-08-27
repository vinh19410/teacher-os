---
title: Plan redesign login signup page theo design moi
date: 2026-08-20
summary: "Ke hoach 3 phase redesign /login theo auth-redesign.html, issue #39, kongming GO"
---

# Plan redesign login signup page theo design moi

## What happened
- Chay /ak:plan --github --advice cho task redesign trang login/sign up theo design export moi (auth-redesign.html, 858 dong, token trung khop globals.css).
- Cross-plan scan: 7 plan cu da completed; 260819-2034-production-readiness (pending) khong trung lap file -> khong block.
- Scope challenge: HOLD SCOPE, auto-detect FAST mode (scope ro rang, design dac ta day du, pattern UI local da co san).
- Kongming checkpoint 1 (solution design): GO voi tweaks — verify TanStack Form error mapping SOM o Phase 2, ARIA tabs day du (roving tabIndex, arrow wrap), dark panel dung explicit var() utilities de tranh .dark variant leak, giu sonner toast cho errors.
- Planner viet 4 file plan; ak plan validate OK; consistency sweep sach.
- Kongming checkpoint 2: GO publish GitHub, recommend /ak:plan validate truoc cook (red-team overkill cho scope frontend nay).

## Decision
- 3 phase: (1) static shell + brand panel — zero behavior change; (2) tabs + forms migration — auth wiring giu nguyen verbatim, success toast -> inline notice la delta duy nhat; (3) motion (motion-reduce guarded) + verification matrix 360-1920 + keyboard walk + screenshot diff.
- Khong sua packages/ui, khong dependency moi; component moi o apps/web/src/components/auth/.
- Tab mode persist localStorage "teacher-os-auth-tab", default "signup" (khop hanh vi hien tai).

## Next steps
- Issue #39 (label ready to review): https://github.com/vinh19410/teacher-os/issues/39
- Plan: plans/260820-1912-redesign-login-sign-up-page/
- User chon buoc tiep: /ak:plan validate (khuyen nghi boi kongming) hoac /ak:cook truc tiep.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
