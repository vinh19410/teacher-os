---
phase: 2
title: "Phase 2: Teacher UI Surfaces & Dashboard Ungraded Selector (TDD)"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Teacher UI Surfaces & Dashboard Ungraded Selector (TDD)

<!-- Updated: Red-Team Session 1 & Validation Session 1 - flip-first & hasValidGradedBand sync, remove sm:shrink-0, remove unused isGradableSkill & add assignmentPrompts dep, single-quoted $studentId test path, exclude legacy unsubmitted from Dashboard -->

## Goal

Hiển thị điểm tự chấm `X/Y` trên panel bài tập của lớp (`ClassAssignmentsTab`) và tab **Bài tập** trang chi tiết học viên (`$studentId.tsx`, đổi nhãn cột `"Band"` → `"Điểm"`), đồng bộ trạng thái flip-first & kiểm chuẩn `band`/`gradedAt` và responsive `640px–1024px`, đồng thời cập nhật chỉ số `"Bài tập chưa có điểm"` trên Dashboard (`dashboard.tsx`, `org-stats-section.tsx`, `dashboard-from-kernel.ts`) chỉ đếm bài tự luận giao lớp đang mở đã nộp chờ chấm.

## Files to Create / Modify

- Modify: `apps/web/src/components/classes/class-assignments-tab.tsx`
- Modify: `apps/web/src/components/classes/class-assignments-tab.test.tsx`
- Modify: `apps/web/src/lib/repos/student-assignments.ts`
- Modify: `apps/web/src/lib/repos/student-assignments.test.ts`
- Modify: `apps/web/src/routes/_auth/students/$studentId.tsx`
- Modify: `apps/web/src/routes/_auth/students/$studentId.test.tsx`
- Modify: `apps/web/src/lib/dashboard-from-kernel.ts`
- Modify: `apps/web/src/lib/dashboard-from-kernel.test.ts`
- Modify: `apps/web/src/components/dashboard/org-stats-section.tsx`
- Modify: `apps/web/src/routes/_auth/dashboard.tsx`
- Modify: `apps/web/src/routes/_auth/dashboard.test.tsx`

## Tasks & Steps

### Task 2.1 — Hiển thị điểm tự chấm trên `ClassAssignmentsTab`, sửa `defaultOpenIds`, đồng bộ flip-first & responsive flex-wrap (TDD)

- **Goal:** Panel bài tập lớp hiển thị `Tự chấm · X/Y` cho bài trắc nghiệm tự chấm thuần (giữ `Đã nộp · trễ hạn` nếu trễ), hiển thị `Trắc nghiệm · X/Y` bên cạnh nút chấm/Band cho bài hybrid, đồng bộ flip-first và `hasValidGradedBand`, không vỡ layout ở `640px–1024px` (gỡ `sm:shrink-0`), ưu tiên mở đúng bài `gradable` chờ chấm tay trong `defaultOpenIds`, và không để lại import thừa `isGradableSkill`.
- **Target files and symbols:**
  - `apps/web/src/components/classes/class-assignments-tab.test.tsx`
  - `apps/web/src/components/classes/class-assignments-tab.tsx` (`TargetGradeActions`, `ClassAssignmentsTab`, `defaultOpenIds`, dòng `.sub-row`)
