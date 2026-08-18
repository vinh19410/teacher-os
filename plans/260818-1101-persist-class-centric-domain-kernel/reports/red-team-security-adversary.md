---
type: reviewer
role: fact-checker + security-adversary
date: 2026-08-18
plan: 260818-1101-persist-class-centric-domain-kernel
---

# Red-team — Security Adversary / Fact Checker

Plan review, không phải code review. Mọi finding gắn citation codebase. Không khen.

Đây là plan persist domain lên D1 lần đầu. Trust boundary chuyển từ reducer client (zero-authz đã lock) sang cookie session + org-scoped SQL. Plan không thiết kế boundary đó — chỉ viết "filter orgId".

## Finding 1: POST mutation + cookie `SameSite=None` + Hono CORS fail-open = CSRF không có trong plan
- **Severity:** Critical
- **Location:** Plan Execution notes; Phase 1 Architecture §3 + Related Files (CORS / `credentials: 'include'`)
- **Flaw:** Plan thêm hàng loạt POST đổi tiền/điểm danh/PII (`/api/students`, `/enrollments`, `/check-in`, `/mark-paid`, `/grade`, `/comment-bank`) trên cookie session. Cookie auth **đã** `sameSite: "none"`. Hono `cors()` **không chặn** request origin lạ — chỉ bỏ header ACAO rồi `await next()`. Plan không yêu cầu check `Origin`/`Referer`, CSRF token, hay từ chối `Content-Type` khác JSON. Better-Auth CSRF chỉ sống trên `/api/auth/*`.
- **Failure scenario:** GV đang login. Trang attacker gửi form POST `application/x-www-form-urlencoded` tới `https://<worker>/api/invoices/<id>/mark-paid` hoặc `/api/lessons/<id>/check-in` hoặc `/api/students`. Browser gửi cookie (SameSite=None + Secure). CORS middleware origin ≠ `CORS_ORIGIN` → không set ACAO, **vẫn gọi handler**. Nếu implementer parse body bằng `parseBody()` / form (plan không cấm) → hóa đơn bị đánh dấu thu, buổi bị điểm danh, HV/PII bị ghi. JSON-only + preflight chặn một phần; plan không khóa JSON-only nên lỗ phụ thuộc implementer.
- **Evidence:**
  - Plan: *"Mutation = POST action. Giữ CORS `GET|POST|OPTIONS` (`apps/server/src/index.ts:14`). … Fetch web: `credentials: 'include'`."*
  - Phase 1: *"Fetch client `credentials: 'include'`."* — không nhắc CSRF/Origin.
  - `packages/auth/src/index.ts:36-39` — `sameSite: "none"`, `secure: true`, `httpOnly: true`
  - `apps/server/src/index.ts:10-20` — CORS `credentials: true`; chỉ mount `/api/auth/*`; không origin-deny
  - `apps/server/node_modules/hono/dist/middleware/cors/index.js:39-79` — origin lạ: không set ACAO; method ≠ OPTIONS thì `await next()` luôn
  - `apps/web/src/lib/auth-client.ts:39-42` — web origin ≠ server origin (`VITE_SERVER_URL`); đây là lý do SameSite=None
- **Suggested fix:** Mọi kernel POST: reject nếu `Origin` ≠ `CORS_ORIGIN` (fail closed, không chỉ CORS header). Chỉ nhận `application/json`. Không parse form. Ghi rõ Better-Auth CSRF **không** cover `/api/*`. Cân nhắc `sameSite: "lax"` khi web/server cùng site; giữ None thì Origin check là bắt buộc.

