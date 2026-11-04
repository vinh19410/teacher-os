---
phase: 2
title: "Phase 2: Server/Student Integration Proof, E2E & UI Verification"
status: completed
priority: P1
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Server/Student Integration Proof, E2E & UI Verification

## Goal

Khóa bằng integration test server + E2E Playwright trọn luồng từ tạo đề có `explanation` của giáo viên (kể cả gõ phím trực tiếp và bấm `"Cập nhật đề"` ở Full-Test Builder) tới màn làm bài và soi bài chi tiết của học viên, đồng thời hoàn thành kiểm chứng 3 viewport + 2 theme + `pnpm design:compare` và cập nhật `CHANGELOG.md`.

## Files to Create / Modify

- Modify: `apps/server/src/routes/student-quiz-explanation.test.ts`
- Modify: `apps/e2e/specs/assignment-prompt-create.spec.ts`
- Modify: `CHANGELOG.md`

## Tasks & Steps

### Task 2.1 — Integration test đầu-cuối API: Giáo viên tạo/PATCH prompt có `explanation` → Giao lớp → Học viên làm & xem `/detail`
<!-- Updated: Red Team RT-4 -->
- Goal: Chứng minh trực tiếp trên Hono app + SQLite thật rằng payload từ composer (`POST /api/assignments/prompts` và `PATCH /api/assignments/prompts/:id`) lưu `explanation`, trả lại qua `GET /api/kernel` snapshot cho giáo viên, ẩn hoàn toàn ở `GET /api/student/assignments/:id/quiz` khi `in_progress`, và trả đúng `explanation` ở `GET /api/student/attempts/:attemptId/detail` sau khi nộp.
- Target files: `apps/server/src/routes/student-quiz-explanation.test.ts`.
- Steps:
  1. Đọc cấu trúc `buildApp` và seed DB trong `apps/server/src/routes/student-quiz-explanation.test.ts`.
  2. Tạo `describe("teacher prompt create/PATCH -> student quiz take & detail round-trip (#571)", ...)` với fixture đầy đủ trong cùng `org-1`:
     - Cấu hình `corsOrigin: ["http://localhost:8001", "http://localhost:8003"]` và `getSessionUser` phân biệt `x-test-user: "teacher"` (`role: "teacher"`) với `"student"` (`role: "student"`).
     - Seed `user` + `membership` (`orgId: "org-1"`, `role: "teacher"`) cho giáo viên (để `bootstrapMiddleware` nhận đúng `org-1` thay vì tạo org mới) và seed `enrollment` (`orgId: "org-1"`, `classId: "class-1"`, `studentId: "student-1"`, `status: "active"`).
     - Giáo viên gọi `POST /api/assignments/prompts` (`Origin: "http://localhost:8001"`, `skill: "reading"`, `part: "p1"`, `type: "tfng"`, `questions[0]` mang `explanation: "<p>Đoạn 1 dòng 4 chứng minh FALSE.</p>"`).
     - Giáo viên gọi `PATCH /api/assignments/prompts/:id` (payload không có `skill`/`part`) cập nhật `explanation` sang `"<p>Đoạn 1 dòng 5 chứng minh FALSE (đã cập nhật).</p>"` và kiểm tra `GET /api/kernel` trả đúng `assignmentPrompts[0].questions[0].explanation`.
     - Giáo viên giao đề cho `class-1` (`POST /api/classes/class-1/assignments`), học viên gọi `POST /api/student/assignments/:assignmentId/quiz/start` rồi `GET /api/student/assignments/:assignmentId/quiz` (`Origin: "http://localhost:8003"`) → toàn bộ text JSON KHÔNG chứa chuỗi `"chứng minh FALSE"` và không có key `"explanation"`.
     - Học viên gọi `POST /api/student/attempts/:attemptId/submit`, sau đó gọi `GET /api/student/attempts/:attemptId/detail` → `questions[0].explanation` bằng đúng `"<p>Đoạn 1 dòng 5 chứng minh FALSE (đã cập nhật).</p>"`.
