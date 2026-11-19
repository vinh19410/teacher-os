---
title: "Fix HTTP 500 on GET /api/admin/library/tests under Cloudflare D1 limits"
description: "Replace unbounded inArray and full-row SELECT * on library_test_part in GET /api/admin/library/tests with bounded-parameter innerJoin + SQL projection, plus defensive timestamp formatting."
status: completed
priority: P1
effort: "S"
tags: [bugfix, server, admin-library, d1]
created: 2026-11-19
---

# Fix HTTP 500 on `GET /api/admin/library/tests`

## Overview

`GET https://api.staging.teacheros.io.vn/api/admin/library/tests` returns HTTP 500 on staging while `/readyz` returns `200 {"ok":true}` and unauthenticated requests return `401 {"error":"unauthorized"}`.

### Root Cause (Proven)

1. **Cloudflare D1 100 bound-parameter cap (`D1_ERROR: too many SQL variables`):** `apps/server/src/routes/admin-library.ts:449` executes `inArray(libraryTestPart.testId, rows.map((row) => row.id))` without chunking or joining. Because `apps/admin` (`listLibraryTests()`) always calls `GET /api/admin/library/tests` unfiltered, once `library_test` exceeds 100 rows D1 rejects the query and Hono returns HTTP 500.
2. **Unbounded `SELECT * FROM library_test_part` payload & CPU overhead:** `admin-library.ts:446` selects all 21 columns (`passage`, `transcript`, `questions`, `groups`, `optionBank`, `note`, `imageUrl`, etc.) for every part of every test and runs `JSON.parse(part.questions)` in JavaScript, even though `GET /tests` only needs `testId`, `part`, audio presence, and `questionCount`. Large IELTS test banks can exceed D1 response size or Worker memory/CPU limits.
3. **Unchecked `.toISOString()` on DB timestamps:** `headerFields` / `toPartDto` call `.toISOString()` directly; any malformed timestamp row from out-of-band imports throws `RangeError`/`TypeError` (HTTP 500).

## Outcome & Scope

- **Desired outcome:** `GET /api/admin/library/tests` succeeds with HTTP 200 regardless of test count (> 100, > 1,000) and large part payloads, using constant `<= 6` bound parameters and minimal SQL-projected part metadata.
- **Constraints:** Preserve the exact `LibraryTestListItem` wire contract (`packages/api/src/library-contracts.ts`), sort order (`updatedAt desc`), filter semantics (`skill`, `status`, `q`), and fail-soft handling of corrupt `questions` JSON (`0` instead of 500). No DB schema migration required.
- **Non-goals:** Changing `apps/admin` UI/API contract, adding server-side pagination, or refactoring unrelated routes (e.g. `student-practice.ts` — noted as follow-up).

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Eliminate unbounded `inArray` in `GET /api/admin/library/tests` so bound parameter count stays `<= 6` (well under D1's 100-param cap) | P1 |
| 2 | Project only `{ testId, part, hasAudio, questionCount }` via SQL (`json_valid`/`json_type`/`json_array_length`) so heavy text columns never cross D1→Worker on list requests | P1 |
| 3 | Guard timestamp formatting in `admin-library.ts` against invalid/null dates | P2 |
| 4 | Add TDD regression tests enforcing D1's 100-parameter cap, column projection, corrupt JSON/timestamps, and filter behavior | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: TDD fix for `GET /api/admin/library/tests`](./phase-01-start.md) | Pending |

## Success Criteria

- [x] Regression test with `> 100` tests (125 tests) and a strict D1 100-parameter DB guard (covering both `execute` and `batch`) fails before the fix and passes after the fix.
- [x] `GET /api/admin/library/tests` runs in a single `db.batch([headerQuery, partSummaryQuery])` snapshot (no TOCTOU skew), with `0` bound params unfiltered and `<= 6` filtered, and does not select heavy columns (`passage`, `transcript`, `groups`, `option_bank`, `image_url`, `intro`, `note`, `source`) or raw `questions`.
- [x] `?q=` caps length at `<= 200` (returning `400` above cap) and uses `instr(lower(...), lower(?)) > 0` (avoiding Cloudflare D1's 50-byte `LIKE` pattern cap while matching `%`, `_`, `\` literally).
- [x] `GET /api/admin/library/tests` returns exact `partCount`, `questionCount` (via `json_valid` + `COALESCE(json_array_length(...), 0)` with `.mapWith(Number).as(...)`, handling malformed/non-array `questions` JSON as `0`), and `hasAllAudio` for reading/listening/unknown skills, passing `libraryTestListItemSchema.parse` (`.strict()`).
- [x] Invalid timestamp rows degrade safely via `formatTimestamp` (while preserving `audioUploadedAt === null → ""`) across `headerFields`, `toPartDto`, and `toLibraryExerciseView` instead of throwing 500.
- [x] Structured `router.onError` logs `method`, `path`, sanitized `message`, and `error.cause` without leaking bound SQL params, stack traces, or secrets.
- [x] `pnpm --filter server exec vitest run src/routes/admin-library.test.ts src/routes/admin-library-audio.test.ts`, `pnpm check-types`, and `pnpm exec biome check .` all pass.

## Red Team Review & Validation Log

- **Reviewers:** 2 independent fresh-context `code-reviewer` subagents (Security Adversary + Assumption Destroyer).
- **Verification Results:** Failed: 0. All accepted findings propagated to `phase-01-start.md`:
  1. **[Critical — Accept (modified)] Staging observability:** No Cloudflare credentials exist in VM; add structured `router.onError` logging in `adminLibraryRoutes` (without leaking stack/secrets) and include post-deploy staging verification of `GET /api/admin/me` + `GET /api/admin/library/tests` in Human Next Steps.
  2. **[High — Accept] `?q=` DoS/500 & wildcard escape:** Cap `q.length <= 200` (400) and escape `[\\%_]` with `ESCAPE '\\'` (matching `apps/server/src/routes/leads.ts:126-132`).
  3. **[High — Accept] TOCTOU read skew:** Combine header query + part-summary query in `withDb().batch([...])` for single-snapshot consistency and 1 D1 round-trip.
  4. **[High — Accept] SQL typing & JSON parse cost:** Use `.mapWith(Number).as("has_audio")` / `.mapWith(Number).as("question_count")`, drop redundant `json_type` (verified on SQLite 3.45.1: `json_array_length` returns `0` for non-array valid JSON), add `COALESCE(..., 0)`, and explicitly project the 10 header columns on `library_test`.
  5. **[Medium — Accept] Timestamp edge cases:** Keep `audioUploadedAt === null` and invalid `audioUploadedAt` returning `""`; apply `formatTimestamp` to `headerFields`, `toPartDto`, and `toLibraryExerciseView`.
  6. **[Medium — Accept] Strict TDD test design:** Isolated `describe` block with own in-memory DB, guard enabled after seed on both `execute` and `batch`, assert `<= 6` params, `<= 2` statements, no `SELECT *`/heavy columns, filtered `> 100` rows, raw SQL corrupt timestamps & mixed corrupt/valid `questions`, and strict `libraryTestListItemSchema` validation.

<!-- slug: fix-admin-library-tests-500 -->