## Finding 2: `classId` / nested `:id` không bind parent+org — IDOR hai chiều, plan chỉ cover một chiều
- **Severity:** Critical
- **Location:** Phase 1 API list + step 4; Phase 2 Security; Phase 3 Security; Phase 4 Security
- **Flaw:** Wave 0 mount `POST /api/students` (body có `classId` từ modal), `POST /api/classes/:id/enrollments`, `POST /api/classes/:id/assign-syllabus`, `POST /api/syllabi/:id/modules/:mid/lessons/:lid` **mà không spec** "load resource, so sánh `orgId` với session, và `:mid` thuộc `:id`". Wave 3 chỉ viết "Enroll student khác org → 403" (HV nạn nhân → lớp mình). Không viết chiều ngược: `classId` nạn nhân trên POST student của mình. Wave 3 Security: "Nested module/lesson không vượt syllabus khác org" — check org của **syllabus `:id`**, không check `module.syllabusId === :id`. D1 không có RLS (`createDb` = drizzle thuần).
- **Failure scenario:**
  1. Attacker (org A, đã login) `POST /api/students` `{ name, phone, classId: "<class-uuid org B>" }`. Handler lấy `orgId` từ membership A, INSERT student A, INSERT enrollment vào lớp B. Roster GV B hiện HV + SĐT attacker kiểm soát.
  2. `POST /api/syllabi/{syllabus-của-A}/modules/{module-uuid-của-B}` — check syllabus A thuộc A (pass), `UPDATE syllabus_module WHERE id = :mid` không join parent → sửa giáo trình org B.
  3. `POST /api/classes/:id/assign-syllabus` với `syllabusId` org B → class A đọc nội dung giáo trình B qua join.
- **Evidence:**
  - Phase 1 API: `POST /api/students`, `POST /api/classes/:id/enrollments`, `POST /api/syllabi/:id/modules/:mid`, `POST /api/syllabi/:id/modules/:mid/lessons/:lid` — không payload, không parent-bind
  - Phase 1: *"add-student + `classId`: person + enrollment + session_package."* / *"Authorize membership. Filter `orgId`."* — generic, không `requireOrgResource`
  - Phase 2: `AddStudentModal → POST /api/students (+ classId enroll nếu prop có)`
  - Phase 4 Security: *"Enroll student khác org → 403"* — một chiều
  - Phase 3 Security: *"Nested module/lesson không vượt syllabus khác org."* — không bind parent
  - `apps/web/src/components/modals/add-student-modal.tsx:12-17,38-48` — `classId` từ prop, nhét thẳng payload; không chứng minh class thuộc user
  - `apps/web/src/routes/_auth/classes/$classId.tsx:245` — `classId={cls.id}` client-controlled sau peel
  - `packages/db/src/index.ts:6-8` — `drizzle(env.DB, { schema })`, không helper tenant
  - Grep `orgId` trong `apps/` + `packages/` (ngoài plans) = 0. Mọi check là implementer tự bịa.
- **Suggested fix:** Một helper bắt buộc `loadOwned(table, id, orgId)` — 404 nếu sai org (không 403 oracle). Enroll: `class.orgId === student.orgId === sessionOrg`. Nested write: `module.syllabusId === :id` **và** syllabus.orgId. Zod `classId` optional + test IDOR cả hai chiều trước khi merge wave 0.

