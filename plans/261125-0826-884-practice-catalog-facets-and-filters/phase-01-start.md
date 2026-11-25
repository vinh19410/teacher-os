---
phase: 1
title: "Phase 1: Contracts and Skill-Aware Type Catalog"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Contracts and Skill-Aware Type Catalog

## Goal

Define the backward-compatible `practiceCatalogFacetsSchema`, `PRACTICE_FILTER_MAX_LENGTH`, `PRACTICE_CATALOG_MAX_PAGE`, and `parsePracticePageParam` contract helpers in `packages/api/src/contracts.ts`, and implement the shared skill-aware question type canonicalization, filter expansion, part/band/type labeling, and deterministic sorting helper in `packages/api/src/lib/practice-type-catalog.ts` with full TDD test coverage (including label-sync verification against `packages/ui`).

## Files to Create / Modify

- Create: `packages/api/src/lib/practice-type-catalog.ts`
- Create: `packages/api/src/lib/practice-type-catalog.test.ts`
- Modify: `packages/api/src/contracts.ts` (around lines 2600–2652: `PRACTICE_FILTER_MAX_LENGTH`, `PRACTICE_CATALOG_MAX_PAGE`, `parsePracticePageParam`, `practiceCatalogFacetsSchema`, `practiceCatalogResponseSchema`)
- Modify: `packages/ui/src/components/assignments/editor/assignment-presets.test.ts` (add sync assertion verifying Writing/Speaking labels in `practiceTypeLabel` match `SKILLS` in `assignment-presets.ts`)

## Tasks & Steps

### Task 1.1 — Write failing TDD tests for practice catalog facets schema, page parser, and type canonicalization (Red phase)
- **Goal:** Establish failing unit tests specifying every contract invariant before implementing production code.
- **Target files and symbols:**
  - Create `packages/api/src/lib/practice-type-catalog.test.ts`
  - Imports tested: `practiceCatalogFacetsSchema`, `practiceCatalogResponseSchema`, `PRACTICE_FILTER_MAX_LENGTH`, `PRACTICE_CATALOG_MAX_PAGE`, `parsePracticePageParam` from `../contracts`; `canonicalizePracticeType`, `expandPracticeTypeFilter`, `practiceTypeLabel`, `practicePartLabel`, `sortPracticeParts`, `sortPracticeBands`, `sortPracticeTypes` from `./practice-type-catalog`; `LIBRARY_READING_TYPES`, `LIBRARY_LISTENING_TYPES` from `../library-contracts`.
