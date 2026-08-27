# Code Review — pending class-detail enroll (issue #5)

**Date:** 2026-08-16
**Mode:** pending worktree `fix/class-detail-enroll-student` vs `develop` `f8c2e34` (cùng SHA; implement chưa commit)
**Plan:** `plans/260816-1821-class-detail-enroll-student-into-viewed-class/`
**Gates (session này, CWD = worktree):** `pnpm --filter web test` 26/26; `tsc --noEmit` 0 err (có cả 2 file test); `biome check` 6 file touched = clean. `pnpm check-types` turbo cache-hit — xác minh tươi bằng `apps/web` `tsc --noEmit`, không tin FULL TURBO.

## Code Review Summary

### Scope
- Files:
  - `apps/web/src/lib/data-store-reducer.ts`
  - `apps/web/src/lib/data-store-reducer.test.ts`
  - `apps/web/src/components/modals/add-student-modal.tsx`
  - `apps/web/src/routes/_auth/classes/$classId.tsx`
  - `apps/web/src/lib/add-student-enroll.contract.test.ts` (untracked)
  - `apps/web/src/routes/_auth/students/index.tsx` (in-scope, **không** đổi — `git diff` rỗng)
- LOC: tracked `+71 / -10`; contract test +81. Net ~+142.
- Focus: pending bugfix enroll vào lớp đang xem
- Scout findings: 2 call site `AddStudentModal`; roster/count đọc `cls.studentIds`; sibling `key={cls.id}` trùng `AssignSyllabusModal`; contract extract **không** dính key của Assign (probe dưới)

### Overall Assessment
Spec **PASS**. Root cause đúng: `add-student` trước chỉ `[...students]`; modal không có `classId`; class detail không truyền. Fix đúng slot (`payload.classId`, không copy top-level `assign-syllabus`). Omit / `""` / unknown = create-only; valid id = `[...prev, newId]` + class object còn lại nguyên. `/students` vẫn global-only.

Một defect mới: hai sibling cùng `key={cls.id}`. Không gãy happy-path enroll, nhưng remount thừa + React duplicate-key. Còn lại là residual test tightness, không sai behavior.

**Score: 8.2/10**

### Mandatory checks

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| (a) | Root cause addressed | **PASS** | reducer `data-store-reducer.ts:193-203` map `studentIds`; modal `add-student-modal.tsx:12,47` đọc **prop** lúc submit; `$classId.tsx:241-246` `key` + `classId={cls.id}` sau `notFound` |
| (b) | Blast radius (students list, other classes, sessionsDone/notes) | **PASS** | `students/index.tsx:82` không `classId=`; enroll test `toEqual` nguyên object c1 trừ `studentIds` + `filter(id!==c1)` = c2 **và** c3; `if (!classId)` early-return không đụng `classes` |
| (c) | New failure modes | **CONCERN** | sibling key collision — xem Important #1. Không authz mới (demo store, comment test giữ). Không persist/API |
| (d) | Existing patterns | **PASS** | payload nest theo modal hiện có; `structuredClone` seed; không RTL; contract đọc source như `scripts/ci-workflow.test.mjs` |
| (e) | Contract không false-green vì `AssignSyllabusModal` `key` | **PASS** | xem probe dưới |

### Spec compliance (plan.md AC)

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 1 | omit `classId` và `classId: ""` append student, `classes` deep-equal | PASS | `if (!classId)` + 2 test |
| 2 | valid `classId` → đúng class `studentIds = [...prev, newId]`; class khác unchanged | PASS | map + `toEqual({...beforeC1, studentIds})` + filter equal |
| 3 | unknown `classId` vẫn create, `classes` unchanged | PASS | map no-op + test `c-missing` |
| 4 | contract: class detail `key={cls.id}` + `classId={cls.id}`; students omit `classId` | PASS | 3 test; extract block **không** chứa `AssignSyllabus` / `defaultClassId` |
| 5 | `pnpm --filter web test` + `VITE_SERVER_URL=... pnpm check-types` | PASS | 26/26; `tsc --noEmit` 0 (listFiles có cả contract test) |
| 6 | không `useState(classId)` / không `classes[0]` default | PASS | modal chỉ shorthand `classId` trong payload |
| 7 | `classId` nested trong payload, không top-level action | PASS | type + dispatch |
| 8 | giữ comment demo / no-authz | PASS | `data-store-reducer.test.ts:1-4` |

Extras: không. Scope không trôi sang picker / server / open-design.

Plan.md phase 1–2 + AC checkbox vẫn `Pending`/`[ ]` trong khi phase file todo đã `[x]`. Lead/planner đánh dấu — reviewer không sửa plan.

### Critical Issues
Không.

Không endpoint mới, không secret, không đổi schema/authz. Demo-store IDOR / dispatch tùy ý: plan reject S2/S5, đúng threat model. Hủy trên modal: `Button` default `type="button"` (`button.tsx:26`) — không submit nhầm.

### Important
1. **`$classId.tsx:234-246` — hai sibling cùng `key={cls.id}`.** `AssignSyllabusModal` đã `key={cls.id}`. PR thêm cùng literal lên `AddStudentModal` (cùng parent `<div>`). React key phải unique giữa siblings: map reconcile giữ child sau, type mismatch → **cả hai remount mỗi lần `ClassDetailRoute` re-render** (đổi tab, gõ notes, `useData` update), không chỉ khi đổi lớp. Happy-path enroll vẫn chạy vì gõ form là local state (parent không re-render). Dev warning. Plan decision 7 + contract `/key=\{cls\.id\}/` **khóa đúng literal gây collision**.

   Fix (giữ intent remount-khi-đổi-lớp):
   ```tsx
   <AddStudentModal
     key={`add-student-${cls.id}`}
     open={addStudentOpen}
     onClose={() => setAddStudentOpen(false)}
     classId={cls.id}
   />
   ```
   Contract: match `key={` có `cls.id`, **không** bắt buộc `key={cls.id}` trần. Đây là drift so với plan text — intent ổn, literal thì không.

