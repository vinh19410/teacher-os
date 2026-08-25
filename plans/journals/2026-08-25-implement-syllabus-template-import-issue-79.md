# Implement syllabus template import per-class curriculum — issue #79

**Date:** 2026-08-25 · **Branch:** `feat/syllabus-template-import` · **Route:** feature (`/ak:cook --tdd --auto`) · **Mode:** beta + ship

## What changed

- **DB (0009, one commit):** `syllabus` + `class_id` (template discriminator, unique partial index) + `source_template_id` (logical self-FK); copy-anchored position-keyed backfill — every same-org class with a pointer gets a deep copy preserving status/position, template trees reset to `upcoming`, orphan/cross-org pointers untouched.
- **API/server:** `POST /api/classes/:id/import-syllabus` (pre-check 409, size guard 422 at 500 nodes, single `db.batch`, statuses reset, batch-catch re-checks pointer → 409/500); `POST /api/classes/:id/remove-curriculum` (pointer null first, child-first org-scoped deletes, template-pointer → 409); `POST /api/classes` takes `templateId`, class row inserted LAST (FK NO ACTION). `assign-syllabus` deleted. Snapshot echoes `classId`/`sourceTemplateId`.
- **Web:** `/syllabus` = template gallery (in-use badge via provenance join in `classesForSyllabus`); class Giáo trình tab = full editor on the copy + import/remove; `ImportSyllabusModal` replaces assign modal; `AddClassModal` picks template; reducer dead-fixture role kept (assign case deleted only).

## Key decisions / deviations

- **Backfill algorithm rewritten during cook:** the plan sketch's `tmp_module_map` join anchored on `class.syllabus_id`, which crashes on replay after the pointer moves to the copy (map resolves copy modules → insert with NULL syllabus_id). Replaced with copy-anchored `(source_template_id, org)` joins + position-keyed `NOT EXISTS` guards — heals every statement-boundary crash (rehearsal scenario 11b loops all boundaries), helper table dropped. Recorded in plan.md Red Team Review.
- Structural `ALTER ADD COLUMN` replay stays ledger-guarded (SQLite has no IF NOT EXISTS for ADD COLUMN) — same as 0006-0008.

## Verification

- Migration rehearsal: 13 tests (matrix incl. shared template, orphan, cross-org, UUID format, replay).
- `pnpm test` 386+ tests green; `pnpm check-types`, `pnpm build`, `db:generate` parity, biome clean.
- Browser smoke 9/9 on alchemy dev local D1 (ports shifted 8010/8011 around the operator's running stack — reverted): gallery/badge, import reset 0/3 upcoming, 409 duplicate (direct fetch), copy↔template isolation both ways, remove → DB shows template only, create-class-with-template ready tree.
- Snapshot payload 1.3–2.6 KB (≪ 512 KB threshold).
- Cutover: `assign-syllabus` only in the 404-proof test.

## Follow-ups

- Ship beta (merge develop + watch CI); deploy coupling: 0009 + server + web in ONE deploy.
