# Red-team: Assumption Destroyer

Plan: `plans/260818-1101-persist-class-centric-domain-kernel/`
Date: 2026-08-18
Role: Scope Auditor — instantiation sites, lifetime, shared-state leaks.
Không khen. Không cắt lock user (org trống, wave 7 persist, role teacher, package-on-enrollment, no stub fills).

Grep-verified 2026-08-18. Claim plan sai hoặc thiếu path lỗi thì ghi ở đây.

---

## Finding 1: Wave 0 cấm sửa 13 route nhưng 4 detail `throw notFound()` trước khi kernel fetch xong

- **Severity:** Critical
- **Location:** Phase 1, section "Overview" / "Related Code Files" / "Success Criteria"
- **Flaw:** Plan giả định UI đọc `useData()` sau khi adapter có snapshot. `DataProvider` hôm nay sync (`useReducer(reducer, seedData)`). Wave 0 đổi sang fetch `/api/kernel` async, **không** được sửa 13 route. Bốn detail route throw `notFound()` ngay frame đầu nếu lookup miss. Plan không bắt provider block children đến khi snapshot settle.
- **Failure scenario:** Tạo syllabus → modal `onCreated` đẩy `/syllabus/$id` → hard refresh (đúng gate "reload còn"). Provider render `students/classes/syllabi = []` → `syllabusById` undefined → `throw notFound()`. User thấy "Không tìm thấy syllabus" dù row đã nằm D1. Cùng lỗ với `/students/$id`, `/classes/$id`. Gate wave 0 fail trên happy path.
- **Evidence:**
  - Plan: "13 route files không đổi. UI vẫn đọc `useData()` shape `MockData`."
  - Plan: "Do not modify: 13 route files, stub modals, settings"
  - Plan success: "Tạo HV+lớp+enroll+syllabus+assign → hard refresh còn"
  - Provider sync hôm nay: `apps/web/src/lib/data-store.tsx:37-38`
  - `throw notFound()`: `students/$studentId.tsx:64-69`, `classes/$classId.tsx:43-51`, `syllabus/$syllabusId.tsx:78`, `assignments/$assignmentId.tsx:34-39`
  - Navigate ngay sau tạo: `add-syllabus-modal.tsx:30-46` + `syllabus/index.tsx:110-112`
- **Suggested fix:** `DataProvider` không mount `<Outlet/>` (hoặc không expose store) cho đến khi GET `/api/kernel` settle / error. Loading/error UI ở provider, không đụng 13 route. Ghi rõ: empty snapshot sau load xong ≠ loading.

---

## Finding 2: Kernel write vẫn `dispatch` sync — không interceptor, client id chết sau persist

- **Severity:** Critical
- **Location:** Phase 1, section "Architecture" #4–5 + "Implementation Steps" #5
- **Flaw:** Wave 0 không sửa modal kernel (`add-student`, `add-class`, `add-syllabus`, assign, module/lesson, notes). Mọi write vẫn `dispatch({ type })`. `DataStore.dispatch` là `Dispatch<Action>` sync (`data-store.tsx:25`). Plan chỉ viết "Kernel writes qua API" — không spec ai bắt action, chờ POST, map id server. `add-syllabus` tự sinh `sy-${uuid}` rồi `onCreated(id)`.
- **Failure scenario:** (A) Provider không wrap dispatch → POST không chạy → hard refresh mất HV/lớp/syllabus. Gate fail. (B) Wrap fire-and-forget: reducer `uid("s")` / modal `sy-…` khác id D1 → navigate `/syllabus/sy-dead` → Finding 1. (C) Wrap + refetch chậm: edit module vừa tạo dùng client id → POST 404. Không có error path (API fail, timeout, 403).
- **Evidence:**
  - Plan: "Kernel writes qua API. Lesson/invoice/assignment/report/notif giữ reducer."
  - Plan: "Do not modify: 13 route files, stub modals, settings" — 5 modal kernel **không** nằm modify list
  - Type sync: `data-store.tsx:23-26,43`
  - Modal vẫn dispatch: `add-student-modal.tsx:38-48`, `add-class-modal.tsx:31-43`, `add-syllabus-modal.tsx:30-46`
  - Client id + navigate: `add-syllabus-modal.tsx:30,46` + `syllabus/index.tsx:110-112`
  - Server id reducer: `data-store-reducer.ts:11-13` (`uid`)
  - 0 `getSession` / domain route trên server: `apps/server/src/index.ts:20-24`