- Success criteria: Test integration mới chạy xanh cùng toàn bộ suite `apps/server`.
- Verify: `pnpm --filter server test -- student-quiz-explanation.test.ts` exits 0.

### Task 2.2 — E2E Playwright: Gõ giải thích thật ở `/assignments/new` → Sửa ở Full-Test Builder → Học viên (context riêng) làm bài & xem giải thích
<!-- Updated: Red Team RT-1, RT-2, RT-9 -->
- Goal: Kiểm chứng trên trình duyệt thật rằng giáo viên gõ giải thích bằng bàn phím thật ở `/assignments/new` không làm đổi đáp án đã khóa, xem trước mô phỏng thấy giải thích, bấm `"Cập nhật đề"` trong Full-Test Builder lưu thành công, và học viên ở browser context độc lập thấy giải thích sau khi nộp bài (nhưng không thấy khi đang làm bài).
- Target files: `apps/e2e/specs/assignment-prompt-create.spec.ts`.
- Steps:
  1. Thêm test E2E mới trong `apps/e2e/specs/assignment-prompt-create.spec.ts` (nhận `{ page, browser }`, import `orgIdForTeacherEmail`, `verifyStudentEmailFromMailLog` từ `./helpers`, `STUDENT_ORIGIN` từ `./origins`, và `seedQuizFixture` hoặc tạo lớp/giao bài):
     - Giáo viên đăng ký (`const teacherEmail = await signUpViaUi(page)`), mở `/assignments/new`, chọn kỹ năng `Reading`, điền `Tiêu đề`, `Đoạn đọc`, điền câu 1 (`Nội dung câu hỏi phía học viên`), bấm chip `Câu 1: FALSE`.
     - Click vào `page.getByLabel("Giải thích câu 1", { exact: true })` và dùng `.pressSequentially("Đoạn 1 nói rõ thông tin này sai.")` (chuỗi có cả chữ `n` và `t` để khóa cứng chống lỗi `handleKeyDown` lật đáp án `FALSE` sang `NOT GIVEN`/`TRUE`!) → kiểm tra chip `Câu 1: FALSE` vẫn đang active (`aria-pressed="true"`).
     - Bấm `Xem trước` → chuyển sang tab `Làm thử & Soi bài` → xác nhận màn hình take KHÔNG hiện `"Đoạn 1 nói rõ thông tin này sai."` → bấm `Nộp bài` → bấm mở `Giải thích` → thấy `"Đoạn 1 nói rõ thông tin này sai."` → bấm `Quay lại soạn đề` → ô `Giải thích câu 1` vẫn giữ nguyên nội dung → bấm `Lưu vào ngân hàng`.
     - Mở `/assignments/tests/new`, bấm `Chọn từ ngân hàng` cho `Passage 1` và chọn đề vừa tạo, sau đó bấm `Chỉnh sửa` trên slot `Passage 1` → xác nhận ô `Giải thích câu 1` hiển thị `"Đoạn 1 nói rõ thông tin này sai."`, sửa thành `"Đoạn 1 nói rõ thông tin này sai (bản cập nhật)."`, bấm `Cập nhật đề` → composer đóng lại không báo lỗi.
     - Seed lớp + học viên active thuộc cùng `orgId` (`await orgIdForTeacherEmail(teacherEmail)`) bằng `seedQuizFixture` (hoặc tạo lớp + giao đề vừa cập nhật qua UI `/classes`), rồi mở `const studentCtx = await browser.newContext()` (đóng trong `finally` để không đụng cookie `localhost` với giáo viên!): đăng ký tài khoản học viên tại `${STUDENT_ORIGIN}/login` trùng email đã seed, xác thực qua `verifyStudentEmailFromMailLog`, mở bài tập vừa giao → xác nhận trước khi nộp KHÔNG có chuỗi giải thích trên trang → nộp bài → bấm `Xem giải thích chi tiết` → bấm `Giải thích` ở Câu 1 → thấy `"Đoạn 1 nói rõ thông tin này sai (bản cập nhật)."`.
  2. Chạy cả spec `assignment-prompt-create.spec.ts` và spec 40 câu `assignment-test-create.spec.ts` để xác nhận không hồi quy hiệu năng/selector.
