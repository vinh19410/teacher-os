---
title: "Phase 1: TDD fix for GET /api/admin/library/tests"
status: done
---

# Phase 1: TDD fix for `GET /api/admin/library/tests`

<!-- Updated: Red-Team & Validation Session 1 - batch snapshot, .mapWith(Number).as(...), q length cap & LIKE escape, drop redundant json_type, explicit header columns, router.onError, strict isolated TDD suite -->

## Overview

Fix HTTP 500 on `GET /api/admin/library/tests` by replacing the unbounded `inArray` + full-row `SELECT *` on `library_test_part` with a single `db.batch([headerQuery, partSummaryQuery])` snapshot projecting only lightweight scalar metadata (`testId`, `part`, `hasAudio`, `questionCount`), capping & escaping `?q=`, guarding timestamp serialization across `admin-library.ts`, and adding structured `router.onError` logging.

## Target Files

- `apps/server/src/routes/admin-library.ts`
- `apps/server/src/routes/admin-library.test.ts`

## Requirements

- [ ] Bound SQL parameters per statement in `GET /api/admin/library/tests` stay `0` (unfiltered) and `<= 6` (filtered), well below D1's 100-param cap even with `> 100` tests.
- [ ] Header query and part-summary query run in a single `withDb().batch([headerQuery, partSummaryQuery])` call (1 D1 round-trip, single consistent snapshot, zero TOCTOU skew).
- [ ] Header query projects only the 10 `headerFields` columns (omitting unused `createdBy`).
- [ ] `library_test_part` query projects only `testId`, `part`, `hasAudio` (`.mapWith(Number).as("has_audio")`), and `questionCount` (`CASE WHEN json_valid(...) = 1 THEN COALESCE(json_array_length(...), 0) ELSE 0 END` with `.mapWith(Number).as("question_count")`), never fetching `passage`, `transcript`, raw `questions`, `groups`, `option_bank`, `image_url`, `intro`, `note`, or `source`.
- [x] `?q=` caps length at `<= 200` (returning `400 { error: "invalid query" }`) and uses `instr(lower(...), lower(?)) > 0` (avoiding Cloudflare D1's 50-byte `LIKE` limit while matching `\`, `%`, `_` literally).
- [x] Invalid/null `Date` values on `headerFields`, `toPartDto`, and `toLibraryExerciseView` do not throw `RangeError`/`TypeError`; `audioUploadedAt === null` or invalid returns `""` (never epoch 1970).
- [x] `router.onError` logs structured error metadata (`method`, `path`, sanitized `message`, `cause`) without leaking bound SQL params, stack traces, or secrets and returns JSON `500 { error: "internal server error" }`.

## TDD Test Matrix

| Test case | Expected before fix | Expected after fix |
|---|---|---|
| 125 `library_test` rows + parts under a D1 100-param guard on `execute` & `batch` (activated after seed, isolated `describe`) | 500 (`D1_ERROR: too many SQL variables`) | 200 with all 125 tests passing `libraryTestListItemSchema.parse`, `maxParams === 0`, total statements `<= 2` |
| Filtered `GET /tests?skill=reading&status=ready&q=BatchTest` matching `> 100` tests | 500 (`D1_ERROR: too many SQL variables`) | 200 with exact match count, `maxParams <= 6` |
| SQL inspection on `library_test_part` query (`observedPartQueries.length >= 1`) | Selects `passage`, `transcript`, `groups`, `option_bank`, raw `questions` | No `SELECT *`, no heavy columns, `questions` only inside `json_valid`/`json_array_length` |
| `?q=` > 200 chars & `?q=` containing `%`/`_` & `?q=` matching `library_test_part.title` only | 500 (at 50k chars) / wildcard overmatch | 400 for `> 200`, exact literal match for `%`/`_`, excludes tests whose part title matches but header does not |
| Mixed valid part + corrupt `questions` (`"{bad"`, `"[1,2,]"`, `"{}"`, `"null"`, `"123"`, `""`) on same test | 200 | 200 with exact valid sum, no SQLite JSON error |
| Listening all-4-audio vs partial vs reading 0 parts vs unknown `skill = 'writing'` | `true`/`false`/`true`/`false` | Identical |
| Raw SQL corrupt timestamps (`'not-a-date'` / `8640000000000001`) on `library_test.updated_at` (`GET /tests`) and `library_test_part.updated_at` / `audio_uploaded_at` (`GET /tests/:id`) | 500 (`RangeError`) | 200 with epoch ISO fallback for `createdAt`/`updatedAt` and `""` for invalid/null `audioUploadedAt` |

## Implementation Steps

1. **Red (TDD):** Add isolated `describe("GET /api/admin/library/tests D1 limits & resilience", ...)` in `apps/server/src/routes/admin-library.test.ts` with the test matrix above. Run `pnpm --filter server exec vitest run src/routes/admin-library.test.ts` and verify the D1 100-param guard, SQL projection, `?q=` cap/escape, and corrupt timestamp tests fail before the fix.
2. **Green:** Update `apps/server/src/routes/admin-library.ts`:
   - Replace `inArray` with `sql` in `drizzle-orm` import.
   - Add `formatTimestamp` / `formatOptionalTimestamp` helpers and use them in `headerFields`, `toPartDto`, and `toLibraryExerciseView`.
   - Add `router.onError` structured logging.
   - Update `GET /tests` with `?q=` cap (`<= 200`) + `ESCAPE '\\'`, explicit 10-column `libraryTest` header selection, and `withDb().batch([headerQuery, partSummaryQuery])` using `innerJoin` + `.mapWith(Number).as(...)` + `json_valid`/`COALESCE(json_array_length(...), 0)`.
3. **Verify:**
   - Run `pnpm --filter server exec vitest run src/routes/admin-library.test.ts src/routes/admin-library-audio.test.ts`
   - Run `pnpm check-types`
   - Run `pnpm exec biome check .`

## Risk & Rollback

- **Risk:** SQLite JSON1 function behavior on D1 vs libsql.
  - *Mitigation:* Verified empirically on SQLite 3.45.1 (`@libsql/client`): `json_valid(X)` returns `1` only for strict RFC-8259 JSON, and `json_array_length(X)` returns `0` for non-array valid JSON (`{}`, `null`, `123`, `"str"`, `true`). D1 runs SQLite 3.45+ and already uses `json_each` in `/readyz`.
- **Rollback:** Revert the single commit on `apps/server/src/routes/admin-library.ts` (zero schema/migration impact).

## Todo

- [ ] Add failing TDD tests in `apps/server/src/routes/admin-library.test.ts`
- [ ] Implement batch query + SQL projection + `?q=` cap/escape + timestamp guards + `router.onError` in `apps/server/src/routes/admin-library.ts`
- [ ] Run server tests, typecheck, and biome lint check

## Success Criteria

All tests in `admin-library.test.ts` and `admin-library-audio.test.ts` pass, `pnpm check-types` and `pnpm exec biome check .` exit 0, and `GET /api/admin/library/tests` stays within `<= 6` bound params in 1 batch snapshot for `125+` tests.