- **Suggested fix:** Spec command bus trong `data-provider.tsx`: kernel action → POST → replace local bằng response id → rồi mới `onCreated`/refetch. Wave 0 **được** sửa `add-syllabus-modal` (không phải stub) để id đến từ API. API fail → không optimistic row, surface error. Đừng giả `Dispatch` sync tự persist.

---

## Finding 3: Wave 1 bóc modal POST trong lúc class detail + contract test vẫn sống trên `dispatch` / `useData`

- **Severity:** Critical
- **Location:** Phase 2, section "Architecture" / "Implementation Steps" / "Success Criteria"
- **Flaw:** Một instantiation site (`AddStudentModal`) phục vụ 2 owner. Wave 1 đổi modal → POST `/api/students`. Wave 3 mới tháo class route. Class roster đọc `cls.studentIds` + `studentById` từ `useData()`, không phải repo students. Contract test **parse source** đòi `type: "add-student"` + `payload.classId` — không phải hành vi runtime.
- **Failure scenario:** (1) Modal chỉ POST, không `dispatch`: D1 có enrollment, class detail roster cũ đến khi refetch kernel — user tưởng enroll fail. (2) POST **và** `dispatch`: 2 student id (server vs `uid("s")`), unique `(classId, studentId)` có thể 409, hoặc roster hiện ghost id. (3) Xóa dispatch để "peel": `payloadObject()` throw `"missing add-student dispatch"` → `pnpm test` đỏ, trái "Contract enroll xanh".
- **Evidence:**
  - Plan wave 1: "AddStudentModal → POST `/api/students` (+ `classId` enroll nếu prop có)."
  - Plan wave 1: "Giữ contract test `classId` wiring." / "`useData()` vẫn cung cấp lookup cho màn khác."
  - Plan wave 3: "wave 3 mới tháo class route"
  - Modal dispatch: `add-student-modal.tsx:38-48`
  - Class detail đọc store: `classes/$classId.tsx:43,54-56,241-246`
  - Contract khóa dispatch: `add-student-enroll.contract.test.ts:34-37,69-73` (`type: "add-student"` + `payload.classId`)
  - Class JSX lock: `add-student-enroll.contract.test.ts:59-66`
- **Suggested fix:** Wave 1 **không** đổi write path modal — chỉ list/detail students đọc repo. Hoặc gộp wave 1+3 một PR: modal POST + class route refetch/repo + rewrite contract test sang POST body/`classId=` prop (không parse `type: "add-student"`). Cấm dual-write.

---

## Finding 4: Bootstrap sống trên "kernel request" — chết khi wave 8 bỏ snapshot

- **Severity:** High
- **Location:** Phase 1 "Architecture" #2; `plan.md` Execution notes; Phase 9
- **Flaw:** Org + membership `teacher` chỉ INSERT khi "kernel request đầu sau `getSession`". Wave 1+ đã có GET `/api/students` độc lập. Wave 8 xóa reducer/seed, `useData()` thành facade repos — không hứa còn gọi `GET /api/kernel`. Phase 9 không mention bootstrap middleware. `unique(membership.userId)` chỉ cứu race, không cứu request không bao giờ bootstrap.
- **Failure scenario:** User mới login lần đầu sau wave 8, landing `/students` → GET `/api/students` không chạy bootstrap → 0 membership → 403. Success plan-level "Login user mới: … 1 membership `role=teacher`" fail. Cùng lỗ nếu wave 1 provider ngừng prefetch kernel.
- **Evidence:**
  - Plan: "Bootstrap trên kernel request sau `createAuth().api.getSession({ headers })`."
  - Phase 1 API list có `GET /api/students` cạnh `GET /api/kernel`
  - Phase 2: "`repos/students.ts` wrap GET/POST `/api/students`"
  - Phase 9: "Provider chỉ fetch." / "Grep `seedData` / `useReducer(reducer`" — 0 chữ bootstrap / `/api/kernel` / `/api/me`
  - Server hôm nay không đọc session: `apps/server/src/index.ts:20`; researcher `plans/reports/researcher-2026-08-18-backend-d1-auth.md:117-131`
  - Client session chỉ `_auth/route.tsx:8-14` — không tạo org
