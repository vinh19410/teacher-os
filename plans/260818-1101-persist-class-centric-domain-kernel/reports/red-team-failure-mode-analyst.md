# Red-team: Failure Mode Analyst

- Type: red-team (Murphy / recovery / race / rollback)
- Date: 2026-08-18
- Plan: `plans/260818-1101-persist-class-centric-domain-kernel/`
- Role: Flow Tracer — claimed entry → live path → early return
- Scope: plan only. Không implement. Không sửa plan.

## Scope

- Files: `plan.md` + phase-01…09
- Focus: persist path, bootstrap race, async/notFound, lesson↔enrollment, CI/D1 gap
- Scout: 13 màn vẫn `dispatch` sync; 4 detail `throw notFound()`; 0 vite proxy; 0 server test; lesson mock = `sid` không `classId`

## Overall

Plan khóa invariant đúng hướng nhưng **thiếu write-path, loading-path, schema-null, và test harness**. AC "hard refresh còn" + "13 màn hành vi giữ" không đi được từ code hiện tại nếu giữ "không sửa 13 route". Wave 4 derive remaining gãy trên lớp 1:2. Isolation AC không chạy được trên CI hiện tại.

---

## Finding 1: Wave 0 không có write path persist — dispatch vẫn chỉ memory

- **Severity:** Critical
- **Location:** Phase 1, section "Architecture" §4–5 + "Related Code Files"; `plan.md` Execution notes
- **Flaw:** Wave 0 cấm sửa 13 route + stub modal, bắt kernel write qua API, reducer chỉ còn collection chưa peel. Live write path là `dispatch(...)` sync rồi `onClose()`. Plan không chỉ intercept nào, await nào, rollback khi POST fail. React `Dispatch` không async.
- **Failure scenario:** Implementer fetch kernel lúc mount, giữ `useReducer`. GV bấm "Lưu" HV/lớp/syllabus → UI thấy row (reducer) → hard refresh → D1 trống. AC wave 0 "Tạo HV+lớp+enroll+syllabus+assign → hard refresh còn" đỏ. Hoặc fire-and-forget POST: modal đã đóng (`add-student-modal.tsx:38-58`), mạng/403 → user tưởng đã lưu, data mất, không toast/retry.
- **Evidence:**
  - Plan: "13 route files không đổi" (`phase-01-start.md:14`, `:89`). "Kernel writes qua API. Lesson/invoice/… giữ reducer" (`:97`). "hard refresh còn" (`:114`).
  - Live: `data-store.tsx:38` `useReducer(reducer, seedData)`. `add-student-modal.tsx:38-58` dispatch + reset + `onClose()` — 0 fetch. `add-class-modal.tsx:31-47` cùng pattern. `add-syllabus-modal.tsx:31-46` dispatch rồi `onCreated(id)`. `dashboard.tsx:74` / `lesson-modal.tsx:66,75` chỉ dispatch. Server chỉ `/` + `/api/auth/*` (`apps/server/src/index.ts:20-24`).
- **Suggested fix:** Wave 0 phải ghi contract interceptor: map từng `Action` kernel → POST, **chờ** 2xx rồi mới merge id server + đóng modal; 4xx/5xx giữ form + error. Hoặc bỏ "không sửa modal" và đổi 7 modal kernel gọi repo (kèm loading). Cấm dual-write dispatch+POST.

---

## Finding 2: Kernel async + `throw notFound()` — hard refresh / tạo xong = 404 vĩnh

- **Severity:** Critical
- **Location:** Phase 1 Architecture §4 (`GET /api/kernel`); Success "reload còn"; "13 route không đổi"
- **Flaw:** 4 detail route early-return `notFound` khi lookup miss. Hôm nay an toàn vì `seedData` sync. Wave 0 đổi initial = rỗng + fetch kernel. Route không được sửa → first paint miss → `throw notFound()`. TanStack không tự remount happy-path khi store fill sau.
- **Failure scenario:** (1) Hard refresh `/students/:id` | `/classes/:id` | `/syllabus/:id` | `/assignments/:id` lúc kernel chưa về → màn "Không tìm thấy" + copy "dữ liệu demo đã được reset". Fetch xong vẫn kẹt notFound. AC reload chết. (2) Tạo syllabus: modal gen `sy-xxxxxxxx`, `onCreated` navigate ngay (`add-syllabus-modal.tsx:30-46`, `syllabus/index.tsx:110-112`). Store chưa có id (POST chậm / id server khác) → detail 404 ngay sau "Tạo".
- **Evidence:**
  - Early return: `students/$studentId.tsx:68-69`, `classes/$classId.tsx:50-52`, `syllabus/$syllabusId.tsx:78-79`, `assignments/$assignmentId.tsx:38-39`.
  - Hiện initial sync: `data-store.tsx:38`.
  - Plan: `GET /api/kernel` snapshot (`phase-01-start.md:48`); "Do not modify: 13 route files" (`:89`).
