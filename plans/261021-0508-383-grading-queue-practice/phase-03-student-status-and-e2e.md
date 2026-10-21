---
phase: 3
title: "Phase 3: Nhãn 'Chờ chấm' phía học viên, E2E, Visual Check & Docs"
status: pending
priority: P1
effort: "1.5h"
dependencies: [1, 2]
---

# Phase 3: Nhãn `'Chờ chấm'` phía học viên, E2E, Visual Check & Docs

<!-- Updated: Validation & Red-Team Session 1 - scoped E2E locators, Task 3.4 viewport/theme verification, Task 3.5 CHANGELOG + system-architecture docs -->

## Goal

Đổi nhãn trạng thái bài Writing/Speaking tự luyện chưa chấm ở Lịch sử học viên (`/history`) và catalog Luyện tập (`/practice/$skill`) về `'Chờ chấm'`, bổ sung E2E test kiểm chứng toàn luồng từ lúc học viên nộp bài Writing tự luyện tới khi giáo viên chấm điểm trong hàng chờ Luyện tập và học viên xem điểm + nhận xét trong Lịch sử, kiểm chứng giao diện `/grading` ở 3 viewport × 2 theme + 320px theo `REVIEW.md`, và cập nhật tài liệu hệ thống.

## Files to Create / Modify

- Modify: `apps/student/src/components/history/history-list.tsx`
- Modify: `apps/student/src/components/history/history-list.test.tsx`
- Modify: `apps/student/src/components/practice/skill-catalog.tsx`
- Modify: `apps/student/src/components/practice/practice-catalog.test.tsx`
- Modify: `apps/e2e/specs/teacher-grade-submission.spec.ts`
- Modify: `CHANGELOG.md`
- Modify: `docs/system-architecture.md`

## Tasks & Steps

### Task 3.1 — Cập nhật unit tests phía `apps/student` cho nhãn `'Chờ chấm'` (TDD Red Phase)
- **Goal:** Cập nhật test của `HistoryList` và `SkillCatalog` để yêu cầu hiển thị `'Chờ chấm'` cho bài Writing/Speaking tự luyện chưa chấm.
- **Target files and symbols:**
  - `apps/student/src/components/history/history-list.test.tsx`: test `"vẽ dòng entry: ngày dd/mm, điểm, phút, chip trạng thái"`.
  - `apps/student/src/components/practice/practice-catalog.test.tsx`: thêm test cho card Writing/Speaking có `lastAttempt` ở trạng thái chưa chấm.
- **Steps:**
  1. Trong `apps/student/src/components/history/history-list.test.tsx` (dòng 91–106), đổi assertion từ `expect(screen.getByText("Đã nộp — tự luyện")).toBeTruthy()` sang kiểm tra cả hai dòng (`practice` và `assignment` đang `awaiting`) đều hiển thị chip `"Chờ chấm"` (`expect(screen.getAllByText("Chờ chấm")).toHaveLength(2)`) và không còn `"Đã nộp — tự luyện"`.
  2. Trong `apps/student/src/components/practice/practice-catalog.test.tsx`, thêm test case: khi `item.skill === "writing"` (hoặc `"speaking"`) có `lastAttempt: { status: "submitted", score: null, submittedAt: "..." }`, card hiển thị nhãn `"Lần gần nhất"` và giá trị `"Chờ chấm"`.
- **Success criteria:** Chạy unit test của `apps/student` thất bại tại 2 assertion vừa cập nhật (Red phase).
- **Verify:** `pnpm --filter student test -- src/components/history/history-list.test.tsx src/components/practice/practice-catalog.test.tsx` thoát với exit code khác `0` (Red phase).

### Task 3.2 — Cập nhật `history-list.tsx` và `skill-catalog.tsx` hiển thị `'Chờ chấm'` (TDD Green Phase)
- **Goal:** Xóa nhánh tạm `'Đã nộp — tự luyện'` trong `history-list.tsx` và hiển thị `'Chờ chấm'` trên card `skill-catalog.tsx` cho bài Writing/Speaking tự luyện chưa chấm.
- **Target files and symbols:**
  - `apps/student/src/components/history/history-list.tsx`: component `StatusTag`.
  - `apps/student/src/components/practice/skill-catalog.tsx`: component `TestCard`.
