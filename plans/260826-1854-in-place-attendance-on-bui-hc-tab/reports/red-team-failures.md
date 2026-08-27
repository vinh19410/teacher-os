# Red-team: Failure Mode Analyst

- Type: red-team (races / e2e flake / 409 heal / a11y trap / CSRF)
- Date: 2026-08-26
- Plan: `plans/260826-1854-in-place-attendance-on-bui-hc-tab/`
- Role: Fact Checker + Contract Verifier — claimed flow → live path → early return
- Scope: plan only. Không implement. Không sửa plan.

## Scope

- Files: `plan.md` + `phase-01-start.md` + `phase-02-attendance-cta-and-roster-modal.md` + `phase-03-tests-e2e-and-issue-87-note.md`
- Focus: double-click / modal stale / 409 heal, e2e ports+cookie+weekday+UTC, extract imports, global busy vs notes, a11y keyboard trap, toast/selector, Playwright CSRF, student-add lesson generation
- Scout: `staleTime: Infinity`; bus serialize + inFlight dedupe; CSRF Origin exact-match 403; Vite :8001 no proxy; lessons sinh lúc POST student không phải POST class; Modal FOCUSABLE loại disabled button

## Overall

Plan khóa sequential-head + date gate đúng hướng nhưng **e2e mới tự bắn vào cache kernel bất tử**, **modal được phép giữ session chết sau refresh**, **busy dùng chung khóa notes vì giả định POST song song đã sai**, và **cửa sổ UTC tối là flake đã biết mà cố ý không sửa**. AC persist/reload và toast "Đã điểm danh." không đi được từ các bước đã viết.

---

## Finding 1: `goto /classes` không heal cache kernel — lớp API-created vô hình

