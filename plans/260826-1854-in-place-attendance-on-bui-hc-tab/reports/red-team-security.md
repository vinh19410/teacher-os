# Red Team — Security Adversary

Plan: `260826-1854-in-place-attendance-on-bui-hc-tab`
Roles: Fact Checker + Contract Verifier
Verdict: **BLOCK** — date-gate và sequential-head là UI theater; write path hiện tại đã cho phép điểm danh buổi tương lai, đốt buổi đã trả tiền, và sơn sai ngày.

Không review lint/type/build. Mọi finding có `file:line` từ codebase thật.

---

## Callers of `check-in` (plan claims they stay unchanged)

Plan pin 1 + P2 "Không sửa `lesson-modal.tsx`, `dashboard.tsx`, `data-actions.ts`, server":

| Caller | Path | Date gate? | Sequential head? | Plan action |
|---|---|---|---|---|
| Dashboard CTA | `apps/web/src/routes/_auth/dashboard.tsx:88-99` | **Không** — `lessonsToday` lọc **weekday** (`dashboard-from-kernel.ts:12-18`) | Không | **Đóng băng** |
| `/schedule` modal | `apps/web/src/components/schedule/lesson-modal.tsx:157-184` | **Không** — `dateIso` chỉ render (`:113-115`), CTA khi `status === "upcoming"` | Không | **Đóng băng** |
| Kernel command | `apps/web/src/lib/repos/kernel.ts:88-91` | Không | Không | Không đổi |
| Action union | `apps/web/src/lib/data-actions.ts:5` | — | — | Không đổi |
| Server POST | `apps/server/src/routes/kernel.ts:688-690` → `lessonStatusAction:647-686` | **Không** — chỉ `status === "upcoming"` + org + enrollment pair | **Không** | Không đổi |
| Fixture reducer | `apps/web/src/lib/data-store-reducer.ts:40-45` | Không | Không | Không đổi |
| E2E cũ | `apps/e2e/specs/class-operations.spec.ts:18+` | Cố ý check-in trên `/schedule` | — | **Giữ nguyên** (P3) |
| Tab Buổi học (mới) | table + modal P2 | UI-only `dateISO <= todayISOVietnam()` | UI-only | Thêm |

Bất kỳ session org nào `GET /api/kernel` (`kernel.ts:324-327`) nhận **toàn bộ** `lessons[].id` rồi `POST /api/lessons/:id/check-in` body `{}`.

---

## Finding 1: Date-gate UI-only — write path điểm danh buổi tương lai không bị chặn

- **Severity:** Critical
- **Location:** Plan Overview pin 3; Design D3; Phase 2 "Date gate UI-only"; Phase 3 "Check-in `/schedule` không date-gate"
- **Flaw:** Plan **cố ý** đặt "buổi tương lai khóa" hoàn toàn ở UI. Server không có cột ngày. `lessonStatusAction` chỉ đòi `upcoming` + cùng org + enrollment khớp class. Plan cấm sửa server/`lessonActionSchema`. Hệ quả: control "khóa buổi chưa học" là badge, không phải trust boundary.
- **Failure scenario:** GV login. Attacker (XSS, extension, tab DevTools, hoặc chính GV) lấy id upcoming từ snapshot. `POST /api/lessons/<futureId>/check-in` + cookie + `Origin: <CORS_ORIGIN>` + `Content-Type: application/json` + body `{}` → **200**. Cùng id bấm "Điểm danh" trên `/schedule` tuần sau (modal không đọc `dateIso` để disable) hoặc trên Dashboard nếu trùng weekday. Tab Buổi học vẫn vẽ Badge "Sắp tới". Attendance + `pkg.remaining` đã đổi.
- **Evidence:**
  - Plan pin 3: *"Date gate UI-only"*; D3: *"Server không có cột date (`schema/lesson.ts`)"*
  - `packages/db/src/schema/lesson.ts:19-39` — cột: id, orgId, classId, enrollmentId, day, time, dur, type, status, topic, zoom, createdAt. **0 cột date**
  - `apps/server/src/routes/kernel.ts:647-686` — guard: 401, body `{}`, 404, enrollment mismatch 409, `status !== "upcoming"` 409, conditional UPDATE. **0 so sánh ngày**
  - `apps/web/src/components/schedule/lesson-modal.tsx:113-115,157-184` — `dateIso` chỉ format; CTA khi `upcoming`
  - Phase 3 Architecture: *"Check-in `/schedule` không date-gate"*
  - P2 Success: *"Diff không thêm endpoint / không sửa `lessonActionSchema`"*