## Finding 3: `X-Org-Id` tự mâu thuẫn — plan.md cấm, Phase 1 parse + nới CORS; isolation test không có harness
- **Severity:** High
- **Location:** Plan Execution notes vs Phase 1 Architecture §3 + Related Files + Security; Plan Success Criteria "Org A không đọc class org B"
- **Flaw:** `plan.md` khóa *"Không `X-Org-Id` v1"*. Phase 1 bảo parse header, "v1 bỏ qua nếu user chỉ 1 org", và `allowHeader X-Org-Id nếu cần`. `unique(membership.userId)` khiến user **luôn** 1 org — header hoặc vô dụng hoặc thành source of truth giả. Isolation 2 org là AC bảo mật duy nhất, nhưng `createDb()` đọc `env.DB` từ `cloudflare:workers`; `apps/server` **không** có script `test`; vitest chỉ ở `apps/web`. Plan không nêu miniflare / `@cloudflare/vitest-pool-workers` / 2 user fixture.
- **Failure scenario:** Implementer làm theo Phase 1 (file thi công), thêm `X-Org-Id` vào CORS, `orgId = header ?? membershipOrg`. Attacker đoán/leak UUID org B, gửi header. Nếu quên membership check (Phase 1 nói "bỏ qua nếu 1 org" — đọc nhầm thành bỏ qua *check*) → dump kernel org B. Isolation test: hoặc không chạy được trên CI (`pnpm test` = vitest web), hoặc giả lập bằng 1 user + header (unique userId khiến 1 user không có 2 org) → test xanh, IDOR thật.
- **Evidence:**
  - `plan.md` Execution: *"Không `X-Org-Id` v1."*
  - Phase 1: *"`X-Org-Id` parse được nhưng v1 bỏ qua nếu user chỉ 1 org."* / *"allowHeader `X-Org-Id` nếu cần"* / *"Không trust `X-Org-Id` nếu user không thuộc org đó."*
  - Phase 1 bootstrap: *"`unique(membership.userId)` + re-read nếu race."*
  - Advise lock 1 org/user: `plans/reports/advise-2026-08-17-feature-rollup-roadmap.md:174`
  - `apps/server/src/index.ts:15` — `allowHeaders: ["Content-Type", "Authorization"]` — chưa có X-Org-Id; Phase 1 chủ động nới
  - `packages/db/src/index.ts:1-8` + `packages/env/env.d.ts:12-15` — DB chỉ qua `cloudflare:workers`
  - `apps/server/package.json:5-8` — scripts: build/check-types/compile, **0 test**
  - `apps/web/package.json:13` — `"test": "vitest run"`; CI `.github/workflows/ci.yml:32` — `pnpm test` = web unit
- **Suggested fix:** Xóa mọi `X-Org-Id` khỏi Phase 1 (khớp `plan.md`). Org = membership của session, hết. Isolation test: 2 user + 2 session trên Worker test pool; assert `GET /api/kernel` user A không chứa id org B. Không chấp nhận test "header khác org".

## Finding 4: Check-in 1:2 không có `enrollmentId` — burn gói sai HV; client có thể gửi `studentId`
- **Severity:** High
- **Location:** Phase 5 Architecture + Risk; Invariant 2/6; Plan Success Criteria wave 4
- **Flaw:** `remaining = package.total - count(completed lessons of enrollment)` đòi lesson↔enrollment. Schema Phase 5 **không có** cột `enrollmentId`: *"enrollment/student via class roster"*. `POST /api/lessons/:id/check-in` không payload. Mock `Lesson` chỉ có `sid` (1 HV). Fixture `l6` `type: "1:2"` vẫn 1 `sid`. Risk thừa nhận "1:2 trừ sai HV" rồi bảo "gắn lesson↔enrollment" — **không đưa vào schema**. Implementer theo bảng sẽ hoặc trừ cả roster, hoặc nhận `studentId` từ client.
- **Failure scenario:** Lớp 1:2, 2 enrollment. Check-in không bind enrollment → trừ gói cả 2 HV (mất buổi đã trả tiền) hoặc trừ HV đầu tiên (sai người). Nếu thêm body `{ studentId }` không verify enrollment của class đó: attacker điểm danh/trừ gói HV khác lớp, khác org (nếu quên org check). `class.sessionsDone` derive từ count completed — lệch tiền vs tiến độ lớp.
- **Evidence:**
  - Phase 5 schema: *"`lesson: id, orgId, classId NOT NULL, enrollment/student via class roster, day, time…`"* — 0 `enrollmentId`
  - Phase 5: *"`POST /api/lessons/:id/check-in`, `/cancel`. Không UPDATE package."* — 0 payload
  - Phase 5 Risk: *"1:2 class check-in trừ sai HV. Response: check-in gắn lesson↔enrollment, không chỉ `sid`."* — chỉ risk, không schema
  - `apps/web/src/lib/mock-data.ts:30-43` — `LessonType` gồm `"1:2"`; `Lesson.sid: string` (một HV)
  - `apps/web/src/lib/mock-data.ts:360-369` — `l6` `type: "1:2"`, `sid: "s3"` only
  - `apps/web/src/lib/data-store-reducer.ts:122-136` — check-in map `s.id !== lesson.sid`; không roster
  - Dashboard/modal dispatch chỉ `lessonId`: `dashboard.tsx:73-74`, `lesson-modal.tsx:75`
