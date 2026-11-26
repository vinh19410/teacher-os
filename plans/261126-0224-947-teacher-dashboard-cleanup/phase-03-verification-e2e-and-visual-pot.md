---
phase: 3
title: "Phase 3: Verification, E2E & 3-Viewport Visual POT"
status: done
priority: P1
effort: "1.5h"
dependencies: [2]
---

# Phase 3: Verification, E2E & 3-Viewport Visual POT

## Goal

Cập nhật các E2E spec liên quan (bao gồm RBAC tài chính trên Dashboard), chạy đúng 4 spec E2E lẻ trên port override, hoàn tác 10 ảnh PNG lịch sử bị ghi đè, chạy toàn bộ gate cục bộ và kiểm chứng trực quan giao diện ở 3 viewport (`1440×900`, `768×1024`, `375×812`) + `320×568` reflow + light/dark + Tab focus kèm 6 ảnh POT lưu trong `plans/reports/`.

## Files to Create / Modify

<!-- Updated: Red Team Session 1 - Chốt đồng nhất 6 ảnh POT (bổ sung 768-dark), thêm debt-payment-validation-and-guard.spec.ts -->

- Modify: `apps/e2e/specs/dashboard-reminders.spec.ts`
- Modify: `apps/e2e/specs/daily-attendance.spec.ts`
- Modify: `apps/e2e/specs/debt-payment-validation-and-guard.spec.ts`
- Create (6 POT screenshots):
  - `plans/reports/947-dashboard-1440-light.png`
  - `plans/reports/947-dashboard-1440-dark.png`
  - `plans/reports/947-dashboard-768-light.png`
  - `plans/reports/947-dashboard-768-dark.png`
  - `plans/reports/947-dashboard-375-light.png`
  - `plans/reports/947-dashboard-375-dark.png`

## Tasks & Steps

### Task 3.1 — Cập nhật selector & assertion trong các E2E spec liên quan

<!-- Updated: Red Team Session 1 - Tránh Playwright strict-mode collision bằng aria-label/exact, thay xpath=.. bằng data-testid, thêm RBAC assertion cho ta/class_teacher trên /dashboard -->

- **Goal:** Đồng bộ `dashboard-reminders.spec.ts`, `daily-attendance.spec.ts` và bổ sung assertion phân quyền Dashboard trong `debt-payment-validation-and-guard.spec.ts`.
- **Target files and symbols:** `apps/e2e/specs/dashboard-reminders.spec.ts` (dòng 130-178), `apps/e2e/specs/daily-attendance.spec.ts` (dòng 59-67, 191-199), `apps/e2e/specs/debt-payment-validation-and-guard.spec.ts` (dòng 225-280).
- **Steps:**
  1. Trong `apps/e2e/specs/dashboard-reminders.spec.ts`:
     - Bỏ dòng chờ `"Việc cần làm hôm nay ("`; chờ trực tiếp `section.getByText("1 ca dạy")` (timeout 5000ms; gate 2s vẫn nằm ở `elapsedMs` của API tại dòng 112).
     - Kiểm tra rõ 3 thẻ theo thứ tự `1`, `2`, `3` và nhãn chức năng mà không dính Playwright strict-mode collision (dùng `getByRole("link", ...)` khớp `aria-label` chính xác):
       - `section.getByRole("link", { name: /^1\. Điểm danh — Ca dạy hôm nay chưa điểm danh$/ })`
       - `section.getByRole("link", { name: /^2\. Chấm bài — Bài tập quá hạn chấm > 24h$/ })`
       - `section.getByRole("link", { name: /^3\. Học phí — Học phí đến hạn$/ })`
     - Cập nhật click điều hướng thẻ 1 & thẻ 2 theo link selector mới; cập nhật dòng 176 (`"1 ca"` → `"1 ca dạy"`).
  2. Trong `apps/e2e/specs/daily-attendance.spec.ts`:
     - Dòng 64: `getByText("1 ca")` → `getByText("1 ca dạy")`.
     - Dòng 192-194: dùng `page.getByTestId("reminder-card-attendance")` (tránh lệ thuộc `xpath=..`) và kiểm tra heading `"Ca dạy hôm nay chưa điểm danh"` cùng `"Đã hoàn tất hôm nay"` hiển thị bên trong, và `page.getByText("1 ca dạy")` có count `0`.
  3. Trong `apps/e2e/specs/debt-payment-validation-and-guard.spec.ts`:
     - Ở nhánh `ta` (sau dòng 235) và nhánh `class_teacher` (sau dòng 277) khi đã bị redirect về `/dashboard`: assert `page.getByText("Còn phải thu")` có count `0` và `page.getByTestId("reminder-card-tuition")` có count `0`, trong khi `page.getByText("Tổng học viên")` hiển thị.
- **Success criteria:** Lint và typecheck cho toàn repo (gồm `apps/e2e`) sạch lỗi.
- **Verify:** `pnpm check && pnpm check-types` exits 0.

### Task 3.2 — Chạy 4 E2E spec liên quan trên port override và dọn PNG lịch sử

<!-- Updated: Red Team Session 1 - Thêm debt-payment-validation-and-guard.spec.ts và bước git checkout khôi phục 10 file PNG tracked của các plan cũ -->

