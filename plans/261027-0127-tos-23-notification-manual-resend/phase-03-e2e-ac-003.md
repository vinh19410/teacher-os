---
phase: 3
title: "E2E AC-003: Gửi lại không nhân bản In-app"
status: completed
priority: P0
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: E2E AC-003 — Gửi lại thông báo lỗi không nhân bản In-app

<!-- Updated: Validation & Red Team Session 1 - Handover decomposition + student email update + 3 viewports + keyboard focus -->

## Goal

Kiểm chứng đầu-cuối (E2E Playwright) cho AC-003 trên màn `[5]` (`/notifications`) và cổng học viên:
1. Nút `"Gửi lại"` chỉ hiện trên dòng `failed`, không hiện trên dòng `sent`/`read`.
2. Bấm `"Gửi lại"` trên dòng vẫn mang địa chỉ `@bounce.test` → thử lại thêm đúng 3 lượt trong `.mail-log.jsonl`, bản ghi quay về `failed`, số bản ghi trên màn `[5]` và số thông báo In-app trên cổng học viên vẫn đúng 1 mục (không nhân bản).
3. Cập nhật `student.email` sang địa chỉ hợp lệ rồi dùng `"Gửi lại tất cả mục lỗi (2)"` qua hộp thoại xác nhận (bằng bàn phím) → cả 2 bản ghi lấy địa chỉ email mới, gửi thành công (`Đã gửi`), chip `"Lỗi gửi"` về `0`, nút header tự ẩn, và cổng học viên vẫn chỉ có đúng 1 thông báo In-app.
4. Kiểm chứng giao diện ở 3 viewport (`1440×900`, `768×1024`, `375×812`) không tràn ngang và điều hướng bàn phím (`Tab` / `Enter` / `Escape`).

## Files to Create or Modify

- Create: `apps/e2e/specs/notifications-ac-003.spec.ts`

## Tasks & Steps

### Task 3.1 — Viết và chạy E2E spec `apps/e2e/specs/notifications-ac-003.spec.ts`
- **Goal:** Tạo spec Playwright kiểm chứng toàn diện AC-003 (gửi lại đơn lẻ, gửi lại hàng loạt sau khi cập nhật email học viên, không nhân bản In-app, 3 viewport + keyboard focus) và lưu ảnh chụp màn hình vào `plans/261027-0127-tos-23-notification-manual-resend/screenshots/`.
- **Target files and symbols:** `apps/e2e/specs/notifications-ac-003.spec.ts`.
- **Steps:**
  1. Tạo `apps/e2e/specs/notifications-ac-003.spec.ts` theo mẫu `apps/e2e/specs/notifications-ac-002.spec.ts`:
     - Đăng ký giáo viên qua `signUpViaUi(teacher)`, seed 2 học viên `STUDENT_1` (`tos23.one.<ts>@bounce.test`) và `STUDENT_2` (`tos23.two.<ts>@bounce.test`) với `onboarded: true`, thêm еще 1 học viên `STUDENT_OK` (`tos23.ok.<ts>@test.local`, `onboarded: true`).
     - Tạo lớp học và ghi danh + kích hoạt cả 3 học viên để phát 3 thông báo `class_enrolled` (`STUDENT_OK` thành `sent`, còn `STUDENT_1` và `STUDENT_2` thành `failed` sau 3 lần thử mỗi người).
     - Mở `/notifications`:
       - Xác nhận dòng của `STUDENT_OK` (`Đã gửi`) **không** có nút `"Gửi lại"`.
       - Xác nhận nút header `"Gửi lại tất cả mục lỗi (2)"` hiển thị.
       - Chuyển sang chip `"Lỗi gửi"` (`/notifications?status=failed`): kiểm tra cả 2 dòng `failed` đều có nút `"Gửi lại"`.
       - Kiểm tra ở 3 viewport (`1440×900`, `768×1024`, `375×812`): nút `"Gửi lại"` và nút header hiển thị rõ, không tràn ngang trang (`document.documentElement.scrollWidth <= document.documentElement.clientWidth`), chụp screenshot lưu vào `plans/261027-0127-tos-23-notification-manual-resend/screenshots/`.
     - **Kịch bản 1 (Gửi lại 1 dòng khi địa chỉ vẫn lỗi + kiểm tra không nhân bản In-app):**
       - Focus bằng bàn phím vào nút `"Gửi lại thông báo cho ${STUDENT_1}"` và nhấn `Enter`.
       - Xác nhận toast `"Đã đưa 1 thông báo về hàng đợi để gửi lại."` xuất hiện.
       - Poll `.mail-log.jsonl` tới khi `STUDENT_1` có đúng `6` dòng `failed: true` (3 lần ban đầu + 3 lần gửi lại).
       - Đăng ký & xác thực tài khoản cổng học viên cho `STUDENT_1` trên `STUDENT_ORIGIN`, mở chuông thông báo và xác nhận `student.getByTestId("inbox-item")` vẫn có đúng `1` mục (không bị nhân bản sau khi bấm Gửi lại).
     - **Kịch bản 2 (Cập nhật Email học viên + Gửi lại tất cả mục lỗi (2) thành công):**
       - Cập nhật `student.email` trong `local.db` cho cả `STUDENT_1` và `STUDENT_2` sang địa chỉ hợp lệ (`tos23.one.fixed.<ts>@test.local` và `tos23.two.fixed.<ts>@test.local`).
       - Trên màn `/notifications?status=failed`, focus nút `"Gửi lại tất cả mục lỗi (2)"` và nhấn `Enter` để mở hộp thoại xác nhận `"Gửi lại tất cả thông báo lỗi?"`.
       - Nhấn `Escape` để kiểm tra đóng hộp thoại bằng bàn phím, sau đó mở lại và kích hoạt nút `"Xác nhận gửi lại"`.
       - Xác nhận toast `"Đã đưa 2 thông báo về hàng đợi để gửi lại."` xuất hiện.
       - Xác nhận thanh `ChipFilter` vẫn hiển thị trên `/notifications?status=failed` (nhờ sửa lỗi `total === 0`), chip `"Lỗi gửi"` cập nhật về `0`, nút `"Gửi lại tất cả mục lỗi"` tự ẩn, và màn hình hiện `"Không có thông báo nào phù hợp với bộ lọc."`.
       - Chuyển sang chip `"Tất cả"`: xác nhận cả `STUDENT_1` (trạng thái `"Đã xem"` vì học viên 1 đã mở đọc ở Kịch bản 1 — bảo toàn `read_at` theo D5!) và `STUDENT_2` (trạng thái `"Đã gửi"`) đều hiển thị địa chỉ email mới (`@test.local`), không còn nút `"Gửi lại"`, tổng số thông báo của tổ chức vẫn đúng bằng `3` (mỗi học viên 1 bản ghi), và `.mail-log.jsonl` ghi nhận thư gửi tới 2 địa chỉ `@test.local` mới.
       - Kiểm tra lại cổng học viên của `STUDENT_1`: reload trang và mở chuông thông báo → vẫn chỉ có đúng `1` mục `inbox-item`.
- **Success criteria:** Cả `notifications-ac-003.spec.ts` và `notifications-ac-002.spec.ts` chạy pass trên cổng E2E `8100/8101/8103/8104`.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e -- notifications-ac-00` exits `0`.

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e -- notifications-ac-00` exits `0`.

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
