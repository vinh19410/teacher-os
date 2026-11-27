---
phase: 3
title: "Phase 3: Verification Gates, Targeted E2E, Design Compare & Visual POT"
status: completed
priority: P1
effort: "1h"
dependencies: [1, 2]
---

# Phase 3: Verification Gates, Targeted E2E, Design Compare & Visual POT

## Goal
Xác minh toàn bộ bộ gate chất lượng (lint/format, typecheck, unit/integration tests, targeted E2E — không chạy full E2E suite ở local), kiểm tra `pnpm design:compare`, xác nhận không tràn ngang 320px/375px/768px/1440px ở Light & Dark và chụp đủ bộ ảnh POT lưu tại `plans/reports/958-*.png`.

## Files to Create / Modify
- Modify: `apps/e2e/specs/class-assign.spec.ts` (bổ sung kịch bản E2E kích hoạt học viên thứ 2 tự tăng mẫu số `0/1` → `0/2`, kiểm Student Portal `200`, bấm `"Giao bổ sung"` trên bài quá hạn và xác minh Thẻ 2 + Hero dashboard)
- Create: `plans/reports/958-dashboard-1440-light.png`
- Create: `plans/reports/958-dashboard-1440-dark.png`
- Create: `plans/reports/958-dashboard-768-light.png`
- Create: `plans/reports/958-dashboard-375-light.png`
- Create: `plans/reports/958-class-assignments-1440-light.png`
- Create: `plans/reports/958-class-assignments-375-light.png`

## Tasks & Steps

### Task 3.1 — Chạy đầy đủ bộ gate tĩnh và unit/integration tests toàn monorepo
<!-- Updated: Validation Session 1 - Sửa pnpm check -> pnpm check:fix cho auto-fix Biome (Red-Team F12) -->
- **Goal:** Đảm bảo 0 lỗi Biome, 0 lỗi TypeScript và 100% unit/integration tests pass trên `@teacher-os/api`, `server` và `web`.
- **Target files and symbols:** Toàn bộ các package chịu ảnh hưởng (`packages/db`, `packages/api`, `apps/server`, `apps/web`).
- **Steps:**
  1. Chạy `pnpm exec biome check .` (nếu có lỗi format nhỏ, chạy `pnpm check:fix` rồi kiểm lại bằng `pnpm exec biome check .`).
  2. Chạy `pnpm check-types`.
  3. Chạy `pnpm --filter @teacher-os/api test && pnpm --filter server test && pnpm --filter web test`.
- **Success criteria:** Cả 3 bước exit 0, không có test fail hoặc skip ngoài ý muốn.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm --filter @teacher-os/api test && pnpm --filter server test && pnpm --filter web test` exits 0.

### Task 3.2 — Bổ sung & chạy Targeted E2E specs (port override 8100–8105)
<!-- Updated: Validation Session 1 - Chọn thứ lớp khác hôm nay khóa openTasks===0, positive Hero assertion, Student Portal 200 check, khôi phục thêm tos-8 screenshots (Red-Team F11) -->
- **Goal:** Xác minh 2 spec dashboard hiện hữu không bị vỡ và chứng minh end-to-end luồng issue #958 (thẻ Chấm bài khi còn bài quá hạn chưa nộp + mẫu số `0/1` → `0/2` qua kích hoạt học viên mới + quyền mở bài trên Student Portal + nút `"Giao bổ sung"`).
- **Target files and symbols:**
  - `apps/e2e/specs/class-assign.spec.ts`
  - `apps/e2e/specs/dashboard-reminders.spec.ts` (read-only regression check)
  - `apps/e2e/specs/daily-attendance.spec.ts` (read-only regression check)
- **Steps:**
  1. Thêm 1 test case cuối file `apps/e2e/specs/class-assign.spec.ts` kiểm chứng:
     - Tạo lớp với **thứ học khác hôm nay giờ VN** (dùng thứ của ngày mai suy từ `isoInDaysFromTodayVN(1)` để khóa cứng `attendance.pending === 0` và `openTasks === 0`, tránh flaky vào T2/T4).
     - Lớp có 1 học viên active (HV1) + 1 học viên invited (HV2); mở modal giao đề → thấy cảnh báo 1 học viên chờ xác nhận; giao bài → ban đầu tỉ lệ là `0/1 đã nộp`.
     - Kích hoạt HV2 → trở lại tab bài tập → mẫu số tự động trở thành `0/2 đã nộp` (cả 2 học viên xuất hiện trong danh sách) và kiểm trực tiếp Student Portal API (`GET /api/student/assignments/:id/quiz` của HV2 hoặc xác minh target trên snapshot/portal) trả `200`.
     - Shift hạn nộp về quá khứ qua `/__e2e/study-pack-shift` để HV1/HV2 ở trạng thái `"Chưa nộp · quá hạn"`, sau đó mở `/teacher/dashboard` → xác nhận:
       - Thẻ 2 (`reminder-card-grading`) hiển thị `"Không còn bài quá hạn chấm"`, hiển thị `"Còn 2 bài quá hạn chưa nộp (2 học viên)"`, KHÔNG hiển thị `"Đã hoàn tất hôm nay"`.
       - `dashboard-hero-summary` chứa khẳng định `"Còn 2 học viên cần kiểm tra."` và KHÔNG chứa `"Mọi việc hôm nay đã xong."`.
     - Thêm HV3 (active ngay sau khi bài đã quá hạn) → bài quá hạn giữ `0/2 đã nộp` + `"Giao 2/3 HV"` + nút `"Giao bổ sung"` → bấm `"Giao bổ sung"` → cập nhật lên `0/3 đã nộp` và nút `"Giao bổ sung"` biến mất.
  2. Chạy 3 spec E2E lẻ với port override (`E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105`):
     `dashboard-reminders.spec.ts`, `daily-attendance.spec.ts`, `class-assign.spec.ts`.
  3. Khôi phục mọi ảnh screenshot lịch sử bị spec cũ ghi đè (`git checkout -- plans/261026-1501-tos-6-dashboard-reminder-cards/screenshots plans/261026-1524-tos-7-daily-attendance-inline/screenshots plans/261026-1533-tos-8-mark-all-present/screenshots`).
- **Success criteria:** Cả 3 spec E2E pass 100% và `git status` không dính ảnh screenshot của plan lịch sử.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/dashboard-reminders.spec.ts specs/daily-attendance.spec.ts specs/class-assign.spec.ts` exits 0.