- **Suggested fix:** Cột `lesson.enrollmentId` NOT NULL (hoặc bảng `lesson_attendee`). Check-in không nhận `studentId` client. Test: lớp 2 HV, check-in 1 buổi → đúng 1 package `remaining` giảm; HV kia không đổi. Cấm implement theo `sid` mock.

## Finding 5: Wave 1 "GET student by id 404/403" — endpoint không tồn tại trên contract Wave 0; PII phone/parent không có schema/Zod server
- **Severity:** High
- **Location:** Phase 1 API + Architecture §4; Phase 2 Security + Implementation; Phase 1 `student` table
- **Flaw:** Wave 0 API: `GET /api/students` (list) + `GET /api/kernel`. **Không** `GET /api/students/:id`. Wave 1 Security bịa endpoint đó. Detail hiện `studentById(studentId)` từ URL + render SĐT/Zalo/phụ huynh. `GET /api/kernel` (wave 0 runtime) dump **toàn bộ** MockData-shaped PII xuống browser. Bảng `student` chỉ "person, không pkg" — 0 cột. Validate SĐT chỉ ở modal client (`PHONE_RE`). Plan không Zod phone/parent trên server.
- **Failure scenario:** Implementer thêm `GET /api/students/:id` vì Security Wave 1 đòi 404/403. Query `WHERE id = ?` quên `orgId` → IDOR SĐT + tên PH + notes ("Mẹ hay hỏi chi tiết"). Hoặc giữ kernel snapshot: 1 XSS trên 13 màn = toàn bộ SĐT/PH org. `POST /api/students` nhận phone/parent tùy ý (XSS stored, payload khổng lồ) vì không có contract field.
- **Evidence:**
  - Phase 1 API list: `GET /api/students` + `POST /api/students` — hết. Không `/:id`
  - Phase 1: *"`student` (person, không pkg)"* — không cột
  - Phase 2 Security: *"GET student by id 404/403 nếu khác org. Không tin `studentId` trên URL ngoài org."*
  - Phase 2: *"`repos/students.ts` wrap GET/POST `/api/students`"* — list, không by-id
  - `apps/web/src/routes/_auth/students/$studentId.tsx:62-64,86-87,108-109` — tin URL; render `phone` / `zalo`; `window.open(https://zalo.me/${student.zalo})`
  - `apps/web/src/lib/mock-data.ts:6-12,189-207` — `phone`, `zalo`, `parent.name/phone`, `notes` PII
  - `apps/web/src/components/modals/add-student-modal.tsx:7,32-36` — `PHONE_RE` chỉ client; phone rỗng vẫn pass
  - `packages/db/src/schema/` — chỉ `auth.ts` (user/session/account/verification)
- **Suggested fix:** Chốt 1 path: list org-scoped **hoặc** `GET /api/students/:id` với `orgId` + 404. Kernel snapshot không trả `parent.phone` / notes nếu màn không cần (wave 0 adapter đang map full MockData). Zod server: name required, phone charset+max, parent optional. Test IDOR by-id trước peel.

