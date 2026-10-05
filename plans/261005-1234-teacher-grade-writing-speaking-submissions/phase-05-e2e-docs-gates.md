---
phase: 5
title: "E2E + docs + gate cuối"
status: completed
priority: P1
effort: "2.5h"
dependencies: [1, 2, 3, 4]
---

# Phase 5: E2E + docs + gate cuối

## Goal
Một spec Playwright chạy trọn vòng trên app thật cho cả Writing và Speaking: học viên nộp bài, giáo viên mở bài từ tab Bài tập, nghe file nói hoặc đọc essay, chấm và lưu, rồi học viên thấy band + nhận xét. Docs và CHANGELOG cập nhật. Toàn bộ gate local xanh.

## Files to Create / Modify
- Modify: `apps/e2e/specs/helpers.ts` (thêm `orgIdForTeacherEmail` có retry, `seedStudent` gọi lại hàm này)
- Modify: `apps/e2e/specs/helpers-quiz.ts` (`seedQuizFixture` nhận `orgId`; thêm `seedSubmittedEssay`)
- Create: `apps/e2e/specs/teacher-grade-submission.spec.ts`
- Modify: `CHANGELOG.md`
- Modify: `docs/system-architecture.md` (bảng ở dòng khoảng 29)
- Modify: `docs/production-release-runbook.md` (danh sách migration ở dòng khoảng 606–612 và bước kiểm cột ở dòng khoảng 649–656)

## Tasks

### Task 5.0 — Ghi dấu file của việc khác
- **Goal:** chứng minh được các bước của phase này (đặc biệt `pnpm check`, vốn chạy `biome check --write`) không đụng vào 3 file thuộc việc lọc trang Bài tập, nằm ngoài phạm vi plan này.
- **Steps:** ở root repo, chạy:
  ```bash
  shasum apps/web/src/components/ui/chip-filter.tsx apps/web/src/routes/_auth/assignments/index.tsx apps/web/src/routes/_auth/assignments/index.test.tsx > /tmp/grading-dirty-before.sha
  ```
- **Success criteria:** file `/tmp/grading-dirty-before.sha` có 3 dòng.
- **Verify:** `wc -l < /tmp/grading-dirty-before.sha` in ra `3`.

### Task 5.1 — Helper seed cho e2e
- **Goal:** seed fixture quiz vào **org của giáo viên vừa đăng ký qua UI**, và seed sẵn 1 attempt Writing đã nộp.
- **Target files and symbols:**
  - `apps/e2e/specs/helpers.ts`: thêm export `orgIdForTeacherEmail`; `seedStudent` (dòng khoảng 101–) gọi lại hàm này.
  - `apps/e2e/specs/helpers-quiz.ts`: `seedQuizFixture` (dòng khoảng 71–), thêm export `seedSubmittedEssay`.
