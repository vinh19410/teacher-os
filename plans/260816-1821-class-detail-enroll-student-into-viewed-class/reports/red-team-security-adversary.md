---
type: reviewer
role: fact-checker + security-adversary
date: 2026-08-16
plan: 260816-1821-class-detail-enroll-student-into-viewed-class
persona: Security Adversary (A01/A04/A05 + contract lock)
---

# Red-team — Security Adversary / Fact Checker

Plan review, không phải code review. Không khen. Mọi finding gắn citation codebase.

Threat model thật (để không thổi IDOR thành data-breach):

- Store = `useReducer(reducer, seedData)` in-memory, không persist (`data-store.tsx:38-39`). Không localStorage.
- Server chỉ `/api/auth/*` (`apps/server/src/index.ts:20`). Schema D1 = user/session/account (`packages/db/src/schema/auth.ts`).
- `/_auth` chỉ check session tồn tại, không role, không object-level authz (`_auth/route.tsx:7-14`). Signup email mở (`sign-up-form.tsx:31-36`; `packages/auth/src/index.ts:23-25`).
- Cùng tab đã thấy mọi lớp/học viên. Extra `studentIds` hôm nay = integrity/view-poison, chưa phải lộ PII sang tenant khác.
- README đã quảng cáo Better-Auth + D1. Action type plan khóa hôm nay = contract copy sang API ngày mai.

Scout (trước review):

- Dependents của `studentIds`: roster + count `$classId.tsx:54-57,97`; list `classes/index.tsx:76`; syllabus assigned `syllabus/$syllabusId.tsx:257`; **join lịch** `$classId.tsx:57-59`.
- `AddStudentModal` chỉ 2 call site: class detail + `/students`. Không caller khác.
- `dispatch` trần ở mọi modal sau login. Thêm `classId` = nới mass-assignment trên action đã public.
- Seed có **c3**, không phải 2 lớp. Lesson `l6` sid `s3` (c2) có zoom `meet.google.com/lmn`.
- Issue #5 URL 404 khi fetch công khai.

---

## Finding 1: Gate "enroll only that class" rỗng — c3 + subset-contains; extra membership vẫn xanh
- **Severity:** Critical
- **Location:** Plan Acceptance Criteria bullet 2; Phase 1, section "Tests Before" cases 2–3
- **Flaw:** AC đòi "appends the new id to that class only". Test chỉ: `c1.studentIds` *contains* id mới + id cũ; `c2.studentIds` equals seed. Seed có **c3**. `contains` ≠ exact roster. Reducer enroll c1+c3, hoặc nhét thêm `s3`/`s5` vào c1, vẫn pass.
- **Failure scenario:** Implementer viết `classes.map` enroll mọi class trừ hardcode `c2`, hoặc `[...c.studentIds, student.id, "s3"]`. CI xanh. Class Writing `c1` hiện "Lê Hoàng Gia Hân" (c2) trên roster; tab Lịch kéo lesson `l6`/`l11` (topic Speaking/Trial) vì join `cls.studentIds.includes(l.sid)`. StatCard "học viên" + `classes/index` + syllabus assigned count phình. Cùng shape IDOR khi persist: mutate membership ngoài resource đang xem, test không bắt.
- **Evidence:**
  - Phase 1: *"`c1.studentIds` contains the new id and previous ids"* / *"`c2.studentIds` equals seed"*
  - Plan AC: *"`add-student` with valid `classId` appends the new id to that class only"*
  - `apps/web/src/lib/mock-data.ts:634-671` — `c1` `["s1","s4"]`, `c2` `["s3"]`, **`c3` `["s5"]`**
  - `apps/web/src/routes/_auth/classes/$classId.tsx:54-59` — roster + `classLessons` từ `studentIds`
  - `apps/web/src/routes/_auth/classes/$classId.tsx:97` + `classes/index.tsx:76` + `syllabus/$syllabusId.tsx:257` — count = `studentIds.length`
  - `apps/web/src/lib/mock-data.ts:360-369` — `l6` sid `s3`, zoom `meet.google.com/lmn`
- **Suggested fix:** Assert exact: `nextC1.studentIds === [...beforeC1.studentIds, added.id]` (không dup, không extra). `expect(next.classes.filter(c => c.id !== "c1")).toEqual(before.classes.filter(...))` — khóa c3 và mọi field khác (`sessionsDone`, notes, syllabus). Đừng dùng `contains`.