- **Suggested fix:** Provider expose `status: loading|ready|error`. Cho phép sửa 4 detail: loading ≠ notFound. Hoặc `beforeLoad` trên `_auth` prefetch kernel (cần sửa `route.tsx` — plan không liệt kê). Syllabus: đợi POST trả id rồi mới `navigate`.

---

## Finding 3: Wave 4 `lesson.classId` không gắn enrollment — check-in 1:2 trừ sai / card biến mất

- **Severity:** High
- **Location:** Phase 5 Architecture + Risk; invariant 2/6
- **Flaw:** Schema lesson: `classId NOT NULL`, "enrollment/student via class roster" — **không cột `enrollmentId`/`sid`**. Derive `remaining = package.total - count(completed lessons of enrollment)`. UI live khóa `Lesson.sid`. Dashboard **return null** nếu `studentById(l.sid)` miss. Roster class filter `studentIds.includes(l.sid)`. 1:2: 1 buổi / nhiều enrollment remaining khác nhau (advise đã lock package-on-enrollment vì lý do này).
- **Failure scenario:** Lớp 2 HV, 1 lesson `classId=c2`. Check-in: (a) đếm completed theo mọi enrollment của class → cả 2 HV `remaining--` dù chỉ 1 người học; (b) adapter bịa 1 `sid` → HV kia remaining đứng yên, dashboard/schedule chỉ hiện 1 người; (c) adapter không set `sid` → `dashboard.tsx:51-52` nuốt card, nút Điểm danh biến mất, check-in không reach API. Seed đã có `type: "1:2"` (`mock-data.ts:366`) trên `l6`.
- **Evidence:**
  - Plan schema: `phase-05-wave-4-schedule-persist.md:32-36`, derive `:27`, risk "check-in gắn lesson↔enrollment" **không** thêm cột (`:77`).
  - Live: `mock-data.ts:33-36` `Lesson.sid`. `dashboard.tsx:19,50-52,74`. `lesson-modal.tsx:16`. `classes/$classId.tsx:57-59`. Reducer check-in theo `lesson.sid` (`data-store-reducer.ts:123-135`).
- **Suggested fix:** `lesson.enrollmentId` NOT NULL (1:1 và 1:2 = 1 row/HV) hoặc `lesson_attendee(lessonId, enrollmentId)`. Adapter `sid` = student của enrollment. Check-in chỉ completed + derive đúng 1 package. Cấm "via roster" không cột.

---

## Finding 4: Bootstrap không transaction — race tạo org mồ côi, không rollback

- **Severity:** High
- **Location:** Phase 1 Architecture §2; `plan.md` Execution notes
- **Flaw:** "0 membership → INSERT org + membership `teacher`. Idempotent. `unique(membership.userId)` + re-read nếu race." Không `batch`/tx D1. `organization` không unique theo user. Hai request kernel song song (React StrictMode double-mount + `GET /api/me` + `GET /api/kernel`) cùng thấy 0 row.
- **Failure scenario:** Cả hai INSERT org thành công. Một INSERT membership thắng unique. Kia fail → re-read lấy org thứ nhất. Org kia mồ côi vĩnh viễn, không GC. Timeout giữa 2 INSERT: re-read vẫn 0 membership → org thứ 3. `unique(userId)` còn khóa 1 user = 1 org mãi — invite/multi-org sau **bắt buộc migrate unique**, không phải "schema sẵn multi-teacher" (advise §constraint).
- **Evidence:**
  - Plan: `plan.md:65`, `phase-01-start.md:41`. 0 membership query + 2 insert, không batch.
  - Live: chưa có bảng; `createAuth()` per request (`apps/server/src/index.ts:20`, `packages/auth/src/index.ts:7-10`); 0 hook `user.create` (đúng ý plan) nên mọi kernel GET đều là điểm đua. `DataProvider` sẽ fetch lúc mount (`data-store.tsx:37-38` hôm nay mount trong `app-shell.tsx:65`) — StrictMode dev mount 2 lần.
