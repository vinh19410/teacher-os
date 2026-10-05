---
phase: 5
title: "E2E + docs + gate cuối"
status: pending
priority: P1
effort: "2.5h"
dependencies: [1, 2, 3, 4]
---

# Phase 5: E2E + docs + gate cuối

## Goal
Một spec Playwright chạy trọn vòng trên app thật cho cả Writing và Speaking: học viên nộp bài, giáo viên mở bài từ tab Bài tập, nghe file nói hoặc đọc essay, chấm và lưu, rồi học viên thấy band + nhận xét. Docs và CHANGELOG cập nhật. Toàn bộ gate local xanh.

## Files to Create / Modify
- Modify: `apps/e2e/specs/helpers-quiz.ts` (`seedQuizFixture` nhận `orgId`; thêm `orgIdForTeacherEmail`, `seedSubmittedEssay`)
- Create: `apps/e2e/specs/teacher-grade-submission.spec.ts`
- Modify: `CHANGELOG.md`
- Modify: `docs/system-architecture.md` (bảng ở dòng khoảng 29)
- Modify: `docs/production-release-runbook.md` (danh sách migration ở dòng khoảng 606–612 và bước kiểm cột ở dòng khoảng 649–656)

## Tasks

### Task 5.0 — Ghi dấu file đang dở của việc khác
- **Goal:** chứng minh được các bước của phase này (đặc biệt `pnpm check --write`) không đụng vào thay đổi chưa commit của người dùng.
- **Steps:** ở root repo, chạy:
  ```bash
  shasum apps/web/src/components/ui/chip-filter.tsx apps/web/src/routes/_auth/assignments/index.tsx apps/web/src/routes/_auth/assignments/index.test.tsx > /tmp/grading-dirty-before.sha
  ```
- **Success criteria:** file `/tmp/grading-dirty-before.sha` có 3 dòng.
- **Verify:** `wc -l < /tmp/grading-dirty-before.sha` in ra `3`.

### Task 5.1 — Helper seed cho e2e
- **Goal:** seed fixture quiz vào **org của giáo viên vừa đăng ký qua UI**, và seed sẵn 1 attempt Writing đã nộp.
- **Target files and symbols:** `apps/e2e/specs/helpers-quiz.ts`: `seedQuizFixture` (dòng khoảng 71–), thêm export `orgIdForTeacherEmail`, `seedSubmittedEssay`.
- **Steps:**
  1. `seedQuizFixture`:
     - thêm option `/** Seed vào org có sẵn (org của giáo viên đăng ký qua UI) — bỏ qua insert organization. */ orgId?: string;`;
     - trong thân hàm, đổi `const orgId = crypto.randomUUID();` thành `const orgId = opts.orgId ?? crypto.randomUUID();`;
     - bọc câu `INSERT INTO organization` trong `if (!opts.orgId) { … }`.
     
     Không đổi hành vi khi không truyền `orgId` (spec cũ giữ nguyên).
  2. Thêm hàm:
     ```ts
     /** Org đầu tiên của giáo viên (bootstrap tạo khi đăng ký) — để seed
      * fixture vào đúng workspace mà UI giáo viên đang xem. */
     export async function orgIdForTeacherEmail(email: string): Promise<string> {
       const db = openDb();
       try {
         const rs = await db.execute({
           sql: `SELECT m.org_id FROM membership m JOIN user u ON u.id = m.user_id
                 WHERE lower(u.email) = lower(?) ORDER BY m.created_at, m.id LIMIT 1`,
           args: [email],
         });
         const orgId = rs.rows[0]?.org_id;
         if (typeof orgId !== "string") throw new Error(`no org for ${email}`);
         return orgId;
       } finally {
         db.close();
       }
     }
     ```
     Dùng lại `openDb()` có sẵn trong file. Nếu `seedQuizFixture` có `PRAGMA busy_timeout` thì thêm câu đó y hệt.
  3. Thêm `seedSubmittedEssay({ orgId, assignmentId, studentId, essay }): Promise<string>`:
     - `INSERT INTO quiz_attempt (id, org_id, assignment_id, student_id, status, questions_snapshot, answers, essay, started_at, submitted_at) VALUES (?,?,?,?, 'submitted', '[]', '{}', ?, ?, ?)`, với `started_at = Date.now() - 600_000` và `submitted_at = Date.now()`;
     - `UPDATE class_assignment_target SET submitted_at = ? WHERE assignment_id = ? AND student_id = ?` với `new Date().toISOString()`;
     - trả `attemptId`.
     
     Đối chiếu tên cột với `packages/db/src/schema/quiz-attempt.ts` và `class-assignment.ts` trước khi viết SQL.
