---
type: reviewer
role: fact-checker + security-adversary
date: 2026-08-16
plan: 260816-1640-add-automated-web-app-test-suite
---

# Red-team — Security Adversary / Fact Checker

Plan review, không phải code review. Mọi finding gắn citation codebase. Không khen.

## Finding 1: "Cross-view numeric consistency" là phantom test — citation view sai sự thật
- **Severity:** Critical
- **Location:** Plan Outcome + Acceptance Criteria; Phase 2, section "Invariants to lock" #7
- **Flaw:** Plan bán quality gate sẽ fail nếu check-in / mark-paid làm lệch số mọi view đọc. Helper được lệnh viết **trong file test, không import view**. Các citation gắn invoice-sum cho file/dòng **không render invoice-sum**. `pkg.done` cũng không nằm ở students list dòng 68.
- **Failure scenario:** Implementer viết helper `unpaidSum(state)` + assert `student.pkg.*` sau `mark-invoice-paid`. CI xanh. UI tiền thật không đổi: StatCard học phí vẫn `"1.9tr"` / `"21.0tr"`; dashboard "Cần xử lý" vẫn hardcode "Quốc Bảo nợ 1.000k"; bảng hóa đơn student detail (tab Học phí) không được assert. Attacker (hoặc PR sau) đổi dashboard/tuition sang field khác hoặc hardcode thêm — suite vẫn pass. Gate "cross-view" không đụng view.
- **Evidence:**
  - Plan Phase 2 #7: *"student.pkg.done/remaining/total and unpaid/overdue invoice sums are the numbers dashboard (`dashboard.tsx:160-183`), students list (`students/index.tsx:68`), student detail (`students/$studentId.tsx:139-140`), class roster (`classes/$classId.tsx:139`), and tuition (`tuition.tsx:77-87`) already render."*
  - Plan: *"Cross-view numeric consistency helper in the test file (not product code)"*
  - `apps/web/src/routes/_auth/students/index.tsx:64-69` — chỉ `pkg.total` + `remaining/total`. **Không** `pkg.done`. **Không** invoice.
  - `apps/web/src/routes/_auth/tuition.tsx:40-50` — StatCard `"21.0tr"` / `"1.9tr"` / `"2"` hardcode. `77-87` là `pkg.done/total` + `pkg.remaining`, không phải invoice sum.
  - `apps/web/src/routes/_auth/tuition.tsx:140-187` — đây mới là bảng hóa đơn (status/amount). Plan không cite.
  - `apps/web/src/routes/_auth/students/$studentId.tsx:139-140` — profile "Đã học"/"Còn lại". Invoice status ở tab tuition `:210-228`.
  - `apps/web/src/routes/_auth/classes/$classId.tsx:139` — `remaining/total` thôi.
  - `apps/web/src/routes/_auth/dashboard.tsx:88-104` — alert nợ hardcode, không đọc store sau mark-paid.
  - `apps/web/src/routes/_auth/dashboard.tsx:160-166` — **một** chỗ thật sự cộng unpaid/overdue. Risk membership lại là tag tĩnh `:20-25`, không phải remaining/debt.
- **Suggested fix:** Tách 2 invariant: (a) store fields sau action; (b) **đọc source view** — liệt kê đúng dòng/field từng màn. Invoice sum chỉ gắn `dashboard.tsx:160-166` + `tuition.tsx:140-187` + `$studentId.tsx:210-228`. Ghi rõ StatCard tiền (`tuition.tsx:40-50`, `dashboard.tsx:136-147`) **không** nằm trong "tuition remaining". Nếu issue #4 muốn khóa số user thấy, phải test derived helper **copy đúng công thức view**, không gộp citation sai.