## Finding 2: Plan khóa create+enroll zero-authz thành spec trong app đã có session thật
- **Severity:** High
- **Location:** Plan Non-goals + Load-bearing #1; Phase 2, "Security Considerations"
- **Flaw:** App đã auth (Better-Auth, cookie `httpOnly`+`Secure`, Google + email signup). Mọi mutation sống ở client reducer, không nhận actor, không check owner. Plan **cố ý** gắn "tạo học viên (PII: tên/SĐT/phụ huynh)" + "ghi `studentIds` lớp bất kỳ" vào **một** action, rồi viết: *"Any signed-in session can dispatch any class id. Do not add authz here."* Phase 1 test **yêu cầu** `classId: "c1"` từ caller tùy ý phải enroll. Suite sau này fail nếu API thêm `actorId` / deny cross-class / require membership.
- **Failure scenario:** User tự signup (`sign-up-form.tsx` → dashboard). Vào `_auth`. DevTools: `dispatch({ type:"add-student", payload:{ name, phone, parentName, total, price, mode, classId:"c3" }})`. Lớp Junior (Thảo Vy) nhận học viên giả. Không log, không role. Khi copy Action sang D1 (README đã có D1), đây là IDOR + mass-assignment `classId` trên POST create-student. Test Phase 1 sẽ **chống** hardening.
- **Evidence:**
  - Phase 2 Security: *"Demo in-memory store. Any signed-in session can dispatch any class id. Do not add authz here."*
  - `apps/web/src/routes/_auth/route.tsx:7-14` — chỉ `authClient.getSession()`; không role
  - `packages/auth/src/index.ts:17-25` — Google + `emailAndPassword.enabled: true`; schema user không có role (`packages/db/src/schema/auth.ts:4-18`)
  - `apps/web/src/components/layout/app-shell.tsx:65` — `DataProvider` bọc mọi trang sau login
  - `apps/web/src/lib/data-store.tsx:38-43` — `dispatch` trần
  - `apps/web/src/lib/data-store-reducer.ts:21-29,165-190` — `add-student` không actor; hiện không `classId`
  - `apps/server/src/index.ts:20` — chưa có students/classes API; contract client sẽ bị copy
  - Plan Non-goals: *"Server, D1, Better-Auth, or persistence"*
- **Suggested fix:** Không đảo quyết định "demo, chưa authz". Phải ghi invariant ổn định trên test file (như suite cũ): *"client demo store; no authz; không phải access-control class"*. AC unknown/valid `classId` = hành vi mock, **được phép phá** khi thay API. Cấm coi optional `classId` trên `add-student` là public API ổn định. Tách enroll khi có persistence.

## Finding 3: Control duy nhất ("chỉ lớp đang xem") không test; primitive nguy hiểm thì khóa
- **Severity:** High
- **Location:** Phase 2, "Tests After" + Success Criteria; Plan AC bullets 4–5
- **Flaw:** Bug #5 là **wiring**: modal class detail không gửi class đang xem. Plan cấm component test. Gate chỉ reducer. Test dạy: ai `dispatch` kèm `classId` cũng enroll. Không test `classId={cls.id}`. Không test `/students` omit. Không test modal forward đúng prop, không lấy từ URL/search.
- **Failure scenario:** (a) Implementer quên prop trên `$classId.tsx` — reducer test xanh, bug gốc còn, AC 4 giả. (b) Ngược lại: ai đó pass `classId` từ `useParams`/`search` hoặc reuse modal với id attacker chọn. Không test bắt. (c) `/students` sau này spread query `?classId=c3` vào payload — Phase 2 bảo "do not modify" nhưng không có regression lock.
- **Evidence:**
  - Phase 2 Tests After: *"All three add-student cases green. No new runner. No component tests."*
  - Plan AC: *"Class detail `AddStudentModal` receives `classId={cls.id}`"* / *"Students list `AddStudentModal` does not pass `classId`"* — không có test tương ứng
  - `apps/web/src/routes/_auth/classes/$classId.tsx:40-41,241-244` — `classId` từ `Route.useParams()`; modal **không** nhận `classId`
  - `apps/web/src/routes/_auth/students/index.tsx:82` — omit `classId` (chỉ `open`/`onClose`)
  - `apps/web/src/components/modals/add-student-modal.tsx:9-15,36-46` — props chỉ `open`/`onClose`; payload không có `classId`
  - Contrast: `AssignSyllabusModal` đã cho **đổi** class lúc submit (`assign-syllabus-modal.tsx:19-29,39-45`) — pattern sẵn để nhầm "thêm picker"
- **Suggested fix:** Ít nhất 1 test wiring không cần RTL đầy đủ: export helper `buildAddStudentPayload({classId})` và assert class-detail call site truyền `cls.id`, students call site không có key. Hoặc snapshot/grep contract trong test (cùng kiểu `ci-workflow.test.mjs`) trên 2 file route. Đừng để AC UI sống ngoài gate.