## Finding 6: Comment bank "không PII" là sai — write path = nhận xét chấm bài HV
- **Severity:** High
- **Location:** Phase 8 Architecture + Security; Phase 8 Requirements; user lock wave 7
- **Flaw:** Write duy nhất: grade modal `feedback` trim ≠ "" → `POST /api/comment-bank`. Feedback là nhận xét HV cụ thể (local state, hiện discard). Security Phase 8: *"Comment bank không chứa PII HV nếu chỉ là template"*. Mệnh đề điều kiện sai với write path đã chốt. Bảng `orgId`-scoped. Advise muốn schema "sẵn multi-teacher"; `unique(membership.userId)` chặn join hôm nay, không chặn GV 2 ngày mai đọc bank.
- **Failure scenario:** GV chấm bài, gõ "Minh Anh yếu Task Response, mẹ hay gọi". Persist org-wide tag `"chung"`. Invite/multi-teacher sau (cột orgId đã có) → GV khác thấy nhận xét + tên HV. Không xóa/sửa. Không bind `assignmentId`/`studentId` nên không audit ai bị viết vào bank.
- **Evidence:**
  - Phase 8: *"Append comment bank từ grade modal feedback non-empty → D1."* / *"`POST /api/comment-bank` … tag mặc định … `"chung"`"*
  - Phase 8 Security: *"Comment bank không chứa PII HV nếu chỉ là template — vẫn org-scoped."*
  - `apps/web/src/components/modals/grade-modal.tsx:22,42,97-103` — `feedback` local; submit không đưa vào action; textarea "Nhận xét"
  - `apps/web/src/routes/_auth/assignments/$assignmentId.tsx:132` — `data.commentBank.map` — bank dùng chung, không filter HV
  - Advise `:174`, `:212` — 1 org/user v1 nhưng giữ orgId cho multi-teacher
  - Phase 8: *"Hiện không có reducer write cho commentBank."* — đây là write path **mới**, không phải lift stub
- **Suggested fix:** Đừng gọi đây là template. Hoặc (a) không persist feedback HV vào bank (chỉ persist khi user bấm "lưu vào bank"), hoặc (b) cột `sourceStudentId` + không list raw sang GV khác khi có multi-teacher. Sửa câu Security. Test: feedback có tên HV xuất hiện trong GET comment-bank — chọn accept có ý thức.

## Finding 7: Sign-up email chưa verify + bootstrap `teacher` + persist SĐT trẻ em — không rate limit, không identity
- **Severity:** High
- **Location:** Phase 1 Bootstrap; Plan invariant 1; Non-goals (không parent login — im lặng email verify)
- **Flaw:** `emailAndPassword.enabled: true`, `emailVerified` default `false`, **không** `requireEmailVerification`. Wave 0: request kernel đầu sau `getSession` → INSERT org + membership `role=teacher` (không gate owner, không verify). Ngay sau đó `POST /api/students` lưu SĐT/PH. Plan không rate-limit bootstrap/POST student, không CAPTCHA, không chặn `emailVerified === false`.
- **Failure scenario:** Deploy workers.dev. Attacker `sign-up` email giả (hoặc chiếm email chưa đăng ký). Session hợp lệ → bootstrap teacher → POST hàng loạt HV (SĐT phụ huynh, notes). D1 chứa PII trẻ em (IELTS/học sinh) dưới identity không verify. Mass sign-up + unique email = chiếm inbox nạn nhân + đầy D1 (mỗi user 1 org orphan nếu race org-then-membership).
- **Evidence:**
  - `packages/auth/src/index.ts:23-25` — `emailAndPassword: { enabled: true }` — 0 requireEmailVerification, 0 plugins
  - `packages/db/src/schema/auth.ts:8-10` — `emailVerified` default `false`
  - `packages/db/src/migrations/0000_mushy_amazoness.sql:37` — `email_verified integer DEFAULT false`
  - Phase 1: *"0 membership → INSERT org (name từ `user.name`) + membership `role=teacher`."*
  - Plan invariant 1: *"Role bắt buộc = `teacher`" / "Không gate `owner`"*
  - `apps/web/src/routes/_auth/route.tsx:7-14` — guard chỉ `session.data`; không `emailVerified`, không role
