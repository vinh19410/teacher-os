---
phase: 3
title: "Phase 3: Kiểm chứng E2E locale en-US, 3 viewport, screenshots & cổng CI"
status: done
priority: P1
effort: "1.0h"
dependencies: [1, 2]
---

# Phase 3: Kiểm chứng E2E locale en-US, 3 viewport, screenshots & cổng CI

<!-- Updated: Red Team RT-6, RT-8, RT-9 -->

## Goal

Chứng minh end-to-end trên trình duyệt Chromium thật cấu hình `locale: "en-US"` rằng gõ ngày `dd/mm/yyyy` / `ddmmyyyy` và chọn lịch + giờ 24h hoạt động chuẩn xác không nhảy con trỏ, kiểm tra không tràn ngang trên 3 viewport (`1440×900`, `768×1024`, `375×812`) + `320px` reflow ở cả theme sáng/tối + focus bàn phím theo `REVIEW.md`, chụp ảnh bằng chứng cho PR, và vượt qua `pnpm design:compare` cùng toàn bộ cổng chất lượng của repo.

## Files to Create / Modify

- Modify:
  - `apps/e2e/specs/class-assign.spec.ts`

## Tasks & Steps

### Task 3.1 — Mở rộng `apps/e2e/specs/class-assign.spec.ts` kiểm chứng locale `en-US`, chọn lịch + giờ 24h, 3 viewport + `320px` reflow & chuyển trạng thái quá hạn
- **Goal:** Bổ sung kịch bản E2E chuyên biệt cho #572 trong `apps/e2e/specs/class-assign.spec.ts` chứng minh trực tiếp hành vi từng bị lỗi trên staging của Cô Mỹ.
- **Target files and symbols:**
  - `apps/e2e/specs/class-assign.spec.ts`
- **Steps:** <!-- Updated: Red Team RT-6, RT-8, RT-9 -->
  1. Trong `apps/e2e/specs/class-assign.spec.ts`:
     - Giữ nguyên bài test hiện hữu (chứng minh luồng giao bài mặc định `today + 7d` lúc `23:59` vẫn chạy xanh trọn vẹn).
     - Bổ sung bài test mới `"#572 (en-US locale): dd/mm/yyyy typing without segment jump, calendar popover, 24h dueTime, 3 viewports + 320px reflow, and VN overdue transition"` tạo browser context với `{ locale: "en-US", timezoneId: "America/New_York" }`:
       - Mở màn hình giao bài của lớp, kiểm tra bàn phím theo đúng thứ tự DOM (RT-9): focus `#assignment-due-input` → nhấn `Tab` sang nút `aria-label="Chọn ngày"` (`expect(calendarTrigger).toBeFocused()`) → nhấn `Enter` mở popover lịch → nhấn `Escape` đóng popover lịch và xác nhận focus quay về nút `aria-label="Chọn ngày"`, sau đó nhấn `Tab` tiếp sang `#assignment-due-time-input` (`expect(dueTimeInput).toBeFocused()`).
       - Gõ tuần tự (`pressSequentially`) chuỗi `"06/11/2027"` vào `#assignment-due-input`: khẳng định giá trị ô giữ nguyên `"06/11/2027"` và dòng `data-testid="assignment-due-preview"` chứa `"06/11/2027"` (ngày 6 tháng 11, tuyệt đối không phải tháng 6).
       - Xóa ô và gõ tuần tự `"09112027"` rồi `blur`: khẳng định ô chuẩn hóa thành `"09/11/2027"` (tuyệt đối không nhảy thành `"10/09"`), điền giờ `"17:30"` trên `#assignment-due-time-input`, khẳng định dòng xác nhận chứa `"09/11/2027 lúc 17:30 (giờ Việt Nam)"`.
       - Mở lại popover lịch (`aria-label="Chọn ngày"`), khẳng định lịch mở đúng `"Tháng 11, 2027"`, chọn ngày `"15"` trong lịch, khẳng định ô `#assignment-due-input` cập nhật thành `"15/11/2027"` và dòng xác nhận chứa `"15/11/2027 lúc 17:30 (giờ Việt Nam)"`.
       - Kiểm tra không tràn ngang (`document.documentElement.scrollWidth <= window.innerWidth`) ở 4 kích thước: `1440×900`, `768×1024`, `375×812`, và `320×812`, ở cả hai chế độ sáng (`light`: xóa `localStorage.theme` + `document.documentElement.classList.remove("dark")`) và tối (`dark`: `localStorage.setItem("theme", "dark"); document.documentElement.classList.add("dark");` kèm `expect(hasDarkClass).toBe(true)` — RT-8), kiểm tra cả khi đóng và mở lịch, đồng thời chụp ảnh màn hình lưu vào `/tmp/572-screenshots/` phục vụ báo cáo PR.
       - Bắt response `const createResPromise = page.waitForResponse((r) => r.url().includes("/api/classes/") && r.url().endsWith("/assignments") && r.request().method() === "POST");` trước khi bấm `"Giao bài tập"`, lấy `{ id: assignmentId }` từ JSON response (`expect(assignmentId).toBeTruthy()` — RT-6).
       - Xác nhận màn hình thành công và danh sách `"Bài đã giao lớp này"` hiển thị `"17:30 15/11/2027"` và trạng thái `"Đang mở"`.
       - Gọi `POST http://localhost:${API_PORT}/__e2e/study-pack-shift` với `{ assignmentId, dueAtMs: Date.now() - 60_000 }`, khẳng định `rowsAffected === 1`, reload trang lớp → khẳng định thẻ bài giao chuyển sang `"Quá hạn"`, dòng học viên chuyển sang `"Chưa nộp · quá hạn"`, và nhãn hạn hiển thị đúng ngày hôm nay (lấy từ `dueAt` — RT-6).
