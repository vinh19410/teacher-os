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

Xác minh hành vi end-to-end trên 4 spec E2E liên quan (không sửa assertion E2E), chạy `pnpm design:compare` cho màn `t-dashboard`, kiểm tra thủ công/tự động checklist `REVIEW.md` trên 4 chiều ngang (`1440×900`, `768×1024`, `375×812`, `320×568`) cả Light và Dark kèm Student Detail Drawer bằng đồng hồ client xác định, và chụp bộ 7 ảnh POT lưu vào `plans/reports/` (không để rò rỉ file `open-design/` hay bất kỳ PNG lịch sử nào).

## Files to Create / Modify

<!-- Updated: Red Team Session 1 - Chốt tiền tố POT theo số GitHub issue trong plan.md frontmatter (hoặc slug redesign-dashboard nếu chưa gắn issue) -->

- Create (7 POT screenshots trong `plans/reports/`, tiền tố issue `954`):
  - `plans/reports/954-dashboard-1440-light.png`
  - `plans/reports/954-dashboard-1440-dark.png`
  - `plans/reports/954-dashboard-768-light.png`
  - `plans/reports/954-dashboard-768-dark.png`
  - `plans/reports/954-dashboard-375-light.png`
  - `plans/reports/954-dashboard-375-dark.png`
  - `plans/reports/954-dashboard-drawer-1440-light.png`

## Tests Before

Xác nhận toàn bộ unit test và static checks đang xanh trước khi khởi động stack E2E:
- `pnpm check && pnpm check-types && pnpm --filter web test` exits 0.

## Tasks & Steps

### Task 3.1 — Chạy 4 spec E2E liên quan trên port override và khôi phục toàn bộ PNG lịch sử

<!-- Updated: Red Team Session 1 - Bổ sung plans/261026-2038-tos-17-payment-validation-and-finance-guard/screenshots vào lệnh git checkout -->

- **Goal:** Chứng minh toàn bộ 4 spec E2E dashboard/reminders/attendance/RBAC pass mà không cần nới lỏng assertion và không làm bẩn working tree với PNG lịch sử.
- **Target files and symbols:** `apps/e2e/specs/dashboard-reminders.spec.ts`, `apps/e2e/specs/daily-attendance.spec.ts`, `apps/e2e/specs/class-status.spec.ts`, `apps/e2e/specs/debt-payment-validation-and-guard.spec.ts`.
- **Steps:**
  1. Kiểm tra cổng 8100–8105 đang trống (`ss -ltnp | grep -E '810[0-5]' || true`).
  2. Chạy đúng 4 spec lẻ theo `AGENTS.md`:
     ```bash
     E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 \
       pnpm --filter e2e e2e specs/dashboard-reminders.spec.ts specs/daily-attendance.spec.ts specs/class-status.spec.ts specs/debt-payment-validation-and-guard.spec.ts
     ```
  3. Khôi phục toàn bộ 4 thư mục PNG lịch sử mà các spec trên tự ghi đè:
     ```bash
     git checkout -- \
       plans/261026-1501-tos-6-dashboard-reminder-cards/screenshots \
       plans/261026-1524-tos-7-daily-attendance-inline/screenshots \
       plans/261026-1533-tos-8-mark-all-present/screenshots \
       plans/261026-2038-tos-17-payment-validation-and-finance-guard/screenshots
     ```
  4. Xác nhận không còn process nền sót lại trên cổng 8100–8105.
- **Success criteria:** Tất cả test trong 4 spec pass (0 failed) và `git diff --name-only plans/261026-*/` rỗng.
- **Verify:** Lệnh Playwright bước 2 exits 0 và `git diff --name-only plans/261026-*/` rỗng.

### Task 3.2 — Chạy `pnpm design:compare` cho màn `t-dashboard`

<!-- Updated: Red Team Session 1 - Xóa dấu -- khỏi pnpm design:compare (tránh crash cờ không hợp lệ trên pnpm 10) -->

- **Goal:** Đáp ứng gate `REVIEW.md` cho PR đụng UI bằng `pnpm design:compare` ở phạm vi màn `t-dashboard`.
- **Target files and symbols:** `scripts/design-compare/capture.mjs` (chỉ thực thi, không sửa code script).
- **Steps:**
  1. Chạy lệnh không kèm dấu `--` ngăn cách (tương thích `pnpm@10.33.1`):
     ```bash
     pnpm design:compare --screens t-dashboard --side app --force
     ```
  2. Ghi chú: `--side app` chỉ ghi raw vào `.state/raw/` (git-ignored) và chạy pixel sanity check không trắng/rỗng; chỉ cần `git checkout -- plans/261020-1446-378-redesign-design-v2/screenshots/` nếu chạy thêm `--side both`.
- **Success criteria:** `pnpm design:compare --screens t-dashboard --side app --force` exits 0 (qua pixel sanity check không trắng/rỗng).
- **Verify:** Exit code 0 từ `pnpm design:compare --screens t-dashboard --side app --force`.

### Task 3.3 — Kiểm tra UI 3 viewport + 320px reflow + Light/Dark + Drawer a11y và chụp 7 ảnh POT