## Finding 4: Unknown `classId` vẫn tạo student — orphan PII, silent success, mass-create
- **Severity:** High
- **Location:** Plan Load-bearing decision 2; Phase 1 case 3; Phase 2 Architecture `if (!classId)` / map no-op
- **Flaw:** Invalid parent resource vẫn CREATE PII (name/phone/parent). Không 404, không error, không rollback. `""` falsy → bỏ enroll (lỗ gốc im lặng). `"  c1"` / `"C1"` / `"c-missing"` → student +1, classes nguyên. Attacker/caller probe id bằng side effect "student count +1 luôn". Khi thành API: POST create luôn 200 + row orphan; enumeration nhẹ; không rate limit.
- **Failure scenario:** Modal bug truyền `classId=""` (prop optional default). User bấm Lưu trên class detail — student vào `/students` (kèm SĐT), roster lớp không đổi. Issue #5 "fixed" trên giấy, tái hiện lúc runtime. Hoặc script `for (id of guessed) dispatch({..., classId:id})` — hàng trăm student PII trong store, không enroll. Phase 1 **khóa** hành vi này (`student count +1` + classes equal).
- **Evidence:**
  - Plan decision 2: *"Unknown / missing `classId`: still create the student; leave `classes` unchanged."*
  - Phase 1 case 3: *"`classId: \"c-missing\"`" / "student count +1" / "`next.classes` deep-equals `before.classes`"*
  - Phase 2: *`if (!action.payload.classId) return { ...state, students: nextStudents }`* — `""` đi nhánh omit
  - `apps/web/src/lib/data-store-reducer.ts:166-172` — ghi `name`, `phone`, `zalo`, `parent.name` không validate tồn tại class
  - `apps/web/src/components/modals/add-student-modal.tsx:29-45` — không check class tồn tại; phone optional; `parentName` không trim
  - `apps/web/src/routes/_auth/students/index.tsx:59-61` — `/students` render `s.name` + `s.phone` (PII global)
- **Suggested fix:** Tách 2 contract: missing `classId` (students page) = create only; **non-empty unknown** = reject / không tạo (hoặc tạo + error rõ). Test `""`, `"  "`, `"c-missing"`. Document: API sau này 404, không silent create. Đừng lock orphan PII làm AC sản phẩm.

## Finding 5: `classId` từ URL là input attacker; plan treat `cls.id` như trusted capability
- **Severity:** High
- **Location:** Phase 2 Architecture step 4; `$classId` wiring
- **Flaw:** `classId` route param = user-controlled. Seed id đoán được: `c1`/`c2`/`c3`. `classById` = `find` theo id, không owner. `status` có trên `ClassGroup` và UI "Tạm dừng" nhưng enroll không đọc status. Plan: `<AddStudentModal classId={cls.id} />` sau `if (!cls) notFound()` — chỉ chứng minh class có trong store chung, không chứng minh caller được ghi roster.
- **Failure scenario:** Hôm nay: mọi session mở `/classes/c3` rồi +học viên → ghi Junior. Không khác navigate (single-tenant). Ngày persist/multi-teacher: giữ đúng wiring này = IDOR cổ điển (A01) — đoán `/classes/c1`, enroll học viên vào lớp người khác. Plan ghi "Do not add authz" nên implementer sẽ **không** để lại TODO owner-check trên boundary này.
- **Evidence:**
  - Phase 2: *`classId={cls.id}`* / *"Pass `classId` from class detail only"*
  - `apps/web/src/routes/_auth/classes/$classId.tsx:41-51` — `useParams().classId` → `classById` → notFound nếu miss
  - `apps/web/src/lib/data-store.tsx:48` — `classById: (id) => data.classes.find((c) => c.id === id)`
  - `apps/web/src/lib/mock-data.ts:110,634-677` — `status: string`; cả 3 lớp `"active"`; id tuần tự
  - `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx:260-268` — UI đã biết `status === "active"` vs tạm dừng; enroll bỏ qua
  - `apps/web/src/lib/data-store-reducer.ts:210-216` — `assign-syllabus` cùng pattern: mọi `classId` đều ghi được
- **Suggested fix:** Giữ demo no-authz, nhưng plan phải gắn nhãn: `cls.id` = untrusted route input; enroll không check status/owner = hole, không phải feature. Khi có teacherId trên class, wiring này **phải** đổi. Test không được mô tả "valid classId" như authorization success.

