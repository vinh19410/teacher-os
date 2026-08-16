# Red-team: Assumption Destroyer + Contract Verifier

Plan: `plans/260816-1640-add-automated-web-app-test-suite/`
Date: 2026-08-16
Role: Contract Verifier — mọi consumer của symbol plan sẽ move/đụng. Không viết "update all callers".

Không khen. Chỉ finding có `file:line`.

---

## Finding 1: Outcome "every view" là contract giả — test khóa desync, không đọc view

- **Severity:** Critical
- **Location:** `plan.md` Outcome + Phase 2 section "Invariants to lock" #1 + helper #7
- **Flaw:** Success criterion nói suite fail nếu check-in/mark-paid/grade/syllabus CRUD "desync the numbers every view reads". Phase 2 lại (a) cấm component test, (b) helper tự đọc lại field store, (c) khóa `classes` không đổi — kể cả `sessionsDone`. Ba view đang render tiến độ lớp từ `sessionsDone`, không từ `pkg.*`.
- **Failure scenario:** Check-in `l3` (s1). `pkg.done` 8→9, `remaining` 4→3. Helper pass. `classes/index`, `$classId` StatCard, syllabus-assigned table vẫn `6/12`. User thấy lớp và gói lệch. Suite xanh. Outcome fail mà CI không biết.
- **Evidence:**
  - Plan: "`pnpm test` runs a Vitest suite that fails if check-in, mark-paid, grading, or syllabus CRUD desync the numbers every view reads."
  - Plan Phase 2 #1: "`classes` unchanged (including `sessionsDone`)"
  - Plan Phase 2 #7: helper "not product code"; cite `dashboard.tsx:160-183`, `students/index.tsx:68`, `students/$studentId.tsx:139-140`, `classes/$classId.tsx:139`, `tuition.tsx:77-87`
  - Check-in không ghi `classes`: `data-store.tsx:136-147`
  - View đọc `sessionsDone` (plan bỏ): `classes/index.tsx:51-54,84`, `classes/$classId.tsx:60-62,98-99`, `syllabus/$syllabusId.tsx:242-245`
  - Roster chỉ đọc `pkg` tại `classes/$classId.tsx:139` — đúng 1 ô, không phải "số buổi đã học"
- **Suggested fix:** Đổi outcome: khóa field store mà *một phần* view đọc; liệt kê `sessionsDone` consumers như lỗ hổng đã chấp nhận. Hoặc thêm invariant: sau check-in, `sessionsDone` vẫn cũ *và* document đây là desync sản phẩm, không phải "mọi view đồng bộ".

---

## Finding 2: Fixture "scheduled lesson" không tồn tại; UI check-in ≠ reducer

- **Severity:** High
- **Location:** Phase 2, "Invariants to lock" #1 + "Seed fixtures to prefer"
- **Flaw:** Plan bảo pick lesson `scheduled`. `LessonStatus` chỉ `completed | upcoming | cancelled | absent`. Zero chỗ trong `apps/web` dùng `"scheduled"`. Reducer no-op chỉ khi `completed`. Modal lịch chỉ dispatch check-in khi `upcoming`. Dashboard dispatch mọi lesson không `completed`.
- **Failure scenario:** Implementer viết `seedData.lessons.find(l => l.status === "scheduled")` → `undefined` → test vacuous hoặc throw. Hoặc pick `l9` (`cancelled`) vì "not completed": reducer đổi thành `completed` và +1 `pkg` — UI lesson-modal không bao giờ làm vậy (`upcoming` only). Suite khóa hành vi UI không gọi được, hoặc không khóa hành vi UI thật.
- **Evidence:**
  - Plan: "check-in scheduled lesson"; "pick a scheduled (not completed) lesson with a known `sid`"
  - Type: `mock-data.ts:31` — không có `scheduled`
  - Grep `"scheduled"` trong `apps/web`: 0 hit
  - Reducer: `data-store.tsx:134-135` — `if (!lesson || lesson.status === "completed") return state`
  - Seed upcoming: `l3`–`l8`, `l10`, `l11` (`mock-data.ts:328-425`); cancelled `l9` (`mock-data.ts:394-403`)
  - UI hẹp: `lesson-modal.tsx:60-80` (`status === "upcoming"` mới hiện Điểm danh)
  - UI rộng: `dashboard.tsx:66-75` (mọi non-`completed`)
