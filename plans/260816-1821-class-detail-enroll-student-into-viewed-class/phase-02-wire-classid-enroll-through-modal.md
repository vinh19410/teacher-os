---
phase: 2
title: "Wire classId enroll through modal"
status: pending
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Wire classId enroll through modal

## Overview

Implement enroll in the reducer, forward `classId` from the modal (prop at submit, no snapshot state), pass it from class detail with a unique remount key, and lock wiring with a source-contract test.

<!-- Updated: Red Team 2026-08-16 — contract test, key, env-prefixed check-types -->

## Context Links

- Phase 1 tests define omit / empty / unknown / exact enroll
- Modal: `apps/web/src/components/modals/add-student-modal.tsx:9-46`
- Class detail: `apps/web/src/routes/_auth/classes/$classId.tsx:234-244` (`AssignSyllabusModal` already uses `key={cls.id}`)
- Students list: `apps/web/src/routes/_auth/students/index.tsx:82`
- Contract pattern: `scripts/ci-workflow.test.mjs` (read source, assert strings)

## Requirements

- Functional: submit from class detail enrolls into that class; submit from `/students` does not touch classes
- Non-functional: demo store only; no authz; no persistence

## Architecture

1. Read `action.payload.classId` in the existing `add-student` case (field already on the type from phase 1).
2. After creating the student:

```ts
const nextStudents = [...state.students, student];
if (!action.payload.classId) {
  return { ...state, students: nextStudents };
}
return {
  ...state,
  students: nextStudents,
  classes: state.classes.map((c) => {
    if (c.id !== action.payload.classId) return c;
    if (c.studentIds.includes(student.id)) return c;
    return { ...c, studentIds: [...c.studentIds, student.id] };
  }),
};
```

Unknown non-empty `classId` maps over classes and changes none.

3. `AddStudentModal` accepts optional `classId?: string` and puts it on `payload.classId` at submit. Do **not** `useState(classId)`.
4. Class detail:

```tsx
<AddStudentModal
  key={`add-student-${cls.id}`}
  open={addStudentOpen}
  onClose={() => setAddStudentOpen(false)}
  classId={cls.id}
/>
```

5. Students list: do not pass `classId`. Do not default to `data.classes[0].id`.

## Related Code Files

- Modify: `apps/web/src/lib/data-store-reducer.ts` (case body)
- Modify: `apps/web/src/components/modals/add-student-modal.tsx`
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx`
- Create: `apps/web/src/lib/add-student-enroll.contract.test.ts`
- Do not modify: `apps/web/src/routes/_auth/students/index.tsx`
- Do not modify: `open-design/v1/teacher-os.html`

## Tests Before

Phase 1 enroll-membership test must be red before this refactor.

## Refactor

Implement the reducer + modal + class-detail wiring above. Do not add a second action type.

## Tests After

1. All four reducer add-student cases green.
2. New contract test (node/vitest + `readFileSync`, no RTL) asserts:
   - Parse the **`AddStudentModal` JSX block** in `$classId.tsx` (not the whole file — `AssignSyllabusModal` already has `key={cls.id}` at `$classId.tsx:234-239`). That block must contain `key={\`add-student-${cls.id}\`}` and `classId={cls.id}`.
   - `add-student-modal.tsx` puts `classId` **inside the dispatch `payload` object**, not only on the component props type.
   - `students/index.tsx` `AddStudentModal` call does not include `classId=`.

## Implementation Steps

1. Confirm the enroll-membership test fails.
2. Implement the map-over-classes enroll.
3. Forward `classId` from the modal (prop, not state).
4. Pass unique remount `key={\`add-student-${cls.id}\`}` and `classId={cls.id}` on class detail.
5. Add the source-contract test.
6. Run `pnpm --filter web test` then `VITE_SERVER_URL=http://localhost:3000 pnpm check-types`.

## Todo

- [x] Implement optional `classId` enroll in reducer
- [x] Forward `classId` from `AddStudentModal` without snapshot state
- [x] Pass `key` + `classId` from class detail only
- [x] Add wiring contract test
- [x] All web tests green
- [x] Env-prefixed check-types green

## Success Criteria

- [x] Phase 1 tests pass
- [x] Contract test proves class-detail wiring and students-list omit
- [x] Typecheck passes with `VITE_SERVER_URL=http://localhost:3000`

## Risk Assessment

- Copying `AssignSyllabusModal`'s `useState(defaultClassId ?? data.classes[0]?.id)` would enroll into c1 after navigating. Forbidden.
- Modal local form reset stays as-is after submit.

## Security Considerations

Demo in-memory store. Any signed-in session can dispatch any class id. Keep the existing test-file comment. Do not add authz. This action is not a stable public API for a future D1 port.

## Regression Gate

- `pnpm --filter web test`
- `VITE_SERVER_URL=http://localhost:3000 pnpm check-types`