- **Suggested fix:** Middleware `getSession` + bootstrap idempotent trên **mọi** `/api/*` trừ `/api/auth/*` (hoặc `GET /api/me` bắt buộc trước repo). Wave 8 không được xóa path đó. Test: user mới hit `/api/students` trước `/api/kernel` vẫn có membership `teacher`.

---

## Finding 5: DAG `3 → {6,7}` cho phép song song trên cùng `grade-modal.tsx` — conflict list sót

- **Severity:** High
- **Location:** `plan.md` Phases DAG; Phase 7 "Overview"; Phase 8 "Architecture"
- **Flaw:** Plan cấm song song chỉ trên `schema/index.ts`, `server/src/index.ts`, `data-store-reducer.ts`. Wave 6 đổi `grade-modal` dispatch → POST grade. Wave 7 thêm POST `comment_bank` trên **cùng submit**. Hai wave cùng owner file. Wave 6 còn ghi "song song 4/5/7" — không tự liệt mình.
- **Failure scenario:** 2 agent: wave 6 xóa `dispatch`, wave 7 patch `setFeedback`/`submit`. Merge mất một trong hai write, hoặc double-submit không await. Gate wave 7 "Append comment bank" hoặc wave 6 "Reload giữ scores" đỏ. Shared mutable: `feedback` state local, discard sau submit (`setFeedback("")`).
- **Evidence:**
  - DAG: "`3 → {6,7}`"; "1+2+3 **không** block lẫn nhau"; cấm song song chỉ 3 barrel (`plan.md` Phases)
  - Phase 7: "Modify: `assignments/*`, `grade-modal.tsx`"
  - Phase 8: "Modify: `reports.tsx`, `notif-panel` data source, `grade-modal.tsx` (append nếu có text)"
  - Submit hiện tại: `grade-modal.tsx:27-45` — chỉ `dispatch({ type: "grade-assignment" })`; `feedback` `grade-modal.tsx:22,97-103` không vào store
  - Advise ownership cũng gán cả hai wave vào grade modal (`advise-2026-08-17-feature-rollup-roadmap.md:136-137`)
- **Suggested fix:** Serial 6 rồi 7 trên `grade-modal.tsx`. Hoặc wave 6 để sẵn hook `onGraded({ scores, feedback })` — wave 7 chỉ gắn POST. Thêm file này vào conflict list cạnh 3 barrel.

---

## Finding 6: Wave 7 persist 3 list nhưng không đụng đúng read site

- **Severity:** High
- **Location:** Phase 8, "Related Code Files" / "Implementation Steps"
- **Flaw:** Comment bank UI thật = `data.commentBank.map` trên assignment detail. Notif UI thật = Topbar truyền `data.notifs` vào `NotifPanel`. Wave 7 modify `reports.tsx`, `notif-panel`, `grade-modal` — **không** `assignments/$assignmentId.tsx`, **không** `topbar.tsx`. Wave 0 đã set `commentBank`/`notifs` = `[]` trong store. POST không cập nhật đúng consumer thì list vẫn trống sau "persist".
- **Failure scenario:** Grade + feedback non-empty → POST `/api/comment-bank` 200. Reload assignment detail vẫn `data.commentBank = []` (store/kernel snapshot không merge list mới). Notif panel: `NotifPanel` đổi fetch nội bộ nhưng Topbar vẫn pass `data.notifs` (`[]`) → empty. Gate "Reload giữ report/notif/commentBank đã có" fail trên UI, test GET raw thì xanh.
- **Evidence:**
  - Read comment bank: `assignments/$assignmentId.tsx:132-144` (`data.commentBank`, key `c.text`)
  - Read notif: `topbar.tsx:14,112` — `<NotifPanel notifs={data.notifs} />`
  - Panel chỉ render prop: `notif-panel.tsx:9,15`
  - Phase 8 modify list không có 2 file trên
  - Type comment bank **không id**: `mock-data.ts:94-97` — schema wave 7 thêm `id`; key UI vẫn `c.text`
  - Phase 1 runtime: `commentBank`/`notifs` = `[]`
- **Suggested fix:** Wave 7 **phải** sửa `$assignmentId.tsx` + `topbar.tsx` (hoặc `NotifPanel` tự fetch và bỏ prop). Adapter/kernel snapshot phải merge 3 GET vào `MockData` đến khi wave 8. Đừng tin `reports.tsx` là consumer comment bank.

---