- **Steps:**
  1. Trong `apps/web/src/components/classes/class-assignments-tab.test.tsx`, thêm bộ test mới cho `#977`:
     - Bài Grammar/Reading tự chấm thuần (`!gradable`) nộp đúng hạn với `correctCount: 3, totalQuestions: 3`: hiện `"Tự chấm · 3/3"`, không hiện link `/grading/...`, không hiện trùng tag `"Đã nộp"` cạnh `"Tự chấm · 3/3"`.
     - Bài tự chấm thuần đạt `correctCount: 0, totalQuestions: 3`: vẫn hiện `"Tự chấm · 0/3"`.
     - Bài tự chấm thuần nộp trễ (`submittedAt` sau hạn `due`) với `correctCount: 2, totalQuestions: 3`: hiện đồng thời `"Đã nộp · trễ hạn"` và `"Tự chấm · 2/3"`.
     - Bài tự chấm thuần đã nộp nhưng thiếu/sai điểm (`correctCount: null, totalQuestions: null` hoặc `0/0` hoặc `4/3`): fallback giữ `"Đã nộp"`, không hiện `"Tự chấm"`.
     - Bài chưa nộp (`submittedAt: null, attemptId: null`) kể cả có giá trị rác `correctCount: 2, totalQuestions: 3`: chỉ hiện `"Chưa nộp"` / `"Chưa nộp · quá hạn"`, tuyệt đối không hiện `"Tự chấm"`.
     - Bài flip-first (`submittedAt: null, attemptId: "att-flip"`, quá hạn):
       - Pure MCQ có `correctCount: 3, totalQuestions: 3`: hiện `"Đã nộp"` (thay vì `"Chưa có bài nộp"`) và `"Tự chấm · 3/3"` (không hiện `"Chưa nộp · quá hạn"`).
       - Hybrid có `correctCount: 2, totalQuestions: 3`, chưa chấm Writing: hiện `"Đã nộp"` (không `"Chưa có bài nộp"` và không `"Chưa nộp · quá hạn"`), `"Trắc nghiệm · 2/3"` và nút `"Chấm bài"`.
     - Bài Writing có `band: 9.5` hoặc `gradedAt: "bad-date"` (không hợp lệ): `TargetGradeActions` hiện nút `"Chấm bài"`, không hiện `"Đã chấm · Band 9.5"`.
     - Bài hybrid (`Grammar + Writing`) đã nộp `correctCount: 2, totalQuestions: 3`: hiện `"Trắc nghiệm · 2/3"` cùng nút `"Chấm bài"` (khi chưa chấm Writing) và cùng `"Đã chấm · Band 6.5"` (khi đã chấm Writing), không dùng chữ `"Tự chấm"` cho bài hybrid.
     - Bài `ca` có `hasGradableTask: true` nhưng `promptId` không có trong `assignmentPrompts` (ca `libraryRef`): vẫn hiện nút `"Chấm bài"`.
     - `defaultOpenIds`: khi có bài tự chấm thuần mới hơn (`createdAt` mới hơn, đã nộp `3/3`) và một bài Writing cũ hơn đã nộp chưa chấm tay → accordion mặc định mở bài Writing chờ chấm tay thay vì bài tự chấm thuần.
  2. Chạy test đỏ xác nhận fail.
  3. Trong `apps/web/src/components/classes/class-assignments-tab.tsx`:
     - Gỡ import `isGradableSkill` khỏi dòng `5` (`@teacher-os/api/lib/ielts-band`, giữ `formatBand, hasGradableTask`).
     - Import `formatObjectiveScore`, `hasValidGradedBand`, `normalizeObjectiveScore` từ `"@teacher-os/api/lib/objective-score"`.
     - Trong `TargetGradeActions` (dòng `85`): thay `if (target.band != null && target.gradedAt)` bằng `if (hasValidGradedBand(target))`.
     - Tạo helper nội bộ `isAssignmentGradable(ca, prompts)`: nếu `typeof ca.hasGradableTask === "boolean"` trả về `ca.hasGradableTask`; ngược lại tra `promptRow = prompts?.find((p) => p.id === ca.promptId)` và trả về `promptRow ? hasGradableTask(promptRow) : false`.
     - Tạo helper nội bộ `isTargetSubmitted(target)`: trả về `target.submittedAt !== null || target.attemptId != null`.
     - Trong `defaultOpenIds` (dòng `143-154`): chỉ tìm `firstPending` trên các `ca` có `isAssignmentGradable(ca, data.assignmentPrompts)` và có target `isTargetSubmitted(t) && !hasValidGradedBand(t)`, đồng thời thêm `data.assignmentPrompts` vào dependency array của `useMemo` (`[classAssignments, assignmentsFocus, data.assignmentPrompts]`).
     - Trong vòng render từng `target` (dòng `364-399`):
       - Thay `className="flex min-w-0 items-center gap-2.5"` (dòng `377`) thành `className="flex min-w-0 items-center gap-2.5 sm:min-w-[10rem]"` và đổi dòng `383` từ `sm:shrink-0` sang `className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-initial sm:justify-end sm:gap-3"` để cụm nhiều tag wrap an toàn ở `640px–1024px`.
       - Tính `const submitted = isTargetSubmitted(target);`, `const objective = submitted ? normalizeObjectiveScore(target.correctCount, target.totalQuestions) : null;`, và `const effectiveSub = submitted && target.submittedAt === null ? { label: "Đã nộp" as const, tone: "ok" as const } : sub;`.
       - Nhãn thời gian (dòng `384-388`): `{target.submittedAt ? fmtWhen(target.submittedAt) : submitted ? "Đã nộp" : "Chưa có bài nộp"}`.
       - Khi `!gradable && objective !== null`:
         - Nếu `effectiveSub.label === "Đã nộp · trễ hạn"`: render `<StatusTag tone="warn">Đã nộp · trễ hạn</StatusTag>` rồi `<StatusTag tone="ok" className="tabular-nums">{`Tự chấm · ${formatObjectiveScore(objective)}`}</StatusTag>`.
         - Ngược lại: render `<StatusTag tone="ok" className="tabular-nums">{`Tự chấm · ${formatObjectiveScore(objective)}`}</StatusTag>`.
       - Khi `!gradable && objective === null`: render `<StatusTag tone={effectiveSub.tone}>{effectiveSub.label}</StatusTag>`.
       - Khi `gradable`: render `<StatusTag tone={effectiveSub.tone}>{effectiveSub.label}</StatusTag>`, nếu `objective !== null` render thêm `<StatusTag tone="neutral" className="tabular-nums">{`Trắc nghiệm · ${formatObjectiveScore(objective)}`}</StatusTag>`, sau đó render `<TargetGradeActions target={target} studentName={s?.name ?? target.studentId} />`.
  4. Chạy lại test xác nhận xanh.
