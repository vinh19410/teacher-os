---
title: "Ship 524: Resolve release blockers from develop to staging review"
date: 2026-10-31
summary: "Shipped atomic lead rate limiting, teacher emailVerified allowlist gate, /api/leads finance role gate, and deploy workflow env mappings for #524"
---

# Ship 524: Resolve release blockers from develop to staging review

## What happened
Implemented and verified all 3 phases of `plans/261031-2015-524-resolve-release-blockers` for issue #524:
1. Mapped `LEAD_ORG_ID` and `LEAD_ORIGINS` in `.github/workflows/deploy-staging.yml` and `.github/workflows/deploy.yml`, added `resolveLeadOrigins` in `packages/infra/src/topology.ts` to normalize empty/whitespace/comma-only values to `DEFAULT_PROD_LEAD_ORIGINS` (`https://msmy.io.vn,https://www.msmy.io.vn`) or `DEFAULT_DEV_LEAD_ORIGINS` (`http://localhost:8005`), trimmed `LEAD_ORG_ID` consistently, and hardened the `docs/production-release-runbook.md` preflight gate.
2. Replaced check-then-act `SELECT` queries in `apps/server/src/routes/public-leads.ts` with atomic SQLite `INSERT INTO lead ... SELECT ... WHERE ... RETURNING id` and `UPDATE lead SET ... WHERE ... RETURNING id, submit_count` statements, preserving creator `ip_hash` on dedupe updates and allowing in-place updates at `LEAD_IP_MAX`/`LEAD_DAILY_CAP` boundaries.
3. Added `ACCOUNT_TEACHER_EMAIL_UNVERIFIED` to `packages/api/src/contracts.ts`, enforced `session.emailVerified === true` in `bootstrapMiddleware` (`apps/server/src/app.ts`) when `teacherEmails` is non-empty, blocked cross-origin student sign-ups for allowlisted teacher emails in `packages/auth/src/index.ts`, added resend verification + reload UI in `apps/web/src/components/account-blocked-view.tsx`, and enforced `canAccessFinance` on `/api/leads`, `notifyNewLead`, Sidebar/⌘K, and `/leads` route.

## Decision
Kept `Refs #524` / explicit operator next steps for setting `TEACHER_EMAILS` on GitHub Environment `production` and `LEAD_ORG_ID` on `staging`/`production` after D1 preflight verification.

## Next steps
Open PR into `develop`, run `/ak-review-pr --fix --reply --advice`, post Kongming post-PR assessment on PR and issue #524, apply `ready to ship beta`, merge into `develop`, and watch `develop` CI to green.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
