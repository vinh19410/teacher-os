---
type: tester
date: 2026-08-16
issue: 5
branch: fix/class-detail-enroll-student
worktree: /Users/vinhtran/Documents/project/personal/worktrees/teacher-os-class-detail-enroll-student
---

# Test Report — 2026-08-16 — issue #5 class-detail enroll student

## Summary

**26/26 Vitest PASS. CI contract 1/1 PASS. Failures: none.** Both assigned cmds exit 0. Enroll AC locked by reducer + source-contract. Residual: no istanbul/c8; `studentIds.includes` branch dead under `uid()`; modal runtime not executed (plan non-goal).

## Diff-aware mode: analyzed 5 changed files

```
Diff-aware mode: analyzed 5 changed files
  Changed: apps/web/src/lib/data-store-reducer.ts
           apps/web/src/lib/data-store-reducer.test.ts
           apps/web/src/components/modals/add-student-modal.tsx
           apps/web/src/routes/_auth/classes/$classId.tsx
           + untracked: apps/web/src/lib/add-student-enroll.contract.test.ts
  Mapped:  data-store-reducer.test.ts (A — colocated)
           add-student-enroll.contract.test.ts (A/C — source-contract for modal + $classId + students/index)
  Unmapped: none product. plans/260816-1821-... docs only
Ran 27/27 tests (26 Vitest + 1 node:test): 27 passed, 0 failed
```

| File | Why selected |
|---|---|
| `data-store-reducer.ts` | Product under test. Strategy A → `data-store-reducer.test.ts` |
| `data-store-reducer.test.ts` | +3 enroll cases + omit `classes` deep-equal |
| `add-student-enroll.contract.test.ts` | Wiring lock (plan decision 6) |
| `add-student-modal.tsx` | Strategy C → contract test payload `classId` |
| `$classId.tsx` | Strategy C → contract test key + `classId={cls.id}` |

Assigned cmds = full product suite (`web` only package with `test` script). Config/infra unchanged → no extra escalate.

[!] No tests for `AddStudentModal` submit/validation runtime — plan non-goal (no RTL/Playwright).

[!] No tests for `studentIds.includes(student.id)` early-return — `uid("s")` = `s-` + 8 hex from `crypto.randomUUID`. Collision vs seed ids (`s1`…`s5`) practically impossible. Defensive only.

## Commands (exact exit codes)

| # | Command | Exit | Duration | Result |
|---|---------|------|----------|--------|
| 1 | `pnpm --filter web test` | **0** | 180ms (tests 12ms) | **26/26** Vitest v4.1.10 |
| 2 | `pnpm test` | **0** | turbo 53ms cache hit + contract 61ms | web 26/26 + `✔ ci workflow exists and matches the quality-gate contract` 1/1 |

Re-run flake: web 26/26 twice more (166ms, 173ms). Deterministic.

**Failures: none. No verbatim fail output.**

Root `pnpm test` = `turbo run test && pnpm test:ci-workflow`. turbo: 1/1 task (`web`; other pkgs no `test` script). Cache replay 18:55:17; live cmd #1 at 18:56:07 independently green.

## Test Results Overview

- **Total tests**: 27 (26 Vitest + 1 node:test)
- **Passed**: 27 | **Failed**: 0 | **Skipped**: 0
- **Vitest split**: `data-store-reducer.test.ts` 23 + `add-student-enroll.contract.test.ts` 3
- **Toolchain**: pnpm 10.33.1, turbo 2.10.10, vitest 4.1.10, cwd = worktree
- **Isolation**: `structuredClone(seedData)` per reducer case. Contract tests read source files only.

New / extended cases (all green):

1. `add-student` omit `classId` → append + `classes` deep-equal
2. `add-student` `classId: "c-missing"` → create + classes unchanged
3. `add-student` `classId: ""` → create + classes unchanged
4. `add-student` `classId: "c1"` → roster `[...prev, newId]`; other class objects equal
5. class detail JSX: `key={\`add-student-${cls.id}\`}` + `classId={cls.id}`; no `AssignSyllabusModal` in block
6. modal payload contains `classId`
7. students list call omits `classId=`

## Coverage Metrics

No istanbul/c8/`@vitest/coverage-v8`. No numeric line/branch/fn %. Manual on changed reducer path:

| Branch | Covered? |
|---|---|
| omit / falsy `classId` (`undefined`, `""`) | yes |
| unknown `classId` | yes |
| match `c1`, append id | yes |
| other classes referential/object equal | yes (`filter id !== c1`) |
| `c.studentIds.includes(student.id)` | **no** — dead under `uid()` |
| modal submit / students page runtime | **no** — source-contract only |

Critical enroll path (issue #5) covered.

## Failed Tests

None.

## Performance Metrics

- Web suite: 166–180ms wall, 10–12ms tests. Fast.
- Slow tests: none.
- Root turbo cache hit 53ms; contract 61ms.

## Build Status

Not requested. `check-types` / `build` / biome not run this session.

## Critical Issues

None blocking. AC of plan `260816-1821` testable items pass.

## Recommendations

1. Optional later: inject/mock `uid` if duplicate-id branch must be locked. Not needed for issue #5.
2. Add coverage reporter if CI later wants % gate. Current plan does not.
3. Keep contract test if someone moves `classId` to top-level action (decision 1).

## Next Steps

1. P0 — none. Tests green.
2. P1 — implementer/reviewer: `VITE_SERVER_URL=http://localhost:3000 pnpm check-types` still in plan AC; not run here.
3. P2 — coverage tooling only if CI adds a % gate.

## Unresolved questions

- `check-types` / biome / build: out of assigned cmd list. Unknown this session.
