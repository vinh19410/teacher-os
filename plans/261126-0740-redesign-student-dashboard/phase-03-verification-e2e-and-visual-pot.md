---
phase: 3
title: "Phase 3: E2E Verification, Design Compare & 3-Viewport Visual POT"
status: done
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: E2E Verification, Design Compare & 3-Viewport Visual POT

## Goal

Xác minh hành vi end-to-end trên 11 spec E2E học viên liên quan (gồm cả 4 spec bảo mật/ranh giới trực tiếp của `/student/`, không sửa bất kỳ assertion E2E nào), chạy `pnpm design:compare` cho màn `s-dashboard`, kiểm tra checklist `REVIEW.md` trên 4 chiều ngang (`1440×900`, `768×1024`, `375×812`, `320×568`) cả Light và Dark bằng đồng hồ server + client đồng bộ (`POST /__e2e/clock` + `page.clock`), và chụp bộ 6 ảnh POT lưu vào `plans/reports/` (không để rò rỉ `open-design/` hay PNG lịch sử).

## Files to Create / Modify

<!-- Updated: Red Team Session 1 - Chốt tiền tố POT theo số GitHub issue được gắn vào plan.md ở Bước 5 trước khi chạy Phase 3 -->

- Create (6 POT screenshots trong `plans/reports/`, tiền tố issue `975`):
  - `plans/reports/975-student-dashboard-1440-light.png`
  - `plans/reports/975-student-dashboard-1440-dark.png`
  - `plans/reports/975-student-dashboard-768-light.png`
  - `plans/reports/975-student-dashboard-768-dark.png`
  - `plans/reports/975-student-dashboard-375-light.png`
  - `plans/reports/975-student-dashboard-375-dark.png`

## Tests Before

Xác nhận toàn bộ unit test và static checks đang xanh trước khi khởi động stack E2E:
- `pnpm exec biome check . && pnpm check-types && pnpm --filter student test` exits 0.

## Tasks & Steps

### Task 3.1 — Chạy 11 spec E2E học viên liên quan trên port override và khôi phục PNG lịch sử đích danh

<!-- Updated: Red Team Session 1 - Bổ sung 4 spec bảo mật/ranh giới (student-wrong-role-redirect, material-upload-student, zoom-meeting, study-pack), thay glob plans/261* bằng đường dẫn đích xác tránh hoàn tác thư mục plan hiện tại, và kiểm sạch cả 781-* lẫn student-nav-* -->

- **Goal:** Chứng minh toàn bộ 11 spec E2E liên quan đến `/student/` pass nguyên bản mà không nới lỏng assertion và không làm bẩn working tree với PNG lịch sử hay hoàn tác nhầm thư mục plan hiện tại.
- **Target files and symbols:**
  - `apps/e2e/specs/student-portal-onboarding.spec.ts`
  - `apps/e2e/specs/student-placement-test.spec.ts`
  - `apps/e2e/specs/student-class-detail.spec.ts`
  - `apps/e2e/specs/student-quiz-take-review.spec.ts`
  - `apps/e2e/specs/tuition-bank-transfer.spec.ts`
  - `apps/e2e/specs/vocab-srs.spec.ts`
  - `apps/e2e/specs/class-status.spec.ts`
  - `apps/e2e/specs/student-wrong-role-redirect.spec.ts`
  - `apps/e2e/specs/material-upload-student.spec.ts`
  - `apps/e2e/specs/zoom-meeting.spec.ts`
  - `apps/e2e/specs/study-pack.spec.ts`