- **Success criteria:** Toàn bộ test cũ + test mới ở `class-assignments-tab.test.tsx` pass, không còn unused import `isGradableSkill`.
- **Verify:**
  - Red (trước bước 3): `CI=1 pnpm --filter web test src/components/classes/class-assignments-tab.test.tsx` exits non-zero với assertion failure (pass là lỗi).
  - Green (sau bước 3): `CI=1 pnpm --filter web test src/components/classes/class-assignments-tab.test.tsx` exits 0 và báo toàn bộ tests passed.

### Task 2.2 — Truyền điểm tự chấm qua `studentAssignmentRows` và render cột `"Điểm"` trên `$studentId.tsx` (TDD)

- **Goal:** Tab **Bài tập** trên `/teacher/students/$studentId` đổi header cột 4 từ `"Band"` → `"Điểm"`, hiển thị điểm tự chấm `X/Y` + trạng thái `"Tự chấm"` / `"Tự chấm · trễ hạn"`, xử lý sạch bài hybrid (kể cả flip-first và sau khi chấm Writing) và giữ nguyên `"5.5"`, `"6.5"`, `"0.0"` cho bài Writing/Speaking thuần.
- **Target files and symbols:**
  - `apps/web/src/lib/repos/student-assignments.test.ts`
  - `apps/web/src/lib/repos/student-assignments.ts` (`StudentAssignmentRow`, `studentAssignmentRows`)
  - `apps/web/src/routes/_auth/students/$studentId.test.tsx`
  - `apps/web/src/routes/_auth/students/$studentId.tsx` (`assignmentRowCells`, `DataTable` headers ở dòng `417`)
