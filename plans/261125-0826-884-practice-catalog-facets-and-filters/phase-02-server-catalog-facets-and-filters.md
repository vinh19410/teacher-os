---
phase: 2
title: "Phase 2: Server Catalog Facets and Filters"
status: completed
priority: P1
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Server Catalog Facets and Filters

## Goal

Update `GET /api/student/practice` in `apps/server/src/routes/student-practice.ts` to support opt-in catalog-wide `facets` (`?facets=1` / `?facets=true`), safe nested SQLite JSON1 outer+inner element guards with empty-array fast-path, single combined correlated `EXISTS` (replacing the duplicate valid-part `EXISTS`), strict bounded `page` (`1..100_000`) & raw filter length (`<= 200`), `Cache-Control: no-store` + `Vary: Cookie, x-student-org-id`, and single `db.batch([...])` execution, backed by thorough TDD integration tests.

## Files to Create / Modify

- Modify: `apps/server/src/routes/student-practice.ts` (lines 255–394: `GET /practice` handler and SQL helper functions)
- Modify: `apps/server/src/routes/student-practice.test.ts` (add TDD test suite for catalog facets, multi-page collection stability, empty-string collection exclusion, `part`/`type`/`band` filters, multi-group `groups` JSON, ungrouped `questions` fallback, malformed JSON AND scalar array element safety, multi-part same-part intersection, unknown filter values, raw length & `page` upper-bound 400s, `Cache-Control`/`Vary` headers, and legacy non-`facets` backward compatibility)
- Modify: `apps/server/src/routes/student-practice-library-sync.test.ts` (add test verifying synced library listening/reading tests expose secondary group types like `mcq_many` in facets and filter correctly)

## Tasks & Steps

### Task 2.1 — Write failing TDD server tests for facets and filters (Red phase)
- **Goal:** Pin all server filtering, facet aggregation, JSON1 safety, bounds, header, and backward-compatibility behaviors with failing tests before changing `student-practice.ts`.
- **Target files and symbols:**
  - `apps/server/src/routes/student-practice.test.ts` (new `describe("GET /api/student/practice — facets & part/type/band filters (#884)")`)
  - `apps/server/src/routes/student-practice-library-sync.test.ts` (extend listening sync test assertions with `?facets=1&type=mcq_many&part=s4`)
- **Steps:**
  1. In `apps/server/src/routes/student-practice.test.ts`, add a dedicated `describe` block with its own isolated in-memory DB containing > 12 ready tests (15 reading tests across 2 pages + 4 listening tests) covering:
     - Multiple collections across page 1 and page 2 (`"Cambridge IELTS 18"`, `"Actual Test"`, `"Other sources"`, plus a test with `collection: ""` and `collection: "   "`, a `draft` test with `collection: "Draft Secret Book"`, and an `org-other` test with `collection: "Other Org Book"`).
     - Multiple parts (`p1`, `p2`, `p3`) and bands (`"6.0"`, `"7.0"`, `"7.5"`).
     - Multi-group prompt (`groups` containing `tfng` + `fill_blank`, while `prompt.type = "tfng"`).
     - Legacy ungrouped prompt (`groups = "[]"`, `prompt.type = "sent"`, per-question `questions[1].type = "shortans"`).
     - Malformed root JSON (`groups = "not-json"`, `questions = "{broken"`) AND valid JSON arrays with scalar/non-string-type elements (<!-- Applied Red Team Finding 1 -->: `groups = '["corrupt", {"type": ["nested"]}, {"type": 123}, null, {"type": "tfng"}]'`, `questions = '["bad", {"type": "shortans"}]'`) verifying HTTP `200`, zero `malformed JSON` error, and zero garbage strings leaked into `facets.types`.
     - Multi-part test (`p1` with `type: "tfng", band: "6.0"` and `p2` with `type: "headings", band: "7.5"`) proving same-part intersection (`part=p1&type=headings` MUST NOT match; `part=p2&type=headings&band=7.5` MUST match).
     - Listening alias test (`mcq1` on `s1`, `mcq3` on `s3`, `mcq` on `s2`, `notes` on `s4`): `?facets=1` emits canonical `["mcq", "notes"]` (no duplicate `mcq1`/`mcq3`), and both `?type=mcq` and `?type=mcq1` match all three MCQ tests.
  2. Assert:
     - Response sets `Cache-Control: no-store` and `Vary: Cookie, x-student-org-id` (<!-- Applied Red Team Finding 11 -->).
     - Without `?facets=1`: response has exact keys `["items", "page", "pages", "total"]` (no `facets` key — legacy `.strict()` safety).
     - With `?facets=1` on `page=1`, `page=2`, and with active filters (`collection=...&part=p1&type=fill_blank&band=7.0&q=nonexistent`): `facets` ALWAYS returns the full `(orgId, skill)` catalog collections (excluding `""`, `"   "`, draft, and other orgs), parts (sorted `p1 < p2 < p3`), canonical types, and sorted bands.
     - Filtering `collection` with trimmed value matches cleanly; filtering by secondary group type `fill_blank` and ungrouped per-question type `shortans` returns matching tests.
     - Unknown filter values (`?collection=NoSuchBook`, `?type=unknown_type`, `?part=p9`, `?band=9.0`) return HTTP `200` with `items: [], total: 0` and intact `facets` (not 400).
     - Raw filter params exceeding `PRACTICE_FILTER_MAX_LENGTH` (201 chars, including whitespace-padded strings — <!-- Applied Red Team Finding 9 -->) and invalid/overflow `page` (`page=0`, `page=100001`, `page=999999999999999999999`, `page=1abc` — <!-- Applied Red Team Finding 5 -->) return HTTP `400`.
  3. In `apps/server/src/routes/student-practice-library-sync.test.ts`, add a test querying `/api/student/practice?skill=listening&facets=1&type=mcq_many&part=s4` and asserting `lt-listening-ready` is returned and `facets.types` contains both `"notes"` and `"mcq_many"`, `facets.parts` contains `"s4"`.
