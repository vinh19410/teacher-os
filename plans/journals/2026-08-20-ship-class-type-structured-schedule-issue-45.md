---
title: "Ship class type + structured schedule (issue #45)"
date: 2026-08-20
summary: "Full-stack add-class rework: type/skills/schedule-object contract, migration 0007 back-compat, ChipMulti modal; 267/267 tests green, commit d6d3932"
---

# Ship class type + structured schedule (issue #45)

## What happened
- Implemented issue #45 end-to-end in worktree `feat/class-type-structured-schedule` (commit `d6d3932`, 26 files +2665/−123): class type (`ielts`|`communication`) + multi-skill + structured schedule `{days,start,end}` across zod contracts, DB migration 0007, server POST/snapshot, web display, and the AddClassModal rework (generic `ChipMulti<T>`, end=start+90min with `endTouched`, Vietnamese validation).
- Migration 0007 is hand-written (drizzle-kit generate needs an interactive rename prompt, unusable headless): ALTER ADD `type` → RENAME `skill`→`skills` → ordered back-compat UPDATEs (wrap `json_array` BEFORE blanket `'[]'`, guard `<> ''`), plus a hand-built `meta/0007_snapshot.json`. Verified two ways: `drizzle-kit generate` now reports "No schema changes, nothing to migrate", and a seeded legacy-data run shows `''`→`'[]'` (no `'["[]"]'` corruption), `'Giao tiếp'`→communication, sanity check 0 rows.
- One test written wrong first: asserting `[3,1,3]` days deduped through the API — but zod's unique-refine correctly rejects duplicates with 400, so server-side dedupe is defense-in-depth, not observable. Rewrote the test to assert sorting of valid unsorted `[3,1]`→`[1,3]`.

## Decision
- Wire change is intentionally breaking (`skill`/free-text schedule removed): stale bundles get 400 on create until server+web redeploy together — accepted pre-pilot; stop server → migrate 0007 → deploy both (RENAME COLUMN breaks old running server).
- Invariant enforced at the server (`superRefine`: IELTS≥1 skill, communication=0 skills), modal validation is UX only; overnight `end<=start` is valid.
- Review (9/10, 0 critical) surfaced 3 warnings, all fixed: chip deselect asymmetry, empty-time client validation, duplicated TIME_REGEX (now exported from contracts and shared).

## Next steps
- Ship beta PR (ak:ship beta), review/fix, merge, watch CI.
- Manual browser UAT on dev server (Phase 3 step 9) still pending — create one IELTS multi-skill class + one Giao tiếp class, check list/detail.
- Open question from plan: hide "Trình độ" (Band) field for communication classes? Currently kept per scope.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
