---
phase: 3
title: "Phase 3: E2E Verification, Design Compare & 3-Viewport Visual POT"
status: completed
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: E2E Verification, Design Compare & 3-Viewport Visual POT

## Goal

Xác minh hành vi end-to-end trên 3 spec E2E mục tiêu (không sửa assertion E2E, không chạy full E2E), chạy `pnpm design:compare` cho màn `t-dashboard`, kiểm tra trực quan và cơ học checklist `REVIEW.md` ở 4 chiều ngang (`1440×900`, `768×1024`, `375×812`, `320×568` — gồm cả context `hasTouch: true` cho `pointer-coarse:*`) cả Light & Dark kèm kiểm chứng tương tác lịch tháng, và chụp bộ 6 ảnh POT sạch vào `plans/reports/` (tuyệt đối không để rò rỉ `open-design/teacher.html`, file spec tạm `_tmp-*.spec.ts` hay PNG lịch sử).

## Files to Create / Modify

<!-- Updated: Red Team Session 1 - Chốt tiền tố POT theo trường issue trong frontmatter plan.md (fallback dashboard-calendar nếu chưa gắn issue) -->

- Create (6 ảnh POT trong `plans/reports/`, tiền tố `POT_PREFIX` lấy từ trường `issue:` trong frontmatter `plan.md`, ví dụ `<issue>-dashboard-calendar-*`, fallback `dashboard-calendar` nếu frontmatter chưa có `issue:`):
  - `plans/reports/${POT_PREFIX}-dashboard-calendar-1440-light.png`
  - `plans/reports/${POT_PREFIX}-dashboard-calendar-1440-dark.png`
  - `plans/reports/${POT_PREFIX}-dashboard-calendar-768-light.png`
  - `plans/reports/${POT_PREFIX}-dashboard-calendar-768-dark.png`
  - `plans/reports/${POT_PREFIX}-dashboard-calendar-375-light.png`
  - `plans/reports/${POT_PREFIX}-dashboard-calendar-375-dark.png`

## Tests Before

Xác nhận toàn bộ unit test và static checks đang xanh trước khi khởi động stack E2E:
- `pnpm exec biome check . && pnpm check-types && pnpm --filter web test` exits 0.

## Tasks & Steps

### Task 3.1 — Chạy 3 spec E2E mục tiêu trên port override và khôi phục PNG lịch sử

- **Goal:** Chứng minh 3 spec E2E dashboard/reminders/attendance/paused-class pass 100% mà không sửa assertion và không làm bẩn working tree với PNG lịch sử.
- **Target files and symbols:** `apps/e2e/specs/dashboard-reminders.spec.ts`, `apps/e2e/specs/daily-attendance.spec.ts`, `apps/e2e/specs/class-status.spec.ts`.
- **Steps:**
  1. Kiểm tra cổng 8100–8105 đang trống (`ss -ltnp | grep -E '810[0-5]' || true`).
  2. Chạy đúng 3 spec lẻ theo `AGENTS.md`:
     ```bash
     E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 \
       pnpm --filter e2e e2e specs/dashboard-reminders.spec.ts specs/daily-attendance.spec.ts specs/class-status.spec.ts
     ```
  3. Khôi phục toàn bộ thư mục PNG lịch sử mà các spec trên tự ghi đè:
     ```bash
     git checkout -- \
       plans/261026-1501-tos-6-dashboard-reminder-cards/screenshots \
       plans/261026-1524-tos-7-daily-attendance-inline/screenshots \
       plans/261026-1533-tos-8-mark-all-present/screenshots
     ```
  4. Xác nhận không còn process nền sót lại trên cổng `8100–8105`.
- **Success criteria:** Toàn bộ test trong 3 spec pass (0 failed) và `git diff --name-only plans/261026-*/` rỗng.
- **Verify:** Lệnh Playwright bước 2 exits 0 và `git diff --name-only plans/261026-*/` rỗng.

### Task 3.2 — Chạy `pnpm design:compare` cho màn `t-dashboard`

- **Goal:** Đáp ứng gate `REVIEW.md` cho PR đụng UI bằng `pnpm design:compare` ở phạm vi màn `t-dashboard`.
- **Target files and symbols:** `scripts/design-compare/capture.mjs` (chỉ thực thi, không sửa script).
- **Steps:**
  1. Chạy lệnh không kèm dấu `--` ngăn cách (tương thích `pnpm@10.33.1`):
     ```bash
     pnpm design:compare --screens t-dashboard --side app --force
     ```
- **Success criteria:** Lệnh exits 0 và vượt qua pixel sanity check không trắng/rỗng.
- **Verify:** `pnpm design:compare --screens t-dashboard --side app --force` exits 0.

### Task 3.3 — Kiểm tra 3 viewport + 320px reflow (gồm `hasTouch: true`) + tương tác lịch tháng Light/Dark và chụp 6 ảnh POT

<!-- Updated: Red Team Session 1 - Tính ngày seed chắc chắn nằm trong tháng TODAY.slice(0,7) (không dùng +1/+2/+5), dùng seedQuizFixture, kiểm hasTouch:true ở 320px, bọc trap dọn spec tạm, khóa verify git không stage open-design và không sót _tmp-* -->

