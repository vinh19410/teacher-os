---
phase: 3
title: "Phase 3: Verification Gates, Targeted E2E, Design Compare & Visual POT"
status: completed
priority: P1
effort: "1h"
dependencies: [1, 2]
---

# Phase 3: Verification Gates, Targeted E2E, Design Compare & Visual POT

<!-- Updated: Red-Team Session 1 & Validation Session 1 - part "g1", TEACHER_BASE_URL + SPA nav, AttemptScoreCard selector, timeout 180s, full 18 POT PNGs across 3 viewports x 2 themes, compose design:compare -->

## Goal

Xác minh end-to-end luồng thật từ học viên nộp bài trắc nghiệm tự chấm 3 câu (3/3) đến giáo viên xem kết quả trên cả 3 bề mặt (panel bài tập lớp, tab Bài tập của học viên, khối Toàn trung tâm trên Dashboard), vượt qua toàn bộ gate tĩnh/unit/`design:compare`, và chụp đủ bộ 18 ảnh POT (3 bề mặt × 3 viewport × 2 theme + kiểm tra 320px reflow và keyboard focus theo `REVIEW.md`).

## Files to Create / Modify

- Modify: `apps/e2e/specs/teacher-grade-submission.spec.ts`
- Create (POT screenshots committed on branch for issue #977 comment — 3 bề mặt × 3 viewport × 2 theme = 18 PNGs):
  - `plans/reports/977-class-assignments-{desktop,tablet,phone}-{light,dark}.png` (6 files)
  - `plans/reports/977-student-assignments-{desktop,tablet,phone}-{light,dark}.png` (6 files)
  - `plans/reports/977-dashboard-org-stats-{desktop,tablet,phone}-{light,dark}.png` (6 files)

## Tasks & Steps

### Task 3.1 — Chạy toàn bộ static gate, typecheck và unit/integration tests

- **Goal:** Xác minh toàn bộ package `api`, `server`, `web`, lint/format và typecheck không còn lỗi trước khi chạy E2E.
- **Target files and symbols:** Toàn repo (chỉ kiểm tra đọc-only sau khi format sạch).
- **Steps:**
  1. Chạy `pnpm exec biome check .` (nếu có lỗi format do edit mới, chạy `pnpm check:fix` rồi kiểm tra lại `pnpm exec biome check .`).
  2. Chạy `VITE_SERVER_URL=http://localhost:8000 pnpm check-types`.
  3. Chạy `pnpm --filter @teacher-os/api test && pnpm --filter server test && CI=1 pnpm --filter web test`.
- **Success criteria:** Toàn bộ lệnh trên đều exit 0 với 0 test fail và 0 lỗi Biome/TS.
- **Verify:**
  - `pnpm exec biome check . && VITE_SERVER_URL=http://localhost:8000 pnpm check-types && pnpm --filter @teacher-os/api test && pnpm --filter server test && CI=1 pnpm --filter web test` exits 0.

### Task 3.2 — Bổ sung kịch bản E2E tự chấm 3 câu vào `teacher-grade-submission.spec.ts` và chụp đủ 18 ảnh POT `CAPTURE_POT_ISSUE=977`

- **Goal:** Chứng minh luồng thật học viên nộp bài trắc nghiệm Grammar 3 câu (`part: "g1"`, đúng 3/3) → giáo viên thấy `Tự chấm · 3/3` ở panel bài tập lớp, thấy cột `"Điểm"` = `3/3` + trạng thái `"Tự chấm"` ở tab **Bài tập** trang chi tiết học viên, và khối **Toàn trung tâm** trên Dashboard không đếm bài tự chấm vào `"Bài tập chưa có điểm"`.
- **Target files and symbols:** `apps/e2e/specs/teacher-grade-submission.spec.ts` (`beforeAll` prompts seed + thêm test mới ở cuối `describe` serial)
- **Steps:**
  1. Trong `apps/e2e/specs/teacher-grade-submission.spec.ts` (`beforeAll`, mảng `prompts` dòng `149-171`), thêm prompt thứ 3 dùng đúng catalog Grammar: `skill: "grammar"`, `part: "g1"`, `type: "mcq"`, `title: "Grammar tự chấm: quick check 3 câu"`, gồm 3 câu MCQ có đáp án `A`, `B`, `C`.
     - Lưu ý: không ảnh hưởng test Writing/Speaking cũ vì các test trước lọc chính xác theo tiêu đề `"Writing chấm: city life"` và `"Speaking chấm: a place"`.
  2. Thêm test cuối cùng trong serial describe với `test.setTimeout(process.env.CAPTURE_POT_ISSUE === "977" ? 180_000 : 120_000)`: `"student submits auto-graded MCQ quiz → teacher sees 3/3 in class panel, student Bài tập tab (Điểm column), and Dashboard excludes it from ungraded count (#977)"`:
     - Đăng nhập học viên trên context mới, mở `"Grammar tự chấm: quick check 3 câu"`, chọn đủ 3 đáp án đúng (`A`, `B`, `C`), chờ `getByTestId("save-state")` có `data-state="saved"`, bấm `"Nộp bài"` (đủ 3/3 câu sẽ submit thẳng không mở guard dialog), chờ URL `/learn/quizzes/attempt/`, và xác nhận phía học viên thấy `getByTestId("attempt-correct-count")` = `"3"` và `"trên tổng 3 câu"`.
     - Tạo helper nội bộ `capturePotSurface(page, slug)` (chạy trong `try/finally` reset theme `light` & viewport `1280×720`) khi `process.env.CAPTURE_POT_ISSUE === "977"`: duyệt cả `["light", "dark"]` × `[["desktop", 1440, 900], ["tablet", 768, 1024], ["phone", 375, 812], ["reflow-320", 320, 812]]`, assert `document.documentElement.scrollWidth <= document.documentElement.clientWidth`, và chụp `plans/reports/977-${slug}-${label}-${theme}.png` (bỏ qua chụp file cho `reflow-320` chỉ assert overflow).
     - Trên `teacherPage`:
       a) Mở `${TEACHER_BASE_URL}/classes/${fixture.classId}` (**không** gắn `?tab=assignments` để xác minh luôn hành vi mặc định trên trang lớp): tìm `article.assign-item` chứa `"Grammar tự chấm: quick check 3 câu"`, nếu nút accordion đang `aria-expanded="false"` thì bấm mở (kèm kiểm tra focus + Enter trong nhánh POT), xác nhận hiện `"Tự chấm · 3/3"` và không có link `"Chấm bài"`. Nếu `CAPTURE_POT_ISSUE === "977"`, gọi `capturePotSurface(teacherPage, "class-assignments")` ngay tại đây.
       b) Điều hướng SPA qua `teacherPage.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("link", { name: "Học viên", exact: true }).click()` → bấm dòng `"Học Viên Chấm"` → bấm `role="tab"` `"Bài tập"` (kèm kiểm tra Tab + Enter trong nhánh POT): xác nhận header bảng có `"Điểm"` (không có `"Band"`), dòng `"Grammar tự chấm: quick check 3 câu"` có `td[3] === "3/3"` và `td[4] === "Tự chấm"`, dòng `"Writing chấm: city life"` vẫn giữ `td[3] === "6.5"` và `td[4] === "Đã chấm"`. Nếu `CAPTURE_POT_ISSUE === "977"`, gọi `capturePotSurface(teacherPage, "student-assignments")` ngay tại đây.
       c) Điều hướng SPA qua `teacherPage.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("link", { name: "Tổng quan", exact: true }).click()` (đợi URL `/teacher/dashboard`): xác nhận khối `"Toàn trung tâm"` hiện `"Bài tập chưa có điểm"`, `"Writing & Speaking giao lớp chờ chấm"`, và `getByTestId("org-stats-ungraded-count")` bằng `"0"` (vì Writing và Speaking đã chấm ở 2 test trước, còn bài MCQ tự chấm `3/3` không bị đếm). Nếu `CAPTURE_POT_ISSUE === "977"`, gọi `capturePotSurface(teacherPage, "dashboard-org-stats")` ngay tại đây.
  3. Chạy targeted E2E với port override của `AGENTS.md`:
     `CAPTURE_POT_ISSUE=977 E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/teacher-grade-submission.spec.ts`
  4. Khôi phục các ảnh PNG tracked cũ bị spec `#383` ghi đè (`git checkout -- plans/reports/screenshots-383-grading-queue/`), giữ lại đúng 18 ảnh `plans/reports/977-*.png` mới và mở kiểm tra trực tiếp bằng `read_file` để đảm bảo không ảnh nào trắng/lỗi layout.