- **Suggested fix:** Fixture cứng `l3` (s1, `upcoming`) hoặc `status === "upcoming"`. Thêm case `cancelled`/`absent` (reducer vẫn +1). Tách contract UI (modal vs dashboard) khỏi contract reducer.

---

## Finding 3: Phase 1 module-not-found phá `pnpm check-types` — AC plan tự mâu thuẫn

- **Severity:** High
- **Location:** Phase 1 "Tests Before" / Success; `plan.md` Acceptance Criteria
- **Flaw:** Phase 1 bắt test import `./data-store-reducer` trước khi file tồn tại. `apps/web` `check-types` = `vite build && tsc --noEmit`. `tsconfig.json` không `exclude` `*.test.ts`, không `include` hẹp. `tsc` typecheck file test. Plan-level AC đòi `pnpm check-types` xanh. Cook `--tdd --auto` / commit phase 1 không thỏa cả hai.
- **Failure scenario:** Phase 1 xong, `tsc --noEmit` → `Cannot find module './data-store-reducer'`. `vite build` vẫn xanh (không bundle test). Gate `check-types` đỏ trước phase 2. Nếu phase 3 lên CI sớm, job fail cả test lẫn types.
- **Evidence:**
  - Phase 1: "imports `{ reducer }` from `./data-store-reducer`"; "expected to fail with a module-not-found"
  - `plan.md` AC: "`pnpm exec biome check .` and `pnpm check-types` stay green"
  - `apps/web/package.json:10`: `"check-types": "vite build && tsc --noEmit"`
  - `apps/web/tsconfig.json:1-17`: không `include`/`exclude`; `"types": ["vite/client"]`
  - Ship: "`/ak:cook --tdd --auto`"
- **Suggested fix:** Exclude `*.test.ts` khỏi `tsc` app, hoặc tsconfig `references` riêng cho test. Hoặc phase 1 tạo module stub `export function reducer() {}` để tsc xanh, test invariant vẫn đỏ. Đừng để AC "check-types green" đi với missing module.

---

## Finding 4: `add-syllabus` cố ý lệch `totalLessons` — helper "sum lessons" vỡ ngay AC

- **Severity:** High
- **Location:** Phase 2 invariant #6 + Success Criteria "`totalLessons` matches lesson count"
- **Flaw:** `add-syllabus` copy `payload.totalLessons`, set `modules: []`, không gọi `recomputeTotalLessons`. Modal default `"10"`. AC nói total khớp số lesson sau add/edit lesson — dễ bị implement thành assert toàn cục mọi syllabus mọi action.
- **Failure scenario:** Test `add-syllabus` với payload như modal (`totalLessons: 10`). Helper `totalLessons === sum(module.lessons.length)` fail (10 vs 0). Implementer "fix" reducer: gọi `recomputeTotalLessons` lúc add → `totalLessons` thành 0. Đổi hành vi sản phẩm, trái non-goal. Hoặc bỏ test add-syllabus → CRUD AC thủng.
- **Evidence:**
  - Plan #6: "`add-syllabus` appends with `modules: []`"; recompute chỉ nêu cho `add-module` / `add-lesson` / `edit-lesson`
  - Reducer: `data-store.tsx:215-220` — spread payload, không recompute
  - Recompute chỉ: `data-store.tsx:244`, `289`, `316` (không có add-syllabus / edit-module)
  - Modal: `add-syllabus-modal.tsx:21,31-40` — `total` default `"10"`
  - View đọc `sy.totalLessons` *và* `all.length` riêng: `syllabus/$syllabusId.tsx:81-84,115` — StatCard 10, tiến độ 0/0
  - Consumers `totalLessons`: `syllabus/index.tsx:73`, `classes/$classId.tsx:104`, `syllabus-progress.tsx:46`
- **Suggested fix:** Invariant tách: sau `add-syllabus`, `totalLessons === payload.totalLessons` và `modules.length === 0` (lệch là hành vi hiện tại). Chỉ assert sum sau add/edit lesson / add-module.

---

## Finding 5: Cross-view dashboard/tuition giả — risk theo tag; StatCard cứng ngoài non-goal