- **Steps:**
  1. `seedQuizFixture`:
     - thêm option `/** Seed vào org có sẵn (org của giáo viên đăng ký qua UI) — bỏ qua insert organization. */ orgId?: string;`;
     - trong thân hàm, đổi `const orgId = crypto.randomUUID();` thành `const orgId = opts.orgId ?? crypto.randomUUID();`;
     - bọc câu `INSERT INTO organization` trong `if (!opts.orgId) { … }`.
     
     Không đổi hành vi khi không truyền `orgId` (spec cũ giữ nguyên).
  2. Trong `apps/e2e/specs/helpers.ts`, tách khối lookup org theo email giáo viên của `seedStudent` (dòng khoảng 120–135) thành hàm export, GIỮ NGUYÊN `withBusyRetry(…, 30)`. Org + membership chỉ được tạo ở request `/api/*` đầu tiên sau khi đăng ký (`apps/server/src/app.ts:106-121`), có thể sau khi URL đã sang `/dashboard`, nên truy vấn một lần rồi throw sẽ flaky. <!-- Updated: Red Team 2026-10-05 -->
     ```ts
     /** Org đầu tiên của giáo viên (bootstrap tạo ở request /api đầu tiên sau
      * đăng ký) — retry tới khi bootstrap xong. */
     export async function orgIdForTeacherEmail(email: string): Promise<string> {
       const client = createClient({ url: `file:${new URL("../local.db", import.meta.url).pathname}` });
       await client.execute("PRAGMA busy_timeout = 5000;");
       try {
         const res = await withBusyRetry(async () => {
           const rs = await client.execute({
             sql: `SELECT m.org_id AS id FROM membership m JOIN user u ON u.id = m.user_id
                   WHERE lower(u.email) = lower(?) ORDER BY m.created_at, m.id LIMIT 1`,
             args: [email],
           });
           if (!rs.rows[0]) throw new Error("no org yet, waiting for bootstrap");
           return rs;
         }, 30);
         return String(res.rows[0]?.id);
       } finally {
         client.close();
       }
     }
     ```
     Trong `seedStudent`, nhánh `teacherEmail` dùng `const orgId = await orgIdForTeacherEmail(teacherEmail)` thay cho truy vấn inline (DRY). Nhánh không có `teacherEmail` giữ nguyên truy vấn `organization` cũ. Kiểm cách `seedStudent` đóng client và chỉnh sao cho không đóng client hai lần.
  3. Trong `helpers-quiz.ts`, thêm `seedSubmittedEssay({ orgId, assignmentId, studentId, essay }): Promise<string>`:
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
     - chép nguyên 2 hàm `signIn(page)` (dòng 105–114) và `openPaper(page, title)` (dòng 118–129) từ spec đó;
     - import `STUDENT_ORIGIN`, `WEB_ORIGIN` từ `./origins`. Mọi `goto` phía giáo viên dùng URL tuyệt đối `${WEB_ORIGIN}/…`, để không phụ thuộc `baseURL` cho context tạo trong `beforeAll`.
     
     `test.describe.configure({ mode: "serial" })`.
  2. **Context riêng cho từng vai.** Session giáo viên và học viên đều là cookie trên `localhost`, khác port nhưng chung cookie jar, nên phải tách context. Giáo viên dùng một context sống suốt spec. Học viên KHÔNG dùng lại context: trang `/login` của portal tự chuyển hướng khi đã có session (`apps/student/src/routes/login.tsx:44-48`), và tab cuối cùng (`signup`) được lưu vào localStorage nên `#signin-email` bị ẩn. Vì vậy mỗi lần học viên đăng nhập phải mở context MỚI, đúng precedent "fresh context → sign-in tab" (`student-quiz-take-review.spec.ts:104`). Biến module: `teacherContext`, `teacherPage`, `fixture`, `writingAttemptId`, `teacherEmail`. <!-- Updated: Red Team 2026-10-05 -->
  3. `test.beforeAll(async ({ browser }) => { … })`, timeout 120s (`test.setTimeout` hoặc tham số beforeAll theo precedent spec cũ):
     1. `teacherContext = await browser.newContext({ baseURL: WEB_ORIGIN }); teacherPage = await teacherContext.newPage(); teacherEmail = await signUpViaUi(teacherPage, { name: "Cô Chấm Bài" });` (`signUpViaUi` từ `./helpers`, dùng `goto("/login")` tương đối nên context cần `baseURL`).
     2. `const orgId = await orgIdForTeacherEmail(teacherEmail);` (import từ `./helpers`).
     3. `fixture = await seedQuizFixture({ orgId, orgName: "unused", className: \`Lớp Chấm ${runToken}\`, studentName: "Học Viên Chấm", studentEmail, prompts: [writingPrompt, speakingPrompt] })`:
        - `writingPrompt`: `title: "Writing chấm: city life"`, `skill: "writing"`, `part: "task2"`, `type: "opinion"` (type hợp lệ của writing task2 theo `packages/api/src/contracts.ts:280`), `note: ""`, `passage: ""`, `prompt: "<p>Some people prefer to live in a big city.</p>"`, `questions: []`;
        - `speakingPrompt`: `title: "Speaking chấm: a place"`, `skill: "speaking"`, `part: "part2"`, `type: "place"`, `cueTopic: "a place you like to visit"`, `cuePoints: "where it is\nwhy you like it"`, `note: ""`, `passage: ""`, `questions: []`.
     4. `writingAttemptId = await seedSubmittedEssay({ orgId, assignmentId: fixture.assignmentIds[0], studentId: fixture.studentId, essay: "Living in a city has many benefits.\nFirst, jobs are plentiful." })`.
     5. Học viên: `const signupContext = await browser.newContext()`, chép nguyên đoạn đăng ký portal + `verifyStudentEmailFromMailLog` từ `student-quiz-take-review.spec.ts` (dòng khoảng 454–478) với `studentEmail` của spec này, rồi `await signupContext.close()`.
  4. `test.afterAll`: đóng `teacherContext`.
  5. **Test 1:** `"teacher grades a submitted writing essay and the student sees band and feedback"`, chữ ký `async ({ browser }) => { … }`.
     1. `await teacherPage.goto(\`${WEB_ORIGIN}/classes/${fixture.classId}?tab=assignments\`);` rồi `await expect(teacherPage.locator("#assigned-list")).toBeVisible();`.
     2. `const row = teacherPage.locator("article.assign-item", { hasText: "Writing chấm: city life" });` rồi `await row.getByRole("link", { name: "Chấm bài" }).click();` và `await expect(teacherPage).toHaveURL(new RegExp(\`/grading/${writingAttemptId}$\`));`.
     3. Expect text `Some people prefer to live in a big city.` hiển thị. `getByTestId("essay-text")` chứa `First, jobs are plentiful.`. `getByTestId("essay-word-count")` chứa `· tối thiểu 250`.
     4. Expect nút "Lưu điểm" disabled. Chọn điểm: `getByLabel("Task Response").selectOption("6")`, `getByLabel("Coherence & Cohesion").selectOption("6.5")`, `getByLabel("Lexical Resource").selectOption("6")`, `getByLabel("Grammatical Range & Accuracy").selectOption("6.5")`. Expect `grade-overall-band` có text `6.5` và nút enable.
     5. `getByLabel` cho textarea nhận xét: dùng `teacherPage.locator("#grade-feedback").fill("Ý rõ ràng.\nCần thêm ví dụ cụ thể.")`. Click "Lưu điểm". Expect `getByTestId("grade-saved")` visible.
     6. Click link "← Về lớp". Expect URL chứa `tab=assignments`, và `row` chứa text `Đã chấm · Band 6.5` (dùng `toContainText`, timeout mặc định; snapshot refetch sau invalidate).
     7. Học viên: `const sc = await browser.newContext(); const sp = await sc.newPage(); await signIn(sp); await sp.goto(\`${STUDENT_ORIGIN}/learn/quizzes/attempt/${writingAttemptId}\`);`. Expect heading `Kết quả chấm của giáo viên`, `getByTestId("grade-band")` có text `6.5`, `getByTestId("grade-feedback")` chứa `Cần thêm ví dụ cụ thể.`, và text `Giáo viên sẽ chấm bài viết của bạn.` có count 0. Cuối test: `await sc.close()`.
  6. **Test 2:** `"teacher plays a submitted speaking file, grades it, and the student sees the result"`, chữ ký `async ({ browser }) => { … }`.
     1. Học viên: `const sc = await browser.newContext(); const sp = await sc.newPage(); sp.on("dialog", (d) => void d.accept()); await signIn(sp); await openPaper(sp, "Speaking chấm: a place");`.
     2. `await sp.getByTestId("media-dropzone-input").setInputFiles({ name: "bai-noi.mp3", mimeType: "audio/mpeg", buffer: SPEAKING_SAMPLE });`. Expect `speaking-media-name` có text `bai-noi.mp3`. Click "Nộp bài". Expect heading "Bài nói của bạn" visible. Lấy `attemptId` từ URL: `const speakingAttemptId = new URL(sp.url()).pathname.split("/").pop()!`.
     3. Giáo viên: `await teacherPage.goto(\`${WEB_ORIGIN}/classes/${fixture.classId}?tab=assignments\`)`; tìm row `article.assign-item` có `hasText: "Speaking chấm: a place"`, click link "Chấm bài". Expect URL `/grading/${speakingAttemptId}`.
     4. Expect text `Describe a place you like to visit` hiển thị (theo cách `SubmissionView` render cue topic). Click button "Nghe bài nói". Expect `teacherPage.locator('audio[src^="blob:"]')` toBeAttached.
     5. Chọn `Fluency & Coherence` = 7, `Lexical Resource` = 7, `Grammatical Range & Accuracy` = 7, `Pronunciation` = 7. Click "Lưu điểm". Expect `grade-saved` visible và `grade-overall-band` có text `7.0`.
     6. Học viên `sp.reload()` (đang ở trang summary). React-query `staleTime` 60s có thể giữ cache cũ, nhưng `reload` là full page load nên cache mới. Expect `grade-band` có text `7.0` và text `Pronunciation` visible. Cuối test: `await sc.close()`.
