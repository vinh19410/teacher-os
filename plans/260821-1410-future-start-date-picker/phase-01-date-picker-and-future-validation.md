---
phase: 1
title: "Date picker and future validation"
status: completed
priority: P2
effort: "1.5h"
dependencies: []
---

# Phase 1: Date picker and future validation

## Context Links

- Modal owner: `apps/web/src/components/modals/add-class-modal.tsx:49`
- Native input primitive: `apps/web/src/components/ui/field.tsx:53`
- API string contract: `packages/api/src/contracts.ts:58`
- Server raw write: `apps/server/src/routes/kernel.ts:253`
- Raw display: `apps/web/src/routes/_auth/classes/$classId.tsx:89`

## Overview

Replace one modal field with native browser date input and guard submit locally. Keep API/DB unchanged; only invalid UI submissions are blocked.

## Requirements

- Functional:
  - Render “Ngày bắt đầu” as `<Input type="date">`.
  - Compute min/default as tomorrow by local calendar, format `YYYY-MM-DD`.
- Reject empty, invalid, today, and past dates before `run`.
- Show Vietnamese error through existing `role="alert"` path.
- Disable browser-native submit blocking so custom validation always runs.
- Repair a stale date when the modal opens or the local minimum date changes.
  - Preserve `startDate` as string in existing `add-class` payload.
- Non-functional:
  - No new dependency.
  - No API/DB/schema/server changes.
  - Keep current two-column layout and `useKernelFormSubmit` pattern.

## Architecture

Data enters through native date input as a string. Local helper normalizes/validates only the input boundary:

1. `getTomorrowDateInputValue(now)` creates a local Date with `(year, month, day + 1)`.
2. `formatDateInputValue(date)` pads local year/month/day into `YYYY-MM-DD`.
3. `parseDateInputValue(value)` accepts only real `YYYY-MM-DD` values.
4. `submit` computes tomorrow fresh; invalid value sets error and returns before `run`.
5. Valid value continues existing payload path unchanged.

Do not move validation into API/server because request says keep contracts and this is modal UX validation.

## Related Code Files

- Modify: `apps/web/src/components/modals/add-class-modal.tsx`
- Modify optional: `apps/web/src/lib/kernel-runtime.contract.test.ts`
- Do not modify: `packages/api/src/contracts.ts`, `apps/server/src/routes/kernel.ts`, DB schema/migrations, class detail display.

## Implementation Steps

1. Add small local helpers above `AddClassModal`:
   - `formatDateInputValue`
   - `getTomorrowDateInputValue`
   - `parseDateInputValue` or equivalent real-date guard
   - `isFutureStartDateValue`
2. Change `useState("19/08")` to lazy tomorrow default.
3. Ensure modal open/reset cannot leave empty or non-future `startDate`; do not reset unrelated fields on cancel.
4. Render:
   - `<Input type="date" min={tomorrowValue} value={startDate} onChange={...} />`
5. In `submit`, before `run`, validate `startDate`.
   - On fail: `setError("Vui lòng chọn ngày bắt đầu sau hôm nay."); return;`
   - On pass: send existing payload shape with `startDate`.
6. Add/adjust focused source-contract tests if current test coverage cannot observe modal behavior directly.

## Todo List

- [x] Implement local date helpers without `toISOString()`.
- [x] Wire native date input `type` and `min`.
- [x] Add submit guard before `run`.
- [x] Preserve payload keys and `startDate` string value.
- [x] Add focused regression coverage if needed.
- [x] Run focused validation.

## Success Criteria

- [x] Empty date shows Vietnamese alert and no `run`.
- [x] Today and past dates show Vietnamese alert and no `run`.
- [x] Tomorrow and later call `run`.
- [x] Input has native `type="date"` and `min` equals local tomorrow.
- [x] Existing `add-class` payload shape unchanged.
- [x] `pnpm --filter web check-types` passes.

## Risk Assessment

| Risk | Likelihood x Impact | Mitigation |
| --- | --- | --- |
| Timezone drift from ISO conversion | Medium x High | Use local date fields and string padding |
| Date value stale after midnight | Low x Medium | Submit recomputes tomorrow; open-state repair handles stale value |
| Browser clears date despite min | Medium x Medium | Required submit validation |
| Over-scoping into server/API | Low x Medium | Do not touch contract/server/DB files |

## Rollback

Revert `apps/web/src/components/modals/add-class-modal.tsx` and any focused test changes. No data migration and no server rollback.

## Completion Evidence

| Metric | Result |
| --- | --- |
| Checklist mapping | 6/6 implementation TODOs and 6/6 success criteria checked; unresolved mappings: 0 |
| Focused validation | 25/25 pass |
| Web suite | 186/186 pass |
| Repository gates | `pnpm test`, `pnpm check-types`, `pnpm build` pass |
| Biome | Changed files pass |
| Review round 2 | 9/10; 0 critical issues; warnings only on full-form `noValidate` and source-contract coverage |
| Docs impact | none — internal modal behavior only; no API/DB/architecture/setup change |

## Open Questions

None.