- **Severity:** High
- **Location:** Phase 2 helper #7; `plan.md` Non-goals (chỉ loại weekly StatCard dashboard)
- **Flaw:** Dashboard "Học viên rủi ro" filter `atRisk` / tag, không `pkg.remaining`. Ô remaining chỉ render cho học viên đã có tag. Tuition StatCard `21.0tr` / `1.9tr` / `2` cứng — không nằm trong non-goal. `isAlmostOut` (`remaining <= 3`) không có consumer view.
- **Failure scenario:** Check-in `l4` (s2, remaining 7→6). s2 không tag risk, không `atRisk` → không có hàng dashboard. s2 không nằm `studentIds` lớp nào → roster không hiện. Helper "dashboard/students/tuition/class đọc cùng field" với s2 là no-op. Mark-paid `INV-084`: bảng nợ store đổi; StatCard tuition vẫn `1.9tr`; "Cần xử lý" vẫn "Quốc Bảo nợ 1.000k". Suite xanh.
- **Evidence:**
  - Plan non-goal: "Rewriting hardcoded dashboard weekly StatCards (`7.5`, `6.2tr`, `2.0tr`, `2`)" — không nhắc tuition/reports/notifs
  - Plan helper: "dashboard (`dashboard.tsx:160-183`)" — đó là *trong* `.map` của `risk`, không phải filter
  - Filter: `dashboard.tsx:20-25`
  - Cần xử lý cứng: `dashboard.tsx:89-129`
  - Weekly cứng: `dashboard.tsx:136-147`
  - Debt chỉ trong risk rows: `dashboard.tsx:160-166,181`
  - Tuition cứng: `tuition.tsx:38-50`
  - `isAlmostOut` định nghĩa `mock-data.ts:182-184`; grep consumer view: chỉ definition
  - s2 không trong lớp: `mock-data.ts:640` `["s1","s4"]`, `656` `["s3"]`, `671` `["s5"]`
  - s2 lesson `l4`: `mock-data.ts:337-347`
- **Suggested fix:** Helper pin student đã nằm risk list (s1/s4) và class có `studentIds` chứa họ (c1). Đưa tuition/reports/notifs hardcoded vào non-goal, hoặc outcome thôi nói "every view".

---

## Finding 6: 4 action đang live không khóa — "every dispatch still works" không có test

- **Severity:** High
- **Location:** Phase 2 Requirements + invariant matrix (thiếu 4 type)
- **Flaw:** `Action` có 13 type. 4 type có caller UI thật nhưng 0 invariant: `cancel-lesson`, `add-student`, `add-class`, `update-class-notes`. Extract "byte-equivalent" không được đo cho các nhánh này. Test không mount `DataProvider` — 24 caller `useData` phụ thuộc `useReducer(reducer, seedData)` không được chứng minh.
- **Failure scenario:** Extract sửa `cancel-lesson` hoàn `pkg` (nhầm "cải thiện"). `lesson-modal.tsx:66` vẫn dispatch. Suite xanh. Hoặc `useReducer` trỏ nhầm copy cũ trong `data-store.tsx` trong khi test import file mới — app và test lệch, tsc vẫn xanh nếu cả hai tồn tại.
- **Evidence:**
  - Plan: "every existing `dispatch({ type })` still works"; matrix chỉ check-in / mark-paid / grade / syllabus*
  - Callers không cover:
    - `cancel-lesson` — `lesson-modal.tsx:66`
    - `add-student` — `add-student-modal.tsx:36-46`
    - `add-class` — `add-class-modal.tsx:31-42`
    - `update-class-notes` — `classes/$classId.tsx:222-226`
  - `DataProvider` chỉ `app-shell.tsx:3,65`; `useReducer(reducer, seedData)` `data-store.tsx:350`
  - Phase 2: test file import `./data-store-reducer`, không import `./data-store`
- **Suggested fix:** Thêm no-op/shape test tối thiểu cho 4 action (cancel không đụng `pkg`; add-student append + `pkg.done===0`; add-class `sessionsDone===0`; notes chỉ đổi 1 class). Một assert `data-store.tsx` re-export/import cùng `reducer` test dùng.

---

## Finding 7: `export type Action` là public surface — plan cho phép drop im lặng

