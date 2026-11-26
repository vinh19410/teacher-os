---
phase: 3
title: "Phase 3: E2E Scenarios, Design Compare & Visual POT"
status: completed
priority: P1
effort: "1h"
dependencies: [1, 2]
---

# Phase 3: E2E Scenarios, Design Compare & Visual POT

## Goal

Cập nhật 2 spec E2E liên quan với kịch bản nợ điểm danh 6 buổi quá khứ (tái hiện đúng issue #959), chạy các gate cục bộ (`biome`, `check-types`, full unit tests, 2 spec E2E lẻ, `pnpm design:compare`), kiểm 3 viewport + 320px reflow Light/Dark và chuẩn bị bộ ảnh POT trong `plans/reports/`.

## Files to Create / Modify

- Modify: `apps/e2e/specs/dashboard-reminders.spec.ts`
- Modify: `apps/e2e/specs/daily-attendance.spec.ts`
- Create: `plans/reports/959-*.png` (bộ ảnh POT 3 viewport + Light/Dark cho Dashboard & `/teacher/attendance`)

## Tasks & Steps

### Task 3.1 — Cập nhật `dashboard-reminders.spec.ts` và `daily-attendance.spec.ts` với copy mới & kịch bản nợ điểm danh quá hạn
- **Goal:** Bảo đảm cả luồng điểm danh hôm nay hiện hữu lẫn luồng nợ điểm danh 6 buổi quá khứ được kiểm chứng end-to-end trên trình duyệt thật.
- **Target files and symbols:**
  - `apps/e2e/specs/dashboard-reminders.spec.ts` (`lines 139-159` + test case mới cho overdue)
  - `apps/e2e/specs/daily-attendance.spec.ts` (`lines 193-197` + test case mới cho 6 buổi quá hạn)
- **Steps:**
  1. Trong `apps/e2e/specs/dashboard-reminders.spec.ts`:
     - Cập nhật regex link thẻ #1 từ `/^1\. Điểm danh — Ca dạy hôm nay chưa điểm danh$/` sang `/^1\. Điểm danh — Ca dạy chưa điểm danh$/`.
     - Thêm test case kiểm nợ quá hạn: dùng `seedQuizFixture` seed 1 lớp với đúng 6 buổi quá khứ `upcoming` (ngày `isoInDaysFromTodayVN(-11)`, `-9`, `-7`, `-5`, `-3`, `-1`; 0 buổi hôm nay) → kiểm `GET /api/dashboard/reminders?v=2` trả `attendance.pending === 6`, `attendance.today === 0`, `attendance.overdue === 6` trong `≤ 2000ms` (và kiểm `GET /api/dashboard/reminders` không có `?v=2` vẫn trả `attendance.pending === 6` không có key `overdue`); mở `/teacher/dashboard`, scope vào `const attendanceCard = page.getByTestId("reminder-card-attendance")`, kiểm thấy `"6 ca dạy"` và `"6 ca quá hạn"` và `expect(attendanceCard.getByText("Đã hoàn tất hôm nay")).toHaveCount(0)` (KHÔNG assert trên toàn `section` vì thẻ #2/#3 vẫn done), Hero không hiện `"Mọi việc hôm nay đã xong."`; click 1 lần trên thẻ #1 đi thẳng `/teacher/attendance?date=${TODAY}&status=overdue` và thấy 6 ca quá hạn kèm ca gần nhất tự mở sẵn.
     <!-- Updated: Validation Session 1 - dùng `seedQuizFixture` 6 ngày rõ ràng, gọi `?v=2`, và scope `"Đã hoàn tất hôm nay"` vào `reminder-card-attendance` (Red-Team #3, #11) -->
  2. Trong `apps/e2e/specs/daily-attendance.spec.ts`:
     - Cập nhật heading thẻ #1 tại `line 195` từ `"Ca dạy hôm nay chưa điểm danh"` sang `"Ca dạy chưa điểm danh"`.
     - Thêm test case luồng điểm danh nợ quá hạn:
       - Dùng `seedQuizFixture` (KHÔNG dùng `seedDatedClass` mặc định 1 buổi/tuần) seed lớp `IELTS Foundation 5.5 (Test)` có 6 buổi quá khứ `upcoming` (`isoInDaysFromTodayVN(-11)` … `isoInDaysFromTodayVN(-1)`, 0 buổi hôm nay).
       <!-- Updated: Validation Session 1 - tránh bẫy `seedDatedClass` mặc định 1 buổi/tuần (Red-Team #11) -->
       - Mở `/teacher/attendance` (mặc định `?date=TODAY&status=all`) → thấy chip `"Quá hạn"` và banner đỏ `"Có 6 ca học từ các ngày trước chưa điểm danh."` + nút `"Xem ca quá hạn"`.
       - Bấm `"Xem ca quá hạn"` → URL chứa `status=overdue`, thấy 6 ca kèm ngày học và badge `"Quá hạn"`, ca đầu tự mở; điểm danh 1 ca bằng `"Đánh dấu tất cả Có mặt"` + `"Lưu điểm danh ca học"` → toast `"Đã lưu điểm danh"`, `GET /api/dashboard/reminders?v=2` giảm `pending: 6 → 5` (`overdue: 5`), ca quá hạn thứ 2 tự mở và focus picker đầu tiên.
       - Kiểm tra không tràn ngang (`scrollWidth <= clientWidth`) ở `375×812` và `320×568` cả Light và Dark theme.
- **Success criteria:** Cả 2 spec E2E lẻ chạy pass 100% với port override `8100..8105` (không chạy full suite).
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e dashboard-reminders daily-attendance` exits 0 và toàn bộ test pass (khôi phục bất kỳ screenshot lịch sử nào trong `plans/261026-*` bằng `git checkout -- plans/261026-*/screenshots` nếu spec cũ ghi đè).

### Task 3.2 — Chụp ảnh POT 3 viewport Light/Dark và chạy `pnpm design:compare` + full local quality gates
- **Goal:** Thu thập đầy đủ bằng chứng thị giác theo `REVIEW.md` và xác nhận sạch mọi gate lint/type/unit/visual trước khi review & ship.
- **Target files and symbols:** `plans/reports/959-*.png` (bộ ảnh POT cho Dashboard thẻ #1 có nợ quá hạn và `/teacher/attendance` có banner + tab `Quá hạn` ở 1440×900, 768×1024, 375×812 + Dark 1440×900).
- **Steps:**
  1. Chụp bộ ảnh POT (`959-dashboard-overdue-1440-light.png`, `959-dashboard-overdue-1440-dark.png`, `959-attendance-banner-1440-light.png`, `959-attendance-overdue-1440-light.png`, `959-attendance-overdue-1440-dark.png`, `959-attendance-overdue-768-light.png`, `959-attendance-overdue-375-light.png`) từ dữ liệu seed E2E sạch (không chứa PII/token) lưu vào `plans/reports/`.
  2. Chạy `pnpm design:compare --screens t-dashboard --side app --force` (lưu ý không dùng `--` thừa trên pnpm 10) để xác nhận màn Dashboard vẫn đạt chuẩn design v2 không hồi quy, không ảnh trắng.
  3. Chạy gate tổng hợp đầy đủ: `pnpm exec biome check .`, `pnpm check-types`, `pnpm --filter @teacher-os/api test`, `pnpm --filter server test`, `pnpm --filter web test`.
  <!-- Updated: Validation Session 1 - chạy đầy đủ `pnpm --filter server test` bao phủ toàn bộ consumer (Red-Team #10) -->
  4. Kiểm tra `git status` để chắc chắn không còn screenshot lịch sử ngoài `plans/reports/959-*.png` bị chỉnh sửa ngoài ý muốn.
- **Success criteria:** Tất cả gate thoát 0; ảnh POT rõ nét, không tràn ngang, đúng contrast ở cả Light và Dark.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm --filter @teacher-os/api test && pnpm --filter server test && pnpm --filter web test` exits 0.

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e dashboard-reminders daily-attendance`
- `pnpm design:compare --screens t-dashboard --side app --force`
- `pnpm exec biome check . && pnpm check-types && pnpm --filter @teacher-os/api test && pnpm --filter server test && pnpm --filter web test`

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
