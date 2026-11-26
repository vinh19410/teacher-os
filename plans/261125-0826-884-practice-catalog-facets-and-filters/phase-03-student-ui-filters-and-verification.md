---
phase: 3
title: "Phase 3: Student UI Filters, A11y, and Verification"
status: completed
priority: P1
effort: "1.5h"
dependencies: [1, 2]
---

# Phase 3: Student UI Filters, A11y, and Verification

## Goal

Wire full catalog-wide facets and URL-synced `collection`, `part`, `type`, `band`, and `q` filters into `apps/student` with TanStack Router numeric-coercion handling, clean URL omission (`page <= 1` and empty strings omitted), skill-scoped `placeholderData` (preventing dropdown unmount flicker), race-free debounce/reset/skill-switch handling, canonical `typeValue`, conditional `Band` visibility, distinct filtered empty state, `aria-live="polite"`, full page auto-clamp (including `total === 0`), responsive 4-viewport + Light/Dark styling, and complete unit + isolated-org E2E + POT verification.

## Files to Create / Modify

- Modify: `apps/student/src/lib/repos/student.ts` (lines 703–750: `fetchPracticeCatalog`, `usePracticeCatalog` with `facets=1` and skill-scoped `placeholderData`)
- Modify: `apps/student/src/routes/_auth/practice/$skill.tsx` (lines 21–141: export `parsePracticeSearch` for `validateSearch` handling TanStack Router numeric coercion & `PRACTICE_FILTER_MAX_LENGTH` & `page > 1`, update `handleFilterChange`, pass `part`/`type`/`band` to `SkillCatalog`)
- Modify: `apps/student/src/components/practice/practice-filters.tsx` (support `{ value, label }` options in `PracticeSelect` with `max-w-full min-w-0` on both `<label>` and `<select>`, add `part`/`type`/`band` selects with conditional visibility, `onSearchRef`, `resetSignal`, `maxLength={PRACTICE_FILTER_MAX_LENGTH}`, `"Xóa bộ lọc"` button clearing `draft` synchronously)
- Modify: `apps/student/src/components/practice/skill-catalog.tsx` (compute `canonicalType` once and pass `typeValue={canonicalType}`, read options from `catalog?.facets` with blank-stripped deploy-skew fallback, mount `<PracticeFilters key={skill} resetSignal={resetVersion} ... />`, distinct filtered empty state with `"Xóa bộ lọc"`, `aria-live="polite"` on total counter, full auto-clamp guarded by `!catalogQuery.isPlaceholderData && catalog.page === page && page > catalog.pages`)
- Modify: `apps/student/src/components/practice/practice-catalog.test.tsx` (TDD unit tests for catalog-wide facets, conditional visibility, `parsePracticeSearch` numeric coercion `{ band: 6, q: 18, page: 1 }`, stale `onSearch` closure + empty-state `"Xóa bộ lọc"` + skill tab switch debounce safety, `?type=mcq1` canonical selection, deploy-skew empty collection strip, filtered vs unpopulated empty state, `aria-live="polite"`, and page auto-clamp including `total === 0`)
- Modify: `apps/e2e/specs/student-practice.spec.ts` (add isolated `test.describe` with its own `seedQuizFixture` seeding 13 reading tests across 2 pages to verify page 1 vs page 2 "Bộ đề" parity, "Phần thi" + "Dạng bài" filtering, URL reload persistence, clean URL on "Xóa bộ lọc", 4-viewport Light/Dark no-overflow checks, keyboard Tab focus, and POT screenshots)

## Tasks & Steps

