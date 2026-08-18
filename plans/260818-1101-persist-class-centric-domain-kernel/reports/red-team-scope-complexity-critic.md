# Red team: Scope & Complexity Critic

- Type: red-team / scope-complexity
- Date: 2026-08-18
- Plan: `plans/260818-1101-persist-class-centric-domain-kernel/`
- Role: Scope critic + Contract Verifier
- Lock (không cắt): advise-2026-08-17, 9 wave, org trống, wave 7 persist, role `teacher`, package-on-enrollment, không vá stub, nhiều GitHub issue
- Tư thế: chỉ flag **cộng thêm** ngoài request. Feature đã lock → hỏi, không khuyên cắt.

## Finding 1: Wave 0 mở `X-Org-Id` dù v1 cấm và CORS hiện hẹp
- **Severity:** High
- **Location:** Phase 1, section "Architecture" + `plan.md` "Execution notes"
- **Flaw:** Plan tự mâu thuẫn rồi vẫn thêm surface đa-org. `plan.md` khóa "Không `X-Org-Id` v1". Phase 1 vẫn parse header và nới CORS `allowHeaders`. Advise v1 = 1 org/user, không UI org. Header + CORS là cộng thêm trust-boundary, không phải persist kernel.
- **Failure scenario:** Implementer làm đúng phase-01: thêm `X-Org-Id` vào CORS. Browser gửi header tùy ý. Code "parse rồi bỏ qua nếu 1 org" thành nhánh chết — hoặc lần review sau "đã parse rồi thì dùng". Isolation test 2 org đi qua header thay vì 2 session. Org A đọc org B.
- **Evidence:**
  - Live CORS chỉ `Content-Type` + `Authorization`: `apps/server/src/index.ts:14-16`
  - 0 hit `X-Org-Id` / `orgId` trong `apps/` + `packages/` (scout 2026-08-18)
  - Phase 1: "Org implicit. `X-Org-Id` parse được nhưng v1 bỏ qua nếu user chỉ 1 org."
  - Phase 1 Related Files: "allowHeader `X-Org-Id` nếu cần"
  - Phase 1 Security: "Không trust `X-Org-Id` nếu user không thuộc org đó."
  - `plan.md:63`: "Không `X-Org-Id` v1."
  - Advise §2.2: "v1: org duy nhất của user"
- **Suggested fix:** Xóa parse + CORS `X-Org-Id` khỏi wave 0. Org = membership của session. Header để plan invite.

## Finding 2: `GET /api/me` là endpoint thừa — bootstrap đã gắn kernel request
- **Severity:** High
- **Location:** Phase 1, section "Architecture" API list
- **Flaw:** Advise không liệt kê `/api/me`. Scout để mở: hook vs first-hit. Plan trả lời **cả hai**: bootstrap trên kernel request **và** thêm `GET /api/me`. Client wave 0 đọc `GET /api/kernel`. `/api/me` không có caller, không có màn Settings (local, không persist).
- **Failure scenario:** Wave 0 ship 2 bootstrap path. Race: tab A gọi `/api/me`, tab B gọi `/api/kernel`, cả hai thấy 0 membership, 2 INSERT org. `unique(userId)` cứu một phần — còn lại `/api/me` sống như org-admin API chết. Wave sau nhét profile/invite vào đó.
- **Evidence:**
  - Phase 1 API: dòng đầu `GET /api/me`
  - Phase 1 Architecture §2: "Bootstrap trên kernel request sau `createAuth().api.getSession({ headers })`"
  - `plan.md:65`: cùng câu bootstrap trên kernel request
  - Server chưa có `getSession`: `apps/server/src/index.ts:20` chỉ `createAuth().handler`
  - Web session khác hẳn: `apps/web/src/routes/_auth/route.tsx` → `authClient.getSession()` (Better-Auth client, không phải domain `/api/me`)
  - Settings không đọc store: `apps/web/src/routes/_auth/settings.tsx:16-20` local `useState`
  - Advise §2.2 API: CRUD kernel; không `/api/me`
- **Suggested fix:** Xóa `GET /api/me`. Bootstrap chỉ trên GET kernel / GET students|classes|syllabi đầu tiên.