- **Suggested fix:** Một `D1.batch`: insert org + membership. Unique `(membership.userId)` giữ v1. Catch unique → SELECT membership, **DELETE org vừa insert nếu membership không phải của mình**. Document: đổi unique → `(orgId, userId)` khi có invite, không pretends schema đã xong.

---

## Finding 5: Tạo lớp mặc định `syllabusId=""` vs FK `class.syllabusId`

- **Severity:** High
- **Location:** Phase 3 Context "`class.syllabusId` FK đã có từ kernel"; Phase 1 schema `class`; Wave 0 không sửa modal
- **Flaw:** UI tạo lớp default syllabus = "— Chưa gán —" (`syllabusId=""`). Plan gọi `class.syllabusId` là FK từ wave 0. Không ghi nullable / ON DELETE. Wave 0 cấm sửa modal.
- **Failure scenario:** GV bấm "Tạo lớp" không chọn giáo trình (happy path UI). POST `/api/classes` → D1 FK fail (NOT NULL hoặc empty không match syllabus.id) → 500. Nếu interceptor nuốt lỗi (Finding 1) → UI hiện lớp rồi refresh mất. Nếu schema không FK và lưu `""`, wave 2 assign/peel join syllabus nổ hoặc `syllabusById("")` undefined — class detail tab giáo trình "chưa gán" OK, nhưng mọi query `WHERE syllabusId = ?` với empty là rác.
- **Evidence:**
  - Live: `add-class-modal.tsx:18` `useState("")`; `:88-92` option `value=""`. Payload `syllabusId` luôn gửi (`:31-38`). Type `ClassGroup.syllabusId: string` (`mock-data.ts:105`) — không optional.
  - Plan: `phase-03-wave-2-syllabus-peel.md:22` "`class.syllabusId` FK đã có từ kernel". `phase-01-start.md:36` class không nói null. `phase-01-start.md:89` không sửa modal.
- **Suggested fix:** `class.syllabusId` nullable FK. Zod accept omit/null, reject `""`. Wave 0 ghi rõ. Assign-syllabus set/clear cột này.

---

## Finding 6: Wave 1/3 giữ contract test parse `dispatch add-student` trong khi đổi modal → API

- **Severity:** High
- **Location:** Phase 2 steps 2–3; Phase 4 step 4
- **Flaw:** Contract test **đọc source** tìm `type: "add-student"` + `payload.classId`. Wave 1: `AddStudentModal → POST /api/students` **và** "Giữ contract test `classId` wiring". Hai lệnh loại trừ. `pnpm test` nằm quality gate mọi wave.
- **Failure scenario:** Đổi modal sang repo → test 2 (`add-student-enroll.contract.test.ts:69-73`) đỏ, gate wave 1 fail. Giữ dispatch giả để test xanh → enroll class detail không persist (Finding 1 lan sang wave 1). Dispatch + POST → 2 HV hoặc id lệch sau reload. Wave 3 "Contract test wiring giữ" lặp cùng bẫy.
- **Evidence:**
  - Test: `add-student-enroll.contract.test.ts:34-56` bắt `type: "add-student"`; `:69-73` classId trong payload; `:75-80` list không truyền prop.
  - Live modal: `add-student-modal.tsx:38-48` đúng shape test đang khóa.
  - Plan: `phase-02-wave-1-students-peel.md:41-43`, `:56`. `phase-04-wave-3-classes-peel.md:46`. Scout đã cảnh: "Đừng đổi class-detail/`AddStudentModal` wiring nếu không cập nhật test" (`plans/reports/scout-2026-08-18-persist-class-centric-kernel.md:191`).
- **Suggested fix:** Tách test: (a) JSX `classId={cls.id}` trên class detail — giữ; (b) payload dispatch — thay bằng assert repo/API body có `classId` khi prop có. Ghi vào phase 2, đừng "giữ nguyên".

---

## Finding 7: AC isolation/bootstrap không có chỗ chạy — CI không D1, server không test