- **Severity:** Critical
- **Location:** Phase 3, section "E2E CTA — tạo lớp hôm nay qua API :8000" + Implementation step 2
- **Flaw:** `page.request.post` tới `http://localhost:8000/api/classes` đi vòng command bus. Plan biết "cache kernel cũ" rồi vẫn cho **`page.reload()` hoặc `goto /classes`** như hai lựa chọn tương đương. Chúng không tương đương. Query `['kernel']` có `staleTime: Infinity`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`. Comment sống: entry chỉ refresh qua bus hoặc retry tường minh. SPA `goto /classes` reuse cache — lớp mới không bao giờ vào store. `classById` miss → `throw notFound()` trên detail, hoặc list `/classes` không có tên lớp.
- **Failure scenario:** Junior copy step 2, chọn nhánh `goto /classes` (tránh reload vì signup vừa land `/dashboard`). `response.ok()` xanh. `getByText(CLASS_NAME)` timeout. Test CTA chết trước khi thấy nút Điểm danh. Nhánh `reload()` mới hydrate. Plan viết "hoặc" biến 50% cook thành flake đỏ.
- **Evidence:**
  - Plan: `phase-03-tests-e2e-and-issue-87-note.md:62` "Sau POST: `page.reload()` hoặc goto `/classes` — POST này bỏ qua command bus, cache kernel cũ."; step 2 `:100` lặp lại cùng "hoặc".
  - Live: `query-client.ts:5-17` "no background refetching — the `['kernel']` entry is refreshed only through the command bus or an explicit retry"; `staleTime: Number.POSITIVE_INFINITY`. `data-provider.tsx:65-73` mount gate trên query đó. `$classId.tsx:50-52` `if (!cls) throw notFound()`.
  - `createKernelCommandBus` (`kernel.ts:338-346`) là đường refresh duy nhất sau write — `page.request` không đi qua.
- **Suggested fix:** Cấm `goto` như heal. Bắt `page.reload()` rồi mới mở `/classes`. Xóa chữ "hoặc goto". Optionally đọc `id` từ `201 { id }` rồi đi detail **sau** reload.

---

## Finding 2: Cửa sổ 17:00–23:59 UTC — e2e cũ 12 "Sắp tới" vỡ, plan cấm sửa

- **Severity:** High
- **Location:** Phase 3, section "Vì sao test cũ vẫn xanh" + Risk "E2E cũ vỡ"
- **Flaw:** Test cũ tạo lớp qua UI: `getTomorrowDateInputValue()` = TZ **máy** (`setDate(+1)` local midnight). Date gate CTA = `todayISOVietnam()` = `Asia/Ho_Chi_Minh`. 17:00 UTC = 00:00 ngày hôm sau VN. "Tomorrow" máy == "today" VN. Lớp start-tomorrow của test cũ có buổi đầu `dateISO <= todayISO` → `kind === "actionable"` → Badge "Sắp tới" bị thay bằng button "Điểm danh". `getByText("Sắp tới", { exact: true }).toHaveCount(12)` còn 11. Plan: nếu đỏ thì **ghi chú, đừng nới 12**. CI GitHub Actions chạy UTC. Job tối = flake vĩnh.
- **Failure scenario:** P2 merge. CI chạy 18:00 UTC. Test `class-operations.spec.ts:18-82` đỏ. Cook P3 bị step 1 bắt "bug P2 date gate, sửa P2" — đây không phải bug date gate, là **hai đồng hồ khác nhau** plan cố ý giữ. Không ai được nới count. Suite e2e không xanh ổn định sau plan này.
- **Evidence:**
  - Plan: `phase-03-tests-e2e-and-issue-87-note.md:36` cửa sổ ~17:00–23:59 UTC; `:99` fail 12 Sắp tới = bug P2; `:119` giữ `exact: true`, cấm soft assert.
  - Live: `date-input.ts:31-35` tomorrow local. `add-class-modal.tsx:53-54` default+min = tomorrow. `week-grid.ts:21-33` VN formatter. `class-operations.spec.ts:57` `toHaveCount(12)`. `dayNames` T2+T4 (`mock-data.ts:165`); nếu tomorrow máy rơi đúng weekday lịch T2/T4 thì buổi 1 actionable.
- **Suggested fix:** Test cũ khóa startDate bằng **cùng** `todayISOVietnam()+1` ngày (hoặc clock-mock), không tin date-input local. Hoặc skip/xfail khi `getTomorrowDateInputValue() === todayISOVietnam()`. Cấm "ghi chú rồi để đỏ".

---

## Finding 3: `vnTodayMon0` không có công thức — `getDay()` máy = 0 CTA

- **Severity:** High
- **Location:** Phase 3, section "E2E CTA" + step 2 + Risk "days không khớp"
- **Flaw:** Plan bắt `days: [vnTodayMon0]` (Mon=0, `classCreateSchema.schedule.days`) "theo `Asia/Ho_Chi_Minh`" nhưng **không viết 1 dòng công thức**. `new Date().getDay()` là Sun=0, TZ máy. UTC 17:00 Wednesday = Thursday VN. `getDay()` máy = Wed; `todayISOVietnam()` = Thursday. `startDate` Thursday + `days` Wed → `buildClassSessions` bỏ Thursday, buổi đầu = Wednesday tuần sau → `kind === "future"` → 0 CTA. Step 4 `toHaveCount(1)` đỏ. Risk table chỉ cấm hardcode `[1,3]`, không cấm `getDay()`.
- **Failure scenario:** Junior viết `(new Date().getDay() + 6) % 7`. Local VN xanh. CI UTC tối đỏ — đúng cửa sổ Finding 2, triệu chứng khác (0 button, không phải 11 Sắp tới).
- **Evidence:**
  - Plan: `phase-03-tests-e2e-and-issue-87-note.md:47,59,100,123` bắt `vnTodayMon0`, không pin helper.
  - Live convention: `contracts.ts:47-51` "0 = Monday … 6 = Sunday". `class-sessions.ts:86-90` `getUTCDay()` → Mon-first 1–7. `buildClassSessions` `:102,167` walk từ `startDate` UTC midnight. `generateScheduleLessons` (`kernel.ts:78-97`) `day: (parsed.days[i % length] ?? 0) + 1` — **cũng không đọc startDate**.
  - Công thức đúng phải neo ISO VN rồi UTC weekday: `(new Date(todayISO + "T00:00:00Z").getUTCDay() + 6) % 7`.
- **Suggested fix:** Export `vietnamTodayISO` + `vnWeekdayMon0` trong `apps/e2e/specs/helpers.ts` (plan ghi optional — **bắt buộc**). Pin công thức UTC-from-ISO. Cấm `Date#getDay`.

---

