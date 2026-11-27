---
title: "Phase 2: Targeted E2E Regression, Visual POT, Gates & Changelog"
status: completed
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Targeted E2E Regression, Visual POT, Gates & Changelog

## Goal
Bổ sung kiểm thử E2E hồi quy trên Chromium thật (hit-test `elementFromPoint`, click trực tiếp không `force`, bàn phím `Tab` + `Space`, 3 viewport Light/Dark + 320px reflow, chụp 6 ảnh POT opt-in), vượt qua toàn bộ cổng chất lượng cục bộ và cập nhật `CHANGELOG.md`.

## Files to Create / Modify
- Modify: `apps/e2e/specs/class-assign.spec.ts`
- Create (POT artifacts): `plans/reports/982-assign-modal-{1440x900,768x1024,375x812}-{light,dark}.png`
- Modify: `CHANGELOG.md`

## Tasks & Steps

### Task 2.1 — Bổ sung kịch bản E2E hồi quy và chụp POT opt-in (`#982`)
<!-- Updated: Red-Team Session 1 - chọn đề trước khi kiểm tra nút disabled ở 0/2, enroll An trước Bình, scrollIntoViewIfNeeded trước elementFromPoint, đồng bộ class .dark + kiểm overflow thân modal/list -->
- Goal: Chứng minh trên trình duyệt Chromium thật rằng checkbox bấm trực tiếp được, không bị `span` chặn, hoạt động tốt bằng bàn phím, đạt reflow 320px–1440px Light/Dark và chụp đủ 6 ảnh POT khi bật `CAPTURE_POT_982=1`.
- Target files and symbols: `apps/e2e/specs/class-assign.spec.ts`.
- Steps:
  1. Thêm import `dirname, resolve` từ `"node:path"` và `fileURLToPath` từ `"node:url"` để giải quyết đường dẫn gốc worktree UTF-8 an toàn (`const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");`).
  2. Thêm `test("#982: checkbox học viên bấm trực tiếp không bị span chặn, hoạt động bàn phím, và Chọn tất cả 3 trạng thái", async ({ page }) => { ... })`:
     - Đăng ký giáo viên (`signUpViaApi`), seed 2 học viên (`An Học viên 1`, `Bình Học viên 2`), tạo lớp, thêm & kích hoạt **theo thứ tự `An Học viên 1` trước rồi `Bình Học viên 2` sau** (khớp thứ tự `classGroup.studentIds`), tạo 1 đề ready.
     - Mở modal `"Giao bài tập"`, xác minh `"Chọn tất cả"` (`getByRole("checkbox", { name: "Chọn tất cả", exact: true })`) đang checked, `assign-students-scope-badge` hiển thị `"Cả lớp"`, bộ đếm `"(2/2)"`.
     - Chọn sẵn đề ready (`assignDialog.getByRole("button", { name: new RegExp(PROMPT_TITLE) }).click()`) và xác nhận nút `"Giao bài tập"` đang bật (`toBeEnabled()`), để mọi kiểm tra khóa nút ở trạng thái `0/2` bên dưới phản ánh đúng `studentsOk === false` (tránh phantom assertion).
     - Lấy `st1Checkbox` (`An Học viên 1`) và `st2Checkbox` (`Bình Học viên 2`). Gọi `await st2Checkbox.scrollIntoViewIfNeeded()`, kiểm tra `boundingBox()` có `width >= 16 && height >= 16` và gọi `document.elementFromPoint(cx, cy)` tại tâm ô vuông của `st2Checkbox` để chứng minh phần tử trên cùng là `INPUT` (`type === "checkbox"`).
     - Bỏ tick trực tiếp `await st2Checkbox.uncheck()` (tuyệt đối KHÔNG dùng `{ force: true }`), kiểm tra `selectAll` có `indeterminate === true`, `aria-checked="mixed"`, badge `"Chọn lọc"`, bộ đếm `"(1/2)"`.
     - Kiểm tra bàn phím: focus `selectAll`, bấm `Space` → chọn cả 2 (`"Cả lớp"`, nút `"Giao bài tập"` bật), bấm `Space` → bỏ chọn cả 2 (`"Chưa chọn"`, nút `"Giao bài tập"` bị `toBeDisabled()` và footer hiện `"Chưa chọn học viên"`), bấm `Tab` → focus tới `st1Checkbox`, bấm `Space` → tick `st1Checkbox` (`"(1/2)"`, `"Chọn lọc"`, `selectAll` indeterminate, nút `"Giao bài tập"` bật lại).
     - Kiểm tra overflow ở 4 viewport `1440×900`, `768×1024`, `375×812`, `320×812` ở cả Light & Dark: cập nhật đồng thời `localStorage.theme` lẫn `document.documentElement.classList` + `expect(hasDark).toBe(theme === "dark")` (theo tiền lệ `#572` tại `class-assign.spec.ts:379-391`); kiểm tra `scrollWidth <= clientWidth + 1` trên `document.documentElement`, `assignDialog`, phần tử thân modal (`overflow-y-auto`), và khung danh sách học viên. Khi `process.env.CAPTURE_POT_982 === "1"`, scroll khu vực danh sách học viên vào khung nhìn và chụp 6 ảnh `plans/reports/982-assign-modal-{1440x900,768x1024,375x812}-{light,dark}.png`.
     - Đặt lại viewport `1280×800` + Light mode, bấm `"Giao bài tập"`, xác minh payload `POST` có `studentIds.length === 1` và `targetScope === "selected"`, toast `"Đã giao “...” cho 1 học viên."`, và `#assigned-list` hiện `"0/1 đã nộp"` + `An Học viên 1` (không có `Bình Học viên 2`).