- **Steps:**
  1. Create `packages/api/src/lib/practice-type-catalog.test.ts` with test cases covering:
     - `parsePracticePageParam` (<!-- Applied Red Team Finding 5 -->):
       - Accepts `"1"`, `"42"`, `"100000"`.
       - Rejects (returns `null`): `undefined`, `""`, `"0"`, `"-1"`, `"01"`, `"1.5"`, `"2abc"`, `"100001"`, `"999999999999999999999"` (int64 overflow protection).
     - `canonicalizePracticeType`:
       - Reading/Listening alias collapse: `mcq1` → `mcq`, `mcq3` → `mcq`, `mcq` → `mcq`; `note` → `notes`; `sent4` → `sent`; `flowchart` → `flow`; `match2`/`match` → `matching`.
       - Trims whitespace; unknown non-empty type (e.g. `"choice"`) stays unchanged; Writing/Speaking do NOT collapse cross-skill aliases (`("writing", "map")` stays `"map"`).
     - `expandPracticeTypeFilter`:
       - `("listening", "mcq")`, `("listening", "mcq1")`, `("listening", "mcq3")` all return `["mcq", "mcq1", "mcq3"]`.
       - `("reading", "note")` and `("reading", "notes")` return `["notes", "note"]`.
       - `("listening", "sent4")` and `("reading", "sent")` return `["sent", "sent4"]`.
       - `("reading", "flowchart")` and `("listening", "flow")` return `["flow", "flowchart"]`.
       - `("listening", "match2")` and `("reading", "matching")` return `["matching", "match2", "match"]`.
       - Unknown type `"custom"` returns `["custom"]`; empty/whitespace returns `[]`.
     - `practiceTypeLabel`:
       - Zero duplicate display labels after canonicalizing all `LIBRARY_READING_TYPES` and all `LIBRARY_LISTENING_TYPES` (Listening has only ONE `"Multiple choice (One answer)"` for `mcq`/`mcq1`/`mcq3`, ONE `"Matching"`, ONE `"Note completion"`, ONE `"Sentence completion"`, ONE `"Flow-chart completion"`).
       - Skill-aware `map`: `practiceTypeLabel("listening", "map") === "Map labelling"` while `practiceTypeLabel("writing", "map") === "Bản đồ"`.
       - Writing/Speaking types resolve to human labels (never raw slug): `chart` → `"Biểu đồ"`, `discuss` → `"Discuss both views"`, `work` → `"Work & study"`.
       - Unknown type falls back to its trimmed ID.
     - `practicePartLabel` & `sortPracticeParts`:
       - `reading`: `["p3", "p1", "p2"]` → `["p1", "p2", "p3"]` with labels `"Passage 1"`, `"Passage 2"`, `"Passage 3"`.
       - `listening`: `["s4", "s2", "s1", "s3"]` → `["s1", "s2", "s3", "s4"]` with labels `"Section 1"`..`"Section 4"`.
       - Unknown parts appended sorted alphabetically after known slots; blanks ignored.
     - `sortPracticeBands`: `["7.5", "6.0", "5.0", "7.0", "6.5", ""]` → `["5.0", "6.0", "6.5", "7.0", "7.5"]`; non-standard numeric band `"8.5"` sorted after `"8.0"`.
     - `sortPracticeTypes`: deduplicates aliases, drops blanks, sorts case-insensitively by `practiceTypeLabel`.
     - `practiceCatalogResponseSchema`:
       - Accepts legacy payload `{ items: [], page: 1, pages: 1, total: 0 }` (without `facets`, `facets === undefined`).
       - Accepts payload with `facets: { collections: ["Cambridge 18"], types: ["tfng"], parts: ["p1"], bands: ["7.0"] }`.
       - Still rejects unrecognized top-level keys and unrecognized keys inside `facets` via `.strict()`.
- **Success criteria:** Test file exists and fails specifically because `practice-type-catalog.ts` and the new `contracts.ts` exports are not implemented yet.
- **Verify:** `pnpm --filter @teacher-os/api test src/lib/practice-type-catalog.test.ts` exits non-zero with module-not-found / assertion error; exit 0 is a failure in this red phase.

### Task 1.2 — Add `PRACTICE_FILTER_MAX_LENGTH`, `PRACTICE_CATALOG_MAX_PAGE`, `parsePracticePageParam`, and `practiceCatalogFacetsSchema` to `packages/api/src/contracts.ts`
- **Goal:** Extend the practice catalog contract with optional `.strict()` `facets` and strict page/filter bounds while preserving 100% compatibility with legacy clients.
- **Target files and symbols:** `packages/api/src/contracts.ts` (`PRACTICE_FILTER_MAX_LENGTH`, `PRACTICE_CATALOG_MAX_PAGE`, `parsePracticePageParam`, `practiceCatalogFacetsSchema`, `PracticeCatalogFacets`, `practiceCatalogResponseSchema`).
- **Steps:**
  1. Right after `PRACTICE_CATALOG_PAGE_SIZE = 12` (line 2603), export:
     - `export const PRACTICE_FILTER_MAX_LENGTH = 200;`
     - `export const PRACTICE_CATALOG_MAX_PAGE = 100_000;`
     - `parsePracticePageParam(raw: string | undefined): number | null` matching `/^[1-9]\d*$/`, `Number.isSafeInteger(parsed)`, and `parsed <= PRACTICE_CATALOG_MAX_PAGE` (<!-- Applied Red Team Finding 5 -->).
  2. Immediately before `practiceCatalogResponseSchema` (line 2641), define and export:
     ```ts
     export const practiceCatalogFacetsSchema = z
     	.object({
     		collections: z.array(z.string()),
     		types: z.array(z.string()),
     		parts: z.array(z.string()),
     		bands: z.array(z.string()),
     	})
     	.strict();
     export type PracticeCatalogFacets = z.infer<
     	typeof practiceCatalogFacetsSchema
     >;
     ```
  3. Add `facets: practiceCatalogFacetsSchema.optional(),` inside `practiceCatalogResponseSchema` (keeping `.strict()`).