- **Success criteria:** New tests fail against unmodified `student-practice.ts` (missing `facets`, missing `type`/`part`/`band` filters, missing headers/bounds).
- **Verify:** `pnpm --filter server test src/routes/student-practice.test.ts src/routes/student-practice-library-sync.test.ts` exits non-zero with assertion failures; exit 0 is a failure in this red phase.

### Task 2.2 — Implement facets and `part`/`type`/`band`/trimmed-`collection` filtering in `apps/server/src/routes/student-practice.ts` (Green phase)
- **Goal:** Implement clean, D1-safe, crash-proof SQLite queries for catalog filtering and opt-in catalog-wide facets in one `db.batch([...])`.
- **Target files and symbols:** `apps/server/src/routes/student-practice.ts` (helper builders `safeJsonArraySql`, `safeJsonArrayLengthSql`, `safeElementTypeSql`, `partMatchesTypeSql`, `parseStringArrayJson`, and `GET /practice` handler).
- **Steps:**
  1. Import `PRACTICE_FILTER_MAX_LENGTH`, `parsePracticePageParam` from `@teacher-os/api/contracts` and `expandPracticeTypeFilter`, `sortPracticeBands`, `sortPracticeParts`, `sortPracticeTypes` from `@teacher-os/api/lib/practice-type-catalog`.
  2. Parse & validate query params in `GET /practice`:
     - Validate raw query params BEFORE trim (<!-- Applied Red Team Finding 9 -->): read `rawCollection`, `rawPart`, `rawType`, `rawBand`, `rawQ`; if any is defined and `raw.length > PRACTICE_FILTER_MAX_LENGTH`, return `invalidParam(c, "invalid <name>")` (HTTP 400).
     - Trim each to `collection`, `part`, `type`, `band`, `q = rawQ.trim().toLowerCase()`.
     - Parse `page` via `parsePracticePageParam(c.req.query("page") ?? "1")` (<!-- Applied Red Team Finding 5 -->); if `null`, return `invalidParam(c, "invalid page")` (HTTP 400).
     - `includeFacets = c.req.query("facets") === "1" || c.req.query("facets") === "true"`.
  3. Build SQLite JSON1 safe helpers (<!-- Applied Red Team Findings 1 & 7 -->):
     - `safeJsonArraySql(col)`: fast-path `CASE WHEN ${col} IN ('', '[]') THEN '[]' WHEN json_valid(${col}) = 1 THEN CASE WHEN json_type(${col}) = 'array' THEN ${col} ELSE '[]' END ELSE '[]' END`.
     - `safeJsonArrayLengthSql(col)`: `CASE WHEN ${col} IN ('', '[]') THEN 0 WHEN json_valid(${col}) = 1 THEN CASE WHEN json_type(${col}) = 'array' THEN json_array_length(${col}) ELSE 0 END ELSE 0 END`.
     - `safeElementTypeSql(alias)`: nested `CASE` preventing SQLite `malformed JSON` on scalar/string elements AND filtering out non-text `$.type` (arrays/numbers/objects):
       `CASE WHEN ${alias}.type = 'object' THEN CASE WHEN json_type(${alias}.value, '$.type') = 'text' THEN trim(json_extract(${alias}.value, '$.type')) END END`.
  4. Build `testHeaderFilters` (`orgId`, `status = 'ready'`, `skill`) and `validPartExists` (`EXISTS` on `assignment_test_part` joined to org-scoped `assignment_prompt`).
     - For `baseFilters` (used by `collectionFacetQuery`): `[...testHeaderFilters, validPartExists]`.
     - For `catalogFilters` (<!-- Applied Red Team Finding 7 -->): start with `[...testHeaderFilters]`, append `collection` (`sql\`trim(coalesce(${assignmentTest.collection}, '')) = ${collection}\``) and `q` (`sql\`instr(lower(${assignmentTest.title}), ${q}) > 0\``), then append **EXACTLY ONE** correlated `EXISTS`:
       - If `part || band || type` is active, build ONE `EXISTS` against `(assignment_test_part, assignment_prompt)` with `part`, `band`, and `type` (using `expandPracticeTypeFilter(skill, type)` + `safeElementTypeSql` on `groups` and fallback on `questions` ONLY when `safeJsonArrayLengthSql(groups) = 0`), **replacing** `validPartExists` rather than running two `EXISTS`.
       - Otherwise append `validPartExists`.
  5. Execute `totalQuery` and `rowsQuery` together with `collectionFacetQuery` and `partFacetQuery` (when `includeFacets` is true) inside **one** `db.batch([...])`:
     - `collectionFacetQuery`: `db.selectDistinct({ collection: sql<string>\`trim(${assignmentTest.collection})\` }).from(assignmentTest).where(and(...baseFilters, sql\`${assignmentTest.collection} IS NOT NULL AND trim(${assignmentTest.collection}) <> ''\`))`.
     - `partFacetQuery`: `db.selectDistinct({ part: assignmentTestPart.part, band: sql<string>\`trim(${assignmentPrompt.band})\`, promptType: sql<string>\`trim(${assignmentPrompt.type})\`, groupTypesJson: sql<string>\`...\`, questionTypesJson: sql<string>\`...\` }).from(assignmentTest).innerJoin(assignmentTestPart, eq(assignmentTestPart.testId, assignmentTest.id)).innerJoin(assignmentPrompt, and(eq(assignmentPrompt.id, assignmentTestPart.promptId), eq(assignmentPrompt.orgId, orgId))).where(and(...testHeaderFilters))` using `safeElementTypeSql` inside `json_group_array(DISTINCT ...)` with `IS NOT NULL AND <> ''` and `CASE WHEN safeJsonArrayLengthSql(groups) = 0 THEN ... ELSE '[]' END`.
  6. Aggregate facets in JS using `localeCompare(..., "en", { sensitivity: "base" })` for `collections`, `sortPracticeParts(skill, ...)` for `parts`, `sortPracticeBands(...)` for `bands`, and `sortPracticeTypes(skill, ...)` for `types`.
  7. Only attach `facets` property on `response` when `includeFacets` is true (omit otherwise).
  8. Always set `c.header("Cache-Control", "no-store")` and `c.header("Vary", "Cookie, x-student-org-id")` before `return c.json(response)` (<!-- Applied Red Team Finding 11 -->).
- **Success criteria:** All server tests (existing + new) pass, zero malformed-JSON errors even on scalar array elements, single correlated `EXISTS`, single `db.batch`, private cache headers set, and `@teacher-os/server` typechecks cleanly.
- **Verify:** `pnpm --filter server test src/routes/student-practice.test.ts src/routes/student-practice-library-sync.test.ts && pnpm --filter server check-types` exits 0 with all tests passing.

## Verification

- `pnpm --filter server test src/routes/student-practice.test.ts src/routes/student-practice-library-sync.test.ts` exits 0
- `pnpm --filter server check-types` exits 0

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