## Finding 3: Wave 4 đổi `day === 2` thành "hôm nay thật" — rewrite UX, không phải persist
- **Severity:** High
- **Location:** Phase 5, Implementation step 4
- **Flaw:** Advise: khối "hôm nay" **đọc lesson D1**. Không bảo bỏ filter design-week. Live code khóa Thứ Ba (`day === 2`) + PageHead cứng "Thứ Ba, 19/08 · Hôm nay có 2 buổi học". Cùng hệ `day` 1..7 + `dayDates = [18..24]`. Đổi sang `Date()` là feature lịch thật — ngoài persist, ngoài "không rewrite UI".
- **Failure scenario:** Org có lesson `day=2` (Thứ Ba design). User mở dashboard ngày Thứ Năm. Filter live → 0 buổi. PageHead vẫn "Hôm nay có 2 buổi học". Check-in biến mất. 5 consumer khác vẫn vẽ tuần 18–24/08. Hai đồng hồ.
- **Evidence:**
  - `apps/web/src/routes/_auth/dashboard.tsx:19` — `data.lessons.filter((l) => l.day === 2)`
  - `apps/web/src/routes/_auth/dashboard.tsx:30-31` — PageHead cứng Thứ Ba 19/08
  - `apps/web/src/lib/mock-data.ts:35-36,154-155` — `day: number // 1..7`; `dayDates = [18,19,20,21,22,23,24]`
  - Caller `l.sid` / `dayDates` **không** được phase 5 liệt kê (vẫn design-week):
    1. `dashboard.tsx:19,51` — filter + `studentById(l.sid)`
    2. `schedule.tsx:53-54,85` — `dayNames`/`dayDates` + `studentById(l.sid)`
    3. `lesson-modal.tsx:16,29` — `lesson.sid` + `dayDates[lesson.day-1]/08`
    4. `classes/$classId.tsx:57-58,178,182` — `studentIds.includes(l.sid)` + `dayDates`
    5. `students/$studentId.tsx:72` — `data.lessons.filter((l) => l.sid === studentId)`
  - Phase 5 step 4: "Dashboard hôm nay filter lesson D1 theo ngày (không hardcode `day === 2` trên seed)."
  - Advise §2.3: "Khối 'hôm nay' lấy lesson đã persist sau wave 4." + "Dashboard StatCard + 'Cần xử lý' hardcoded: giữ."
- **Suggested fix:** Wave 4 chỉ đổi nguồn `data.lessons` → D1. Giữ `day === 2` (hoặc `lesson.day` đã persist). Lịch dương lịch = plan khác. Hỏi user nếu muốn mở khóa ngày thật.

## Finding 4: Wave 3 thêm path `POST enrollment` — sát stub "enroll HV cũ"
- **Severity:** High
- **Location:** Phase 4, Implementation step 2
- **Flaw:** Non-goal + advise: không vá "enroll HV có sẵn". Write path hiện tại: `AddStudentModal` → `add-student` + optional `classId` (tạo person rồi nhét roster). `POST /api/classes/:id/enrollments` trên client là path **thứ hai** — enroll studentId đã có, đúng stub bị cấm.
- **Failure scenario:** Wave 3 "enroll qua add-student + classId **hoặc** POST enrollment". Implementer thấy class detail chưa chọn HV cũ, wire nút roster → POST enrollments. Stub chết. Unique `(classId, studentId)` không chặn feature cấm.
- **Evidence:**
  - Dispatch `add-student` **1 caller UI**: `apps/web/src/components/modals/add-student-modal.tsx:38-48` (`classId` optional)
  - Caller modal (2):
    1. `students/index.tsx:82` — **không** `classId` (lock: `add-student-enroll.contract.test.ts:75-80`)
    2. `classes/$classId.tsx:241-245` — `classId={cls.id}` (lock: contract test `:59-67`)
  - Reducer enroll = append `studentIds`, không có action `enroll-existing`: `data-store-reducer.ts:193-204`
  - Phase 4 Requirements: "không vá enroll HV có sẵn"
  - Phase 4 step 2: "Enroll qua add-student + `classId` **hoặc POST enrollment**."
  - Phase 1 API đã public `POST /api/classes/:id/enrollments`
  - `plan.md` Non-goals: "enroll HV cũ"
- **Suggested fix:** Client chỉ `POST /api/students` (body có `classId` thì server tạo enrollment). `POST .../enrollments` nếu giữ = internal/server-only, không gọi từ route/modal wave 3.