- **Suggested fix:** Không ship "tương lai khóa" khi write path mù ngày. Một trong: (a) cột `date` + server reject `date > todayVN`; hoặc (b) đổi copy thành "CTA ẩn trên tab này, `/schedule`/API vẫn điểm danh mọi upcoming"; **và** chặn check-in trên `lesson-modal` khi `dateIso > todayISOVietnam()`. Pin "UI-only" là chấp nhận giả mạo — không phải mitigation.

---

## Finding 2: Sequential-head UI-only + prefix heuristic = sơn sai ngày và đốt buổi đã trả

- **Severity:** Critical
- **Location:** Plan "Why sequential"; Phase 1 helper; Phase 2 1 POST/click
- **Flaw:** Plan **biết** check-in upcoming id nào của sid cũng tăng `completed` rồi `sidStateAt` sơn occurrence **sớm nhất**, không phải dòng đang nhìn. Vẫn để server nhận **mọi** upcoming id. `remaining` derive từ count completed của enrollment. Một POST vào id "buổi 12" trong slot bag = buổi 1 hiện "Đã học" + trừ 1 buổi gói.
- **Failure scenario:** Lớp 12 buổi Tue, HV chưa điểm danh. Attacker/GV POST check-in id upcoming **cuối** bag (hoặc bấm card thứ 12 trên Dashboard — Finding 3). Server 200, row đó `completed`. UI tab Buổi học: occurrence 1 (hôm nay/quá khứ) Badge "Đã học"; buổi 12 vẫn "Sắp tới". Sổ điểm danh nói HV có mặt buổi 1 — sai. `mapStudents` `done += 1`, `remaining -= 1`. Lặp 12 lần → gói về 0. Không 409 (id khác nhau). Không undo (plan tự nhận).
- **Evidence:**
  - Plan: *"Check-in **bất kỳ** upcoming row của sid đều sơn occurrence chưa đánh dấu **sớm nhất**"*
  - `apps/web/src/lib/class-sessions.ts:56-57,167,214-218` — `rows` = slot bag; `sidStateAt`: `slotIndex <= completed → completed`
  - `apps/web/src/lib/class-sessions.test.ts:80-83` — mỗi Tue occurrence gắn **13** Tue rows
  - `apps/server/src/routes/kernel.ts:668-684` — UPDATE theo id, không theo slotIndex/thứ tự
  - `apps/web/src/lib/repos/students.ts:27-50` — `done` = count `status === "completed"` theo `enrollmentId`
  - P1 helper `firstUpcomingLessonId` chỉ chọn id cho **button**; server không gọi hàm này
- **Suggested fix:** Server chỉ chấp nhận upcoming id **đứng đầu** của enrollment (ORDER BY createdAt/id, status=upcoming LIMIT 1) — 409 nếu id không phải head. Đó mới là sequential. Helper UI không đủ. Test: POST id thứ 2 trong series → 409, snapshot không đổi, remaining không giảm.

---

## Finding 3: Dashboard "hôm nay" là dump weekday — plan đóng băng lỗ điểm danh cả series

