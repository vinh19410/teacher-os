# Red-team — Failure Mode Analyst

Plan: `plans/260816-1640-add-automated-web-app-test-suite/`
Role: Fact Checker + Contract Verifier
Date: 2026-08-16
Lens: Murphy — race/data-loss ít; recovery + gate giả + fixture sai + invariant lock ngược.

## Scope

- Files đọc: `plan.md`, `phase-01-start.md`, `phase-02-extract-reducer-and-lock-invariants.md`, `phase-03-wire-tests-into-ci-quality-gate.md`
- Source đối chiếu: `apps/web/src/lib/data-store.tsx`, `apps/web/src/lib/mock-data.ts`, views/modals cited, `.github/workflows/ci.yml`, `scripts/ci-workflow.test.mjs`, `package.json`, `apps/web/package.json`, `turbo.json`, `pnpm-workspace.yaml`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`
- LOC plan ~300. Không chạy lint/build/test (đúng lệnh). Grep-verified.

Không khen. Chỉ finding.

---

## Finding 1: Status `"scheduled"` không tồn tại trong seed hay type

- **Severity:** High
- **Location:** Phase 2, section "Invariants to lock" + "Seed fixtures to prefer"; `plan.md` Acceptance Criteria
- **Flaw:** Plan bảo lock "check-in scheduled lesson" và "pick a scheduled (not completed) lesson". `LessonStatus` chỉ có `completed | upcoming | cancelled | absent`. Không có `"scheduled"`. Check-in no-op **chỉ** khi `status === "completed"` (hoặc id không tồn tại). `cancelled` / `absent` / `upcoming` đều increment `pkg.done`.
- **Failure scenario:** Implementer `lessons.find(l => l.status === "scheduled")` → `undefined` → test check-in không lock gì, hoặc họ tự bịa fixture. Ai đọc "not completed" theo đúng chữ chọn `l9` (`cancelled`) thì check-in **đổi cancelled → completed và +1 gói**. Suite "xanh" trên hành vi sai lệch với ngôn ngữ plan. Sau này sửa guard check-in: test không bắt.
- **Evidence:**
  - `apps/web/src/lib/mock-data.ts:31` — `export type LessonStatus = "completed" | "upcoming" | "cancelled" | "absent"`
  - `apps/web/src/lib/mock-data.ts:334` `l3` = `"upcoming"`; `:400` `l9` = `"cancelled"`. Grep `status: "scheduled"` trong seed: 0 hit.
  - `apps/web/src/lib/data-store.tsx:135` — `if (!lesson || lesson.status === "completed") return state;`
  - Plan: *«check-in scheduled lesson»*; *«pick a scheduled (not completed) lesson»*; AC *«A check-in on a scheduled lesson increments…»*
- **Suggested fix:** Đổi mọi chỗ thành `upcoming`. Liệt kê explicit id (`l3`/`l4`/`l5`). Thêm case: check-in `cancelled`/`absent` = hành vi hiện tại (vẫn +1) hoặc ghi rõ non-goal.

---

## Finding 2: "Invoice sums mọi view đọc" là claim sai — 4/5 citation không cộng nợ

- **Severity:** High
- **Location:** Phase 2, invariant 7 "Cross-view numeric consistency helper"
- **Flaw:** Plan bảo `pkg.done/remaining/total` **và** unpaid/overdue invoice sums là số mà dashboard, students list, student detail, class roster, **và** tuition `77-87` đã render. Chỉ dashboard risk table cộng invoice. Bốn view kia không cộng nợ. Tuition `77-87` là `pkg.done` / `pkg.remaining`. Tổng nợ nhìn thấy trên tuition là StatCard hardcode `"1.9tr"`.
- **Failure scenario:** Helper "cross-view" assert unpaid sum sau `mark-invoice-paid` "như tuition render" → hoặc fail vì không có field đó, hoặc bịa công thức không khớp UI. `mark-paid` INV-084 (1.000k) / INV-086 (900k): table đổi, StatCard `"1.9tr"` (`tuition.tsx:41-45`) và dashboard weekly `"2.0tr"` (`dashboard.tsx:138-141`) **không đổi**. Suite vẫn xanh. Issue #4 "check-in ↔ package ↔ tuition remaining" bị giả.
- **Evidence:**
  - `dashboard.tsx:160-166` — **duy nhất** `.filter(overdue|unpaid).reduce(amount)`
  - `students/index.tsx:68` — `{s.pkg.remaining} / {s.pkg.total}` (không invoice)
  - `students/$studentId.tsx:138-140` — total/done/remaining; tab tuition list từng invoice, không sum
  - `classes/$classId.tsx:139` — `{s.pkg.remaining}/{s.pkg.total}`
  - `tuition.tsx:76-87` — `pkg.done/total` + `pkg.remaining`; `:40-50` StatCard `"21.0tr"` / `"1.9tr"` / `"2"`
  - Plan: *«unpaid/overdue invoice sums are the numbers dashboard (dashboard.tsx:160-183), students list (students/index.tsx:68), student detail (…:139-140), class roster (…:139), and tuition (tuition.tsx:77-87) already render»*
- **Suggested fix:** Cắt invoice sum khỏi mọi citation trừ `dashboard.tsx:160-166`. Tuition assert `pkg.*` ở 76-87. Ghi rõ StatCard nợ là hardcode (non-goal) — không được gọi là "số view đọc từ next state".

---

## Finding 3: Outcome/AC hứa fail khi desync; Phase 2 **lock** desync

- **Severity:** High
- **Location:** `plan.md` Outcome + AC vs Phase 2 invariant 1 + Load-bearing #4
- **Flaw:** Outcome: suite fail nếu check-in/mark-paid/grade/syllabus CRUD "desync the numbers every view reads". Phase 2 bắt `classes` **không đổi** (kể cả `sessionsDone`). Check-in không ghi `classes`. Seed **đã** desync: `s1.pkg.done = 8` nhưng chỉ `l1` completed. Class `c1.sessionsDone = 6` trong khi lesson completed của roster `s1+s4` chỉ có `l1`.
- **Failure scenario:** Check-in `l3` (s1): `pkg.done` 8→9, `remaining` 4→3. Class detail vẫn `6/12` (`classes/$classId.tsx:98-101`), list lớp vẫn `6/12` (`classes/index.tsx:51-54,84`). Progress % không đổi. Test **fail nếu ai sửa đúng** `sessionsDone++`. Gate chất lượng chứng nhận bug. AC "dashboard/students/tuition all read those fields from the same next state" cũng sai với StatCard hardcode (`dashboard.tsx:136-147`).
- **Evidence:**
  - `data-store.tsx:133-147` — check-in chỉ `lessons` + `students`; không đụng `classes`
  - `mock-data.ts:197-201` s1 `done: 8`; `:312` chỉ `l1` completed cho s1
  - `mock-data.ts:640-643` c1 `studentIds: ["s1","s4"]`, `sessionsDone: 6`
  - Outcome: *«fails if check-in, mark-paid, grading, or syllabus CRUD desync the numbers every view reads»*
  - Phase 2: *«`classes` unchanged (including `sessionsDone`)»*
  - Load-bearing #4: *«Lock current reducer behavior, including gaps (check-in does not bump `classes.sessionsDone`…)»*
- **Suggested fix:** Đổi Outcome/AC thành characterization test: "fail nếu reducer **lệch hành vi hiện tại**", không phải "fail nếu view desync". Liệt kê gap bị lock (`sessionsDone`, StatCard, `pkg.done` ≠ count completed).

---

## Finding 4: Dashboard `:160-183` không phải nguồn remaining cho mọi học viên

- **Severity:** High
- **Location:** Phase 2, invariant 7 + seed guidance
- **Flaw:** Risk table chỉ map `risk`. `risk` filter **tags/atRisk**, không phải `remaining`. Citation `:160-183` không chứa filter (filter ở `:20-25`). Upcoming seed: `l4`/`l10` = s2, `l6`/`l11` = s3, `l7` = s5 — **không** vào bảng dashboard.
- **Failure scenario:** "Pick a scheduled lesson with known sid" → chọn `l4` (upcoming, sid rõ). Check-in s2. Helper "dashboard đọc `s2.pkg.remaining`" → dashboard **không render s2**. Test fail hoặc bị skip. Chỉ `l3`/`l8` (s1) và `l5` (s4) là fixture dashboard-hợp lệ. Plan không nói.
- **Evidence:**
  - `dashboard.tsx:20-25` — `s.atRisk || tags "nợ học phí" || tags "sắp hết buổi"`
  - `mock-data.ts:206` s1 tag `sắp hết buổi`; `:275` s4 tags + `atRisk: true`; `:229` s2 chỉ `IELTS Speaking`
  - `mock-data.ts:345` `l4` sid `s2` upcoming
  - `dashboard.tsx:154-183` — `rows={risk.map(... remaining ...)}`
  - Plan: *«dashboard (`dashboard.tsx:160-183`)… Assert those fields after check-in»*
- **Suggested fix:** Ghim fixture dashboard: `l3` hoặc `l5`. Tách assert: (a) store `pkg.*` mọi student; (b) membership risk table = công thức tags, không derive từ remaining.

---

## Finding 5: Syllabus CRUD totals tự mâu thuẫn — `add-syllabus` nói dối, `add-module` xóa số

- **Severity:** High
- **Location:** Phase 2, invariant 6 "syllabus CRUD"
- **Flaw:** `add-syllabus` copy `payload.totalLessons`, `modules: []`, **không** `recomputeTotalLessons`. Modal default `"10"`. `add-module` / `add-lesson` **có** recompute = sum `lessons.length`. Chuỗi CRUD tự nhiên: create (10, 0 lesson) → add-module → `totalLessons` **0**. Syllabus list: label `sy.totalLessons`, progress dùng `all.length` — hai số đã lệch ngay sau create. Lead trang hardcode `"37 buổi"`.
- **Failure scenario:** Test "CRUD totals": add-syllabus 10 buổi → add-module → add-lesson → expect 10 hoặc 11. Thực tế: 10 → 0 → 1. Test đỏ dù extract byte-equivalent. Hoặc test riêng lẻ trên seed `sy1` (12=12) → không lock regression create-then-mutate. Issue "syllabus CRUD totals" không được khóa.
- **Evidence:**
  - `data-store.tsx:215-220` — `{ ...action.payload, modules: [] }` (giữ `totalLessons` payload)
  - `data-store.tsx:108-112` + `:244` — `add-module` gọi `recomputeTotalLessons`
  - `add-syllabus-modal.tsx:21,39` — `useState("10")`; `totalLessons: Number.parseInt(total, 10) || 10`
  - `syllabus/index.tsx:32` lead `"3 giáo trình · 37 buổi tổng cộng"`; `:39-42` pct từ `all.length`; `:73` `{sy.totalLessons} buổi`
  - Plan: *«`add-syllabus` appends with `modules: []`»* + *«`add-module` / `add-lesson` / `edit-lesson` recompute `syllabus.totalLessons` as sum of module lesson counts»* — không nói create không recompute, không nói chuỗi create→add-module về 0
- **Suggested fix:** Lock 3 assertion tách: (1) create: `modules=[]` **và** `totalLessons === payload` (cố ý lệch); (2) add-module trên seed sy1: total không đổi (12+0); (3) add-module sau create: total thành 0. Cấm test chuỗi giả định "10 giữ nguyên".

---

## Finding 6: Contract CI `/pnpm test/` là phantom gate — không khóa consumer chain

- **Severity:** High
- **Location:** Phase 3, "Tests Before" vs "Risk Assessment" vs Architecture
- **Flaw:** Tests Before bắt `assert.match(yaml, /pnpm test/)` — **prefix** của `pnpm test:ci-workflow`. Risk Assessment bảo dùng `/run:\s*pnpm test\s*$/m` rồi vẫn để Tests Before là regex yếu. Contract hiện tại chỉ đọc YAML (`ci-workflow.test.mjs:19-36`); không đọc `package.json`, `turbo.json`, `apps/web/package.json`. Consumer thật của suite: YAML `pnpm test` → root `"test": "turbo run test && pnpm test:ci-workflow"` → web `"test": "vitest run"`. Mất mắt xích giữa = CI xanh, Vitest không chạy.
- **Failure scenario:** Implementer (hoặc PR sau) YAML `- run: pnpm test:ci-workflow` — "cùng style" biome/check-types, script đã có. Regex `/pnpm test/` match. Root không cần `test`, không cần turbo task, không cần vitest. Quality job không chạy reducer tests. Đảo ngược: xóa `apps/web` script `test` → `turbo run test` skip mọi package (pattern đã chứng minh: `check-types` skip `packages/auth` scripts rỗng, `packages/db` không có check-types) → `pnpm test` chỉ còn contract YAML → vẫn 0. Tester plan CI cũ đã ghi: contract **không** chạy trên CI hôm nay (`ci.yml:31-33` chỉ biome / check-types / build).
- **Evidence:**
  - `scripts/ci-workflow.test.mjs:23-26` — `assert.match` substring (`pnpm exec biome check \.`, `pnpm check-types`, `pnpm build`)
  - `.github/workflows/ci.yml:31-33` — không có test step; không invoke `test:ci-workflow`
  - `package.json:19` — `"test:ci-workflow": "node --test scripts/ci-workflow.test.mjs"`; **không** có `"test"`
  - `turbo.json:4-16` — không có task `test`
  - Grep `"test"` trong mọi `package.json`: 0 (chưa có web script)
  - `pnpm-workspace.yaml:1-3` — chỉ `apps/*`, `packages/*` (root không phải workspace member — `turbo run test` **không** chạy root script; chain phải nối tay)
  - Phase 3 Tests Before: *«`assert.match(yaml, /pnpm test/)`»*
  - Phase 3 Risk: *«Root `pnpm test` matching too loosely… `pnpm test:ci-workflow` contains `pnpm test`»*
- **Suggested fix:** Assertion YAML exact `run: pnpm test` (end-of-line). Thêm assert root `package.json` script `test` chứa `turbo run test` **và** `test:ci-workflow`; `turbo.json` có task `test`; `apps/web` script = `vitest run`. Đừng để Tests Before và Risk mâu thuẫn.

---

## Finding 7: "Unknown id → state unchanged" chỉ đúng check-in — `toBe(state)` vỡ trên mark-paid/grade

- **Severity:** Medium
- **Location:** Phase 2, invariants 2–5
- **Flaw:** Check-in unknown/completed: `return state` (cùng reference). `mark-invoice-paid` / `grade-assignment` / `assign-syllabus` luôn `{ ...state, <arr>: arr.map(...) }` — object mới dù id không khớp. Plan chỉ viết unknown-id cho check-in; không cấm generalize.
- **Failure scenario:** Helper `expect(reducer(s, { type, id: "nope" })).toBe(s)` dùng chung. Check-in xanh. `mark-invoice-paid` / `grade-assignment` đỏ dù extract đúng. Cook `--tdd` "sửa" reducer thành early-return → **đổi hành vi** (trái non-goal). Hoặc weaken test.
- **Evidence:**
  - `data-store.tsx:135` — `return state`
  - `data-store.tsx:157-165` — `return { ...state, invoices: state.invoices.map(...) }` không guard id
  - `data-store.tsx:167-175` — tương tự `assignments`
  - Phase 2: *«check-in unknown id → state unchanged»*; mark-paid chỉ *«matching invoice … others unchanged»* (không nói reference)
- **Suggested fix:** Check-in: `toBe(prev)`. Mark-paid/grade unknown: deep-equal nội dung, **không** `toBe`. Ghi 1 dòng: không thêm early-return.

---

## Finding 8: Hướng dẫn assert prefix `uid` làm fail `add-syllabus`

- **Severity:** Medium
- **Location:** Phase 2, Risk Assessment
- **Flaw:** Risk bảo add-* chỉ assert count + prefix `/^(s|c|m|l)-/`. `uid()` đúng cho student/class/module/lesson. `add-syllabus` **không** gọi `uid`; id từ payload. Modal: ``sy-${crypto.randomUUID().slice(0, 8)}``.
- **Failure scenario:** Test add-syllabus theo đúng risk note → id `sy-ab12cd34` không match `/^(s|c|m|l)-/` → đỏ. Implementer "fix" modal/reducer sang `uid("s")` → đổi product (trái non-goal).
- **Evidence:**
  - `data-store.tsx:23-25` — `uid` = ``${prefix}-${crypto.randomUUID().slice(0, 8)}``
  - `data-store.tsx:215-220` — `add-syllabus` dùng `action.payload` nguyên (kể cả `id`)
  - `add-syllabus-modal.tsx:30-40` — `const id = \`sy-${crypto.randomUUID().slice(0, 8)}\``
  - Phase 2 Risk: *«assert counts, prefixes via `/^(s|c|m|l)-/`, and field values only»*
- **Suggested fix:** Prefix regex chỉ cho action gọi `uid`. `add-syllabus`: assert `id === payload.id` (caller chọn).

---

## Finding 9: `tsc --noEmit` nuốt file test — plan không đụng `tsconfig`; AC đòi check-types xanh

- **Severity:** Medium
- **Location:** Phase 1 Architecture / Success Criteria; `plan.md` AC biome + check-types
- **Flaw:** `apps/web` `check-types` = `vite build && tsc --noEmit`. `tsconfig.json` không `include`/`exclude` → `*.test.ts` + `vitest.config.ts` vào graph. `"types": ["vite/client"]` **thay** default type roots (không có vitest globals, không `@types/node`). Phase 1 không nói import từ `vitest` vs globals, không exclude test khỏi `tsc`.
- **Failure scenario:** Test viết `describe`/`it`/`expect` global (Vitest docs hay làm vậy) → `tsc --noEmit` `Cannot find name 'expect'` → AC check-types vỡ dù `vitest run` xanh (`globals` default off nếu không set). CI step thứ tự: test rồi check-types — Vitest qua, job vẫn fail ở check-types.
- **Evidence:**
  - `apps/web/package.json:10` — `"check-types": "vite build && tsc --noEmit"`
  - `apps/web/tsconfig.json:10` — `"types": ["vite/client"]`; không exclude
  - Phase 1: *«`data-store-reducer.test.ts` that imports `{ reducer }` … asserts `typeof reducer === "function"`»* — không specify test API
  - `plan.md` AC: *«`pnpm check-types` stay green»*
  - Phase 3 CI thứ tự đề xuất: biome → **test** → check-types → build
- **Suggested fix:** Bắt `import { expect, test } from "vitest"` (không globals). Hoặc `exclude: ["**/*.test.ts", "vitest.config.ts"]` khỏi `tsc` app. Ghi 1 bước Phase 1.