## Finding 7: Wave 4 `lesson.classId` bỏ `sid` — 4 consumer vẫn `l.sid`; class detail ngoài scope

- **Severity:** High
- **Location:** Phase 5 Architecture / Related Code Files / Risk
- **Flaw:** Mock lesson là **per-student** (`Lesson.sid`). Class 1:2 `c1` = `studentIds: ["s1","s4"]` với lesson riêng từng HV. Wave 4 schema: `classId NOT NULL`, "enrollment/student via class roster" — **không cột `sid`/`enrollmentId`**. Wave 4 sửa schedule, lesson-modal, dashboard; **không** `classes/$classId.tsx`, **không** `students/$studentId.tsx`. Risk chỉ nói "trừ sai HV", không nói tab lịch lớp filter miss.
- **Failure scenario:** Helper insert 1 lesson/`classId=c1`. Class tab "Lịch học" filter `cls.studentIds.includes(l.sid)` → `sid` undefined → `[]`. Student detail `data.lessons.filter(l => l.sid === studentId)` trống. Dashboard `studentById(l.sid)` return null → card không render dù "hôm nay" filter qua. 1:2: một `completed` trừ remaining **cả hai** enrollment (cùng count theo classId) — trái lock package-on-enrollment (remaining khác nhau).
- **Evidence:**
  - Type: `mock-data.ts:33-36` (`sid`)
  - `c1` 1:2: `mock-data.ts:633-640`
  - Lesson per HV: `l3` `sid:"s1"` vs `l5` `sid:"s4"` (`mock-data.ts:329,351`)
  - Class filter: `classes/$classId.tsx:57-58,177-178`
  - Student filter: `students/$studentId.tsx:72`
  - Dashboard: `dashboard.tsx:51` (`studentById(l.sid)`), check-in `73-74`
  - Lesson modal: `lesson-modal.tsx:15-16`
  - Phase 5 "Do not modify: `tuition.tsx`, `assignments/*`" — im lặng 2 detail trên
  - Reducer check-in theo `lesson.sid`: `data-store-reducer.ts:130-135`
- **Suggested fix:** Cột `enrollmentId` (hoặc 1 lesson row / HV) — không "via roster". Adapter **phải** điền `Lesson.sid` cho 4 consumer, hoặc wave 4 được sửa `$classId` + `$studentId` + dashboard. Test 1:2: check-in s1 không đổi remaining s4.

---

## Finding 8: Fallback "thêm lệnh apply migrate" là dead path; isolation test không vào CI

- **Severity:** High
- **Location:** Phase 1 Risk + Implementation #1 + Todo "Isolation test"; `plan.md` Execution notes / Success
- **Flaw:** Plan biết `alchemy dev` có thể không apply, response = "thêm lệnh apply". Lệnh sẵn `db:migrate:deploy` = `drizzle-kit migrate` với `driver: "d1-http"` **không** `dbCredentials`. Root không `db:migrate`. README chỉ claim apply lúc `deploy`. `apps/server` không có script `test`. CI = biome + `pnpm test` (web vitest + ci-workflow) + check-types + build — 0 D1. Isolation 2 org không chạy trừ khi viết test web giả.
- **Failure scenario:** `pnpm run dev` → table missing (risk tự ghi). Implementer chạy `db:migrate:deploy` → drizzle-kit đòi accountId/databaseId/token → fail. Wave 0 "reload còn trên D1" không verify được. Isolation test nằm `apps/server/src/**/*.test.ts` → turbo bỏ qua (không script) → CI xanh, org B đọc được class org A lúc runtime.
- **Evidence:**
  - Plan: "Verify `alchemy dev` apply `migrationsDir` (`alchemy.run.ts:11-13`). Nếu không apply: thêm lệnh apply"
  - Binding: `packages/infra/alchemy.run.ts:11-13`
  - README apply chỉ deploy: `README.md:34`
  - Config không creds: `packages/db/drizzle.config.ts:8-14`
  - Script mồ côi: `packages/db/package.json:14` (`db:migrate:deploy`); root `package.json:15` chỉ `db:generate`
  - Server 0 test: `apps/server/package.json:5-8`
  - CI: `.github/workflows/ci.yml:31-34` — không D1/secret
  - `packages/db` 0 `check-types` hôm nay: `packages/db/package.json:12-15` (plan có thêm — chưa đủ nếu test không chạy)
