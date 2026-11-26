# Journal: Ghi đè buổi học thủ công khi nhập giáo trình cho lớp (#995)

- **Date:** 2026-11-26 16:15 (Europe/London · business TZ `Asia/Ho_Chi_Minh`)
- **Issue:** [#995](https://github.com/vinh19410/teacher-os/issues/995)
- **Branch:** `vinh19410/Force-Overwrite-Giáo-Trình`
- **Plan:** `plans/261126-1447-overwrite-manual-sessions-on-curriculum-import/plan.md`
- **Severity:** High
- **Component:** Curriculum Import & Class Sessions (`packages/api`, `apps/server`, `apps/web`, `apps/e2e`)
- **Status:** Resolved

## Bối cảnh & Thay đổi đã giao

Trước đây `POST /api/classes/:id/curriculum/import` chặn cứng mọi lớp đã có dòng `class_session` mà không có lối thoát, khiến giáo viên lỡ tạo buổi thủ công chưa điểm danh phải xóa tay từng buổi trước khi nhập giáo trình mẫu. Thực tế triển khai cho thấy một thao tác tưởng chừng chỉ là "hỏi xác nhận rồi `DELETE` + `INSERT`" lại chạm đúng vùng nguy hiểm nhất của hệ thống: giao dịch phá hủy đa bảng trên Cloudflare D1, đồng bộ Zoom/recording bất đồng bộ và phân quyền.

Các tệp đã hoàn thiện trong phạm vi khóa:
- **Contract & helper thuần dùng chung:** `packages/api/src/contracts.ts` (`CURRICULUM_IMPORT_ERROR_CODES`, `importSyllabusSchema.strict()` với `overwriteManualSessions` và `overwriteHash`), `packages/api/src/curriculum-overwrite.ts` (`isManualLessonSettled`, `projectCurriculumDates`, `classifyManualSessionDates`), kèm `packages/api/src/curriculum-overwrite.test.ts` (7 tests).
- **Server nguyên tử & đồng bộ Zoom/lịch:** `apps/server/src/routes/syllabus.ts` (`computeOverwriteHash`, `analyzeManualSessionsConflict`, nhánh force-overwrite CAS đa bảng + đồng bộ Zoom), `apps/server/src/lib/syllabus-curriculum.ts` (`findExistingMaterialIds` chunk 50), `apps/server/src/routes/enrollment-activation.ts` (chặn gắn `joinUrl` lên buổi `holiday`/`cancelled`), kèm `apps/server/src/curriculum-overwrite.test.ts` (9 tests).
- **Web UX & client repo:** `apps/web/src/components/modals/import-syllabus-modal.tsx`, `apps/web/src/lib/data-actions.ts`, `apps/web/src/lib/kernel-load-state.ts`, `apps/web/src/lib/repos/kernel.ts` (`encodeURIComponent(action.classId)` + parse metadata lỗi 409), kèm `apps/web/src/components/modals/import-syllabus-modal.test.tsx` (10 tests) và `apps/web/src/lib/repos/kernel.test.ts` (69 tests).
- **E2E & POT:** `apps/e2e/specs/syllabus-class-curriculum.spec.ts` (6 tests, bổ sung kịch bản F cho #995) và 12 ảnh chụp 3 viewport Light/Dark `plans/reports/995-overwrite-{confirm,result}-{desktop-1440x900,tablet-768x1024,mobile-375x812}-{light,dark}.png`.

## Quyết định kỹ thuật & Đánh đổi

1. **Ghi đè toàn bộ buổi thủ công sang chế độ `auto` (bảo toàn bất biến `#670`), bác bỏ chế độ lai:**
   - Giữ buổi thủ công khác ngày song song giáo trình sẽ phá vỡ nguồn chân lý đơn giữa `class_session` và `syllabus`, kéo theo sai lệch gói buổi và lịch nghỉ lễ. Khi giáo viên đồng ý ghi đè, toàn bộ buổi thủ công chưa điểm danh cùng `lesson_material`, `holiday_session_shift`, `holiday_session_cancel` bị dọn sạch, lớp chuyển hẳn sang `auto` và giữ nguyên tài liệu chung `class_material`.
   - Mọi buổi đã điểm danh/hoàn thành (`completed`, `absent`, có `attendance` hoặc `attendanceNote`, kể cả dòng legacy `date: null`) luôn bị chặn cứng bằng `409 MANUAL_SESSIONS_COMPLETED`.
   - Lớp `auto` đã gỡ giáo trình trước đó (0 `class_session`, còn `lesson` thật) không bao giờ bị xóa `lesson` ngay cả khi payload cố tình truyền `overwriteManualSessions: true`.

2. **Bác bỏ `preservedZoomByDate` in-memory; upsert `class_session_meeting` nguyên tử ngay trong `db.batch`:**
   - Ý tưởng ban đầu giữ link Zoom dán tay trong một `Map` bộ nhớ rồi nhồi lúc sinh `lesson` bị vỡ ngay với lớp 0 học viên, lớp `paused` (chưa backfill), luồng self-heal hoặc học viên kích hoạt sau này. Thay vào đó, link `class_session.zoom` ở các ngày dạy hiệu lực (`activeDates`) được upsert trực tiếp vào `class_session_meeting` trong cùng `db.batch`, còn Zoom Cloud đồng bộ hậu-batch bằng `syncZoomMeetingsAfterReschedule` (`updateMeeting` ngày giữ lại, `deleteMeeting` ngày bỏ).

3. **Chống TOCTOU hai tầng (`overwriteHash` + CAS đa bảng) dưới trần 100 bind params của D1:**
   - Khóa liên request bằng `overwriteHash` (SHA-256 trên `JSON.stringify` của `classId`, `templateId`, `startDate`, `schedule`, `status`, `lessonCount`, `manualDates`, `activeDates`). Khóa nội request bằng CAS chạy trước mọi câu `DELETE` trong `db.batch`, kiểm đủ `startDate`, `schedule`, `status`, `NOT EXISTS` buổi settled, đúng tập ngày `class_session` (tách `MANUAL_DATE_CAS_CHUNK = 50`), tổng số meeting, số meeting có `recording_url` và số bài template.
   - Mọi thao tác theo danh sách id/ngày đều cắt lô để không bao giờ chạm trần 100 binds của D1: `findExistingMaterialIds` dùng `MATERIAL_ID_CHUNK = 50`, CAS ngày dùng chunk 50, xóa/dọn meeting dùng `DATE_ONLY_REMAP_CHUNK`.

4. **Khóa phân quyền phá hủy bằng `canManageClassStatus`:**
   - Trợ giảng (`ta`) bị chặn cứng `403 FORBIDDEN` khi gọi `overwriteManualSessions: true`, tránh để vai trò không có quyền quản lý trạng thái lớp xóa hàng loạt buổi học, tài liệu buổi và phòng Zoom.

## Sự cố, Điểm vướng & Cách xử lý

Sự thật phũ phàng của đầu việc này: kế hoạch ban đầu quá lạc quan về cạnh biên giao dịch. Phải qua **11 phát hiện Red Team (RT-1..RT-11)** trước khi code mới tránh được thảm họa kiến trúc — nhưng cay đắng hơn là ngay sau khi code xong và tưởng đã kín, lượt **independent pre-landing `code-reviewer`** vẫn tóm thêm **7 lỗ hổng (2 Critical, 3 Important, 2 Suggestion)** đủ sức xóa mất dữ liệu thật nếu đẩy thẳng lên production.

- **11 phát hiện Red Team (RT-1..RT-11) đã khóa trước và trong khi triển khai:**
  - **RT-1 (Critical):** Bổ sung RBAC guard `canManageClassStatus` (`ta` → `403 FORBIDDEN`).
  - **RT-2 (Critical):** Bỏ `preservedZoomByDate` in-memory, thay bằng upsert `class_session_meeting` nguyên tử trong batch.
  - **RT-3 (Critical):** Thêm `overwriteHash` chống TOCTOU liên request, mở rộng CAS kiểm tập ngày/lịch/meeting thay vì chỉ `count(*)`, và trả `409 CLASS_STATE_CHANGED` khi buổi cuối bị xóa đồng thời (không nổ 500 hoặc trả `manualSessionCount: 0`).
  - **RT-4 (Critical):** Mô phỏng kỳ nghỉ `shift`/`cancel` để tách `activeDates` khỏi ngày `holiday`/`cancelled`, dọn meeting ở `makeupDate` cũ và giữ nguyên `recordingUrl`.
  - **RT-5 & RT-6 (High):** Chặn `422 CURRICULUM_INVALID_CLASS_SCHEDULE` cho lớp `schedule` legacy hoặc `startDate` rỗng/phi-ISO; bọc `planHolidayShift` không cho ném exception khi chạm trần `SCAN_CAP_DAYS` (364 ngày) mà trả discriminated union → `422 CURRICULUM_HOLIDAY_SCAN_CAP`.
  - **RT-7 & RT-8 (High):** Dùng `syncZoomMeetingsAfterReschedule` để gọi `updateMeeting` trên phòng giữ lại; chunk `findExistingMaterialIds` theo lô 50; trả đủ metadata 409 ở nhánh race `class_session` và kiểm `settledLessons.length > 0` kể cả `date: null`.
  - **RT-9, RT-10, RT-11 (High/Medium):** Gia cố state machine của `ImportSyllabusModal` (khớp `pendingOverwrite.templateId === templateId`, khóa `submitBlocked`, chặn `Enter` gửi nhầm, refresh cảnh báo khi gặp 409 mới), thay `formatSessionDate` thiếu năm bằng `formatConflictDate` (`"Thứ ..., dd/mm/yyyy"`), thêm `.strict()` cho `importSyllabusSchema` và `encodeURIComponent(action.classId)` trong `kernelCommand`.

- **7 phát hiện từ independent pre-landing `code-reviewer` đã vá dứt điểm:**
  1. *(Critical)* **Race xóa mất link bản ghi Zoom (`recording_url`):** Nếu webhook ghi `recording_url` vào dòng `class_session_meeting` ngay giữa bước đọc và câu `DELETE` của batch, bản ghi sẽ bay màu vĩnh viễn. Đã khóa `count(*)` với `trim(recording_url) != ''` trong CAS đồng thời thêm guard `trim(recording_url) = ''` trực tiếp vào `DELETE`.
  2. *(Critical)* **Lọt TOCTOU khi trạng thái lớp, lịch nghỉ hoặc template đổi giữa 2 bước xác nhận:** `computeOverwriteHash` ban đầu chưa băm đủ ngữ cảnh và CAS chưa khóa số bài của template. Đã đưa `status`, `lessonCount`, `activeDates` vào `computeOverwriteHash` (serialize bằng `JSON.stringify`) và bổ sung CAS đếm `syllabus_lesson INNER JOIN syllabus_module` khớp `lessonCount`.
  3. *(Important)* **Lệch lịch nghỉ trên lớp `paused` và gán nhầm Zoom lên buổi nghỉ:** Đã đồng nhất dùng `loadClassHolidays` cho cả lớp `paused` (khớp với `materializeScheduleForEnrollment`), đồng thời sửa `apps/server/src/routes/enrollment-activation.ts` chặn gán `joinUrl` cho dòng có `status === "holiday"` hoặc `"cancelled"`.
  4. *(Important)* **Nhánh `catch` của `db.batch` đọc dữ liệu cũ khi CAS/FK fail:** Đã đưa bước kiểm tra `findTemplate` (trả `404` nếu template vừa bị xóa) và nạp lại `selectTemplateTree` tươi ra ngoài nhánh `FOREIGN KEY` để mọi nhánh phục hồi 409 đều tính trên cây bài học mới nhất.
  5. *(Important)* **Thiếu bằng chứng kiểm tra chunk thứ 3 (>100 items) và cô lập org trong `findExistingMaterialIds`:** Bổ sung test chèn tài liệu thứ 106 thuộc org khác (`mat-cross-org-106`) vào `apps/server/src/curriculum-overwrite.test.ts` xác nhận trả `422 CURRICULUM_MATERIAL_NOT_FOUND`.
  6. *(Suggestion)* **Lệch thứ tự tiêu đề Zoom khi kỳ nghỉ dùng `mode: "cancel"`:** Chuyển ánh xạ `topicByActiveDate` sang dùng `nonHolidayDates` (giữ slot `cancelled`, bỏ `holiday`) để ordinal bài học không bị trượt khi cập nhật Zoom Cloud.
  7. *(Suggestion)* **Nút xác nhận trong `ImportSyllabusModal` bị cuộn khuất trên màn hình nhỏ:** Ghim cụm nút hành động vào prop `footer` của `<Modal>` kết hợp `scrollableBody`.

## Bài học rút ra

1. **Mọi câu `DELETE` phá hủy trên bảng có cột được cập nhật bất đồng bộ (như `recording_url`) phải tự mang điều kiện bảo vệ ở chính câu `DELETE` và trong CAS:** Đừng tin vào kết quả `SELECT` chạy trước đó vài mili-giây; trong môi trường Cloudflare Workers/D1, webhook hoàn toàn có thể chen vào giữa read và batch.
2. **Hash xác nhận hai bước (`overwriteHash`) phải phủ toàn bộ đầu vào quyết định tập ngày bị tác động và dùng `JSON.stringify`:** Bỏ sót `status`, `lessonCount` hay `activeDates` đồng nghĩa giáo viên bấm "Đồng ý" trên một bản xem trước đã lỗi thời mà server vẫn cho qua.
3. **Chunking dưới trần 100 binds của D1 chỉ đáng tin khi có test đâm xuyên mốc 100 phần tử:** Test với 3–5 phần tử luôn xanh trên `@libsql/client`; chỉ khi đẩy 105 tài liệu hợp lệ + phần tử thứ 106 sai org vào chunk thứ 3 mới chứng minh được cả vòng lặp chunk lẫn bộ lọc `orgId` đều hoạt động thật.
4. **Đừng bao giờ tự tin bỏ qua bước review độc lập sau khi đã chạy Red Team lúc lập kế hoạch:** Red Team diệt lỗi thiết kế trên giấy, nhưng chỉ có đọc kỹ từng câu SQL và nhánh `catch` sau khi code xong mới lộ ra các kẽ hở race condition thật.

## Bước tiếp theo

- **Chủ nhánh (ngay sau phiên này):** Commit toàn bộ mã nguồn, test, plan, journal và 12 ảnh POT bằng `ak-git cp`, tạo PR cho issue `#995` và đăng comment POT kèm permalink theo commit SHA lên issue `#995` theo quy ước repo.
- **CI / Release gate (trước khi merge vào `main`):** Chờ xanh toàn bộ `quality.yml` và full E2E trên GitHub Actions (`e2e.yml`).
- **Bảo trì dài hạn:** Mọi tính năng mới chạm tới `class_session` / `class_session_meeting` hoặc import giáo trình cần giữ nguyên bất biến `#670`, không bỏ qua `findExistingMaterialIds` chunking và giữ guard `trim(recording_url) = ''` khi dọn meeting.