- **Steps:**
  1. Kiểm tra cổng 8100–8105 đang trống (`ss -ltnp | grep -E '810[0-5]' || true`).
  2. Chạy đúng 11 spec lẻ theo `AGENTS.md` (không chạy full suite):
     ```bash
     E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 \
       pnpm --filter e2e e2e \
       specs/student-portal-onboarding.spec.ts \
       specs/student-placement-test.spec.ts \
       specs/student-class-detail.spec.ts \
       specs/student-quiz-take-review.spec.ts \
       specs/tuition-bank-transfer.spec.ts \
       specs/vocab-srs.spec.ts \
       specs/class-status.spec.ts \
       specs/student-wrong-role-redirect.spec.ts \
       specs/material-upload-student.spec.ts \
       specs/zoom-meeting.spec.ts \
       specs/study-pack.spec.ts
     ```
  3. Khôi phục đích danh toàn bộ PNG lịch sử bị `student-placement-test.spec.ts` (`748-*`, `781-*`) và `student-class-detail.spec.ts` (`student-nav-*`) ghi đè — TUYỆT ĐỐI KHÔNG dùng glob `plans/261*`:
     ```bash
     git checkout -- \
       plans/reports/748-*.png \
       plans/reports/781-*.png \
       plans/261019-0648-student-portal-nav-menu/screenshots/ 2>/dev/null || true
     ```
     Và xóa bất kỳ ảnh untracked nào khác do 11 spec trên sinh trong `plans/reports/` (nếu có).
  4. Xác nhận không còn process nền sót lại trên cổng 8100–8105.
- **Success criteria:** Toàn bộ test trong 11 spec pass (0 failed) và `git status --short plans/reports/ plans/261019-0648-student-portal-nav-menu/` hoàn toàn trống.
- **Verify:** Lệnh Playwright bước 2 exits 0 và `git status --short plans/reports/ plans/261019-0648-student-portal-nav-menu/` trả chuỗi rỗng.

### Task 3.2 — Chạy `pnpm design:compare` cho màn `s-dashboard`

- **Goal:** Đáp ứng gate `REVIEW.md` cho PR đụng UI bằng `pnpm design:compare` ở phạm vi màn `s-dashboard`.
- **Target files and symbols:** `scripts/design-compare/capture.mjs` (chỉ thực thi, không sửa code script).
- **Steps:**
  1. Chạy lệnh không kèm dấu `--` ngăn cách (tương thích `pnpm@10.33.1`):
     ```bash
     pnpm design:compare --screens s-dashboard --side app --force
     ```
  2. Xác nhận `git status --short` không có file ảnh thừa bị ghi đè ngoài `.state/raw/` (git-ignored).
- **Success criteria:** `pnpm design:compare --screens s-dashboard --side app --force` exits 0 (vượt pixel sanity check không trắng/rỗng).
- **Verify:** Exit code 0 từ `pnpm design:compare --screens s-dashboard --side app --force`.

### Task 3.3 — Kiểm tra UI 3 viewport + 320px reflow + Light/Dark + a11y và chụp 6 ảnh POT

<!-- Updated: Red Team Session 1 - Dùng vietnamTodayISO(), đồng bộ đồng hồ API server qua POST /__e2e/clock (reset trong finally) song song page.clock, và chốt tiền tố số GitHub issue -->

