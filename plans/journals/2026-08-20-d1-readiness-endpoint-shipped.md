---
title: D1 readiness endpoint shipped
date: 2026-08-20
summary: Schema-aware /readyz probe shipped to develop via PR #37 (issue #31, phase 3)
---

# D1 readiness endpoint shipped

## What happened

Shipped phase 3 of the production-readiness plan: `/readyz` on the API worker proves the Worker plus the full required D1 schema with one catalog query. Beta pipeline (`/ak:vibe --ship --beta --advice`): plan reuse + fresh red-team → TDD implementation → tester/code-review cycles → PR #37 → review-pr fix/reply → merge into develop → CI green on the merge commit.

## Decisions

- Required objects are **derived from the Drizzle schema barrel** (19 tables + 28 named indexes = 47 objects), not hardcoded — future schema additions automatically join the readiness contract; an import-time guard fails loudly if derivation ever yields zero.
- Probe counts `sqlite_master WHERE type IN ('table','index')` — the index half came from a code-review catch: migration 0006 adds no table (unique index + column only), so a tables-only count would answer a false 200 on a database stuck before 0006. Regression test drops that exact index with all tables present and asserts 503.
- Response contract: `200 {"ok":true}` / `503 {"ok":false}` byte-identical across every failure mode, `cache-control: no-store`; all exceptions map to the generic 503; the cause is logged server-side only.
- Mounted outside `/api/*` so bootstrap middleware and Better Auth never run; `GET /` stays plain liveness. HEAD rejected (no consumer at pilot scale).
- Accepted risks documented: unauthenticated probe costs one catalog query per request (no rate-limit at pilot scale); two auto-named column-level uniques from migration 0000 stay outside derivation (cannot half-apply without their tables).

## Evidence

- Plan: plans/260819-2034-production-readiness/phase-03-add-database-readiness-endpoint.md (completed)
- Issue #31 closed by PR #37 (merge commit ac883457, develop CI green)
- Gates: pnpm test (server 60/60 incl. 7 readiness tests), check-types, biome, build — exit 0 on tree merged with latest develop
- Reviews: tester PASS; code-reviewer REQUEST_CHANGES → fix → APPROVE; kongming checkpoints GO (one false-premise NO-GO fact-checked and corrected)
- Runbook: post-deploy readiness smoke + liveness/readiness triage split

## Next steps

- Phase 4 (#33, fail-safe first snapshot), phase 5 (#32, truthful mutation UI), then phase 6 (#30, live UAT + GO/NO-GO evidence).
- Next deploy window: run `curl -sS -i https://api.<domain>/readyz` per the runbook and record sanitized evidence; watch cold starts briefly (import-time guard is loud by design).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