- **Goal:** Xác minh cơ học và trực quan checklist `REVIEW.md` (không tràn ngang `320px–1440px` kể cả khi nút `"Hôm nay"` hiển thị ở `hasTouch: true`, chuyển tháng/chọn ngày hoạt động bất kể chạy vào ngày nào trong tháng, focus trả đúng khi bấm `"Hôm nay"`, 0 `console.error`/`pageerror`) và chụp đủ 6 ảnh POT vào `plans/reports/`.
- **Target files and symbols:** `plans/reports/${POT_PREFIX}-dashboard-calendar-{1440,768,375}-{light,dark}.png`.
- **Steps:**
  1. Đọc `POT_PREFIX` từ trường `issue:` trong frontmatter `plan.md` (nếu đã tạo issue ở Bước 5 thì `POT_PREFIX=<issue>`; nếu chưa có thì đặt `POT_PREFIX=dashboard-calendar`).
  2. Tạo spec Playwright tạm `apps/e2e/specs/_tmp-dashboard-calendar-pot.spec.ts` và **luôn chạy kèm `trap 'rm -f apps/e2e/specs/_tmp-dashboard-calendar-pot.spec.ts' EXIT`** trong cùng câu lệnh shell để không bao giờ để sót file tạm dù test lỗi:
     - Ghim đồng hồ client bằng `await page.clock.setFixedTime(new Date(\`\${TODAY}T10:30:00+07:00\`))` (giữ cùng ngày `TODAY` với server, cố định 10:30 giờ VN).
     - Tính ngày seed phụ chắc chắn nằm trong cùng tháng `ym = TODAY.slice(0, 7)` (bất kể `TODAY` là ngày 26, 30 hay 31):
       - `otherBusyDay1 = Number(TODAY.slice(8, 10)) >= 15 ? \`\${ym}-05\` : \`\${ym}-18\``
       - `otherBusyDay2 = Number(TODAY.slice(8, 10)) >= 15 ? \`\${ym}-12\` : \`\${ym}-25\``
       - `emptyDay`: ngày đầu tiên trong `01..28` của `ym` khác `TODAY`, `otherBusyDay1`, `otherBusyDay2` (ví dụ `03` hoặc `04`).
     - Seed bằng `seedQuizFixture` (hỗ trợ truyền thẳng mảng `lessons` theo ngày bất kỳ trong tháng) với:
       - 3 buổi dạy ngày `TODAY` (`08:00` `completed`, `10:00` `upcoming`, `19:00` `upcoming`),
       - 1 buổi dạy ngày `otherBusyDay1` (`18:30` `upcoming`),
       - 1 buổi dạy ngày `otherBusyDay2` (`09:00` `upcoming`),
       - 1 lớp phụ được chuyển sang `status: "paused"` qua `/api/classes/:id/status` để kiểm chứng ẩn trên lịch tháng.
     - Kiểm tra cơ học ở `1440×900`, `768×1024`, `375×812`, `320×568` (Light & Dark):
       - `document.documentElement.scrollWidth <= document.documentElement.clientWidth` cả ở tháng hiện tại LẪN sau khi bấm `Tháng sau` (khi nút `"Hôm nay"` xuất hiện ở `320px`).
       - Khởi tạo thêm context cảm ứng `browser.newContext({ viewport: { width: 320, height: 568 }, hasTouch: true, storageState })`, mở `/teacher/dashboard`, bấm `Tháng sau` để hiện nút `"Hôm nay"`, xác nhận `scrollWidth <= clientWidth` và nhãn `dashboard-calendar-month` không tràn khung ngang.
       - Bấm `[data-cal-day="${otherBusyDay1}"]` → `dashboard-calendar-agenda` hiển thị giờ `18:30` và tên lớp; bấm `[data-cal-day="${emptyDay}"]` → `within(agenda).getByText("Không có buổi dạy.")` hiển thị duy nhất 1 phần tử.
       - Bấm `Tháng sau` → bấm `"Hôm nay"` → quay về tháng hiện tại, nút `"Hôm nay"` biến mất, `document.activeElement` khớp `[data-cal-day="${TODAY}"]`.
       - Toggle Dark/Light lưu `localStorage.theme` và giữ sau reload; 0 `console.error`, 0 `pageerror`.
     - Chụp đủ 6 ảnh full-page `plans/reports/${POT_PREFIX}-dashboard-calendar-{1440,768,375}-{light,dark}.png`.
  3. Mở kiểm mắt các ảnh POT bằng `read_file` để đảm bảo lịch tháng sắc nét, cân đối, không cắt chữ, contrast tốt trên cả Light và Dark.
  4. Chạy chốt `pnpm exec biome check . && pnpm check-types && pnpm --filter web test` và kiểm cơ học `git ls-files --cached open-design/teacher.html` rỗng, không tồn tại `apps/e2e/specs/_tmp-*`.
- **Success criteria:** Đủ đúng 6 ảnh POT `plans/reports/${POT_PREFIX}-dashboard-calendar-*.png` > 10KB đã kiểm mắt, 0 lỗi overflow `320px–1440px` (gồm `hasTouch: true`), 0 `console.error`/`pageerror`, không stage `open-design/teacher.html`, không sót `_tmp-*`.
- **Verify:**
  ```bash
  test "$(ls -1 plans/reports/${POT_PREFIX}-dashboard-calendar-*.png | wc -l)" -eq 6 \
    && test -z "$(git ls-files --cached open-design/teacher.html)" \
    && test -z "$(ls apps/e2e/specs/_tmp-* 2>/dev/null || true)" \
    && pnpm exec biome check . && pnpm check-types && pnpm --filter web test
  ```
  exits 0.

## Tests After

- `pnpm exec biome check . && pnpm check-types && pnpm --filter web test` exits 0.

## Verification

- 3 spec E2E pass trên port `8100–8105` và `git diff --name-only plans/261026-*/` rỗng.
- `pnpm design:compare --screens t-dashboard --side app --force` exits 0.
- Đủ 6 ảnh POT theo đúng `${POT_PREFIX}` đã kiểm mắt trong `plans/reports/`.
- `open-design/teacher.html` không bị stage, không sót `apps/e2e/specs/_tmp-*`, và `pnpm exec biome check . && pnpm check-types && pnpm --filter web test` exits 0.

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
