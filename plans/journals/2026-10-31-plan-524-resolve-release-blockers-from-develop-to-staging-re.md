---
title: "Plan 524: Resolve release blockers from develop to staging review"
date: 2026-10-31
summary: "Authored, validated, and red-teamed 3-phase handover plan for issue #524 release blockers"
---

# Plan 524: Resolve release blockers from develop to staging review

## What happened
Created and validated the handover plan `plans/261031-2015-524-resolve-release-blockers` for GitHub issue #524 (`fix: resolve release blockers found in the develop to staging review`). Ran 3-reviewer Red Team review (`RedTeamSecurity`, `RedTeamAssumptions`, `RedTeamFailureModes`) and Kongming advisory supervision checkpoints.

## Decision
Locked scope to the 5 release blockers under "Chặn promote lên main" plus the `leads.ts:137` malformed JSON 400 guard:
1. Map `LEAD_ORG_ID` and `LEAD_ORIGINS` in `deploy-staging.yml` and `deploy.yml`, normalize empty/whitespace/comma-only `LEAD_ORIGINS` via `resolveLeadOrigins` in `packages/infra/src/topology.ts`, and trim `LEAD_ORG_ID` consistently.
2. Harden `docs/production-release-runbook.md` preflight gate requiring `email_verified = 1` for `TEACHER_EMAILS` on production D1.
3. Replace check-then-act in `POST /public/leads` with atomic guarded `INSERT ... SELECT ... WHERE ... RETURNING` and `UPDATE ... WHERE ... RETURNING` (preserving creator `ip_hash` and excluding target row from self-blocking IP count).
4. Require `session.emailVerified === true` in `bootstrapMiddleware` (`ACCOUNT_TEACHER_EMAIL_UNVERIFIED`), block cross-origin student sign-up for allowlisted teacher emails, and add verification email resend + reload UI in `AccountBlockedView`.
5. Enforce `canAccessFinance(ctx.role)` on `/api/leads` and `notifyNewLead`, hide `/leads` from non-finance roles in Sidebar/⌘K, and guard `/leads` route before `if (isPending)`.

## Next steps
Update issue #524 with plan metadata and labels, then execute Phase 1–3 via `/ak-fix --auto --advice`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