- **Severity:** Medium
- **Location:** Phase 2 Architecture: "re-export Action if callers need it"
- **Flaw:** Hôm nay `Action` *đang* export từ `@/lib/data-store`. Grep đúng: không ai import. "If callers need it" = được xóa export. Đó là breaking change public module, không phải no-op extract. `DataStore.dispatch` vẫn `Dispatch<Action>` nội bộ — caller infer từ `useData()`, chưa import type.
- **Failure scenario:** Phase 2 không re-export. PR/tooling ngoài (hoặc phase sau type-annotate `dispatch`) `import type { Action } from "@/lib/data-store"` fail. Plan tuyên bố "provider API unchanged" nhưng cắt named export.
- **Evidence:**
  - `data-store.tsx:27` `export type Action =`
  - `data-store.tsx:337` `dispatch: Dispatch<Action>`
  - Grep `Action` ngoài file này: 0 import
  - Plan: "re-export Action if callers need it. Do not invent a public barrel."
- **Suggested fix:** Bắt buộc `export type { Action } from "./data-store-reducer"` trong `data-store.tsx`. API named-export giữ nguyên.

---

## Finding 8: Grade "cross-view" không khóa số band view thật sự render

- **Severity:** Medium
- **Location:** Phase 2 invariant #5; `plan.md` Outcome (grading)
- **Flaw:** Invariant chỉ `scores` + `status: "graded"`. Ba view tính band khác nhau. `grade-modal` validate 0–9 rồi bỏ `feedback` (không vào store). Test reducer không bắt lệch công thức.
- **Failure scenario:** Extract hoặc follow-up đổi `averageBand`. List/student detail đổi, assignment detail (`(sum/4).toFixed(1)`) không. Suite vẫn pass. Outcome "grading desync the numbers every view reads" không được enforce.
- **Evidence:**
  - Plan #5: "matching assignment `scores` + `status: \"graded\"`"
  - Writer: `grade-modal.tsx:42` (feedback `grade-modal.tsx:21,99-104` không dispatch)
  - `averageBand`: `mock-data.ts:165-171` — `Math.round((sum/4)*10)/10`
  - Dùng `averageBand`: `assignments/index.tsx:10,68-70`; `students/$studentId.tsx:13,248-253`
  - Tự tính: `assignments/$assignmentId.tsx:42-49` — `(sum/4).toFixed(1)`
- **Suggested fix:** Sau `grade-assignment`, assert `averageBand(scores)` và công thức inline detail cùng một fixture (ví dụ 6/6.5/6/6.5). Hoặc outcome thôi nhận "lock raw scores".

---

## Finding 9: CI contract Phase 3 tự mâu thuẫn — regex lỏng + root `test` ≠ quyết định #8

- **Severity:** Medium
- **Location:** Phase 3 Tests Before vs Risk; `plan.md` decision 8 vs Phase 3 script
- **Flaw:** Tests Before bắt `assert.match(yaml, /pnpm test/)`. Risk cùng file nói pattern đó match nhầm `pnpm test:ci-workflow`. Decision 8: root test = `turbo run test` + `node --test scripts/*.test.mjs`. Phase 3 viết `"test": "turbo run test && pnpm test:ci-workflow"` — chỉ 1 file, không glob. Contract không assert `turbo.json` task hay script web `vitest run`.
- **Failure scenario:** YAML comment/`run: pnpm test:ci-workflow` làm contract xanh khi không có step suite. Hoặc thêm `scripts/foo.test.mjs` — `pnpm test` không chạy (mất glob). `turbo run test` với 7 package không có script `test`: plan *đoán* skip; worktree không có `node_modules/turbo` để verify.
- **Evidence:**
  - Phase 3 Tests Before: "`assert.match(yaml, /pnpm test/)`"
  - Phase 3 Risk: "Root `pnpm test` matching too loosely... `pnpm test:ci-workflow` contains `pnpm test`... `/run:\\s*pnpm test\\s*$/m`"
  - `plan.md` #8: "`turbo run test` + existing `node --test scripts/*.test.mjs`"
  - Phase 3: `"test": "turbo run test && pnpm test:ci-workflow"`
  - Contract hiện tại: `scripts/ci-workflow.test.mjs:23-25` (biome / check-types / build) — không có test
  - `package.json:19` chỉ `test:ci-workflow`
  - Workspace không `test` script: `apps/web`, `apps/server`, `packages/{ui,env,db,auth,infra,config}`
  - `packages/auth/package.json:12` `"scripts": {}`; `packages/config/package.json` không có scripts
  - `turbo.json:4-32` không có task `test`
- **Suggested fix:** Contract dùng regex Risk (anchor `run: pnpm test`). Root script giữ glob `node --test scripts/*.test.mjs`. Assert thêm `turbo.json` có `test` và `apps/web` script `vitest run`. Verify `turbo run test` trên repo thật trước khi ghi "skip by default".