## Finding 5: Plan đếm sai caller — "13 route / 26 test" không khớp repo
- **Severity:** High
- **Location:** Phase 1 Related Files; Phase 1 Architecture §4; Phase 9 grep gate
- **Flaw:** Plan viết "update" bằng số sai, không liệt kê symbol. Contract Verifier: **cấm** "update all callers". Đếm sai → sửa nhầm file / bỏ sót file / xóa test không tồn tại.
- **Failure scenario:** Wave 0 "26 import / 13 route không đổi" — implementer đếm 13 file dưới `_auth/` gồm `settings.tsx` + `route.tsx`, nghĩ settings nằm trong adapter. Wave 8 grep `seedData` trên app path: hit `mock-data.ts:186` (không phải test, không phải "types only") → xóa nhầm `fmtVND`/`dayDates` đang dùng. "26 characterization test" → tìm 3 test không import `seedData`.
- **Evidence — claim plan:**
  - Phase 1: "26 import sites `@/lib/data-store` gồm 13 route + 11 modal + lesson-modal + topbar + app-shell"
  - Toán: 13+11+1+1+1 = **27**, không phải 26
  - Phase 1: "Characterization 26 test import `seedData` trực tiếp"
  - Phase 9: grep `seedData` / `useReducer(reducer` = 0 trên `apps/web/src` trừ `*.test.ts` và types
- **Evidence — đếm live:**

`@/lib/data-store` = **26 file**, không phải 13 route:

| Nhóm | File | n |
|---|---|---|
| Route (12, **không** settings, **không** `_auth/route.tsx`) | `dashboard.tsx`, `students/index.tsx`, `students/$studentId.tsx`, `classes/index.tsx`, `classes/$classId.tsx`, `syllabus/index.tsx`, `syllabus/$syllabusId.tsx`, `schedule.tsx`, `tuition.tsx`, `assignments/index.tsx`, `assignments/$assignmentId.tsx`, `reports.tsx` | 12 |
| Modal (11) | `add-student-modal.tsx`, `add-class-modal.tsx`, `add-syllabus-modal.tsx`, `assign-syllabus-modal.tsx`, `add-module-modal.tsx`, `edit-module-modal.tsx`, `add-lesson-modal.tsx`, `edit-lesson-modal.tsx`, `grade-modal.tsx`, `add-invoice-modal.tsx`, `create-report-modal.tsx` | 11 |
| Khác (3) | `lesson-modal.tsx`, `topbar.tsx`, `app-shell.tsx` | 3 |
| **Tổng** | | **26** |

Màn 13 `settings.tsx`: 0 import store.

`seedData` import (2, không phải 26):
1. `data-store.tsx:18,38` — runtime `useReducer(reducer, seedData)`
2. `data-store-reducer.test.ts:7,10,13,21` — fixture

`data-store-reducer.test.ts`: **23** `test(`, không 26. Cộng `add-student-enroll.contract.test.ts` (3 test, **0** `seedData`) = 26 vitest web — plan gộp nhầm.

`DataProvider` caller: **1** — `app-shell.tsx:3`.

`dispatch` theo `Action` (đừng viết "update all"):

| Action | Caller UI |
|---|---|
| `check-in` | `dashboard.tsx:74`; `lesson-modal.tsx:75` |
| `cancel-lesson` | `lesson-modal.tsx:66` |
| `mark-invoice-paid` | `tuition.tsx:174` |
| `grade-assignment` | `grade-modal.tsx:42` |
| `add-student` | `add-student-modal.tsx:38` |
| `add-class` | `add-class-modal.tsx:31` |
| `add-syllabus` | `add-syllabus-modal.tsx:31` |
| `assign-syllabus` | `assign-syllabus-modal.tsx:29` — dùng bởi `classes/$classId.tsx:234` **và** `syllabus/$syllabusId.tsx:277` |
| `add-module` | `add-module-modal.tsx:28` |
| `edit-module` | `edit-module-modal.tsx:38` |
| `add-lesson` | `add-lesson-modal.tsx:33` |
| `edit-lesson` | `edit-lesson-modal.tsx:48` |
| `update-class-notes` | `classes/$classId.tsx:222` |

`createAuth` server: **1** — `apps/server/src/index.ts:20`. Barrel `schema/index.ts`: **1** — `packages/db/src/index.ts:4`. Auth **không** qua barrel: `packages/auth/src/index.ts:2` import `schema/auth`.