### Nit
1. **Contract payload chỉ `/\bclassId\b/`.** `classId: data.classes[0]?.id` hoặc `classId: classId ?? "c1"` vẫn xanh. Đúng risk plan cấm (copy AssignSyllabus default) nhưng test không khóa. Implementation hiện đúng (shorthand prop). Siết: payload match `/^\s*classId,?$/m` + modal `not.toMatch(/classes\[0\]|useState\(\s*classId/)`.
2. **Enroll test chỉ `classId: "c1"`.** `if (c.id !== "c1")` hardcoded vẫn xanh. Wiring `classId={cls.id}` giảm rủi ro; 1 case c2/c3 khóa parameter.
3. **`includes(student.id)` chết.** `uid("s")` mới mint — nhánh không bao giờ true. Plan bắt copy. Giữ.
4. **`beforeC1?.studentIds ?? []`** sau `toBeDefined()` — lỏng hơn plan `beforeC1.studentIds`. Seed luôn có array.
5. **`extractJsxBlock` greedy** nếu sau này file có `</AddStudentModal>` (comment/string) — hiện self-close, block đúng 1 element (probe).

### Edge Cases Found by Scout
- Consumers `studentIds`: class detail roster (`map(studentById)` + filter) + StatCard length; `classes/index` sĩ số; `syllabus/$syllabusId` sĩ số. Tất cả đọc field mới. Student detail **không** reverse-lookup class — enroll không hiện “lớp” trên student page (pre-existing, không phải regression).
- `studentById` / `classById` recreate theo `useMemo([data])` — student mới + roster không split-brain.
- `classLessons` filter `cls.studentIds.includes(l.sid)` — student mới không có lesson → tab lịch không đổi. Đúng (red-team S6 reject).
- `notes` local state + `cls.notes` không bị enroll đụng (`{ ...c, studentIds }` + test object equality).
- `/students` lead “5 học viên…” hardcode — pre-existing, ngoài issue.
- Navigate c1→c2 khi modal mở: `addStudentOpen` sống trên route component; `key` remount form + `classId` prop mới. Đúng “enroll viewed class”.
- `classId: undefined` từ students page (key vẫn có trên object) — `if (!classId)` falsy. OK.
- Hủy không submit (Button `type="button"`).
- **(e) probe:** strip `key`/`classId` khỏi `AddStudentModal`, giữ nguyên `AssignSyllabusModal key={cls.id}` → extracted block **không** match `key={cls.id}`; file vẫn còn key. Không false-green.

Verified: students page không diff; không `useState(classId)`; không `classes[0]` trong modal; demo comment còn.

### Positive Observations
- Exact `toEqual` trên class object = lock `sessionsDone` / `notes` / `syllabusId` / `schedule` — không chỉ `contains` roster (red-team A8/S1).
- Contract parse **JSX block** `AddStudentModal`, không grep cả file — đúng lý do Assign đã có `key={cls.id}` (`$classId.tsx:234-239`).
- Payload slot khớp modal nest; không nhân action `enroll-student`.

### Recommended Actions
1. Unique key prefix trên `AddStudentModal` + nới contract regex (Important #1). Confirm với plan decision 7: đổi literal, giữ remount-on-class-change.
2. Commit file untracked `apps/web/src/lib/add-student-enroll.contract.test.ts` — thiếu là mất lock wiring.
3. Optional: case enroll `c2` hoặc `c3`; siết payload `classId` shorthand.
4. Lead: đánh dấu phase 1–2 + AC plan.md. Docs impact: none (demo store, không contract public/API).

### Metrics
- Type Coverage: `tsc --noEmit` 0 error (include `add-student-enroll.contract.test.ts` + `data-store-reducer.test.ts`)
- Test Coverage: 26/26 pass (`23` reducer + `3` contract). Không đo % line.
- Linting Issues: 0 (`biome check` 6 file)

### Checklist two-pass (base + web-app)
Pre-Landing Review: 1 important, 5 nit (0 critical)

**CRITICAL** (blocking): none
- Không SQL/HTML raw/command injection
- Không endpoint/auth mới
- Tên học viên render `{s.name}` — React escape

**Issues** (non-blocking):
- [`$classId.tsx:241`] duplicate sibling key — xem Important #1
- Test tightness — xem Nit #1–2

Suppressions applied: không flag dead `includes` như bug (plan bắt); không flag unknown-id create-only (decision 2); không flag thiếu authz (decision 8).

### Unresolved Questions
- Đổi `key={cls.id}` → `key={\`add-student-${cls.id}\`}` có được (plan decision 7 literal vs intent)?
- Lead cập nhật status phase/AC khi nào?

---

Status: DONE_WITH_CONCERNS
Summary: Enroll đúng root cause, AC plan xanh, contract không false-green vì key AssignSyllabus. Chặn nhẹ: hai modal sibling trùng `key={cls.id}` — sửa prefix + contract trước merge.
Concerns/Blockers: Important #1 sibling key collision; contract test file còn untracked.