## Finding 2: CI "quality gate" chỉ khóa substring YAML — hollow control, bypass một dòng
- **Severity:** High
- **Location:** Phase 3, Architecture + Tests Before + Success Criteria; Plan decision 6
- **Flaw:** Contract mới = `assert.match(yaml, /pnpm test/)`. Không khóa `apps/web` script thật sự là `vitest run`, không khóa file invariant tồn tại, không khóa `turbo.json` task `test`, không khóa `permissions.contents: read`. Plan tự nhận `/pnpm test/` match cả `pnpm test:ci-workflow` rồi đề xuất regex chặt hơn — **Success Criteria vẫn chỉ "CI YAML includes `pnpm test`"**.
- **Failure scenario:** PR độc hại (hoặc implementer cắt scope) giữ `- run: pnpm test` trong YAML, đổi `apps/web` `"test": "node -e \"process.exit(0)\""` hoặc xóa `data-store-reducer.test.ts` + `vitest run --passWithNoTests`. `scripts/ci-workflow.test.mjs` vẫn xanh. Financial/attendance invariants biến mất; badge CI vẫn "tested". Cùng kiểu: comment YAML `pnpm test` hoặc step `echo pnpm test` nếu dùng regex lỏng.
- **Evidence:**
  - Phase 3: *"Update `scripts/ci-workflow.test.mjs` to assert the workflow YAML contains a `pnpm test` step"*
  - Phase 3 Tests Before: *`assert.match(yaml, /pnpm test/)`*
  - Phase 3 Success Criteria: *"[ ] CI YAML includes `pnpm test`"* / *"[ ] Contract test asserts that step"*
  - Phase 3 Risk (họ biết, rồi bỏ khỏi AC): *"Root `pnpm test` matching too loosely... `pnpm test:ci-workflow` contains `pnpm test`"*
  - `scripts/ci-workflow.test.mjs:19-36` — contract hiện tại chỉ regex YAML (biome/check-types/build/secrets). Không đọc `package.json` scripts.
  - `package.json:19` — `"test:ci-workflow": "node --test scripts/ci-workflow.test.mjs"` (chứa substring `pnpm test` nếu ai nhét vào YAML comment).
  - `.github/workflows/ci.yml:12-13` — `permissions: contents: read` đã có; Phase 3 **không** thêm assert này (plan CI cũ thì có).
- **Suggested fix:** Contract phải assert cả ba: (1) YAML run line `/^\\s+- run: pnpm test\\s*$/m`; (2) `apps/web/package.json` scripts.test === `vitest run`; (3) test file + tên invariant (check-in / mark-paid / grade / syllabus) tồn tại. Giữ `doesNotMatch` secrets **và** `permissions:\\s*contents:\\s*read`. `turbo.json` task `test` nên `cache: false` (tránh remote-cache skip/poison sau này).

## Finding 3: "Scheduled lesson" không tồn tại — test theo plan sẽ miss fixture; check-in canceled/trial vẫn trừ gói
- **Severity:** High
- **Location:** Phase 2, Invariant 1 + "Seed fixtures to prefer"; Plan verified table "Check-in updates..."
- **Flaw:** `LessonStatus` = `completed | upcoming | cancelled | absent`. Grep `scheduled` trong `*.{ts,tsx}` = 0 hit. Reducer chỉ no-op khi `!lesson || status === "completed"`. UI không thống nhất: lesson-modal chỉ check-in `upcoming`; dashboard nút "Điểm danh" cho **mọi** lesson không completed.
- **Failure scenario:** Implementer viết `lessons.find(l => l.status === "scheduled")` → `undefined` → test skip/sai, hoặc bịa status. Suite không lock: check-in `l9` (`cancelled`, sid `s4`) vẫn `pkg.done += 1` (s4 remaining 2→1). Check-in trial `l11` trừ buổi gói trả phí. Dashboard (`day === 2` hardcode) nếu sau này hiện lesson cancelled thì vẫn dispatch được. Plan "lock current behavior" sẽ **đóng băng lỗ trừ gói trên buổi hủy/trial** thành spec — fix sau bị coi là regression.
- **Evidence:**
  - Phase 2: *"pick a scheduled (not completed) lesson with a known `sid`"*; Invariant 1 title *"check-in scheduled lesson"*
  - `apps/web/src/lib/mock-data.ts:31` — `export type LessonStatus = "completed" | "upcoming" | "cancelled" | "absent"`
  - `apps/web/src/lib/mock-data.ts:334-335` `l3` upcoming; `:400` `l9` cancelled; `:367` `l6` type `"1:2"`; `:422` `l11` type `"trial"`
  - `apps/web/src/lib/data-store.tsx:134-135` — `if (!lesson || lesson.status === "completed") return state`
  - `apps/web/src/components/schedule/lesson-modal.tsx:60-80` — chỉ `upcoming` mới có Điểm danh/Hủy
  - `apps/web/src/routes/_auth/dashboard.tsx:66-75` — nút Điểm danh khi `l.status !== "completed"` (không yêu cầu upcoming)