## Finding 4: Modal được phép giữ ClassSession chết — click lại = 409, e2e không thấy "Đã điểm danh."

- **Severity:** High
- **Location:** Phase 2, Implementation step 6; Phase 3 toast/selector
- **Flaw:** Table `useState` snapshot `ClassSession` lúc mở modal. Step 6 bảo parent **phải** truyền session từ `sessions` mới sau refresh, rồi ngay: đóng modal nếu hết actionable là **optional, không bắt buộc**. Implementer giữ `session={modalSession}` là đúng chữ plan. Sau check-in, `reportDirectOutcome` refresh store; `modalSession.rows` vẫn `upcoming`. `sessionAttendanceState` + `firstUpcomingLessonId` tính trên bag chết → vẫn hiện button sid vừa điểm danh. Click 2 = POST cùng `lessonId` → server `status !== "upcoming"` → **409**. Toast heal: "Dữ liệu đã được cập nhật trước đó — đang tải lại…" — **không** phải "Đã điểm danh.". E2E `getByText("Đã điểm danh.")` đỏ. Heal refresh không thay object state. Button stale vĩnh.
- **Failure scenario:** (1) 1:2 GV điểm danh sid A, button A còn đó, bấm lại → 409 + toast lạ. (2) Double-click 1:1: bus `inFlight` dedupe cùng JSON **lần 1**; lần 2 sau `finally` xóa inFlight mà UI chưa đổi badge (stale) → POST 409. (3) E2E mới step 4 chờ đúng chuỗi success — bất kỳ 409 nào giết test dù row đã "Đã học" sau heal.
- **Evidence:**
  - Plan: `phase-02-attendance-cta-and-roster-modal.md:52,152` `setModalSession(s)` + optional live rebind. Phase 3 `:68,102` chờ `Đã điểm danh.`.
  - Live 409: `kernel.ts:664-665,682-683` "lesson is not upcoming". `kernel-outcome.ts:30-36` 409 → info + `heal-409`, message khác successText. `:63-68` toast heal rồi `refresh()` lần nữa.
  - Bus dedupe chỉ cùng action đang bay: `kernel.ts:345-346,403-405`. Sau settle, POST trùng id = 409 thật.
  - `firstUpcomingLessonId` đọc `session.rows` (phase-01 spec) — rows chết giữ id upcoming cũ.
- **Suggested fix:** Bắt buộc `live = sessions.find(s => s.index === modal.index)` mỗi render; `lessonId` lấy từ live. Sid `display !== "check-in"` → Badge, không button. 409 trên cùng id đang mở → đổi hàng đó thành completed từ snapshot. E2E assert badge/POST, đừng bắt buộc đúng 1 toast string.

---

## Finding 5: `busy` global khóa ghi chú — giả định hai hook POST song song là sai

- **Severity:** High
- **Location:** Phase 2 Requirements + Success "share một pendingKey"; `plan.md` pin 11 / D6
- **Flaw:** Plan thread 1 `useDirectKernelAction` vì "hai instance → notes + attendance song song". Sai. Mọi `dispatch` đi một `createKernelCommandBus` (enqueue + inFlight). Hai hook vẫn **một hàng POST**. `busy` dùng chung là UX tax không mua thêm an toàn write: attendance pending → notes `disabled={busy || …}` + `if (pendingKey) return` nuốt click không toast. Đóng modal không hủy POST (phase-02 cố ý, giống lesson-modal) → GV Esc, sang tab Ghi chú, "Lưu ghi chú" xám / nuốt. Ngược lại: lưu notes khóa hết CTA + nút mở modal (`busy` disable modal open).
- **Failure scenario:** GV điểm danh 1:2 (POST+refresh ~ network). Chuyển tab ghi chú buổi, bấm Lưu — không có toast, notes local `useState` không flush. Tưởng app hỏng. Hoặc đang soạn notes, lỡ `busy` từ CTA → không lưu được. Pin "không 2 POST cùng lúc" đã được bus đảm bảo (`kernel.ts:338-342`).
- **Evidence:**
  - Plan: `plan.md:43` pin 11; D6; `phase-02-attendance-cta-and-roster-modal.md:28,36,175`.
  - Live: `use-direct-kernel-action.ts:16-17` `if (pendingKey) return` im lặng; `:32` `busy: pendingKey !== null`. `$classId.tsx:64,209-218` notes cùng hook. `data-provider.tsx:86-103` một `busRef`. `kernel.ts:338-346,355-358,403-405` serialize + dedupe.