- Success criteria: Spec `class-assign.spec.ts` chạy pass toàn bộ trên stack E2E thật.
- Verify: `CAPTURE_POT_982=1 E2E_API_PORT=8100 E2E_LMS_PORT=8101 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/class-assign.spec.ts` — thoát `0`, mọi test trong `class-assign.spec.ts` pass và sinh đủ 6 file PNG trong `plans/reports/982-assign-modal-*.png`.

### Task 2.2 — Chạy gates tĩnh, unit tests, `design:compare` và kiểm tra trực quan 6 ảnh POT
<!-- Updated: Red-Team Session 1 - định rõ design:compare kiểm trang nền /classes/$classId (không mở modal) và khôi phục ảnh lịch sử -->
- Goal: Bảo đảm không có lỗi lint, type, regression test hay lỗi render trang lớp nền, đồng thời kiểm tra trực quan 6 ảnh chụp POT của modal.
- Target files and symbols: toàn workspace (`biome`, `check-types`, `web test`, `design:compare`, `plans/reports/982-assign-modal-*.png`).
- Steps:
  1. Kiểm tra bằng `read_file` cả 6 ảnh `plans/reports/982-assign-modal-*.png` xem viền checkbox, dấu tick/gạch ngang indeterminate, badge `"Chọn lọc"`, tương phản Light/Dark có rõ ràng, không tràn chữ/cắt khung, không có PII thật.
  2. Chạy gate lint, typecheck và toàn bộ unit test của `web`:
     `pnpm exec biome check . && VITE_SERVER_URL=http://localhost:8000 pnpm check-types && CI=1 pnpm --filter web test`
  3. Chạy `pnpm design:compare --screens t-class-detail --force` (chỉ kiểm tra không làm vỡ trang nền `/classes/$classId` vì `t-class-detail` không mở `AssignClassPromptModal`; nếu môi trường thiếu `.cache/design-v2` thì dùng `--side app --force`), kiểm tra exit `0` và khôi phục bất kỳ ảnh lịch sử nào bị ghi đè (`git checkout -- plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail/`).
- Success criteria: Mọi lệnh đều thoát `0` và 6 ảnh POT đạt chuẩn `REVIEW.md`.
- Verify: `pnpm exec biome check . && VITE_SERVER_URL=http://localhost:8000 pnpm check-types && CI=1 pnpm --filter web test && pnpm design:compare --screens t-class-detail --force` — toàn bộ thoát `0`.

### Task 2.3 — Cập nhật `CHANGELOG.md`
- Goal: Ghi nhận bản sửa lỗi `#982` theo đúng quy ước tiếng Việt của repo.
- Target files and symbols: `CHANGELOG.md` (`## 2026-11-27` → `### Fixed`).
- Steps:
  1. Đọc đầu `CHANGELOG.md` và thêm 1 mục mô tả ngắn gọn dưới `## 2026-11-27` → `### Fixed` nêu rõ việc thay checkbox `peer sr-only` bị `span` chặn bằng native checkbox trực tiếp, ẩn Avatar khỏi accessible name và nâng cấp thanh «Chọn tất cả» 3 trạng thái + badge phạm vi trong `AssignClassPromptModal` (`#982`).
  2. Chạy `pnpm exec biome check .` để xác nhận sạch định dạng.
- Success criteria: `CHANGELOG.md` cập nhật đúng chuẩn và `biome check .` thoát `0`.
- Verify: `pnpm exec biome check .` — thoát `0`.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same failure evidence to the user. Never continue by self-reasoning.

## Todo
- [x] Task 2.1: Bổ sung E2E test `#982` trong `class-assign.spec.ts` và chụp 6 ảnh POT
- [x] Task 2.2: Soi trực quan 6 ảnh POT và chạy đủ gates (`biome`, `check-types`, `web test`, `design:compare`)
- [x] Task 2.3: Cập nhật `CHANGELOG.md` dưới `## 2026-11-27` (`### Fixed`)

## Success Criteria
- Toàn bộ cổng kiểm định tĩnh, unit test, targeted E2E `class-assign.spec.ts`, `design:compare` và 6 ảnh POT đều đạt và không phát sinh lỗi ngoài phạm vi.
