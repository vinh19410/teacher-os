# Journal: Thêm Mini Calendar (`Lịch tháng`) vào `/teacher/dashboard` (#976)

- **Date:** 2026-11-26 09:49 (Europe/London · business TZ `Asia/Ho_Chi_Minh`)
- **Issue:** [#976](https://github.com/vinh19410/teacher-os/issues/976)
- **Branch:** `vinh19410/Add-calendar-teacher-dashboard`
- **Plan:** `plans/261126-0804-teacher-dashboard-month-calendar/plan.md`
- **Component:** `/teacher/dashboard` (`apps/web`)
- **Status:** Resolved

## Bối cảnh & Thay đổi đã giao

Bổ sung widget **Lịch tháng** (`MonthCalendarSection`) dạng chỉ xem (read-only) vào đầu cột phải `/teacher/dashboard` — ngay phía trên `Cần kiểm tra` (`RiskStudentsSection`) và `Toàn trung tâm` (`OrgStatsSection`) — khớp bản thiết kế `open-design/teacher.html` mà không đụng API server, DB schema hay wire contract.

Các tệp đã hoàn thiện trong phạm vi khoá:
- Selector thuần & lưới tháng UTC: `apps/web/src/lib/dashboard-calendar.ts` và export `compareLessonTime` từ `apps/web/src/lib/dashboard-from-kernel.ts`.
- UI widget: `apps/web/src/components/dashboard/month-calendar-section.tsx`.
- Tích hợp route: `apps/web/src/routes/_auth/dashboard.tsx`.
- Unit & integration tests: `apps/web/src/lib/dashboard-calendar.test.ts` (10 tests) và `apps/web/src/routes/_auth/dashboard.test.tsx` (15 tests).
- Bộ 6 ảnh POT: `plans/reports/976-dashboard-calendar-{1440,768,375}-{light,dark}.png` và cập nhật `CHANGELOG.md`.

## Thực tế triển khai

Nhìn bề ngoài một mini calendar read-only nghe có vẻ nhẹ nhàng, nhưng phần tốn sức nhất lại không phải dựng lưới 7 cột mà là phòng thủ trước dữ liệu legacy, bẫy múi giờ cuối tháng và môi trường kiểm chứng. Cảm giác vừa khó chịu vừa tỉnh người khi bộ unit test tự viết theo TDD đã xanh nhưng vòng local `code-reviewer` vẫn bóc ra 2 lỗ hổng assertion mức **Important** — đúng hai đường biên dễ trượt nhất (lớp trộn dated+undated và reset trạng thái khi bấm `"Hôm nay"` từ tháng khác). Thêm vào đó, chạy Vitest bị timeout vì VM chật RAM và `design:compare` vấp ảnh trắng thoáng qua trên `phone-dark` tạo cảm giác bực bội vì phải phân biệt lỗi hạ tầng với lỗi code thật. Đổi lại, cảm giác nhẹ nhõm rất rõ khi vòng Red-Team trước khi code đã chặn đứng 12 bẫy (từ `TS4104`, `noArrayIndexKey` đến rollover `31/10 → 01/11`) từ trên giấy thay vì chờ đỏ CI hay vỡ ở production.

## Quyết định kỹ thuật & Đánh đổi

1. **Allowlist fail-closed `activeClassById` (`status === "active"`) thay vì blocklist `pausedIds` hay tái sử dụng helper `/schedule`:**
   - *Bác bỏ:* blocklist `pausedIds` (fail-open với `classId` mồ côi và gây bất đối xứng giữa nhánh dated/undated) và `buildMonthCells`/`resolveWeekColumnEntries` của `/schedule` (giữ lịch sử lớp `paused`, giữ `holiday`, cắt 3 mục/ô và render 42 ô tràn tháng).
   - *Kết quả:* Loại 100% lịch sử `completed`/`absent` của lớp `paused`, dòng mồ côi không có trong `classes` và toàn bộ buổi `cancelled`/`holiday` (`TOS-11`), đồng thời dedup bằng khoá phút `parseTimeToMinutes(time) ?? time.trim()` và sắp xếp bằng `compareLessonTime`.

2. **Mô hình Hybrid 1-pass cho lớp legacy không ngày (`lesson.date == null || lesson.date === ""`):**
   - *Bác bỏ:* khớp thuần theo thứ `lesson.day` cho mọi lớp legacy vì sẽ chấm ảo vô tận từ 1970 đến 2099 khi người dùng lướt tháng.
   - *Kết quả:* Lọc bỏ `holiday` **trước** khi gọi `buildClassSessions` (đúng `TOS-11` I4 tại `class-sessions.ts:370`), đẩy thẳng lớp trộn dated+undated sang fallback theo thứ để không đếm lệch về `startDate`, và gắn ngày `dateISO` hữu hạn cho lớp legacy thuần có cấu trúc. Đây là **lệch có chủ đích** so với `lessonsToday` (`dashboard-from-kernel.ts:56-58`).

3. **Chỉ đọc buổi dạy thật & khoá chặt A11y/E2E/Reflow:**
   - *Bác bỏ:* trộn `data.events`/`data.holidays` hoặc biến ô ngày thành link sang `/teacher/schedule` (phình phạm vi và lệch `open-design/teacher.html`).
   - *Kết quả:* Cấm tuyệt đối chuỗi `"ca dạy"` để bảo vệ `daily-attendance.spec.ts:201`; dùng 1 vùng `aria-live="polite"` `sr-only` duy nhất có nội dung không trùng text hiển thị; gom state nguyên tử `{ viewYm, selectedIso }` với rollover nửa đêm `Asia/Ho_Chi_Minh` an toàn qua đêm cuối tháng; khôi phục focus bằng `todayBtnRef`; và header `flex-wrap` chịu được `320px` + `pointer: coarse`.

## Sự cố, Điểm vướng & Cách xử lý

- **12 phát hiện Red-Team trước khi viết code:** Bắt sớm lỗi biên dịch `TS4104` trên mảng `readonly` trả ra từ `sessionsForDashboardDate`, lỗi Biome `lint/suspicious/noArrayIndexKey` ở các ô trống đầu tháng (đổi sang hằng `LEADING_BLANK_KEYS`), bẫy rollover cuối tháng cướp `viewYm`, thiếu tiền lọc `holiday` trước `buildClassSessions`, header vỡ ở `320px` + `pointer: coarse`, và xung đột text giữa vùng `sr-only` với DOM hiển thị.
- **Worktree mới thiếu tệp sinh `apps/web/src/routeTree.gen.ts`:** Chạy `VITE_SERVER_URL=http://localhost:8000 pnpm exec turbo run check-types --filter=web` để sinh lại route tree trước khi kiểm tra kiểu.
- **Vitest timeout trên VM giới hạn tài nguyên:** Số worker mặc định không trần làm kiệt tài nguyên; chạy với `CI=1` (khớp `maxWorkers: 2` trong `vitest.config.ts`) xử lý dứt điểm.
- **Ảnh chụp trắng thoáng qua ở `design:compare` (`phone-dark`):** Lỗi race pre-paint đã biết bị pixel check chặn; chạy lại `design:compare` pass đủ `6/6`.
- **Trùng chuỗi con trong truy vấn Playwright khi kiểm POT:** `getByRole("button", { name: "Hôm nay" })` khớp nhầm vào `aria-label` của nút ngày hôm nay trên lưới lịch; sửa bằng `{ name: "Hôm nay", exact: true }`.
- **2 lỗ hổng assertion mức Important do local `code-reviewer` phát hiện:** Thiếu test chứng minh nhánh fallback lớp trộn dated+undated tại ngày `2026-10-14` kèm hợp nhất/sắp xếp liên bucket, và thiếu kịch bản chọn một ngày tháng 11 trước khi bấm `"Hôm nay"` để chứng minh `selectedIso`, agenda và `liveRegion` cùng reset. Cả hai đã được bổ sung và chốt xanh.

## Bài học rút ra

1. **Test xanh chưa đồng nghĩa đã chứng minh nhánh biên:** Khi viết test cho nút reset (`"Hôm nay"`), phải chủ động đưa state ra khỏi trạng thái mặc định (chọn ngày ở tháng khác) trước khi bấm; nếu không, test chỉ xác nhận trạng thái ban đầu một cách vô ích.
2. **Luôn truyền `exact: true` với `getByRole` khi nút điều khiển trùng nhãn với `aria-label` con:** Nhãn `"Hôm nay"` chắc chắn sẽ xuất hiện bên trong accessible name của ô ngày hiện tại — đừng để Playwright khớp mơ hồ.
3. **Đừng lướt qua môi trường VM/worktree sạch:** Worktree mới luôn cần bước sinh `routeTree.gen.ts`, và chạy Vitest trên VM hạn chế phải bật `CI=1` ngay từ đầu để khỏi mất thời gian debug timeout giả.
4. **Hàng rào dữ liệu phải là allowlist, không phải blocklist:** Với dữ liệu kernel có lớp `paused`, dòng mồ côi và buổi `holiday` legacy, lọc theo allowlist `status === "active"` và tiền lọc `holiday` trước `buildClassSessions` giúp tránh rò rỉ âm thầm về sau.

## Bước tiếp theo

- **Người thực hiện (session hiện tại — ngay sau journal):** Commit và push thay đổi (tuyệt đối không stage file tham chiếu `open-design/teacher.html` hay spec tạm), mở PR cho Issue #976.
- **Người thực hiện (ngay sau push):** Đăng bình luận POT lên Issue #976 đính kèm permalink theo commit SHA cho đủ 6 ảnh `plans/reports/976-dashboard-calendar-{1440,768,375}-{light,dark}.png` và danh sách gate đã kiểm chứng.
- **Tự động (CI/CD sau merge):** Theo dõi CI quality và smoke check staging để xác nhận không có hồi quy trên `/teacher/dashboard`.