- **Suggested fix:** Table/modal nhận `run`/`isPending` (đúng, một hook). **Không** lấy `busy` toàn cục để disable notes. Notes giữ `isPending("class-notes")`. Bus đã chặn song song. Cấm silent return — tối thiểu toast "Đang lưu thao tác khác".

---

## Finding 6: `page.request` không thừa kế Origin trang — CSRF 403, plan chẩn đoán 401

- **Severity:** High
- **Location:** Phase 3 Non-functional + Risk "CSRF + cookie"
- **Flaw:** CSRF kernel: `Origin !== corsOrigin` → **403** `{ error: "origin not allowed" }`. `corsOrigin` e2e = `http://localhost:8001`. `page.request` là CDP/APIRequestContext, **không** gắn Origin của document `:8001`. Thiếu header → 403. Cookie miss → **401** `unauthorized`. Risk table gộp "CSRF + cookie" → signal **401**. Junior thấy 403, nghĩ URL/port, không nghĩ Origin. Vite `strictPort: 8001` **không proxy** `/api` — relative `/api/classes` = 404 HTML. Plan đúng URL tuyệt đối :8000 nhưng sai mã lỗi CSRF.
- **Failure scenario:** (1) Quên `headers.Origin` → 403, cook debug cookie. (2) Dùng `request` fixture (context riêng, 0 cookie signup) → 401. (3) `Origin: http://127.0.0.1:8001` ≠ `http://localhost:8001` → 403. Boot bind `127.0.0.1:8000` (`boot.ts:18-21`); `localhost` → `::1` trên một số runner = ECONNREFUSED, không phải 401/403.
- **Evidence:**
  - Plan: `phase-03-tests-e2e-and-issue-87-note.md:25,40-56,100,121-122`.
  - Live: `kernel.ts:110-116` Origin exact, 403; `:118` unauthorized 401; content-type must `application/json` prefix → 415. `playwright.config.ts:15,26-36` baseURL 8001, API 8000, `reuseExistingServer: false`. `boot.ts:18-22` HOSTNAME 127.0.0.1, CORS_ORIGIN 8001. `vite.config.ts:8-11` no proxy.
  - Browser fetch thật set Origin 8001 (`postKernelCommand` `kernel.ts:205-211` credentials include) — `page.request` không.
- **Suggested fix:** Snippet bắt buộc `Origin` + assert `status === 201` (không chỉ `ok()`). Risk: 403 = Origin; 401 = cookie; 415 = content-type; ECONNREFUSED = bind/host. POST `http://127.0.0.1:8000` khớp boot. Helper `createClassViaApi(page)` một chỗ.

---

## Finding 7: Focus trap vỡ khi nút Điểm danh disable — Tab thoát modal

- **Severity:** High
- **Location:** Phase 2, a11y + Modal reuse; pin 8
- **Flaw:** `Modal` trap chỉ wrap khi `activeElement === first|last` trong `button:not([disabled])`. Check-in set `disabled={busy || isPending(lessonId)}`. `Button` thêm `disabled:pointer-events-none`. Focus **kẹt trên nút vừa disable** (không còn trong list). Tab tiếp: `activeElement` không phải first/last → trap **không** `preventDefault` → focus ra overlay/tab "Học viên"/chevron hàng dưới. `aria-modal=true` nói dối. Plan thêm `onKeyDown` stopPropagation Enter/Space "phòng bubble tương lai" **sau khi xóa `tr.onClick`** — dead. Không bù focus move khi disable.
- **Failure scenario:** 1:2, Tab tới nút sid, Space/Enter check-in. Nút "Đang lưu…" disabled. Tab lần nữa focus ra bảng. Enter trên chevron (P2 bỏ `tabIndex={-1}`, chevron vào tab order) vừa expand hàng vừa GV tưởng còn trong dialog. Esc vẫn đóng (listener document) nhưng focus restore `previouslyFocused` có thể là nút hàng đã unmount thành Badge.
- **Evidence:**
  - Plan: `phase-02-attendance-cta-and-roster-modal.md:28-35,82-83,157`; `plan.md:40`.
  - Live: `modal.tsx:11-12,25-40,54` FOCUSABLE + trap + Escape. `button.tsx:36` disabled pointer-events-none. `$classId.tsx:356-389` hàng `tabIndex={0}` + chevron `tabIndex={-1}` (P2 xóa cả hai phía). `tabs.tsx:19-31` tab là `<button>` — đích Tab ngoài modal.
