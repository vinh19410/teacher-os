# Red-team: Security Adversary

Plan: `plans/260821-1638-dashboard-kernel-today-sessions-and-at-risk/`
Date: 2026-08-21
Lens: Security Adversary (integrity of attendance, false risk labels, mutation boundary, phantom tests, tenant isolation claims)
Verification role: Fact Checker — mọi path/symbol/endpoint/config cited trong plan vs source
Scope: Plan documents only. Không implement. Không lint/build/test.

Không khen. Chỉ finding có `file:line`.

---

## Fact Checker

| Claim (plan) | Verdict | Evidence |
|---|---|---|
| Dashboard lọc `l.day === 2` + atRisk/tags | **VERIFIED** | `apps/web/src/routes/_auth/dashboard.tsx:21-27` |
| Greeting/KPI hardcode `cô Lan` / `Thứ Ba, 19/08` | **VERIFIED** | `dashboard.tsx:31-33` |
| Hardcode Cần xử lý + StatCard 7.5/6.2tr/2.0tr | **VERIFIED** | `dashboard.tsx:93-154` (cite `95-156` lệch 2 dòng đầu mảng) |
| `atRisk` kernel luôn `false`; `tags` luôn `[]` | **VERIFIED** | `apps/web/src/lib/repos/students.ts:73,76` |
| Lesson không calendar date — `day: integer` | **VERIFIED** | `packages/db/src/schema/lesson.ts:29`; `packages/api/src/contracts.ts:270` |
| Class schedule days 0=Mon…6=Sun | **VERIFIED** | `packages/api/src/contracts.ts:47-48` |
| Schedule UI lọc `l.day === i + 1` (Mon=1) | **VERIFIED** (cột tuần, **không** là "hôm nay") | `apps/web/src/routes/_auth/schedule.tsx:53-56` |
| Snapshot remap `lessons.day` raw | **VERIFIED** (pass-through, không remap) | `apps/server/src/routes/snapshot.ts:235-239` |
| Check-in contract lock `:160-164` | **VERIFIED** | `apps/web/src/lib/kernel-runtime.contract.test.ts:160-164` |
| Session user name trong `_auth` | **VERIFIED** | `apps/web/src/routes/_auth/route.tsx:20`; `sidebar.tsx:194-204` |
| Phase 2 cite `sidebar.tsx:188-204` | **FAILED** (range) | `:188-193` = signature; session bắt đầu `:194` |
| Clock local-calendar `date-input.ts:31-47` | **VERIFIED** injectable `now`; **FAILED** là weekday pattern | `date-input.ts:31-47` = tomorrow/future date input, 0 `getDay` |
| `#55` OPEN không block | **VERIFIED** OPEN | `gh issue view 55` → `state: OPEN` |
| `#55` `in progress` | **FAILED** | GitHub `state: OPEN`, 0 label in-progress |
| POST `/api/lessons/:id/check-in` | **VERIFIED** | `apps/server/src/routes/kernel.ts:354-356`; client `repos/kernel.ts:80-83` |
| `useDirectKernelAction` + `disabled={busy \|\| isPending(l.id)}` | **VERIFIED** | `dashboard.tsx:19,74-77`; `use-direct-kernel-action.ts:11-33` |
| `useRouteContext({ from: "/_auth" })` | **VERIFIED** pattern | `sidebar.tsx:194` |
| DataTable `onClick` optional | **VERIFIED** | `apps/web/src/components/ui/data-table.tsx:6,29` |
| Không xóa StatCard — dùng chỗ khác | **VERIFIED** | `tuition.tsx:42`; `classes/$classId.tsx:108`; `syllabus/$syllabusId.tsx:116` |
| Snapshot org-scoped | **VERIFIED** | `snapshot.ts:70-72,89-92,137-140`; GET `/kernel` `kernel.ts:143-146` |
| Check-in org-scoped + body `{}` | **VERIFIED** | `kernel.ts:323,337-345`; `contracts.ts:153` `z.object({}).strict()` |
| LessonStatus gồm `absent` | **VERIFIED** type only | `contracts.ts:274`; `mock-data.ts:28` |
| Kernel **ghi** `status="absent"` | **FAILED** (0 write path) | `rg '"absent"'` runtime = type/UI map; write matrix `kernel.ts:307-331` chỉ `completed`/`cancelled` |
| `mapLessons` giữ `day` raw | **VERIFIED** | `apps/web/src/lib/repos/lessons.ts:53` |
| `studentById` skip missing | **VERIFIED** | `dashboard.tsx:53-54` |
| Empty org / no seedData | **VERIFIED** | `data-provider.tsx:38-41,65-75`; contract test `:38-40` |
| Playwright dashboard E2E | **VERIFIED absent** | 0 spec dashboard; lockfile chỉ `@vitest/browser-playwright` |
| `lessonDayFromDate` / `lessonsToday` / `atRiskRows` / `formatDashboardLead` | **VERIFIED absent** | symbols chưa tồn tại — create Phase 1/2 |
| Load-bearing: schedule "cột hôm nay" = real today | **FAILED** | `schedule.tsx:27` `todayIdx = 1` hardcode Thứ Ba |
| Phase 1 "Không input user. Read-only." cho feature | **FAILED** | Phase 2 giữ mutation check-in `dashboard.tsx:73-81` |
| "Không leak student khác org" | **VERIFIED** nếu chỉ derive từ snapshot đã load | `loadSnapshot` filter `orgId`; helper thuần không tự fetch |

