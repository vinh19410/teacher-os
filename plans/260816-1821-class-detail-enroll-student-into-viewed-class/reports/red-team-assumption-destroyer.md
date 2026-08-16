# Red-team: Assumption Destroyer + Fact Checker

Plan: `plans/260816-1821-class-detail-enroll-student-into-viewed-class/`
Date: 2026-08-16
Role: Fact Checker + Assumption Destroyer
Không khen. Chỉ finding có `file:line`.

Scout (trước review): dependents của `add-student` / `AddStudentModal` / `cls.studentIds` — reducer, 2 call site modal, class detail roster+StatCard, class list, syllabus-assigned table, HTML mock `saveStudent`. Seed có **3** lớp (c1/c2/c3), không phải 2.

---

## Finding 1: TDD + cấm component test → issue #5 không bị test buộc phải fix

- **Severity:** Critical
- **Location:** `plan.md` Outcome + Acceptance; Phase 2 "Tests After" / Success Criteria
- **Flaw:** Outcome là **submit từ class detail** → roster + StatCard "học viên" tăng. Gate tự động chỉ đụng reducer. Phase 2 nói rõ không có component/Playwright test. Sau khi `add-student` nhận `classId` trong reducer, **mọi test phase 1 xanh dù modal/route không đổi**. TDD (mode đã chọn) dừng ở bước 3; bước 4–5 (forward prop, `classId={cls.id}`) không có test đỏ.
- **Failure scenario:** Implementer làm đúng TDD: 3 case reducer, sửa `data-store-reducer.ts`, `pnpm --filter web test` xanh, `check-types` xanh. `AddStudentModal` vẫn dispatch payload không `classId`. User mở `/classes/c1`, bấm `+ Thêm học viên`, Lưu. Học viên mới vào `/students`. StatCard vẫn `2`, roster vẫn s1+s4. Issue #5 còn. Plan AC "Class detail receives classId" và Outcome fail; CI không biết.
- **Evidence:**
  - Plan Outcome: "After submit from class detail, the new student appears on that class roster and the \"học viên\" count increments."
  - Plan AC: "Class detail `AddStudentModal` receives `classId={cls.id}`" — không có test
  - Phase 2 Tests After: "All three add-student cases green. No new runner. No component tests."
  - Modal dispatch không `classId`: `add-student-modal.tsx:36-46`
  - Class detail không truyền `classId`: `$classId.tsx:241-244`
  - Count/roster đọc `studentIds`, không đọc `data.students`: `$classId.tsx:54-56,97`
  - Nút mở modal: `$classId.tsx:90-92`
  - Call site thứ 2 cũng không `classId`: `students/index.tsx:82`
  - Reducer hiện chỉ append students: `data-store-reducer.ts:165-190`
- **Suggested fix:** Đừng gọi reducer-green là xong Outcome. Khóa wiring bằng bước verify bắt buộc: `classId={cls.id}` trên `$classId.tsx` và modal `payload.classId`. Hoặc 1 test thuần import/route-module/grep gate. Manual checkbox không đủ khi mode là `--tdd`.

---

## Finding 2: Phase 1 "2 new failures" sai — case unknown-classId đã xanh; Vitest không typecheck

