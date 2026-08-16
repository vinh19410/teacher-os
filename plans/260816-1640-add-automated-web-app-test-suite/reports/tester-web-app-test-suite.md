---
type: tester
date: 2026-08-16
issue: 4
branch: feat/web-app-test-suite
worktree: /Users/vinhtran/Documents/project/personal/worktrees/teacher-os-web-app-test-suite
---

# Test Report — 2026-08-16 — issue #4 web app test suite

## Summary

**19/19 Vitest PASS. CI contract PASS.** 5 lệnh được giao đều **exit 0**. Characterization suite khóa reducer mock + YAML `pnpm test`. Không fail AC. Residual: chưa có GitHub Actions run; `edit-lesson` không có test (phase-02 #7); không có istanbul/c8.

## Diff-aware mode: analyzed 10 changed files

```
Diff-aware mode: analyzed 10 changed files
  Changed: .github/workflows/ci.yml, apps/web/package.json,
           apps/web/src/lib/data-store.tsx, package.json, pnpm-lock.yaml,
           scripts/ci-workflow.test.mjs, turbo.json
           + untracked: data-store-reducer.ts, data-store-reducer.test.ts,
             vitest.config.ts, plans/260816-1640-...
  Mapped:  apps/web/src/lib/data-store-reducer.test.ts (A — colocated)
           scripts/ci-workflow.test.mjs (A/C — contract ci.yml + root/turbo/web scripts)
           + full assigned gates vì package.json / turbo.json / ci.yml / lockfile = config
  Unmapped: apps/web/src/lib/data-store.tsx (React provider — plan non-goal, no TL)
            apps/web/vitest.config.ts (validated by runner, no unit test)
            plans/260816-1640-... (docs)
Ran 20/20 tests (19 Vitest + 1 node:test) + 2 quality gates: 22 passed, 0 failed
```

| File | Why selected |
|---|---|
| `data-store-reducer.ts` | Product under test. Strategy A → `data-store-reducer.test.ts` |
| `data-store-reducer.test.ts` | Suite mới (19 cases) |
| `data-store.tsx` | Extract + `useReducer(reducer)` + `export type { Action }`. No component tests (plan) |
| `apps/web/package.json` | `"test": "vitest run"`, vitest ^4.1.10 |
| `vitest.config.ts` | Runner config. Validated by `vitest run` |
| `package.json` / `turbo.json` | Config → full `pnpm test` |
| `.github/workflows/ci.yml` | Strategy C → `ci-workflow.test.mjs` |
| `scripts/ci-workflow.test.mjs` | Contract test |
| `pnpm-lock.yaml` | Config. No Playwright/TL product dep (optional vitest peer only) |

Auto-escalate `--full` **apply** (config/infra). Assigned cmds = toàn bộ product suite hiện có.

[!] No tests for `data-store.tsx` `DataProvider` / `useData` — consider adding only if later plan wants React tests. Out of issue #4.

[!] No tests for `edit-lesson` — live action, phase-02 #7 asks `totalLessons ===` lesson count after edit. Plan.md AC không liệt kê tên action này; create/mutate totals đã cover qua add-syllabus / add-module / add-lesson / edit-module.

## Commands (exact exit codes)

| # | Command | Exit | Duration | Result |
|---|---------|------|----------|--------|
| 1 | `pnpm --filter web test` | **0** | 169ms (tests 10ms) | **19/19** Vitest v4.1.10 |
| 2 | `CI=true pnpm test` | **0** | turbo 893ms + contract 51ms | web 19/19 + contract 1/1. turbo: 1/1 task (`web` only; packages không `test` script skip) |
| 3 | `pnpm test:ci-workflow` | **0** | 74ms (test 1.7ms) | `✔ ci workflow exists and matches the quality-gate contract` |
| 4 | `VITE_SERVER_URL=http://localhost:3000 pnpm check-types` | **0** | 1.275s cache hit 4/4 | infra/ui/server/web |
| 4b | `turbo run check-types --filter=web --force` | **0** | 11.833s, 0 cached | xác nhận extract typecheck thật (không tin cache) |
| 5 | `pnpm exec biome check .` | **0** | 130ms, 117 files | 0 error. 7 warn + 2 info **pre-existing** |

Re-run flake check: web 19/19 exit 0 (253ms); contract exit 0. Deterministic.

**19 Vitest tests + CI contract: PASSED.**

## Test Results Overview

- **Total tests**: 20 (19 Vitest + 1 node:test)
- **Passed**: 20 | **Failed**: 0 | **Skipped**: 0
- **Quality gates**: check-types + biome = 2/2 exit 0
- **Toolchain**: Node v24.15.0, pnpm 10.33.1, turbo 2.10.10, vitest 4.1.10, cwd = worktree
- **Isolation**: mỗi Vitest case `structuredClone(seedData)`. Không shared mutable. `uid` = `crypto.randomUUID` — test chỉ assert prefix `/^s-/` `/^c-/` hoặc `id === payload.id`

Vitest cases (all green):

1. exports a function
2. check-in `l3` upcoming → s1 `done+1`, `remaining=3`, `classes`/`invoices` unchanged
3. check-in `l1` completed → `toBe` same ref
4. check-in unknown → `toBe` same ref
5. check-in `l9` cancelled hole → completed + s4 `done+1`
6. mark-paid `INV-084` → paid/CK, s4 debt 0, tag `nợ học phí` giữ, `INV-086` nguyên
7. mark-paid unknown → new object, invoices deep-equal
8. mark-paid already-paid `INV-081` overwrite method `MoMo`
9. grade `a1` raw scores + `graded`; `averageBand=6.3`
10. add-syllabus keeps `totalLessons=10`, empty modules, `id===payload.id`
11. add-module seed `sy1` keeps 12
12. add-module after create recomputes to 0
13. add-lesson recomputes as lesson count
14. edit-module does not change totalLessons
15. assign-syllabus sets `class.syllabusId` only
16. cancel-lesson no pkg change
17. add-student `pkg.done=0`, `/^s-/`
18. add-class `sessionsDone=0`, `/^c-/`
19. update-class-notes only that class

Seed fixtures verified: s1 pkg 8/12 rem 4 → after l3 rem 3; l3 upcoming sid s1; l9 cancelled sid s4; INV-084 overdue 1_000_000 s4; a1 scores null.

## Coverage Metrics

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Istanbul/c8 line % | n/a — no coverage runner | 80% | N/A |
| Vitest files | 1/1 (`data-store-reducer.test.ts`) | — | PASS |
| Plan.md AC cases | 7/7 groups listed | 100% | PASS |
| Phase-02 action matrix | 12/13 Action types | — | GAP `edit-lesson` |
| CI contract asserts | YAML `^\s+- run: pnpm test\s*$` + root turbo+contract + turbo.tasks.test + web `vitest run` + old biome/secrets checks | issue #4 | PASS |

Reducer switch coverage (manual, source `data-store-reducer.ts:119-320`):

| Action | Covered | Gap |
|---|---|---|
| check-in upcoming/completed/unknown/cancelled | yes | no seed `absent`; no `remaining` clamp `max(0,…)` khi done≥total |
| cancel-lesson | shape yes | unknown id |
| mark-invoice-paid | paid / unknown / already-paid | — |
| grade-assignment | a1 yes | unknown id |
| add-student / add-class / add-syllabus | yes | empty objectives/materials `"—"` fallback trên add-lesson |
| assign-syllabus | yes | unknown classId |
| add-module | seed keep 12 + post-create 0 | unknown syllabus |
| edit-module | totals yes | unknown module |
| add-lesson | recompute yes | unknown module |
| **edit-lesson** | **no** | live modal `edit-lesson-modal.tsx:49` vẫn dispatch |
| update-class-notes | yes | — |
| default | no | cần invalid type |

Views: test khóa field `pkg.done/remaining/total` mà students/tuition/class roster đọc. Không claim StatCards hardcoded (đúng non-goal). Dashboard risk membership (tag/`atRisk`) không assert explicit ngoài s4 giữ `"nợ học phí"`.

`sessionsDone` gap **locked**: check-in l3 `next.classes === before.classes`.

## Failed Tests

None.

## CI contract vs issue #4 / phase-03

| Check | Result | Evidence |
|---|---|---|
| YAML step exact `pnpm test` | PASS | `ci.yml:32` |
| root `test` = `turbo run test && pnpm test:ci-workflow` | PASS | `package.json:19` |
| `turbo.json` `tasks.test` | PASS | `turbo.json:16-18` |
| web script `vitest run` | PASS | `apps/web/package.json:13` |
| Vitest ≥ 4.1 | PASS | resolved 4.1.10 |
| regex không match `pnpm test:ci-workflow` as the YAML step | PASS | anchored `/^\s+- run: pnpm test\s*$/m` |
| no `biome check --write` in CI | PASS | contract `doesNotMatch` |
| no `${{ secrets.` | PASS | contract |
| dummy `VITE_SERVER_URL` | PASS | `ci.yml:20` |
| `reducer` named export + `data-store` re-export `Action` | PASS | `data-store-reducer.ts:119`; `data-store.tsx:9,21,38` |
| no leftover `function reducer` in `data-store.tsx` | PASS | file 64 lines; only import |

Turbo skip-missing-script: `Running test in 8 packages` → **Tasks 1 successful, 1 total**. Auth/config/db/env/infra/ui/server không có `test` → skip, không fail.

## Performance Metrics

| Gate | Wall | Note |
|------|------|------|
| web vitest | 169–253ms | 19 tests 8–10ms. Không chậm |
| `pnpm test` | ~1s | turbo 893ms + node:test 51ms |
| contract | 55–74ms | file read, deterministic |
| check-types cached | 1.275s | FULL TURBO 4/4 |
| check-types web --force | 11.833s | vite build + tsc |
| biome | 130ms | 117 files |

Không flake. Không leak. Suite < 1s.

## Build Status

- **Assigned build cmd**: không có trong list 5 lệnh. **web `vite build` đã chạy** qua `check-types` (`vite build && tsc --noEmit`) — force exit 0.
- **Monorepo `pnpm build`**: không chạy (ngoài scope lệnh được giao). CI YAML vẫn có step này.
- **Dependencies**: vitest 4.1.10 trên `web`. Không thêm Playwright/Testing Library.
- **Biome**: exit 0, 0 error. Warning pre-existing (không do diff):

| Level | Location | Rule |
|-------|----------|------|
| info | `app-shell.tsx:50` | `useExhaustiveDependencies` (`pathname`) |
| info | `biome.json:39` | `recommended` deprecated → `preset` |
| warn | `app-shell.tsx:70` | unused suppression `useKeyWithClickEvents` |
| warn | `add-syllabus-modal.tsx:16` | unused `data` |
| warn | `schedule.tsx:5` | unused `Button` |
| warn | `schedule.tsx:6` | unused `Card` |
| warn | `schedule.tsx:36` | unused suppression `noArrayIndexKey` |
| warn | `$syllabusId.tsx:84` | unused `pct` |
| warn | `tuition.tsx:25` | unused `INV_VARIANT` |

File mới (`data-store-reducer.ts`, `*.test.ts`, `vitest.config.ts`) **không** xuất hiện trong biome output.

## Critical Issues

None blocking issue #4 AC trên bằng chứng local.

## Residual (không fail AC)

1. **Chưa có GitHub Actions run.** Proof local only. First `ubuntu-latest` + frozen lockfile + turbo cold cache chưa thấy.
2. **`edit-lesson` untested.** Phase-02 #7 liệt kê; plan.md AC không bắt tên action. Live dispatch vẫn tồn tại.
3. **Không có coverage %.** 80% threshold không đo được. Manual: 12/13 action types.
4. **Contract không lock thứ tự steps.** Verified tay: biome → `pnpm test` → check-types → build.
5. **`turbo.json` `test` không `cache: false`.** Unit thuần OK; CI cold cache anyway.
6. **check-types lần 1 cache hit** (shared worktree). Mitigated bằng `--force` web exit 0.

## Recommendations

1. **P0 ship:** push `feat/web-app-test-suite` + xem `gh run view`. Fail → sửa CI/lockfile only.
2. **P2:** thêm 1 test `edit-lesson` — đổi title, `totalLessons` không đổi (count giữ), field overwrite + empty → `"—"`.
3. **P3:** optional check-in khi `remaining=0` (clamp); check-in `absent` (cần fixture synthetic, seed không có `absent`).
4. **P3:** dọn 7 biome warn (ngoài scope #4).
5. **P3:** bật required check `CI / quality` trên `develop`/`main`.

## Next Steps

1. Lead: ship sau first GH run xanh.
2. Không block merge vì `edit-lesson` — ghi follow-up nếu muốn khóa đủ 13 action.
3. Docs evergreen: **none** — không đổi user-facing behavior; chỉ thêm test runner + CI step.

## Unresolved Questions

- First GitHub Actions run trên `ubuntu-latest` đã live-pass chưa? Tester không push.
- Có muốn khóa `edit-lesson` trước merge hay follow-up?

---

Status: DONE_WITH_CONCERNS
Summary: 19/19 Vitest + CI contract + 5 lệnh assigned đều exit 0. Concern: proof local-only, `edit-lesson` chưa test, không có coverage runner.
Concerns/Blockers: First live Actions run chưa verify. `edit-lesson` gap vs phase-02 #7 — không fail plan.md AC.
