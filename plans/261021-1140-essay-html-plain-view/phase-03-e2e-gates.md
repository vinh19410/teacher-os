---
phase: 3
title: "E2E case essay HTML + toàn bộ gate repo"
status: pending
priority: P1
effort: "1h"
---

# Phase 3: E2E case essay HTML + toàn bộ gate repo

## Goal

Khoá hành vi end-to-end trên trình duyệt thật khi `quiz_attempt.essay` được seed
dạng HTML `<p>…</p>`: cả màn chấm giáo viên lẫn màn kết quả học viên không hiện
thẻ `<p>`, đếm từ đúng theo plain text, và highlight + ghi chú inline hiển thị
đúng từ đã bôi đen.

## Files to Create or Modify

- Modify: `apps/e2e/specs/teacher-essay-annotations.spec.ts`

## Tasks & Steps

### Task 3.1 — Thêm test e2e cho essay lưu dạng HTML `<p>…</p>`

- **Goal:** Spec `teacher-essay-annotations.spec.ts` có test khoá trọn vòng
  giáo viên highlight → chấm điểm → học viên xem bài khi essay trong DB là HTML
  `<p>…</p>` có entity `&amp;`.
- **Target files and symbols:** `apps/e2e/specs/teacher-essay-annotations.spec.ts`
  (`beforeAll` và `test.describe("Teacher essay annotations (#332)")`).
- **Steps:**
  1. Giữ nguyên hoàn toàn `ESSAY` plain text và 2 test hiện có (không sửa, không
     xoá, không nới bất kỳ `expect` nào).
  2. Trong `test.beforeAll`:
     - Thêm prompt Writing thứ 2 vào mảng `prompts` của `seedQuizFixture` (vì
       bảng `quiz_attempt` có unique index trên `(assignment_id, student_id)`):
       ```ts
       {
       	title: "Writing ghi chú HTML: remote learning",
       	skill: "writing",
       	part: "task2",
       	type: "opinion",
       	note: "",
       	passage: "",
       	prompt: "<p>Discuss the impact of remote learning.</p>",
       	questions: [],
       }
       ```
     - Seed `htmlAttemptId = await seedSubmittedEssay({ orgId, assignmentId: fixture.assignmentIds[1] ?? "", studentId: fixture.studentId, essay: "<p>Remote learning has widened the gap between rich &amp; poor students.</p><p>Teachers need better tools.</p>" });`
       (plain text có 11 từ câu 1 tính cả `&` + 4 từ câu 2 = **15 từ**).
  3. Thêm test thứ 3 `"renders HTML-wrapped essay (<p> tags) as clean text with aligned highlights (#382)"`:
     - Giáo viên mở `${WEB_ORIGIN}/grading/${htmlAttemptId}`:
       - `await expect(teacherPage.getByTestId("essay-text")).toBeVisible();`
       - `await expect(teacherPage.getByTestId("essay-text")).not.toContainText("<p>");`
       - `await expect(teacherPage.getByTestId("essay-word-count")).toContainText("15 từ");`
       - Gọi `await selectEssayText(teacherPage, "widened");`, điền
         `#annotation-note` = `"Động từ chuẩn."`, bấm `"Lưu highlight"`.
       - `await expect(markNth(teacherPage, 1)).toHaveText("widened");`
     - Chấm điểm attempt qua `POST ${API_ORIGIN}/api/grading/${htmlAttemptId}/grade`
       với `{ scores: { task: 7, coherence: 7, lexical: 7, grammar: 7 }, feedback: "Bài tốt." }`
       (`expect(gradeRes.status()).toBe(200)`).
     - Mở context học viên mới (`const studentContext = await browser.newContext(); const studentPage = await studentContext.newPage();`),
       gọi `await signIn(studentPage);` rồi `await studentPage.goto(`${STUDENT_ORIGIN}/learn/quizzes/attempt/${htmlAttemptId}`);`
       (đóng `studentContext` trong `finally`):
       - `await expect(studentPage.getByTestId("essay-frame")).not.toContainText("<p>");`
       - `await expect(studentPage.getByTestId("essay-summary-count")).toHaveText("15 từ");`
       - `await expect(markNth(studentPage, 1)).toHaveText("widened");`
       - `await expect(studentPage.locator('mark[data-n="1"] + [data-testid="essay-inline-note"]')).toContainText("Động từ chuẩn.");`
- **Success criteria:** Cả 3 test trong `teacher-essay-annotations.spec.ts` đều
  pass trên Chromium thật.
- **Verify:** `cd apps/e2e && E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm exec playwright test specs/teacher-essay-annotations.spec.ts --reporter=line`
  exits 0 and prints `3 passed`.

### Task 3.2 — Chạy toàn bộ gate kiểm tra của repo

- **Goal:** Đảm bảo format/lint, typecheck, và unit tests của toàn bộ các gói
  liên quan đều xanh trước khi vào bước review & ship.
- **Target files and symbols:** toàn worktree (`packages/api`, `packages/ui`,
  `apps/server`, `apps/web`, `apps/student`, `apps/e2e`).
- **Steps:**
  1. Chạy `pnpm check` để Biome format + lint toàn repo.
  2. Chạy `pnpm check-types` để kiểm kiểu toàn monorepo.
  3. Chạy unit tests của `packages/api`, `apps/server`, `apps/web`, `apps/student`.
- **Success criteria:** Mọi lệnh thoát với exit code 0.
- **Verify:** `pnpm check && pnpm check-types && pnpm --filter @teacher-os/api test && pnpm --filter server test && pnpm --filter web test && pnpm --filter student test`
  exits 0.

## Verification

- `cd apps/e2e && E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm exec playwright test specs/teacher-essay-annotations.spec.ts --reporter=line` exits 0 (`3 passed`).
- `pnpm check && pnpm check-types && pnpm --filter @teacher-os/api test && pnpm --filter server test && pnpm --filter web test && pnpm --filter student test` exits 0.

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