- **Severity:** High
- **Location:** Phase 1 "Tests Before" / Implementation Steps / Risk / Success "Confirm the new enroll cases fail"
- **Flaw:** Plan giả định case 2–3 đỏ vì "payload type error and/or no enroll". Vitest 4 + Vite/esbuild **không** typecheck object literal. Field thừa `classId` bị bỏ qua lúc runtime. Reducer destructure không đọc `classId` → classes không đổi. Case 3 (`classId: "c-missing"` + `next.classes` deep-equal) **đã là hành vi hiện tại**. Chỉ case 2 đỏ. Risk "TypeScript in Vitest may fail compile" là claim sai.
- **Failure scenario:** Cook chạy `pnpm --filter web test`, thấy 1 fail. Coi case 3 là test ma, xóa. Hoặc "implement" unknown bằng `throw` / không tạo student. Decision 2 ("still create the student; leave classes unchanged") vỡ. Phase 1 SC "Confirm the new enroll cases fail before phase 2" không thỏa — case 3 không fail.
- **Evidence:**
  - Phase 1: "After this phase, cases 2–3 fail (payload type error and/or no enroll)."
  - Phase 1 step 2: "Expect 2 new failures (or tsc-in-test failure if the payload type rejects `classId`)."
  - Phase 1 Risk: "TypeScript in Vitest may fail compile of the test file."
  - Vitest không bật typecheck, env node: `apps/web/vitest.config.ts:3-9`
  - Test script = `vitest run` (không `tsc`): `apps/web/package.json:13`
  - Payload type không có `classId`; case chỉ lấy 6 field: `data-store-reducer.ts:21-29,166`
  - Return không đụng `classes`: `data-store-reducer.ts:190`
  - Case omit hiện tại đã không đụng classes (không assert): `data-store-reducer.test.ts:259-277`
- **Suggested fix:** Viết case 3 là characterization (xanh trước và sau). Đỏ thật chỉ case enroll. Bỏ câu "tsc-in-test" khỏi Vitest. `tsc --noEmit` là gate riêng (Finding 6).

---

## Finding 3: "dispatch payload + classId" mơ hồ — đụng convention `classId` top-level

- **Severity:** High
- **Location:** Phase 1 Tests Before #2; Phase 2 Architecture #1–2
- **Flaw:** Mọi action sẵn có dùng `classId` để **ở top-level** (`assign-syllabus`, `update-class-notes`). `add-student`/`add-class` mới dùng `payload`. Phase 1 viết `dispatch payload + classId: "c1"` — có thể đọc là sibling field của `payload`. Phase 2 snippet đọc `action.payload.classId`. Hai phase không cùng một slot.
- **Failure scenario:** Phase 1 copy `assign-syllabus`: `{ type: "add-student", classId: "c1", payload: {...} }`. Vitest chạy (esbuild). Phase 2 làm đúng snippet `payload.classId`. Tests vẫn đỏ sau "fix". Phase 2 SC "Phase 1 tests pass" fail. Implementer dual-write cả hai chỗ hoặc sửa test sau — TDD contract gãy.
- **Evidence:**
  - Phase 1: "dispatch payload + `classId: \"c1\"`"
  - Phase 2: `action.payload.classId` trong snippet map
  - Top-level `classId` đã có: `data-store-reducer.ts:55,91-93,214,314`
  - Test `assign-syllabus` đã là top-level: `data-store-reducer.test.ts:241-245`
  - Test `update-class-notes` top-level: `data-store-reducer.test.ts:302-306`
  - `add-student` hiện nest trong `payload`: `data-store-reducer.ts:21-29` + `data-store-reducer.test.ts:261-270`
  - Modal cũng nest payload: `add-student-modal.tsx:36-46`
- **Suggested fix:** Phase 1 paste nguyên action literal `{ type: "add-student", payload: { ..., classId: "c1" } }`. Cấm top-level `classId` trên action này. 1 ví dụ copy-paste, không prose.

---

## Finding 4: "only that class" không khóa — seed có c3 cùng skill Writing với c1

- **Severity:** High
- **Location:** Phase 1 Tests Before #2; `plan.md` AC "appends the new id to that class only"
- **Flaw:** Test spec chỉ: `c1.studentIds` chứa id mới; `c2.studentIds` equals seed. Seed có **c3**. c1 và c3 đều `skill: "Writing"`; c2 là Speaking. Assert c2 không phân biệt "chỉ c1" với "mọi lớp Writing" / "mọi lớp trừ c2".
- **Failure scenario:** Implementer enroll theo `c.skill === viewed.skill` hoặc map mọi class trừ chỗ test nhắc. c1 nhận id, c2 giữ `["s3"]`, c3 (`["s5"]`) cũng nhận id. Test phase 1 xanh. AC "that class only" fail. Junior class roster/count tăng oan.
- **Evidence:**
  - Phase 1: "`c1.studentIds` contains the new id and previous ids"; "`c2.studentIds` equals seed"
  - Không nhắc c3 / "mọi class khác"
  - c1 Writing, `studentIds: ["s1","s4"]`: `mock-data.ts:634-640`
  - c2 Speaking, `["s3"]`: `mock-data.ts:650-656`
  - c3 Writing, `["s5"]`: `mock-data.ts:664-671`
  - Class list / syllabus table cũng đọc `studentIds.length`: `classes/index.tsx:76`, `syllabus/$syllabusId.tsx:257`
