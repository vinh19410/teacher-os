---
title: Production readiness roadmap planned
date: 2026-08-19
summary: Created reviewed P0 readiness roadmap and GitHub issue breakdown
---

# Production readiness roadmap planned

## What happened

Created and hard-mode reviewed the Production readiness roadmap. Scope is P0 pre-pilot only: app/API subdomain topology, isolated staging D1, recovery drill, schema-aware readiness, snapshot/mutation fail-safe UI, and live UAT evidence.

## Decisions

- Topology: app.<domain> + api.<domain>; test cross-subdomain cookie in Chrome and Safari.
- Staging: create isolated D1 before any migration/recovery drill.
- UAT owner/account: user supplies out of band; never write credentials to repository or issues.
- Do not add E2E automation, CI/CD deploy, rate limiting, audit trail, or product features to this milestone.

## Evidence

- Plan: plans/260819-2034-production-readiness/plan.md
- GitHub parent: #28; child issues: #34, #29, #31, #33, #32, #30.
- Validation: ak plan validate passed.

## Next steps

Start Phase 1. Do not launch pilot until Phase 6 records a complete GO decision.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
