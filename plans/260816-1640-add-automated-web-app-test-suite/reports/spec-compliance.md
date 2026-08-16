# Spec compliance — issue #4 / plan 260816-1640

Date: 2026-08-16
Verdict: PASS

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 1 | Vitest ≥ 4.1; `pnpm --filter web test` exit 0 | PASS | `vitest@4.1.10`; 19 tests green |
| 2 | `reducer` named export from non-React module; `useReducer` uses it; `Action` re-exported | PASS | `data-store-reducer.ts`; `data-store.tsx` imports `{ reducer, type Action }` + `export type { Action }` |
| 3 | Check-in `l3` / `l1` / `l9`; mark-paid; grade; syllabus create vs mutate; 4 extra actions | PASS | `data-store-reducer.test.ts` |
| 4 | After `l3`: s1 done+1 remaining=3; `classes` unchanged | PASS | test "check-in l3" |
| 5 | CI `run: pnpm test`; contract asserts web `vitest run` + turbo `test` | PASS | `ci.yml` + `scripts/ci-workflow.test.mjs` |
| 6 | biome + check-types green on tip | PASS | biome exit 0 (pre-existing warnings only); `VITE_SERVER_URL=... pnpm check-types` exit 0 |
| 7 | No Playwright / Testing Library | PASS | only vitest added |
| 8 | Reducer behavior unchanged | PASS | switch moved, not rewritten; no leftover `function reducer` in `data-store.tsx` |

Unjustified extras: none.