- **Severity:** High
- **Location:** Plan pin 9 / D4 "khớp dashboard"; Phase 2 copy `dashboard.tsx:87-99`; Phase 3 giữ e2e `/schedule`
- **Flaw:** Plan coi dashboard là pattern sạch (1 enrollment / click) và **cấm** sửa. `lessonsToday` **không** lọc ngày lịch — chỉ `lesson.day === weekday máy` và `status !== cancelled`. Lớp 12 buổi cùng weekday → Dashboard vẽ tới **12** nút "Điểm danh" cho cùng HV. `new Date()` local, không `todayISOVietnam()`.
- **Failure scenario:** Thứ Ba VN. GV mở `/dashboard`. 12 card upcoming Tue. Bấm hết. 12 POST id khác nhau, không 409. Tab Buổi học: 12 "Đã học". Gói = 0. Plan tuyên bố "buổi tương lai chỉ Badge Sắp tới" — **sai trên màn hình kế bên**, và P3 **khóa** hành vi đó bằng e2e cũ (check-in `/schedule` trên lớp start-tomorrow).
- **Evidence:**
  - `apps/web/src/lib/dashboard-from-kernel.ts:7-18` — `lessonDayFromDate(now.getDay())`; filter `lesson.day === day`
  - `apps/web/src/routes/_auth/dashboard.tsx:41-42,72-99` — `lessonsToday(data.lessons, now)`; mọi non-completed có Button check-in
  - `apps/web/src/lib/week-grid.ts:30-35` — `todayISOVietnam` **không** được dashboard import
  - Phase 3: *"Check-in `/schedule` không date-gate → prefix sơn buổi 1"*
  - P2: *"Không sửa: … `lesson-modal.tsx`, `dashboard.tsx`"*
- **Suggested fix:** `lessonsToday` phải giao weekday **và** occurrence calendar ≤ hôm nay VN — đòi cột date hoặc cùng derive `buildClassSessions`. Không được gọi dashboard là "đã tuần tự" khi nó enumerate cả series. P3 không được dùng e2e cũ như bằng chứng date-gate sống.

---

## Finding 4: Intra-org privilege — không class ACL, `role` chết, snapshot enumerate mọi lesson + PII

- **Severity:** High
- **Location:** Plan D1 "reuse check-in"; Success "Không file server"; Phase 2 modal `studentById`
- **Flaw:** Mọi membership trong org gọi được check-in **mọi** lesson org. `membership.role` tồn tại nhưng `KernelCtx` chỉ `{orgId, userId}` — không đọc role, không bind teacher↔class. Unique `(orgId, userId)` **cho phép** nhiều user một org. `GET /api/kernel` dump toàn bộ students (phone, zalo, parentName, parentPhone) + mọi `lessons[].id`. Modal P2 nhận `studentById` org-wide, không roster thu hẹp.
- **Failure scenario:** User B được thêm vào org (schema sẵn; invite là plan khác). B `GET /api/kernel` → id + SĐT + phụ huynh mọi HV. B điểm danh / đốt gói lớp của A. Cùng user đánh cắp session: một fetch lấy catalog id, script check-in hàng loạt (Finding 1–2). Modal 1:2+ nhận lookup đủ PII dù plan chỉ render `name`.
- **Evidence:**
  - `apps/server/src/app.ts:14-17,79` — `KernelCtx = { orgId, userId }`; **không** set `role`
  - `apps/server/src/app.ts:65-69` — bootstrap ghi `role: "teacher"` rồi bỏ
  - `packages/db/src/schema/membership.ts:23,28-29` — `role` + unique `(orgId, userId)` (không unique userId toàn cục)
  - Grep `apps/server`: `role` chỉ bootstrap + test expect — **0** `role ===` trên handler
  - `apps/server/src/routes/kernel.ts:305-321,647-654` — find + write theo `orgId`, không `classId` ownership
  - `apps/server/src/routes/snapshot.ts:90-92,187-194` — `select()` student → map phone/zalo/parentName/parentPhone
  - `packages/api/src/contracts.ts:218-225` — `KernelStudentRow` PII đầy đủ
  - `apps/web/src/lib/mock-data.ts:3-25` — `Student.phone`, `parent.phone`
  - P2 step 6: `studentById(sid)?.name ?? sid` — lookup org-wide; miss → lộ UUID
- **Suggested fix:** Handler check-in: lesson.classId ∈ lớp user được dạy (khi chưa có ACL, document **mọi member org = superuser điểm danh**). Đừng đưa `studentById` đầy PII vào modal — truyền `Map<sid, {name}>` đã filter `sessionStudents`. Snapshot tách roster class khỏi phone/parent nếu modal không cần.

---