- **Severity:** High
- **Location:** Phase 1 Implementation step 7 + Todo "Isolation test"; `plan.md` Success "Org A không đọc class org B"; mọi wave "Quality gate"
- **Flaw:** Gate = `pnpm test && pnpm check-types && pnpm run check`. `pnpm test` = turbo web vitest + ci-workflow. `apps/server` không script `test`. CI không bind D1/secret. `drizzle.config.ts` `d1-http` **không** `dbCredentials` — `db:migrate:deploy` không chạy as-is. Plan bảo test 2 org isolation nhưng không miniflare/worker test/helper insert.
- **Failure scenario:** Isolation thành vitest mock Hono (không chứng minh `WHERE orgId`). Hoặc skip, AC tick tay. Một route quên filter → leak cross-org **qua CI**. Migrate không apply lúc `alchemy dev` (README chỉ claim deploy, plan tự flag) → table missing, kernel 500; không có test bắt. Rollback migrate: không down path.
- **Evidence:**
  - `apps/server/package.json:5-8` — `build`/`check-types`/`compile`, 0 `test`.
  - `.github/workflows/ci.yml:19-34` — `VITE_SERVER_URL` dummy, 0 D1.
  - `packages/db/drizzle.config.ts:8-14` — dialect+driver, 0 credentials. Researcher: `db:migrate:deploy` chưa chạy được (`researcher-2026-08-18-backend-d1-auth.md:144-149`).
  - `packages/db/package.json:12-15` — không `check-types` (plan bảo thêm; chưa nói test schema).
  - Plan: `phase-01-start.md:99,107`; `plan.md:89`.
- **Suggested fix:** Wave 0 thêm worker/miniflare (hoặc D1 local) test: bootstrap teacher, 2 user / 2 org, GET class B = 403/empty. Gắn `apps/server` `test` vào turbo. Verify `alchemy dev` apply migrate **trước** merge wave 0; nếu không, lệnh apply tường minh + fail CI khi journal ≠ D1. Viết down migration.

---

## Finding 8: `repos/kernel` fetch không chỉ origin — `/api/kernel` đánh nhầm :8001

- **Severity:** High
- **Location:** `plan.md` Execution "Fetch web: `credentials: 'include'`"; Phase 1 `repos/kernel.ts`
- **Flaw:** Web :8001, API :8000. Vite **không** proxy `/api`. Auth đã đi `VITE_SERVER_URL` (`auth-client.ts:39-42`). Plan chỉ nói cookie include, không nói URL tuyệt đối, không reuse `getServerUrl`. Cookie `sameSite: "none"` + `secure: true` — chỉ gửi khi cross-origin fetch đúng host API.
- **Failure scenario:** `fetch("/api/kernel", { credentials: "include" })` → Website/Vite :8001 → SPA/404, không bootstrap, không session server. Provider fail-empty (wave 8 mới cấm fallback seed) → 13 màn trống, user tưởng org trống đúng lock A. Hoặc fetch đúng host nhưng thiếu credentials → `getSession` null → 401; plan "membership thiếu = 403" — client không phân biệt chưa login vs chưa org.
- **Evidence:**
  - `vite.config.ts:7-10` port 8001, 0 `server.proxy`.
  - `apps/server/src/index.ts:10-18` CORS `origin: env.CORS_ORIGIN`, methods GET/POST/OPTIONS.
  - `packages/auth/src/index.ts:36-39` cookie none/secure/httpOnly.
  - `auth-client.ts:4-42` là helper URL duy nhất; 0 consumer khác.
  - README: web 8001, API 8000 (`README.md:48-49`).
- **Suggested fix:** `repos/*` bắt buộc `getServerUrl(env.VITE_SERVER_URL)` + `credentials: 'include'`. Wave 0 ghi. 401 → redirect login (đã có `_auth/route.tsx:7-13` cho page, **không** cho fetch). CORS: nếu gửi `X-Org-Id`, thêm `allowHeaders` (plan có "nếu cần" — bắt buộc nếu header thật sự dùng).

---

## Finding 9: Wave 6∥7 đụng `grade-modal` + persist notif/report không writer