- **Steps:**
  1. Viết test đỏ trong `apps/web/src/lib/repos/student-assignments.test.ts`:
     - Truyền tiếp `correctCount`, `totalQuestions`, `hasGradableTask`, `submitted` cho bài tự chấm thuần (`3/3`, `0/3`, `hasGradableTask: false`, `submitted: true`), bài hybrid (`2/3` + `band: 6.5`, `hasGradableTask: true`, `submitted: true`), ca `ca.hasGradableTask: true` khi thiếu `prompt` (`libraryRef`), và bài Writing thuần (`correctCount: null, totalQuestions: null, hasGradableTask: true`).
     - Chuẩn hóa các ca sai chuẩn (`0/0`, `4/3`, âm, số thực, `null` một vế, target chưa nộp `submittedAt: null && attemptId: null`) về `correctCount: null, totalQuestions: null, submitted: false`.
     - Cô lập điểm tự chấm giữa nhiều học viên trên cùng một `classAssignment`; legacy `grading` row trả `correctCount: null, totalQuestions: null, hasGradableTask: false, submitted: false`.
  2. Viết test đỏ trong `apps/web/src/routes/_auth/students/$studentId.test.tsx`:
     - Header cột 4 bảng tab **Bài tập** là `"Điểm"` (không còn `"Band"`).
     - Bài Grammar MCQ `3/3` đúng hạn → cột 4 `"3/3"`, cột 5 `"Tự chấm"`.
     - Bài Grammar MCQ `0/3` đúng hạn → cột 4 `"0/3"`, cột 5 `"Tự chấm"`.
     - Bài Grammar MCQ `2/3` nộp trễ → cột 4 `"2/3"`, cột 5 `"Tự chấm · trễ hạn"`.
     - Bài Grammar MCQ flip-first (`submittedAt: null, attemptId: "att-q-flip", correctCount: 3, totalQuestions: 3`, hạn đã qua) → cột 4 `"3/3"`, cột 5 `"Tự chấm"` (không hiện `"Chưa nộp · quá hạn"`).
     - Bài Hybrid (Grammar + Writing) đã nộp `2/3`, chưa chấm Writing → cột 4 `"2/3"`, cột 5 `"Đã nộp"` (tuyệt đối không `"Tự chấm"`).
     - Bài Hybrid flip-first quá hạn (`submittedAt: null, attemptId: "att-hyb-flip", correctCount: 2, totalQuestions: 3`, chưa chấm Writing) → cột 4 `"2/3"`, cột 5 `"Đã nộp"` (không `"Chưa nộp · quá hạn"`).
     - Bài Hybrid đã nộp `2/3` và đã chấm Writing `band: 6.5` → cột 4 `"Band 6.5 · 2/3"`, cột 5 `"Đã chấm"`.
     - Bài Writing đã chấm (`5.5`, `6.5`, `0.0`), Reading không có điểm (`"—"`, `"Đã nộp"`), và legacy row (`"6.5"`, `"Đã chấm"`) vẫn pass nguyên vẹn.
  3. Chạy test đỏ xác nhận fail.
  4. Cập nhật `apps/web/src/lib/repos/student-assignments.ts`:
     - Import `hasGradableTask` từ `"@teacher-os/api/lib/ielts-band"` và `hasValidGradedBand`, `normalizeObjectiveScore` từ `"@teacher-os/api/lib/objective-score"` (gỡ `isBandStep` nếu không còn dùng trực tiếp để tránh `noUnusedImports`).
     - Bổ sung vào `StudentAssignmentRow`:
       - `submitted: boolean;`
       - `correctCount: number | null;`
       - `totalQuestions: number | null;`
       - `hasGradableTask: boolean;`
     - Trong vòng `data.classAssignments`:
       - `const gradable = typeof ca.hasGradableTask === "boolean" ? ca.hasGradableTask : prompt ? hasGradableTask(prompt) : false;`
       - `const submitted = target.submittedAt !== null || target.attemptId != null;`
       - `const hasGrade = hasValidGradedBand(target);`
       - `const objective = submitted ? normalizeObjectiveScore(target.correctCount, target.totalQuestions) : null;`
       - Gán `submitted`, `correctCount: objective?.correctCount ?? null`, `totalQuestions: objective?.totalQuestions ?? null`, `hasGradableTask: gradable`.
     - Trong vòng `data.assignments`: gán `submitted: false, correctCount: null, totalQuestions: null, hasGradableTask: false`.
  5. Cập nhật `apps/web/src/routes/_auth/students/$studentId.tsx`:
     - Import `formatObjectiveScore`, `hasValidGradedBand`, `normalizeObjectiveScore` từ `"@teacher-os/api/lib/objective-score"` (gỡ `isBandStep` nếu không còn dùng trực tiếp).
     - Đổi dòng `417`: `headers={["Bài tập", "Loại", "Hạn", "Điểm", "Trạng thái"]}`.
     - Trong `assignmentRowCells` nhánh `row.kind === "class"` (dòng `99-129`):
       - `const graded = hasValidGradedBand(row);`
       - `const objective = normalizeObjectiveScore(row.correctCount, row.totalQuestions);`
       - `const effectiveStatus = row.submitted && row.submittedAt === null ? { label: "Đã nộp" as const, tone: "ok" as const } : status;`
       - Cột 4 (`Điểm`):
         - `graded && objective !== null`: `<span className="font-semibold text-primary tabular-nums">{`Band ${formatBand(row.band)} · ${formatObjectiveScore(objective)}`}</span>`
         - `graded`: `<span className="font-semibold text-primary tabular-nums">{formatBand(row.band)}</span>`
         - `objective !== null`: `<span className="font-semibold text-primary tabular-nums">{formatObjectiveScore(objective)}</span>`
         - Ngược lại: `"—"`
       - Cột 5 (`Trạng thái`):
         - `graded`: `<StatusTag tone="ok">Đã chấm</StatusTag>`
         - `objective !== null && !row.hasGradableTask`: `effectiveStatus.label === "Đã nộp · trễ hạn" ? <StatusTag tone="warn">Tự chấm · trễ hạn</StatusTag> : <StatusTag tone="ok">Tự chấm</StatusTag>`
         - Ngược lại: `<StatusTag tone={effectiveStatus.tone}>{effectiveStatus.label}</StatusTag>`
  6. Chạy lại test xác nhận xanh.
