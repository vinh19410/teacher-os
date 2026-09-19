# Scout Report — Assignment Bank List Page & Giao-bài-cho-lớp Flow

Ngày: 2026-09-18 · Repo: `/Users/vinhtran/Documents/project/personal/teacher-os` (HEAD `bacdea2` = merge PR #205, chứa trọn #202).

Bối cảnh #202: plan `plans/260918-0725-assignment-bank-create-page/plan.md` (status `completed`). 4 commit: `33bf023` (kernel+schema), `e96394f` (web page), `907fdc3` (tests), `5680ab8` (docs). Plan ghi rõ: **giao bài cho lớp là plan riêng ở trang Lớp học** (Key Decisions #1, Non-Goals); design v2 (`assignment-create-2.html`) từng có chọn lớp/học viên + hạn nộp nhưng bị bỏ ở v3. Plan cũng ghi: chưa có trang list ngân hàng riêng, chưa có `promptId` trên bảng `assignment`.

---

## 1. Triển khai #202 — nền tảng trực tiếp

### 1.1. Schema DB

**Bảng `assignment_prompt`** — `packages/db/src/schema/assignment-prompt.ts:12-32`:
- Cột: `id` (text PK), `orgId` (FK→organization, cascade), `task` ("task1"|"task2"), `genre` (text free id — thêm dạng đề mới không cần migration), `title`, `band` (default "7.0"), `source` (default ""), `prompt`, `note` (default ""), `status` (default "draft", "draft"|"ready"), `createdAt` (timestamp_ms, default unixepoch ms).
- Index: `assignment_prompt_org_idx` trên `orgId` (dòng 31).
- Docblock dòng 5-11: "Một row là MỘT đề chưa gắn lớp/học viên — giao bài (tạo row `assignment`) là luồng riêng ở trang Lớp học, nên không có FK student/class ở đây."
- Migration: `packages/db/src/migrations/0017_wet_jetstream.sql:1-16` (CREATE TABLE + index). Export tại `packages/db/src/schema/index.ts:2`.

**Bảng `assignment` (grading)** — `packages/db/src/schema/assignment.ts:19-44`:
- Cột: `id`, `orgId` (FK cascade), `studentId` (FK→student, cascade — **per-student, KHÔNG có classId, KHÔNG có promptId**), `title`, `type` (default ""), `due` (text, default ""), `status` (default "not-submitted"), `scores` (JSON `AssignmentScores | null`, type dòng 7-12: task/coherence/lexical/grammar), `createdAt`.
- Index: `assignment_org_idx`, `assignment_student_idx` (dòng 41-42).
- Docblock dòng 14-18: "Wave 6 — assignment rows exist for grading only: no create endpoint, rows enter the table via server-side flows (and test helper inserts)."
- Quan hệ "giao bài" với bảng này: schema hiện tại **không có cột link** tới `assignment_prompt` hay `class`/`enrollment` — giao một bank prompt cho lớp sẽ phải hoặc (a) thêm cột (`classId`/`promptId`) vào `assignment`, hoặc (b) tạo row `assignment` per student (mỗi enrollment 1 row) mang nội dung snapshot từ prompt. Không có ràng buộc nào sẵn.

**Bảng liên quan lớp/học viên:**
- `classTable` — `packages/db/src/schema/class.ts:10-35`: name/level/type/skills/mode/syllabusId/schedule/sessionsTotal/sessionsDone/status/startDate/notes. Roster không nằm ở đây (invariant 4).
- `enrollment` — `packages/db/src/schema/enrollment.ts:17-42`: `classId` FK, `studentId` FK, unique `(classId, studentId)` (`enrollment_class_student_uq` dòng 35-38). Đây là cầu lớp↔học viên duy nhất.

### 1.2. Contracts — `packages/api/src/contracts.ts`

- `assignmentPromptCreateSchema` — dòng 271-282: `.strict()`, 8 field: `task: z.enum(["task1","task2"])`, `genre` (trim 1-40), `title` (trim 1-200), `band: z.enum(["6.0","6.5","7.0","7.5"])`, `source` (trim ≤200, không default → client luôn gửi), `prompt` (trim 1-5000), `note` (≤2000), `status: z.enum(["draft","ready"])`. Type `AssignmentPromptCreate` dòng 283-285.
- `KernelAssignmentPromptRow` — dòng 570-580: 9 field (id, task, genre, title, band, source, prompt, note, status: `"draft"|"ready"|string`).
- `KernelSnapshot.assignmentPrompts` — dòng 616 (trong interface `KernelSnapshot` dòng 606-619).
- Hàng xóm: `KernelAssignmentRow` dòng 513-527 (`studentId`, `title`, `type`, `due` dd/mm display, `status: "not-submitted"|"late"|"graded"|string`, `scores`).
- `assignmentGradeSchema` dòng 261-264; `gradeScoresSchema` dòng ~250-259.

### 1.3. Server route POST /api/assignments/prompts

File `apps/server/src/routes/assignments/index.ts` (toàn bộ 100 dòng):
- `assignmentRoutes(deps)` dòng 24; helper `readBody` (zod safeParse → 400 "invalid json"/"invalid body") dòng 31-48.
- `GET /` (list grading assignments từ snapshot) dòng 50-55.
- **`POST /prompts`** dòng 60-72: lấy `kernelCtx` (401 nếu thiếu) → `readBody(assignmentPromptCreateSchema)` → `db.insert(assignmentPrompt).values({ id: crypto.randomUUID(), orgId: ctx.orgId, ...body.data }).returning({ id })` → 201 `CreatedResponse` `{ id }`; lỗi insert → 500 "prompt write conflict". Comment dòng 57-59: prompt org-scoped, không cần relation verification.
- `POST /:id/grade` dòng 77-97: update scores + status "graded" cùng lúc, org-scoped, 404 nếu không tìm thấy.
- Router được mount **bên trong kernel router**: `apps/server/src/routes/kernel.ts:1893` — `kernel.route("/assignments", assignmentRoutes(deps))` (cùng khối với `/reports`, `/notifs`, `/comment-bank` dòng 1894-1896). CSRF (Origin check + JSON content-type) áp chung qua middleware `kernel.use("*")` tại `kernel.ts:127-138`.

### 1.4. Kernel snapshot & command bus

**Snapshot loader** — `apps/server/src/routes/snapshot.ts`:
- `loadSnapshot(db, orgId)` dòng 74; select `assignmentPrompt` dòng 162-166 (orderBy createdAt, id).
- Map sang `assignmentPrompts` (projection 9 field) dòng 283-295.
- `assignments` (grading) map dòng 272-280.

**KernelCommand mapping (web)** — `apps/web/src/lib/repos/kernel.ts`:
- `kernelCommand(action)` switch dòng 36-217; case `"create-assignment-prompt"` **dòng 162-168**: `path: "/api/assignments/prompts"`, `body: { ...action.payload }` (payload 8 field = toàn body vì schema `.strict()`).
- Case khác để tham chiếu: `"grade-assignment"` dòng 146-150; `"enroll-student"` dòng 53-63; `"create-report"` dòng 156-161.
- `SNAPSHOT_COLLECTION_KEYS` — dòng 363-376, gồm `"assignmentPrompts"` (dòng 371); compile-time guard `MissingSnapshotKey` dòng 378-387; runtime shape guard `isSnapshotShape` dòng 395-401.
- `mapKernelSnapshot` — dòng 227-241, `assignmentPrompts: mapAssignmentPrompts(snapshot)` ở dòng 236.
- Query key: `kernelQueryKey = ["kernel"]` dòng 443 — **một query duy nhất cho mọi collection**, không có query key per-collection.
- Serialized command bus `createKernelCommandBus` dòng 490-577: POST → refetch `['kernel']` (tối đa 2 lần) → kết quả `refreshed|committed|definite-failure|outcome-unknown` (type dòng 263-272); double-click guard qua `inFlight` map (dòng 549-559).
- Transport `postKernelCommand` dòng 334-360 (fetch POST credentials include, timeout 15s).

**Action type** — `apps/web/src/lib/data-actions.ts`:
- `"create-assignment-prompt"` — dòng 42-56: payload đúng 8 field của contract.
- `"grade-assignment"` dòng 40; `"enroll-student"` dòng 81-91; `"add-student"` dòng 69-80 (có `classId?`); `"update-class-notes"` dòng 208.

**Mapper UI** — `apps/web/src/lib/repos/assignment-prompts.ts:5-19`: field-for-field, `status: row.status === "ready" ? "ready" : "draft"` (unknown collapse về draft).

**UI type** — `apps/web/src/lib/mock-data.ts`: `AssignmentPrompt` interface dòng 49-59; `MockData.assignmentPrompts` dòng 167; `KernelHydratedData` dòng 175-191 (có `assignmentPrompts` dòng 182). `Assignment` (grading) dòng 80-89 (`sid`, due, status `AssignmentStatus` dòng 80).

### 1.5. Trang /assignments/new — `apps/web/src/routes/_auth/assignments/new.tsx` (261 dòng)

- Route definition dòng 17-19 (`/_auth/assignments/new`).
- State: `ComposerState` (dòng 21-29, 7 field), `SavedPrompt` (dòng 31-38), `freshComposer()` dòng 40-51 — default **Task 2 · discuss · band 7.0** (từ `genreOf("task2","discuss")`).
- Local state dòng 58-63: `value`, `status` ("ready" default), `dirtyTitle`, `dirtyPrompt`, `showErrors`, `saved`.
- Validate client dòng 65-71: `titleOk`/`promptOk`; field errors tiếng Việt.
- `handleFieldChange` dòng 73-92: đổi task/genre → áp preset qua `compositionDefaults` với dirty-flag.
- `handleSubmit` dòng 104-131: `submit.run({ type: "create-assignment-prompt", payload: {...} })`; `result?.kind === "refreshed"` → `setSaved({...})`.
- `handleReconcile` dòng 133-145: reconcile xong cũng set saved.
- `actionCopy` dòng 147-160: 3 nhánh copy theo validation + status.
- Render dòng 162-260: breadcrumb (dòng 164-176), `PageHead` "Thêm đề vào ngân hàng" (dòng 177-180), grid 2 cột `lg:grid-cols-[1.45fr_0.9fr]` (dòng 194) — trái `PromptComposer`, phải `BankContextCard` + `StudentPreviewPaper`; sticky bottom action bar (dòng 220-256) với `KernelSubmitNotice` (dòng 221-227) + error alert (dòng 228-232) + Hủy/Lưu; success state thay form bằng `CreateSuccessCard` (dòng 182-191).

**Components #202** — `apps/web/src/components/assignments/`:
- `assignment-presets.ts`: `TASK_PRESETS` dòng 19-94 (task1: chart/table/map/process; task2: discuss/opinion/advantage/problem — mỗi preset có label/title/prompt tiếng Anh sẵn); `taskOf` dòng 96-98; `genreOf` dòng 100-103; `wordCount` dòng 105-109 (`split(/\s+/)`); `compositionDefaults` dòng 113-124.
- `prompt-composer.tsx`: form chính; ChipFilter "Dạng bài" (Task 1 · 150 từ / Task 2 · 250 từ) dòng 46-56; ChipFilter "Dạng đề" dòng 61-71; Field "Tiêu đề" dòng 74-84; ChipFilter band dòng 91-95; Field "Nguồn đề" dòng 97-103; Textarea "Nội dung đề" dòng 106-116 + word count dòng 117-122; Textarea "Hướng dẫn thêm" dòng 124-131.
- `bank-context-card.tsx`: **đây là sidebar "Đề đã có"** — dòng 28: `const recent = [...prompts].slice(-5).reverse()` (5 đề mới nhất); render mỗi prompt (dòng 69-82): `<strong>{p.title}</strong>` + `<Tag>{STATUS_TAG[p.status]}</Tag>` ("Sẵn sàng"/"Bản nháp", map dòng 9-12) + `font-mono` source ("Chưa ghi nguồn" nếu rỗng); dòng 83-87: "còn N đề khác" khi >5; empty copy "Chưa có đề nào trong ngân hàng." dòng 63-66. ChipFilter trạng thái "Bản nháp"/"Sẵn sàng giao" dòng 50-59. Comment dòng 15-18: **không có dữ liệu prompt→class nên không bao giờ render tag "Đã dùng N lớp"**.
- `student-preview-paper.tsx`: preview "Xem trước phía học viên" — spec line `{t.words} từ · {t.minutes} phút · Band {band}` (dòng 41), tags dòng 46-53, word count dòng 54-58.
- `create-success-card.tsx`: heading "Đã thêm vào ngân hàng"/"Đã lưu bản nháp" (dòng 52-54); dòng 56: "«title» chưa được giao lớp. Giao bài tập ở trang Lớp học khi cần."; bảng meta gồm `["Giao lớp", "Chưa giao"]` (dòng 64); nút "Tạo đề khác" + link "Mở trang Lớp học" → `/classes` (dòng 73-81).

---

## 2. Class detail page — nơi chứa flow giao bài

### 2.1. Files trong `apps/web/src/routes/_auth/classes/`
- `index.tsx` (149 dòng) — list lớp.
- `$classId.tsx` (287 dòng) — detail.

### 2.2. Cấu trúc `$classId.tsx`
- Route dòng 32-48 (notFoundComponent dòng 34-47).
- `ClassDetailRoute` dòng 50: `runOccurrenceWrite` (dòng 61-83) — wrapper dispatch + toast (`occurrenceSummary`) + refresh cho committed/unknown; 3 handler occurrence dòng 85-104.
- Data: `useClasses().classById(classId)` (dòng 105, 111); `syllabusById`, `studentById`, `data` từ `useData()` (dòng 106); `useDirectKernelAction()` → `run/isPending/busy` (dòng 107).
- State dòng 108-110: `tab` (default "roster"), `addStudentOpen`, `notes`.
- Roster: `cls.studentIds.map(studentById)` (dòng 117-119); lessons theo classId dòng 120-122 / 234.
- Layout: header Card (dòng 130-155) — tên lớp + Tag type + classMeta + schedule + startDate, nút duy nhất **"+ Thêm học viên"** (dòng 150-154, mở `AddStudentModal`); 4 StatCard (dòng 157-168): học viên / buổi đã học / tiến độ / bài trong syllabus.
- **Tabs dòng 170-178: `roster` ("Học viên"), `sessions` ("Buổi học"), `notes` ("Ghi chú") — KHÔNG có tab bài tập/giao bài.**
  - roster tab dòng 180-214: DataTable Học viên/Mục tiêu/Còn lại/Trạng thái, row click → student detail.
  - sessions tab dòng 216-247: `CurriculumManagementSection` (dòng 218-227, collapsible) + `ClassScheduleTable` (dòng 232-244) với callbacks occurrence.
  - notes tab dòng 249-277: Textarea + `run("class-notes", { type: "update-class-notes", ... })`.
- Modal duy nhất: `AddStudentModal` dòng 279-284 với `key={add-student-${cls.id}}` (reset state khi đổi lớp).

### 2.3. Quan hệ dữ liệu
- Lớp ↔ học viên: qua `enrollment`; web-side `ClassGroup.studentIds` **derive từ enrollments** trong mapper `apps/web/src/lib/repos/classes.ts:24-58` (`rosterByClass` dòng 25-30; `studentIds` dòng 58; `sessionsDone` derive từ completed lessons dòng 32-60).
- Lớp ↔ assignment: **không tồn tại** — `assignment` không có classId; chưa có chỗ nào join assignment theo lớp.
- Học viên ↔ assignment: `assignment.studentId` → UI `Assignment.sid` (mapper `apps/web/src/lib/repos/assignments.ts:14-26`); student detail có tab "Bài tập" (`apps/web/src/routes/_auth/students/$studentId.tsx:122-131` tab id `assign`, label "Bài tập"; bảng assignment dòng 234-270).

### 2.4. Placeholder "giao bài"
- **Không có UI giao bài nào trong class detail** (grep `giao|assign` toàn web src: chỉ có text copy ở assignments components — `bank-context-card.tsx:35,39`, `create-success-card.tsx:56,64`, `new.tsx:150,155,159,179`, `student-preview-paper.tsx:52` — toàn bộ là copy tĩnh "Chưa giao lớp / Giao ở trang Lớp học", không phải control).
- Placeholder cũ `AddAssignmentModal` (redirect sang /classes // /students) **đã bị xóa** trong commit `e96394f` (81 dòng removed, `apps/web/src/components/modals/add-assignment-modal.tsx`).

---

## 3. Assignments list page & routing

### 3.1. `apps/web/src/routes/_auth/assignments/index.tsx` (140 dòng)
- Route `/_auth/assignments/` dòng 13-15; component nhận prop `initialFilter` (dòng 30-34, dùng cho test).
- `FILTERS = ["Tất cả", "Chưa nộp", "Trễ", "Đã chấm"]` dòng 17; `STATUS_MAP` dòng 18-22.
- `statusBadge` dòng 24-28 (Badge success/danger/warn).
- Pending count dòng 39-41; lọc dòng 43-46.
- PageHead "Bài tập" + lead "N bài tập · M cần xử lý" dòng 50-53.
- Hàng điều khiển dòng 54-59: `ChipFilter` + **Button "+ Tạo bài tập" → `navigate({ to: "/assignments/new" })` (dòng 56-58)** — CTA này đã trỏ tới trang mới sau #202.
- Empty state dòng 60-84: `data-testid="assignments-empty-state"` (dòng 64), heading "Chưa có bài tập nào", copy "Bài tập được đồng bộ từ lớp học hoặc theo từng học viên…", 2 CTA "Quản lý lớp học" / "Quản lý học viên".
- Filter-empty dòng 85-90: "Không có bài tập nào phù hợp với bộ lọc."
- DataTable dòng 92-135: headers `["Bài tập","Học viên","Loại","Hạn","Trạng thái","Band"]`; row click → `/assignments/$assignmentId`; join student qua `data.students.find(st => st.id === a.sid)` (dòng 103); Band = `averageBand(a.scores).toFixed(1)` hoặc "—".
- **List hiện tại chỉ render `data.assignments` (grading rows) — không render `data.assignmentPrompts` (bank) ở đâu ngoài sidebar trang new.**

### 3.2. Routing
- `apps/web/src/routes-matcher.ts`: `VALID_EXACT_ROUTES` dòng 4-18 — có `"/assignments"` (dòng 13) và `"/assignments/new"` (dòng 14, thêm ở #202); `VALID_DYNAMIC_PREFIXES` dòng 23-28 — `"/assignments/"`, `"/classes/"`, `"/students/"`, `"/syllabus/"`; logic `isValidAppRoute` dòng 96-120 (dynamic sub-route không được chứa `/` thêm — chú ý: một route mới dạng `/assignments/bank` sẽ hợp lệ prefix, còn `/assignments/bank/x` sẽ không).
- Test: `apps/web/src/routes-matcher.test.ts:24` có `"/assignments"`.
- `apps/web/src/components/layout/app-shell.tsx`: `routeTitles` dòng 9-26 — `"/_auth/assignments": "Bài tập"` (dòng 16), `"/_auth/assignments/$assignmentId": "Bài tập"` (dòng 17), **`"/_auth/assignments/new": "Tạo bài tập"` (dòng 18)**. Title lấy từ match cuối (`useCurrentTitle` dòng 28-35).
- Sidebar nav: `apps/web/src/components/layout/sidebar.tsx:89` có link `/assignments`.
- `apps/web/src/routeTree.gen.ts` là file **sinh tự động, không track trong git** (untracked); bản trên đĩa hiện chỉ có Index + `$assignmentId` (dòng 21-22) — route `/assignments/new` được Vite plugin generate lại khi dev; mọi route mới chỉ cần đặt file vào `routes/_auth/...`.

### 3.3. Detail `apps/web/src/routes/_auth/assignments/$assignmentId.tsx` (157 dòng)
- Route dòng 11-29 (notFoundComponent). `assignmentById` (dòng 33-34), `GradeModal` state dòng 35-36.
- Header Card (dòng 63-85): avatar student, title, `{student?.name} · {assignment.type} · Hạn nộp: {assignment.due}` (dòng 70); nếu có scores → band trung bình lớn, nếu không → nút "Chấm bài" mở `GradeModal`.
- Rubric 4 tiêu chí (dòng 87-108) khi có scores.
- Textarea nhận xét + "Gửi cho học viên"/"Lưu nháp" (dòng 110-127) — **local state only, không persist**; "Ngân hàng nhận xét" = `data.commentBank` click để append (dòng 128-147).
- `GradeModal` (`apps/web/src/components/modals/grade-modal.tsx`): 4 input điểm 0-9 step 0.5 (dòng 174-218), Textarea nhận xét, dispatch `grade-assignment` (dòng 94-98) rồi `add-comment-bank` với operationId UUID (dòng 114-141, dedupe map `unresolvedCommentOps` dòng 17), KernelSubmitNotice + reconcile (dòng 151-165, 234-240).

---

## 4. Patterns để tái sử dụng

### 4.1. List page + filter chips
Ba instance giống hệt nhau:
- Assignments: `apps/web/src/routes/_auth/assignments/index.tsx:17-46,54-59` (ChipFilter + useState filter + STATUS_MAP).
- Classes: `apps/web/src/routes/_auth/classes/index.tsx:21-25,36-43,48-51` (FILTERS "Tất cả/Trực tuyến/Trực tiếp/Đang học" + MODE_MAP).
- Students: `apps/web/src/routes/_auth/students/index.tsx:19-25,46-52` (FILTERS + FILTER_TAGS map nhiều tag).
- Cấu trúc chung: `PageHead` → hàng `ChipFilter` + Button action → empty-state Card (có `data-testid`) → filter-empty Card → Card + `DataTable` (rows có `onClick` navigate).

### 4.2. Modal + form (useKernelFormSubmit)
- Hook `apps/web/src/lib/use-kernel-form-submit.ts:18-92`: `run(action)` → chỉ trả result khi `refreshed` (dòng 27-55); `definite-failure` → error VN string; committed/unknown → `notice` chặn submit lại (`submitBlocked` dòng 25); `reconcile()` (dòng 57-72); `reset()` (dòng 77-80).
- Modal pattern tiêu biểu: `AddStudentModal` (`apps/web/src/components/modals/add-student-modal.tsx`) — dùng trong class detail; có 2 mode "Học viên có sẵn"/"Tạo học viên mới" (dòng 235-255), search input + listbox chọn học viên (dòng 258-295, role="listbox"/"option", aria-selected), package fields validate strict (dòng 112-136), submit dispatch `enroll-student`/`add-student` (dòng 139-178), `KernelSubmitNotice` (dòng 335-341), reset khi open/classId đổi (dòng 72-79).
- Modal trực tiếp không qua hook: `GradeModal` (self-managed saving/notice).
- Non-modal action: `useDirectKernelAction` (`apps/web/src/lib/use-direct-kernel-action.ts:24-60`) — `run(key, action, successText)` + toast; dùng cho notes/curriculum/schedule ở class detail.
- Consumers của `useKernelFormSubmit`: AddStudentModal, AddClassModal, AddInvoiceModal, AddSyllabusModal, CreateReportModal, AddModuleModal, AddLessonModal, EditLessonModal, EditModuleModal, ImportSyllabusModal (grep trong `apps/web/src/components/modals/`) + trang `new.tsx`.

### 4.3. Chuỗi command đầy đủ (ví dụ chuẩn — create-assignment-prompt)
1. **Zod contract**: `packages/api/src/contracts.ts:271-282` (`assignmentPromptCreateSchema` .strict()).
2. **Schema + migration**: `packages/db/src/schema/assignment-prompt.ts:12-32`; `packages/db/src/migrations/0017_wet_jetstream.sql` (generate bằng `pnpm --filter db db:generate`).
3. **Snapshot collection**: `apps/server/src/routes/snapshot.ts:162-166` (select) + `:283-295` (map) + contract `KernelSnapshot` `packages/api/src/contracts.ts:616`.
4. **POST route**: `apps/server/src/routes/assignments/index.ts:60-72` (mount qua `kernel.ts:1893`).
5. **KernelAction type**: `apps/web/src/lib/data-actions.ts:42-56`.
6. **kernelCommand map**: `apps/web/src/lib/repos/kernel.ts:162-168`.
7. **Reducer fixture**: `apps/web/src/lib/data-store-reducer.ts:81-85` (case inert — return state).
8. **Mapper**: `apps/web/src/lib/repos/assignment-prompts.ts:5-19` + `mapKernelSnapshot` `apps/web/src/lib/repos/kernel.ts:236`; UI type `apps/web/src/lib/mock-data.ts:49-59,167,182`; empty default `apps/web/src/lib/kernel-state.ts:8`.
9. **UI dispatch**: `apps/web/src/routes/_auth/assignments/new.tsx:104-131` qua `useKernelFormSubmit`.
10. **Refresh sau mutation**: không invalidate thủ công — command bus tự `refetchQueries({ queryKey: ["kernel"], exact: true, type: "all" }, { throwOnError: true })` sau mỗi POST (`apps/web/src/lib/data-provider.tsx:93-97`; bus `apps/web/src/lib/repos/kernel.ts:526-529`). Reconcile path: `refresh()` dòng 561-575.

### 4.4. Test patterns
- **Server (vitest)**: `apps/server/src/kernel.test.ts:4046-4153` — describe "assignment prompt bank (issue #202)": POST ready persist + snapshot (4069-4091), draft (4093-4111), 400 matrix 8 case (4113-4131), 401 (4133-4139), org-scoping A/B (4141-4152). Helper: `createTestApp()`, `t.insertUser()`, `t.call(path, { session, method, body })`, `t.kernel(session)`.
- **Component (SSR renderToStaticMarkup)**: `apps/web/src/routes/_auth/assignments/new.test.tsx:1-108` — mock `@tanstack/react-router` (dòng 44-50), mock `@/lib/data-store` (dòng 51-53), mock `@/lib/use-kernel-form-submit` (dòng 54-56); assert chuỗi HTML. Tương tự `index.test.tsx:1-137` (empty state dòng 57-71, DataTable dòng 73-111, filter-empty dòng 112-131, "#202 CTA" dòng 133-136).
- **Mapper unit test**: `apps/web/src/lib/repos/assignment-prompts.test.ts:6-57` (snapshot cast `as unknown as KernelSnapshot`; unknown status → draft).
- **E2E**: `apps/e2e/specs/assignment-prompt-create.spec.ts` (từ #202) — 2 test: ready prompt (dòng 9-44: signUpViaUi → goto /assignments → click "+ Tạo bài tập" → assert URL `/assignments/new` → fill "Tiêu đề"/"Nội dung đề" → click "Lưu vào ngân hàng" → heading "Đã thêm vào ngân hàng" → "Tạo đề khác" → đề hiện trong "Đề đã có" + Tag "Sẵn sàng" → reload vẫn còn) và draft (dòng 46-63). Helpers: `signUpViaUi` (`apps/e2e/specs/helpers.ts:9-25`), `openClassScheduleTab` (dòng 30-37), date helpers VN (dòng 41+).
- **E2E class-detail modal mẫu**: `apps/e2e/specs/enroll-existing-student.spec.ts:1-60+` (flow tạo student → tạo lớp → class detail → "+ Thêm học viên" → dialog role="dialog" → picker → assert roster).

---

## 5. Flow assignment (grading) hiện tại end-to-end

- **Schema**: `packages/db/src/schema/assignment.ts:19-44` (như mục 1.1 — studentId bắt buộc, không create endpoint).
- **Snapshot**: `apps/server/src/routes/snapshot.ts:157-161` (select), `:272-280` (map sang KernelAssignmentRow).
- **UI list**: `/assignments` (mục 3.1) — lọc theo status "Chưa nộp/Trễ/Đã chấm"; detail (mục 3.3) — rubric + GradeModal; student detail tab "Bài tập" (`$studentId.tsx:234-270`).
- **POST duy nhất**: `POST /api/assignments/:id/grade` (`apps/server/src/routes/assignments/index.ts:77-97`) — chỉ set scores + status graded. **Không có POST tạo assignment, không có POST đổi trạng thái nộp bài.**
- **Khái niệm có sẵn hôm nay**:
  - "Due date": CÓ ở dạng text display — `assignment.due` (default ""), contract ghi rõ "Display-formatted dd/mm text, like every other date on the wire" (`packages/api/src/contracts.ts:518-519`) — không có math ngày, không ISO như invoice.due.
  - "Submission status": CÓ dạng enum hẹp `"not-submitted" | "late" | "graded"` (schema dòng 32, mock-data `AssignmentStatus` dòng 80, filter "Chưa nộp/Trễ/Đã chấm") — nhưng không có endpoint nào đổi not-submitted → late/submitted; trạng thái chỉ đổi qua grade.
  - **Student submission (học viên nộp bài): KHÔNG tồn tại** — không có bảng/text submission, không upload, comment feedback chỉ là local state ở detail page + comment bank.
- Dữ liệu grading rows trong dev/test chỉ vào qua test helper inserts hoặc server-side flows (schema docblock dòng 14-18).

---

## 6. docs/project-roadmap.md — M5 & assignment

- Dòng 94-106: **M5 "Ổn định & quyết định"** — trạng thái "Chưa bắt đầu". Dòng 100: "CHƯA DÙNG ĐƯỢC tại M5: feature mới theo quyết định (ứng viên đầu: assignment create, report create, settings persist — chỉ thêm nếu pilot chứng minh blocker)". DOD M5 (dòng 102-106): fix pilot blocker, metrics, decision record — **không có item nào nói riêng về giao bài/assignment bank**.
- Dòng 85 (M4): "Tạo assignment, tạo/gửi report, settings persist đã lên production (release 0.0.4, 2026-09-18)".
- Dòng 115: "Cuối M5 có quyết định mở rộng/lặp pilot/đổi hướng kèm top 3 blockers".
- Grep "giao bài" trong docs/project-roadmap.md: **0 kết quả**.

---

## Phụ lục: sự thật rải rác có liên quan

- `KernelAssignmentRow.due` là dd/mm display; `KernelInvoiceRow.due` là ISO yyyy-mm-dd (contract dòng 551-559 comment so sánh) — nếu flow giao bài cần due-date math, tiền lệ chuẩn là ISO kiểu invoice + `parseStartDateStrict` (server, `apps/server/src/routes/kernel.ts:1353-1354` dùng cho invoice).
- `apps/web/src/lib/global-search.ts` không index assignmentPrompts (chỉ thêm 1 dòng test fixture trong #202); không có search bank.
- `emptyKernelData` có `assignmentPrompts: []` (`apps/web/src/lib/kernel-state.ts:8`).
- Grading modal reset-on-reopen precedent: `grade-modal.tsx:53-73` (useEffect theo `[open, assignmentId]`); AddStudentModal reset theo `[open, classId]` + host `key` (`$classId.tsx:280`).
- Snapshot ordering: `assignmentPrompts` orderBy `asc(createdAt), asc(id)` (`snapshot.ts:166`) — "Đề đã có" lấy 5 mới nhất bằng `slice(-5).reverse()` client-side (`bank-context-card.tsx:28`).
- Toast library: `sonner` (import ở `$classId.tsx:8`).
- UI primitives: `Modal` (`@/components/ui/modal`), `Field/Input/Textarea/Select` (`@/components/ui/field`), `ChipFilter`, `DataTable`, `Badge`, `Tag`, `PageHead`, `SectionLabel`, `Card/StatCard`, `Tabs`, `Progress`.
- Commit xóa modal placeholder: `e96394f` — `apps/web/src/components/modals/add-assignment-modal.tsx` (81 dòng, redirect-only placeholder).
