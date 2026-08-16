---
title: Class detail enroll student into viewed class
date: 2026-08-16
summary: "Issue #5: add-student optional classId enrolls the viewed class roster"
---

# Class detail enroll student into viewed class

## What happened
Issue #5: class detail `+ Thêm học viên` opened AddStudentModal but `add-student` only appended to `data.students`. `cls.studentIds` never changed, so roster and count stayed stale.

Root cause: `data-store-reducer.ts` returned students-only; modal had no `classId`; `$classId.tsx` did not pass the viewed class id.

## Decision
Optional `classId` nested in the `add-student` payload (not a new action, not top-level like `assign-syllabus`). Missing/empty/unknown id still creates the student. Valid id appends to that class only.

AddStudentModal remount key is `add-student-${cls.id}` so it does not collide with AssignSyllabusModal's `key={cls.id}`.

## Verification
- Pre-fix: 1 red test (enroll membership)
- Post-fix: `pnpm --filter web test` 26/26; `pnpm test` 27/27
- `VITE_SERVER_URL=http://localhost:3000 pnpm check-types` green
- biome on touched files clean
- No live UI click-through: ports 3000/3001 owned by another workerd

## Next steps
Ship beta PR to `develop`, review-pr, merge, watch CI.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
