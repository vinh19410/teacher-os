# Code Review — pending web app test suite (issue #4)

**Date:** 2026-08-16
**Mode:** pending worktree vs develop `cb21e759` (cùng SHA; implement chưa commit)
**Plan:** `plans/260816-1640-add-automated-web-app-test-suite/`
**Reviewer session:** source + plan + tester log. Không có shell tool trong session này — không re-run lệnh tươi.

## Code Review Summary

### Scope
- Files (10):
  - `.github/workflows/ci.yml`
  - `package.json`, `turbo.json`, `pnpm-lock.yaml`
  - `scripts/ci-workflow.test.mjs`
  - `apps/web/package.json`, `apps/web/vitest.config.ts`
  - `apps/web/src/lib/data-store.tsx`
  - `apps/web/src/lib/data-store-reducer.ts` (new)
  - `apps/web/src/lib/data-store-reducer.test.ts` (new)
- LOC: reducer extract ~321; test ~288; provider còn 64. Net ~+400 test/config, product logic không thêm.
- Focus: pending extract + Vitest + CI gate
- Scout findings: 27 consumer `useData`/`DataProvider` vẫn import `@/lib/data-store`; 0 importer `Action` ngoài provider; search/auth/UI không đụng; `sessionsDone` vẫn chỉ đọc; `edit-lesson` live dispatch không có test