- **Success criteria:** Toàn bộ 4 test trong `specs/teacher-grade-submission.spec.ts` pass, 0 overflow ở `320px/375px/768px/1440px` Light & Dark trên cả 3 bề mặt, và đủ 18 ảnh `977-*.png` rõ nét không dính file lịch sử.
- **Verify:**
  - `CAPTURE_POT_ISSUE=977 E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/teacher-grade-submission.spec.ts` exits 0 và in `4 passed`.
  - `git checkout -- plans/reports/screenshots-383-grading-queue/ && git status -s plans/reports/` chỉ liệt kê đúng 18 ảnh `plans/reports/977-*.png`.

### Task 3.3 — Chạy `pnpm design:compare` đối chiếu side-by-side cho `t-dashboard` và `t-class-detail` (`REVIEW.md`)

- **Goal:** Tuân thủ gate `REVIEW.md` với ảnh ghép đối chiếu side-by-side cho `t-dashboard` và `t-class-detail` (lưu ý minh bạch: `design-seed.ts` chỉ tạo bài quiz `in_progress` và `t-student-detail` dừng ở tab `"Hồ sơ"`, nên bằng chứng hình ảnh trạng thái `Tự chấm · 3/3` và cột `"Điểm"` đến từ 18 ảnh POT dữ liệu thật ở Task 3.2).
- **Target files and symbols:** `scripts/design-compare/screens.json` (`t-dashboard`, `t-class-detail`)
- **Steps:**
  1. Chạy `pnpm design:compare --screens t-dashboard,t-class-detail --force` (bỏ `--side app` để sinh ảnh ghép đối chiếu side-by-side theo `REVIEW.md`; không chèn `--` dư trước `--screens` vì pnpm 10 không chấp nhận).
  2. Kiểm tra `git status -s` đảm bảo chỉ giữ thay đổi hợp lệ (khôi phục file compose sinh ra ngoài phạm vi nếu `design:compare` ghi đè ảnh tracked khác không thuộc #977).
- **Success criteria:** `pnpm design:compare --screens t-dashboard,t-class-detail --force` exit 0 và working tree sạch.
- **Verify:**
  - `pnpm design:compare --screens t-dashboard,t-class-detail --force` exits 0 (nếu fail vì race hạ tầng ngoài phạm vi, dừng theo Failure Protocol để hỏi `kongming`).

## Verification

- `pnpm exec biome check .` exits 0.
- `VITE_SERVER_URL=http://localhost:8000 pnpm check-types` exits 0.
- `pnpm --filter @teacher-os/api test && pnpm --filter server test && CI=1 pnpm --filter web test` exits 0.
- `CAPTURE_POT_ISSUE=977 E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/teacher-grade-submission.spec.ts` exits 0 (`4 passed`).
- `pnpm design:compare --screens t-dashboard,t-class-detail --force` exits 0.

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