---

## Consumer map (đủ, không "all callers")

### `reducer` — `data-store.tsx:131`

| File:line | Role |
|---|---|
| `data-store.tsx:131-333` | định nghĩa (unexported) |
| `data-store.tsx:350` | `useReducer(reducer, seedData)` — consumer runtime duy nhất |
| *(planned)* `data-store-reducer.ts` + `data-store-reducer.test.ts` | move + test |

### `Action` — `data-store.tsx:27` (`export type`)

| File:line | Role |
|---|---|
| `data-store.tsx:27-106` | định nghĩa |
| `data-store.tsx:131` | param reducer |
| `data-store.tsx:337` | `DataStore.dispatch` |
| External import | **không có** |

### `uid` / `recomputeTotalLessons` / `mapSyllabus` / `mapModule`

| Symbol | Def | Uses |
|---|---|---|
| `uid` | `data-store.tsx:23` | `180` add-student, `206` add-class, `238` add-module, `279` add-lesson. **Không** add-syllabus (id ở modal `add-syllabus-modal.tsx:30`) |
| `recomputeTotalLessons` | `108-112` | `244` add-module, `289` add-lesson, `316` edit-lesson |
| `mapSyllabus` | `115-121` | add/edit module/lesson |
| `mapModule` | `123-129` | add/edit lesson |

### `DataProvider` — `data-store.tsx:349`

| File:line | Role |
|---|---|
| `app-shell.tsx:3` | import |
| `app-shell.tsx:65-79` | wrap duy nhất |

### `useData` — `data-store.tsx:370`

| File:line | Import | Call | Store API used |
|---|---|---|---|
| `dashboard.tsx:9,17` | yes | yes | `data`, `dispatch`, `studentById` |
| `topbar.tsx:3,14` | yes | yes | `data` (search + `notifs`) |
| `students/index.tsx:11,22` | yes | yes | `data` |
| `students/$studentId.tsx:12,63` | yes | yes | `studentById`, `data` |
| `tuition.tsx:13,33` | yes | yes | `data`, `dispatch` |
| `classes/index.tsx:11,21` | yes | yes | `data` |
| `classes/$classId.tsx:19,43` | yes | yes | `classById`, `syllabusById`, `studentById`, `data`, `dispatch` |
| `schedule.tsx:8,25` | yes | yes | `data`, `studentById` |
| `assignments/index.tsx:9,31` | yes | yes | `data` |
| `assignments/$assignmentId.tsx:9,33` | yes | yes | `assignmentById`, `studentById`, `data` |
| `syllabus/index.tsx:11,21` | yes | yes | `data` |
| `syllabus/$syllabusId.tsx:20,63` | yes | yes | `syllabusById`, `data` |
| `reports.tsx:11,62` | yes | yes | `data` |
| `lesson-modal.tsx:4,14` | yes | yes | `lessonById`, `studentById`, `dispatch` |
| `add-student-modal.tsx:5,16` | yes | yes | `dispatch` |
| `add-class-modal.tsx:5,14` | yes | yes | `data`, `dispatch` |
| `add-syllabus-modal.tsx:5,16` | yes | yes | `data`, `dispatch` |
| `assign-syllabus-modal.tsx:5,18` | yes | yes | `data`, `dispatch` |
| `add-module-modal.tsx:5,16` | yes | yes | `syllabusById`, `dispatch` |
| `edit-module-modal.tsx:5,18` | yes | yes | `syllabusById`, `dispatch` |
| `add-lesson-modal.tsx:5,19` | yes | yes | `dispatch` |
| `edit-lesson-modal.tsx:5,21` | yes | yes | `syllabusById`, `dispatch` |
| `grade-modal.tsx:5,16` | yes | yes | `assignmentById`, `dispatch` |
| `add-invoice-modal.tsx:5,14` | yes | yes | `data` — **không** dispatch (submit chỉ `onClose`, `:20-24`) |
| `create-report-modal.tsx:5,25` | yes | yes | `data` — **không** dispatch (submit chỉ `onClose`, `:33-36`) |

`useData` ngoài `data-store.tsx`: **25 file**. Extract phải giữ path `@/lib/data-store`. Plan đúng ở chỗ này; sai ở chỗ không test wiring.

### `dispatch({ type })` — 13 type, 13 call site (2 type check-in)

