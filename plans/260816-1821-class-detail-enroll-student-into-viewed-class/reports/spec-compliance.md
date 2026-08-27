# Spec compliance — issue #5 enroll

Date: 2026-08-16
Verdict: PASS

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 1 | omit `classId` creates student, classes equal | PASS | test + `if (!classId)` |
| 2 | `classId: ""` same as omit | PASS | falsy branch |
| 3 | valid `classId` exact `[...prev, newId]`; other classes equal | PASS | map + enroll test |
| 4 | unknown `classId` create-only | PASS | map no-op |
| 5 | class detail unique remount key + `classId={cls.id}` | PASS | `$classId.tsx` `add-student-${cls.id}` |
| 6 | students list omits `classId` | PASS | file unchanged |
| 7 | contract test parses AddStudentModal block | PASS | `add-student-enroll.contract.test.ts` |
| 8 | no `useState(classId)` / no `classes[0]` default | PASS | modal reads prop |
| 9 | `classId` nested in payload | PASS | dispatch payload |

Extras: none.
Untracked: `apps/web/src/lib/add-student-enroll.contract.test.ts`.