- **Suggested fix:** Wave 0: từ chối kernel nếu `!emailVerified` **hoặc** document chấp nhận risk (user đã lock solo teacher — vẫn phải nói). Rate-limit sign-up + POST `/api/students`. Bootstrap sau verify, không sau session trần. Test: user `emailVerified=false` → 403 kernel.

## Finding 8: "Helper insert" invoice/lesson/assignment không khóa test-only — backdoor tạo resource
- **Severity:** High
- **Location:** Phase 5/6/7 Architecture ("helper insert"); Non-goals "không vá stub tạo buổi/HĐ/bài"
- **Flaw:** Cấm POST create trên API thật. Test persist "dùng helper insert". Không viết: helper = drizzle trong test file / không mount Worker. Implementer thiếu D1 test infra (Finding 3) dễ thêm `POST /api/_test/seed` hoặc nới create "tạm". Wave 8 grep chỉ `seedData` / `useReducer` — không bắt debug route.
- **Failure scenario:** `POST /api/lessons` hoặc `/api/_internal/insert` lên production Worker. Attacker session (Finding 7: email giả) INSERT invoice rồi mark-paid, INSERT assignment rồi grade, INSERT lesson rồi check-in — vượt non-goal và làm lệch `remaining` derive. Hoặc quên authz trên helper → unauthenticated write D1.
- **Evidence:**
  - Phase 5: *"Test persist dùng helper insert, **không** mở stub/UI tạo buổi."*
  - Phase 6: *"Không POST create. Test mark-paid dùng helper insert invoice"*
  - Phase 7: *"Không create endpoint. Test grade dùng helper insert"*
  - Plan Non-goals: *"Vá stub (tạo HĐ, … tạo buổi, tạo bài)"*
  - `apps/server/src/index.ts` — hôm nay không có routes/; mọi route mới là wave 0+; không convention "test routes off"
  - Phase 9 grep gate: `seedData` / `useReducer(reducer` — không `/api/_test` / create lesson
- **Suggested fix:** Helper = function trong `*.test.ts` gọi drizzle/miniflare, **cấm** HTTP. Ghi "0 route create lesson/invoice/assignment trên Worker prod". CI grep `app.post("/api/lessons"` (không phải check-in) fail. Nếu cần seed local: flag env `ALLOW_FIXTURE_INSERT` default off.

## Finding 9: Mark-paid persist đóng băng overwrite hóa đơn đã thu — không 404/403, không chặn `amount`
- **Severity:** Medium
- **Location:** Phase 6 Architecture + Security; characterization đã lock overwrite
- **Flaw:** Phase 6 đúng *"Không tin `amount` từ client lúc mark-paid"* nhưng im lặng status đã `paid`. Test hiện tại **lock** overwrite `method` trên invoice paid. Persist hành vi đó = đổi phương thức thu sau khi đóng tiền, không audit. Không spec 404 vs 403 unknown id (oracle tồn tại). `method` không enum.
- **Failure scenario:** `POST /api/invoices/INV-081/mark-paid` `{ method: "Tiền mặt" }` trên HĐ đã CK → sổ sách đổi method, đối soát sai. `{ amount: 1 }` nếu implementer merge body (plan cấm amount nhưng không cấm spread body). Unknown id khác org: 403 vs 404 đếm hóa đơn org khác.
- **Evidence:**
  - Phase 6: *"`POST /api/invoices/:id/mark-paid` `{ method }`"* / *"Không tin `amount` từ client"*
  - `apps/web/src/lib/data-store-reducer.ts:146-154` — map theo id, không guard `status !== "paid"`, gán `method` client
  - `apps/web/src/lib/data-store-reducer.test.ts:112-119` — *"already-paid overwrites method (current behavior)"*
  - `apps/web/src/lib/data-store-reducer.test.ts:1-4` — comment "Delete or rewrite these tests when the mock is replaced by an API" — Phase 6 không rewrite invariant này