- **Suggested fix:** Khi nút focused bị disable, `focus()` nút Đóng / sid kế còn `check-in`. Trap phải handle `activeElement` disabled/`body`. Bỏ `onKeyDown` stopPropagation rỗng. Chevron `type="button"` giữ; đừng nhồi tabIndex giả.

---

## Finding 8: POST class không sinh buổi — quên/đua add-student = sessions null = 0 CTA

- **Severity:** Medium
- **Location:** Phase 3 step 3; Phase 1 extract imports; Phase 2 modal create
- **Flaw:** Lessons sinh trong `POST /api/students` + `classId` (`generateScheduleLessons`), **không** lúc `POST /api/classes` (chỉ insert class row + optional syllabus). `buildClassSessions` `lessons.length === 0` → `null` → legacy 5-cột, 0 CTA (đúng pin 5). Step 3 thêm HV qua UI — đóng modal chỉ khi `result.kind === "refreshed"`. Nếu cook đảo bước, hoặc `goto` (Finding 1) rồi add student trên class không thấy, hoặc assert CTA trước refresh student → count 0. `generateScheduleLessons` **bỏ qua `startDate`** — chỉ cycle weekday. Date buổi = client walk `cls.startDate`. Sai `vnTodayMon0` (Finding 3) không fail POST student; fail im ở UI.
- **Failure scenario:** Snippet step 2 không nhắc student. Junior `reload` → mở lớp → tab Buổi học ngay → bảng legacy → 0 "Điểm danh". Hoặc extract P1 thiếu import: list P1 có `lessonDayLabel` + types nhưng **P2 modal không liệt kê** `formatSessionDate`, `todayISOVietnam`, `sessionAttendanceState`, `KernelAction`. File mới typecheck đỏ; contract P1 vẫn đọc markup từ `$classId.tsx` (`class-detail-sessions-tab.contract.test.ts:50-56`) nếu quên step 7. Success P3 đòi "reload tab vẫn Đã học" nhưng step 4 không reload sau check-in.
- **Evidence:**
  - Plan: `phase-03-tests-e2e-and-issue-87-note.md:64,101-102,111`.
  - Live: `kernel.ts:73-107,368-401` student batch + `generateScheduleLessons`. `:441-481` POST class không insert lesson. `class-sessions.ts:102`. `add-student-modal.tsx:53-64` `classId` trong payload; `:66-68` close chỉ `refreshed`.
  - Extract: `phase-01-start.md:95-103,151-152`. Contract `class-detail-sessions-tab.contract.test.ts:50-63` `classDetailSrc` match `Ngày & Giờ` / `sessions === null`. Phase 2 modal title dùng `formatSessionDate` (`:27`) không nằm trong Related Code Files create.
- **Suggested fix:** Step 2–4 thành hàm `seedTodayClassWithStudent(page)` — POST class → reload → add student → đợi tên HV → mới mở Buổi học. P1 step 7 bắt buộc chuyển assert markup sang file extract **cùng PR**. P2 list import modal đủ: `Modal`, `Button`, `Badge`, `formatSessionDate`, `todayISOVietnam`, `sessionAttendanceState`, `KernelAction`, types `ClassSession`/`Student`. Step 4 thêm `page.reload()` nếu AC persist còn.

---

## Unresolved / không cook cho đến khi sửa

- F1 (`goto` ≠ reload) + F2 (UTC evening) + F3 (weekday formula) chặn e2e P3.
- F4 (modal stale optional) chặn roster 1:2 và mọi assert toast success.
- F5 (`busy` vs notes) là regress UX trên tab Ghi chú đã sống.
- F6 (CSRF 403) + F8 (lessons lúc add-student) là footgun cook.
- F7 (focus escape) là a11y regress so với pin 8.

Không khen. Không "giữ nguyên rồi ghi chú". Sửa phase 2–3 trước khi cook.