---

## Fact-check nhanh (claim plan vs repo)

| Claim | Verdict |
|---|---|
| `reducer` unexported `:131` | Đúng (`data-store.tsx:131`) |
| File 376 dòng | Đúng |
| Check-in không ghi `sessionsDone` `:133-147` | Đúng |
| Dashboard StatCard hardcode `:136-147` | Đúng (`7.5`/`6.2tr`/`2.0tr`/`2`) |
| `students/index.tsx:68` = remaining/total | Đúng |
| `classes/$classId.tsx:139` = remaining/total | Đúng |
| `tuition.tsx:77-87` = invoice sums | **SAI** — pkg fields |
| Dashboard `:160-183` = remaining + debt mọi HV | **SAI một phần** — chỉ `risk[]`; filter `:20-25` |
| Không web test runner / vitest script | Đúng (`apps/web/package.json:6-13`) |
| Root chỉ `test:ci-workflow` | Đúng (`package.json:19`) |
| CI chỉ biome + check-types + build | Đúng (`ci.yml:31-33`) |
| Không `Action` import ngoài `data-store.tsx` | Đúng (grep 1 hit: định nghĩa) |
| Search không dispatch | Đúng (`topbar.tsx:28-38`) |
| Turbo skip package không có script | Suy ra OK — cùng pattern `check-types` vs `packages/auth` (`scripts: {}`) / `packages/db` |
| Vitest ≥4.1 + Vite 8 | Khả dĩ — lockfile **đã** resolve `vitest@4.1.10` + `vite@8.2.1` (transitive better-auth/alchemy), chưa phải direct dep `web` |
| Node 24 trên CI | Đúng (`ci.yml:28`) |
| `"scheduled"` lesson trong seed | **SAI** — không tồn tại |