- **Suggested fix:** `expect(next.classes.filter(c => c.id !== "c1").map(c => c.studentIds)).toEqual(before.classes.filter(c => c.id !== "c1").map(c => c.studentIds))`. Hoặc assert từng `c2` và `c3`.

---

## Finding 5: Phase 2 JSX bỏ `key={cls.id}` — sibling modal trên cùng route đã phải remount vì snapshot

- **Severity:** High
- **Location:** Phase 2 Architecture #3–4 (snippet `<AddStudentModal ... classId={cls.id} />`)
- **Flaw:** Cùng file, `AssignSyllabusModal` có `key={cls.id}` vì modal đó `useState(defaultClassId ?? data.classes[0]?.id ?? "")` — snapshot lần mount đầu. Route `$classId` đổi param không nhất thiết unmount. Plan bảo "accept optional classId và forward on dispatch" nhưng snippet không `key`, không cấm `useState(classId)`. Pattern local là snapshot + key.
- **Failure scenario:** Implementer copy `AssignSyllabusModal`: `useState(classId ?? data.classes[0]?.id ?? "")`, gắn `classId={cls.id}` không `key`. User xem c1 rồi navigate c2, mở `+ Thêm học viên`, Lưu. Student vào `c1.studentIds`. Roster c2 không đổi. Outcome "viewed class" fail. Reducer test (hardcode `"c1"`) vẫn xanh.
- **Evidence:**
  - Phase 2 snippet: `<AddStudentModal open={...} onClose={...} classId={cls.id} />` — không `key`
  - Sibling đã `key={cls.id}` + `defaultClassId={cls.id}`: `$classId.tsx:234-239`
  - Snapshot + fallback lớp đầu: `assign-syllabus-modal.tsx:19-21`
  - `AddStudentModal` hiện không key: `$classId.tsx:241-244`
  - Param lấy từ route, component không key theo param: `$classId.tsx:41-44`
  - Fallback `classes[0]` trên seed là **c1**: `mock-data.ts:632-634`
- **Suggested fix:** Snippet bắt buộc `key={cls.id}` (hoặc `key={classId}` từ param). Cấm `useState` cho `classId` — đọc prop lúc submit. Ghi rõ lý do: cùng lý do `AssignSyllabusModal` đã có key.

---

## Finding 6: Phase 1 tự mâu thuẫn với `tsc` / CI — cấm đổi type, cấm `as any`, test nằm trong `tsc`

- **Severity:** High
- **Location:** Phase 1 Related Files / Risk / Regression Gate; `plan.md` AC `pnpm check-types`
- **Flaw:** Phase 1 chỉ sửa test, cấm sửa `data-store-reducer.ts`, cấm `as any`. Thêm `classId` vào object literal → `tsc --noEmit` excess-property (test file nằm trong tsconfig, không exclude). CI chạy `pnpm test` **rồi** `pnpm check-types`. Tip sau phase 1: test đỏ (case 2) **và** types đỏ. Plan chỉ cho phép test đỏ. `--tdd` commit phase 1 không bao giờ xanh CI.
- **Failure scenario:** Cook `--tdd --auto` commit phase 1. CI `quality` fail ở `pnpm check-types` với excess property, không phải "2 test fail". Implementer thêm `as any` (cấm) hoặc sửa `Action` sớm (cấm phase 1) để cứu types → ranh giới phase gãy; case 3 vẫn không đỏ (Finding 2).
- **Evidence:**
  - Phase 1: "Do not modify: `data-store-reducer.ts`"; "Do not use `as any`."
  - Phase 1 gate: chỉ `pnpm --filter web test`
  - `check-types` web = `vite build && tsc --noEmit`: `apps/web/package.json:10`
  - `apps/web/tsconfig.json:1-17` không `include`/`exclude` — `*.test.ts` bị `tsc` ăn (đã verify ở plan test-suite trước)
  - CI: `pnpm test` rồi `pnpm check-types`: `.github/workflows/ci.yml:32-33`
  - Literal `add-student` payload không có `classId`: `data-store-reducer.ts:21-29` + `data-store-reducer.test.ts:261-270`
