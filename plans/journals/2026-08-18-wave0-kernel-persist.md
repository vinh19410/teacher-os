---
title: Wave 0 kernel persist
date: 2026-08-18
summary: "Persist class-centric domain kernel to D1 (issue #10, PR #19): 9 org-scoped tables, packages/api Zod, bootstrap middleware, serialized command bus adapter. Review 7.5→9/10 after fix round; 64 tests green."
---

# Wave 0 kernel persist

## What happened

`/ak:vibe --ship --beta --advice` ran the full pipeline for issue #10 (wave 0 of the 9-wave plan `260818-1101-persist-class-centric-domain-kernel`). The in-memory domain (`useReducer(reducer, seedData)`) now has a persisted class-centric kernel:

- **Schema**: 9 org-scoped tables (`organization`, `membership` unique(orgId,userId), person-only `student`, `class` with nullable `syllabusId`, `syllabus`+`syllabus_module`+`syllabus_lesson` with position ordering, `enrollment` unique(classId,studentId), entitlement `session_package` unique(enrollmentId) with NO done/remaining columns). Migration `0001_opposite_loki.sql`; grep-verified zero `pkg_*`/`student_ids`.
- **packages/api**: hand-written Zod contracts + `check-types` in turbo (no `bts.jsonc`/`ci.yml` changes).
- **Server**: `buildApp(deps)` DI composition — cors → bootstrap middleware (first authed request creates empty org named after the user + `teacher` membership; batch insert; re-read earliest-wins on race) → kernel router (13 endpoints, POST-only, `Origin === CORS_ORIGIN` else 403 + JSON content-type else 415, nested `:mid`/`:lid` bound to parent+org, org-scoped UPDATEs). `index.ts` is thin wiring with lazy `getDb`.
- **Web**: `data-provider.tsx` (loading gate returns null until first `GET /api/kernel` settles; kernel writes via a **serialized** command bus: POST → server id → snapshot fetch (1 retry) → apply; refresh double-failure resolves `undefined` so navigation never hits a stale store; 15s `AbortSignal.timeout` on both transports). `data-store.tsx` became a shim so 26 callers stayed untouched. Adapter maps kernel → `MockData` (pkg from newest ACTIVE package, zero-pkg fallback, studentIds from enrollments, recomputed totalLessons). 8 kernel write modals `await dispatch` with `saving` guards + disabled buttons; `add-syllabus-modal` navigates only with the server id. `seedData` remains a test fixture; runtime starts `emptyData`.

Isolation tests (14) run the real handler chain on in-memory libsql D1 applying the real migrations; only the session lookup is a db-backed seam with Better-Auth cookie semantics.

## Decision

- **Serialized bus over parallel writes + seq-skip**: the first review found the seq-skip design could drop a successful write from the UI (write A slow-POST, write B fast-apply, A's refetch skipped, B's POST fails → A invisible until reload). Strict serialization makes stale-snapshot and lost-write interleavings structurally impossible; deferred-promise tests pin the ordering.
- **Bootstrap race**: batch INSERT + re-read `orderBy(createdAt, id)` — earliest org wins; orphan org from a race is harmless (unique(orgId,userId) prevents duplicate memberships).
- **CSRF**: SameSite=None cookies → explicit Origin check on every kernel POST, fail-closed on missing Origin; JSON-only bodies (415 otherwise). Verified against installed hono source that cors() preflight short-circuit doesn't bypass the guard.
- **Deviations from plan** (documented in PR #19): no empty stub repos (dead code until later waves), `app-shell.tsx` untouched (shim suffices), `alchemy dev` live migration apply is a post-merge manual step (CI has no Cloudflare creds; SQL proven via libsql migrator in tests), plan NOT marked completed (waves 1–8 remain).

## Verification

Gates fresh at ship: `pnpm test` (server 14/14, web 50/50 incl. 4 command-bus tests, CI-contract 1/1), `pnpm check-types` 5/5, `pnpm build` 2/2, biome exit 0. Tester subagent: 7/7 acceptance criteria PASS, 0 must-fix. Review: cycle 1 = 7.5/10 (0 Critical, 3 Important: double-submit duplicates, lost-write sequencing, silent refetch → 404 nav); all fixed; cycle 2 = 9/10, nothing blocks merge. Kongming GO at post-plan, post-implementation, post-review checkpoints.

## Next steps

- Post-merge: verify `alchemy dev` applies migration 0001 locally (manual, needs Cloudflare creds).
- Wave 1+ follow-ups: behavioral DOM test for the loading gate; etag/versioning on notes/syllabus edits; check-in overlay before wave 4 persists lessons (`kernel-loaded` will wipe in-session `pkg.done`).
- Watch schema churn: the 9-table kernel should stay immutable through wave 8; changes are a smell the kernel wasn't generalized.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