- **Steps:**
  1. Trong `apps/student/src/components/history/history-list.tsx`, sửa `StatusTag`:
     - Bỏ biến `isPracticeAwaiting`.
     - Khi `isAwaiting` (`entry.status === "awaiting"`), luôn dùng class `"bg-primary text-primary-foreground"` và hiển thị `STATUS_LABELS[entry.status]` (`"Chờ chấm"`).
  2. Trong `apps/student/src/components/practice/skill-catalog.tsx`, sửa `TestCard`:
     - Tính `const isAwaitingGrade = (item.skill === "writing" || item.skill === "speaking") && item.lastAttempt?.status === "submitted" && score === null;`.
     - Nhãn bên trái thanh tiến độ: `item.lastAttempt?.status === "graded" ? "Điểm chấm" : isAwaitingGrade ? "Lần gần nhất" : "Kết quả tốt nhất"`.
     - Giá trị bên phải thanh tiến độ: `isAwaitingGrade ? "Chờ chấm" : (score ?? "—")`.
- **Success criteria:** Unit tests `history-list.test.tsx` và `practice-catalog.test.tsx` vượt qua.
- **Verify:** `pnpm --filter student test -- src/components/history/history-list.test.tsx src/components/practice/practice-catalog.test.tsx` thoát với exit code `0` và in `passed`.

### Task 3.3 — Bổ sung kịch bản E2E chấm bài Writing tự luyện qua hàng chờ `/grading`
- **Goal:** Mở rộng `apps/e2e/specs/teacher-grade-submission.spec.ts` để kiểm chứng đầu-cuối: học viên nộp bài Writing tự luyện → Lịch sử học viên hiện `'Chờ chấm'` → giáo viên mở mục nav `'Chấm bài'` (`/grading`), lọc `'Luyện tập'`, bấm `'Chấm bài'` → chấm 4 tiêu chí + nhận xét → học viên mở Lịch sử thấy `'Đã chấm'`, `'Band X.X'` và bấm `'Xem nhận xét'` thấy điểm cùng nhận xét.
- **Target files and symbols:**
  - `apps/e2e/specs/teacher-grade-submission.spec.ts`: thêm seed đề Writing `assignment_test` (`status='ready'`) trong `beforeAll` và thêm `test("student submits practice writing → teacher grades from Luyện tập queue → student sees band in history", ...)`.
- **Steps:**
  1. Trong `apps/e2e/specs/teacher-grade-submission.spec.ts`, tạo helper seed một `assignment_test` kỹ năng `writing` (`status='ready'`, gắn prompt Writing Task 2) cho `orgId` của giáo viên (theo mẫu `seedPracticeTest` của `student-history.spec.ts`).
  2. Thêm test case mới trong `test.describe("Teacher grades Writing/Speaking submissions")`:
     - Học viên đăng nhập trong context mới, vào `/practice/writing`, bấm vào card đề Writing tự luyện (`getByTestId("practice-test-card")`), nhập bài viết vào `getByTestId("essay-input")`, chờ autosave (`data-state="saved"`), bấm `Nộp bài` (và xác nhận trong dialog nếu có).
     - Học viên mở `/history`, kiểm tra dòng bài Writing tự luyện vừa nộp (`getByTestId("history-entry-row").filter({ hasText: ... })`) có trạng thái `Chờ chấm` (không phải `Đã nộp — tự luyện`).
     - Giáo viên trên `teacherPage` bấm mục nav `Chấm bài` trong sidebar bằng locator rõ phạm vi `teacherPage.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("link", { name: "Chấm bài", exact: true })` (điều hướng tới `/grading`), bấm chip lọc `Luyện tập` trong group `Nguồn bài` (URL cập nhật `?mode=practice`), thấy dòng bài nộp của học viên với tag `Luyện tập` và trạng thái `Chờ chấm`.
     - Giáo viên bấm link `Chấm bài` trong dòng đó (`row.getByRole("link", { name: /Chấm bài/ })`) → vào `/grading/<attemptId>`, thấy link `← Về hàng chờ chấm`, đặt 4 thanh trượt tiêu chí (`Task Response`, `Coherence & Cohesion`, `Lexical Resource`, `Grammatical Range & Accuracy`), nhập nhận xét và bấm `Lưu điểm`.
     - Giáo viên bấm `← Về hàng chờ chấm` quay lại `/grading?mode=practice`, thấy dòng bài nộp đã đổi sang `Đã chấm · Band ...`.
     - Học viên tải lại `/history`, thấy dòng bài Writing tự luyện hiển thị `Band ...`, trạng thái `Đã chấm`, bấm `Xem nhận xét` mở `writing-review` thấy đúng điểm band và nhận xét của giáo viên.
