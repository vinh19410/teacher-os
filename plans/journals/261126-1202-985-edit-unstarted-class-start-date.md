# Journal: Cho phép giáo viên thay đổi ngày khai giảng khi lớp chưa bắt đầu (#985)

- **Date:** 2026-11-26 12:02 (Europe/London · business TZ `Asia/Ho_Chi_Minh`)
- **Issue:** [#985](https://github.com/vinh19410/teacher-os/issues/985)
- **Branch:** `vinh19410/Edit-ngày-khai-giảng-khi-lớp-chưa-bắt-đầu`
- **Plan:** `plans/261126-0920-edit-unstarted-class-start-date/plan.md`
- **Component:** Classes (`packages/api`, `apps/server`, `apps/web`, `apps/e2e`)
- **Status:** Resolved

## Bối cảnh & Thay đổi đã giao

Trước thay đổi này, cả `PATCH /api/classes/:id` (`EditClassModal`) lẫn `POST /api/classes/:id/confirm-opening` (`ConfirmOpeningModal`) đều khóa cứng `startDate` ngay khi lớp có bất kỳ dòng `lesson` hoặc `class_session` nào (`409 CLASS_SCHEDULE_LOCKED`). Vì kích hoạt học viên đầu tiên sinh sẵn toàn bộ buổi `upcoming`, giáo viên không thể đổi ngày khai giảng ngay cả khi lớp chưa học buổi nào.

Các tệp đã hoàn thiện trong phạm vi khóa:
- Hợp đồng & helper thuần dùng chung: `packages/api/src/contracts.ts` (`CLASS_ERROR_CODES.START_DATE_LOCKED`), `packages/api/src/class-start-date.ts`, `packages/api/src/class-start-date.test.ts` (17 tests), `packages/api/src/class-update-schema.test.ts`.
- Đồng bộ nguyên tử trên server: `apps/server/src/lib/class-start-date-reschedule.ts`, `apps/server/src/lib/zoom/session-zoom-service.ts`, `apps/server/src/routes/enrollment-activation.ts`, `apps/server/src/routes/kernel.ts`, `apps/server/src/edit-class.test.ts` (15 tests), `apps/server/src/confirm-opening.test.ts` (10 tests).
- Giao diện Web & xử lý lỗi: `apps/web/src/routes/_auth/classes/$classId.tsx`, `apps/web/src/components/modals/edit-class-modal.tsx`, `apps/web/src/components/modals/confirm-opening-modal.tsx`, `apps/web/src/lib/use-kernel-form-submit.ts`, `apps/web/src/lib/repos/class-opening.ts`, kèm 90 tests trên `edit-class-modal.test.tsx`, `confirm-opening-modal.test.tsx`, `$classId.test.tsx`.
- Kiểm chứng E2E & POT: `apps/e2e/specs/edit-class.spec.ts` (6/6 tests pass), 6 ảnh POT `plans/reports/985-edit-start-date-{desktop,tablet,mobile}-{light,dark}.png`, và `CHANGELOG.md`.

## Quyết định kỹ thuật & Đánh đổi

1. **Tách `CLASS_SCHEDULE_LOCKED` khỏi `CLASS_START_DATE_LOCKED` với một nguồn chân lý dùng chung (`evaluateClassStartDateEditability`):**
   - Khóa cấu trúc (`schedule`, `sessionsTotal`) giữ nguyên theo `hasRealSessions`; khóa ngày khai giảng chỉ kích hoạt khi lớp có buổi `completed`/`absent`, có `attendance`/`attendanceNote`, có `cancelled` ngoài `holiday_session_cancel`, hoặc ở trạng thái fail-closed (legacy undated, `sessionsTotal > 52`, orphan `holiday`, phân mảnh ngày giữa các enrollment).
   - Không khóa theo mốc ngày hôm nay (`startDate <= todayVN`) để giáo viên vẫn hoãn khai giảng sát giờ nếu chưa điểm danh buổi nào; ngày mới vẫn phải `>= vietnamTodayISO()`.
   - Lớp `manual` chưa bắt đầu chỉ sửa metadata `class.startDate`, giữ nguyên ngày các buổi thủ công `class_session`.

2. **Đồng bộ nguyên tử trên Cloudflare D1 (`db.batch` + CAS + chunk `<= 100` binds):**
   - SQLite kiểm tra `UNIQUE`/`PRIMARY KEY` từng dòng trong `UPDATE`, nên dời ngày gối nhau dùng hai pha với tiền tố tạm `__shift__:` và kiểm tra bằng `substr(date, 1, 10) = '__shift__:'` (tránh bẫy wildcard `_` của `LIKE`).
   - Giới hạn 100 bound parameters/statement của D1 (không bị `@libsql/client` local chặn) được khóa cứng bằng `LESSON_REMAP_CHUNK = 18` (92 binds), `DATE_ONLY_REMAP_CHUNK = 30` (92 binds), Statement 0b tách từng chunk 40 ngày (≤ 46 binds/câu, không trần cứng 80 ngày), và spy đo thực tế `0 < maxBoundParams <= 100` trên lớp 52 buổi.
   - Thứ tự hoàn tác kỳ nghỉ bắt buộc khôi phục `holiday_session_cancel` trước `topologicalUnwindShifts` (tip→root) để không làm hồi sinh buổi bù đã hủy lễ; lớp `paused` giữ bất biến `#694`, chỉ tái đánh giá kỳ nghỉ đã gắn trước đó.

3. **Phân quyền `ta` và chính sách thông báo:**
   - Khóa vai trò `ta` (`403 FORBIDDEN` khi `startDateChanged` ở `PATCH /api/classes/:id` và `disabled` ở `EditClassModal`), đồng nhất với `confirm-opening`.
   - `EditClassModal` giữ im lặng (chỉ hiển thị gợi ý nhẹ nếu lớp đã chốt khai giảng), trong khi `ConfirmOpeningModal` (`initial`/`all`) commit dời lịch xong mới dựng/gửi email HTML từ `updatedRow`.

## Sự cố, Điểm vướng & Cách xử lý

- **10 phát hiện Red-Team trước triển khai:** Chặn sớm tràn trần 100 binds của D1, thứ tự unwind `cancels`/`shifts`, thiếu role gate `ta`, lớp 0 buổi có sẵn auto-Zoom, `LIKE` wildcard `_`, và `showScheduleConflicts` bị khóa bởi `!hasRealSessions`.
- **4 lỗi Important từ lượt local `code-reviewer` trước khi ship:**
  1. `kernel.ts` truyền `cls.schedule`/`cls.sessionsTotal` đã đọc cũ vào `applyClassStartDateChange` → chỉ truyền khi thực sự thay đổi để vòng retry CAS đọc tươi từ DB.
  2. Step D lọc `m.join_url != ''` làm hồi sinh `lesson.zoom` chết sau khi unwind holiday shift → bỏ điều kiện `!= ''` (buổi không có dòng `class_session_meeting` vẫn giữ link thủ công vì `EXISTS` trả false).
  3. Statement 0b có trần cứng 80 ngày → tách mỗi chunk 40 ngày thành 1 câu `UPDATE` CAS độc lập (≤ 46 binds/câu).
  4. `EditClassModal` chạy `findScheduleConflicts` trên lớp `manual` và giữ giá trị nháp khi nhận `409 CLASS_START_DATE_LOCKED` → bổ sung `!isManualMode` và reset `startDate` về `cls.startDate` khi `effectiveStartDateLocked` chuyển `false → true`.
- **Môi trường local & worktree:** Worktree mới cần chạy `VITE_SERVER_URL=http://localhost:8000 pnpm exec turbo run check-types --filter=web` để sinh `routeTree.gen.ts`; trên host chia sẻ, chạy Vitest với `CI=1` (hoặc `--maxWorkers=1` khi chạy lẻ) tránh timeout contention ở các test migration nặng.

## Bài học rút ra

1. **Test local trên `@libsql/client` không phát hiện giới hạn 100 binds của Cloudflare D1:** Mọi batch có `CASE WHEN` / `IN (...)` phụ thuộc `sessionsTotal` nên có spy đếm thực tế bound params trên cả `client.execute` và `client.batch` ở kích thước biên 52 buổi.
2. **Đừng truyền snapshot cũ qua biên retry:** Khi helper đã tự thiết kế vòng đọc-lại + CAS retry, caller chỉ nên truyền delta thực sự đổi, để giá trị không đổi luôn đọc tươi trong vòng retry.
3. **So sánh đồng bộ `lesson.zoom` phải coi chuỗi rỗng `""` là giá trị hợp lệ của `class_session_meeting`:** Khi buổi bù đã xóa Zoom, nguồn sự thật `join_url = ''` cần ghi đè lại `lesson.zoom` cũ còn sót từ dòng `holiday`.
