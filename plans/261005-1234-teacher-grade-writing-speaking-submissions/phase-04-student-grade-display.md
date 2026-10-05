---
phase: 4
title: "Student: hiện band + nhận xét ở màn kết quả"
status: pending
priority: P1
effort: "1.5h"
dependencies: [1, 2]
---

# Phase 4: Student — hiện band + nhận xét ở màn kết quả

## Goal
Với bài Writing/Speaking đã được chấm, màn kết quả học viên (`/learn/quizzes/attempt/$attemptId`) hiện band tổng, 4 tiêu chí và nhận xét, thay cho dòng "Giáo viên sẽ chấm bài…". Bài chưa chấm giữ nguyên như hiện tại.

## Files to Create / Modify
- Create: `apps/student/src/components/quiz/attempt-grade-card.tsx`
- Modify: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx` (`AttemptSummaryBody`, dòng khoảng 107–171)
- Modify: `apps/student/test/attempt-summary.test.tsx`

## Tasks

### Task 4.1 — Component `AttemptGradeCard`
- **Goal:** một khối read-only hiện kết quả chấm.
- **Target files and symbols:** `apps/student/src/components/quiz/attempt-grade-card.tsx`, export `AttemptGradeCard({ grade, skill, part }: { grade: QuizAttemptGrade; skill: GradableSkill; part: string })`.
- **Steps:**
  1. Render khung `<section aria-labelledby="grade-heading" className="mt-6 rounded-md border border-line bg-bg p-4" data-testid="attempt-grade">`.
  2. Bên trong:
     - `<h2 id="grade-heading" className="font-display font-semibold text-fg">Kết quả chấm của giáo viên</h2>`.
     - Dòng band: `<p className="mt-2"><span className="font-display font-semibold text-3xl text-fg" data-testid="grade-band">{formatBand(grade.band)}</span> <span className="text-muted-fg text-sm">Band tổng</span></p>`.
     - Danh sách `<dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">`. Mỗi key của `criteriaForSkill(skill)` có `grade.scores[key]` khác `undefined` thì render `<dt className="text-muted-fg">{criterionLabel(skill, key, part)}</dt><dd className="font-medium text-fg">{formatBand(grade.scores[key])}</dd>`.
     - `grade.feedback.trim() !== ""` thì render `<h3 className="mt-4 font-medium text-fg text-sm">Nhận xét</h3><p className="mt-1 whitespace-pre-wrap text-[15px] leading-[1.7]" data-testid="grade-feedback">{grade.feedback}</p>`.
     - Dòng cuối: `<p className="mt-3 text-muted-fg text-xs">Chấm lúc {formatVietnamSubmittedAt(grade.gradedAt)}</p>` (`formatVietnamSubmittedAt` từ `@/lib/attempt-format`, có sẵn).
  3. Import `formatBand`, `criteriaForSkill`, `criterionLabel`, type `GradableSkill` từ `@teacher-os/api/lib/ielts-band`, và type `QuizAttemptGrade` từ `@teacher-os/api/contracts`. Nhận xét là plain text render qua JSX text node, KHÔNG dùng `dangerouslySetInnerHTML`.
- **Success criteria:** component compile.
- **Verify:** no verification needed (Task 4.3 test bao trùm).

### Task 4.2 — Nối vào `AttemptSummaryBody`
- **Goal:** nhánh Speaking và Writing hiện `AttemptGradeCard` khi có `summary.grade`.
- **Target files and symbols:** `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx`, function `AttemptSummaryBody`.
- **Steps:**
  1. Đầu hàm, cạnh `const essay = summary.essay ?? null;`, thêm `const grade = summary.grade ?? null;` và `const part = summary.part ?? "";`.
  2. Nhánh Speaking (dòng khoảng 107–146): thay
     ```tsx
     <p className="mt-3 text-muted-fg text-sm">Giáo viên sẽ chấm bài nói của bạn.</p>
     ```
     bằng
     ```tsx
     {grade ? (
       <AttemptGradeCard grade={grade} skill="speaking" part={part} />
     ) : (
       <p className="mt-3 text-muted-fg text-sm">Giáo viên sẽ chấm bài nói của bạn.</p>
     )}
     ```
  3. Nhánh Writing (`if (essay !== null)`, dòng khoảng 148–171): thay tương tự dòng "Giáo viên sẽ chấm bài viết của bạn." bằng `grade ? <AttemptGradeCard grade={grade} skill="writing" part={part} /> : <p …>Giáo viên sẽ chấm bài viết của bạn.</p>`.
  4. Import `AttemptGradeCard` từ `@/components/quiz/attempt-grade-card`. Nhánh tự chấm (score card) giữ nguyên.
  5. Cập nhật JSDoc của `AttemptSummaryBody`: thêm câu "Writing/Speaking đã chấm (`summary.grade`) hiện band + tiêu chí + nhận xét thay dòng chờ chấm."
- **Success criteria:** 2 nhánh rẽ đúng theo `grade`.
- **Verify:** no verification needed (Task 4.3 test bao trùm).

### Task 4.3 — Test `attempt-summary.test.tsx`
- **Goal:** khoá hiển thị khi đã chấm và chưa chấm cho cả 2 skill.
- **Target files:** `apps/student/test/attempt-summary.test.tsx`. Dùng lại mock router và kiểu render (`renderToStaticMarkup`) có sẵn trong file; tìm fixture summary Writing/Speaking đang có trong file để nhân bản.
- **Steps:** viết các case:
  1. Writing đã chấm: `{ …writingSummary, grade: { scores: { task: 6, coherence: 6.5, lexical: 6, grammar: 6.5 }, band: 6.5, feedback: "Tốt.\nCần ví dụ.", gradedAt: "2026-10-05T03:00:00.000Z" }, part: "task1" }`. Markup chứa `Kết quả chấm của giáo viên`, `6.5`, `Task Achievement`, `Coherence &amp; Cohesion`, `Tốt.`, và KHÔNG chứa `Giáo viên sẽ chấm bài viết của bạn.`.
  2. Writing chưa chấm (không có key `grade`): chứa `Giáo viên sẽ chấm bài viết của bạn.` và KHÔNG chứa `Kết quả chấm của giáo viên`.
  3. Speaking đã chấm: `skill: "speaking"`, `media` hợp lệ, `grade` với 4 key speaking, `band: 7`, `feedback: ""`. Markup chứa `7.0`, `Pronunciation`, và KHÔNG chứa `data-testid="grade-feedback"` (nhận xét rỗng thì ẩn).
  4. Feedback `"<b>x</b>"`: markup chứa `&lt;b&gt;x&lt;/b&gt;`.
- **Success criteria / Verify:** `pnpm --filter student test -- attempt-summary` exits 0, không có `failed`.

### Task 4.4 — Gate phase
- **Steps / Verify:**
  - `pnpm --filter student test` exits 0, không có `failed`.
  - `pnpm --filter student check-types` exits 0.

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