- **Severity:** Medium
- **Location:** Phase 7–8; DAG `plan.md:59`; Phase 8 Architecture
- **Flaw:** DAG cho 6∥7 sau wave 3 nếu khác người, chỉ cấm song song `data-provider.tsx`. Cả hai sửa `grade-modal.tsx` (6: POST grade; 7: POST comment_bank nếu feedback ≠ ""). Merge mất một write. `notif` + `report`: chỉ GET. 0 POST. Org mới = list rỗng mãi. Wave 8 xóa seed → chuông/báo cáo chết vĩnh. Lock user "wave 7 phải persist" thành bảng chết. Implementer dễ seed notif lúc bootstrap → phá lock org trống.
- **Failure scenario:** Parallel PR: grade persist lên, append comment bank mất (hoặc ngược). Sau wave 8, `topbar` chuông luôn empty (`topbar.tsx:112` `data.notifs`); `reports.tsx` list rỗng; create-report vẫn `onClose()` (`create-report-modal.tsx:33-36`). Ai đó "sửa" bằng insert notif lúc bootstrap → user mới thấy data giả, isolation test giả xanh.
- **Evidence:**
  - `grade-modal.tsx:22,42,97-103` — feedback local, chỉ dispatch scores.
  - `phase-07-wave-6-assignments-persist.md:21,40` modify grade-modal.
  - `phase-08-wave-7-reports-notifs-comment-bank.md:44,51` modify grade-modal; `:37` GET only; `:61` notif không mark-read; không create notif/report.
  - `plan.md:59` `3 → {6,7}`.
- **Suggested fix:** Serial 6 rồi 7, hoặc 7 không đụng grade-modal — emit event/repo từ chỗ 6 đã gọi. Wave 7 ghi rõ: notif/report = read-model rỗng cho đến plan writer; **cấm** bootstrap seed. Ownership file: `grade-modal.tsx` = wave 7 only sau khi 6 merge.

---

## Edge cases scout (không đủ tách finding)

- Check-in `l9` cancelled vẫn complete (`data-store-reducer.test.ts:71-78`). Dashboard hiện "Điểm danh" mọi status ≠ completed (`dashboard.tsx:66-78`). Wave 4 persist = ghi đè cancelled → completed trên D1. Plan không chọn giữ hole hay chặn.
- `student.pkg.total===0` sau "HV không lớp" (`phase-01:77`): `done/total*100` = NaN (`students/$studentId.tsx:160`, `tuition.tsx:91`). Progress width `NaN%`.
- Characterization = **23** test (`data-store-reducer.test.ts`), không phải 26 (`phase-01:75`). 26 = 23 + 3 contract. Đếm sai → sót test lúc "giữ xanh".
- Wave 8 grep `seedData` trên `apps/web/src` trừ test: `mock-data.ts:186` vẫn export `seedData` nếu fixture import từ đó → gate tự đỏ. Phải chuyển fixture ra `*.test.ts` / `__fixtures__`.
- `packages/auth` import `schema/auth` (`packages/auth/src/index.ts:2`); `createDb` import barrel (`packages/db/src/index.ts:4-7`). Wave 0 thêm table vào barrel OK; đừng re-export domain vào `schema/auth` — Better-Auth adapter chỉ auth tables.

## Recommended actions (trước cook)

1. Viết interceptor/repo write + error + id server (F1) và loading ≠ notFound (F2).
2. `lesson.enrollmentId` (hoặc attendee) trước wave 4 (F3).
3. Bootstrap `D1.batch` + cleanup org mồ côi (F4).
4. `class.syllabusId` nullable (F5).
5. Rewrite contract enroll test (F6).
6. Server/D1 isolation test + verify migrate apply (F7).
7. Kernel fetch qua `VITE_SERVER_URL` (F8).
8. Serial wave 6→7 trên `grade-modal`; notif/report không seed (F9).

## Unresolved

- `alchemy dev` có apply `migrationsDir` không? Plan flag, researcher chưa verify live.
- Cookie `sameSite=none` + `secure` trên Safari localhost có gửi không — ngoài scope đọc source.
- User có chấp nhận lịch/assignment/report trống từ wave 0 đến khi có writer không (lock org trống vs AC "13 màn hành vi giữ")?

Status: DONE
Summary: 9 findings (2 Critical, 6 High, 1 Medium). Wave 0 AC persist/reload không đi được với "không sửa route" + notFound sync; wave 4 remaining gãy nếu lesson không gắn enrollment.
Concerns/Blockers: Không cook wave 0 cho đến khi F1+F2+F5+F8 được ghi vào phase-01 (write path, loading, syllabusId null, fetch URL).