## Finding 5: `busy`/409 không serialize cross-surface — heal-409 nói dối trên mọi 409

- **Severity:** High
- **Location:** Plan D6 / pin 11; Phase 2 `disabled={busy || isPending}`; Risk "409" / "Hai hook instance"
- **Flaw:** (1) `useDirectKernelAction` serialize **một instance**. Dashboard, `lesson-modal`, `$classId` mỗi nơi một hook (`dashboard.tsx:35`, lesson-modal `:29`, `$classId.tsx:64`). Command bus serialize **một tab**. Hai tab / Dashboard + Buổi học = hai POST id khác nhau, cả hai 200. (2) `planDirectOutcome` mọi HTTP 409 = "đã lưu trước đó" + heal. Server 409 cũng là `"lesson enrollment mismatch"` (`kernel.ts:662-663`) — **không** phải check-in thành công. Plan reuse `run()` không phân biệt.
- **Failure scenario:** Tab A class-detail bấm sequential head id1. Tab B `/schedule` bấm id2 cùng sid (future). Cả hai 200. Prefix +2, hai occurrence sớm nhất thành "Đã học", remaining −2. `busy` trên A không disable B. Hoặc hàng enrollment lệch: POST 409 mismatch → toast *"Dữ liệu đã được cập nhật trước đó"* — GV tin đã điểm danh.
- **Evidence:**
  - `apps/web/src/lib/use-direct-kernel-action.ts:11-33` — `if (pendingKey) return`; `busy: pendingKey !== null`; per-hook `useState`
  - `apps/web/src/lib/repos/kernel.ts:346-351,405-414` — queue in-process; `inFlight` key = `JSON.stringify(action)` (id khác = POST khác)
  - Plan D6 chỉ sợ notes + attendance **cùng route**
  - `apps/web/src/lib/kernel-outcome.ts:30-37` — `result.status === 409` → info + `heal-409`
  - `apps/server/src/routes/kernel.ts:662-666` — 409 mismatch **và** 409 not-upcoming, cùng status code
  - P2: đóng modal không hủy POST (`lesson-modal.tsx:57-61`)
- **Suggested fix:** 409 mismatch ≠ heal-success (error toast, không "đã cập nhật"). Sequential server-side (Finding 2) để hai tab không +2 prefix. Nếu giữ UI-only, ít nhất disable check-in `/schedule`+dashboard khi date/head không hợp lệ — plan đang cấm đúng chỗ cần vá.

---

## Finding 6: Modal roster + `id` trên slot bag + `run` trên table = catalog mục tiêu nằm cạnh write primitive

- **Severity:** High
- **Location:** Phase 1 Pick thêm `id`; Phase 2 thread `run`; modal `sessionStudents` + `studentById`
- **Flaw:** P1 nhét `id` vào mọi row của slot bag. Bag **dính mọi occurrence** (`class-sessions.ts:167`, test 13 rows/occurrence). P2 đưa `run`/`isPending`/`busy` vào table/modal. Date/head chỉ ẩn button. Cùng fiber: mọi upcoming id của slot + hàm POST. `studentById` đóng PII cả org. Fallback `?? sid` lộ id nội bộ. Plan cấm iterate `session.rows` — đó là hy vọng vào cook, không phải control.
- **Failure scenario:** Mở tab Buổi học. Console: lấy `session.rows.filter(r => r.status==="upcoming").map(r => r.id)` rồi `run(id, {type:"check-in", lessonId:id}, "…")` — vượt date-gate không cần rời trang. Modal 1:2+ mount lookup PII; DevTools đọc phone/parent của HV không thuộc buổi. Cook sơ ý `session.rows.map` → N button / sid (13 Tue) = fan-out plan cấm, mỗi click vẫn 200.
- **Evidence:**
  - P1: `ClassSessionLesson` Pick thêm `"id"` (`class-sessions.ts:40-43` hiện **chưa** có `id`)
  - `class-sessions.ts:56-57,167` + test `:80-83`
  - P2 Architecture: `ClassScheduleTable({ ..., run, isPending, busy })`
  - P2 step 7: `studentById(sid)?.name ?? sid`
  - `apps/web/src/lib/mock-data.ts:3-8` + snapshot `:187-194`
  - Pin 2: *KHÔNG iterate `session.rows`* — chỉ instruction, 0 server/test chặn fan-out ngoài unit helper