- **Suggested fix:** Persist: already-paid → 409 no-op (không đổi method). Zod `method` enum. Unknown/other-org → 404. Test IDOR + replay. Xóa/rewrite characterization overwrite khi API chết mock — đừng mang sang D1.

---

## Fact-check nhanh (claim plan vs repo)

| Claim | Verdict |
|---|---|
| CORS `GET\|POST\|OPTIONS` tại `index.ts:14` | Đúng (`allowMethods` dòng 14) |
| `alchemy.run.ts:11-13` `migrationsDir` | Đúng |
| `bts.jsonc` `api: none` | Đúng (`:25`) |
| `schema/index.ts:1` chỉ auth | Đúng — `export * from "./auth"` |
| D1 4 bảng Better-Auth | Đúng — user/session/account/verification |
| Server chưa `getSession` | Đúng — grep `getSession` chỉ `apps/web/src/routes/_auth/route.tsx:8` |
| `data-store.tsx:37-56` provider + `useReducer(reducer, seedData)` | Đúng (`:38`) |
| 26 import `@/lib/data-store` | Đúng (26 hit). Breakdown sai: **12** route + 11 modal + lesson-modal + topbar + app-shell. `settings.tsx` **không** import. 13+11+3 = 27 ≠ 26 |
| "13 route files" | Đúng nếu đếm cả `settings.tsx` (13 file dưới `_auth/` trừ `route.tsx`) |
| "Characterization 26 test import `seedData`" | **Sai** — 23 `test(` trong `data-store-reducer.test.ts` import `seedData`. 3 test enroll **không** import seed. Tổng 26 test trong `lib/` |
| `data-store-reducer.ts:122-136` check-in | Đúng |
| `data-store-reducer.test.ts:30-47` không tăng `sessionsDone` | Đúng (`:46-47`) |
| `dashboard.tsx:74` check-in | Đúng dispatch. Filter "hôm nay" là `day === 2` tại `:19` |
| `add-invoice-modal.tsx:20-24` no-op | Đúng |
| `grade-modal.tsx:42` / `:22,97-103` | Đúng |
| `$assignmentId.tsx:121-124` gửi/nháp no-op | Đúng — Button không onClick |
| `$assignmentId.tsx:132` commentBank | Đúng |
| `create-report-modal.tsx:33-37` stub | Đúng |
| `topbar.tsx:66` banner demo | Đúng |
| `packages/db` + `packages/api` thêm `check-types` | `packages/db/package.json` **không** có `check-types` hôm nay (plan sẽ thêm). `packages/api` **không tồn tại**. `packages/auth` cũng 0 script — plan không nhắc |
| `packages/api` Zod tay, cấm đổi `bts.jsonc` | `packages/api` chưa có — khớp researcher |
| Không `X-Org-Id` v1 | **Mâu thuẫn nội bộ** — xem Finding 3 |
| Isolation 2 org trên `pnpm test` | **Không khả thi** với harness hiện tại (Finding 3) |

## Unresolved questions

- Isolation test wave 0 chạy trên infra nào? Plan im lặng → AC "Org A không đọc class org B" không enforce được.
- `POST /api/students` body có `classId` không? Phase 1 vs Phase 2 giả định có; API list không nói.
- Comment bank chứa nhận xét HV: user đã lock persist wave 7 — có chấp nhận PII trong bank không? Plan vừa lock vừa phủ nhận PII.

Status: DONE
Summary: Plan mở API cookie-authenticated đầu tiên trên SameSite=None mà không CSRF/Origin, không helper bind org+parent cho nested ID, và tự mâu thuẫn `X-Org-Id`. Isolation — AC bảo mật duy nhất — không có D1 test harness.
Concerns/Blockers: Finding 1–2 phải sửa trên plan trước cook. Thiếu `requireOrgResource` + Origin check + 2-user Worker test thì wave 0 ship IDOR/CSRF.