- **Goal:** Xác minh cơ học và trực quan mọi hạng mục `REVIEW.md` trên dữ liệu seed đầy đủ của `/student/` và xuất 6 ảnh POT rõ nét vào `plans/reports/`.
- **Target files and symbols:** `plans/reports/975-student-dashboard-{1440,768,375}-{light,dark}.png`.
- **Steps:**
  1. Tạo spec Playwright tạm `apps/e2e/specs/_tmp-student-dashboard-pot.spec.ts` (xóa ngay sau khi chạy, không commit) chạy trên port `8100–8105`:
     - Tính `TODAY = vietnamTodayISO()` từ `./helpers` (tuyệt đối không dùng UTC `toISOString().slice(0, 10)`).
     - Đồng bộ đồng hồ API server qua `POST ${API_ORIGIN}/__e2e/clock` với `{ nowIso: `${TODAY}T17:50:00+07:00` }` (bắt buộc reset `{ nowIso: null }` trong `finally`!) đồng thời ghim đồng hồ trình duyệt bằng `await page.clock.setFixedTime(new Date(`${TODAY}T17:50:00+07:00`))` để `ClassCard.nextSession`, `TodayScheduleCard` và `ZoomJoinButton` khớp tuyệt đối 100% mọi giờ chạy.
     - Seed dữ liệu thật đầy đủ qua DB + real student auth:
       - Hồ sơ học viên hoàn tất onboarding: `exam_interest = 'ielts'`, `current_level = 'intermediate'`, `target_score = '6.5'`, `entry_score = '5.5'`, `daily_study_hours = '1-2'`.
       - 2 lớp active (có giáo viên, `sessionsDone/sessionsTotal`, 3 buổi học trong ngày `TODAY`: `09:00` `completed`, `18:00` `upcoming` có Zoom → `open` trong cửa sổ 30 phút, `20:00` `upcoming` có Zoom → `later`) + 1 lớp `invited`.
       - 4 bài tập `class_assignment`: 1 sắp đến hạn hôm nay (`due_at` 23:59 hôm nay), 1 hạn ngày mai, 1 hạn 3 ngày nữa, 1 đã nộp.
       - 1 hóa đơn học phí chưa thanh toán (`3.200.000đ`, `type = 'Học phí'`) và 1 bộ từ vựng có thẻ đến hạn ôn.
  2. Trong phiên Playwright, kiểm tra cơ học:
     - `document.documentElement.scrollWidth <= document.documentElement.clientWidth` ở cả `1440×900`, `768×1024`, `375×812`, `320×568` (Light & Dark).
     - 0 `console.error`, 0 `pageerror`.
     - Toggle sáng/tối (`ThemeToggle`) lưu `localStorage.theme` và giữ lựa chọn sau `page.reload()`.
     - Keyboard `Tab` chạm được CTA `NextTaskHero`, nút `Vào lớp (Zoom)` trong `TodayScheduleCard`, tab lọc `AssignmentList`, hàng bài tập, card lớp học, `vocab-home-entry`, và link `Xem hóa đơn`.
     - Bấm tab `"Đã nộp"` và `"Tất cả"` trong `AssignmentList` hoạt động đúng; bấm `"Xem hóa đơn"` đi thẳng sang `/tuition/$invoiceId`.
     - Chụp đủ 6 ảnh full-page `plans/reports/975-student-dashboard-{1440,768,375}-{light,dark}.png`.
  3. Xóa `apps/e2e/specs/_tmp-student-dashboard-pot.spec.ts`.
  4. Mở xem trực quan các ảnh POT bằng `read_file` để đảm bảo không lỗi layout, không cắt chữ, tương phản tốt trên cả Light và Dark.
  5. Chạy chốt `pnpm exec biome check . && pnpm check-types && pnpm --filter student test` và kiểm `git status` chắc chắn `open-design/` không bị stage.
- **Success criteria:** Đủ 6 ảnh POT > 10KB đã kiểm mắt, 0 lỗi overflow 320px–1440px, 0 `console.error`/`pageerror`, mọi gate chất lượng pass.
- **Verify:** `ls -lh plans/reports/975-student-dashboard-*.png | wc -l` trả `6` và `pnpm exec biome check . && pnpm check-types && pnpm --filter student test` exits 0.

## Tests After

Toàn bộ gate cuối trước khi chuyển sang `/ak-code-review --pending --advice`:
- `pnpm exec biome check . && pnpm check-types && pnpm --filter student test` exits 0.

## Verification

- 11 spec E2E học viên pass trên port `8100–8105` và không còn diff PNG lịch sử.
- `pnpm design:compare --screens s-dashboard --side app --force` exits 0.
- Đủ 6 ảnh POT đã kiểm mắt trong `plans/reports/`.
- `pnpm exec biome check .`, `pnpm check-types`, `pnpm --filter student test` exits 0.

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