- **Suggested fix:** Wave 0 step 1 = chạy thật `alchemy dev` + query `sqlite_master`. Nếu không apply: dùng path Alchemy/Wrangler **đã** bind, không `drizzle-kit migrate` mù. Thêm `apps/server` `test` script + turbo; isolation test phải hit handler (miniflare/worker) hoặc bị đánh dấu BLOCKED, không đếm "gate xanh".

---

## Finding 9: `X-Org-Id` tự mâu thuẫn — CORS preflight gãy nếu ai implement phase-01 chữ

- **Severity:** Medium
- **Location:** `plan.md` Execution notes vs Phase 1 Architecture #3 / Related / Security
- **Flaw:** `plan.md`: "Không `X-Org-Id` v1." Phase 1: parse header, "bỏ qua nếu user chỉ 1 org", "allowHeader `X-Org-Id` nếu cần", "Không trust `X-Org-Id` nếu user không thuộc org đó." CORS hiện `allowHeaders: ["Content-Type", "Authorization"]` — không có `X-Org-Id`. `unique(membership.userId)` = đúng 1 org/user → header vô dụng v1.
- **Failure scenario:** Implementer theo phase-01, client gửi `X-Org-Id`. Browser preflight OPTIONS fail (header không allow) → mọi POST kernel chết, auth cookie path vẫn sống. Hoặc nới CORS + parse header nhưng v1 bỏ qua → dead surface, lệch `plan.md`.
- **Evidence:**
  - `plan.md`: "Không `X-Org-Id` v1."
  - Phase 1: "Org implicit. `X-Org-Id` parse được nhưng v1 bỏ qua nếu user chỉ 1 org."
  - Phase 1: "mount + allowHeader `X-Org-Id` nếu cần"
  - Live CORS: `apps/server/src/index.ts:12-16`
- **Suggested fix:** Một nguồn: v1 **cấm** client gửi `X-Org-Id`. Org = membership duy nhất sau bootstrap. Xóa "parse/allowHeader" khỏi phase-01. Multi-org = plan khác.

---

## Scout / fact-check (không thành finding riêng nếu đã gộp)

| Claim plan | Live | Kết luận |
|---|---|---|
| 26 import `@/lib/data-store` | 26 hit | Đúng tổng; **sai breakdown** "13 route" — `settings.tsx` không import; 12 route + 11 modal + lesson-modal + topbar + app-shell |
| Characterization 26 test import `seedData` | `data-store-reducer.test.ts` 23 case import seed; contract 3 case **không** import seed | Sai. Đừng coi contract test là fixture seed |
| CORS `index.ts:14` GET\|POST\|OPTIONS | `allowMethods` dòng 14 | Đúng |
| `alchemy.run.ts:11-13` migrationsDir | khớp | Đúng |
| Banner `topbar.tsx:66` | dòng 66 | Đúng |
| check-in reducer `:122-136` | khớp | Đúng |
| mark-paid `:146-154` | khớp | Đúng |
| create-report `:33-37` / add-invoice `:20-24` / grade `:42` | khớp | Đúng |
| comment bank `$assignmentId.tsx:132` | khớp | Đúng — và **không** nằm wave 7 modify |
| D1 4 bảng auth | `schema/index.ts:1` + `auth.ts` 4 table | Đúng |
| `bts.jsonc` `api: none` | dòng 25 | Đúng |
| `packages/api` chưa có | `packages/` không có `api` | Đúng |
| `getSession` server | 0 hit trừ plan | Đúng |

---

## Unresolved

- `alchemy dev` apply migrate lúc này — report này không chạy live (cùng caveat researcher). Finding 8 coi fallback là vỡ dù apply-dev có thể may.
- Better-Auth cookie `sameSite: none` + `secure: true` (`packages/auth/src/index.ts:36-39`) trên HTTP localhost:8001→8000 — login hiện đã phụ thuộc; kernel `credentials: 'include'` không tệ hơn, không đỡ hơn.

---

Status: DONE
Summary: 9 finding (3 Critical). Wave 0 gãy trên lifetime: detail `notFound` trước fetch, dispatch sync không persist/id lệch. Wave 1 dual-store với class detail + contract parser. Bootstrap/read-site/sid/grade-modal/migrate-CI là assumption chịu tải còn lại.
Concerns/Blockers: Sửa plan trước cook — đặc biệt Finding 1–3. Không cắt lock user.