Helper `mock-data` wave 8 dễ xóa nhầm (không phải seed):
- `fmtVND`: `tuition.tsx:14,150`; `students/$studentId.tsx:13,141,219`; `students/index.tsx:12,76`
- `fmtK`: `dashboard.tsx:10,183`
- `averageBand`: `students/$studentId.tsx:13,253`; `assignments/index.tsx:10,70`; `data-store-reducer.test.ts:7,132`
- `dayNames`/`dayDates`: `schedule.tsx:10,53,77`; `classes/$classId.tsx:20,182`; `lesson-modal.tsx:5,29`

- **Suggested fix:** Sửa số trong plan: 12 route + 11 modal + 3 shell = 26. 23 test reducer. Liệt kê bảng trên vào phase 1/9. Grep wave 8: `seedData` / `useReducer(reducer` — giữ `mock-data.ts` helpers; chuyển `seedData` sang `*.test.ts` fixture.

## Finding 6: `unique(membership.userId)` — constraint schema không có trong advise
- **Severity:** Medium
- **Location:** Phase 1 Architecture §2; `plan.md` Execution notes
- **Flaw:** Advise khóa org trên schema + multi-teacher + cheaper path "1 org/user **vận hành**". Không khóa `UNIQUE(userId)`. Unique biến quyết định vận hành thành chặn invite/GV 2 org — trái "schema sẵn, UX org để plan khác".
- **Failure scenario:** Wave 0 migrate unique. Plan invite sau: user đã teacher org A, join org B → constraint. Phải migrate drop unique giữa production. Race bootstrap xử lý được bằng re-read + unique **composite (orgId, userId)**, không cần unique toàn cục userId.
- **Evidence:**
  - Phase 1: "`unique(membership.userId)` + re-read nếu race"
  - `plan.md:65`: cùng câu
  - Advise invariant 1: membership role `teacher`; không unique userId
  - Advise constraint: "Org + multi-teacher trên schema từ ngày 1"
  - Advise §7: "GV 2 không join được cho đến plan invite" — cost UX, không cost UNIQUE
  - Live: 0 bảng membership (`packages/db/src/schema/index.ts:1` chỉ `export * from "./auth"`)
- **Suggested fix:** Unique `(orgId, userId)`. Idempotent bootstrap = re-read membership theo `userId`. Đừng unique toàn cục trừ khi user xác nhận 1 user = 1 org **mãi**.

## Finding 7: Wave 0 đổi copy banner — UI ngoài file list, ngoài "13 màn không đổi"
- **Severity:** Medium
- **Location:** `plan.md` Execution notes; Phase 9 mới được sửa `topbar.tsx`
- **Flaw:** Wave 0: "13 route files không đổi". Phase 1 Related Files không có `topbar.tsx`. `plan.md` vẫn đổi banner sang "một phần UI chưa persist". Advise: banner **nghĩa** đổi đến wave 8, tắt ở wave 8 — không bảo rewrite copy wave 0.
- **Failure scenario:** Wave 0 PR đụng `topbar.tsx:63-68` (visual). Reviewer thấy UI change trong "kernel invisible". Wave 8 đụng lại cùng span. Hai PR conflict copy. User thấy banner mới nhưng schedule/tuition vẫn `[]` — copy "chưa persist" đúng, nhưng đó là việc wave 8 / copy riêng, không phải kernel schema.
- **Evidence:**
  - Banner live: `apps/web/src/components/layout/topbar.tsx:63-68` — "Dữ liệu demo — thay đổi không được lưu"
  - `topbar.tsx:14,112` — `useData()` + `NotifPanel notifs={data.notifs}` (1 caller NotifPanel)
  - Phase 1 Do not modify: "13 route files, stub modals, settings"
  - Phase 1 Modify: `app-shell.tsx`, `data-store.tsx` — **không** topbar
  - `plan.md:68`: "Banner = 'một phần UI chưa persist', không phải data mẫu."
  - Phase 9: Modify `topbar.tsx` banner; Context `topbar.tsx:66`
  - Advise §3: "Banner demo chỉ còn nghĩa 'một phần UI vẫn mock' đến wave 8"
- **Suggested fix:** Wave 0 không đụng `topbar.tsx`. Copy/tắt banner = wave 8 only.