- **Success criteria:** e2e type-check xanh.
- **Verify:** `pnpm --filter e2e check-types` exits 0.

### Task 5.2 — Spec `teacher-grade-submission.spec.ts`
- **Goal:** chứng minh vòng chấm bài chạy thật trên 3 app.
- **Target files:** `apps/e2e/specs/teacher-grade-submission.spec.ts` (mới).
- **Steps:**
  1. Đầu file là JSDoc mô tả luồng. Theo đúng precedent `student-quiz-take-review.spec.ts`:
     - `PASSWORD = "password-8chars"`, `runToken`, `studentEmail`;
     - `SPEAKING_SAMPLE` đọc `../fixtures/speaking-sample.mp3`;
     - chép nguyên 2 hàm `signIn(page)` (dòng 105–114) và `openPaper(page, title)` (dòng 118–129) từ spec đó.
     
     `test.describe.configure({ mode: "serial" })`.
  2. **Hai browser context riêng.** Session giáo viên và học viên đều là cookie trên `localhost`, khác port nhưng chung cookie jar, nên phải tách context. Biến module: `teacherContext`, `teacherPage`, `studentContext`, `fixture`, `writingAttemptId`, `teacherEmail`.
  3. `test.beforeAll(async ({ browser }) => { … })`, timeout 120s (`test.setTimeout` hoặc tham số beforeAll theo precedent spec cũ):
     1. `teacherContext = await browser.newContext(); teacherPage = await teacherContext.newPage(); teacherEmail = await signUpViaUi(teacherPage, { name: "Cô Chấm Bài" });` (`signUpViaUi` từ `./helpers`).
     2. `const orgId = await orgIdForTeacherEmail(teacherEmail);`
     3. `fixture = await seedQuizFixture({ orgId, orgName: "unused", className: \`Lớp Chấm ${runToken}\`, studentName: "Học Viên Chấm", studentEmail, prompts: [writingPrompt, speakingPrompt] })`:
        - `writingPrompt`: `title: "Writing chấm: city life"`, `skill: "writing"`, `part: "task2"`, `type` hợp lệ cho writing task2 (lấy giá trị `type` của prompt writing trong spec cũ), `note: ""`, `passage: ""`, `prompt: "<p>Some people prefer to live in a big city.</p>"`, `questions: []`;
        - `speakingPrompt`: `title: "Speaking chấm: a place"`, `skill: "speaking"`, `part: "part2"`, `type` lấy theo spec cũ, `cueTopic: "a place you like to visit"`, `cuePoints: "where it is\nwhy you like it"`, `note: ""`, `passage: ""`, `questions: []`.
     4. `writingAttemptId = await seedSubmittedEssay({ orgId, assignmentId: fixture.assignmentIds[0], studentId: fixture.studentId, essay: "Living in a city has many benefits.\nFirst, jobs are plentiful." })`.
     5. Học viên: `studentContext = await browser.newContext()`, rồi chép nguyên đoạn đăng ký portal + `verifyStudentEmailFromMailLog` từ `student-quiz-take-review.spec.ts` (dòng khoảng 455–473), dùng `studentEmail` của spec này. Đóng page đó sau khi vào overview.
  4. `test.afterAll`: đóng 2 context.
  5. **Test 1:** `"teacher grades a submitted writing essay and the student sees band and feedback"`.
     1. `await teacherPage.goto(\`/classes/${fixture.classId}?tab=assignments\`);` rồi `await expect(teacherPage.locator("#assigned-list")).toBeVisible();`.
     2. `const row = teacherPage.locator("article.assign-item", { hasText: "Writing chấm: city life" });` rồi `await row.getByRole("link", { name: "Chấm bài" }).click();` và `await expect(teacherPage).toHaveURL(new RegExp(\`/grading/${writingAttemptId}$\`));`.
     3. Expect text `Some people prefer to live in a big city.` hiển thị. `getByTestId("essay-text")` chứa `First, jobs are plentiful.`. `getByTestId("essay-word-count")` chứa `· tối thiểu 250`.
     4. Expect nút "Lưu điểm" disabled. Chọn điểm: `getByLabel("Task Response").selectOption("6")`, `getByLabel("Coherence & Cohesion").selectOption("6.5")`, `getByLabel("Lexical Resource").selectOption("6")`, `getByLabel("Grammatical Range & Accuracy").selectOption("6.5")`. Expect `grade-overall-band` có text `6.5` và nút enable.
     5. `getByLabel` cho textarea nhận xét: dùng `teacherPage.locator("#grade-feedback").fill("Ý rõ ràng.\nCần thêm ví dụ cụ thể.")`. Click "Lưu điểm". Expect `getByTestId("grade-saved")` visible.
     6. Click link "← Về lớp". Expect URL chứa `tab=assignments`, và `row` chứa text `Đã chấm · Band 6.5` (dùng `toContainText`, timeout mặc định; snapshot refetch sau invalidate).
     7. Học viên: `const sp = await studentContext.newPage(); await signIn(sp); await sp.goto(\`${STUDENT_ORIGIN}/learn/quizzes/attempt/${writingAttemptId}\`);`. Expect heading `Kết quả chấm của giáo viên`, `getByTestId("grade-band")` có text `6.5`, `getByTestId("grade-feedback")` chứa `Cần thêm ví dụ cụ thể.`, và text `Giáo viên sẽ chấm bài viết của bạn.` có count 0.
  6. **Test 2:** `"teacher plays a submitted speaking file, grades it, and the student sees the result"`.
     1. Học viên: `const sp = await studentContext.newPage(); sp.on("dialog", (d) => void d.accept()); await signIn(sp); await openPaper(sp, "Speaking chấm: a place");`.
     2. `await sp.getByTestId("media-dropzone-input").setInputFiles({ name: "bai-noi.mp3", mimeType: "audio/mpeg", buffer: SPEAKING_SAMPLE });`. Expect `speaking-media-name` có text `bai-noi.mp3`. Click "Nộp bài". Expect heading "Bài nói của bạn" visible. Lấy `attemptId` từ URL: `const speakingAttemptId = new URL(sp.url()).pathname.split("/").pop()!`.
     3. Giáo viên: `await teacherPage.goto(\`/classes/${fixture.classId}?tab=assignments\`)`; tìm row `article.assign-item` có `hasText: "Speaking chấm: a place"`, click link "Chấm bài". Expect URL `/grading/${speakingAttemptId}`.
     4. Expect text `Describe a place you like to visit` hiển thị (theo cách `SubmissionView` render cue topic). Click button "Nghe bài nói". Expect `teacherPage.locator('audio[src^="blob:"]')` toBeAttached.
     5. Chọn `Fluency & Coherence` = 7, `Lexical Resource` = 7, `Grammatical Range & Accuracy` = 7, `Pronunciation` = 7. Click "Lưu điểm". Expect `grade-saved` visible và `grade-overall-band` có text `7.0`.
     6. Học viên `sp.reload()` (đang ở trang summary). React-query `staleTime` 60s có thể giữ cache cũ, nhưng `reload` là full page load nên cache mới. Expect `grade-band` có text `7.0` và text `Pronunciation` visible.