- **Success criteria:** Toàn bộ cả 2 file test (`student-assignments.test.ts` và `$studentId.test.tsx`) đều chạy và pass (`Test Files 2 passed`).
- **Verify:**
  - Red (trước bước 4): `CI=1 pnpm --filter web test src/lib/repos/student-assignments.test.ts 'src/routes/_auth/students/$studentId.test.tsx'` exits non-zero với assertion failure trên cả 2 file (pass là lỗi).
  - Green (sau bước 5): `CI=1 pnpm --filter web test src/lib/repos/student-assignments.test.ts 'src/routes/_auth/students/$studentId.test.tsx'` exits 0 và in `Test Files  2 passed (2)`.

### Task 2.3 — Sửa selector `ungradedAssignmentsCount` và `OrgStatsSection` trên Dashboard (TDD)

- **Goal:** Chỉ số `"Bài tập chưa có điểm"` trong khối **Toàn trung tâm** chỉ đếm bài tự luận (`hasGradableTask`) giao lớp đang mở đã nộp chưa chấm hợp lệ (không đếm bảng legacy `not-submitted`/`late`, tuyệt đối không đếm bài trắc nghiệm tự chấm hay bài chưa nộp), kèm dòng phụ `"Writing & Speaking giao lớp chờ chấm"`.
- **Target files and symbols:**
  - `apps/web/src/lib/dashboard-from-kernel.test.ts`
  - `apps/web/src/lib/dashboard-from-kernel.ts` (`ungradedAssignmentsCount`)
  - `apps/web/src/components/dashboard/org-stats-section.tsx` (`OrgStatsSection`)
  - `apps/web/src/routes/_auth/dashboard.tsx` (`DashboardRoute`, dòng `171` và `352-358`)
  - `apps/web/src/routes/_auth/dashboard.test.tsx`