| type | File:line |
|---|---|
| `check-in` | `dashboard.tsx:74`; `lesson-modal.tsx:75` |
| `cancel-lesson` | `lesson-modal.tsx:66` |
| `mark-invoice-paid` | `tuition.tsx:174-178` |
| `grade-assignment` | `grade-modal.tsx:42` |
| `add-student` | `add-student-modal.tsx:36` |
| `add-class` | `add-class-modal.tsx:31` |
| `add-syllabus` | `add-syllabus-modal.tsx:31` |
| `assign-syllabus` | `assign-syllabus-modal.tsx:29` |
| `add-module` | `add-module-modal.tsx:28` |
| `edit-module` | `edit-module-modal.tsx:38` |
| `add-lesson` | `add-lesson-modal.tsx:33` |
| `edit-lesson` | `edit-lesson-modal.tsx:48` |
| `update-class-notes` | `classes/$classId.tsx:222` |

Phase 2 **không** lock: `cancel-lesson`, `add-student`, `add-class`, `update-class-notes`.

### `seedData` / helpers số

| Symbol | File:line | Consumers |
|---|---|---|
| `seedData` | `mock-data.ts:186` | `data-store.tsx:20,350`; test (planned) |
| `fmtK` | `mock-data.ts:161` | `dashboard.tsx:10,183` |
| `fmtVND` | `mock-data.ts:157` | students/tuition tables |
| `averageBand` | `mock-data.ts:165` | `assignments/index.tsx:10,70`; `students/$studentId.tsx:13,253` — **không** `$assignmentId` |
| `isAlmostOut` | `mock-data.ts:182` | **zero** view |

### Test scripts / CI contract

| Symbol | File:line | Consumers |
|---|---|---|
| `test:ci-workflow` | `package.json:19` | người/CI gọi tay; Phase 3 nhét vào root `test` |
| contract asserts | `scripts/ci-workflow.test.mjs:10-36` | `node --test` only |
| CI steps | `.github/workflows/ci.yml:31-33` | biome, check-types, build — **chưa** `pnpm test` |
| web `test` | không có | Phase 1 thêm `vitest run` |
| turbo `test` | không có (`turbo.json:4-32`) | Phase 3 thêm |
| vitest trong lock | transitive `vitest@4.1.10` (better-auth/alchemy) | **không** phải runner web; `apps/web/package.json` không có `test`/`vitest` |

---

## Claim plan vs repo (fact-check)

| Claim | Verdict |
|---|---|
| No web test runner | Đúng — `apps/web/package.json` không `test`/`vitest` |
| Root only `test:ci-workflow` | Đúng — `package.json:19` |
| CI không có test step | Đúng — `ci.yml:31-33` |
| `reducer` unexported line 131 | Đúng — `data-store.tsx:131` |
| Check-in không ghi `sessionsDone` | Đúng — `data-store.tsx:136-147` |
| Dashboard risk/debt `160-183` | Một phần — debt/remaining trong row; filter risk là `20-25` (tag) |
| Weekly StatCard cứng `136-147` | Đúng |
| Không import `Action` ngoài store | Đúng |
| Line cites students/tuition/class roster | Đúng `68` / `139-140` / `139` / `77-87` |
| "scheduled" lesson trong seed | **Sai** |
| "every view" đọc cùng số sau check-in | **Sai** — `sessionsDone` + StatCard cứng + risk theo tag |
| Turbo skip package không `test` | **Chưa verify** trong worktree (`node_modules/turbo` absent) |
| Vitest 4.1 + Vite 8 | Không verify lại docs; `vite@^8.1.5` tại `apps/web/package.json:42` |

---

## Unresolved

- Turbo 2.10.7 có fail `turbo run test` khi `packages/auth` `scripts: {}` và `packages/config` không có scripts? Chưa chạy được — không có binary turbo local.
- Issue #4 text gốc có đòi Playwright/e2e không? Plan nói "names both as examples" — không đọc issue trong scope file.

Status: DONE
Summary: Plan khóa reducer unit, không khóa contract view; 3 giả định load-bearing (every-view, scheduled fixture, check-types xanh lúc phase 1) vỡ khi đối chiếu consumer thật.
Concerns/Blockers: Sửa outcome + fixture `upcoming` + tách add-syllabus khỏi sum-lessons + exclude test khỏi `tsc` (hoặc stub module) trước khi cook --tdd.