## Finding 8: `check-types` cho `packages/db` "vào CI" — surface CI thừa
- **Severity:** Medium
- **Location:** `plan.md` Execution notes; Phase 1 step 2
- **Flaw:** Quality gate đã là `pnpm check-types` (turbo). `packages/db` **không** có script `check-types`. Server đã phụ thuộc `@teacher-os/db`. Thêm script + "vào CI" dễ bị đọc là sửa `ci.yml` — file đang bị `scripts/ci-workflow.test.mjs` khóa. Advise không đòi typecheck package db.
- **Failure scenario:** Implementer thêm step vào `.github/workflows/ci.yml`. `ci-workflow.test.mjs:22-40` không expect step mới — có thể vẫn xanh nếu chỉ thêm package script. Hoặc họ thêm `run: pnpm --filter @teacher-os/db check-types` → contract test không lock, CI dài, `packages/db` thiếu include `src` rõ (tsconfig chỉ extends + `outDir`). `packages/api` mới **cần** `check-types` (package mới, chưa có trong graph). `packages/db` thì không.
- **Evidence:**
  - `packages/db/package.json:12-15` — chỉ `db:generate`, `db:migrate:deploy`
  - `packages/db/tsconfig.json:1-9` — có tsconfig, 0 script gọi `tsc`
  - Root `package.json:12` — `check-types` = `turbo run check-types`
  - CI: `.github/workflows/ci.yml:33` — `pnpm check-types` (không liệt kê package)
  - Contract CI: `scripts/ci-workflow.test.mjs:24,33`
  - Server đã typecheck qua dep: `apps/server/package.json:12` `@teacher-os/db`
  - `plan.md:69`: "`packages/db` + `packages/api` thêm script `check-types` vào CI."
  - Phase 1 step 2: "Thêm `check-types` cho `packages/db` + `packages/api`."
- **Suggested fix:** `check-types` chỉ trên `packages/api` (package mới). Đừng sửa `ci.yml`. Đừng thêm script db trừ khi `tsc` db bắt lỗi mà server `tsc -b` không bắt — chứng minh trước.

## Finding 9: Wave 7 append comment bank + 2 bảng 0 writer — lock persist, scope write mới không liệt kê caller
- **Severity:** Medium
- **Location:** Phase 8 Architecture / Risk; hỏi, không cắt
- **Flaw:** User lock wave 7 persist 3 bảng + append comment bank. Đó không phải extra cần cắt. Plan **không** đếm caller, nên implementer dễ biến append thành CRUD comment bank / seed notif. `CommentBankItem` hiện **không có `id`**. `grade-modal` **không** dispatch feedback. `notif`/`report` **0 write path**. Org trống + cấm vá stub → 2 bảng mãi rỗng trừ helper test.
- **Failure scenario:** Wave 7 đọc "3 list persist" + "tag mặc định hợp lý". Thêm POST/PATCH/DELETE comment-bank, UI editor, seed 5 notif cho "list không trống". Non-goal stub + org trống vỡ. Grade submit thành 2 request (grade + comment-bank); fail comment-bank → điểm lưu, bank không — hoặc ngược lại. `key={c.text}` trùng sau append.
- **Evidence:**
  - `CommentBankItem` chỉ `tag`+`text`: `mock-data.ts:94-97`
  - Read commentBank: **1** — `assignments/$assignmentId.tsx:132-136` (`key={c.text}`, click `appendComment(c.text)`)
  - `grade-modal.tsx:22,42,97-103` — `feedback` local; submit chỉ `grade-assignment` scores; **0** Action commentBank trong `data-store-reducer.ts:15-95`
  - Notif write: 0. Read: `topbar.tsx:112` → `notif-panel.tsx:9,15` (props)
  - Report write: 0. `create-report-modal` stub. Caller modal (2): `reports.tsx:139`; `students/$studentId.tsx:269`
  - Phase 8: "POST `/api/comment-bank` từ grade modal khi feedback trim ≠ \"\"." + "tag mặc định hợp lý, ví dụ 'chung'"
  - Phase 8 Risk: "Append từ grade modal là write path **mới** do advise lock"
  - Advise §5.6 / lock B: persist 3 bảng; create/send report stub; append comment bank; notif không mark-read
- **Suggested fix (không cắt wave 7):** Khóa 1 POST append `{ tag: "chung", text }` từ `grade-modal.tsx` submit. Cấm CRUD/seed notif/report. Liệt kê 1+1+2 caller trên. Hỏi user 1 câu: bảng `notif`/`report` không writer — chấp nhận list production rỗng đến plan stub, hay chỉ persist schema + GET (không UI change)?