<!-- Updated: Red Team Session 1 - Dùng page.clock.setFixedTime ghim 10:30 ICT trong ngày TODAY, UPDATE class_assignment.due = YESTERDAY, xử lý nhánh Chủ Nhật rõ ràng -->

- **Goal:** Xác minh trực quan & cơ học mọi hạng mục `REVIEW.md` trên dữ liệu seed đầy đủ của `/teacher/dashboard` và xuất 7 ảnh POT rõ nét vào `plans/reports/`.
- **Target files and symbols:** `plans/reports/954-dashboard-{1440,768,375}-{light,dark}.png`, `plans/reports/954-dashboard-drawer-1440-light.png`.
- **Steps:**
  1. Tạo spec Playwright tạm trong `apps/e2e/specs/_tmp-dashboard-pot.spec.ts` (xóa ngay sau khi chạy, không commit) chạy trên stack E2E port `8100–8105`:
     - Ghim đồng hồ client bằng `await page.clock.setFixedTime(new Date(`${TODAY}T10:30:00+07:00`))` (giữ trùng ngày `TODAY` với server `reminders`, nhưng ổn định giờ hiển thị `10:30` để `08:00` luôn là `past`, `10:00` luôn là `live`, `19:00` luôn là `next`).
     - Seed dữ liệu thật đầy đủ:
       - 3 ca dạy hôm nay (`08:00` `completed`, `10:00` `upcoming` → live, `19:00` `upcoming` → next) + nếu `isoDayNumber(TODAY) < 7` seed thêm 1–2 ca các ngày còn lại trong tuần (`+1`/`+2` ngày) cho `Lịch sắp tới` (nếu chạy đúng Chủ Nhật, ghi nhận empty state trung thực của `Lịch sắp tới`).
       - 1 ca hôm qua (`YESTERDAY`, `upcoming`) để kích hoạt badge `"Chưa điểm danh"`.
       - 1 bài Writing nộp 25h trước (Thẻ 2 `"1 bài"`), và chạy `UPDATE class_assignment SET due = YESTERDAY WHERE id = ?` cho 1 học viên thứ 2 chưa nộp để kích hoạt badge `"Bài tập trễ hạn"`.
       - 1 hóa đơn quá hạn (Thẻ 3 `"Học phí đến hạn"` + `"Còn phải thu"`).
       - 2 học viên trong `"Cần kiểm tra"`: 1 học viên có `session_package` active sắp hết (`còn 2 buổi`) và 1 học viên chưa có gói (`Chưa có gói`).
  2. Trong phiên Playwright, kiểm tra cơ học:
     - `document.documentElement.scrollWidth <= document.documentElement.clientWidth` ở cả `1440×900`, `768×1024`, `375×812`, `320×568` (Light & Dark), và mọi thẻ/hàng trong `Cần kiểm tra` không tràn khỏi khung ngang.
     - 0 `console.error`, 0 `pageerror`.
     - Toggle sáng/tối lưu `localStorage.theme` và giữ đúng sau `page.reload()`.
     - Keyboard `Tab` đi qua thẻ nhắc việc, nút `Làm mới`, link `Xem tuần`, nút học viên trong `"Cần kiểm tra"`; bấm mở `StudentRiskDrawer`, kiểm tra hiển thị chi tiết thật + link `/teacher/students/<id>`, chụp `plans/reports/954-dashboard-drawer-1440-light.png`, bấm `Escape` đóng drawer và xác nhận focus trả về nút học viên.
     - Chụp đủ 6 ảnh full-page `plans/reports/954-dashboard-{1440,768,375}-{light,dark}.png`.
  3. Xóa `apps/e2e/specs/_tmp-dashboard-pot.spec.ts`.
  4. Mở xem trực quan các ảnh POT bằng `read_file` để đảm bảo không lỗi layout, không cắt chữ, tương phản tốt trên cả Light và Dark.
  5. Chạy chốt `pnpm check && pnpm check-types && pnpm --filter web test` và kiểm `git status` chắc chắn `open-design/` không bị stage.
- **Success criteria:** Đủ 7 ảnh POT > 10KB đã kiểm trực quan, 0 lỗi overflow 320px–1440px, 0 `console.error`/`pageerror`, mọi gate chất lượng pass.
- **Verify:** `ls -lh plans/reports/954-dashboard-*.png | wc -l` trả `7` và `pnpm check && pnpm check-types && pnpm --filter web test` exits 0.

## Tests After

Toàn bộ gate cuối trước khi chuyển sang `/ak-code-review --pending --advice`:
- `pnpm check && pnpm check-types && pnpm --filter web test` exits 0.

## Verification

- 4 spec E2E pass trên port `8100–8105` và `git diff --name-only plans/261026-*/` rỗng.
- `pnpm design:compare --screens t-dashboard --side app --force` exits 0.
- Đủ 7 ảnh POT đã kiểm mắt trong `plans/reports/`.
- `pnpm check`, `pnpm check-types`, `pnpm --filter web test` exits 0.

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