- **Success criteria:** 2 test pass.
- **Verify:** từ root repo chạy
  ```bash
  E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- teacher-grade-submission
  ```
  Lệnh exits 0 và output có `2 passed`, không có `failed`.

### Task 5.3 — Hồi quy e2e quiz học viên
- **Goal:** sửa `seedQuizFixture` không làm vỡ spec quiz cũ.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- student-quiz-take-review student-class-detail class-assign` exits 0, không có `failed`. Ba spec này dùng `seedQuizFixture`/`seedStudent` (`student-class-detail.spec.ts:42`). <!-- Updated: Red Team 2026-10-05 -->

### Task 5.4 — Docs + CHANGELOG
- **Goal:** ghi lại route mới, migration 0033 và tính năng.
- **Steps:**
  1. `CHANGELOG.md`: dưới mục ngày thực thi (`## YYYY-MM-DD`; nếu chưa có mục ngày hôm đó thì tạo mới trên cùng, theo quy ước ở đầu file), thêm `### Added` với 2 gạch đầu dòng tiếng Việt:
     - "Giáo viên xem và chấm bài Writing/Speaking học viên đã nộp từ tab Bài tập của lớp: trang chấm hiện đề + essay (số từ) hoặc phát file bài nói, chấm 4 tiêu chí IELTS (0–9, bước 0.5) với band tổng tự tính và nhận xét; sửa điểm được bất cứ lúc nào (#319)."
     - "Màn kết quả học viên hiện band, điểm 4 tiêu chí và nhận xét của giáo viên ngay khi được chấm (#319)."
     
  2. `docs/system-architecture.md`: ở dòng bảng về "Speaking submission files" (dòng khoảng 29), bổ sung rằng giáo viên đọc file qua `/api/grading/:attemptId/media`, link thêm `apps/server/src/routes/grading.ts`. Thêm 1 dòng bảng mới: "Teacher grading of Writing/Speaking: `/api/grading/:attemptId` (org-scoped, submitted-only), scores stored on `quiz_attempt.grade_*`, band derived by `ieltsOverallBand`", link tới `apps/server/src/routes/grading.ts` và `packages/api/src/lib/ielts-band.ts`.
  3. `docs/production-release-runbook.md`:
     - thêm mục `**0033**` (tên file thật vừa sinh ở Phase 1) ngay sau mục 0032: "thêm `quiz_attempt.grade_scores` (text JSON nullable), `grade_feedback` (`text DEFAULT '' NOT NULL`), `graded_at` (integer nullable) cho giáo viên chấm bài Writing/Speaking (#319)". Ghi rõ DEPLOY ORDER: migration phải chạy TRƯỚC worker; nếu worker mới lên trước thì mọi trang giáo viên (`loadSnapshot`) và mọi màn làm bài/kết quả học viên (select full `quiz_attempt`) trả 500, trong khi `/readyz` vẫn xanh vì probe không kiểm cột;
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
  2. `shasum -c /tmp/grading-dirty-before.sha` in ra 3 dòng `OK`. Dòng nào khác `OK` nghĩa là formatter đã đụng vào file ngoài phạm vi → Failure Protocol, KHÔNG revert file đó.
  3. `pnpm check-types`
  4. `pnpm --filter @teacher-os/api test`
  5. `pnpm --filter server test`
  6. `pnpm --filter web test`
  7. `pnpm --filter student test`
  8. `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- teacher-grade-submission student-quiz-take-review student-class-detail class-assign`
- **Success criteria:** cả 8 bước đạt.

> **Kết quả thực chạy (2026-10-05):** bước 2 fail 1/3 dòng — `assignments/index.tsx`
> bị biome `--write` reformat (drift format sẵn trên develop, run #318; diff thuần
> format, không đổi logic). Failure Protocol → `kongming` xác nhận GO: giữ nguyên
> trạng thái biome đã format, **exclude khỏi commit** (commit theo path list),
> không revert. 7 bước còn lại exit 0 (api 32, server 522, web 1242, student 237,
> e2e 4 spec 17 pass). Lệnh e2e thực tế dùng filter positional (bỏ `--` vì
> `playwright test -- <filter>` không lọc). Follow-up khuyến nghị: chore commit
> format riêng cho file này trên develop để main CI (biome check read-only) không đỏ.

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