- **Success criteria:** Cả hai bài test trong `class-assign.spec.ts` và bài test `notifications-ac-001.spec.ts` chạy pass 100% trên stack E2E thật.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e exec playwright test specs/class-assign.spec.ts specs/notifications-ac-001.spec.ts` exits `0`.

### Task 3.2 — Chạy `pnpm design:compare` và toàn bộ cổng chất lượng của repo (`check`, `check-types`, `test`)
- **Goal:** Xác nhận không có hồi quy thị giác trên các màn hình liên quan (`t-class-detail`, `t-student-detail`, `s-dashboard`, `s-class-detail`), dọn sạch ảnh baseline có seed ngày động không thuộc phạm vi PR, và vượt qua toàn bộ lint, typecheck, unit/integration test của monorepo.
- **Target files and symbols:**
  - Toàn bộ workspace (`pnpm design:compare`, `pnpm check`, `pnpm check-types`, `pnpm test`).
- **Steps:** <!-- Updated: Red Team RT-8 -->
  1. Chạy `node scripts/design-compare/capture.mjs --screens t-class-detail,t-student-detail,s-dashboard,s-class-detail` và kiểm tra thoát `0`.
  2. Khôi phục các file ảnh baseline động không nằm trong danh sách file của plan bằng `git checkout -- plans/261020-1446-378-redesign-design-v2/screenshots/` để working tree chỉ chứa đúng các thay đổi thuộc #572 (RT-8).
  3. Chạy `pnpm check:fix` (nếu cần format) rồi chạy cổng kiểm tra đọc-only `pnpm check`, `pnpm check-types`, và `pnpm test`.
- **Success criteria:** Cả 4 lệnh `design:compare`, `pnpm check`, `pnpm check-types`, `pnpm test` đều thoát `0` với 0 lỗi, và `git status --porcelain` không chứa file rác ngoài danh sách của plan.
- **Verify:** `node scripts/design-compare/capture.mjs --screens t-class-detail,t-student-detail,s-dashboard,s-class-detail && git checkout -- plans/261020-1446-378-redesign-design-v2/screenshots/ && pnpm check && pnpm check-types && pnpm test` exits `0`.

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e exec playwright test specs/class-assign.spec.ts specs/notifications-ac-001.spec.ts` exits `0`.
- `node scripts/design-compare/capture.mjs --screens t-class-detail,t-student-detail,s-dashboard,s-class-detail && git checkout -- plans/261020-1446-378-redesign-design-v2/screenshots/` exits `0`.
- `pnpm check && pnpm check-types && pnpm test` exits `0`.

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