- **Suggested fix:** Đừng gắn `id` lên bag rồi filter lúc render. Helper trả **một** `lessonId` cho sequential head. Modal props: `attendees: {sid, name, lessonId | null, display}[]` đã minimize — không pass `studentById`. Contract test fail nếu table/modal đụng `session.rows` trong JSX.

---

## Finding 7: Hợp đồng body `{}` / CSRF không được plan này khóa — P3 cấm đúng test đang giữ cửa

- **Severity:** Medium
- **Location:** Plan D1 `kernel.ts:646-690`, `data-actions.ts:5`; Phase 3 "Không sửa `kernel.test.ts`"; e2e mới không assert body
- **Flaw:** Empty-body + Origin/JSON là **toàn bộ** CSRF/forgery defense (cookie `SameSite=None`). Plan tuyên bố "đã khóa" rồi **cấm** đụng `kernel.test.ts` / `data-actions.ts`. E2E mới chỉ click + toast `"Đã điểm danh."` — không intercept `POST /api/lessons/:id/check-in` để assert body `{}` và Origin. Cook "tiện" gửi `{dateISO}` / nới `.strict()` thì P3 vẫn xanh. Citation CSRF `kernel.ts:110-116` **sai** — cắt cụt content-type 415.
- **Failure scenario:** Cook thêm field vào body "để ghi ngày". Nới `lessonActionSchema`. Client gửi status/date. CSRF vẫn dựa Origin string-equal; thiếu test mới trên CTA. Extra key lọt → client nhét `status` (đúng thứ Wave 4 `.strict()` chặn). P3 cấm file đang lock việc này.
- **Evidence:**
  - `packages/auth/src/index.ts:49-52` — `sameSite: "none"`, `secure`, `httpOnly`
  - `apps/server/src/routes/kernel.ts:110-126` — comment 110-112; Origin **113-117**; Content-Type **118-121**. Plan ghi 110-116
  - `packages/api/src/contracts.ts:173-179` — `lessonActionSchema = z.object({}).strict()` (plan đôi khi dẫn :153 — **stale**)
  - `apps/server/src/kernel.test.ts:1893-1920` — no Origin 403; form 415; `{status:"completed"}` 400
  - `apps/web/src/lib/repos/kernel.ts:88-91` + `repos/kernel.test.ts:420-424` — body `{}`
  - Phase 3: *"Không sửa `data-actions.ts`, `apps/server/src/kernel.test.ts`"*; e2e chỉ toast/Badge
  - Phase 3 CSRF note chỉ cho `POST /api/classes` (`Origin: http://localhost:8001`) — **không** cho check-in
- **Suggested fix:** P3 phải giữ (không cấm) assert hiện có **và** thêm e2e: request check-in từ CTA = path `/api/lessons/:id/check-in`, body byte `{}`. Sửa citation CSRF thành `kernel.ts:113-126`. Đừng gọi D1 là lock nếu plan cấm mở file lock.

---

## Finding 8: Fact-check gãy — citation lệch, `startDate` không validate, `dateISO` dùng đúng anti-pattern plan cấm

- **Severity:** Medium
- **Location:** Toàn bộ citation; Phase 3 assumption `classCreateSchema.startDate`; `buildClassSessions` dateISO
- **Flaw:** Verifier không được tin line số plan. Một số claim đúng hướng nhưng lệch dòng; một số tự mâu thuẫn với code plan cấm đụng.
- **Failure scenario:** Cook copy `week-grid.ts:29-34` / `kernel.ts:110-116` / `sidStateAt :209-233` → trượt implementation. Phase 3 POST `startDate: vietnamTodayISO` vì schema `z.string()` không future-check — **cũng** nhận `"1900-01-01"` / garbage; 12 buổi đều `dateISO <= today` → CTA tuần tự đốt cả khóa trên **đúng UI mới** (date-gate vô nghĩa với lớp quá khứ). `dateISO` build bằng `toISOString().slice(0,10)` — đúng chuỗi pin 3 cấm cho "today".
- **Evidence (sai / lệch):**