- **Success criteria:** `packages/api/src/contracts.ts` compiles cleanly and preserves strict validation.
- **Verify:** No verification needed yet (verified together with Task 1.3).

### Task 1.3 — Implement `packages/api/src/lib/practice-type-catalog.ts` and UI preset sync test (Green phase)
- **Goal:** Make all tests in `practice-type-catalog.test.ts` and `assignment-presets.test.ts` pass with zero duplicate labels and exact Writing/Speaking label parity.
- **Target files and symbols:**
  - Create `packages/api/src/lib/practice-type-catalog.ts` (exports: `canonicalizePracticeType`, `expandPracticeTypeFilter`, `practiceTypeLabel`, `practicePartLabel`, `sortPracticeParts`, `sortPracticeBands`, `sortPracticeTypes`)
  - Modify `packages/ui/src/components/assignments/editor/assignment-presets.test.ts` (add sync test comparing `practiceTypeLabel` against `SKILLS` for `writing` and `speaking`)
- **Steps:**
  1. Implement `packages/api/src/lib/practice-type-catalog.ts` importing `ASSIGNMENT_BANDS`, `ASSIGNMENT_TEST_PRESETS`, `type PracticeSkill`, `quizTypeDisplay` from `../contracts`:
     - Define `AUTO_SKILL_TYPE_ALIAS_GROUPS: Readonly<Record<string, readonly string[]>>` for Reading/Listening:
       - `mcq: ["mcq", "mcq1", "mcq3"]`
       - `notes: ["notes", "note"]`
       - `sent: ["sent", "sent4"]`
       - `flow: ["flow", "flowchart"]`
       - `matching: ["matching", "match2", "match"]`
     - Build reverse map `RAW_TO_CANONICAL_AUTO_TYPE` from `AUTO_SKILL_TYPE_ALIAS_GROUPS`.
     - Define `PROMPT_SKILL_TYPE_LABELS: Readonly<Record<"writing" | "speaking", Readonly<Record<string, string>>>>` matching `SKILLS` in `packages/ui/src/components/assignments/editor/assignment-presets.ts`:
       - `writing`: `chart: "Biểu đồ"`, `table: "Bảng số liệu"`, `map: "Bản đồ"`, `process: "Quy trình"`, `discuss: "Discuss both views"`, `opinion: "Opinion"`, `advantage: "Advantages"`, `problem: "Problem / Solution"`.
       - `speaking`: `hometown: "Hometown"`, `work: "Work & study"`, `place: "Place"`, `person: "Person"`, `object: "Object"`, `cities: "Cities"`, `education: "Education"`.
     - Implement `canonicalizePracticeType`, `expandPracticeTypeFilter`, `practiceTypeLabel`, `practicePartLabel`, `sortPracticeParts`, `sortPracticeBands`, `sortPracticeTypes`.
  2. In `packages/ui/src/components/assignments/editor/assignment-presets.test.ts`, add a test verifying every `(skill, part, type)` in `SKILLS` for `"writing"` and `"speaking"` satisfies `practiceTypeLabel(skill.id, type.id) === type.label`.
- **Success criteria:** All API unit tests and UI preset sync tests pass; TypeScript typecheck passes for `@teacher-os/api` and `@teacher-os/ui`.
- **Verify:** `pnpm --filter @teacher-os/api test && pnpm --filter @teacher-os/ui test src/components/assignments/editor/assignment-presets.test.ts && pnpm --filter @teacher-os/api check-types` exits 0 with all tests passing.

## Verification

- `pnpm --filter @teacher-os/api test` exits 0
- `pnpm --filter @teacher-os/ui test src/components/assignments/editor/assignment-presets.test.ts` exits 0
- `pnpm --filter @teacher-os/api check-types` exits 0

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
