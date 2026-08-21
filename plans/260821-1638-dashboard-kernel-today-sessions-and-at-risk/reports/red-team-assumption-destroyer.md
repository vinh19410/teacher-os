# Red-team: Assumption Destroyer + Scope Auditor

Plan: `plans/260821-1638-dashboard-kernel-today-sessions-and-at-risk/`
Date: 2026-08-21
Lens: Assumption Destroyer (skeptic)
Verification role: Fact Checker (light) + Scope Auditor (duplicate state)
Scope: Plan document only. Product code read-only.

Không khen. Chỉ finding có `file:line`. Target: 6 giả định load-bearing trong `plan.md` Design Decision.

---

## Finding 1: Weekday-only `lesson.day` không thể biểu diễn "buổi hôm nay" hay "miss check-in" khi series tồn tại

- **Severity:** Critical
- **Location:** Plan Design Decision #2; Phase 1 Architecture "Missed check-in dùng weekday-model"; Risk "Week wrap"
- **Flaw:** Load-bearing assumption 2: weekday 1–7 đủ cho today + missed, không cần cột date. Schema `lesson.day` là integer weekday, không có calendar date (`packages/db/src/schema/lesson.ts:29`). Snapshot **cũng không** expose `createdAt` dù cột có trên row (`packages/db/src/schema/lesson.ts:36-38` vs `packages/api/src/contracts.ts:266-277` + `apps/server/src/routes/snapshot.ts:235-246`). Writer duy nhất sắp tới (#55, in progress) sinh `sessionsTotal` row **cùng weekday lặp lại**, tất cả `status: "upcoming"`: `day = sortedDays[i % days.length] + 1` (plan #55 `phase-01-contracts-and-generation.md:48-49`). `lessonsToday` lọc `day === today` giữ upcoming+completed+absent. `atRiskRows` coi mọi `upcoming && day < todayDay` là missed. Không phân occurrence tuần này / tuần sau / tuần trước.
- **Failure scenario:** Lớp T2, `sessionsTotal=12` (default `packages/api/src/contracts.ts:57`). Enroll 1 HV → 12 lesson `day=1` upcoming. Thứ Hai: dashboard "Hôm nay có 12 buổi", 12 card giống nhau (cùng `time`/`sid`), Điểm danh 1 card = check-in 1 occurrence tùy ý — 11 card vẫn today. Thứ Ba: `1 < 2` → HV vào "Miss check-in" dù 11 buổi còn lại là tương lai. Thứ Hai tuần sau: 11 upcoming `day=1` lại hiện "hôm nay"; completed tuần trước cũng hiện lại vì cùng weekday. Success "Lịch hôm nay = lessons kernel có day = weekday hôm nay" **pass** trong unit test, product "buổi hôm nay" **fail**. `mapClasses` đã collapse occurrence bằng `distinct (day,time)` (`apps/web/src/lib/repos/classes.ts:28-32`) — kernel **đã biết** weekday không đếm được buổi. Plan tái dùng cùng model cho dashboard.
- **Evidence:**
  - Plan: "Missed check-in dùng weekday-model (không calendar date trên row). Thứ Hai: không có `day < 1` → 0 missed tuần mới — đúng với model tuần."
  - Plan: "Không calendar date trên lesson (thuộc #55 nếu cần)."
  - #55 AC: `day = scheduleDay + 1`, đúng `sessionsTotal` rows, `status: "upcoming"` (GitHub #55 comment + `phase-01-contracts-and-generation.md:21-23,48`)
  - `lesson.ts:29` `day: integer("day").notNull()` — không date
  - `KernelLessonRow` không `createdAt` (`contracts.ts:266-277`)
  - Snapshot remap raw day only (`snapshot.ts:235-246`)
- **Suggested fix:** Chặn ship selector weekday-as-today. Hoặc (a) blockedBy #55 **và** đòi occurrence/date trên wire (snapshot `createdAt` + ordinal, hoặc cột date — #55 đang cấm schema), hoặc (b) thu hẹp #57 = chỉ xóa KPI hardcode + empty state, **cấm** claim "buổi hôm nay / miss check-in từ data thật" cho đến khi row phân biệt được lịch. Unit test phải có fixture 12×`day=1` upcoming — hiện Tests Before Phase 1 không có case này.

Điều kiện vỡ success: một lớp `sessionsTotal>1` cùng weekday tồn tại → criterion "Lịch hôm nay" và "Học viên rủi ro derive từ missed check-in" không còn nghĩa calendar.

---

## Finding 2: "Không blockedBy #55" biến outcome thành empty-luôn — không có writer lesson production

- **Severity:** Critical
- **Location:** Plan `blockedBy: []`; Verified Evidence "#55 OPEN, không block"; Design Decision "Không blockedBy #55"
- **Flaw:** Load-bearing assumption 5. Outcome: "Giáo viên mở `/dashboard` thấy buổi hôm nay và học viên rủi ro **từ data kernel thật**". Production insert path: **một** chỗ — helper test `insertLesson` (`apps/server/src/kernel.test.ts:131-158`). Schema tự ghi: "No create path yet — rows arrive via helper inserts until a later wave adds scheduling" (`packages/db/src/schema/lesson.ts:10-12`). Kernel chỉ `POST /lessons/:id/check-in` và `POST /lessons/:id/cancel` (`apps/server/src/routes/kernel.ts:354-359`). `add-lesson` trên bus là **syllabus curriculum**, không phải buổi lịch (`apps/web/src/lib/data-actions.ts:59-69`, `apps/web/src/lib/repos/kernel.ts:111-115`). Org mới (M1 DOD) = 0 lesson. Plan gọi empty là "đúng". Issue #57: "Hoàn thành khi mục DOD tương ứng của Milestone M1 có evidence." Roadmap M1 DÙNG ĐƯỢC đòi **cả** "Tạo/sửa/hủy buổi học sinh từ lịch lớp" **và** "Dashboard buổi hôm nay + học viên rủi ro từ data thật" (`docs/project-roadmap.md:34-36`). DOD E2E: "login → tạo lớp có lịch → thấy buổi → check-in → reload" (`docs/project-roadmap.md:44`). Empty dashboard không phải evidence đó.
- **Failure scenario:** Ship #57 trước #55. UAT: tạo lớp structured + enroll HV. `/dashboard` "Không có buổi học nào hôm nay." + 0 rủi ro. Teacher kết luận kernel không chạy. Selector tests xanh vì fixture tự bịa lesson. KPI hardcode biến mất — phần duy nhất thật sự ship được. Sau #55 merge, Finding 1 kích hoạt: empty biến thành 12 card giả-hôm-nay. Hai hướng đều miss outcome.
- **Evidence:**
  - Plan: "Không blockedBy #55: org chưa có lesson → empty đúng. #55 chỉ làm empty bớt trống."
  - Plan YAML `blockedBy: []` vs GitHub #55 `in progress` + #57 không kê blocked-by
  - `lesson.ts:10-12` no create path
  - Unique `insert(lesson)` = `kernel.test.ts:145`
  - `kernel.ts:354-359` chỉ check-in/cancel
  - Roadmap `:34-36, :44`
- **Suggested fix:** `blockedBy: [55]` hoặc tách issue: (A) xóa mock KPI — ship độc lập; (B) today/at-risk — sau writer + quy ước occurrence. Cấm tick success "từ data kernel thật" bằng empty snapshot.

Điều kiện vỡ success: staging org mới không có hàng `lesson` → criterion 1–3, 6 vacuous pass, outcome fail.

---

## Finding 3: Nhánh `absent` / badge "Vắng" chết — kernel không bao giờ ghi `absent`

- **Severity:** High
- **Location:** Plan Design Decision #2; Phase 1 Requirements `atRiskRows` absent OR missed; Phase 2 "badge Vắng / Miss check-in"
- **Flaw:** Issue #57: rủi ro = "vắng / miss check-in". Plan map vắng = `status==="absent"`. Grep `packages/db` + write path: **0** chỗ set `"absent"`. Transition matrix cứng: upcoming→completed (check-in), upcoming→cancelled (cancel), khác → 409 (`apps/server/src/routes/kernel.ts:307-331`). `KernelAction` không có mark-absent (`apps/web/src/lib/data-actions.ts:4-6`). Lesson modal chỉ Hủy buổi / Điểm danh khi upcoming (`apps/web/src/components/schedule/lesson-modal.tsx:69-92`). UI dashboard hiện map `s.atRisk` → "Vắng 2 buổi" (`apps/web/src/routes/_auth/dashboard.tsx:166`) — flag **luôn false** từ `mapStudents` (`apps/web/src/lib/repos/students.ts:73-76`). #55 generator "KHÔNG BAO GIỜ completed", luôn upcoming (`phase-01-contracts-and-generation.md:49`). Nhánh absent trong Tests Before Phase 1 item 3 là phantom: fixture tự gán status không producer nào tạo.
- **Failure scenario:** Sau #55, teacher không điểm danh. HV không bao giờ "Vắng". Chỉ "Miss check-in" và **chỉ khi** `todayDay > lesson.day`. Thứ Hai `todayDay=1`: `day < 1` không tồn tại — Plan chấp nhận "0 missed tuần mới". Sáng Thứ Hai (lúc giáo viên mở dashboard nhiều nhất) list rủi ro = `[]` dù cả tuần trước bỏ lỡ. Badge "Vắng" không xuất hiện suốt đời kernel hiện tại.
- **Evidence:**
  - Plan: `atRiskRows` — "≥1 lesson `status==="absent"` hoặc ≥1 `upcoming` với `day < todayDay`"
  - Plan Phase 1: "Sunday today=7: upcoming day 1–6 là missed." / "Thứ Hai: 0 missed"
  - `kernel.ts:330-331` `if (row.status !== "upcoming")` → 409
  - `data-actions.ts:4-6` chỉ `check-in` | `cancel-lesson`
  - `students.ts:76` `atRisk: false`
  - `dashboard.tsx:166` mock "Vắng 2 buổi" từ `s.atRisk`
  - `packages/db` zero match `absent`
- **Suggested fix:** Hoặc thêm mark-absent (ngoài scope — phải ghi vào Open questions, không "None"), hoặc **xóa** reason `"absent"` + badge "Vắng" khỏi #57 (chỉ missed, và thừa nhận Monday=0). Đừng viết test absent như behavior production.

Điều kiện vỡ success: criterion "derive từ absent / missed check-in" — absent không reachable; missed biến mất mỗi Thứ Hai.

---

## Finding 4: Canary "khớp cột hôm nay /schedule" so với `todayIdx = 1` cứng — giả định Mon=1 tự bắn

- **Severity:** High
- **Location:** Plan Design Decision "Load-bearing: `lesson.day` 1–7 khớp schedule. Signal vỡ…"; Out of scope "`todayIdx = 1`"
- **Flaw:** Assumption 1 (Mon=1 = `schedule.tsx` filter `l.day === i + 1`) **đúng với filter cột**, và #55 cũng `scheduleDay + 1`. Nhưng **tín hiệu vỡ** của plan so "cột hôm nay" trên `/schedule`. Cột highlight "hôm nay" là `todayIdx = 1` **hardcode Thứ Ba**, không phải clock (`apps/web/src/routes/_auth/schedule.tsx:27, 54-56, 61`). `dayDates` mock `[18..24]` (`apps/web/src/lib/mock-data.ts:156-157`). Chính plan Out of scope: "`/schedule` week nav / `todayIdx = 1` / `dayDates` mock". Hai câu mâu thuẫn: (a) đừng sửa schedule today mock; (b) nếu dashboard lệch "cột hôm nay" thì đổi selector. Mỗi ngày ≠ Thứ Ba, dashboard clock (Mon=1…) lệch highlight schedule (cột T3). Implementer "fix" `lessonDayFromDate` cho khớp `todayIdx` → dashboard kẹt Thứ Ba như `l.day === 2` hiện tại (`dashboard.tsx:21`).
- **Failure scenario:** Hôm nay Thứ Năm. Phase 1 helper `getDay()→4`. Schedule highlight cột i=1 (T3, `l.day===2`). QA: "dashboard trống / khác cột hôm nay" → đổi selector. Unit test 2026-08-19→3 bị ignore vì "khớp schedule". `l.day === 2` sống lại dưới tên khác. Contract test cấm literal `l.day === 2` không cấm `todayIdx`.
- **Evidence:**
  - Plan: "Signal vỡ: dashboard hôm nay trống trong khi `/schedule` cột hôm nay có buổi (cùng data). Response: đổi selector cho khớp filter schedule, không migration."
  - Plan Out of scope: "`/schedule` week nav / `todayIdx = 1` / `dayDates` mock"
  - `schedule.tsx:27` `const todayIdx = 1`
  - `schedule.tsx:54-56` filter `l.day === i + 1` (đúng 1-indexed)
  - `dashboard.tsx:21` `l.day === 2` (cùng hardcoded Tuesday)
  - `mock-data.ts:156-157` `dayNames` / `dayDates`
  - Mixed 0-based class schedule vẫn thật: `contracts.ts:47-49` `0 = Monday`; `add-class-modal.tsx:28` `DAY_OPTIONS` value = index 0–6; `format-schedule.ts:42` `dayNames[d]`
- **Suggested fix:** Canary = dashboard Monday list === schedule **cột T2** (`i=0`, `l.day===1`), **không** so với highlight `todayIdx`. Ghi rõ: `getDay` JS + `d===0?7:d` khớp filter, không khớp `todayIdx`. Cấm đổi helper để "khớp cột hôm nay".

Điều kiện vỡ success: bất kỳ weekday ≠ Tuesday + QA theo canary plan → selector bị kéo về day=2.

---

## Finding 5: Xóa StatCard + "Cần xử lý" không khóa "0 hardcoded KPI" — contract test hẹp, DOM lồng nhãn tuần mock

- **Severity:** High
- **Location:** Plan Design Decision #3; Phase 2 Tests Before ban-list; Phase 2 Implementation "Xóa grid StatCard 4 cột"; Success "0 literal KPI/tên/số hardcode"
- **Flaw:** Assumption 3: xóa StatCard 7.5/6.2tr/2.0tr/2 + list Cần xử lý = 0 KPI hardcode. Ban-list Phase 2: `cô Lan`, `Thứ Ba, 19/08`, `7.5`, `6.2tr`, `2.0tr`, `Quốc Bảo`, `INV-084`, `l.day === 2`. **Không** cấm: `Tuần này · 19–25/08`, `Minh Anh`, `num="2"`, `1.000k`, `Hết hạn 15/09`. StatCard thứ 4 là `num="2"` (`dashboard.tsx:150-154`) — xóa 3 card kia, card này lọt. Nhãn tuần **bọc** bảng rủi ro:

```140:157:apps/web/src/routes/_auth/dashboard.tsx
<div className="mt-8">
  <SectionLabel>Tuần này · 19–25/08</SectionLabel>
  <div className="grid ..."> StatCards </div>
  <div className="mt-8">
    <SectionLabel>Học viên rủi ro</SectionLabel>
```

Step "Xóa grid StatCard 4 cột" giữ wrapper + SectionLabel. Pilot view vẫn `"19–25/08"`. Cột Nợ luôn `"—"` (Phase 2 Requirements) — UI KPI nợ = 0 giả. `DataTable` không có empty copy (`apps/web/src/components/ui/data-table.tsx:8-57`); `rows=[]` = header chết, không phải empty state trừ khi tự thêm. Greeting vẫn `"Chào buổi sáng"` mọi giờ (Phase 2 Requirements) — không KPI nhưng vẫn hardcode thời điểm.
- **Failure scenario:** Contract test đỏ→xanh sau khi xóa 2 block tên trong ban-list. SectionLabel tuần mock còn. UAT: "vẫn hardcode 19–25/08 trên dashboard". Success criterion 4 tick bằng source-parse. `pnpm --filter web test` không render route.
- **Evidence:**
  - Plan Phase 2 Tests Before: ban-list 8 literal
  - Plan Success: "0 literal KPI/tên/số hardcode trong pilot view"
  - `dashboard.tsx:93-137` Cần xử lý (có `Minh Anh` — không trong ban-list)
  - `dashboard.tsx:140-154` SectionLabel + StatCard kể cả `num="2"`
  - `dashboard.tsx:156` Học viên rủi ro **nằm trong** `mt-8` tuần này
  - `kernel-runtime.contract.test.ts:160-164` hiện chỉ lock check-in, style source-parse
  - `data-table.tsx:25-55` tbody map rows, zero empty UI
- **Suggested fix:** Ban-list thêm `19–25/08`, `Tuần này`, `Minh Anh`, `num="2"`. Step: tháo SectionLabel tuần + **kéo** at-risk ra khỏi wrapper. Empty rủi ro = paragraph ngoài DataTable khi `length===0`. Nợ: xóa cột hoặc ghi rõ "cột Nợ luôn dash = M2, không phải KPI 0".

Điều kiện vỡ success: criterion 4 pass trên test source trong khi pilot view còn date/số mock.

---

## Finding 6: Duplicate at-risk state — dashboard derive vs `Student.atRisk` luôn false (class detail "Ổn")

- **Severity:** High
- **Location:** Plan Design Decision "Không dùng tag / `s.atRisk`"; File Ownership "Không sửa `mapStudents`"; Non-goals "`atRisk` trên class detail"
- **Flaw:** Assumption 6 đúng: `mapStudents` hard `atRisk: false`, `tags: []` (`apps/web/src/lib/repos/students.ts:73-76`). Reducer add-student cũng `atRisk: false` (`apps/web/src/lib/data-store-reducer.ts:108`). Plan **giữ** field + class detail đọc nó (`apps/web/src/routes/_auth/classes/$classId.tsx:152-159` → Badge "Rủi ro" / "Ổn"). Dashboard hiện dùng cùng field (`dashboard.tsx:22-27, 166`). Phase 1 cấm đọc `s.atRisk` trên helper — tốt. Scope auditor: **hai nguồn sự thật**. Kernel không persist at-risk (đúng, tránh cột mới). Display state `Student.atRisk` vẫn sống như mock flag. Fixture test `apps/web/test/fixtures/mock-data.ts:50` `atRisk: true` chỉ còn reducer tests — runtime không bao giờ true.
- **Failure scenario:** #55 + missed-check-in: dashboard "Miss check-in". Class detail cùng HV: "Ổn" vì `s.atRisk===false`. UAT "rủi ro không nhất quán". Implementer Phase 2 copy-paste dashboard cũ, filter `s.atRisk` lại — helper tests xanh, UI trống. Non-goal class detail không giảm conflict, **đóng băng** conflict.
- **Evidence:**
  - Plan: "không đọc `s.atRisk` mock"; "Không sửa `mapStudents` / schema"
  - Plan Non-goals: "`atRisk` trên class detail"
  - `students.ts:73-76` `tags: []`, `atRisk: false`
  - `data-store-reducer.ts:108` `atRisk: false`
  - `$classId.tsx:152-159` `s.atRisk ? Rủi ro : Ổn`
  - `dashboard.tsx:22-27` filter `s.atRisk || tags`
  - `mock-data.ts:24` field vẫn trên `Student`
- **Suggested fix:** Dashboard-only derive OK **nếu** ghi conflict class-detail vào Open questions / follow-up. Pin contract test: `dashboard.tsx` không match `s.atRisk` / `tags.includes`. Không tin non-goal = an toàn — đó là divergence có chủ đích chưa tuyên bố cho UAT.

Điều kiện vỡ success: criterion 3 (không đọc `s.atRisk`) pass trên helper, fail trên UX "học viên rủi ro" xuyên màn hình.

---

## Finding 7: Hard reload "đã SoT" không được chứng minh — `staleTime: Infinity` + success tautology

- **Severity:** Medium
- **Location:** Plan Design Decision #4; Phase 2 Tests After "Reload covered vì không mock layer"; Success "Hard reload: cùng snapshot → cùng list"
- **Flaw:** Assumption 4: F5 giữ data vì snapshot hydrate `useData()`, không local mock. Hướng mock-layer: đúng — `data-provider.tsx:65-80` `useQuery(kernelQueryOptions)` / `mapKernelSnapshot`; contract cấm `seedData` (`kernel-runtime.contract.test.ts:29-36`). **Không** persist QueryClient. F5 = module `main.tsx:31` tạo client mới → GET lại. Nhưng: `staleTime: Infinity`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false` (`apps/web/src/lib/query-client.ts:17-21`). Tab qua nửa đêm không refetch; `const now = new Date()` một lần/render (Phase 2 step) — không re-render thì `today` kẹt weekday cũ. Phase 2 explicit: "Không E2E mới". Success "cùng snapshot → cùng list" là tautology (identity), **không** chứng minh list = calendar today sau reload. Kết hợp Finding 1: F5 Thứ Ba tuần sau vẫn thấy completed `day=2` tuần trước — "reload giữ data" trông như mock kẹt.
- **Failure scenario:** Teacher điểm danh, F5 — OK (bus refetch + F5 GET). Teacher để tab qua 00:00, không F5: lead + today sai. QA tick reload vì "không còn cô Lan trong source". Không test F5. Midnight + weekday reuse = "data sống" nhưng sai ngày.
- **Evidence:**
  - Plan: "Hard reload giữ data vì snapshot đã là source of truth"
  - Plan Phase 2: "Reload covered vì không mock layer." / "Không E2E mới"
  - `query-client.ts:17-21` infinite stale, no focus refetch
  - `main.tsx:30-31` QueryClient module scope (F5 mới, SPA thì không)
  - `data-provider.tsx:69-80` snapshot → map
  - Validation Matrix: unit selector + source contract + web test — 0 reload/E2E
- **Suggested fix:** Ghi giới hạn: F5 document reload only; in-session clock không tự chạy. Nếu giữ claim reload: tối thiểu component test fake clock + snapshot fixture, hoặc chờ #59 E2E. Đừng tick criterion 7 bằng "không mock layer".

Điều kiện vỡ success: criterion 7 pass trên lập luận, fail khi QA F5 vào weekday lặp hoặc tab qua ngày.

---

## Finding 8: Open questions = None — ba ẩn số load-bearing bị đóng miệng

- **Severity:** Medium
- **Location:** Plan "Open questions: None — day index, at-risk rule, KPI cut đã chốt từ issue + source"
- **Flaw:** Issue #57 body không định nghĩa weekday vs date, không định nghĩa absent writer, không nói blockedBy #55. "Chốt từ issue + source" là overclaim. Source **mâu thuẫn** có chủ đích: class schedule 0–6 (`contracts.ts:47-49`) vs lesson display 1–7 (`schedule.tsx:54-56`, `lesson-modal.tsx:38` `T{lesson.day + 1}`, `$studentId.tsx:199` `Thứ ${l.day + 1}`, `$classId.tsx:193` `dayDates[l.day - 1]`). #55 chốt `+1` trên **branch khác**, chưa merge — #57 plan coi như không liên quan. At-risk rule "absent OR missed weekday" không implementable (Finding 3). KPI cut để cột Nợ `"—"` (Phase 2) là quyết định UX chưa hỏi. HOLD SCOPE hợp lệ; **đóng** open questions thì implementer không được phép dừng khi Finding 1–3 nổ.
- **Failure scenario:** Cook --auto. Phase 1 viết test absent + Monday missed=0. Phase 2 xóa StatCard. PR xanh. Review hỏi "12 buổi Monday thì sao?" — plan nói None. Merge. Pilot M1 DOD fail.
- **Evidence:**
  - Plan Open questions: "None"
  - GitHub #57 scope 3 bullet, không day-index spec
  - `contracts.ts:47-49` vs `schedule.tsx:54-56` vs `lesson-modal.tsx:38`
  - `lesson.ts:10-12` writer chưa có
  - Phase 2 Risk "Debt column —" tự nhận UAT sẽ hỏi nợ — vẫn Open questions None
- **Suggested fix:** Mở lại tối thiểu: (1) today = weekday hay calendar occurrence? (2) absent writer hay cắt badge Vắng? (3) #57 ship trước #55 = empty-only hay blockedBy? Không "None".

Điều kiện vỡ success: mọi criterion tick trong plan-life trong khi 3 ẩn số trên chưa có câu trả lời từ issue owner.

---

## Assumption scorecard

| Assumption | Load-bearing? | Broken? | Verdict |
| --- | --- | --- | --- |
| 1. `lesson.day` Mon=1 khớp `schedule.tsx` filter | Yes (selector) | Filter đúng; **canary** so `todayIdx=1` sai | Finding 4 |
| 2. Weekday-week đủ missed/today, không date | Yes | Vỡ khi `sessionsTotal>1` cùng weekday (#55) | Finding 1 |
| 3. Xóa StatCard + Cần xử lý = 0 hardcoded KPI | Yes (criterion 4) | Ban-list hẹp + DOM lồng `19–25/08` | Finding 5 |
| 4. F5 OK vì snapshot SoT | Partial (mock-off đúng) | Không test; Infinity stale; tautology | Finding 7 |
| 5. Không blockedBy #55 | Yes (outcome) | Không writer; empty ≠ "data thật" | Finding 2 |
| 6. `atRisk` luôn false → cấm `s.atRisk` | Yes (helper) | Đúng trên mapStudents; duplicate field còn sống | Finding 6 |

---

## Unresolved questions

1. Issue owner có chấp nhận #57 = **chỉ** xóa mock KPI, today/at-risk để sau #55 + date/occurrence không?
2. Ai sở hữu mark-absent? Nếu không ai — xóa `"absent"` khỏi selector trước khi cook.
3. UAT chấp nhận class detail "Ổn" vs dashboard "Miss check-in" cho cùng HV không?
4. Cột Nợ luôn "—" có được coi là còn KPI giả không?

---

Status: DONE
Summary: Sáu giả định load-bearing: 2 Critical (weekday model × series #55; empty-without-writer), 4 High (absent chết + Monday wrap; canary todayIdx; KPI contract/DOM; duplicate atRisk), 2 Medium (reload tautology; Open questions đóng miệng). Plan fail success "buổi hôm nay / rủi ro từ data thật" cả khi empty lẫn khi #55 sinh N row cùng weekday.
Concerns/Blockers: Cook --auto trên plan này sẽ ship UI xanh / product sai. Cần chốt blockedBy #55 hoặc cắt scope today/at-risk trước khi implement.