- **Suggested fix:** Đưa `classId?: string` vào type **trong phase 1** (test vẫn đỏ vì chưa enroll). Hoặc exclude `*.test.ts` khỏi app `tsc`. Đừng để phase 1 cấm cả hai đường làm `tsc` xanh.

---

## Finding 7: Gate `pnpm check-types` thiếu `VITE_SERVER_URL` — lệnh plan đỏ dù code đúng

- **Severity:** High
- **Location:** `plan.md` AC; Phase 2 Implementation step 6 / Regression Gate
- **Flaw:** `apps/web` `check-types` chạy `vite build` trước `tsc`. Build import `@teacher-os/env/web` → `VITE_SERVER_URL: z.url()`. CI set dummy URL. Plan ghi trần `pnpm check-types`. Shell sạch / worktree mới không có env → gate fail vì env, không vì enroll.
- **Failure scenario:** Phase 2 xong, implementer chạy đúng lệnh plan. `vite build` nổ schema URL. Họ nghĩ type enroll sai, sửa lung tung `auth-client` / env. Hoặc bỏ qua `check-types`, merge; AC plan đánh dấu xong khi lệnh chỉ định chưa từng xanh.
- **Evidence:**
  - Plan/Phase 2: "`pnpm check-types`" — không env
  - Script: `apps/web/package.json:10`
  - Schema: `packages/env/src/web.ts:7`
  - Consumer build: `apps/web/src/lib/auth-client.ts:1,42`
  - CI job env: `.github/workflows/ci.yml:19-20`
  - Plan CI trước bắt buộc `VITE_SERVER_URL=http://localhost:3000 pnpm check-types` (cùng repo)
- **Suggested fix:** Gate viết đúng: `VITE_SERVER_URL=http://localhost:3000 pnpm check-types`.

---

## Finding 8: Decision 4 (không đụng field lớp khác) không có test

- **Severity:** Medium
- **Location:** `plan.md` Load-bearing #4; Phase 1 enroll case; Phase 2 snippet
- **Flaw:** "Do not mutate other class fields (`sessionsDone`, notes, syllabus)." Case enroll chỉ nói `studentIds`. `{ ...c, studentIds, sessionsDone: 0 }` hoặc xóa `notes` vẫn type-check, test vẫn xanh. StatCard "buổi đã học" trên cùng page sẽ 6/12 → 0/12.
- **Failure scenario:** Implementer reconstruct class khi enroll, reset `sessionsDone`. Roster có học viên mới (Outcome một phần đạt) nhưng tiến độ lớp về 0. Decision 4 fail. User thấy lớp "mất" 6 buổi.
- **Evidence:**
  - Plan decision 4: không đụng `sessionsDone`, notes, syllabus
  - Phase 1 chỉ `studentIds` + c2 seed
  - c1 seed `sessionsDone: 6`, `sessionsTotal: 12`, notes dài, `syllabusId: "sy1"`: `mock-data.ts:634-647`
  - Cùng page đọc `sessionsDone` / syllabus: `$classId.tsx:60-63,98-105`
  - Snippet phase 2 `{ ...c, studentIds: [...] }` đúng nếu copy nguyên; test không khóa
