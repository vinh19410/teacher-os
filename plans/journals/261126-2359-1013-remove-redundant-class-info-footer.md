# Journal: Gỡ thanh footer dư thừa trên `ClassInfoCard` của trang chi tiết lớp học viên (#1013)

- **Date:** 2026-11-26 23:59 (Europe/London · business TZ `Asia/Ho_Chi_Minh`)
- **Severity:** Low
- **Issue:** [#1013](https://github.com/vinh19410/teacher-os/issues/1013)
- **Branch:** `vinh19410/fix-remove-redundant-class` (mode: `--ship --beta`, target: `develop`)
- **Plan:** `plans/261126-2322-remove-redundant-class-info-footer/plan.md`
- **Component:** `ClassInfoCard` — Student Class Detail (`/classes/$classId` — `apps/student`, `apps/e2e`, `DESIGN.md`)
- **Status:** Resolved

## Bối cảnh & Thay đổi đã giao

Sau khi #1010 dựng lại 3 tab trên `/classes/$classId` với thẻ `JourneyNextStopHero` ("Buổi tiếp theo"), thanh footer ngăn bằng `border-t` ở đáy `ClassInfoCard` (`apps/student/src/components/class/class-info-card.tsx`, di sản từ bản mẫu design v2 `StudentClass.tsx`) trở nên thừa thãi: lặp khung giờ `{timeRange}` đã có ở mục **Lịch**, lặp dòng `Buổi tới: ...`, và kéo theo nhãn ước lượng `{months} tháng`.

Thay đổi gọn sạch (`7 files changed, +92/-140`):
- Gỡ hoàn toàn khối footer `border-t` và dọn sạch mã chết (`computeCourseMonths`, `parseISODateUTC`, `ISO_DATE_RE`, các icon `CalendarClock`/`Clock`/`Hourglass` cùng import `parseSchedule`, `findNextLessonId`, `lessonDayLabel`).
- Bỏ hai prop thừa `todayISO`/`now` trên `ClassInfoCard` và cập nhật đủ cả hai caller (`apps/student/src/components/class/class-detail-view.tsx` và `apps/student/test/class-detail.test.tsx`).
- Cập nhật `DESIGN.md` (ghi rõ mục **Lệch có chủ đích**) và `CHANGELOG.md`.
- Toàn bộ gate xanh: `biome check`, `check-types` (15/15), `apps/student` unit test (76/76 files, 796/796 tests), full `pnpm test`, targeted E2E `apps/e2e/specs/student-class-detail.spec.ts` (4/4), `pnpm design:compare --screens s-class-detail --force` (18 images, 0 errors), reflow `320px–1440px` (0px tràn ngang), dark theme persistence, keyboard focus, và 4 ảnh POT sạch PII (`plans/reports/1013-class-info-card-{desktop,dark,tablet,mobile}.png`).

## Thực tế triển khai

Bề ngoài đây đúng kiểu việc "xoá 25 dòng JSX rồi về nhà", nhưng chính tâm lý chủ quan đó mới là cái bẫy khó chịu nhất. May mà không nhảy thẳng vào xoá code: vòng Red Team (2 reviewer: Security Adversary + Assumption Destroyer) bóc ra ngay 6 vấn đề mà nếu bỏ qua sẽ tạo ra một PR bẩn — từ việc sót caller test thứ 2, suýt xoá oan 2 test của `ClassAssignmentTable` dùng chung `describe`, tới cái bẫy TDD Red pass giả khi truyền `todayISO=undefined` khiến `date >= undefined === false` làm footer biến mất trước khi sửa component. Chưa kể lúc viết fixture TDD Red còn dính thêm cú vấp nhẹ vì quên `SCHEDULE_DAY_NAMES` đánh chỉ số từ 0 (`[1, 4]` ra `T3 & T6`, không phải `T2 & T5`). Khá thấm mệt khi một task nhỏ vẫn phải canh chừng từng góc chết như 9 file PNG lịch sử bị `design:compare`/E2E ghi đè hay vệ sinh PII cho ảnh POT, nhưng đổi lại cực kỳ nhẹ nhõm khi độc lập `code-reviewer` trả **Approve** ngay vòng đầu (0 Critical, 0 Important, 3 Minor).

## Quyết định kỹ thuật & Đánh đổi

1. **Gỡ hẳn thanh footer thay vì giữ có điều kiện cho lớp không lịch định kỳ hoặc các tab phụ (`?tab=assignments`, `?tab=materials`), đồng thời ghi nhận trong `DESIGN.md`:**
   - *Bác bỏ:* Giữ footer khi `cls.schedule === ""` hoặc khi người dùng rời tab mặc định.
   - *Lý do:* Giữ nhánh điều kiện làm tái phát đúng mảnh thông tin rời rạc mà yêu cầu #1013 muốn dẹp bỏ; chấp nhận đánh đổi có chủ đích là thông tin buổi tới tập trung duy nhất ở tab **Hành trình học** và khóa thành tài liệu tại mục **Lệch có chủ đích** của `DESIGN.md`.
2. **Bác bỏ finding #6 của Red Team về chuẩn hóa RFC 6068/Bidi cho `href="mailto:${teacherEmail}"`:**
   - *Bác bỏ:* Sửa thêm kiểm định `mailto:` trong `class-info-card.tsx` và `class-detail-view.tsx`.
   - *Lý do:* Hành vi sẵn có ngoài phạm vi #1013 và đọc trực tiếp từ `user.email` đã qua Better Auth kiểm định; giữ diff bám sát yêu cầu.
3. **Ghi nhận minor về `truncate` trên `<dd>` mục `Lịch` ở mobile/tablet làm follow-up ngoài phạm vi:**
   - *Bác bỏ:* Nới lại layout lưới `<dl>` ngay cuối phiên review.
   - *Lý do:* Không phải hồi quy của #1013; sửa ở phút chót chỉ tăng rủi ro lệch snapshot không cần thiết.

## Chi tiết kỹ thuật & Điểm vướng đã xử lý

- **Bẫy TDD Red pass giả & 4 test fail đúng nghĩa:** Giữ nguyên signature `ClassInfoCard` khi chạy Red để tránh `date >= undefined === false` triệt tiêu dòng `Buổi tới:` giả tạo; xác nhận đủ 4 test fail trước khi xoá footer và bắt kịp quy ước 0-indexed của `SCHEDULE_DAY_NAMES` (`{"days":[1,4],"start":"19:00","end":"20:30"}` → `T3 & T6 · 19:00–20:30`).
- **Tách sạch block `describe` dùng chung:** Khi bỏ test `computeCourseMonths` trong `apps/student/test/class-detail.test.tsx`, giữ nguyên 2 test của `ClassAssignmentTable` bằng cách đổi tiêu đề block thay vì xoá cả cụm.
- **Chống bẩn git & rò PII khi verify hình ảnh:** Khoanh vùng không để 9 PNG lịch sử bị E2E/`design:compare` ghi đè lọt vào diff, và chụp 4 ảnh POT hoàn toàn trên dữ liệu synthetic của stack E2E cô lập.
- **3 Minor từ independent `code-reviewer` (Approve):** Bổ sung assertion có thể phản chứng `expect(infoCard).not.toContainText("18:30")` trong `apps/e2e/specs/student-class-detail.spec.ts`, hoàn thiện metadata plan, và ghi nhận follow-up `truncate` cho `Lịch` `<dd>`.

## Bài học rút ra

1. **Task UI càng trông đơn giản càng phải quét đủ caller và cấu trúc file test trước khi xoá:** Một block `describe` ghép chung (`computeCourseMonths & ClassAssignmentTable`) rất dễ làm bay luôn test của component không liên quan.
2. **Không sửa prop trước khi chạy TDD Red:** Trong JS, so sánh với `undefined` âm thầm trả `false` và tạo test xanh giả vô giá trị.
3. **Assertion phủ định trong E2E phải phản chứng được với dữ liệu thật của test:** Kiểm tra `not.toContainText("Buổi tới:")` thôi chưa đủ nếu không khóa thêm giá trị giờ thật (`"18:30"`) từ fixture của spec.
4. **Luôn soi `git status` sau E2E và `design:compare --force`:** Hai lệnh này có thể âm thầm ghi đè PNG lịch sử đang tracked trong repo.

## Bước tiếp theo

- **Chủ phiên hiện tại (ngay sau journal):** Commit sạch (loại trừ mọi PNG lịch sử ngoài phạm vi), ship nhánh `vinh19410/fix-remove-redundant-class` theo chế độ `--ship --beta` vào `develop`, và đăng comment POT lên Issue #1013 kèm permalink theo commit SHA cho 4 ảnh `plans/reports/1013-class-info-card-{desktop,dark,tablet,mobile}.png` cùng kết quả các gate.
- **Follow-up không chặn (khi tinh chỉnh responsive `ClassInfoCard`):** Xem xét xử lý `truncate` ở ô `<dd>` mục `Lịch` trên màn hình mobile/tablet ở một issue riêng ngoài #1013.