## Finding 6: `studentIds` là capability xem lịch lớp; plan coi như list append
- **Severity:** Medium
- **Location:** Plan Overview / decision 3 (duplicate id); Phase 2 reducer snippet `includes` rồi push
- **Flaw:** `studentIds` không chỉ đếm roster. Nó là join key buổi học class-scoped. Thêm id = thêm hàng lịch + tên học viên. Duplicate check `includes(student.id)` chết: id luôn `uid("s")` mới. Plan không test "enroll không kéo lesson của học viên khác", không cấm nhét seed id.
- **Failure scenario:** Bug/malicious payload sau này (picker existing student, hoặc copy `includes` sai) đẩy `s3` vào `c1`. Tab Lịch lớp Writing hiện "Speaking Practice — Part 1 & 2" + tên Gia Hân. Lesson modal từ schedule khác vẫn có zoom; class view bị đầu độc. Test Phase 1 không đụng `data.lessons` / join.
- **Evidence:**
  - Phase 2: *`if (c.studentIds.includes(student.id)) return c`* / Risk: *"Duplicate enroll is defensive only; new students always get a new id."*
  - `apps/web/src/lib/data-store-reducer.ts:11-13` — `uid` = `s-` + `crypto.randomUUID().slice(0, 8)` (32-bit; collision sau này gắn nhầm id)
  - `apps/web/src/routes/_auth/classes/$classId.tsx:57-59,173-188` — schedule rows từ `studentIds` → `studentById` → `s.name` + `l.topic`
  - `apps/web/src/components/schedule/lesson-modal.tsx:49-55` — render `lesson.zoom` (cùng lesson object)
- **Suggested fix:** Ghi `studentIds` là capability class-scoped. Test enroll: `classLessons` predicate trên state mới không thêm lesson seed của class khác. Exact roster (Finding 1) là control tối thiểu.

## Finding 7: Không bound PII / roster; double-submit; create luôn global
- **Severity:** Medium
- **Location:** Phase 2 modal forward; Plan Outcome "appears on that class roster"; không nói `/students` PII
- **Flaw:** Modal chỉ chặn tên rỗng + charset SĐT. `parentName` raw. `name`/`phone` không max length. Submit không disable. Mỗi Lưu = student global (phone hiện `/students`) **và** optional enroll. Không rate limit. Store mọi session login thấy cùng seed + học viên mới trong tab.
- **Failure scenario:** Dán 1MB vào tên/phụ huynh → avatar `substring(0,2)`, roster/list re-render nặng (client DoS). Double-click Lưu → 2 id `s-********` vào `c1`, count +2. SĐT học viên "của lớp" thành hàng trên `/students` cho mọi user cùng tab — khi multi-teacher đây là leak ngang. Plan AC không khóa "không publish PII ngoài lớp".
- **Evidence:**
  - `apps/web/src/components/modals/add-student-modal.tsx:26-56` — không `disabled` lúc submit; `parentName` không trim; `Number.parseInt` fallback
  - `apps/web/src/lib/data-store-reducer.ts:166-190` — không max length; luôn `[...state.students, student]`
  - `apps/web/src/routes/_auth/students/index.tsx:41,59-61` — lead hardcode "5 học viên"; row hiện `s.phone`
  - `apps/web/src/lib/mock-data.ts:189-193` — seed đã chứa SĐT/phụ huynh lookalike; fail `toEqual(classes)` ít dump PII hơn fail student object
- **Suggested fix:** Plan ghi rõ: class-detail add **luôn** tạo student global (PII trên `/students`). Bound length. Disable submit. Test double-dispatch không yêu cầu nếu document "demo, no throttle". Khi persist: class-scoped create không được list cross-teacher.

## Finding 8: Claim nền (issue #5, "existing test đã assert classes") không đứng vững
- **Severity:** Medium
- **Location:** `plan.md` Tracking/Context; Load-bearing decision 5
- **Flaw:** Plan neo issue `https://github.com/vinh19410/teacher-os/issues/5` — fetch công khai 404 (private hoặc không tồn tại). Decision 5: *"Existing test must keep asserting classes unchanged when `classId` is omitted."* Test hiện **không** assert `classes`. Phase 1 mới *thêm* assert đó. Implementer tưởng invariant đã có, có thể "keep" bằng cách không đụng test cũ.
- **Failure scenario:** Cook skip Phase 1 case 1 (tưởng đã có). Chỉ thêm 2 test enroll. Đường omit không khóa — regress sau này mutate `classes` khi thiếu `classId` (spread default `classId: classes[0].id` như AssignSyllabusModal) không fail. Issue body không verify được → scope "picker existing student" / persistence có thể đã nằm trong issue, plan non-goal mâu thuẫn thầm.
- **Evidence:**
  - `plan.md` `issue: 5` + URL issues/5 — web_fetch = GitHub 404
  - Plan decision 5: *"Existing test must keep asserting classes unchanged"*
  - `apps/web/src/lib/data-store-reducer.test.ts:259-277` — chỉ length, `pkg.done`, `remaining === 8`, `/^s-/`. **Không** `next.classes`
  - Phase 1 Tests Before #1 mới ra lệnh thêm `expect(next.classes).toEqual(before.classes)`
  - `apps/web/src/components/modals/assign-syllabus-modal.tsx:19-20` — default `data.classes[0]?.id` nếu thiếu prop; copy pattern sang AddStudentModal = enroll nhầm lớp đầu