- **Success criteria:** Spec E2E `teacher-grade-submission.spec.ts` và `student-history.spec.ts` chạy xanh trên cổng `8100–8103`.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e specs/teacher-grade-submission.spec.ts specs/student-history.spec.ts` thoát với exit code `0`.

### Task 3.4 — Kiểm chứng giao diện `/grading` trên 3 viewport × 2 theme + 320px theo `REVIEW.md`
- **Goal:** Kiểm tra thực tế trang `/grading` ở 3 viewport (`1440×900`, `768×1024`, `375×812`) + `320×812` trên cả 2 theme (`light` và `dark`), chụp ảnh minh chứng và xác nhận không tràn ngang (`scrollWidth <= clientWidth`), focus ring rõ ràng.
- **Target files and symbols:**
  - Chụp ảnh vào `plans/reports/screenshots-383-grading-queue/` (hoặc kiểm chứng trực tiếp trong Playwright) cho `/grading` và `/grading?mode=practice`.
- **Steps:**
  1. Khởi chạy hoặc dùng môi trường E2E để mở `/grading` ở `1440×900`, `768×1024`, `375×812`, và `320×812` trong cả `light` và `dark` mode.
  2. Đo `document.documentElement.scrollWidth <= document.documentElement.clientWidth` ở tất cả các tổ hợp, kiểm tra đóng/mở bộ lọc dưới `lg`, và lưu ảnh screenshot minh chứng cho PR.
- **Success criteria:** Tất cả các tổ hợp viewport × theme đều có `scrollWidth <= clientWidth` và ảnh screenshot được lưu đầy đủ.
- **Verify:** Script kiểm tra viewport/theme thoát với exit code `0` và in `ALL_VIEWPORTS_PASS`.

### Task 3.5 — Cập nhật `CHANGELOG.md` và `docs/system-architecture.md`
- **Goal:** Ghi nhận tính năng hàng chờ chấm bài `/grading` (`GET /api/grading`) và đồng bộ nhãn `'Chờ chấm'` vào `CHANGELOG.md` và `docs/system-architecture.md`.
- **Target files and symbols:**
  - `CHANGELOG.md`: thêm mục dưới `### Added` của ngày hiện tại.
  - `docs/system-architecture.md`: dòng 30 (bảng Boundary map mục Teacher grading of Writing/Speaking) cập nhật `/api/grading` (queue) và `/api/grading/:attemptId`.
- **Steps:**
  1. Mở `CHANGELOG.md`, thêm bullet mô tả hàng chờ chấm bài Writing/Speaking (`/grading`, `GET /api/grading`, bộ lọc `Luyện tập` cho `mode='practice'`, bật mục nav `Chấm bài`, và đồng bộ nhãn `'Chờ chấm'` ở Lịch sử học viên — `#383`).
  2. Mở `docs/system-architecture.md` tại dòng 30, bổ sung `GET /api/grading` (queue cho cả `assignment` và `practice`) cạnh `/api/grading/:attemptId`.
- **Success criteria:** `CHANGELOG.md` và `docs/system-architecture.md` phản ánh chính xác thay đổi của `#383`, và `pnpm check && pnpm check-types` xanh.
- **Verify:** `pnpm check && pnpm check-types` thoát với exit code `0`.

## Verification

- `pnpm --filter student test`
- `pnpm --filter web test`
- `pnpm --filter server test`
- `pnpm check && pnpm check-types`
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e specs/teacher-grade-submission.spec.ts specs/student-history.spec.ts`

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