- **Success criteria:** 2 test pass.
- **Verify:** từ root repo chạy
  ```bash
  E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- teacher-grade-submission
  ```
  Lệnh exits 0 và output có `2 passed`, không có `failed`.

### Task 5.3 — Hồi quy e2e quiz học viên
- **Goal:** sửa `seedQuizFixture` không làm vỡ spec quiz cũ.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- student-quiz-take-review class-assign` exits 0, không có `failed`.

### Task 5.4 — Docs + CHANGELOG
- **Goal:** ghi lại route mới, migration 0033 và tính năng.
- **Steps:**
  1. `CHANGELOG.md`: dưới mục ngày thực thi (`## YYYY-MM-DD`; nếu chưa có mục ngày hôm đó thì tạo mới trên cùng, theo quy ước ở đầu file), thêm `### Added` với 2 gạch đầu dòng tiếng Việt:
     - "Giáo viên xem và chấm bài Writing/Speaking học viên đã nộp từ tab Bài tập của lớp: trang chấm hiện đề + essay (số từ) hoặc phát file bài nói, chấm 4 tiêu chí IELTS (0–9, bước 0.5) với band tổng tự tính và nhận xét; sửa điểm được bất cứ lúc nào (#<issue>)."
     - "Màn kết quả học viên hiện band, điểm 4 tiêu chí và nhận xét của giáo viên ngay khi được chấm (#<issue>)."
     
     Thay `<issue>` bằng số issue trong frontmatter `plan.md`.
  2. `docs/system-architecture.md`: ở dòng bảng về "Speaking submission files" (dòng khoảng 29), bổ sung rằng giáo viên đọc file qua `/api/grading/:attemptId/media`, link thêm `apps/server/src/routes/grading.ts`. Thêm 1 dòng bảng mới: "Teacher grading of Writing/Speaking: `/api/grading/:attemptId` (org-scoped, submitted-only), scores stored on `quiz_attempt.grade_*`, band derived by `ieltsOverallBand`", link tới `apps/server/src/routes/grading.ts` và `packages/api/src/lib/ielts-band.ts`.
  3. `docs/production-release-runbook.md`:
     - thêm mục `**0033**` (tên file thật vừa sinh ở Phase 1) ngay sau mục 0032: "thêm `quiz_attempt.grade_scores` (text JSON nullable), `grade_feedback` (`text DEFAULT '' NOT NULL`), `graded_at` (integer nullable) cho giáo viên chấm bài Writing/Speaking (#<issue>)";
     - ở đoạn kiểm cột sau deploy (dòng khoảng 649–656), thêm câu kiểm `SELECT grade_scores, grade_feedback, graded_at FROM quiz_attempt LIMIT 0`.