- **Suggested fix:** Sửa decision 5: "Phase 1 *adds* omit-classId classes-unchanged". Dán quote issue #5 (title/body) vào plan. Cấm default `classId` = `classes[0]`.

---

## Fact-check claims vs repo

### Phase 1 (sample)

| # | Claim | Verdict |
|---|--------|---------|
| 1 | `add-student` payload chưa có `classId`; return `{ ...state, students: [...state.students, student] }` | **VERIFIED** `data-store-reducer.ts:21-29,165-190` |
| 2 | Test name `add-student appends with pkg.done 0 and s- id`; `remaining === 8` | **VERIFIED** `data-store-reducer.test.ts:259-276` (do payload `total: 8`) |
| 3 | Class roster đọc `cls.studentIds` tại `$classId.tsx` | **VERIFIED** `:54-56,97` (+ join lịch `:57-59` plan không nêu) |
| 4 | Isolation đủ khi check `c1` vs `c2` | **FAILED** seed có `c3` `mock-data.ts:664-671` |
| 5 | Test import `reducer` + `seedData` như file hiện tại | **VERIFIED** `data-store-reducer.test.ts:6-7` (`seedData` từ `./mock-data`) |

### Phase 2 (sample)

| # | Claim | Verdict |
|---|--------|---------|
| 1 | `AddStudentModal` chưa có prop `classId` | **VERIFIED** `add-student-modal.tsx:9-15` |
| 2 | Class detail render modal không truyền `classId` | **VERIFIED** `$classId.tsx:241-244` |
| 3 | Students list không truyền `classId` | **VERIFIED** `students/index.tsx:82` |
| 4 | HTML mock cùng lỗ (push student, không ghi `studentIds`) | **VERIFIED** `open-design/v1/teacher-os.html:1403-1411` — chỉ `D.students.push`; class detail `:1098` `openModal('add-student')` không extra id |
| 5 | `pnpm check-types` + `pnpm --filter web test` tồn tại; id `crypto.randomUUID` | **VERIFIED** root `package.json:12`; web `package.json:10,13` (`vitest run`); `data-store-reducer.ts:11-13`. Vitest `vitest.config.ts:7-9` **không** typecheck — claim Phase 1 "tsc-in-test failure" từ `pnpm --filter web test` là **UNVERIFIED/sai lệnh** (tsc chỉ khi `check-types`) |

### Plan.md khác

| # | Claim | Verdict |
|---|--------|---------|
| 1 | Issue #5 tồn tại tại URL đã ghi | **UNVERIFIED** — GitHub 404 (private hoặc không có) |
| 2 | Existing add-student test đã assert classes unchanged | **FAILED** `data-store-reducer.test.ts:259-277` |
| 3 | 4 files: test, reducer, modal, `$classId` | **VERIFIED** (students/index "do not modify") |
| 4 | "No authz" mô tả đúng store hiện tại | **VERIFIED** session-only; không object authz |
| 5 | `vitest` no globals | **VERIFIED** test import từ `vitest`; config không `globals: true` |

---

## Unresolved questions

- Issue #5 body thật sự là gì? Plan non-goal "no existing-student picker" có cắt scope user đã confirm không?
- Action `add-student` + optional `classId` có phải contract sẽ copy sang D1 không? Nếu có, Finding 2–5 là blocker thiết kế, không phải note demo.
- Ai được signup production? Email/password đang mở — plan im lặng.

Status: DONE
Summary: Plan khóa enroll theo `classId` client-trusted trên reducer thuần; test không chứng minh "only that class" (c3 + contains), không test wiring — primitive IDOR/orphan-PII sẽ xanh và chống authz sau này.
Concerns/Blockers: Finding 1 phải sửa test contract trước cook. Finding 2–4 cần sunset note trên test/AC nếu giữ no-authz. Issue #5 chưa verify.
