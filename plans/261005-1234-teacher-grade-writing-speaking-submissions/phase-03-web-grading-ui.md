---
phase: 3
title: "Web giáo viên: trang chấm + nút ở tab Bài tập"
status: pending
priority: P1
effort: "5h"
dependencies: [1, 2]
---

# Phase 3: Web giáo viên — trang chấm + nút ở tab Bài tập

## Goal
Ở tab Bài tập của lớp, giáo viên bấm "Chấm bài" để mở `/grading/$attemptId`. Trang này hiện đề + bài làm (essay hoặc file nói), có form 4 tiêu chí, band tổng tính ngay và ô nhận xét. Bấm Lưu thì ghi điểm, và tab Bài tập đổi tag thành "Đã chấm · Band X".

## Files to Create / Modify
- Create: `apps/web/src/lib/repos/grading.ts`
- Create: `apps/web/src/lib/repos/grading.test.ts`
- Create: `apps/web/src/components/grading/grade-form.tsx`
- Create: `apps/web/src/components/grading/grade-form.test.tsx`
- Create: `apps/web/src/components/grading/submission-media-player.tsx`
- Create: `apps/web/src/components/grading/submission-view.tsx`
- Create: `apps/web/src/components/grading/submission-view.test.tsx`
- Create: `apps/web/src/routes/_auth/grading/$attemptId.tsx`
- Modify: `apps/web/src/lib/mock-data.ts` (`ClassAssignment.targets`, dòng khoảng 97)
- Modify: `apps/web/src/lib/repos/class-assignments.ts` (map 3 field mới)
- Modify: `apps/web/src/components/classes/class-assignments-tab.tsx` (sub-row, dòng khoảng 716–748)
- Modify: `apps/web/src/components/classes/class-assignments-tab.test.tsx`
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` (`validateSearch` + tab khởi tạo)
- Modify: `apps/web/src/routes-matcher.ts` + `apps/web/src/routes-matcher.test.ts`

**KHÔNG sửa** `apps/web/src/routes/_auth/assignments/index.tsx`, `index.test.tsx`, `components/ui/chip-filter.tsx`. Ba file này thuộc việc lọc trang Bài tập, nằm ngoài phạm vi plan.

## Tasks

### Task 3.1 — Type + mapper snapshot
- **Goal:** dữ liệu web có `attemptId`/`gradedAt`/`band` theo target.
- **Target files and symbols:** `apps/web/src/lib/mock-data.ts` (`interface ClassAssignment`), `apps/web/src/lib/repos/class-assignments.ts` (`mapClassAssignments`).
- **Steps:**
  1. Đổi `targets` trong `ClassAssignment` thành:
     ```ts
     targets: Array<{
       studentId: string;
       submittedAt: string | null;
       /** Optional: fixture/mock cũ không có — coi như null. */
       attemptId?: string | null;
       gradedAt?: string | null;
       band?: number | null;
     }>;
     ```
  2. Trong `mapClassAssignments`, map target thành `{ studentId, submittedAt: target.submittedAt ?? null, attemptId: target.attemptId ?? null, gradedAt: target.gradedAt ?? null, band: target.band ?? null }`.
  3. Nếu `class-assignments.test.ts` có assertion `toEqual` trên target, cập nhật expected để có thêm 3 field `null`, hoặc giá trị tương ứng nếu fixture có.
- **Success criteria:** mapper chuyển tiếp 3 field.
- **Verify:** `pnpm --filter web test -- class-assignments` exits 0.

### Task 3.2 — Repo `grading.ts`
- **Goal:** fetch bài nộp, lưu điểm, tải blob media. Lỗi HTTP ném `HttpError(status)` để QueryCache tự `reauth` khi 401.
- **Target files and symbols:** `apps/web/src/lib/repos/grading.ts` (mới), export:
  - `gradingQueryKey(attemptId)`
  - `fetchSubmission`
  - `saveGrade`
  - `fetchSubmissionMediaObjectUrl`
  - `submissionQueryOptions`
- **Steps:**
  1. Theo mẫu `apps/web/src/lib/repos/settings.ts`: `getApiBaseUrl()` lấy từ `./settings` (import lại hàm đã export, không viết bản thứ hai). Mọi request đều `credentials: "include"`.
  2. `export const gradingQueryKey = (attemptId: string) => ["kernel", "grading", attemptId] as const;` (precedent key `["kernel", "settings"]`).
  3. `fetchSubmission(attemptId, baseUrl = getApiBaseUrl(), signal?)`:
     - `GET ${baseUrl}/api/grading/${encodeURIComponent(attemptId)}`;
     - `!res.ok` thì `throw new HttpError(res.status, \`Failed to load submission: ${res.status}\`)` (`HttpError` từ `@/lib/kernel-load-state`);
     - ok thì `teacherSubmissionSchema.parse(await res.json())`.
  4. `saveGrade(attemptId, input: QuizGradeInput, baseUrl = getApiBaseUrl())`:
     - `POST …/api/grading/${id}/grade`, header `Content-Type: application/json`, body `JSON.stringify(input)`;
     - `!res.ok` thì ném `HttpError(res.status, …)`;
     - ok thì `quizAttemptGradeSchema.parse(await res.json())`.
  5. `fetchSubmissionMediaObjectUrl(attemptId, signal?, baseUrl = getApiBaseUrl())`: chép logic `fetchQuizMediaObjectUrl` của student (`apps/student/src/lib/repos/quiz.ts:303-333`), nhưng:
     - URL là `/api/grading/${id}/media`;
     - không có header org;
     - lỗi ném `HttpError(res.status, …)` của web;
     - giữ kiểm `normalizeMediaType` + `QUIZ_MEDIA_TYPES` (import từ `@teacher-os/api/lib/quiz-media` và `@teacher-os/api/contracts`) và dựng `Blob` với đúng type đã kiểm.
  6. `submissionQueryOptions(attemptId, baseUrl = getApiBaseUrl())`:
     - trả `queryOptions({ queryKey: gradingQueryKey(attemptId), queryFn: ({ signal }) => fetchSubmission(attemptId, baseUrl, signal), retry: false })`;
     - `retry: false` vì 404/409/400 là trạng thái cuối, retry chỉ làm chậm thông báo lỗi.
- **Success criteria:** 5 export tồn tại.
- **Verify:** no verification needed (Task 3.3 test bao trùm).

### Task 3.3 — Test repo `grading.test.ts`
- **Goal:** khoá URL, method, credentials, parse và nhánh lỗi.
- **Target files:** `apps/web/src/lib/repos/grading.test.ts`. Mẫu mock fetch: tìm test repo có `vi.stubGlobal("fetch"` hoặc `globalThis.fetch = vi.fn` trong `apps/web/src/lib/repos/*.test.ts` (`grep -ln "fetch" apps/web/src/lib/repos/*.test.ts`) và làm theo.
- **Steps:** viết các case:
  1. `fetchSubmission("att 1", "http://api")` gọi `http://api/api/grading/att%201` với `credentials: "include"`. Payload hợp lệ thì trả object đã parse.
  2. Response 409 thì ném `HttpError` có `status === 409`.
  3. `saveGrade("att-1", { scores: { task: 6, coherence: 6, lexical: 6, grammar: 6 }, feedback: "" }, "http://api")` gửi `POST` có header `Content-Type: application/json` và body đúng JSON; parse `{ scores, band: 6, feedback: "", gradedAt: "2026-10-05T00:00:00.000Z" }`.
  4. `fetchSubmissionMediaObjectUrl` với response `Content-Type: text/html` thì ném lỗi. Không cần test nhánh thành công vì `URL.createObjectURL` không có ở môi trường node.
- **Success criteria / Verify:** `pnpm --filter web test -- repos/grading` exits 0, không có `failed`.

### Task 3.4 — Component `GradeForm`
- **Goal:** form 4 select tiêu chí theo skill, band tổng cập nhật ngay, ô nhận xét, nút Lưu disable tới khi đủ 4 điểm.
- **Target files and symbols:** `apps/web/src/components/grading/grade-form.tsx`, export `GradeForm`.
- **Steps:**
  1. Props: `{ skill: GradableSkill; part: string; initial: QuizAttemptGrade | null; saving: boolean; error: string | null; savedAt: string | null; onSave(input: QuizGradeInput): void }`.
  2. State:
     - `scores: Record<string, string>`, khởi tạo từ `initial?.scores`, mỗi giá trị `String(v)`; không có thì `""` cho mỗi key của `criteriaForSkill(skill)`;
     - `feedback: string`, khởi tạo `initial?.feedback ?? ""`.
  3. Mỗi tiêu chí, theo thứ tự `criteriaForSkill(skill)`:
     - `<Field label={criterionLabel(skill, key, part)}>` bọc đúng MỘT control. `Field` (`apps/web/src/components/ui/field.tsx:17`) tự gắn `label` vào id của control con duy nhất.
     - Control con là `<Select id={\`grade-${key}\`}>` với option đầu `value=""` "—", tiếp theo là 19 option `0, 0.5, …, 9`. Option `value` là `String(n)`, nhãn là `formatBand(n)`.
  4. `complete` = mọi key có giá trị khác `""`. Render đúng cấu trúc:
     ```tsx
     <p>Band tổng <span data-testid="grade-overall-band" aria-live="polite">{complete ? formatBand(ieltsOverallBand(values.map(Number))) : "—"}</span></p>
     ```
     Span `grade-overall-band` CHỈ chứa con số (hoặc "—"), không chứa chữ "Band tổng", vì unit test và e2e so khớp đúng text này. <!-- Updated: Red Team 2026-10-05 -->
  5. `<Field label="Nhận xét cho học viên"><Textarea id="grade-feedback" maxLength={QUIZ_FEEDBACK_MAX} placeholder="Tuỳ chọn…" /></Field>` (`Field` bọc đúng một control nên tự gắn label). Dưới textarea có bộ đếm `{feedback.length}/{QUIZ_FEEDBACK_MAX}`.
  6. Nút submit `<Button type="submit" disabled={!complete || saving}>`: nhãn "Lưu điểm", khi `saving` thì "Đang lưu…". Submit thì gọi `onSave({ scores: Object.fromEntries(keys.map(k => [k, Number(scores[k])])), feedback })`.
  7. `error` khác null thì hiện `<p role="alert" className="text-danger text-sm">{error}</p>`. `savedAt` khác null thì hiện `<p className="text-success text-sm" data-testid="grade-saved">Đã lưu · {fmtWhen(savedAt)}</p>` (`fmtWhen` từ `@/components/assignments/assignment-status`).
- **Success criteria:** component render đúng nhãn theo skill/part.
- **Verify:** no verification needed (Task 3.5 test bao trùm).

### Task 3.5 — Test `grade-form.test.tsx`
- **Goal:** khoá nhãn theo skill, band live, disable/enable, payload `onSave`, điền sẵn khi đã chấm.
- **Target files:** `apps/web/src/components/grading/grade-form.test.tsx`. Dòng đầu là `// @vitest-environment jsdom`, theo mẫu `apps/web/src/components/verify-email-view.test.tsx` (`render`, `screen`, `fireEvent`, `cleanup`).
- **Steps:** viết các case:
  1. Writing `part="task1"` hiện "Task Achievement"; `part="task2"` hiện "Task Response". Speaking hiện "Pronunciation" và không có "Task Response".
  2. Ban đầu nút "Lưu điểm" bị disable và `grade-overall-band` có text "—".
  3. Chọn lần lượt 6, 6.5, 6, 6.5 (`fireEvent.change(select, { target: { value: "6.5" } })`): band thành "6.5" và nút enable.
  4. Click Lưu: `onSave` được gọi đúng 1 lần với `{ scores: { task: 6, coherence: 6.5, lexical: 6, grammar: 6.5 }, feedback: "" }`.
  5. `initial = { scores: { fluency: 7, lexical: 7, grammar: 7, pronunciation: 8 }, band: 7.5, feedback: "Tốt", gradedAt: "…" }` với `skill="speaking"`: các select có value sẵn, band là "7.5", textarea có "Tốt", nút enable.
  6. `error="Không lưu được điểm. Thử lại."` thì có `role="alert"` chứa text đó.
- **Success criteria / Verify:** `pnpm --filter web test -- grade-form` exits 0, không có `failed`.

### Task 3.6 — `SubmissionMediaPlayer` + `SubmissionView`
- **Goal:** khối hiển thị đề + bài làm cho cả 2 skill.
- **Target files and symbols:** `submission-media-player.tsx` (export `SubmissionMediaPlayer`), `submission-view.tsx` (export `SubmissionView`).
- **Steps:**
  1. `SubmissionMediaPlayer({ media, attemptId })`: chép cấu trúc `apps/student/src/components/quiz/quiz-media-player.tsx` (state load/abort/revoke, player audio/video, fallback "Tải file về"), với các thay đổi sau:
     - bỏ prop `localUrl`;
     - gọi `fetchSubmissionMediaObjectUrl`;
     - lỗi 401 thì gọi `reauth()` từ `@/lib/reauth`;
     - `Button` lấy từ `@/components/ui/button`;
     - nhãn nút là "Nghe bài nói" / "Xem bài nói".
     
     Giữ các comment `biome-ignore lint/a11y/useMediaCaption` như bản gốc.
  2. `SubmissionView({ submission }: { submission: TeacherSubmission })` render:
     - **Đề bài:** `SectionLabel` "Đề bài".
       - Writing: `RichTextBody text={submission.prompt.prompt}` (import `@teacher-os/ui/components/assignments/rich-text-body`, precedent ở `class-assignments-tab.tsx:4`). Chỉ khi `ASSIGNMENT_IMAGE_SRC_PATTERN.test(prompt.imageUrl.trim())` (import từ `@teacher-os/api/contracts`, cùng điều kiện `packages/ui/src/components/quiz/quiz-paper.tsx:94-99`) thì thêm `<img src={prompt.imageUrl.trim()} alt="Hình minh hoạ đề Task 1" referrerPolicy="no-referrer" loading="lazy" className="max-h-96 rounded-md border border-line" />`. `referrerPolicy` ngăn URL `/grading/<attemptId>` lộ qua Referer tới host ảnh. <!-- Updated: Red Team 2026-10-05 -->
       - Speaking: nếu `cueTopic !== ""` thì hiện cue card: tiêu đề "Describe {cueTopic}", danh sách `cuePoints.split("\n").filter(Boolean)`. Nếu `prompt.prompt !== ""` thì `RichTextBody` cho câu hỏi Part 1/3.
     - **Bài làm:** `SectionLabel` "Bài làm của học viên".
       - Writing: `<p data-testid="essay-word-count">{countWords(essay)} từ{min ? \` · tối thiểu ${min}\` : ""}</p>`, với `min = WRITING_MIN_WORDS[part]` và `countWords` từ `@teacher-os/api/lib/word-count`. Dưới đó là `<div className="whitespace-pre-wrap …" data-testid="essay-text">`. Essay `trim() === ""` thì hiện "Học viên đã nộp bài trống.".
       - Speaking: `media` khác null thì hiện tên file + `formatMediaSize(size)` (từ `@teacher-os/api/lib/quiz-media`) + `<SubmissionMediaPlayer key={media.uploadedAt} …>`. `media` null thì hiện "Bài này được nộp khi chưa có file bài nói.".
     
     Escape: essay và nhận xét là plain text render qua JSX text node, KHÔNG dùng `dangerouslySetInnerHTML`.
- **Success criteria:** component render cho cả 2 skill.
- **Verify:** no verification needed (Task 3.7 test bao trùm).

### Task 3.7 — Test `submission-view.test.tsx`
- **Goal:** khoá hiển thị essay, số từ, bài trống, cue card, media null, và không render HTML từ essay.
- **Target files:** `apps/web/src/components/grading/submission-view.test.tsx`. Dùng `renderToStaticMarkup` (precedent `class-assignments-tab.test.tsx`). Mock `./submission-media-player` thành component trả `<div data-testid="media-player" />`, vì player dùng `URL.createObjectURL`.
- **Steps:** viết các case:
  1. Writing `part="task2"`, essay `"one two three\nfour"`: markup chứa `4 từ · tối thiểu 250` và `one two three`.
  2. Essay `"<script>alert(1)</script>"`: markup chứa `&lt;script&gt;` và KHÔNG chứa `<script>`.
  3. Essay `"   "`: markup chứa "Học viên đã nộp bài trống.".
  4. Speaking, cue `"a place you like"`, points `"where\nwhy"`: chứa `Describe a place you like`, `<li>where</li>` (hoặc `where` trong `li`), có `data-testid="media-player"`.
  5. Speaking `media: null`: chứa "Bài này được nộp khi chưa có file bài nói.".
- **Success criteria / Verify:** `pnpm --filter web test -- submission-view` exits 0, không có `failed`.

### Task 3.8 — Route `/grading/$attemptId`
- **Goal:** trang chấm hoàn chỉnh: tải bài, lỗi có thông báo, lưu điểm cập nhật cache + snapshot.
- **Target files and symbols:** `apps/web/src/routes/_auth/grading/$attemptId.tsx`, `export const Route = createFileRoute("/_auth/grading/$attemptId")({ component: GradingRoute })`.
- **Steps:**
  0. **Làm trước tiên** (chuyển từ Task 3.10 lên đây, vì link "← Về lớp" ở bước 4 dùng `search={{ tab: "assignments" }}` và typecheck chỉ qua khi route lớp đã có search schema). Trong `apps/web/src/routes/_auth/classes/$classId.tsx`, theo đúng precedent `validateSettingsSearch` ở `apps/web/src/routes/_auth/settings.tsx:39-50`: <!-- Updated: Red Team 2026-10-05 -->
     ```ts
     const CLASS_DETAIL_TABS = ["roster", "sessions", "assignments", "notes"] as const;
     type ClassDetailTab = (typeof CLASS_DETAIL_TABS)[number];
     export function validateClassDetailSearch(search: Record<string, unknown>): { tab?: ClassDetailTab } {
       const tab = search.tab;
       return typeof tab === "string" && (CLASS_DETAIL_TABS as readonly string[]).includes(tab)
         ? { tab: tab as ClassDetailTab } : {};
     }
     ```
     - Thêm `validateSearch: validateClassDetailSearch,` vào options `createFileRoute` (dòng 29).
     - Trong `ClassDetailRoute`: thêm `const search = Route.useSearch();` và đổi `useState("roster")` (dòng 104) thành `useState<string>(search.tab ?? "roster")`. Không đổi `handleTabChange` (URL không cần đồng bộ khi bấm tab).
  1. Trong `GradingRoute`:
     - `const { attemptId } = Route.useParams();`
     - `const { data, error, isPending } = useQuery(submissionQueryOptions(attemptId));`
     - `const queryClient = useQueryClient();`
  2. `isPending` thì render `<Card variant="white">Đang tải bài nộp…</Card>`.
  3. `error` thì chọn thông điệp theo `isHttpError(error) ? error.status : 0` (`isHttpError` từ `@/lib/kernel-load-state`):
     - 404: "Không tìm thấy bài nộp này.";
     - 409: "Học viên chưa nộp bài này.";
     - 400: "Đề này được chấm tự động, không cần chấm tay.";
     - còn lại: "Không tải được bài nộp. Thử tải lại trang.".
     
     Render trong `Card` kèm `Link to="/classes"` "← Về danh sách lớp". 401 đã được QueryCache `reauth` toàn cục, không xử lý thêm.
  4. Có `data` thì render:
     - Header `Card`: tiêu đề `data.title`, dòng meta `font-mono text-meta text-xs`: `{data.student.name} · {data.className} · Nộp {fmtWhen(data.submittedAt)} · Hạn {fmtDue(data.due)}`. Nút `Link to="/classes/$classId" params={{ classId: data.classId }} search={{ tab: "assignments" }}` "← Về lớp".
     - Lưới 2 cột `grid grid-cols-[2fr_1fr] items-start gap-5 max-app:grid-cols-1` (precedent `assignments/$assignmentId.tsx`): cột trái là `<SubmissionView submission={data} />`, cột phải là `<Card variant="white"><SectionLabel>Chấm điểm</SectionLabel><GradeForm key={data.grade?.gradedAt ?? "new"} …/></Card>`.
  5. Lưu dùng `useMutation({ mutationFn: (input) => saveGrade(attemptId, input) })`:
     - `onSuccess(grade)`: `queryClient.setQueryData(gradingQueryKey(attemptId), (old) => old ? { ...old, grade } : old)`; `void queryClient.invalidateQueries({ queryKey: kernelQueryKey, exact: true })` để tab Bài tập thấy tag mới (`kernelQueryKey` từ `@/lib/repos/kernel`); set `savedAt = grade.gradedAt`.
     - `onError(error)`: 401 thì `reauth()`; 409 thì error "Bài chưa ở trạng thái đã nộp — tải lại trang."; còn lại "Không lưu được điểm. Thử lại.".
     - Truyền `saving={mutation.isPending}`, `error`, `savedAt`, `onSave={(input) => mutation.mutate(input)}` vào `GradeForm`.
     - `GradeForm` có `key` theo `gradedAt`, nên sau khi lưu form remount với giá trị mới từ server (không giữ state cũ).
  6. Route tree được sinh bởi plugin khi build. KHÔNG sửa tay `routeTree.gen.ts` (file này không được git track).
- **Success criteria:** route build được; typecheck sinh route `/grading/$attemptId`.
- **Verify:** `pnpm --filter web check-types` exits 0. Lệnh này chạy `vite build && tsc --noEmit`, nên đồng thời sinh lại route tree và typecheck `search={{ tab: "assignments" }}` (route lớp đã có `validateSearch` từ bước 0). Nếu lỗi kiểu "Property 'search' is missing" ở các `<Link to="/classes/$classId">` có sẵn thì đó là fail → Failure Protocol.

### Task 3.9 — Nút ở tab Bài tập
- **Goal:** mỗi target đã nộp đề Writing/Speaking có nút "Chấm bài", hoặc tag "Đã chấm · Band X" kèm link "Xem / sửa điểm".
- **Target files and symbols:** `apps/web/src/components/classes/class-assignments-tab.tsx`, khối `{ca.targets.map((target) => {…})}` ở dòng khoảng 716–748.
- **Steps:**
  1. Trong vòng `classAssignments.map((ca) => …)`, trước `return`, tính `const skill = data.assignmentPrompts?.find((p) => p.id === ca.promptId)?.skill ?? "";` và `const gradable = isGradableSkill(skill);` (`isGradableSkill` từ `@teacher-os/api/lib/ielts-band`). Kiểm tên field collection prompt trong `useData().data`: fixture test dùng `assignmentPrompts`; xác nhận trong `apps/web/src/lib/mock-data.ts`.
  2. Trong `div.flex.items-center.gap-3` của sub-row, sau `<StatusTag tone={sub.tone}>…</StatusTag>`, thêm:
     ```tsx
     {gradable && target.attemptId && (
       target.band != null && target.gradedAt ? (
         <>
           <StatusTag tone="ok">{`Đã chấm · Band ${formatBand(target.band)}`}</StatusTag>
           <Link to="/grading/$attemptId" params={{ attemptId: target.attemptId }}
             className="font-medium text-accent-blue text-xs hover:text-accent-active">
             Xem / sửa điểm
           </Link>
         </>
       ) : (
         <Link to="/grading/$attemptId" params={{ attemptId: target.attemptId }}
           aria-label={`Chấm bài của ${s?.name ?? target.studentId}`}
           className={GRADE_LINK_BUTTON_CLASS}>
           Chấm bài
         </Link>
       )
     )}
     ```
     Khai báo hằng `GRADE_LINK_BUTTON_CLASS` ở đầu file. `apps/web/src/components/ui/button.tsx` không export hàm variant, nên hằng này là class tĩnh chép từ `Button` primary size `sm`: `inline-flex items-center whitespace-nowrap rounded-full bg-accent-blue px-[14px] py-[6px] font-medium text-accent-on text-xs hover:bg-accent-hover focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none`.
  3. Import `Link` đã có sẵn ở dòng 1. Import `formatBand`, `isGradableSkill` từ `@teacher-os/api/lib/ielts-band`.
- **Success criteria:** nút/tag chỉ xuất hiện khi đủ điều kiện.
- **Verify:** no verification needed (Task 3.11 test bao trùm).

### Task 3.10 — SPA route matcher
- **Goal:** worker và vite dev không trả 404 cho `/grading/<id>`. (Phần `validateSearch` của route lớp đã chuyển lên Task 3.8 bước 0.) <!-- Updated: Red Team 2026-10-05 -->
- **Target files and symbols:** `apps/web/src/routes-matcher.ts` (`VALID_DYNAMIC_PREFIXES`), `apps/web/src/routes-matcher.test.ts`.
- **Steps:**
  1. `routes-matcher.ts`: thêm `"/grading/",` vào `VALID_DYNAMIC_PREFIXES`.
  2. `routes-matcher.test.ts`: thêm assertion `expect(isValidAppRoute("/grading/att-123")).toBe(true);`, `expect(isValidAppRoute("/grading")).toBe(false);`, `expect(isValidAppRoute("/grading/a/b")).toBe(false);`, đặt cạnh khối test `/classes/` (dòng khoảng 65).
- **Success criteria:** matcher nhận `/grading/<id>`.
- **Verify:** `pnpm --filter web test -- routes-matcher` exits 0, không có `failed`.

### Task 3.11 — Test tab Bài tập
- **Goal:** khoá 3 trạng thái nút trong sub-row.
- **Target files:** `apps/web/src/components/classes/class-assignments-tab.test.tsx`.
- **Steps:**
  1. Sửa mock `Link` (dòng khoảng 166–172) để thay param vào href: `<a href={props.to.replace("$attemptId", props.params?.attemptId ?? "")} className={props.className}>{props.children}</a>`, với type props thêm `params?: Record<string, string>; className?: string`.
  2. Thêm 1 prompt `p-writing` (skill `"writing"`) vào `testPrompts`, và 1 prompt reading nếu fixture chưa có. Thêm assignment `ca-grade` (promptId `p-writing`) với targets:
     - `st-1`: `submittedAt: "2026-09-20T10:00:00.000Z"`, `attemptId: "att-1"`, `gradedAt: null`, `band: null`;
     - `st-2`: `submittedAt: "2026-09-20T11:00:00.000Z"`, `attemptId: "att-2"`, `gradedAt: "2026-09-21T10:00:00.000Z"`, `band: 6.5`.
     
     Thêm assignment `ca-read` (prompt reading) có target đã nộp, `attemptId: "att-3"`.
  3. Test mới `it("shows grade links only for submitted writing/speaking targets", …)`: render view `list`, assert markup:
     - chứa `href="/grading/att-1"` và text `Chấm bài`;
     - chứa `Đã chấm · Band 6.5` và `href="/grading/att-2"`;
     - KHÔNG chứa `/grading/att-3`.
  4. Đảm bảo các test cũ trong file vẫn pass. Fixture cũ không có 3 field mới thì không hiện nút.
- **Success criteria / Verify:** `pnpm --filter web test -- class-assignments-tab` exits 0, không có `failed`.

### Task 3.12 — Gate phase
- **Steps / Verify:**
  - `pnpm --filter web test` exits 0, không có `failed`.
  - `pnpm --filter web check-types` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