## Contract consumers plan sẽ sửa

- `.github/workflows/ci.yml` — job `quality` (PR + push `main`/`develop`). Thêm `pnpm test`. Trigger claim đúng.
- Root `package.json` `"test"` — **chưa có**. Consumer: step CI mới + local. Phải tự nối `turbo run test` vì root không nằm workspace.
- `turbo.json` `test` — **chưa có**. Consumer: root script. Không phá `build`/`check-types` hiện có.
- `apps/web/package.json` `test` — **chưa có**. Consumer: `turbo run test`, `pnpm --filter web test`.
- `scripts/ci-workflow.test.mjs` — consumer hiện tại chỉ `pnpm test:ci-workflow` (**không** nằm CI). Sau plan: nằm trong `pnpm test`. File này **không** verify turbo/web script (Finding 6).

## Unresolved

- Turbo 2.10 skip-missing-script: không chạy `turbo run test` (lệnh cấm test). Chỉ suy từ `check-types` đang xanh trên package thiếu script.
- Vitest 4 `environment` phải nằm dưới `test:` hay top-level: không đọc được type package (không có `vitest` trong `apps/web`). Phase 1 viết `environment: "node"` không chỉ `test.environment` — rủi ro config ignore/throw chưa verify.

---

Status: DONE
Summary: 9 findings (0 Critical, 6 High, 3 Medium). Nặng nhất: fixture `"scheduled"` không tồn tại; cross-view invoice/dashboard citation sai; Outcome lock ngược desync; syllabus totals tự phá; CI `/pnpm test/` không khóa Vitest.
Concerns/Blockers: Sửa plan trước cook — nếu giữ nguyên, Phase 2 dễ đỏ oan hoặc xanh giả.