## Finding 10: Wave 1 "tháo" `$studentId` trong khi màn này đọc 4 collection chưa peel
- **Severity:** Medium
- **Location:** Phase 2 Architecture / Related Files
- **Flaw:** Wave 1 "Students routes import repo thay vì `data.students`". `$studentId.tsx` không chỉ `data.students`: lọc `lessons`/`invoices`/`assignments` theo `sid`, mở `CreateReportModal`. Peel "thẳng repo" = rewrite màn chi tiết hoặc để hybrid. Plan nói `useData()` còn lookup — rồi Related Files vẫn `students/*`. Implementer đọc "routes trỏ API" sẽ đụng 4 module ngoài wave 1.
- **Failure scenario:** Wave 1 thay `useData()` bằng `repos/students.ts` trên `$studentId`. `data.lessons.filter(l => l.sid === studentId)` mất. Tab lịch/HĐ/bài trống (dù wave 0 đã `[]`, peel xong không gắn lại được). Hoặc họ fetch 4 collection trong repo students — scope wave 1 nở sang schedule/tuition/assignments/reports.
- **Evidence:**
  - `students/$studentId.tsx:63-74` — `studentById` + `data.lessons` / `data.invoices` / `data.assignments`
  - `students/$studentId.tsx:138-161` — `student.pkg.*` (adapter map, chưa phải cột DB)
  - `students/$studentId.tsx:3,269` — `CreateReportModal` stub
  - `students/index.tsx:22` — chỉ `data` list
  - Phase 2: "Modify: `apps/web/src/routes/_auth/students/*`, `add-student-modal.tsx`"
  - Phase 2: "`useData()` vẫn cung cấp lookup cho màn khác"
  - Phase 2 Do not modify: `classes/*`, `syllabus/*`, `schedule.tsx` — **không** cấm over-peel `$studentId`
  - Advise wave 1 ownership: `students/*`, `add-student-modal.tsx` — cấm classes/syllabus/schedule
- **Suggested fix:** Wave 1 chỉ `students/index.tsx` + `add-student-modal.tsx` + GET/POST students. `$studentId` giữ `useData()` (person từ adapter/kernel, tab khác từ lookup). Ghi rõ 1 câu. Đừng "routes/*".

---

## Caller matrix (Contract Verifier — đủ, không "all callers")

Symbol plan đổi → caller **đếm đủ**:

- `@/lib/data-store`: 26 file (bảng Finding 5). Không: `settings.tsx`, `_auth/route.tsx`, `notif-panel.tsx`, `sidebar.tsx`, `syllabus-progress.tsx`.
- `DataProvider`: `app-shell.tsx:3`
- `seedData`: `data-store.tsx`, `data-store-reducer.test.ts`
- `reducer`: `data-store.tsx:9,38`; `data-store-reducer.test.ts:6` (23 case)
- `createAuth`: `apps/server/src/index.ts:1,20`
- `schema` barrel: `packages/db/src/index.ts:4`
- `AssignSyllabusModal`: `classes/$classId.tsx:234`; `syllabus/$syllabusId.tsx:277`
- `AddStudentModal`: `students/index.tsx:82`; `classes/$classId.tsx:241`
- `GradeModal`: `assignments/$assignmentId.tsx:150`
- `CreateReportModal`: `reports.tsx:139`; `students/$studentId.tsx:269`
- `NotifPanel`: `topbar.tsx:112`
- `SyllabusProgress`: `classes/$classId.tsx:10` (advise wave 2; plan wave 2 **bỏ** — không extra)
- `commentBank`: `assignments/$assignmentId.tsx:132`
- `check-in`: `dashboard.tsx:74`; `lesson-modal.tsx:75`
- CORS: `apps/server/src/index.ts:10-17`

## Ngoài scope đã lock (không phải finding cắt)

- 9 wave + tracker GitHub: user lock.
- Wave 7 persist 3 bảng: user lock — chỉ hỏi writer (Finding 9).
- `packages/api` Zod tay, không đổi `bts.jsonc` `api`: advise lock.
- Org trống, `[]` collection chưa peel, không hybrid seed: user lock.
- Package trên enrollment, role `teacher`, không stub fill: user lock.

## Unresolved questions

1. User có muốn dashboard/lịch dương lịch thật ở wave 4, hay chỉ D1 + `day === 2`? (Finding 3)
2. `notif`/`report` không writer — list production rỗng đến plan stub có chấp nhận? (Finding 9)
3. `unique(membership.userId)` có phải user lock "1 user = 1 org mãi", hay chỉ v1 vận hành? (Finding 6)
