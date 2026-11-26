# Journal: Redesign `/student/` dashboard theo `open-design/redesign-student-dashboard` (#975)

- **Date:** 2026-11-26 11:10 (Europe/London · business TZ `Asia/Ho_Chi_Minh`)
- **Issue:** [#975](https://github.com/vinh19410/teacher-os/issues/975)
- **Branch:** `vinh19410/feat-redesign-student-dashboard`
- **Plan:** `plans/261126-0740-redesign-student-dashboard/plan.md`
- **Component:** `/student/` (`apps/student`)
- **Status:** Resolved

## Bối cảnh & Thay đổi đã giao

Tái thiết kế trọn vẹn trang tổng quan học viên `/student/` trong phạm vi thuần frontend (`apps/student/*`, 0 sửa server API, DB schema, wire contract hay `StudentShell`): thay KPI strip, `UpcomingSessions` và `TuitionList` cũ trên `/` bằng `GreetingHeader`, Top Grid 2 cột (`NextTaskHero` + `TodayScheduleCard` đồng bộ qua `/api/student/schedule`), `GoalProgressCard` (chỉ số onboarding thật + thước IELTS `4.0–9.0` trung thực + chân thẻ tích hợp `placement-highlight-banner` kèm fallback đứng riêng), `AssignmentList`/`AssignmentRow` v2, `ClassCard` v2 và cặp thẻ đáy `StudentVocabEntrySection` + `TuitionSummaryCard`.

Các tệp đã hoàn thiện và kiểm chứng trong phạm vi khoá:
- Selector thuần & khóa org hook: `apps/student/src/lib/student-overview-selectors.ts`, `apps/student/src/lib/repos/student.ts`.
- UI components & route: `apps/student/src/components/overview/{greeting-header,next-task-hero,today-schedule-card,goal-progress-card,assignment-list,assignment-row,class-card,tuition-summary-card}.tsx` và `apps/student/src/routes/_auth/index.tsx`.
- Unit/integration tests: `apps/student/src/lib/student-overview-selectors.test.ts`, `apps/student/src/components/overview/student-dashboard-redesign.test.tsx`, `apps/student/test/{overview,placement-test,wrong-role-loader-fallback}.test.tsx`.
- Bằng chứng kiểm chứng & ghi nhận phát hành: 6 ảnh POT `plans/reports/975-student-dashboard-{1440,768,375}-{light,dark}.png`, `CHANGELOG.md` — đạt `biome check` 0 lỗi/cảnh báo trên 23 tệp, `pnpm check-types` exit 0, `apps/student` 73/73 file (755/755 test), 11 spec E2E mục tiêu (39/39 test), `pnpm design:compare --screens s-dashboard --side app` 6/6, 0 tràn ngang `320px–1440px` Light/Dark và 0 lỗi HTTP `>= 400` / console / page error.

## Thực tế triển khai

Nghe "redesign frontend một trang dashboard" có vẻ êm, nhưng thực tế `/student/` là ngã tư của 4 màn hình dùng chung (`/` + `/classes` + `/assignments` + `/tuition`) và hàng loạt hợp đồng E2E strict-mode chỉ cần lệch một thẻ heading hay thuộc tính ARIA là vỡ dây chuyền. Quả đau nhất là lỗi do chính mình tự tạo: gom `useStudentPlacementStatus` vào `StudentOverviewContent` vì nghĩ tách sau guard sẽ gọn hơn, toàn bộ unit test xanh mướt nhưng chạy E2E mới bị `study-pack.spec.ts:619` vả thẳng vào mặt vì waterfall đẩy request placement ra sau `overviewQuery` làm modal bật trễ đè lên trang đã render. Cú tỉnh người thứ hai đến từ vòng `code-reviewer` fresh-context: khoá `scopedOrgId` vào `queryKey` của `useStudentSchedule` mà quên truyền nó vào header `x-student-org-id` trong `fetchStudentSchedule`, suýt lọt bug lệch cache/header khi đổi org, kèm lệch đếm ngày trên `NextTaskHero`. Chưa kể trên máy chia sẻ còn phải né port `8100–8105` đang bận, tách `student-placement-test.spec.ts` khỏi nhóm non-placement vì ô nhiễm trạng thái `e2e-lead-org`, và mất công xác minh khung dark mode trắng của `design:compare` thực chất là `<Loader />` spinner (`~181px`) bị chụp sớm lúc `networkidle`. Rã rời nhưng nhẹ người khi cuối cùng 755 unit test, 39/39 E2E và 6/6 `design:compare` đều xanh mà không phải nới bất kỳ assertion E2E nào.

## Quyết định kỹ thuật & Đánh đổi

1. **Giữ thuần frontend, dùng dữ liệu thật thay cho trường mock và bảo toàn tuyệt đối hợp đồng dùng chung:**
   - *Bác bỏ:* port `StudentShell`/header mock từ `open-design`, thêm migration `examDate`, bịa `mins`/`doing`/`Phòng 305`/`23:59`, đổi tab mặc định `AssignmentList` sang `"todo"` hoặc gắn `aria-labelledby` lên `ClassProgress`.
   - *Kết quả:* Giữ duy nhất một `<h2>Bài tập</h2>` (heading `NextTaskHero` cố định `"Việc tiếp theo"` / `"Hoàn thành bài giao"`, tên bài dùng `<p>`, CTA không trùng `aria-label` của `AssignmentRow`), giữ `ClassCard` tuyệt đối không chứa `"aria-label"` (`overview.test.tsx:214`), bỏ `overflow-hidden` trên `AssignmentList` để không cắt 4px `--focus-ring`, và bảo toàn export `StudentVocabEntrySection` / `deriveStudentHomeVocabSubtitle`.

2. **Đặt `useStudentPlacementStatus(canFetchPlacement)` tại `StudentOverviewPage` chạy song song `overviewQuery`, chỉ cô lập các hook phụ trong `StudentOverviewContent`:**
   - *Bác bỏ:* đẩy `useStudentPlacementStatus` vào `StudentOverviewContent` (gây waterfall nối đuôi `overviewQuery`) hoặc gọi không gate ở root (bắn request thừa cho tài khoản giáo viên / chưa hoàn tất onboarding).
   - *Kết quả:* `/api/student/placement-test/status` chạy song song ngay khi `meQuery` hợp lệ (`canFetchPlacement`), dứt điểm lỗi modal pop-in trễ ở `study-pack.spec.ts:619` mà vẫn chặn sạch wrong-role và pre-onboarding.

3. **Khoá 1:1 `queryKey` với header `x-student-org-id` và chuẩn hoá phép đếm thời gian còn lại theo ngày lịch:**
   - *Bác bỏ:* để `fetchStudentSchedule` tự đọc storage ngầm trong khi `queryKey` dùng `scopedOrgId` (rủi ro lệch org lúc hydrate/chuyển org), và tính số ngày còn lại theo `ms / 86_400_000` gây vênh với nhãn ngày lịch.
   - *Kết quả:* `fetchStudentSchedule(explicitOrgId)` khoá cứng `x-student-org-id` khớp 1:1 với `queryKey: ["student", "schedule", scopedOrgId]`; `selectNextTaskHero` đếm ngày theo calendar day (`"Hạn Ngày mai, 21:00"` khớp `"còn 1 ngày"`) và làm tròn xuống `Math.floor` cho khung `< 60m`.

## Sự cố, Điểm vướng & Cách xử lý

- **Waterfall regression làm modal bật trễ (`study-pack.spec.ts:619`):** Chuyển `useStudentPlacementStatus` vào `StudentOverviewContent` khiến `/api/student/placement-test/status` chỉ chạy sau khi `overviewQuery` hoàn tất, tạo độ trễ khiến modal pop-in sau lúc dashboard đã vẽ. *Xử lý:* Khôi phục lên `StudentOverviewPage` kèm gate `canFetchPlacement` để chạy song song `overviewQuery`.
- **Lệch org cache-key/header và đếm thời gian chưa đồng nhất (fresh-context code review):** `queryKey` nhận `scopedOrgId` nhưng `fetchStudentSchedule` không ép `explicitOrgId` vào `x-student-org-id`, đồng thời đếm ngày/phút ở `selectNextTaskHero` vênh với nhãn `"Hạn Ngày mai, 21:00"`. *Xử lý:* Cập nhật `fetchStudentSchedule(explicitOrgId)` truyền thẳng xuống `getStudentHeaders({}, explicitOrgId)` và đồng bộ calendar day + `Math.floor(ms / 60_000)`.
- **Rò trạng thái `e2e-lead-org` giữa các spec E2E:** Chạy chung `student-placement-test.spec.ts` với nhóm non-placement khiến trạng thái publish placement của `e2e-lead-org` rò sang các test không liên quan. *Xử lý:* Tách riêng `student-placement-test.spec.ts` khớp ranh giới shard CI; toàn bộ 11 spec mục tiêu pass 39/39.
- **Xung đột port `8100–8105` và khung dark mode trống thoáng qua ở `design:compare`:** Dải port E2E mặc định bị chiếm trên host chia sẻ, còn lần chụp tối của `design:compare` bị pixel check chặn. *Xử lý:* Chạy E2E trên dải `8200–8205`, xác minh khung trắng/trống là race `networkidle` chụp trúng `<Loader />` spinner (`~181px`) trước khi nội dung mount; chạy lại `pnpm design:compare --screens s-dashboard --side app` pass 6/6.

## Bài học rút ra

1. **Đừng kéo query quyết định overlay/modal vào component con sau `overviewQuery`:** Dù tách `StudentOverviewContent` rất tốt để cô lập query phụ, bất kỳ API nào có thể bật modal đè trang đầu phải chạy song song ở tầng trên với gate điều kiện rõ ràng, nếu không E2E sẽ lộ ngay pop-in waterfall mà unit test bỏ sót.
2. **Tham số nào nằm trong React Query `queryKey` thì `queryFn` phải nhận tường minh chính tham số đó:** Tuyệt đối không để `queryKey` dùng `scopedOrgId` còn `fetch` lại đọc `localStorage` gián tiếp — hai nguồn sự thật sẽ lệch nhau đúng thời điểm switch org hoặc hydrate.
3. **Nhãn hạn nộp và badge đếm ngược phải dùng chung khái niệm ngày lịch:** Khi đã hiển thị `"Hạn Ngày mai, 21:00"` theo giờ VN thì bộ đếm cũng phải tính theo `diffDaysISO` và làm tròn xuống bằng `Math.floor` dưới 60 phút để không báo sai thời gian còn lại.
4. **Trên host chia sẻ, khoanh vùng lỗi hạ tầng trước khi chạm vào code hay test:** Port bận (`8100–8105`), rò state giữa shard (`e2e-lead-org`) và race `networkidle` chụp `<Loader />` (`~181px`) đều là nhiễu môi trường — chẩn đoán đúng ranh giới giúp tránh sửa bậy production code hoặc tắt guardrail.

## Bước tiếp theo

- **Người thực hiện (session hiện tại — ngay sau journal):** Commit và push toàn bộ thay đổi trên nhánh `vinh19410/feat-redesign-student-dashboard` (tuyệt đối không stage thư mục tham chiếu `open-design/redesign-student-dashboard/`), mở PR cho Issue #975.
- **Người thực hiện (ngay sau push):** Đăng bình luận POT lên Issue #975 kèm permalink theo commit SHA cho đủ 6 ảnh `plans/reports/975-student-dashboard-{1440,768,375}-{light,dark}.png`, bằng chứng 0 overflow `320px–1440px` Light/Dark và kết quả đủ các gate đã chạy.
- **Tự động (CI/CD sau merge):** Theo dõi `quality.yml`, `e2e.yml` trên PR vào `main` và smoke check `/student/` trên staging sau deploy.