- **Success criteria:** 3 file có nội dung mới. Mọi link tương đối trỏ tới file tồn tại.
- **Verify:**
  - `grep -c "/api/grading" docs/system-architecture.md` in ra số ≥ `1`.
  - `grep -c "0033" docs/production-release-runbook.md` in ra số ≥ `1`.
  - `grep -c "chấm 4 tiêu chí IELTS" CHANGELOG.md` in ra số ≥ `1`.

### Task 5.5 — Gate cuối
- **Goal:** toàn repo xanh theo bộ lệnh local trong `AGENTS.md`.
- **Steps:** chạy lần lượt từ root repo. Lệnh nào fail thì dừng ở lệnh đó.
- **Verify** (mỗi lệnh exits 0, không có `failed`/`error` trong tổng kết):
  1. `pnpm check`
  2. `shasum -c /tmp/grading-dirty-before.sha` in ra 3 dòng `OK`. Dòng nào khác `OK` nghĩa là formatter đã đụng vào thay đổi chưa commit của người dùng → Failure Protocol, KHÔNG revert file đó.
  3. `pnpm check-types`
  4. `pnpm --filter @teacher-os/api test`
  5. `pnpm --filter server test`
  6. `pnpm --filter web test`
  7. `pnpm --filter student test`
  8. `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- teacher-grade-submission student-quiz-take-review`
- **Success criteria:** cả 8 bước đạt.

### Task 5.6 — Dọn tiến trình
- **Goal:** không để lại dev server hay e2e server mồ côi (theo rule quản lý tiến trình).
- **Steps:** `lsof -i :8100 -i :8101 -i :8103 -t`. Nếu còn PID do Playwright/boot của phase này để lại thì `kill <pid>` (SIGTERM). KHÔNG kill tiến trình trên 8000/8001/8003, đó là dev stack của người dùng.
- **Verify:** `lsof -i :8100 -i :8101 -i :8103 -t` không in ra gì.

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