- **Suggested fix:** `expect(next.classes.find(c => c.id === "c1")).toEqual({ ...beforeC1, studentIds: [...beforeC1.studentIds, added.id] })`.

---

## Fact Checker claim table

Tối đa ~5 claim/phase. `VERIFIED (file:line)` | `FAILED (not found)` | `UNVERIFIED (ambiguous)`.

### Phase 1

| # | Claim | Result |
|---|--------|--------|
| 1 | `add-student` payload không có `classId` | **VERIFIED** `data-store-reducer.ts:21-29` |
| 2 | Return `{ ...state, students: [...state.students, student] }` | **VERIFIED** `data-store-reducer.ts:190` |
| 3 | Test name `add-student appends with pkg.done 0 and s- id`; `remaining === 8`; id `/^s-/` | **VERIFIED** `data-store-reducer.test.ts:259-276`; `remaining: total` tại `data-store-reducer.ts:179`; test `total: 8` dòng 267 |
| 4 | Class detail đọc roster từ `cls.studentIds` | **VERIFIED** `$classId.tsx:54-56`; count `cls.studentIds.length` dòng 97 |
| 5 | Test import `reducer` + `seedData`; fixture `c1`/`c2` | **VERIFIED** `data-store-reducer.test.ts:6-7`; `c1`/`c2` `mock-data.ts:634,650`. **Thiếu trong claim:** còn `c3` `mock-data.ts:664` |

### Phase 2

| # | Claim | Result |
|---|--------|--------|
| 1 | `AddStudentModal` không có prop `classId` | **VERIFIED** `add-student-modal.tsx:9-15` |
| 2 | Class detail `AddStudentModal` không truyền `classId` | **VERIFIED** `$classId.tsx:241-244` |
| 3 | Students list không truyền `classId` | **VERIFIED** `students/index.tsx:82` |
| 4 | Reset modal sau submit; id qua `crypto.randomUUID` (`uid`) | **VERIFIED** `add-student-modal.tsx:47-55`; `data-store-reducer.ts:11-13` |
| 5 | HTML mock cùng lỗ (class detail mở add-student, không ghi `studentIds`) | **VERIFIED** `open-design/v1/teacher-os.html:1098` (`openModal('add-student')` không id lớp); `saveStudent` chỉ `D.students.push` + `renderStudents()` `1403-1411` |

### Plan-level / gates

| # | Claim | Result |
|---|--------|--------|
| 1 | `pnpm --filter web test` tồn tại | **VERIFIED** package name `"web"` `apps/web/package.json:2`; `"test": "vitest run"` dòng 13 |
| 2 | `pnpm check-types` tồn tại | **VERIFIED** root `package.json:12` — nhưng lệnh thiếu `VITE_SERVER_URL` (Finding 7) |
| 3 | Issue `https://github.com/vinh19410/teacher-os/issues/5` | **UNVERIFIED** `web_fetch` → GitHub 404 (private hoặc không tồn tại). Không xác nhận được body issue khớp diagnosis |
| 4 | Cross-plan: reducer đã extract | **VERIFIED** `data-store.tsx:9,38` import/use `reducer` từ `./data-store-reducer` |
| 5 | Vitest, no globals, no Testing Library | **VERIFIED** `data-store-reducer.test.ts:5` import từ `vitest`; `vitest.config.ts` không `globals: true` |

---

## Unresolved questions

- Body issue #5 (URL 404). Diagnosis trong plan khớp code hiện tại; không verify được title/acceptance issue.
- Worktree local có `.env` `VITE_SERVER_URL` sẵn hay không — không đọc `.env`.

Status: DONE_WITH_CONCERNS
Summary: Plan khóa reducer, không khóa Outcome UI. TDD đỏ/xanh phase 1 sai (1 fail thật, không 2; Vitest không tsc). Slot `classId` và isolation c3/Writing để thủng AC.
Concerns/Blockers: Finding 1 Critical — merge theo gate hiện tại có thể để issue #5 nguyên. Sửa phase 1 test spec + khóa wiring trước khi cook.