- **Suggested fix:** Đổi vocabulary thành `upcoming`. Thêm invariant explicit: cancelled/absent/trial — **chọn** no-op (đúng nghiệp vụ) hoặc document "current hole, lock + ticket". Đừng để implementer tự đoán. Dashboard vs modal phải cùng predicate, hoặc test ghi nhận split-brain.

## Finding 4: Suite đóng băng IDOR / zero-authz trên tiền, điểm danh, điểm số thành hợp đồng
- **Severity:** High
- **Location:** Plan Non-goals "Auth, server, DB"; Phase 2 extract reducer; Plan decision 4 "Lock current reducer behavior"
- **Flaw:** App đã có Better Auth + session guard. Mọi mutation tài chính/học thuật sống ở client reducer **không** nhận identity, **không** check owner. Extract `reducer` ra module thuần + test dispatch tùy `invoiceId`/`lessonId`/`assignmentId` sẽ snapshot "ai cũng sửa được mọi hóa đơn/học viên" là hành vi đúng. Server hiện chỉ mount `/api/auth/*`.
- **Failure scenario:** Session teacher A (email/password hoặc Google) vào `_auth` → `DataProvider` → `dispatch({ type: "mark-invoice-paid", invoiceId: "INV-084", method: "CK" })` hoặc grade `a1` của học viên khác. Không có bước authz. Test Phase 2 sẽ fail nếu sau này thêm `actorId` / deny unknown id / require session — tức gate **chống** hardening. Quality badge tạo ảo giác invariant tiền đã được bảo vệ; attacker chỉ cần session bất kỳ.
- **Evidence:**
  - `apps/web/src/routes/_auth/route.tsx:7-14` — chỉ `authClient.getSession()`; không role, không object-level authz
  - `apps/web/src/components/layout/app-shell.tsx:65` — `DataProvider` bọc toàn bộ shell sau login
  - `apps/web/src/lib/data-store.tsx:157-175` — `mark-invoice-paid` / `grade-assignment` map theo id, không actor
  - `apps/web/src/lib/data-store.tsx:131-147` — check-in theo `lesson.sid`, không kiểm tra teacher/class membership
  - `apps/server/src/index.ts:20` — `app.on(["POST", "GET"], "/api/auth/*", ...)`; không có invoice/lesson API
  - Plan Non-goals: *"Auth, server, DB, deploy"*
  - Plan decision 4: *"Lock current reducer behavior, including gaps"*
- **Suggested fix:** Test file phải ghi comment invariant ổn định: "client demo store; no authz; not a payment control". Thêm 1 case **negative** (unknown invoice/lesson) + ghi non-goal rõ: khi thay mock bằng API, **được phép** phá các test này. Đừng để AC issue #4 đọc như đã khóa integrity tiền.