- **Goal:** Xác minh end-to-end luồng reminders, điểm danh ngày, ẩn lớp tạm dừng, và RBAC tài chính trên Dashboard thật mà không làm bẩn working tree với PNG lịch sử.
- **Target files and symbols:** `apps/e2e/specs/dashboard-reminders.spec.ts`, `apps/e2e/specs/daily-attendance.spec.ts`, `apps/e2e/specs/class-status.spec.ts`, `apps/e2e/specs/debt-payment-validation-and-guard.spec.ts`.
- **Steps:**
  1. Kiểm tra không có process chiếm cổng 8100–8105 (`ss -ltnp | grep -E '810[0-5]' || true`).
  2. Chạy đúng 4 spec lẻ với port override theo `AGENTS.md`:
     ```bash
     E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 \
       pnpm --filter e2e e2e specs/dashboard-reminders.spec.ts specs/daily-attendance.spec.ts specs/class-status.spec.ts specs/debt-payment-validation-and-guard.spec.ts
     ```
  3. Khôi phục ngay 10 file PNG lịch sử mà `dashboard-reminders.spec.ts` và `daily-attendance.spec.ts` tự ghi đè trong các thư mục plan cũ (tránh lọt binary diff ngoài phạm vi vào PR #947):
     ```bash
     git checkout -- plans/261026-1501-tos-6-dashboard-reminder-cards/screenshots plans/261026-1524-tos-7-daily-attendance-inline/screenshots plans/261026-1533-tos-8-mark-all-present/screenshots
     ```
  4. Kiểm tra không còn process nền sót lại trên cổng 8100–8105.
- **Success criteria:** Toàn bộ test trong 4 spec pass (0 failed) và `git status` không có thay đổi nào dưới `plans/261026-*/screenshots/`.
- **Verify:** Lệnh Playwright ở bước 2 exits 0 và `git diff --name-only plans/261026-*/` rỗng.

### Task 3.3 — Verify UI 3 viewport + 320px reflow + light/dark + Tab focus và chụp đủ 6 ảnh POT

<!-- Updated: Red Team Session 1 - Bỏ pnpm design:compare (hỏng basepath /teacher/ & thiếu seed), dùng Playwright trực tiếp trên stack E2E thống nhất với seed đủ mọi trạng thái Dashboard, kiểm overflow cả bảng lẫn tài liệu, xuất đủ 6 file PNG -->

- **Goal:** Kiểm chứng trực quan toàn bộ checklist `REVIEW.md` trên dữ liệu thật đầy đủ mọi khối mới của #947 và lưu đủ 6 ảnh POT vào `plans/reports/947-dashboard-*.png` để đính vào PR và comment POT trên #947.
- **Target files and symbols:** 6 ảnh `plans/reports/947-dashboard-{1440,768,375}-{light,dark}.png`.
- **Steps:**
  1. Tạo spec/script Playwright tạm (xóa ngay sau khi chạy xong, không commit) chạy qua runner `apps/e2e` trên port override 8100–8105 để mở đúng `LMS_ORIGIN/teacher/dashboard` với dữ liệu seed đầy đủ:
     - 1 lớp đang học có ca dạy hôm nay (`upcoming`) + 1 ca sắp tới trong tuần + 1 ca quá khứ `upcoming` (để xuất hiện badge `"Chưa điểm danh"`).
     - 1 bài viết nộp 25h trước (Thẻ 2 `"1 bài"`) và 1 `class_assignment` quá hạn chưa nộp (để xuất hiện badge `"Bài tập trễ hạn"`).
     - 1 hoá đơn quá hạn (Thẻ 3 `"Học phí đến hạn"` + KPI `"Còn phải thu"`).
     - 2 học viên trong `"Cần kiểm tra"`: 1 học viên có `session_package` active (`còn 24 buổi`) và 1 học viên chưa có gói (`Chưa có gói`).
  2. Trong cùng phiên Playwright, kiểm tra tự động:
     - `document.documentElement.scrollWidth <= document.documentElement.clientWidth` ở cả 4 kích thước: `1440×900`, `768×1024`, `375×812`, `320×568`.
     - Mọi bảng / card `"Cần kiểm tra"` không bị cắt ngang (`el.scrollWidth <= el.clientWidth`), đồng thời ở `320×568` và `375×812` các text `"còn 24 buổi"`, `"Chưa có gói"`, `"Chưa điểm danh"`, `"Bài tập trễ hạn"` đều visible trong viewport ngang.
     - Không có `console.error` hay `pageerror`.
     - Toggle dark/light hoạt động và `localStorage.theme` lưu đúng khi reload.
     - Keyboard `Tab` đi qua 3 thẻ `ReminderCards`, nút `Làm mới`, link `Xem tuần →` mà không lỗi focus.
  3. Chụp full-page và lưu đủ 6 file vào `plans/reports/`:
     - `947-dashboard-1440-light.png`, `947-dashboard-1440-dark.png`
     - `947-dashboard-768-light.png`, `947-dashboard-768-dark.png`
     - `947-dashboard-375-light.png`, `947-dashboard-375-dark.png`
  4. Xóa script/spec tạm sau khi chụp xong; mở kiểm trực quan các ảnh bằng `read_file` để xác nhận ảnh rõ nét, không trắng/rỗng, không cắt chữ hay chồng layout.
  5. Chạy chốt toàn bộ gate chất lượng: `pnpm check && pnpm check-types && pnpm --filter web test`.
- **Success criteria:** Đủ 6 file PNG > 10KB, đã kiểm mắt, 0 lỗi overflow ở 320px/375px/768px/1440px, mọi gate chất lượng pass.
- **Verify:** `ls -lh plans/reports/947-dashboard-*.png | wc -l` trả `6` và `pnpm check && pnpm check-types && pnpm --filter web test` exits 0.

## Verification

- `pnpm check` exits 0.
- `pnpm check-types` exits 0.
- `pnpm --filter web test` exits 0.
- 4 spec E2E liên quan pass trên port override 8100–8105 và không còn diff ở `plans/261026-*/screenshots/`.
- Đủ 6 ảnh POT 3 viewport × 2 theme trong `plans/reports/947-dashboard-*.png` đã kiểm trực quan.

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