### Overall Assessment
Spec **PASS**. Product reducer **move, không rewrite**. Public contract `DataProvider`/`useData`/`export type { Action }` giữ. AC plan.md đủ. Residual: `edit-lesson` (phase-02 #7) chưa khóa; vài assert shape lỏng; proof test/biome/types lấy từ tester + turbo log, không phải run độc lập session này.

**Score: 8.8/10**

### Mandatory checks

| # | Check | Verdict | Evidence |
|---|---|---|---|
| (a) | Mọi AC plan.md | **PASS** | bảng AC dưới |
| (b) | Không regress blast-radius | **PASS** | switch byte-equivalent vs develop `data-store.tsx`; views chỉ đọc cùng field |
| (c) | Không breaking public contract | **PASS** | `Action` vẫn type-export từ `data-store.tsx`; `useReducer`/`useData` signature cũ; không đổi env/schema/API |
| (d) | Pattern hiện có | **PASS** | Vitest tách `vitest.config.ts` (tránh PWA plugin); CI 1 job; turbo `dependsOn: ["^test"]` như `check-types` |
| (e) | lint/type/build | **PASS (second-hand)** | tester: biome 0 err; `check-types --force` web 0; vite build trong log. Session này không tự chạy |

### Explicit flags (bắt buộc)

| Câu hỏi | Kết luận | Evidence |
|---|---|---|
| Cook **rewrite** switch vs **move**? | **MOVE.** Chỉ thêm `export` trước `function reducer`. Mọi `case` + helper `uid` / `recomputeTotalLessons` / `mapSyllabus` / `mapModule` / `Action` union khớp develop `apps/web/src/lib/data-store.tsx:23-333`. | so file gốc worktree chính vs `data-store-reducer.ts:11-320` |
| `Action` trong local scope cho `Dispatch<Action>`? | **CÓ.** `import { type Action, reducer }` rồi `export type { Action }` — không phải `export type { Action } from "..."` một mình. | `data-store.tsx:9,21,25` |
| Còn `function reducer` trong `data-store.tsx`? | **KHÔNG.** Grep 0 hit. Chỉ `useReducer(reducer, seedData)`. | `data-store.tsx:38` |

### Spec compliance (plan.md AC)

| # | Requirement | Status | Notes |
|---|---|---|---|
| 1 | Vitest ≥ 4.1; `pnpm --filter web test` exit 0 | PASS | `apps/web/package.json` `vitest@^4.1.10`; lock + `node_modules/vitest` = **4.1.10**. Tester + `apps/web/.turbo/turbo-test.log`: 19/19 |
| 2 | `reducer` named export; `data-store.tsx` re-export `Action`; cùng reducer trong `useReducer` | PASS | `data-store-reducer.ts:119`; `data-store.tsx:9,21,38` |
| 3 | Cover l3 / l1 `toBe` / l9 hole / mark-paid / grade / syllabus create vs mutate / 4 shape actions | PASS | 19 tests trong `data-store-reducer.test.ts`. Thiếu `edit-lesson` — **không** nằm tên trong AC plan.md |
| 4 | Sau l3: s1 `done+1`, `remaining=max(0,total-done)` (=3), `classes` (kể `sessionsDone`) không đổi | PASS | test l3: `remaining` 3 + `next.classes` deep-equal |
| 5 | CI step nguyên lệnh `pnpm test`; contract lock `vitest run` + turbo `test` | PASS | `ci.yml:32`; `ci-workflow.test.mjs:36-71` |
| 6 | biome + check-types xanh, không missing-module trên tip | PASS (tester) | stub đã thay bằng reducer thật; file tồn tại |
| 7 | Không Playwright / Testing Library | PASS | grep `package.json` 0 hit |
| 8 | Không đổi hành vi reducer / seed / search / auth | PASS | move only; `topbar.tsx` không dispatch |

Phase-02 extra vs plan.md: `edit-lesson` (`totalLessons ===` lesson count) **MISSING**. Không fail AC plan.md. Fail invariant #7 phase file.

Plan.md checkbox + 3 phase file vẫn `pending` — tree đã implement. Lead/planner đánh dấu, reviewer không sửa plan.

### Critical Issues
Không.

Không endpoint mới, không secret, không đổi authz, không mutate seed trong test (`structuredClone`). Demo-store IDOR / grade 0–9 ở UI: plan reject, đúng threat model.

### High Priority
Không.

### Medium Priority
1. **[`data-store-reducer.test.ts`](apps/web/src/lib/data-store-reducer.test.ts) — không có `edit-lesson`.** Phase-02 #7 + live `edit-lesson-modal.tsx:49`. Extract giữ case (`data-store-reducer.ts:283-309`) nhưng drift sau này không bị bắt. Fix: 1 test đổi title `sy1-l1`, `totalLessons` giữ 12, `lessonCount` không đổi; optional empty objectives → `"—"`.
2. **`assign-syllabus` tên "only" nhưng không khóa field khác.** `data-store-reducer.test.ts:215-224` chỉ assert `syllabusId` + `syllabi` equal. Rewrite xóa `studentIds` vẫn xanh. Fix: `expect(next.classes.find(c => c.id==="c1")).toEqual({ ...beforeC1, syllabusId: "sy2" })`.

### Low Priority
1. `check-in l3` còn `toBeDefined()` trên `remaining`/`done` sau khi đã `toBe(3)` / `done+1` — phantom, xóa.
2. `check-in l9` không lock `remaining` (s4: 2→1). AC chỉ đòi `done+1`.
3. `add-module` trên `sy1` giữ 12 **không** chứng minh `recompute` (seed đã 12). Test "after create → 0" mới chứng minh. Giữ cả hai.
4. Phase-02 #9 "helper view fields": có `unpaidDebt` + comment; không assert s1 còn trong risk filter sau l3 (tag `sắp hết buổi` sẵn). Đủ cho AC store-field.
5. Contract không lock thứ tự step. YAML thực tế: biome → `pnpm test` → check-types → build. Đúng kiến trúc phase-03.

### Edge Cases Found by Scout
- **Dependents:** 27 file import `@/lib/data-store`. API `useData`/`DataProvider` không đổi. 0 file import `Action` — re-export vẫn bắt buộc (plan #3 / kongming).
- **Data flow:** App và test import **cùng** `reducer` từ `data-store-reducer.ts`. Không có test tự động khóa `data-store.tsx` không paste lại local reducer (plan cấm Testing Library). Review tay: wiring đúng.
- **Check-in cancelled:** reducer +1 (`l9` locked). `lesson-modal.tsx:60` chỉ hiện nút khi `upcoming` — hole không từ modal đó. `dashboard.tsx:66-75` hiện "Điểm danh" mọi status ≠ completed; `l9` day 5 không nằm "hôm nay" (day 2).
- **`sessionsDone`:** `classes/index.tsx:51-84`, `$classId.tsx:98-99` đọc; check-in không ghi. Test khóa gap — đúng characterization, không "fix".
- **Seed:** `l3` upcoming/s1/day2; `l1` completed; `l9` cancelled/s4; `INV-084` overdue 1e6; `a1` `scores: null` (status thực = `late`, không phải "ungraded"); không có `absent`.
- **Purity:** check-in/mark-paid/grade spread mới. `add-module`/`add-lesson` mutate **clone** (`structuredClone` trong `mapSyllabus`). Input seed không mutate nếu test clone.
- **Turbo skip:** chỉ `web` có script `test`. Cùng pattern `check-types` vs `packages/auth` `scripts: {}`. Tester: turbo 8 packages → 1 task.
- **Cycle:** reducer chỉ import `./mock-data`. Không import `data-store`.
- **tsc nuốt `*.test.ts`:** `tsconfig` không exclude; test `import { expect, test, describe } from "vitest"` — không globals. Đúng red-team #9.
- **Race/async:** không. `useReducer` sync.
- **Search/auth:** `topbar.tsx:28-38` không dispatch. Không đụng.

### Side effects
| Effect | Risk | Note |
|---|---|---|
| CI thêm `pnpm test` (~1s local) | intended | fail PR nếu reducer drift |
| `turbo.json` task `test` | thấp | package không script bị skip |
| Module mới `data-store-reducer.ts` | thấp | Fast Refresh: đổi reducer không remount provider; dispatch lần sau dùng fn mới |
| `reducer` public từ file mới | thấp | `data-store.tsx` **không** re-export value `reducer` (trước cũng unexported) |
| lockfile + vitest 4.1.10 | thấp | `pnpm install --frozen-lockfile` trên CI cần lock đã commit |
| `check-types` typecheck test + `vitest.config.ts` | thấp | hiện xanh (tester `--force`) |
| Seed / view copy / auth / env | **không** | không đụng |
| `sessionsDone` / cancelled +1 / grade raw | **không đổi** | lock hành vi cũ |

Không có side effect ẩn lên thanh toán, authz, hay API server (`/api/auth/*` only).

### Positive Observations
- Extract thật sự move: đối chiếu develop gốc, không "dọn" switch.
- Test clone seed, không `toEqual` full seed (tránh dump PII SĐT/phụ huynh lên CI).
- Contract YAML neo `/^\s+- run: pnpm test\s*$/m` — không match `pnpm test:ci-workflow`.
- Cùng module reducer cho provider và test — không dual-implementation.

### Recommended Actions
1. (Optional trước merge) 1 test `edit-lesson` — đóng phase-02 #7.
2. (Optional) Siết `assign-syllabus` bằng spread object equal.
3. Lead: commit pending tree; đánh dấu phase 1–3 sau khi GH Actions `quality` xanh lần đầu.
4. Không sửa reducer / StatCard / authz trong PR này.

### Pre-Landing Review (checklist base + web-app)

Pre-Landing Review: 2 issues (0 critical, 2 informational)

**CRITICAL** (blocking):
- none

**Issues** (non-blocking):
- [`data-store-reducer.test.ts`](apps/web/src/lib/data-store-reducer.test.ts) thiếu `edit-lesson` dù phase-02 #7 và modal còn dispatch
  Fix: thêm case đổi title, `totalLessons`/count không đổi
- [`data-store-reducer.test.ts:215`](apps/web/src/lib/data-store-reducer.test.ts) `assign-syllabus` không chứng minh "chỉ đổi syllabusId"
  Fix: deep-equal class với đúng 1 field đổi

Web overlay (XSS/CSRF/N+1): không apply — diff không đụng render user HTML hay endpoint.

Suppress: không flag file >200 LOC (plan bắt move nguyên switch); không flag demo IDOR; không flag `cache: false` (red-team reject).

### Metrics
- Type Coverage: n/a (không đo). `tsc --noEmit` gồm test file — tester `--force` web exit 0
- Test Coverage: 19/19 Vitest + 1 contract. Manual action matrix 12/13 (`edit-lesson` trống). Không istanbul/c8
- Linting Issues: 0 error trên file mới (tester). 7 warn + 2 info **pre-existing**, ngoài diff

### Plan follow-up
| Item | Tree | plan.md |
|---|---|---|
| Phase 1 Vitest + stub | xong (stub đã thay reducer thật) | vẫn Pending |
| Phase 2 extract + invariants | xong trừ `edit-lesson` | vẫn Pending |
| Phase 3 CI `pnpm test` | xong | vẫn Pending |
| AC checkboxes plan.md | implement đủ | chưa tick |

Docs evergreen: **none** — không đổi hành vi user.

### Unresolved Questions
- Session reviewer không có Bash — không tự `git diff` / `pnpm test` / biome / check-types. Dựa tester report + `.turbo/turbo-test.log` (19/19, vitest 4.1.10) + so source. Lead nên coi first GH run là proof CI thật.
- First `ubuntu-latest` + frozen lockfile đã chạy chưa? Tester không push.
- Có khóa `edit-lesson` trước merge hay follow-up?

---

Status: DONE_WITH_CONCERNS
Summary: Extract là move không rewrite; Action local-scope; không còn `function reducer` trong data-store.tsx. AC plan.md đạt. Concern: `edit-lesson` chưa test; proof lệnh tươi lấy từ tester/log, chưa GH Actions.
Concerns/Blockers: Không block merge vì AC plan.md. Follow-up `edit-lesson` + first Actions run.