### Task 3.3 — `pnpm design:compare` và chụp bộ ảnh POT 3 viewport + 320px reflow Light/Dark
<!-- Updated: Validation Session 1 - Khôi phục thêm plans/261020-1446-378-redesign-design-v2/screenshots sau design:compare (Red-Team F11) -->
- **Goal:** Chạy `pnpm design:compare` theo `REVIEW.md` và tạo bộ ảnh POT chứng minh giao diện trên 3 viewport (`1440×900`, `768×1024`, `375×812`) + kiểm `320px` reflow không tràn ngang cả Light và Dark.
- **Target files and symbols:**
  - `plans/reports/958-dashboard-1440-light.png`
  - `plans/reports/958-dashboard-1440-dark.png`
  - `plans/reports/958-dashboard-768-light.png`
  - `plans/reports/958-dashboard-375-light.png`
  - `plans/reports/958-class-assignments-1440-light.png`
  - `plans/reports/958-class-assignments-375-light.png`
- **Steps:**
  1. Chạy `pnpm design:compare --screens t-dashboard --side app --force` (lưu ý KHÔNG dùng `--` thừa trên pnpm 10). Khôi phục file tracked bị `design:compare` ghi đè trong `plans/261020-1446-378-redesign-design-v2/screenshots` (`git checkout -- plans/261020-1446-378-redesign-design-v2/screenshots`).
  2. Chụp bộ 6 ảnh POT (`1440×900` Light/Dark, `768×1024` Light, `375×812` Light cho `/teacher/dashboard` trạng thái 0 bài chờ chấm + 2 bài quá hạn chưa nộp; và `1440×900`, `375×812` cho tab Bài tập lớp với `0/2 đã nộp` / `"Giao bổ sung"`) dùng Playwright trên dữ liệu seed sạch (không lộ dữ liệu thật/secret), đồng thời kiểm `document.documentElement.scrollWidth <= window.innerWidth` ở cả `320px`, `375px`, `768px`, `1440px` Light & Dark.
  3. Kiểm tra bằng `read_file` (vision) các ảnh chính để xác nhận không trắng/rỗng, không cắt chữ, tương phản tốt cả Light & Dark.
- **Success criteria:** `pnpm design:compare` exit 0; đủ 6 ảnh POT sắc nét trong `plans/reports/`; 0 tràn ngang trên mọi viewport.
- **Verify:** `pnpm design:compare --screens t-dashboard --side app --force` exits 0 và `ls -la plans/reports/958-*.png` liệt kê đủ 6 file có kích thước > 10KB.

## Verification
- Toàn bộ lệnh Verify của Task 3.1, 3.2, 3.3 đều exit 0.

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
