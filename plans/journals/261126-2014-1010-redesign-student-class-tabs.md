# Journal: Redesign 3 tab Hành trình học, Bài tập và Tài liệu chung trên `/classes/$classId` (#1010)

- **Date:** 2026-11-26 20:14 (Europe/London · business TZ `Asia/Ho_Chi_Minh`)
- **Issue:** [#1010](https://github.com/vinh19410/teacher-os/issues/1010)
- **Branch:** `vinh19410/Redesign-student-class-page`
- **Plan:** `plans/261126-1754-redesign-student-class-tabs/plan.md`
- **Component:** Student Class Detail (`/classes/$classId` — `apps/student`, `apps/e2e`)
- **Status:** Resolved

## Bối cảnh & Thay đổi đã giao

Tái thiết kế trọn vẹn 3 tab (**Hành trình học**, **Bài tập**, **Tài liệu chung**) trên trang chi tiết lớp học viên `/classes/$classId` trong phạm vi thuần frontend (`apps/student`, không đụng backend, DB schema hay `@teacher-os/api` contracts). Trước khi code, nhánh chờ PR #1008 (#998, `670c9274`) merge vào `develop` rồi đồng bộ tuyến tính thêm PR #1009 (#994 Zoom recording R2) tại `2486609d` để tránh lệch nền khi lên nhánh chính.

Triển khai qua 5 pha TDD:
- **URL search sync (`apps/student/src/routes/_auth/classes/$classId.tsx`, `class-detail-helpers.ts`, `class-detail-view.tsx`):** Chuẩn hóa `parseClassDetailSearch` / `buildClassDetailSearch`, luôn gọi điều hướng với `resetScroll: false`, gắn `key={classId}` chặn rò state khi đổi lớp, và dùng `pendingSearchRef` giữ thứ tự cập nhật tìm kiếm không bị ghi đè.
- **Tab 1 — Hành trình học (`class-lesson-list.tsx`, `journey-summit-card.tsx`, `journey-next-stop-hero.tsx`):** Bổ sung `JourneySummitCard`, `JourneyNextStopHero`, trục lộ trình dọc 32px co/mở giữ nguyên cấu trúc module giáo trình #998 và đầy đủ parity cho luồng R2 `RecordingPlayerModal` của PR #1009.
- **Tab 2 — Bài tập (`class-assignments-tab.tsx`):** Dựng mới Todo Priority Strip, bộ lọc 4 trạng thái, 3 nhóm co/mở, link 1-click tới `/learn/quizzes/$assignmentId`, bảng 4 tiêu chí IELTS và nhánh `gradedAt && scores == null`; giữ nguyên vẹn `ClassAssignmentTable` cho `SessionDetailView`; cập nhật selector `role="row"` → `role="listitem"` trong `apps/e2e/specs/student-practice.spec.ts:546`.
- **Tab 3 — Tài liệu chung (`class-materials-tab.tsx`, `student-material-preview.tsx`):** Tìm kiếm tiếng Việt không dấu (debounce 300ms), lọc theo `kind`, xem trước PDF/ảnh on-demand qua `StudentClassMaterialPreviewButton` kèm blob fetch có self-heal khi dính 403, đóng/thu hồi khi đăng xuất liên tab qua `ACTIVE_STUDENT_USER_KEY` và phản ứng trực tiếp khi đổi `activeOrgId`; bổ sung bước E2E bấm xem trước PDF trong `apps/e2e/specs/class-shared-materials.spec.ts`.
- **Kiểm chứng & tài liệu:** 795/795 unit tests `apps/student` xanh, cập nhật `DESIGN.md` và `CHANGELOG.md`, lưu 12 ảnh POT `plans/reports/1010-student-class-*.png`.

## Thực tế triển khai

Nhìn ngoài tưởng chỉ là redesign UI trên 3 tab đã có sẵn API, nhưng thực tế đây là một màn "dò mìn" đúng nghĩa vì nhánh chạy sát ngay sau hai PR lớn (#1008 và #1009). Ức chế nhất là hai quả va tường không đáng có: một là tự tay chạy song song `pnpm check-types` với Playwright E2E khiến Turbo âm thầm build lại `apps/lms/dist` thiếu `VITE_SERVER_URL`, phá hỏng môi trường test đang sống ngay dưới chân mình; hai là ăn quả 404 ở `zoom-meeting.spec.ts:160` khi gộp 8 spec chạy chung và mất công đào tận `apps/e2e/local.db` mới chứng minh được đó là lỗi test-isolation có sẵn từ PR #1009, không phải do UI của mình. Nhưng cú đấm tỉnh người nhất vẫn là hai vòng code review độc lập moi ra tròn 18 phát hiện (12 lỗi vòng 1, 6 lỗi vòng 2) — thẳng thắn mà nói, chính mình đã bỏ sót parity `RecordingPlayerModal` của PR #1009 và cơ chế logout liên tab ngay trong vòng triển khai đầu, rồi tới vòng sửa đầu lại vô tình để `pendingSearchRef` lúc mount ghi đè deep-link `?tab=materials` và để việc `nextId` dịch chuyển giữa phiên đóng mất modal recording học viên đang xem. Mệt rã rời qua hai lượt vá và viết regression test, nhưng cực kỳ nhẹ nhõm khi toàn bộ 18 lỗi đều được khóa chặt bằng test (795/795 pass) và nhận **Approve** sạch sẽ.

## Quyết định kỹ thuật & Đánh đổi

1. **Tạo mới `ClassAssignmentsTab` và giữ nguyên vẹn `ClassAssignmentTable` cho `SessionDetailView`:**
   - *Bác bỏ:* Sửa trực tiếp `ClassAssignmentTable` cho cả trang chi tiết lớp lẫn trang chi tiết buổi học.
   - *Lý do:* Giảm rủi ro phá hợp đồng vừa merge của #998 trên `/classes/$classId/sessions/$date`, đồng thời cô lập rõ phạm vi đổi cấu trúc `<table>` sang `<ul><li>` ở Tab 2.
2. **Chạy tuần tự nghiêm ngặt giữa `pnpm check-types` và Playwright E2E thay vì chạy song song để tiết kiệm thời gian:**
   - *Bác bỏ:* Chạy song song typecheck và E2E trong cùng workspace.
   - *Lý do:* Turbo `pnpm check-types` kéo theo `apps/lms#build` không có `VITE_SERVER_URL` và ghi đè trực tiếp lên `apps/lms/dist` đang phục vụ E2E. Tốn thêm vài chục giây chạy nối tiếp còn hơn mất hàng chục phút gỡ lỗi nhiễu hạ tầng.
3. **Chứng minh gốc rễ lỗi 404 `zoom-meeting.spec.ts:160`, xác minh chạy lẻ `1/1` pass và mở issue riêng #1011 (`ai-handle`):**
   - *Bác bỏ:* Nới `MAX_CRON_REUP_PER_TICK` trong code production hay bỏ qua spec E2E.
   - *Lý do:* Đây là lỗi cô lập dữ liệu có sẵn của PR #1009 trên shared `apps/e2e/local.db` nằm ngoài phạm vi thuần frontend của #1010; giữ sạch ranh giới PR và theo dõi dứt điểm qua #1011.

## Sự cố, Điểm vướng & Cách xử lý

- **Race ghi đè `apps/lms/dist` khi chạy song song `pnpm check-types` và E2E:** `pnpm check-types` kích hoạt task `apps/lms#build` qua Turbo mà không có `VITE_SERVER_URL`, ghi đè trực tiếp bundle `apps/lms/dist` trong lúc Playwright đang chạy trên bản build đó. *Xử lý:* Tách sang thực thi tuần tự tuyệt đối — luôn chạy xong toàn bộ `check-types` rồi mới chạy E2E (hoặc ngược lại).
- **`zoom-meeting.spec.ts:160` trả 404 (kỳ vọng Range 206) khi chạy gộp 8 spec:** Khi gộp chung `zoom-meeting.spec.ts` với 7 spec lớp Online khác trên cùng `apps/e2e/local.db`, cron re-upload trong `apps/server/src/lib/zoom/session-zoom-service.ts:67` giới hạn `MAX_CRON_REUP_PER_TICK = 2` bị các bản ghi buổi Online của spec khác chiếm hết suất, khiến recording của `zoom-meeting.spec.ts` chưa được đưa lên R2 trước khi test gọi `/recording/video`. *Xử lý:* Truy vấn trực tiếp `apps/e2e/local.db` để chứng minh nguyên nhân gốc, chạy cô lập `zoom-meeting.spec.ts` xác nhận `1/1` pass, và tạo issue theo dõi #1011 (`ai-handle`).
- **18 phát hiện qua 2 vòng independent local code review:**
  - *Vòng 1 (12 lỗi):* Bỏ sót parity luồng R2 `RecordingPlayerModal` từ PR #1009 và chưa đóng/thu hồi preview blob khi tab khác logout qua `ACTIVE_STUDENT_USER_KEY` hoặc đổi `activeOrgId`. *Xử lý:* Khôi phục đầy đủ parity R2 trên Tab 1 và gắn listener `storage` cho `ACTIVE_STUDENT_USER_KEY` + cleanup theo `activeOrgId` trong `StudentClassMaterialPreviewButton`.
  - *Vòng 2 (6 lỗi):* Khởi tạo/đồng bộ `pendingSearchRef` lúc mount ghi đè tham số deep-link `?tab=materials`; chuyển dịch `nextId` giữa phiên làm đóng đột ngột `RecordingPlayerModal` đang mở. *Xử lý:* Sửa đồng bộ `pendingSearchRef` giữ trọn deep-link ban đầu và tách vòng đời trạng thái modal khỏi `nextId` trên cùng `classId`, thêm đủ regression test (`class-lesson-list.test.tsx:1207`, `class-materials-tab.test.tsx`, `class-detail-view.test.tsx`) đẩy bộ unit test `apps/student` lên `795/795` pass trước khi nhận **Approve**.

## Bài học rút ra

1. **Cấm chạy `pnpm check-types` song song với E2E trong cùng worktree:** Bất kỳ lệnh Turbo nào kéo theo `apps/lms#build` mà thiếu `VITE_SERVER_URL` đều có thể phá hủy `apps/lms/dist` của E2E đang chạy. Coi `apps/lms/dist` là tài nguyên độc quyền theo từng bước tuần tự.
2. **Sau khi rebase/sync tuyến tính lên PR vừa merge, phải audit parity từng bề mặt giao nhau trước khi kết thúc vòng code đầu:** Đồng bộ lên `2486609d` (PR #1009) nhưng không đối chiếu ngay luồng `RecordingPlayerModal` ở Tab 1 đã trực tiếp sinh ra loạt lỗi nặng nhất ở vòng review 1.
3. **Mọi ref đồng bộ URL (`pendingSearchRef`) và trạng thái modal phải được test cả hai chiều: deep-link lúc mount và dữ liệu refetch thay đổi giữa phiên:** Chỉ test thao tác click từ trạng thái mặc định sẽ bỏ lọt đúng hai lỗi khó chịu nhất ở vòng review 2.
4. **Khi E2E gộp fail kiểu 404/thiếu bản ghi, soi `apps/e2e/local.db` trước khi nghi code UI:** Kiểm tra trực tiếp DB giúp khoanh vùng ngay giới hạn `MAX_CRON_REUP_PER_TICK = 2`, tránh sửa nhầm frontend hoặc nới assertion.

## Bước tiếp theo

- **Chủ phiên hiện tại (ngay sau journal):** Commit và push toàn bộ thay đổi của nhánh `vinh19410/Redesign-student-class-page`, mở PR cho Issue #1010, và đăng comment POT lên #1010 kèm permalink theo commit SHA cho 12 ảnh `plans/reports/1010-student-class-*.png` cùng kết quả các gate đã chạy.
- **Chủ sở hữu xử lý #1011 (sau PR #1010):** Xử lý lỗi test-isolation của `MAX_CRON_REUP_PER_TICK = 2` trên `apps/e2e/local.db` cho `zoom-meeting.spec.ts` để spec không bị 404 khi gộp chung nhiều spec lớp Online.