### Task 3.1 — Write failing TDD student component & URL parser tests (Red phase)
- **Goal:** Specify every UI filter, facet, URL coercion, debounce-race, empty-state, a11y, and page-clamp behavior in `apps/student/src/components/practice/practice-catalog.test.tsx` before editing components.
- **Target files and symbols:** `apps/student/src/components/practice/practice-catalog.test.tsx`
- **Steps:**
  1. Add tests covering:
     - `parsePracticeSearch` (<!-- Applied Red Team Findings 2, 4, 5, 9 -->):
       - `{ band: 6, q: 18, collection: 2025, page: 1 }` → `{ band: "6.0", q: "18", collection: "2025", page: undefined }` (coerces TanStack Router's `JSON.parse` numbers, preserves `.0` on integer band, omits `page: 1`).
       - `{ band: 6.5, page: "2" }` → `{ band: "6.5", page: 2 }`.
       - `{ page: 100001 }` or `{ page: "999999999999999999999" }` or `{ page: 0 }` → `page: undefined`.
       - Strings longer than `PRACTICE_FILTER_MAX_LENGTH` (`200`) are truncated to 200 chars; blank strings become `undefined`.
     - `SkillCatalog` catalog-wide facets & canonicalization (<!-- Applied Red Team Finding 11 -->):
       - Renders ALL collections from `data.facets.collections` even when `data.items` on page 2 only contains 1 collection.
       - Deploy-skew fallback (when `data.facets` is omitted) ignores `collection: ""` and `"   "` so no duplicate empty `<option>` appears.
       - Passing legacy alias `type="mcq1"` on `skill="listening"` with `facets.types = ["mcq", "notes"]` selects `<select>` value `"mcq"` (`"Multiple choice (One answer)"`).
       - Renders `"Phần thi"` and `"Dạng bài"` when `>= 2` options (or active), hides `"Band"` when `facets.bands` has `< 2` values (`["7.0"]`) and `band=""`, and renders `"Band"` when `facets.bands.length >= 2` OR `band="6.0"`.
     - Debounce / reset / skill-switch race tests (<!-- Applied Red Team Finding 3 -->):
       - Typing in search input (`t=0`), then changing `part` at `t=100ms` (re-rendering `SkillCatalog` with new `part="p2"`), then advancing 200ms calls `onFilterChange` with BOTH `part: "p2"` AND the typed `q` (no stale closure clobbering `part`).
       - Clicking `"Xóa bộ lọc"` in filter bar OR clicking `"Xóa bộ lọc"` inside filtered empty state synchronously clears search input and does NOT re-emit `q` after 300ms.
       - Typing in search input on `skill="reading"` and switching prop to `skill="listening"` within 100ms cancels the old timer and clears input (no cross-skill navigation).
     - Filtered empty state vs unpopulated empty state:
       - `items: []` with active filter renders `"Không tìm thấy đề phù hợp với bộ lọc hiện tại."` + `"Xóa bộ lọc"`.
     - A11y & Auto-clamp (<!-- Applied Red Team Finding 10 -->):
       - Total counter `<p>` has `aria-live="polite"`.
       - `page=5, data.pages=2, data.total=14` (with `isPlaceholderData: false`) calls `onFilterChange(..., { page: 2 }, { replace: true })`.
       - `page=5, data.pages=1, data.total=0` (with `isPlaceholderData: false`) ALSO clamps to `page: 1` (`replace: true`) so `"0 đề — trang 5 / 1"` never sticks.
       - When `isPlaceholderData: true`, auto-clamp does NOT fire.
     - `PracticeSelect` accepts `{ value, label }` options and sets `max-w-full min-w-0` on `<label>` and `<select>`, while `<Input>` has `maxLength={200}`.
- **Success criteria:** New tests fail against unmodified student components.
- **Verify:** `pnpm --filter student test src/components/practice/practice-catalog.test.tsx` exits non-zero with assertion/import failures; exit 0 is a failure in this red phase.

### Task 3.2 — Update student repo hook and route search params
- **Goal:** Send `collection`, `part`, `type`, `band`, `q`, `page`, and `facets=1` to `GET /api/student/practice`, keep `placeholderData` scoped by `skill`, and parse/serialize clean URL search params safely.
- **Target files and symbols:**
  - `apps/student/src/lib/repos/student.ts` (`fetchPracticeCatalog`, `usePracticeCatalog`)
  - `apps/student/src/routes/_auth/practice/$skill.tsx` (`parsePracticeSearch`, `Route.validateSearch`, `PracticeSkillPage`, `handleFilterChange`)
- **Steps:**
  1. In `apps/student/src/lib/repos/student.ts`:
     - Extend `fetchPracticeCatalog` and `usePracticeCatalog` filter type with optional `part?: string`, `type?: string`, `band?: string`.
     - Always set `params.set("facets", "1")` in `fetchPracticeCatalog`, and set `part`, `type`, `band` when non-empty.
     - Include `filters.part ?? ""`, `filters.type ?? ""`, `filters.band ?? ""` in `usePracticeCatalog`'s `queryKey`.
     - Add skill-scoped `placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[2] === filters.skill ? prev : undefined)` (<!-- Applied Red Team Finding 6 -->) so dropdown facets stay mounted without flicker during pagination/filter/search fetches while never leaking across skills.
  2. In `apps/student/src/routes/_auth/practice/$skill.tsx`:
     - Export `parsePracticeSearch(search: Record<string, unknown>)` used by `Route.validateSearch` (<!-- Applied Red Team Findings 2, 4, 5, 9 -->):
       - Helper `parseStringParam(raw)`: accepts `string` or finite `number` (`String(raw)`), trims, slices to `PRACTICE_FILTER_MAX_LENGTH`, returns `undefined` if empty.
       - Helper `parseBandParam(raw)`: if `typeof raw === "number" && Number.isFinite(raw)`, formats `Number.isInteger(raw) ? raw.toFixed(1) : String(raw)`; otherwise uses `parseStringParam(raw)`.
       - `page`: only parse when `search.page !== undefined` via `parsePracticePageParam(toRawPageString(search.page))`; return `parsed && parsed > 1 ? parsed : undefined` (never re-inject `?page=1`).
     - Update `handleFilterChange` to accept `(next: PracticeFilterState, options?: { replace?: boolean })`, navigating with `replace: options?.replace` and omitting empty strings and `page <= 1`.
     - Pass `part={search.part ?? ""}`, `type={search.type ?? ""}`, `band={search.band ?? ""}` into `<SkillCatalog />`.
- **Success criteria:** URL cleanly reflects active filters, numeric query params survive TanStack Router's `JSON.parse`, and `usePracticeCatalog` preserves facets smoothly within the same skill.
- **Verify:** No verification needed yet (verified together with Task 3.3).

### Task 3.3 — Upgrade `PracticeFilters` and `SkillCatalog` components (Green phase)
- **Goal:** Render catalog-wide dropdowns, conditional visibility, race-free debounce/reset/skill-switch handling, distinct empty state, `aria-live="polite"`, and full page auto-clamp, passing all student unit tests and typechecks.
- **Target files and symbols:**
  - `apps/student/src/components/practice/practice-filters.tsx` (`PracticeSelect`, `PracticeSelectOption`, `PracticeFilters`)
  - `apps/student/src/components/practice/skill-catalog.tsx` (`SkillCatalog`, `PracticeFilterState`)
- **Steps:**
  1. In `apps/student/src/components/practice/practice-filters.tsx`:
     - Allow `PracticeSelect` `options` to be `readonly (string | PracticeSelectOption)[]` where `PracticeSelectOption = { value: string; label: string }`. Add `min-w-0 max-w-full` on BOTH `<label className="inline-flex min-w-0 max-w-full">` AND `<select className="select-chevron h-9 min-w-0 max-w-full truncate ...">` (<!-- Applied Red Team Finding 11 -->), keeping `focus-visible:ring-[3px] focus-visible:ring-ring/50`.
     - Extend `PracticeFilters` props with optional:
       - `parts?: readonly PracticeSelectOption[]`, `partValue?: string`, `onPartChange?: (value: string) => void`
       - `types?: readonly PracticeSelectOption[]`, `typeValue?: string`, `onTypeChange?: (value: string) => void`
       - `bands?: readonly PracticeSelectOption[]`, `bandValue?: string`, `onBandChange?: (value: string) => void`
       - `hasActiveFilters?: boolean`, `onReset?: () => void`, `resetSignal?: number`
     - Implement race-free debounce (<!-- Applied Red Team Finding 3 -->):
       - Maintain `onSearchRef.current = onSearch` every render and call `onSearchRef.current(trimmed)` inside `setTimeout`.
       - Maintain `lastEmittedRef` initialized to `qValue`, updated when `qValue` changes externally or when `resetSignal` increments or when emitting/resetting.
       - When `resetSignal` changes (or clicking `"Xóa bộ lọc"`), synchronously set `draft = ""` and `lastEmittedRef.current = ""` so pending debounce timers are canceled by cleanup and never resurrect `q`.
     - Set `maxLength={PRACTICE_FILTER_MAX_LENGTH}` on `<Input>` (<!-- Applied Red Team Finding 9 -->).
     - Render selects only when provided and non-empty (`"Bộ đề"`, `"Phần thi"`, `"Dạng bài"`, `"Band"`); render `"Xóa bộ lọc"` (`Button variant="outline" size="sm"`) when `hasActiveFilters && onReset`.
     - Ensure container wraps cleanly (`flex flex-wrap items-center gap-2`) and search wrapper uses `relative min-w-[200px] max-w-full flex-1` so 320px/375px viewports have 0px horizontal overflow.
  2. In `apps/student/src/components/practice/skill-catalog.tsx`:
     - Export `PracticeFilterState = { collection: string; part: string; type: string; band: string; q: string; page: number }`.
     - Accept `part = ""`, `type = ""`, `band = ""` props and `onFilterChange: (next: PracticeFilterState, options?: { replace?: boolean }) => void`.
     - Compute `const canonicalType = canonicalizePracticeType(skill, type);` once and use `canonicalType` consistently for `usePracticeCatalog`, `typeOptions`, `typeValue`, `hasActiveFilters`, and all `onFilterChange` callbacks (<!-- Applied Red Team Finding 11 -->).
     - Maintain `resetVersion` state (`useState(0)`) and unified `handleReset = () => { setResetVersion((v) => v + 1); onFilterChange({ collection: "", part: "", type: "", band: "", q: "", page: 1 }); }` passed to BOTH `<PracticeFilters key={skill} resetSignal={resetVersion} onReset={handleReset} ... />` AND the filtered empty-state button (<!-- Applied Red Team Finding 3 -->).
     - Build option lists from `catalog?.facets` (with safe deploy-skew fallback when `catalog && !catalog.facets` stripping blank `collection` via `.map((i) => i.collection?.trim() ?? "").filter(Boolean)` — <!-- Applied Red Team Finding 11 -->):
       - `collectionOptions`: show when `collections.length > 0 || Boolean(collection)` (append active `collection` if absent from facets).
       - `partOptions`: show when `parts.length >= 2 || Boolean(part)`, mapped via `practicePartLabel(skill, id)`.
       - `typeOptions`: show when `types.length >= 2 || Boolean(canonicalType)`, mapped via `practiceTypeLabel(skill, id)`.
       - `bandOptions`: show when `bands.length >= 2 || Boolean(band)`, mapped as `{ value: b, label: \`Band ${b}\` }`.
     - Auto-clamp effect (<!-- Applied Red Team Finding 10 -->): store `onFilterChangeRef.current = onFilterChange`; when `!catalogQuery.isPlaceholderData && catalog && catalog.page === page && page > catalog.pages`, call `onFilterChangeRef.current({ collection, part, type: canonicalType, band, q, page: catalog.pages }, { replace: true })`.
     - Add `aria-live="polite"` to the total counter `<p>`.
     - Compute `hasActiveFilters = Boolean(collection || part || canonicalType || band || q.trim())`.
     - When `catalog.items.length === 0`: if `hasActiveFilters`, render `"Không tìm thấy đề phù hợp với bộ lọc hiện tại."` + `"Xóa bộ lọc"` button (`onClick={handleReset}`); otherwise keep `"Giáo viên chưa có đề luyện tập cho kỹ năng này"`.
- **Success criteria:** All tests in `practice-catalog.test.tsx` pass, `apps/student` typechecks cleanly.
- **Verify:** `pnpm --filter student test src/components/practice/practice-catalog.test.tsx && pnpm --filter student check-types` exits 0 with all tests passing.

### Task 3.4 — Add isolated-org E2E coverage, run full local quality gates, and capture POT screenshots
- **Goal:** Verify the real full-stack flow (DB → Hono API → TanStack Router Student SPA) across pagination, filters, URL reload, keyboard focus, and 4 viewports in Light & Dark mode without polluting existing E2E tests, and capture POT screenshots.
- **Target files and symbols:** `apps/e2e/specs/student-practice.spec.ts`
- **Steps:**
  1. Add a **separate `test.describe("Student practice catalog filters & facets (#884)")`** in `apps/e2e/specs/student-practice.spec.ts` with its own isolated `beforeAll` calling `seedQuizFixture` (dedicated org + student account, completely independent of the existing 5 tests' `fixture.orgId` — <!-- Applied Red Team Finding 8 -->), seeding 14 reading tests across 2 pages (`"Cambridge IELTS 18"`, `"Actual Test"`, `"Forecast Quý 2-2025"`, `"Other sources"`, parts `p1`/`p2`/`p3`, multi-group `tfng` + `fill_blank`, uniform `band = "7.0"`):
     - Navigate to `/practice/reading?page=1` and `/practice/reading?page=2`: assert `"Bộ đề"` dropdown lists ALL 4 seeded collections identically on both pages.
     - Assert `"Band"` dropdown is NOT rendered when all tests share `"7.0"`.
     - Filter by `"Bộ đề"` (`"Actual Test"`), `"Phần thi"` (`Passage 2`), and `"Dạng bài"` (`Fill in the blank` — secondary group type): assert matching card appears, URL contains `collection=`, `part=p2`, `type=fill_blank`, reload preserves filters and results.
     - Filter to an impossible combination (0 results): assert `"Không tìm thấy đề phù hợp với bộ lọc hiện tại."` and `"Xóa bộ lọc"` button appear; click `"Xóa bộ lọc"` and assert URL is clean (`/practice/reading` with no query params) and all 14 tests return.
     - Verify 4 viewports (`1440×900`, `768×1024`, `375×812`, `320×568`) in both Light and Dark mode have zero horizontal overflow (`scrollWidth <= clientWidth`), and keyboard Tab reaches filter selects and search input cleanly.
  2. Run full local gates:
     - `pnpm --filter @teacher-os/api test`
     - `pnpm --filter @teacher-os/ui test src/components/assignments/editor/assignment-presets.test.ts`
     - `pnpm --filter server test src/routes/student-practice.test.ts src/routes/student-practice-library-sync.test.ts`
     - `pnpm --filter student test`
     - `pnpm exec biome check .`
     - `pnpm check-types`
     - Targeted E2E spec ONLY (per `AGENTS.md`, NEVER full E2E locally): `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/student-practice.spec.ts`
  3. Capture clean POT screenshots (Light & Dark + 1440×900 / 768×1024 / 375×812) into `plans/reports/884-practice-filters-*.png` for the issue #884 POT comment.
- **Success criteria:** Every gate exits 0, targeted E2E spec passes 100%, and POT screenshots exist with zero overflow or layout defects.
- **Verify:** All commands above exit 0 and `student-practice.spec.ts` reports 0 failures.

## Verification

- `pnpm --filter @teacher-os/api test && pnpm --filter @teacher-os/ui test src/components/assignments/editor/assignment-presets.test.ts && pnpm --filter server test src/routes/student-practice.test.ts src/routes/student-practice-library-sync.test.ts && pnpm --filter student test` exits 0
- `pnpm exec biome check . && pnpm check-types` exits 0
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/student-practice.spec.ts` exits 0

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
