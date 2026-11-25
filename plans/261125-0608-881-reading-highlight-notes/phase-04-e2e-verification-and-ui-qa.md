---
phase: 4
title: "Phase 4: E2E Verification, Visual/Contrast QA & POT"
status: pending
priority: P1
effort: "1.5h"
dependencies: [3]
---

# Phase 4: E2E Verification, Visual/Contrast QA & POT

## Goal

Bổ sung kịch bản Playwright E2E xác minh trọn vòng đời highlight & ghi chú bài đọc trên trình duyệt thật (rich HTML, floating bar, right-click menu, reload persistence, submit → review read-only, 3 viewport & Light/Dark mode), chạy toàn bộ gate cục bộ, và chụp ảnh bằng chứng POT 3 viewport + Light/Dark để đính kèm PR và issue #881.

## Files to Create / Modify

- Create: `apps/e2e/specs/student-reading-highlight-notes.spec.ts`
- Create (POT artifacts): `plans/reports/881-reading-highlight-*.png`

## Tasks & Steps

### Task 4.1 — Add focused Playwright E2E spec `student-reading-highlight-notes.spec.ts`
<!-- Updated: Red-Team RT-13 - use specs/... relative path for pnpm --filter e2e e2e -->
- **Goal**: Kiểm thử đầu-cuối trên Chromium thật toàn bộ luồng tô sáng + ghi chú bài đọc Reading theo yêu cầu issue #881.
- **Target files and symbols**: `apps/e2e/specs/student-reading-highlight-notes.spec.ts`.
- **Steps**:
  1. Tạo spec dùng `seedQuizFixture` (`apps/e2e/specs/helpers-quiz.ts`) tạo 1 đề Reading có rich HTML (`<h2>`, `<p>`, `<strong>`, `<em>`, `<blockquote>`, `<ul><li>`, `<table>`, nhiều đoạn dài).
  2. Kịch bản E2E kiểm chứng:
     - Học viên mở đề Reading → bôi đen cụm từ xuyên thẻ `<strong>` → floating toolbar xuất hiện → bấm `Tô sáng` → `<mark.reading-hl>` hiển thị.
     - Bôi đen cụm từ khác → chuột phải mở context menu → chọn `Ghi chú` → nhập ghi chú tiếng Việt → lưu → icon `<StickyNote>` xuất hiện ngay sau `<mark>`, badge đếm trên nút `"Ghi chú"` tăng lên 2.
     - Mở panel `"Ghi chú"` → thấy đủ 2 mục → bấm vào mục có ghi chú để focus `<mark>` → bấm mở popover sửa ghi chú.
     - Reload trang (`page.reload()`) → xác nhận tiếp tục (nếu có) → cả 2 highlight & ghi chú vẫn còn nguyên vẹn đúng chữ.
     - Bấm `Nộp bài` → xác nhận `QuizSubmitGuardDialog` (kiểm popover/toolbar không đè modal nộp bài) → mở `Xem chi tiết bài làm` (`/detail`) → vẫn thấy 2 highlight & ghi chú ở chế độ read-only (bấm vào xem được ghi chú, KHÔNG có nút sửa/xoá hay nút `"Xoá tất cả"`).
     - Kiểm 3 viewport (1440×900, 768×1024, 375×812) + 320px reflow + Light & Dark mode: không tràn ngang (`scrollWidth <= clientWidth`), nút và popover hiển thị gọn gàng trong viewport; đồng thời xuất ảnh chụp POT (Light & Dark, 3 viewport) vào `plans/reports/` (chỉ dùng dữ liệu seed E2E, không chứa secret/token/dữ liệu cá nhân).
- **Success criteria**: Spec E2E mới pass hoàn toàn khi chạy lẻ với port override 8100–8105.
- **Verify**: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/student-reading-highlight-notes.spec.ts` exits 0.

### Task 4.2 — Run regression checks on existing reading E2E specs and full local quality gates
<!-- Updated: Red-Team RT-13 - specs/... relative paths -->
- **Goal**: Đảm bảo 0 regression ở `student-quiz-take-review.spec.ts` (split-pane scroll) và `admin-library-reading.spec.ts` (admin preview 0 write + Escape + 3 viewport), cùng toàn bộ gate `pnpm check`, `pnpm check-types`, `pnpm test`.
- **Target files and symbols**: Toàn bộ workspace bị ảnh hưởng.
- **Steps**:
  1. Chạy spec lẻ `specs/student-quiz-take-review.spec.ts` (nhóm split-pane) và `specs/admin-library-reading.spec.ts` với port override 8100–8105 (KHÔNG chạy full suite E2E ở local theo `AGENTS.md`).
  2. Chạy bộ gate cục bộ: `pnpm check`, `pnpm check-types`, `pnpm test`.
  3. Chạy `pnpm design:compare` nếu cần theo `REVIEW.md` hoặc ghi nhận kết quả rõ ràng trong báo cáo.
  4. Dọn sạch mọi process nền nếu có khởi chạy thủ công (theo `ak-process-management.md`).
- **Success criteria**: Tất cả lệnh kiểm tra exit 0, 0 lỗi lint/type/unit/E2E.
- **Verify**: `pnpm check && pnpm check-types && pnpm test` exits 0.

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
