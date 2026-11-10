---
title: "Audit tooling lesson_material mồ côi #663"
date: 2026-11-10
summary: "Module packages/db/src/audit/orphan-materials.ts (audit SQL status-aware, chain resolve, cleanup plan single-use, D1 REST fail-closed) + CLI scripts/audit-663-orphan-materials.ts (--file/--d1, --apply confirm+dump) + workflow read-only audit-663.yml có test gate trong ci-workflow.test.mjs. Plan 261110-0949 qua red-team 3 reviewer (20 findings, 19 accept) + kongming 2 round; code review 2x APPROVE; 29/29 db tests, ci-workflow 9/9. Cleanup prod là quyết định owner sau audit."
---

# Audit tooling lesson_material mồ côi #663

Module packages/db/src/audit/orphan-materials.ts (audit SQL status-aware, chain resolve, cleanup plan single-use, D1 REST fail-closed) + CLI scripts/audit-663-orphan-materials.ts (--file/--d1, --apply confirm+dump) + workflow read-only audit-663.yml có test gate trong ci-workflow.test.mjs. Plan 261110-0949 qua red-team 3 reviewer (20 findings, 19 accept) + kongming 2 round; code review 2x APPROVE; 29/29 db tests, ci-workflow 9/9. Cleanup prod là quyết định owner sau audit.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