## Finding 5: `grade-assignment` test sai trust boundary — UI validate 0–9, reducer nuốt NaN/điểm ngoài thang
- **Severity:** High
- **Location:** Phase 2, Invariant 5
- **Flaw:** Plan lock *"matching assignment `scores` + `status: \"graded\""` trên reducer. Validation 0–9 sống ở `GradeModal`. Reducer gán nguyên `action.scores`. Test không import modal ⇒ payload `{ task: NaN, coherence: 99, ... }` thành "graded" hợp lệ.
- **Failure scenario:** Caller tương lai (devtools, extract service, API wrapper) dispatch scores âm / >9 / NaN. Suite xanh vì đúng contract Phase 2. Học vụ / phụ huynh thấy band `averageBand` từ NaN (`mock-data.ts:165-171` chia 4). Feedback trong modal **không** bao giờ vào store — test "grade" không đụng nhận xét.
- **Evidence:**
  - Phase 2 #5: *"`grade-assignment` → matching assignment `scores` + `status: \"graded\""*`
  - `apps/web/src/lib/data-store.tsx:167-174` — không range check
  - `apps/web/src/components/modals/grade-modal.tsx:29-42` — `Number.parseFloat` + reject `NaN || v < 0 || v > 9`; rồi mới dispatch
  - `apps/web/src/components/modals/grade-modal.tsx:22,42` — `feedback` state không đưa vào action
- **Suggested fix:** Invariant 5 phải gồm: (a) reducer chấp nhận mọi `Scores` (current hole, ghi rõ) **hoặc** chuyển validate vào reducer rồi test biên 0, 9, 9.5, NaN; (b) không gọi đây là lock "grading integrity" nếu chỉ assert `status === "graded"`.

## Finding 6: `add-syllabus` nhận `id` từ caller — collision / first-match IDOR; test chỉ assert `modules: []`
- **Severity:** High
- **Location:** Phase 2, Invariant 6
- **Flaw:** `Action` `add-syllabus` payload có `id` + `totalLessons` do client. Reducer append không check trùng. `syllabusById` = `find` (bản ghi đầu). Modal tự sinh `sy-${uuid}`; test/dispatch thẳng có thể gửi `sy1`.
- **Failure scenario:** Test (hoặc UI bug / caller sau) `dispatch({ type: "add-syllabus", payload: { id: "sy1", totalLessons: 99, ... } })`. Mảng có 2 `sy1`. `syllabusById("sy1")` trả syllabus cũ. `assign-syllabus` gắn `sy1` vẫn trỏ bản cũ. Syllabus giả orphan. Invariant 6 chỉ *"appends with `modules: []`"* — suite xanh. Thêm `add-module` sau `add-syllabus` (totalLessons payload 10, modules rỗng): `recomputeTotalLessons` set `totalLessons = 0`, xóa số client khai. Plan bảo add-module phải recompute — sẽ **lock** hành vi xóa total.
- **Evidence:**
  - Phase 2 #6: *"`add-syllabus` appends with `modules: []`"* / *"`add-module` / `add-lesson` / `edit-lesson` recompute `syllabus.totalLessons`"*
  - `apps/web/src/lib/data-store.tsx:56-66` — payload gồm `id`, `totalLessons`
  - `apps/web/src/lib/data-store.tsx:215-220` — `{ ...action.payload, modules: [] }` không unique, không recompute
  - `apps/web/src/lib/data-store.tsx:363` — `syllabusById: (id) => data.syllabi.find((s) => s.id === id)`
  - `apps/web/src/components/modals/add-syllabus-modal.tsx:30-40` — client sinh id + `Number.parseInt(total, 10) || 10`
  - Seed ids `sy1`/`sy2`/`sy3` tại `mock-data.ts:682,796,895`
- **Suggested fix:** Invariant: reject/ignore duplicate id; `totalLessons` sau add-syllabus vs sau add-module (0 lesson) phải được chọn có ý thức. Test collision `id: "sy1"`. `assign-syllabus` unknown `syllabusId` — no-op hoặc throw; đừng im lặng gắn id rác.

## Finding 7: mark-paid không thể test vòng đời hóa đơn — "Tạo hóa đơn" là no-op; số tiền UI hardcode
- **Severity:** Medium
- **Location:** Phase 2 Invariant 4 + 7; Plan non-goal hardcoded StatCards (chỉ nêu dashboard weekly)
- **Flaw:** Issue #4 gộp mark-paid với "tuition remaining". `AddInvoiceModal.submit` **không** dispatch; không có action tạo invoice. Seed invoice tĩnh. Plan non-goal chỉ loại StatCard dashboard `"7.5"`/`"6.2tr"`/`"2.0tr"`/`"2"` — **im lặng** StatCard tuition `"21.0tr"`/`"1.9tr"` (đúng bằng INV-084 1.000.000 + INV-086 900.000).
- **Failure scenario:** Test mark-paid `INV-084` → store `status: "paid"`. Tuition header vẫn 1.9tr. Không tạo được invoice mới rồi thu — không test amount tamper, không test double-pay (reducer **cho phép** đổi `method` trên invoice đã paid). "Đã nhận" trên tuition (`:174-178`) là đường UI duy nhất; helper store-only không chứng minh nút đó đọc đúng `i.id`.
- **Evidence:**
  - Plan non-goal: *"Rewriting hardcoded dashboard weekly StatCards (`7.5`, `6.2tr`, `2.0tr`, `2`)"* — không nhắc tuition cards
  - `apps/web/src/components/modals/add-invoice-modal.tsx:20-24` — *"creating an invoice is a modal-only flow (no store mutation)"*
  - `apps/web/src/lib/data-store.tsx:27-106` — Action **không** có `add-invoice`
  - `apps/web/src/lib/mock-data.ts:454-481` — INV-084 overdue 1_000_000; INV-086 unpaid 900_000
  - `apps/web/src/routes/_auth/tuition.tsx:40-50` — hardcode 21.0tr / 1.9tr
  - `apps/web/src/lib/data-store.tsx:157-164` — mark-paid không guard `status !== "paid"`
- **Suggested fix:** Ghi non-goal rõ: tuition money StatCards + create-invoice ngoài scope. Invariant mark-paid: unknown id; already-paid (method overwrite); unpaid sum **chỉ** chỗ view thật sự cộng. Đừng claim "tuition remaining" nếu không đụng `tuition.tsx:40-50` hoặc bảng `:140+`.

## Finding 8: Phase 1 để `pnpm check-types` đỏ — AC plan tự mâu thuẫn; test nằm trong `src/` nuốt seed PII vào tsc/CI
- **Severity:** Medium
- **Location:** Phase 1 Tests Before / Success Criteria; Plan Acceptance *"`pnpm check-types` stay green"*
- **Flaw:** Phase 1 tạo `apps/web/src/lib/data-store-reducer.test.ts` import module chưa có. `apps/web` `check-types` = `vite build && tsc --noEmit`. `apps/web/tsconfig.json` không `exclude` `*.test.ts`. `tsc` fail trên missing module. Seed `mock-data.ts` chứa SĐT/phụ huynh; `structuredClone(seedData)` + assertion fail dump PII lên log GitHub (public PR).
- **Failure scenario:** Cook/TDD commit Phase 1 riêng, hoặc check-types chạy giữa phase: CI `pnpm check-types` đỏ dù Phase 1 nói "failure allowed only for missing reducer" (chỉ nói vitest). Fail test dump `phone: "0912 345 678"`, `parent.name` vào log Actions. Plan không exclude test khỏi tsc, không redaction.
- **Evidence:**
  - Phase 1: *"imports `{ reducer }` from `./data-store-reducer`"* / *"expected to fail with a module-not-found"*
  - Plan AC: *"`pnpm exec biome check .` and `pnpm check-types` stay green"*
  - `apps/web/package.json:10` — `"check-types": "vite build && tsc --noEmit"`
  - `apps/web/tsconfig.json:2-16` — `types: ["vite/client"]`, không exclude tests
  - `apps/web/src/lib/mock-data.ts:189-193` — name/phone/zalo/parent của học viên thật-lookalike
  - Phase 2: *"Use `structuredClone(seedData)` ... as `before` state"*
- **Suggested fix:** Exclude `**/*.test.ts` khỏi `tsc` web **hoặc** land extract cùng commit với test import. Cấm `expect(state).toEqual(seed)` full object trên CI; assert field số. Đừng copy SĐT/parent vào fixture riêng.

## Finding 9: Dashboard check-in và "Học viên rủi ro" không phải derived — plan cite sai lớp bảo vệ
- **Severity:** Medium
- **Location:** Plan verified evidence "Dashboard risk/debt reads store"; Phase 2 #7
- **Flaw:** Plan nói dashboard risk/debt đọc store. Debt **cell** đọc invoice (`:160-166`). **Danh sách** risk = `atRisk` + tag `"nợ học phí"` / `"sắp hết buổi"` — tag **không** đổi sau check-in hay mark-paid (đã quyết định ở plan convert UI). Check-in dashboard không filter `upcoming`. Cite `:160-183` như "cross-view after mark-paid" khiến implementer tưởng trả nợ sẽ rời bảng risk.
- **Failure scenario:** mark-paid INV-084 → debt cell `"—"`, badge "Nợ học phí" vẫn còn vì tag. s1 check-in remaining 4→3, tag "sắp hết buổi" sẵn nên vẫn trong bảng — coincidental. Học viên không có tag, remaining về ≤3, **không** vào risk table. Test helper đọc `pkg.remaining` nghĩ dashboard đã consistent.
- **Evidence:**
  - Plan verified: *"Dashboard risk/debt reads store | `s.pkg.remaining` + unpaid/overdue invoice sum | `dashboard.tsx:160-183`"*
  - `apps/web/src/routes/_auth/dashboard.tsx:19-25` — filter tag/atRisk
  - `apps/web/src/routes/_auth/dashboard.tsx:156-166` — issue badges từ **tags**; debt từ invoices
  - `apps/web/src/lib/data-store.tsx:141-146` — check-in chỉ sửa `pkg.done/remaining`, không sửa tags
  - Plan cũ `260815-1553` phase-03: tags/alerts là static snapshot — plan test này không inherit quyết định đó
- **Suggested fix:** Cite tách: membership = tags `:20-25` (không đổi); numbers = remaining `:181` + debt `:160-166`. Test mark-paid assert tag vẫn `"nợ học phí"` nếu lock current; đừng ngụ ý risk list là authorization/integrity view.

---

## Fact-check nhanh (claim plan vs repo)

| Claim | Verdict |
|---|---|
| `reducer` unexported tại `data-store.tsx:131` | Đúng (`function reducer`) |
| File 376 dòng | Đúng |
| Check-in không ghi `classes.sessionsDone` | Đúng (`:133-147`) |
| StatCards tuần hardcode `:136-147` | Đúng |
| Không vitest/playwright/`"test"` script | Đúng (grep `package.json`) |
| Root chỉ `test:ci-workflow` | Đúng (`package.json:19`) |
| CI không có test step | Đúng (`ci.yml:31-33`) |
| Không `Action` import ngoài `data-store.tsx` | Đúng |
| Search không dispatch | Đúng (`topbar.tsx:28-38`) |
| `students/index.tsx:68` = done/remaining/invoice | **Sai** — remaining/total |
| `tuition.tsx:77-87` = invoice sums | **Sai** — package counts |
| Status lesson `"scheduled"` | **Sai** — không tồn tại |
| Turbo skip package không có `test` | Khả dĩ (cùng pattern `check-types`; `packages/auth` scripts rỗng) |
| Vitest ≥4.1 + Vite 8 | Không disprove; web đang `vite ^8.1.5` |

## Unresolved questions

- Issue #4 có thật sự muốn khóa **số user thấy** (StatCard 1.9tr) hay chỉ field store? Plan trộn cả hai.
- Khi nào mock store bị thay bằng API: test này keep hay xóa? Plan không nói sunset.

Status: DONE
Summary: Plan bán quality gate tài chính/điểm danh trên reducer thuần + contract YAML; citation view sai, status "scheduled" không tồn tại, và suite sẽ đóng băng zero-authz + lỗ check-in cancelled/trial thành spec.
Concerns/Blockers: Finding 1–3 phải sửa trên plan trước cook; nếu không, implementer viết phantom test và CI hollow gate.