- Success criteria: Cả hai spec E2E chạy pass hoàn toàn trên bộ port E2E chuẩn (`8100/8101/8103`).
- Verify: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e -- assignment-prompt-create.spec.ts assignment-test-create.spec.ts` exits 0.

### Task 2.3 — Kiểm chứng UI 3 viewport + Light/Dark theme + `pnpm design:compare`
<!-- Updated: Red Team RT-10 -->
- Goal: Đảm bảo ô `Giải thích câu {n}` trong composer giáo viên đạt chuẩn `DESIGN.md` và `REVIEW.md` ở cả 3 viewport (`1440×900`, `768×1024`, `375×812`) và 2 theme (sáng/tối), chụp screenshot phục vụ PR, và chạy `pnpm design:compare` không để bẩn ảnh tracked ngoài phạm vi.
- Target files: lưu ảnh kiểm chứng của `#571` tại thư mục tạm hoặc đính kèm báo cáo theo quy ước repo; không commit thay đổi nhiễu vào `plans/261020-1446-378-redesign-design-v2/screenshots/`.
- Steps:
  1. Dùng Playwright kiểm chứng `/assignments/new` (kỹ năng Reading với ô `Giải thích câu 1`) ở `1440×900`, `768×1024`, `375×812` + reflow `320px` (cả light và dark): kiểm tra `document.documentElement.scrollWidth <= window.innerWidth`, kiểm tra Tab focus ring vào editor giải thích, chụp screenshot làm bằng chứng.
  2. Chạy `pnpm design:compare` và xác nhận thoát 0; sau khi chạy xong, kiểm tra `git status` — nếu script ghi đè các ảnh compose/verdict đã tracked trong `plans/261020-1446-378-redesign-design-v2/screenshots/` của các màn không đổi thiết kế thì `git checkout -- plans/261020-1446-378-redesign-design-v2/screenshots/` để giữ diff PR sạch.
- Success criteria: Không tràn ngang ở mọi viewport, focus hoạt động đúng, `pnpm design:compare` thoát 0 và working tree sạch ảnh ngoài phạm vi.
- Verify: `pnpm design:compare` exits 0.

### Task 2.4 — Cập nhật `CHANGELOG.md` (mục ngày `## 2026-11-04`) và chạy toàn bộ local quality gates
<!-- Updated: Red Team RT-10 -->
- Goal: Ghi nhận bản sửa lỗi `#571` vào mục `## 2026-11-04` → `### Fixed` trong `CHANGELOG.md` bằng tiếng Việt theo đúng precedent của repo, rồi chạy trọn bộ gate chất lượng trước khi review/ship.
- Target files: `CHANGELOG.md`.
- Steps:
  1. Mở `CHANGELOG.md`, thêm 1 dòng dưới `## 2026-11-04` → `### Fixed` mô tả việc bật ô giải thích đáp án từng câu trong `PromptComposer` (`apps/web`), sửa bắt nhầm phím tắt trong `AnswerKeyGrid` và lỗi `PATCH` khi cập nhật đề ở Full-Test Builder, bảo toàn `explanation` qua draft/mô phỏng preview và kiểm tra trần 2000 ký tự (`#571`).
  2. Chạy đầy đủ bộ gate local: `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`.
- Success criteria: Mọi lệnh kiểm tra toàn repo pass 100%, `git status --short` chỉ chứa đúng các file thuộc phạm vi kế hoạch.
- Verify: `pnpm exec biome check . && pnpm check-types && pnpm test` exits 0.

## Verification

- `pnpm --filter server test -- student-quiz-explanation.test.ts` exits 0
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e -- assignment-prompt-create.spec.ts assignment-test-create.spec.ts` exits 0
- `pnpm design:compare` exits 0
- `pnpm exec biome check . && pnpm check-types && pnpm test` exits 0

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