- **Steps:**
  1. Viết test đỏ trong `apps/web/src/lib/dashboard-from-kernel.test.ts` cho `ungradedAssignmentsCount`:
     - Bài trắc nghiệm tự chấm thuần (`grammar`/`reading`/`listening`/`vocabulary`, không có `writing`) đã nộp (`3/3` hoặc chưa có `correctCount`) → KHÔNG đếm (`0`).
     - Bài Writing/Speaking đã nộp chưa chấm trên lớp active cho học viên hợp lệ → ĐẾM (`+1`).
     - Bài có `ca.hasGradableTask: true` (ca `libraryRef` không có trong `assignmentPrompts`) đã nộp chưa chấm → ĐẾM (`+1`).
     - Bài Hybrid (`grammar` + `writing`) đã nộp, có `correctCount: 3, totalQuestions: 3` nhưng chưa có `band`/`gradedAt` → ĐẾM (`+1`); sau khi đã có `band` + `gradedAt` hợp lệ → KHÔNG đếm (`0`).
     - Bài Writing có `band` sai chuẩn (`9.5`) hoặc thiếu `gradedAt` → vẫn ĐẾM là chưa có điểm (`+1`).
     - Bài Writing flip-first (`submittedAt: null, attemptId: "att-1"`, chưa chấm) → ĐẾM (`+1`).
     - Bài Writing chưa nộp (`submittedAt: null, attemptId: null`) → KHÔNG đếm (`0`).
     - Bài Writing thuộc lớp `paused`, hoặc học viên không nằm trong `students` (`demo-student:%`), hoặc không có `ca.hasGradableTask` lẫn `prompt` trong `assignmentPrompts` → KHÔNG đếm (`0`).
     - Bảng legacy `assignments` (chỉ có `"not-submitted" | "late" | "graded"`) KHÔNG được cộng vào `ungradedAssignmentsCount` (`0`).
  2. Viết test đỏ trong `apps/web/src/routes/_auth/dashboard.test.tsx`:
     - Trong kịch bản có 1 bài Grammar MCQ đã nộp (`3/3`), 1 bài Writing đã nộp chưa chấm, 1 bài Writing đã chấm (`6.5`), 1 bài Writing chưa nộp, và 1 dòng legacy `"not-submitted"`: khối `Toàn trung tâm` hiện `"Bài tập chưa có điểm"`, dòng phụ `"Writing & Speaking giao lớp chờ chấm"`, và `data-testid="org-stats-ungraded-count"` có giá trị `"1"`.
     - Khi chỉ có bài Grammar MCQ đã nộp (`3/3`): `org-stats-ungraded-count` bằng `"0"`.
  3. Chạy test đỏ xác nhận fail.
  4. Trong `apps/web/src/lib/dashboard-from-kernel.ts`:
     - Import `hasGradableTask` từ `"@teacher-os/api/lib/ielts-band"`, `hasValidGradedBand` từ `"@teacher-os/api/lib/objective-score"`, và `AssignmentPrompt` từ `"@/lib/mock-data"`.
     - Export `ungradedAssignmentsCount(students, classes, classAssignments, assignmentPrompts)`:
       - Trả `0` nếu `validStudentIds.size === 0`.
       - Dùng `pausedClassIdSet(classes)` và `promptById = new Map(assignmentPrompts.map((p) => [p.id, p]))`.
       - Duyệt `classAssignments`: bỏ qua nếu `pausedIds?.has(ca.classId)`; tính `gradable = typeof ca.hasGradableTask === "boolean" ? ca.hasGradableTask : (() => { const prompt = promptById.get(ca.promptId); return prompt ? hasGradableTask(prompt) : false; })()`; bỏ qua nếu `!gradable`; với mỗi target thuộc `validStudentIds`, đếm nếu `(target.submittedAt != null || target.attemptId != null)` và `!hasValidGradedBand(target)`.
  5. Trong `apps/web/src/routes/_auth/dashboard.tsx`:
     - Import `ungradedAssignmentsCount` từ `"@/lib/dashboard-from-kernel"`.
     - Thay dòng `171` bằng:
       `const ungraded = ungradedAssignmentsCount(data.students, data.classes, data.classAssignments, data.assignmentPrompts);`
  6. Trong `apps/web/src/components/dashboard/org-stats-section.tsx` (dòng `43-50`):
     - Bọc tiêu đề và dòng phụ trong 2 thẻ `<span>` riêng trong `<dt>`:
       ```tsx
       <dt className="text-muted-foreground text-sm">
         <span className="block">Bài tập chưa có điểm</span>
         <span className="mt-0.5 block text-muted-foreground text-xs">
           Writing &amp; Speaking giao lớp chờ chấm
         </span>
       </dt>
       ```
     - Thêm `data-testid="org-stats-ungraded-count"` trên `<dd>` tương ứng.
  7. Chạy lại test xác nhận xanh.
- **Success criteria:** Toàn bộ test ở `dashboard-from-kernel.test.ts` và `dashboard.test.tsx` (gồm test cũ dòng `187`) pass.
- **Verify:**
  - Red (trước bước 4): `CI=1 pnpm --filter web test src/lib/dashboard-from-kernel.test.ts src/routes/_auth/dashboard.test.tsx` exits non-zero với assertion failure (pass là lỗi).
  - Green (sau bước 6): `CI=1 pnpm --filter web test src/lib/dashboard-from-kernel.test.ts src/routes/_auth/dashboard.test.tsx` exits 0 và báo toàn bộ tests passed.

## Verification

- `CI=1 pnpm --filter web test` exits 0 (toàn bộ web unit & component tests).
- `pnpm exec biome check .` exits 0.
- `VITE_SERVER_URL=http://localhost:8000 pnpm check-types` exits 0.

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