| Claim plan | Thực tế |
|---|---|
| CSRF `kernel.ts:110-116` | Guard `113-126` (Origin + 415) |
| `lessonActionSchema` / contracts `:59` cho startDate | `startDate` đúng `:59` (`z.string().default("")`, **0** format/future). Schema action ở `:179` không `:153` |
| `sidStateAt` / `sessionStatus` `:209-233` | `sidStateAt` `214-218`; `sessionStatus` `226-237` |
| `sessionStudents` `:240-248` | Function `245-253` |
| `todayISOVietnam` `:29-34` | Function `30-35` |
| `dashboard.tsx:87-99` | Button block `88-99` (gần) |
| `lesson-modal.tsx:172-183` | Check-in `174-184` |
| `$classId.tsx:356-376` / `:426-435` / `:442` | `tr` `357-377`; Badge `428-436`; `aria-label` `443` |
| `use-direct-kernel-action.ts:13-33` | Hook `11-33` |
| `kernel-runtime.contract.test.ts:253-276` | Test bắt đầu `255` |
| `class-sessions.test.ts:76-80` (13 rows) | Assert 13 rows `80-83` |
| `boot.ts:19-23` CORS | `PORT` `19`; `CORS_ORIGIN` `23` |

- **Evidence (đúng):**
  - `$classId.tsx:64` hook; `:246` `ClassScheduleTable`; `:389` `tabIndex={-1}`
  - `data-actions.ts:5` `check-in`
  - `add-class-modal.tsx:53-54,103-104` — default/min tomorrow; UI chặn `!isFutureDateInputValue`
  - `class-detail-sessions-tab.contract.test.ts:66-68` — `lineCount < 500`
  - `playwright.config.ts:15` — `baseURL: http://localhost:8001`
  - `classCreateSchema.startDate` `contracts.ts:59` = `z.string().default("")` — Phase 3 đúng là không future-only; **cũng** không ISO-only
  - `class-sessions.ts:168` — `dateISO: date.toISOString().slice(0, 10)` (P1 **cấm** đụng hàm này trừ Pick `id`)
- **Suggested fix:** Sửa citation trước cook. Server: `startDate` ISO + bound năm (mirror `parseStartDate`). Không ship date-gate UI khi `dateISO` sinh bằng UTC slice và `today` bằng VN — hoặc đổi builder sang cùng formatter VN. P3 không được dựa `z.string()` như feature; đó là lỗ validate.

---

## Contract verification (tóm tắt)

| Hợp đồng plan tuyên bố | Verified? |
|---|---|
| Reuse `POST /api/lessons/:id/check-in` body `{}` | Có — `kernel.ts:688-690`, `repos/kernel.ts:88-91`, schema `.strict()` |
| CSRF Origin + JSON | Có — `kernel.ts:113-126`; cookie `SameSite=None` `packages/auth/src/index.ts:49-52` |
| Cross-org 404 | Có — `kernel.test.ts:1955-1960` |
| Date gate trên **write path** | **Không** — plan tự pin UI-only |
| Sequential head trên **write path** | **Không** |
| Dashboard / `/schedule` tôn trọng future-lock | **Không** — plan đóng băng caller ngược |
| Empty-body lock được P3 bảo vệ | **Không** — P3 cấm `kernel.test.ts` |
| Org-scoped đủ thay authz class/role | **Không** — role chết; unique cho phép multi-member |
| `ClassSessionLesson` đã có `id` | **Chưa** — Pick `40-43` chưa gồm `id` (P1 mới thêm) |

---

## Verdict

8 findings (2 Critical, 4 High, 2 Medium).

Không cook khi pin 3 còn "Date gate UI-only" mà Success Criteria vẫn viết "buổi tương lai khóa". Đó là nói dối trust boundary. Vá tối thiểu trước cook: server sequential-head + date (hoặc bỏ claim khóa); date-gate `lesson-modal` + thu hẹp `lessonsToday`; P3 assert body `{}`; sửa citation.

Không implement. Không sửa file plan.