---

## Finding 1: `lesson.day` weekday không định danh được "buổi hôm nay" — check-in hoàn thành nhầm occurrence

- **Severity:** Critical
- **Location:** Plan Design Decision 1; Phase 1 `lessonsToday`; Phase 2 check-in trên card today
- **Flaw:** Success criterion #57 = dashboard hiện buổi **hôm nay** rồi cho điểm danh. Schema lesson **không có calendar date** — chỉ `day integer` unconstrained. Selector `day === lessonDayFromDate(now)` (Mon=1…Sun=7) gom **mọi occurrence cùng weekday** (tuần trước, tuần này, tuần sau). Server check-in **không** kiểm weekday hay "is today"; mọi `upcoming` trong org đều POST được. Plan cố ý không đợi #55 và không thêm date.
- **Failure scenario:** Org có 12 buổi Friday (sau #55 sinh từ lịch, hoặc seed `insertLesson` lặp `day: 5`). Giáo viên mở `/dashboard` thứ Sáu, thấy 12 card cùng học viên. Bấm "Điểm danh" card đầu (sort chỉ `time`). Server `upcoming→completed` (`kernel.ts:330-345`). Row hoàn thành có thể là buổi tuần 8, không phải hôm nay. `pkg.remaining` giảm (`students.ts:52-65` derive completed). Buổi thật hôm nay vẫn upcoming — hoặc đã bị đốt. Attendance integrity vỡ; không có audit date để phát hiện.
- **Evidence:**
  - Plan: "Today: `lesson.day === lessonDayFromDate(now)`"; "Không calendar date trên lesson (thuộc #55 nếu cần)"; "Không blockedBy #55"
  - `packages/db/src/schema/lesson.ts:29` `day: integer("day").notNull()` — 0 CHECK 1–7, 0 date column
  - `packages/api/src/contracts.ts:266-276` KernelLessonRow: `day: number`, status, **không** date
  - `apps/server/src/routes/snapshot.ts:235-239` pass-through `day: row.day`
  - `apps/web/src/lib/repos/lessons.ts:50-53` `day: row.day` raw
  - `apps/server/src/kernel.test.ts:127-150` "no lesson-create endpoint"; insert default `day: row.day ?? 2` — không date
  - Check-in matrix: `apps/server/src/routes/kernel.ts:307-331,354-356` — chỉ `status !== "upcoming"` → 409; 0 so sánh day/today
  - Issue 55 OPEN: sinh lessons từ structured schedule (nhiều row / enrollment)
- **Suggested fix:** Block ship "buổi hôm nay" trên weekday identity. Hoặc blockedBy #55 + date (hoặc occurrence index) trên lesson, selector `date === localToday`. Server check-in reject nếu occurrence date ≠ today (nếu product muốn dashboard-today là authz). Không claim M1 DOD "buổi hôm nay" khi row không mang ngày.

## Finding 2: Reason `"absent"` / badge "Vắng" là dead path — kernel không ghi được vắng

- **Severity:** High
- **Location:** Plan Design Decision 2; Phase 1 `atRiskRows` absent; Phase 2 badge "Vắng"; issue 57 "vắng / miss check-in"
- **Flaw:** At-risk rule số 1 = `status==="absent"`. Write matrix kernel chỉ `upcoming→completed` (check-in) và `upcoming→cancelled`. 0 route, 0 reducer, 0 SQL gán `"absent"`. `absent` chỉ sống ở union type + label UI. Issue 57 đòi **vắng** từ data thật. Plan pretends both reasons exist. Teachers sẽ **không bao giờ** thấy badge Vắng từ kernel; mọi "rủi ro" đổ sang missed-check-in (Finding 3) — nhãn sai.
- **Failure scenario:** Giáo viên điểm danh nhầm / học viên không đến. Không có nút "vắng". Dashboard không list "Vắng". Họ tin at-risk = vắng thật. Thực tế list = upcoming weekday nhỏ hơn today (cả slot tương lai). Quyết định liên hệ PH dựa trên classification không có backing record. Ngược lại: nếu sau này ai INSERT `status=absent` (SQL/console), student **vĩnh viễn** at-risk vì plan không có recency window (snapshot = mọi lesson từng có).
- **Evidence:**
  - Plan: "At-risk: ≥1 lesson `status==="absent"` **hoặc** upcoming `day < todayDay`"; Phase 2 badge `"Vắng"`
  - Write: `apps/server/src/routes/kernel.ts:307-331` comment "check-in upcoming→completed, cancel upcoming→cancelled, anything else 409"
  - Fixture reducer: `apps/web/src/lib/data-store-reducer.ts:40-50` check-in chỉ khi `upcoming`; cancel → `cancelled` `:53-58` — 0 `absent`
  - `rg '"absent"'` trong `*.ts,tsx,sql`: type `contracts.ts:274`, `mock-data.ts:28`, coerce allowlist `lessons.ts:19-23`, label `students/$studentId.tsx:40,49`. **0 assign.**
  - Check-in body khóa `{}`: `packages/api/src/contracts.ts:153`; `repos/kernel.ts:80-83` — client không forge status (đúng) nên cũng **không thể** gửi absent
- **Suggested fix:** Hoặc thêm write path "mark absent" (out of #57 scope — thì **cắt** reason `absent` khỏi #57), hoặc document rằng M1 at-risk = missed-check-in only. Không ship badge "Vắng" khi invariant kernel không sản xuất status đó. Test Phase 1 case absent phải đánh dấu `// kernel cannot persist this yet` hoặc xóa.

## Finding 3: `day < todayDay` gắn nhãn rủi ro hàng loạt — bảng đang empty sẽ đầy false positive

- **Severity:** High
- **Location:** Plan Design Decision 2; Phase 1 Architecture "Sunday today=7: upcoming day 1–6 là missed"; Phase 2 table "Học viên rủi ro"
- **Flaw:** Production hiện **không** có học viên rủi ro trên dashboard: `mapStudents` force `atRisk: false`, `tags: []`, filter dashboard cần một trong ba. Selector mới biến **mọi** student có lesson `upcoming` weekday < today thành "Miss check-in". Không calendar week, không giới hạn "tuần này". Chủ nhật: gần như cả roster còn buổi. Thứ Hai: missed=0 (plan accept) — cuối tuần mất tín hiệu. Đây là **mở surface classification** (stigma + `pkg.remaining`) trên data đang trống.
- **Failure scenario:** Lớp T2/T5, 10 HV, mỗi người 1 row upcoming `day: 1` và `day: 5`. Thứ Tư (`todayDay=3`): 10 HV "Miss check-in" vì Monday upcoming — có thể là **slot tuần sau** (weekday model). Giáo viên thấy bảng đầy, badge, cột Còn. Họ gọi PH / đánh dấu yếu. Tenant khác không leak (snapshot org-scope), nhưng **integrity label** trong org sai. Subject: student name + remaining — PII giáo dục đã có trên roster, nhưng **nhãn rủi ro mới** không có trong kernel hiện tại.
- **Evidence:**
  - Hiện empty: `apps/web/src/lib/repos/students.ts:73,76`; `dashboard.tsx:21-27`
  - Plan Phase 1: "Sunday today=7: upcoming day 1–6 là missed"; "Monday missed=0. Accept"
  - Snapshot load **mọi** lesson org: `snapshot.ts:137-141` không filter tuần
  - Class detail vẫn `s.atRisk` mock-false: `classes/$classId.tsx:152-159` (non-goal) — dashboard sẽ **lệch** class detail ("Ổn" vs "rủi ro")
  - PII student: `packages/db/src/schema/student.ts:16-20` name/phone/parent; dashboard chỉ name+remaining nhưng label mới
- **Suggested fix:** Bound missed-check-in: chỉ upcoming **today already past time**, hoặc chỉ weekday < today **nếu** có date trong tuần hiện tại. Không ship Sunday-all-missed. Alignment với class detail: đừng để hai màn hình trái dấu. Test: 10 upcoming Monday + now=Wednesday → assert **không** flag nếu row là template/future (nếu không phân biệt được thì **không** dùng rule này).

## Finding 4: "Signal vỡ" 0–6 vs 1–7 là dead — `/schedule` không biết hôm nay

- **Severity:** High
- **Location:** Plan Design Decision load-bearing + Risk "Day 0 vs 1"; Phase 1 Risk Assessment
- **Flaw:** Plan: nếu selector sai, "dashboard hôm nay trống trong khi `/schedule` cột hôm nay có buổi". Schedule **không** tính today. `todayIdx = 1` hardcode highlight cột Thứ Ba. Filter cột là `l.day === i + 1` trên 7 cột — luôn hiện cả tuần. Class create `schedule.days` = 0=Mon. Nếu #55 copy `days` 0-6 vào `lesson.day` không +1: Monday lesson `day=0` **biến mất cả dashboard lẫn cột T2** (`=== 1`). Cột "hôm nay" (T3) vẫn có `day===2` (data cũ). Signal plan mô tả **không fire** đúng failure mode. At-risk thì `0 < todayDay` **luôn** missed kể cả thứ Hai (`0 < 1`).
- **Failure scenario:** #55 ship, class T2 (`days: [0]`). Lessons `day: 0`. Dashboard Monday trống. Schedule cột T2 trống. Giáo viên tưởng không có buổi — không điểm danh. Cùng lúc at-risk list đầy "Miss check-in" cho đúng những HV đó. Check-in từ dashboard không hiện target. Operator tin "signal vỡ" sẽ bắt — không bắt vì cả hai màn hình empty cùng lúc.
- **Evidence:**
  - Plan: "Load-bearing: `lesson.day` 1–7 khớp schedule. Signal vỡ: dashboard hôm nay trống trong khi `/schedule` cột hôm nay có buổi"
  - `apps/web/src/routes/_auth/schedule.tsx:27` `const todayIdx = 1;`
  - `schedule.tsx:53-56` `filter((l) => l.day === i + 1)` — index cột, không clock
  - `packages/api/src/contracts.ts:47-48` `0 = Monday … 6 = Sunday`
  - `apps/web/src/lib/format-schedule.ts:28-30` validate days `0..6`
  - `apps/web/src/components/modals/add-class-modal.tsx:28` `DAY_OPTIONS = dayNames.map((label, value) => ({ value, label }))` — value = 0-based index
  - `lesson-modal.tsx:38` `T{lesson.day + 1}` + `dayDates[lesson.day - 1]` — **giả định day≥1**; `day=0` → `T1` + `dayDates[-1]`
  - Phase 1 formula `d === 0 ? 7 : d` = JS `getDay` (Sun=0), **không** phải class-schedule 0=Mon
- **Suggested fix:** Một adapter duy nhất `classScheduleDayToLessonDay` (0–6 → 1–7) dùng cho #55 **và** dashboard. Test: `day=0` upcoming không lọt at-risk Monday; fixture 0-based phải fail rõ. Đừng dùng schedule today-column làm canary — nó hardcode.

## Finding 5: Phase 1 "read-only, không input" là sai cho feature — client clock chọn target check-in, server không bind today

- **Severity:** High
- **Location:** Phase 1 Security Considerations; Phase 2 Architecture check-in; Phase 2 "Upcoming today = điểm danh được"
- **Flaw:** Phase 1 ghi "Read-only derive… Không input user." Feature ship ở Phase 2 **giữ** POST check-in. Filter today là **client** `new Date()`. Server chấp mọi upcoming cùng org (Finding 1). "Today" không phải security boundary — chỉ UX filter. Clock máy giáo viên (TZ khác VN, tamper, tab overnight) đổi tập lesson ID one-click từ home. Origin/CSRF/org-scope **đã có** và plan không phá — nhưng claim "không input / không leak" che mutation path. Check-in body `{}` tốt; ID vẫn đến từ UI list.
- **Failure scenario:** Giáo viên TZ `America/Los_Angeles` (UTC−7). 21:00 VN = 07:00 PT cùng ngày… nửa đêm: `getDay()` lệch. Dashboard hiện weekday khác lớp VN. Bấm Điểm danh — server complete upcoming đó. Hoặc XSS/extension trên origin app đổi `Date`. Không cần forge body (strict `{}`); chỉ cần lessonId từ list. `findLessonAction` chỉ check org+enrollment class match — 0 today check (`kernel.ts:129-140,323-331`).
- **Evidence:**
  - Phase 1 Security: "Read-only derive từ snapshot org-scoped đã load. Không input user."
  - Phase 2: `const now = new Date()` một lần/render; "Upcoming today = điểm danh được"
  - UI mutation: `dashboard.tsx:73-81` `run(l.id, { type: "check-in", lessonId: l.id }, …)`
  - Server: `kernel.ts:354-356` + `:330-331` chỉ upcoming; Origin 403 `kernel.test.ts:1542-1551` (giữ, không phải today-bind)
  - Org ctx: `apps/server/src/app.ts:75-79` `first.orgId` — mọi member org check-in mọi lesson (pre-existing; plan không thu hẹp)
- **Suggested fix:** Sửa Security Considerations: mutation path = check-in existing; today filter **không** authz. Nếu product cần "chỉ điểm danh hôm nay từ dashboard", enforce date trên server. Clock: org TZ (VN) hoặc `Intl` cố định, không silent `Date.getDay()` browser. Test helper TZ: `Date` UTC midnight Sunday vs local Monday.

## Finding 6: Contract test Phase 2 là phantom — comment/alias qua cửa, leftover mock risk/debt không bị khóa

- **Severity:** High
- **Location:** Phase 2 Tests Before 1–2; Success "0 hardcoded KPI"; Validation Matrix "Source contract"
- **Flaw:** `kernel-runtime.contract.test.ts` `readFileSync` + `toMatch` / `not.toMatch` trên **source string**. Plan thêm cấm `cô Lan`, `7.5`, `l.day === 2` và bắt `lessonsToday` / `atRiskRows`. (1) `lessonsToday` trong comment đủ xanh. (2) `s.atRisk` / `tags.includes("nợ học phí")` / `data.invoices` / `fmtK` **không** bị cấm — implementer giữ filter cũ + helper; runtime vẫn empty (atRisk false) **hoặc** sau này mapStudents đổi thì mock risk quay lại. (3) Không assert check-in vẫn `body: {}` / path `/api/lessons/.../check-in`. (4) Không cover authz org. Plan gọi đây là "contract lock" ngang check-in hiện có — overclaim.
- **Failure scenario:** Cook ghi `// lessonsToday atRiskRows` rồi giữ `l.day === 2` viết `l.day==2` (regex `l.day === 2` miss). Hoặc KPI `"7,5"` / `"6.2 triệu"`. CI xanh. Pilot vẫn mock. Hoặc giữ `fmtK(debt)` — lộ số nợ thật (invoice) dù M2 non-goal; plan muốn "—". UAT thấy nợ, plan nói "Response: M2" nhưng source vẫn derive.
- **Evidence:**
  - Style: `kernel-runtime.contract.test.ts:12-14,160-164` `readSrc` + `toMatch(/void run\()/)`
  - Phase 2: "Dashboard source **có** `lessonsToday` / `atRiskRows` / `useDirectKernelAction` / `void run(` / `disabled={busy || isPending(l.id)}`"
  - Phase 2 **không** `not.toMatch(/s\.atRisk|nợ học phí|data\.invoices|fmtK/)`
  - Runtime check-in lock thật nằm `repos/kernel.ts:80-83` + server schema — Phase 2 **không** extend test đó cho dashboard body
  - `dashboard.tsx:167-190` hiện derive invoice debt — surface plan muốn xóa, test string-list không nhắc `fmtK`
- **Suggested fix:** Helper unit (Phase 1) là source of truth hành vi. Contract: `not.toMatch` leftover filter + `fmtK` + `day === 2` variants. Cấm không đủ — thêm test render/selector với fixture. Không gọi source-grep là "reload covered".

## Finding 7: `coerceStatus` unknown → `upcoming` biến row rác thành missed-check-in

- **Severity:** Medium
- **Location:** Phase 1 `atRiskRows` trên `Lesson[]` sau `mapLessons`; không có bước "chỉ status đã biết"
- **Flaw:** `mapLessons` coerce status lạ → `"upcoming"`. At-risk missed = upcoming && day < today. Row corrupt/legacy/typo (`weird-status` trong test) thành tín hiệu rủi ro. Server vẫn 409 nếu status DB không phải upcoming — UI hiện "Điểm danh" (Phase 2 keep button nếu không completed) → fail toast. Classification và CTA lệch server.
- **Failure scenario:** Row `status="no-show"` (ai đó SQL). Client hiện upcoming. Thứ Tư + `day: 1` → badge Miss check-in + nút Điểm danh. POST 409 `lesson is not upcoming`. Giáo viên tin HV miss; server không nhận attendance. Snapshot vẫn raw status; chỉ display layer nói dối.
- **Evidence:**
  - `apps/web/src/lib/repos/lessons.ts:32-35,57` unknown → `"upcoming"`
  - Test cố ý: `lessons.test.ts:90-91` `status: "weird-status"`
  - Phase 2: "Check-in button chỉ trên `l.status !== "completed"` như hiện tại" `dashboard.tsx:68-86`
  - Server: `kernel.ts:330-331` raw DB status
- **Suggested fix:** At-risk và today list dùng status **sau** coerce chỉ khi raw ∈ allowlist; unknown drop khỏi risk + ẩn nút check-in. Test `weird-status` không vào `atRiskRows`.

## Finding 8: Greeting `user.name` + lead `vi-VN` — claim "không new PII" đúng hẹp; session name không sanitize ngoài React

- **Severity:** Medium
- **Location:** Phase 2 Requirements greeting; Security "Không new PII surface"
- **Flaw:** `user.name` từ Better Auth, render `{title}` trong `PageHead` (React escape — XSS DOM không phải vector). Threat thật: **display integrity**. Bootstrap org dùng `session.userName` làm **org name** (`app.ts:64`). Name OAuth dài/HTML/emoji hiện full trên dashboard title. Không max-length ở UI. Không phải leak cross-org. Plan nói "Session chỉ đọc `user.name` đã có trên layout" — đúng sidebar, nhưng dashboard **nhân** PII session lên page head (trước đây hardcode "cô Lan"). Low exploit, nhưng Security Considerations bỏ qua session-as-PII và org-name coupling.
- **Failure scenario:** Account Google `name` = string 200 ký tự / chứa tên học viên (shared family account). Dashboard "Chào buổi sáng, {name}". Screenshot / screen-share pilot lộ. Không authz mới.
- **Evidence:**
  - Phase 2: `user.name || "Giáo viên"`; Security "Không new PII surface"
  - `sidebar.tsx:203-204` cùng fallback
  - `page-head.tsx:3-7` `{title}` text child (escape OK)
  - `apps/server/src/app.ts:64` `name: session.userName` khi bootstrap org
- **Suggested fix:** Reuse `displayName` helper sidebar; truncate. Security note: PII session không mới, nhưng page title public-on-screen. Không claim zero PII.

---

## Scout notes (edge, không thành finding riêng nếu đã gộp)

- Midnight: `now` một lần/render, 0 timer — tab overnight hiện wrong weekday; check-in theo list stale (gộp Finding 5).
- 1:2: hai row cùng `day+time` — plan 1:2=hai student độc lập; OK. Sort `localeCompare` time ổn nếu HH:MM padded (`TIME_REGEX` create-class; lesson.time **không** validate lúc insert).
- `useDirectKernelAction` `pendingKey` lock **mọi** nút dashboard khi 1 check-in pending — pre-existing, không nới.
- Tenant: `loadSnapshot` org-scoped — plan claim isolation **đúng** cho read. `first.orgId` multi-membership — pre-existing, ngoài #57.
- Class detail `s.atRisk` luôn false — dashboard mới vs roster "Ổn" (Finding 3).

---

## Recommended Actions

1. **Block** ship today-selector trên `lesson.day` weekday nếu #55 sẽ nhân occurrence — date hoặc blockedBy #55 (Finding 1).
2. **Cắt** reason `absent` / badge Vắng khỏi #57 hoặc thêm write path (Finding 2).
3. **Thu hẹp** missed-check-in; cấm Sunday-all-missed (Finding 3).
4. **Một** day-index adapter; đừng tin schedule todayIdx canary (Finding 4).
5. Viết lại Security Considerations: check-in là mutation; today ≠ authz (Finding 5).
6. Contract test: cấm leftover `atRisk`/invoice/`fmtK`; đừng tin source-grep (Finding 6).
7. Unknown status không thành upcoming-risk (Finding 7).

---

## Unresolved questions

- Issue 55 sẽ ghi `lesson.day` theo 0–6 (class schedule) hay 1–7 (schedule UI)? Plan assume 1–7; create-class là 0–6 — **chưa có code sinh buổi**.
- Product có coi "vắng" = không check-in, hay cần status `absent` riêng? Kernel hiện chỉ completed/cancelled.
- Org timezone: VN cố định hay browser local?

Status: DONE_WITH_CONCERNS
Summary: Plan fact-check phần lớn path đúng, nhưng load-bearing "buổi hôm nay" trên `lesson.day` weekday + at-risk `absent` không có write path + missed-check-in over-flag là insecure design cho attendance/risk. Contract test Phase 2 không khóa hành vi.
Concerns/Blockers: Finding 1–2 phải resolve trước cook; #55 day convention chưa chốt.
