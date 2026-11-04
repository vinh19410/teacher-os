# Changelog

Nhật ký thay đổi của **teacher-os**, group theo **ngày** (mới nhất lên đầu) thay vì theo version.

Quy ước khi cập nhật:

- Mỗi ngày làm việc tạo một mục `## YYYY-MM-DD`, các thay đổi trong ngày chia theo nhóm: `### Added` (tính năng mới), `### Changed` (thay đổi/sửa hành vi hiện có), `### Fixed` (sửa lỗi), `### Removed`, `### CI/Infra`, `### Docs`.
- Ghi kèm số issue/PR ở cuối dòng nếu có, ví dụ `(#216)`.
- Merge commit, commit format/style thuần và commit docs(plan) nhỏ không cần liệt kê — chỉ ghi ý nghĩa thay đổi cho người dùng/dev.

---


## 2026-11-04

### Added
- Cho phép gộp câu hỏi trắc nghiệm tự chấm (`reading`, `listening`, `grammar`, `vocabulary`) và phần tự luận **Writing** (`Task 1` / `Task 2`) trong cùng một bài tập giao lớp (#574): bổ sung 3 cột additive `writing_part`, `writing_type`, `writing_prompt` trên `assignment_prompt` (migration `0063_green_ghost_rider`), tách schema ghi (`assignmentWritingSectionSchema`) và đọc trên wire (`studentWritingSectionSchema`), khoá bất biến `409 WRITING_SECTION_LOCKED` khi đề đã gắn `class_assignment`/`assignment_test_part`/`study_pack_item` và loại trừ đề gộp khỏi `assignment_test` (`400`) & `study_pack` (`422`, hạ `D1_PROMPT_CLONE_INSERT_CHUNK` xuống `3`); thêm khối tuỳ chọn **"Phần Writing đi kèm"** tại `/assignments/new`, hiển thị đủ 2 phần ở xem trước & tab mô phỏng (`buildQuizSim` mở cho cả 4 kỹ năng tự chấm), gắn nhãn `+ Writing` kèm bộ lọc `Grammar`/`Vocabulary` ở `ClassAssignmentsTab`, và hiện kết quả trắc nghiệm `X/Y câu đúng` trên trang chấm `/grading/$attemptId`; ở `apps/student`, tách store autosave thứ hai (`quizAttemptEssayMirrorKey`, bảo toàn mirror qua SPA unmount & cross-halt 401/409) không đụng key `0`, guard 0-Credit khi nộp bài gộp để trống phần Writing trong `runAiGrading`, và hiển thị đồng thời điểm trắc nghiệm lẫn bài viết + Band/nhận xét/highlight của giáo viên trên màn kết quả, `/detail` và `/history`.
- Thêm nút **"Gốc học viên"** (`#studentPortalLink`, `rel="noopener"`) trên thanh header của `apps/profile` (`apps/profile/public/index.html`) dẫn thẳng tới cổng học viên `apps/student` theo từng môi trường: HTML tĩnh mặc định trỏ `https://student.teacheros.io.vn`, `replaceStudentPortalHref` trong `apps/profile/serve.mjs` và `apps/profile/build.mjs` kiểm tra URI scheme `http:`/`https:` fail-closed rồi thay `href` từ biến `STUDENT_PORTAL_URL` (chỉ áp dụng cho `index.html` gốc, dev mặc định `http://localhost:8003`, E2E truyền `http://localhost:${studentPort}` trong `apps/e2e/playwright.config.ts`, deploy truyền `topology.studentOrigin` / `studentWorker.url` từ `packages/infra/alchemy.run.ts`), kèm CSS header responsive cho `1440×900`, `768×1024`, `375×812`, `320×812` và khoá chống lệch trong `scripts/topology-drift.test.mjs` (#560).

### Fixed
- Khắc phục trang Bài tập cổng học viên thiếu bài tập mới cho tới khi tải lại toàn bộ trang (#580): tham số hóa hook `useStudentOverview` (`apps/student/src/lib/repos/student.ts`) cho phép truyền tùy chọn `refetchOnMount` và `refetchOnWindowFocus` trong khi vẫn bảo toàn mặc định không gọi thừa ở Tổng quan và Lớp học; cấu hình `refetchOnMount: "always"` và `refetchOnWindowFocus: "always"` tại trang Bài tập (`apps/student/src/routes/_auth/assignments/index.tsx`) để tự động cập nhật bài mới ngầm ngay khi vào trang và khi quay lại tab; bảo vệ error view không xóa danh sách bài tập đã nạp nếu lượt refetch ngầm gặp lỗi mạng; bổ sung bộ kiểm thử TDD (`apps/student/test/student-overview-cache.test.tsx`).
- Tăng tương phản trạng thái đang chọn trong ChipFilter và prompt-composer theo token design v2 (`packages/ui/src/components/web-kit/chip-filter.tsx`, `apps/web`, #576): chuyển trạng thái chọn từ `bg-secondary text-secondary-foreground` (chỉ đạt ~1.06:1 trên nền trắng) sang `border-primary bg-primary text-primary-foreground` (>15:1), tách `bg-background dark:bg-input/30` khỏi base class sang nhánh chưa chọn để không bị ghi đè ở dark mode, đổi badge đếm sang `text-primary-foreground/80` khi chọn và `text-muted-foreground` khi chưa chọn (`aria-hidden`); đồng bộ toggle kỳ doanh thu trong `apps/web/src/components/tuition/revenue-chart.tsx`; kèm TDD test suite `apps/web/src/components/ui/chip-filter.test.tsx` và cập nhật `DESIGN.md`.
- Khắc phục lỗi đứng hình khi bấm "Chấm bài" trên menu sidebar do `/_auth.beforeLoad` gửi fetch mạng `/api/auth/get-session` lặp lại không cache và không timeout ở mỗi lượt hover (`defaultPreload: "intent"`) và click (#575): thêm `getCachedSession` với in-memory cache TTL 10 giây, deduplicate in-flight requests, timeout 5 giây (`AbortSignal.timeout(5000)`), cơ chế thế hệ (`cacheEpoch`) chống race-condition ghi đè nháp cũ, tự dọn cache khi đăng xuất, `reauth()`, đổi tên/avatar (`updateUser`), hoặc session rỗng; đặt `defaultPendingMs: 200` trong router `main.tsx` và bọc try/catch phòng thủ fail-open an toàn khi mạng chập chờn.
- Đổi nhãn nút CTA trên màn hình kết quả làm bài tập của cổng học viên (`apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx`) từ **"Xem giải thích chi tiết"** sang **"Xem chi tiết bài làm"** (#579): phản ánh chính xác hành động mở trang xem lại toàn bộ bài thi (`/detail`), không hứa hẹn nội dung giải thích khi đề không có `explanation` hay `note`; giữ nguyên giao diện sạch sẽ không rác của từng câu khi không có giải thích; đồng bộ toàn bộ unit test (`attempt-summary.test.tsx`, `quiz-review-item.test.tsx`) và E2E specs (`student-quiz-take-review.spec.ts`, `assignment-prompt-create.spec.ts`, gồm cả các assertion phủ định ở Writing và Speaking).
- Sửa ô **Hạn nộp** khi giao bài tập trên lớp (`apps/web/src/components/classes/class-assignments-tab.tsx`, #572): thay `<input type="date">` phụ thuộc locale trình duyệt bằng `DatePickerInput` (`dd/mm/yyyy` cố định + lịch tháng `T2..CN` trên `@base-ui/react/popover`, giữ nguyên chuỗi đang gõ qua `draftText` + `lastEmittedIsoRef` chống nhảy con trỏ `09/11` → `10/09`) và `TimeInput24h` (`HH:mm` 24h, mặc định `23:59`, kèm mốc giờ gợi ý `17:00`/`21:00`/`23:59`) trong `@teacher-os/ui/components/date-picker-input`, kèm dòng xác nhận trực quan *"Đã hiểu: Thứ …, dd/mm/yyyy lúc HH:mm (giờ Việt Nam)"*; mở rộng `classAssignmentCreateSchema` thêm `dueTime` tùy chọn (`packages/api/src/contracts.ts`), lưu `dueAt` (`timestamp_ms`) và chặn giờ quá khứ trong ngày (`400 past-time`) tại `POST /api/classes/:id/assignments`, xuất `dueAt` qua `loadSnapshot` + định dạng thông báo tiếng Việt, và đồng bộ tính quá hạn/nộp trễ theo múi giờ Việt Nam qua `evaluateAssignmentDeadline` (`@teacher-os/api/vietnam-date`) trên cả `apps/web` lẫn `apps/student` mà không đổi hành vi dữ liệu cũ `dueAt: null`.
- Bật ô rich text **"Giải thích câu {n}"** (`showExplanation`) trong `PromptComposer` (`apps/web`) cho các kỹ năng chấm tự động (`reading`, `listening`, `grammar`, `vocabulary`): chặn phím tắt đáp án (`t/f/n`, `a–h`, `1–8`) và sự kiện `Enter` từ portal của `RichTextEditor` trong `AnswerKeyGrid.handleKeyDown` để gõ giải thích không ghi đè đáp án hoặc tự thêm câu; thêm `"explanation"` vào `errorEntries` và kiểm tra trần `richTextField(2000)` (2000 ký tự plain / 5000 ký tự raw); bảo toàn `explanation` qua `composerFromPrompt` (chuẩn hóa plain text legacy an toàn với biểu thức `<`/`>`), nút **"Cập nhật đề"** trong Full-Test Builder (`PATCH /api/assignments/prompts/:id` lược bỏ `skill`/`part`), draft store, `ClozeEditor.hasItemContent`, và tab mô phỏng **"Làm thử & Soi bài"** (`buildQuizSim` mở đủ `isAutoSkill` + `PreviewQuizSimulation`) (#571).
- Sửa thẻ quảng cáo khóa học từ vựng trên cổng học viên (`apps/student`) hiển thị cứng `"20 khóa · 968 bài"` ngay cả khi thư viện trống (#573): lấy động số khóa và số bài từ `GET /api/student/vocab/library/courses` (`useVocabLibraryCourses` chạy song song trong `VocabOverviewPage`), tự ẩn `VocabCoursesCta` và gỡ câu tham chiếu `"bên dưới"` ở `vocab-decks-empty` khi thư viện rỗng/lỗi, bỏ chuỗi cứng `"20 khóa học từ vựng"` ở `StudentVocabEntrySection` trên trang chủ `/`, và tách rõ thông báo thư viện chưa có nội dung với thông báo lọc không khớp tại `/practice/vocabulary/courses`.
- Bỏ liên kết text **"Làm Test Miễn Phí"** trùng lặp bên trong `<ul class="nav-links">` của `<header class="site-header">` tại `apps/profile/public/index.html`, giữ nút CTA vàng **"📝 Làm Test Miễn Phí"** trong `.nav-actions` làm điểm vào duy nhất trên header (hiển thị xuyên suốt cả desktop lẫn mobile `≤768px`) cùng đủ 3 anchor điều hướng nội trang và 8 CTA ngoài header, kèm unit test hồi quy kiểm tra cân bằng thẻ đóng/mở và phạm vi `.nav-actions` (#562).
- Xử lý 5 điểm follow-up từ review release bộ đề tự học theo lịch (`Study Pack`, #554): (1) bảo toàn `study_pack_item.id` theo `(dayIndex, sourceKind, sourceId)` khi cập nhật qua `PUT /api/study-packs/:id` và `PUT /api/admin/library/packs/:id`, đồng thời đóng băng danh sách `class_assignment` ở cả nhánh `reused` lẫn `raced` trong `assignStudyPackToClass` (chỉ backfill `class_assignment_target` cho các bài còn hạn `due_at > now`, không chèn thêm bài giao mới gây nhân đôi); (2) bổ sung `packages/db/src/migrations/meta/0060_snapshot.json` khôi phục chuỗi snapshot Drizzle; (3) khóa unique `study_pack_org_source_pack_uq` trên `(org_id, source_pack_id)` (migration `0061_petite_dormammu`) và bọc `try/catch` + re-`SELECT` trong `POST /api/study-packs/:id/clone` chống sinh bản clone trùng khi đua song song; (4) gộp `cancelClassStudyPack` thành 1 `db.batch` nguyên tử theo `packRow.cancelledAt ?? now` và bắt lỗi FK + hậu kiểm `status === 'cancelled'` trong `assignStudyPackToClass` để dọn sạch bài chưa làm (kể cả Ngày 1 nếu hủy giữa chừng) rồi trả `409` kèm thông báo đúng trên `ClassStudyPackSection`; (5) bổ sung mục kiểm tra pre-flight `0061` & lưu ý rollback `0060`–`0061` vào `docs/production-release-runbook.md`.

### Removed
- Gỡ bỏ khối tuỳ chọn **"Đã làm test examenglish? (nhập kết quả nếu có)"** khỏi form đăng ký khoá học tại `apps/profile/public/index.html`: xoá phần tử `<details id="examEnglishDetails">` (2 liên kết ExamEnglish và ô nhập kết quả tự do `#examEnglishInput`), các rule CSS `.examenglish-*` và khoá `examEnglish` trong nháp `localStorage`; `getCombinedPlacement()` giữ nguyên tên hàm ở cả 3 điểm gọi và chỉ trả về giá trị từ `quizPlacementInput` đã `.trim().slice(0, 300)`, kèm test biên dịch `node:vm` chặn `SyntaxError` cho `<script>` inline (#559).

### CI/Infra
- Tự động nạp và kiểm chứng thư viện từ vựng built-in trên Cloudflare D1 của riêng môi trường `staging` sau bước `/readyz` trong `.github/workflows/deploy-staging.yml` (#573): bổ sung `--d1-stage staging` (fail-closed theo regex `^teacher-os-database-staging-[a-z2-7]{16}$` + kiểm tra phân trang `total_count`, cấm kết hợp `D1_DATABASE_ID`) và `--if-needed` (đối chiếu cả tập ID lẫn SHA-256 nội dung 3 bảng) vào `packages/db/scripts/seed-vocab-library.ts` kèm mask/redact D1 UUID & token, trong khi tiếp tục chặn cơ học Production (`assertNonProdD1Database`, `deploy.yml`, `alchemy.run.ts`) trong `scripts/ci-workflow.test.mjs` cho tới khi mở Gate Giấy phép.
- Sửa smoke auth trong `.github/workflows/deploy-staging.yml` luôn đỏ với `403` khi staging đặt `TEACHER_EMAILS`: bước `sign-up → get-session` đăng ký email ngẫu nhiên qua origin cổng học viên (`STUDENT_ORIGIN`) thay vì origin giáo viên, vẫn giữ kiểm tra cookie namespaced với cookie jar nhiễm của #125; thêm khoá chống lệch trong `scripts/topology-drift.test.mjs`.
- Tối ưu thời gian cổng `quality` trên workflow CI & deploy từ ~8 phút xuống ≤ ~4 phút mà không bỏ bước kiểm tra nào (#558): trích xuất `.github/actions/setup-workspace/action.yml` và reusable `.github/workflows/quality.yml` chia 4 job song song (`checks`, `test-web`, `test-server`, `test-workspace`), tách riêng `ledger-invariants.test.ts` sang `server#test:ledger`, khai báo cross-package `test.inputs` trong `apps/server/turbo.json`, dùng Turborepo Transit Nodes (`dependsOn: ["transit"]`) để khử việc `e2e` kéo chạy trùng `server#test` nhưng vẫn giữ nguyên băm phụ thuộc xuyên package (kèm `--concurrency=1` cho `pnpm test` cục bộ tránh chồng chéo worker pool Vitest trên máy chia sẻ và timeout 15s cho bài test 5 vòng scrypt ở `packages/auth/src/auth-reset-password.test.ts`); khử chạy trùng `vite build` giữa `check-types` và `build` ở `apps/{web,student,admin}/turbo.json` (`outputs: ["dist/**", "src/routeTree.gen.ts"]`); bật `.turbo` `actions/cache@v6` tách key riêng từng job trên `ci.yml` (restore trên PR/push, chỉ save + tỉa file >7 ngày trên `push`), giữ `turbo-cache: false` trên `deploy.yml` / `deploy-staging.yml`, giới hạn `paths-ignore` ở `["plans/**/*.md", "plans/reports/**/*.html"]` trên `ci.yml`, và mở rộng hợp đồng bảo vệ trong `scripts/ci-workflow.test.mjs`.

## 2026-11-03

### Fixed
- Thêm padding phải cho mũi tên dropdown `<select>`: mọi `Select` primitive (`packages/ui/src/components/web-kit/field.tsx`) và select thô trước đây để trình duyệt vẽ chevron sát mép phải; nay primitive thêm class `select-chevron` + `pr-9` (chevron SVG vẽ bằng `background-image` trong `globals.css`, `right 0.75rem`, màu theo `--muted-foreground` light/dark, fallback `appearance: auto` khi `forced-colors`), chuyển 5 select thô (`#lead-status`, invoice-payment, 3 select placement-test) sang primitive/class chung và bỏ chevron overlay riêng của student `PracticeSelect`. Select placement-test qua primitive giờ đúng `h-8`/`w-auto` như className khai báo (trước đây `h-9`/`w-full` của `inputCls` thắng cascade) (#542).
- Sửa bố cục chân side menu giáo viên: nút **"Đăng xuất"** rơi xuống hàng riêng thay vì nằm cuối hàng user (`packages/ui/src/components/app-shell/user-footer.tsx`): wrapper footer đổi thành flex row (`relative flex items-center gap-1`), control hồ sơ thêm `min-w-0 flex-1` để tên/email truncate đúng, chevron menu thêm `shrink-0` khỏi bị nén; ở rail thu gọn desktop (56px) avatar + nút đăng xuất xếp dọc (`lg:flex-col`, `lg:w-full`), drawer mobile (<1024px) giữ hàng ngang. Không đổi hành vi, a11y name hay testid (`sidebar-user-email`, `sidebar-avatar`); student không dùng `trailing` giữ nguyên bố cục (#540).
- Bỏ ký tự `+` thừa trong nhãn nút **"Thêm học viên"** ở trang Học viên (`apps/web/src/routes/_auth/students/index.tsx`): trước đây nút render icon `Plus` kèm chữ `+ Thêm học viên` nên hiển thị "+ + Thêm học viên" ở cả nút header lẫn empty state; nay giữ icon `Plus`, nhãn thuần **"Thêm học viên"** như nút **"Mời học viên"** bên cạnh. Nút **"+ Thêm học viên vào lớp"** ở chi tiết lớp (không có icon) giữ nguyên (#544).

## 2026-11-01

### Added
- Bộ đề tự học gán vào lớp theo lịch không cần cron & dạng bài Grammar/Vocabulary tự chấm (`Study Pack`, #533): mở rộng `ASSIGNMENT_SKILLS` thêm `grammar` (`g1`: `mcq`, `gap`, `transform`) và `vocabulary` (`v1`: `mcq`, `match`, `gap`) chấm tự động qua `gradeQuiz`; thêm 4 bảng `study_pack`, `study_pack_item`, `class_study_pack`, `study_pack_exercise` cùng các cột `class_assignment.available_at`, `class_assignment.class_study_pack_id`, `assignment_prompt.library_ref` và gỡ bỏ hoàn toàn bảng/cron `*/5` của `#526` (migration `0060_study_pack`); API quản lý bộ đề trung tâm & nhân bản từ thư viện hệ thống (`/api/study-packs*`), API thư viện hệ thống cho admin (`/api/admin/library/packs*`, `/api/admin/library/exercises*`), và API gán/xem tiến độ/huỷ bộ đề theo lớp (`/api/classes/:classId/study-packs*`) tạo sẵn toàn bộ `class_assignment` bỏ qua ngày nghỉ (`computeStudyPackSchedule`) kèm lọc lúc đọc `visibleAssignmentFilter(now)` trên toàn bộ đường đọc/làm bài của học viên và tự động backfill học viên vào lớp muộn qua `activateEnrollment`; bổ sung màn quản lý bộ đề `/assignments/packs`, chế độ `"Bộ đề tự học"` tại `/classes/$classId`, và màn quản trị `/library/packs`.

### CI/Infra
- Đưa `apps/profile` vào stack Alchemy (`Cloudflare.Website.StaticSite("profile")`) và pipeline deploy tự động (#536): mở rộng `DomainTopology` (`packages/infra/src/topology.ts`) thêm `profileHost`, `profileAliases`, `profileOrigins` (`msmy.io.vn` + alias `www.msmy.io.vn` trên production `APP_DOMAIN=teacheros.io.vn`, `profile.<domain>` trên staging/domain khác) và cập nhật `resolveLeadOrigins` suy ra `LEAD_ORIGINS` mặc định theo `topology.profileOrigins`; truyền `LEAD_API_URL` vào build/dev của `profileWorker` trong `packages/infra/alchemy.run.ts`; thêm `<link rel="canonical">` trỏ về apex `https://msmy.io.vn/` và `https://msmy.io.vn/kiem-tra-dau-vao/`; bổ sung `PROFILE_ORIGIN` + bước `Smoke check profile` vào `.github/workflows/deploy.yml` và `.github/workflows/deploy-staging.yml` cùng kiểm thử chống lệch tại `scripts/topology-drift.test.mjs` và cập nhật runbook phát hành 2 đợt (lưu ý promote đợt 1 server-only từ SHA `7d331c05b305fbe7fd16b98fb0942e5ab93a68cb` trước khi đưa `profileWorker` lên prod).

### Fixed
- Bổ sung thông báo xác nhận (`sonner` toast) sau khi giáo viên thêm học viên có sẵn hoặc tạo học viên mới vào lớp trong `EnrollStudentModal` (`apps/web/src/components/modals/enroll-student-modal.tsx`: *"Đã thêm <tên> vào lớp"*, fallback *"Đã thêm học viên vào lớp"*, kể cả khi đối soát lại sau `committed` nhưng không bắn nhầm cho `outcome-unknown`) và sau khi học viên bấm **Chấp nhận** lời mời tham gia tổ chức trên chuông thông báo `NotificationBell` (`apps/student/src/components/layout/notification-bell.tsx`: *"Đã tham gia <tổ chức>"*, fallback *"Đã tham gia tổ chức"*, kèm chặn bấm trùng khi `processingId !== null`) (#522).
- Cho phép bấm nút **"Sắp xếp buổi"** trên trang chi tiết lớp giáo viên (`apps/web/src/routes/_auth/classes/$classId.tsx`) ngay cả khi lớp chưa gắn giáo trình: mở modal **Quản lý buổi của lớp** (`apps/web/src/components/class-detail/class-sessions-manage-modal.tsx`) hiển thị lý do *"Gắn giáo trình cho lớp để sắp xếp buổi."* kèm nút **"Mở tab Giáo trình"** chuyển thẳng sang tab Giáo trình mà không tự ý đổi tab nền nếu giáo viên đóng modal (#521).
- Việt hóa nhãn tab mặc định trên trang chi tiết lớp giáo viên (`apps/web/src/routes/_auth/classes/$classId.tsx`) thành **"Buổi học & luyện tập"** (giữ nguyên `id: "sessions-practice"` và URL search param `?tab=`) và định dạng ngày mở lớp trên thẻ thống kê học viên theo chuẩn `dd/mm/yyyy` (`Từ dd/mm/yyyy` qua `fmtDue`, ẩn dòng phụ khi `startDate` rỗng) thay vì hiển thị chuỗi ISO `YYYY-MM-DD` (#520).
- Sửa lỗi trạng thái **"đã chọn"** của chip và thẻ lựa chọn gần như không phân biệt được với trạng thái chưa chọn ở 3 màn hình **Onboarding cổng học viên** (`apps/student/src/components/onboarding/onboarding-steps.tsx`), **Tạo lớp mới** (`apps/web/src/components/ui/chip-multi.tsx`), và **Thêm học viên vào lớp** (`apps/web/src/components/modals/enroll-student-modal.tsx`) (#518): chip lựa chọn độc lập (`ChipMulti`, band chip `TargetScoreStep`) khi chọn dùng nền đặc `border-primary bg-primary text-primary-foreground` (tương phản chữ ≥ 12:1, tương phản nền ≥ 5.8:1 so với chip chưa chọn ở cả giao diện sáng và tối); thẻ và hàng lựa chọn (`OptionButton`, `LearningGoalsStep`, `EnrollStudentModal` `role="option"`) khi chọn dùng `border-primary bg-muted ring-1 ring-primary` kèm chỉ báo check (`<Check aria-hidden="true" />`), bổ sung `aria-pressed` cho các nút onboarding và bỏ class v1 không còn hiệu lực `hover:bg-line-soft`.
- Sửa lỗi độ tương phản nút **"Tiếp tục"** và **"Hoàn thành"** trong wizard onboarding cổng học viên (`apps/student/src/components/onboarding/onboarding-wizard.tsx`, #517): thay class v1 đã bị xóa `text-bg hover:bg-primary hover:text-primary-foreground` bằng `text-primary-foreground hover:bg-primary/90` để chữ đạt chuẩn WCAG AA (≥ 4.5:1) trên nền `bg-primary` ở cả giao diện sáng và tối, đồng thời bỏ `opacity-50` chồng lên `bg-muted text-muted-foreground` ở trạng thái disabled của nút **"Tiếp tục"**.

## 2026-10-31

### Added
- Màn sửa và phát hành bộ đề kiểm tra đầu vào (`/placement-test` trong `apps/web` → `/kiem-tra-dau-vao/` trên `apps/profile`, #515): chuyển bộ đề và 5 file MP3 từ file tĩnh sang D1 (`placement_test`, `placement_test_audio`, migration `0058`) + R2 `LIBRARY_AUDIO` (`placement/<orgId>/<uuid>`, trần 20 MB); giáo viên có quyền `canAccessFinance` sửa toàn bộ câu hỏi, 4 đáp án, đáp án đúng, phân loại, cấp độ, đoạn nghe, `maxPlays` và bảng ngưỡng CEFR, nhập đề gốc 30 câu bằng một nút bấm, lưu nháp có CAS `revision` (409 khi đụng độ giữa nhiều tab) và bấm **Phát hành** dựng snapshot bất biến có hiệu lực ngay mà không cần deploy lại; mở rộng `MediaStore.get(key, range?)` và route công khai `GET /public/placement-test` + `GET /public/placement-test/audio/:id` hỗ trợ HTTP `Range` (`206 Partial Content`) cho Safari iOS và dọn rác nền các audio mồ côi > 24 giờ; trang `/kiem-tra-dau-vao/` đọc đề từ API, tính động số câu/đoạn, hiện trang bảo trì khi chưa phát hành hoặc lỗi mạng mà không xóa bài làm dở trong `localStorage`, và bỏ cổng `status` trong `apps/profile/build.mjs`.
- App giáo viên chỉ cho phép email trong danh sách `TEACHER_EMAILS` (bắt buộc trên production, fail-closed khi deploy nếu rỗng; rỗng ở dev/e2e/staging giữ nguyên không giới hạn; chặn cả sign-up `TEACHER_SIGNUP_FORBIDDEN` lẫn mỗi request kernel `ACCOUNT_TEACHER_NOT_ALLOWED`, #513).
- Trang kiểm tra đầu vào 30 câu trên `apps/profile` (`/kiem-tra-dau-vao/`, #511): thay quiz 5 câu nhúng trong trang bằng trang tĩnh riêng gồm 15 câu Vocab + Grammar (8 grammar, 7 vocab từ A1 đến C1) và 5 đoạn Listening (15 câu từ A2 đến C1, mỗi đoạn nghe tối đa 2 lần, lưu tiến độ và số lượt nghe trong `localStorage` key `msmy_placement_attempt_v1`); module chấm điểm thuần `grading.js` quy đổi tổng điểm `/30` sang CEFR (`A1`/`A2`/`B1`/`B2+`) và khóa đề xuất thuộc `LEAD_COURSES` rồi chuyển kết quả về form đăng ký qua query `/?ketqua=&khoa=#dang-ky-tu-van` (đọc một lần, lùi `formRenderedAt` tránh ngưỡng chống bot 3 giây và xóa query bằng `history.replaceState`); nâng cấp `serve.mjs` hỗ trợ directory index, redirect 301 an toàn và HTTP `Range` (`206 Partial Content`) cho `.mp3`; `build.mjs` chặn build phát hành khi `questions.json` chưa ở trạng thái `status: "approved"`.

### Fixed
+- Xử lý các release blocker trước khi promote `develop` → `main` (#524): truyền `LEAD_ORG_ID` và `LEAD_ORIGINS` vào bước `Deploy to Cloudflare` trong `.github/workflows/deploy-staging.yml` và `.github/workflows/deploy.yml`, chuẩn hóa `LEAD_ORIGINS` qua `resolveLeadOrigins` (rỗng/khoảng trắng/dấu phẩy rơi về mặc định `https://msmy.io.vn,https://www.msmy.io.vn`) và `.trim()` `LEAD_ORG_ID` đồng nhất; thay kiểm tra check-then-act tại `POST /public/leads` bằng câu lệnh `INSERT INTO lead ... SELECT ... WHERE ... RETURNING` và `UPDATE lead SET ... WHERE ... RETURNING` nguyên tử (giữ nguyên `ip_hash` gốc khi dedupe update, không tự chặn update tại biên `LEAD_IP_MAX`/`LEAD_DAILY_CAP`); bắt buộc `session.emailVerified === true` khi `TEACHER_EMAILS` khác rỗng (`403 ACCOUNT_TEACHER_EMAIL_UNVERIFIED` kèm nút gửi lại email xác thực trên `AccountBlockedView`) và chặn đăng ký email thuộc `TEACHER_EMAILS` từ cổng khác; áp role gate `canAccessFinance` cho `GET/PATCH /api/leads`, lọc người nhận `notifyNewLead`, ẩn/chặn `/leads` trên web đối với `ta`/`class_teacher`, và trả `400` khi `PATCH /api/leads/:id` nhận JSON hỏng.

## 2026-10-30

### Added
- Thêm học viên thủ công, kích hoạt lớp tức thì và bài nộp mẫu dùng thử Chấm điểm (#508): khôi phục `POST /api/students` theo org (chỉ bắt buộc tên, trùng email → `409 STUDENT_ALREADY_IN_ORG`, tự đóng lời mời `pending` cùng email), `activateNow` trên `POST /api/classes/:id/enroll` để vào trạng thái Đang học ngay, `AddStudentModal` + `EnrollStudentModal` hai chế độ, và `POST/DELETE /api/grading/demo-sample` tạo/xóa bài Writing mẫu không tốn credit AI, cô lập khỏi snapshot/nhắc việc. Không có migration mới.
- Lead intake từ form đăng ký học trên trang profile cô Mỹ (`apps/profile`, `msmy.io.vn`) vào `teacher-os` (#506): bảng `lead` (migration `0057`), contract `@teacher-os/api/lead-contracts`, endpoint công khai `POST /public/leads` (CORS riêng `LEAD_ORIGINS`, chống spam 2 lớp honeypot/`elapsedMs` + tần suất IP HMAC-SHA256 3 lần/10 phút + trần 100 lead/ngày + dedupe SĐT 24 giờ, gửi email báo thành viên org không chứa PII), API giáo viên `GET/PATCH /api/leads`, màn `/leads` ("Đăng ký mới") trên `apps/web`, và viết lại form `#consultForm` trên `apps/profile` (chỉ bắt buộc Tên + SĐT Zalo, danh mục khóa theo Google Form + hình thức lớp, màn thành công không kèm thông tin thanh toán, lưu nháp `localStorage`, fallback copy-Zalo khi API lỗi, inject `<meta name="lead-api">` qua `LEAD_API_URL` trong `serve.mjs`/`build.mjs`, kèm test chống lệch danh mục `lead-catalog-drift.test.ts` và E2E đầu-cuối trên cổng `8105`).

## 2026-10-29

### Added
- Release lõi vận hành lớp + học phí lên production (`develop` → `main`, #501, issue #494): lịch tháng/tuần/ngày + kỳ nghỉ, điểm danh theo buổi và theo ngày, hóa đơn/thu tiền/sổ công nợ, nhắc học phí, nhật ký thông báo; 22 migration (0035–0056) áp lên D1 prod (ledger 35 → 57), dữ liệu prod giữ nguyên.
- Cờ `AI_ENABLED` (mặc định tắt, #496): nhập đề AI và chấm nháp AI tắt hẳn trên prod, UI ẩn mọi điểm vào AI; khi tắt, `runAiGrading` thoát sớm không tạo draft hay reserve Credit (#497).

### Fixed
- Lịch nhiều thứ trong tuần (ví dụ T2+T5) sinh sai buổi cuối khi ngày bắt đầu không phải thứ đầu tiên trong lịch: `skeletonOf` giờ đi theo lịch từ `startDate` thay vì dồn buổi dư vào thứ đầu mảng (#498). Backfill #98 giữ công thức cũ qua `legacySkeletonOf`.

### CI/Infra
- Job e2e nâng `timeout-minutes` 20 → 40: suite 243 test (1 worker) cần ~23 phút trên runner chậm, làm `Deploy Production` bị hủy hai lần trước khi deploy (#502).

### Fixed
- `/readyz` trả 503 `{"ok":false}` trên D1 dù database đã migrate đủ: probe trong `apps/server/src/routes/readiness.ts` truyền mỗi bảng/index một tham số (~132 tham số), vượt giới hạn 100 tham số mỗi câu lệnh của Cloudflare D1 nên D1 từ chối query. Danh sách tên giờ đi trong **một** tham số JSON (`name IN (SELECT value FROM json_each(?))`), hành vi kiểm tra giữ nguyên; thêm test chặn probe vượt 100 tham số (libsql in-memory dùng trong test không có giới hạn này).

## 2026-10-28

### CI/Infra
- Nhánh `staging` làm môi trường QA: mỗi lần push lên `staging` tự deploy stage Cloudflare `staging` (`https://app.staging.teacheros.io.vn`) qua `deploy-staging.yml`; merge vào `develop` vẫn không tự deploy, nâng bản cho QA bằng `git push origin develop:staging`.

### Added
- Chấm nháp AI Writing/Speaking ẩn với học viên (TOS-30 #478, màn Rà soát chấm bài AI `[7]`): học viên nộp Writing (hoặc Speaking hợp lệ) → hệ thống tạm giữ 1/2 Credit, AI chấm nháp ≤ 30 giây (timeout 20s, pipeline nền `waitUntil`) → draft `ai_drafted` với điểm gợi ý 4 tiêu chí IELTS (bước 0.5) + nhận xét; bảng mới `ai_grading_draft` tách nháp khỏi `quiz_attempt.grade_scores` nên cổng học viên chỉ thấy "Đã nộp — Đang chờ giáo viên chấm", không lộ điểm AI; `releaseStaleGradings` dọn draft kẹt (60s) + trả held Credit ở `GET /grading*` và `/credits/wallet`; sổ cái ghi `action_type = ai_grading` với idempotency key riêng, AI lỗi/thiếu Credit → hoàn đủ Credit + `manual_pending`. Giáo viên thấy panel "Gợi ý từ AI" trên màn chấm 2 cột, "Lưu bản nháp" (PATCH draft, version chống lưu đè) và "Chốt trả bài" tái dùng `POST /grade` — publish draft + điểm cuối trong cùng batch, phát `grade_returned`; hàng chờ `/grading` thêm badge trạng thái draft; nhãn cổng học viên phân biệt theo kỹ năng (Writing/Speaking chờ chấm tay, Reading/Listening giữ "Đã nộp").
- Học viên xem được **giải thích đáp án riêng từng câu** ở màn xem lại bài (`/learn/quizzes/attempt/:attemptId/detail`, bài giao lẫn tự luyện) — slice của #358: `parseQuizQuestions` forward `explanation` vào snapshot lúc start, `GET /api/student/attempts/:id/detail` chỉ trả `questions[].explanation` SAU khi nộp (đang làm vẫn 409, take payload vẫn whitelist `stem/opts/type/pin`), câu không có giải thích không sinh key; attempt cũ (snapshot đã strip) fallback từ đề hiện hành chỉ khi cùng số câu và từng câu trùng stem + đáp án; `QuizReviewItem` ưu tiên giải thích câu rồi tới ghi chú chung của đề, render rich text đã sanitize (`RichTextBody`) trong disclosure "Giải thích" — đồng thời sửa ghi chú HTML trước đây hiện thẻ thô (#358)

## 2026-10-27

### Added
- Nhập đề thi từ PDF/Ảnh bằng AI **`[6]`** (`/assignments/tests/import`, TOS-27) — chặn tệp không hợp lệ trước khi giữ Credit và tự động hoàn trả **5 Credit** khi dịch vụ AI lỗi hoặc quá 120 giây (#473): kiểm tệp 2 lớp (client `checkExamFile` bằng `pdfjs-dist` + server `inspectExamFile` bằng `unpdf` với `data.slice(0)` chống detach `ArrayBuffer` gốc) trước khi lưu R2 / tạo job / giữ Credit, trả `400 E-selfomy-alignment-003` kèm `reason: "type" | "size" | "pages" | "password"`; tách `runImport` (`apps/server/src/lib/exam-import/run-import.ts`) phân loại `timeout` (120s kép `AbortSignal.timeout` + `Promise.race`) / `ai_error` / `empty_result` (0 câu có đủ `stem` + `answer` không rỗng) → `releaseCredits(5)`, ghi `error_code = E-selfomy-alignment-004` + `error_reason` (migration `0053`), mọi đổi trạng thái job đều có điều kiện `import_status = 'processing'`; `releaseStaleImports` dọn lười job `processing` treo > 150s tại `POST /api/exam-imports`, `GET /api/exam-imports/:id`, `GET /api/credits/wallet`; `POST /api/exam-imports/:id/retry` tạo job mới dùng lại `file_key` + `content_fingerprint` (410 nếu mất file R2, 402 chỉ xóa job mới và giữ nguyên file R2 của job cũ); màn `[6]` bổ sung `ImportFailedPanel` (E-004 + nút `"Thử bóc tách lại AI"`), hộp thoại `InsufficientCreditsDialog` (E-001) và `EXAM_IMPORT_ERROR_MESSAGES` nguyên văn spec trong `packages/api/src/contracts.ts`
- Nhập đề thi từ PDF/Ảnh bằng AI **`[6]`** (`/assignments/tests/import`, TOS-25) — phát hiện tệp đề trùng mã băm SHA-256 và mở lại bản đề nháp cũ với chi phí **0 Credit** (#471): `findCompletedImportByFingerprint` (`apps/server/src/lib/exam-import/dedupe.ts`) lọc theo `(org_id, content_fingerprint)` với `import_status = 'completed'` và `draft_json IS NOT NULL` (tiebreaker `completed_at DESC, started_at DESC, id ASC`, `title` lấy từ `draft_json` fallback `fileName`); `GET /api/exam-imports/lookup?fingerprint=<hex64>` (gate `canImportExam`, đăng ký trước `/:id`) và nhánh chống trùng trong `POST /api/exam-imports` chạy trước `ensureWallet`/`reserveCredits`/R2 trả `200 { duplicateOf }` mà không gọi AI hay ghi `credit_usage_log`; client tính SHA-256 trước upload (`apps/web/src/lib/file-fingerprint.ts`, fail-open khi thiếu `crypto.subtle` hoặc lỗi mạng), hiện `DuplicateExamBanner` (`role="status"`) kèm nút **"Mở lại bản nháp cũ (0 Cr)"** điều hướng `?job=<jobId>` (cả qua chuột lẫn bàn phím Tab → Enter)
- Chỉnh sửa tay bản nháp nhập đề **0 Credit** + cổng xác nhận "Cần rà soát lại" trước khi xuất bản (`/assignments/tests/import`, TOS-26): `PATCH /api/exam-imports/:id/draft` ghi `draft_json` không đụng ví, server bảo toàn `confidence`/`needsReview` gốc từ DB (sửa câu không tự xóa nhãn, chặn xóa bớt câu để lách cổng); `POST /api/exam-imports/:id/publish` chạy cổng xác nhận 2 lớp (422 `REVIEW_CONFIRMATION_REQUIRED` khi còn câu `needsReview` mà chưa tích hộp kiểm), chuẩn hóa `type`/đáp án MCQ theo catalog `ASSIGNMENT_PART_TYPES`, chèn `assignment_prompt[]` + `assignment_test` + `assignment_test_part[]` trong 1 `db.batch` nguyên tử với ID tất định theo `job.id` chống race song song, idempotent qua cột mới `exam_import_job.published_test_id` (migration `0052`); đề `listening` chưa có audio xuất bản sang trạng thái `draft` (khớp gate `audio required when ready`) còn các kỹ năng khác ra `ready`; CSRF Origin + JSON guard riêng cho 2 route mới (`examImportRoutes` mount ngoài `kernelRoutes`); `snapshot.ts` forward `explanation` khi đọc ngân hàng đề (#472)
- Màn `[6]` chuyển cột phải thành trình chỉnh sửa tay: `ExtractedExamPanel` + `QuestionReviewCard` (sửa tên đề, kỹ năng, thời gian, passage Tiptap qua `normalizeLegacyRichText`, từng câu hỏi/đáp án/giải thích/loại câu, giữ nguyên badge vàng "(!) Cần rà soát lại"), hộp kiểm `ReviewConfirmation` "Tôi đã kiểm tra và xác nhận các câu gắn nhãn Cần rà soát lại" và cụm nút `ExamImportActions` ("Lưu bản nháp" luôn bật, "Lưu vào Ngân hàng đề" khóa kèm `aria-describedby` tới khi tích xác nhận); sau publish gọi `useData().refresh()` trước khi điều hướng `/assignments/tests/<id>` tránh 404 do cache kernel cũ (#472)
- Nhập đề thi từ PDF/Ảnh bằng AI **`[6]`** (`/assignments/tests/import`, TOS-24) — Ví Credit tối thiểu + bóc tách AI trong 120 giây + đối chiếu 2 cột (#470): lõi ví `credit_wallet` + sổ cái append-only `credit_usage_log` (reserve/settle/release nguyên tử trong 1 `db.batch` D1, idempotency key UNIQUE chống double-reserve; ví tạo lười với **30 Credit Dùng thử**); bảng `exam_import_job` (fingerprint SHA-256 chuẩn bị chống trùng TOS-25, `draft_json`, trạng thái `processing/completed/failed_refunded`); binding `AI` Cloudflare Workers AI (`toMarkdown` → `@cf/meta/llama-4-scout-17b-16e-instruct` json_schema, zod parse lại, hằng `EXAM_EXTRACT_MODEL`); `POST /api/exam-imports` (raw body ≤ 15 MB PDF/PNG/JPEG) chạy đồng bộ reserve → extract → settle trong 1 request, **mọi lỗi sau reserve hoàn ngay 5 Credit** (`failed_refunded`), thiếu Credit trả 402 kèm số dư; `GET /api/credits/wallet`; màn **`[6]`** từ nút "Nhập đề bằng AI (5 Credit)" trên soạn full test: huy hiệu chi phí/số dư, dropzone, đối chiếu 2 cột (trái PDF lật trang/zoom 50–200% qua pdfjs, phải đề nháp read-only), câu độ tự tin < 0.80 gắn nhãn vàng "(!) Cần rà soát lại", < 1024px chuyển 2 tab; E2E `ai-exam-import-ac-001` với extractor giả lập. Sai lệch nhỏ so với plan: upload dùng raw body + `X-File-Name` (precedent #305) thay vì multipart.
- Nhật ký gửi thông báo (`/notifications`) — gửi lại thông báo lỗi không nhân bản In-app (TOS-23): thêm service `requeueSingleFailedNotification` & `requeueFailedNotifications` (`apps/server/src/lib/notifications/requeue.ts`) và 2 endpoint `POST /api/notification-logs/:id/resend`, `POST /api/notification-logs/resend-failed` đặt lại nguyên tử bản ghi `failed` về `queued` (`retry_count = 0`, `last_error = null`, lấy lại `student.email` hiện tại qua correlated subquery, bảo toàn `idempotency_key` và `read_at` nên không nhân bản thông báo In-app trên cổng học viên), tách học viên trống email vào `skipped` (`no_email`) để không nghẽn đầu hàng đợi (`RESEND_BATCH_LIMIT = 50`, trả đúng `remaining`) và kích hoạt `deliverNotifications` chạy nền với đủ 3 lượt thử; màn `[5]` (`/notifications`) thêm nút `"Gửi lại"` trên dòng `failed` và nút header `"Gửi lại tất cả mục lỗi (N)"` mở `Modal` xác nhận kèm `sonner` toast và giữ nguyên thanh `ChipFilter` khi bộ lọc `?status=failed` về 0 dòng (#464)
- Sổ công nợ (`/debts`) — dòng thời gian hóa đơn & giao dịch và gửi nhắc học phí (TOS-18): nút icon `(eye)` trên mỗi dòng mở ngăn kéo **Lịch sử hóa đơn & giao dịch** (`GET /api/students/:id/billing-timeline` dưới `requireFinanceRole`, nhóm theo tháng giờ VN, hiển thị nguồn `"QR Bank-Hub"` hoặc `"Thu thủ công · {Tiền mặt|Chuyển khoản|Khác}"`, ẩn `raw`/`content` sao kê gốc của Bank-Hub, link tới `/tuition/$invoiceId`); cột checkbox chọn học viên đang nợ (`remaining > 0`) bật nút `"Gửi nhắc học phí (N)"` ở PageHead → hộp thoại xác nhận gọi `POST /api/debt-reminders` (dưới `requireFinanceRole`) phát sự kiện `tuition_reminder` qua hàng đợi Email + In-app (`enqueueNotifications` + `deliverNotifications`, khóa chống trùng `tuition_reminder:<invoiceId>:<YYYY-MM-DD VN>`, số tiền nhắc bằng số dư còn nợ thực tế) kèm toast điều hướng tới màn **Nhật ký gửi thông báo** (`/notifications`) (#452)
- Hàng đợi thông báo Email + In-app (TOS-22): `deliverNotifications` tự động thử gửi lại tối đa 3 lượt (`MAX_EMAIL_ATTEMPTS = 3`, khoảng chờ mặc định `2s`/`5s` giữa các lượt, inject được `[0, 0]` cho test/E2E) đối với các bản ghi `queued` có kênh Email; hết 3 lần lỗi liên tiếp (`retry_count = 3`) chuyển trạng thái sang **Lỗi gửi (`failed`)** kèm mã lỗi `E-selfomy-alignment-010` và nguyên nhân đã che token nhạy cảm (`sanitizeDeliveryError`, cắt `≤ 500` ký tự); gửi thành công ở lượt thử lại xóa `last_error = null`; màn **Nhật ký gửi thông báo `[5]`** (`/notifications`) hiển thị nhãn đỏ `"Lỗi gửi"` kèm dòng phụ `E-010: <nguyên nhân> sau 3 lần thử` dưới thông tin người nhận và `"3/3 lần thử"` trong hộp thoại chi tiết, trong khi thông báo In-app trên cổng học viên giữ nguyên và mở xem chỉ đặt `read_at` (#463)
- Sổ công nợ (`/debts`) & phân quyền tài chính (TOS-17): hộp thoại **Ghi nhận thu tiền học phí** kiểm tra inline số tiền thu (`> 0` và `<= remaining`), hiện lỗi `"Số tiền thu phải lớn hơn 0 và không vượt quá số tiền còn nợ"` (`aria-invalid` + `aria-describedby`) và khóa nút `"Lưu phiếu thu học phí"` khi không hợp lệ; allowlist vai trò tài chính `FINANCE_ROLES = ["teacher", "owner", "admin"]` (`canAccessFinance`) cùng middleware `requireFinanceRole` trả `403 finance-forbidden` trên toàn bộ `/api/invoices*`, `/api/payment-transactions*`, `/api/bank-link*` cho vai trò `ta` / `class_teacher`, ẩn `invoices` trong snapshot `/api/kernel` kèm `viewer: { role, canAccessFinance }` và ẩn `tuition` trong `/api/dashboard/reminders`; web ẩn mục "Doanh thu" / "Công nợ" trên Sidebar và ⌘K, tự điều hướng `/debts` và `/tuition*` về `/dashboard` kèm thông báo (#451)
- Sổ công nợ (`/debts`): nút `Thu` mở hộp thoại **Ghi nhận thu tiền học phí** — thu một phần/toàn bộ với phương thức (Chuyển khoản/Tiền mặt/Khác) + ghi chú; phiếu thu lưu 1 dòng ledger `payment_transaction` (`provider = "manual"`, migration `0049` thêm `method`/`recorded_by`) rồi `recomputeInvoiceStatement` tính lại Đã đóng/Còn nợ và 3 thẻ KPI ngay; server chặn vượt nợ (422 `amount-exceeds-debt`), chốt hóa đơn đã `paid` (422 `invoice-settled`) và idempotent theo `clientRequestId` (retry không ghi đôi); học viên nhiều khoản còn nợ chọn khoản thu (mặc định hạn sớm nhất); trang chi tiết hóa đơn hiển thị cột Phương thức (#450)
- Lịch nghỉ chung (`/schedule`): mở phương thức **Hủy buổi (không bù)** (`mode = "cancel"`) chuyển các buổi `upcoming` trong khoảng nghỉ sang `cancelled` mà không sinh buổi bù cuối khóa (bảng mới `holiday_session_cancel`, migration `0050`, phân biệt với buổi giáo viên hủy tay) và thao tác **Xóa kỳ nghỉ (Hoàn tác)** (`DELETE /api/holidays/:id`) cho kỳ nghỉ tương lai (`fromDate > hôm nay` giờ VN) thu hồi buổi bù chưa diễn ra + khôi phục buổi gốc/buổi hủy về `upcoming` trong 1 batch nguyên tử (422 `holiday-started` nếu đã bắt đầu, 409 `makeup-touched` kèm danh sách nếu buổi bù đã điểm danh hoặc thay đổi); kích hoạt học viên sau kỳ nghỉ cancel tự động đánh dấu `cancelled` ở ngày nghỉ (D7); lịch tuần hiển thị thẻ kỳ nghỉ kèm nút hoàn tác và nhãn `"Đã hủy — «tên kỳ nghỉ»"` (#448)

## 2026-10-23

### Added
- Tầng Question Group cho đề thư viện: cột `library_test_part.groups` (migration `0044` ADD COLUMN có default `[]`), schema nhóm kèm bất biến dải câu (nhóm đầu từ 0, nối tiếp, phủ đủ câu, `answerSet` ≥2 câu và nằm trọn một nhóm), rule xuất bản theo nhóm (inline cloze cần dạng điền từ + đúng 1 marker `____`), route PUT/DTO trả và lưu `groups` (#420 phase 2–3, #424)
- Trang soạn đề thư viện admin theo bố cục Quiz Builder hai cột: cây điều hướng Part → Nhóm câu → Câu đánh số fold theo số câu thật, thẻ Part có tab Nội dung/Câu hỏi, thẻ Nhóm có tab Hướng dẫn/Thiết lập/Câu hỏi, hàng câu thu gọn kèm chip tóm tắt, panel "Kiểm tra đáp án" chỉ đọc có jump tới câu, thanh hành động Lưu part/Kiểm tra đáp án (#424)
- Editor dùng chung mở rộng (optional, web không đổi hành vi): `AnswerKeyGrid` hàng câu thu gọn + `qStartOverride` + ô giải thích từng câu, `QuestionKeyEditor` prop `view` tách hướng dẫn/khỏi câu hỏi, `CardControls`, `questionSummary`; ClozeEditor Apply giữ `explanation`/`answerSet`/`type`/`pin` (cả table-grid) (#424 phase 1)

### Fixed
- Editor soạn đề (cloze + tablecomp): `segmentsToItems` không còn merge `explanation`/`answerSet`/`pin`/`type` theo vị trí index — chèn/xóa blank giữa chuỗi không còn bám nhầm metadata của câu khác; metadata theo nội dung đáp án, trùng đáp án map theo thứ tự, sửa lỗi chính tả đáp án không mất giải thích (#425)
- Admin library: `parseGroups` nhóm câu corrupt được log kèm lý do + DTO gắn cờ `groupsCorrupt`; PUT ghi đè groups corrupt (rỗng hay soạn lại) thiếu cờ tường minh `discardCorruptGroups` bị chặn 409 `GROUPS_CORRUPT`; cờ trên đề đã sạch → 409 `GROUPS_NOT_CORRUPT`; đề có part groups corrupt bị chặn xuất bản; UI part có banner cảnh báo + nút «Lưu đè nhóm hỏng» (#425)
- Library PATCH `status=ready`/publish với cột `questions` JSON corrupt (phần tử sai schema) trả 400 `NOT_READY` kèm issues có cấu trúc thay vì 500 TypeError — `toPartInput` parse `questions` fail-soft qua `assignmentQuestionSchema` như `groups` đã làm; trade-off ghi trong comment `parseQuestions` (toàn-mảng → `[]` thay vì lọc từng câu) (#426)
- Path lỗi `answerSet` vắt nhóm thống nhất 2 luật: superRefine của `libraryPartUpsertSchema` emit `["groups", gi]` (nhóm chứa câu đầu của khóa — parity `partIssues`), GroupCard hiển thị banner lỗi cấp nhóm (key `groups.{gi}`), `firstIssueFocusPlan` nhận key nhóm không field và mở đúng tab Câu hỏi của nhóm (#426)
- Trang soạn đề thư viện giảm work mỗi keystroke ở quy mô 4 part × 40 câu: `partInputFromValue` 4→1 lần/keystroke (memo per-slot `savedInputsBySlot` + helper thuần `effectivePartsFor` có unit test), `partValueFromDto` 3→0, khối derived 2.52→0.75ms; `useDeferredValue` tách ready-check/cây/bảng đáp án khỏi frame gõ; dirty-check memo baseline canonical string (bỏ stringify passage 20k mỗi render) (#426)
- E2E admin library bỏ đếm Tab cứng: vòng Tab trần 20 + `toBeFocused()` + assert thứ tự hàng đối chiếu chính cây điều hướng, scroll assert theo row id ổn định `#group-p1-1-q1`; `fillQuestionRow` (reading + listening) scope hàng theo `#${slot}-q${index}` thay `.nth()` toàn trang — không giảm số assertion (#426)
- `normalizeQuestions` của form thư viện không còn strip `explanation`/`answerSet` khi lưu part — trước đó mọi lần mở+lưu part đều mất im lặng 2 field này (#420 Task 4.4, #424)
- Lỗi soạn đề được bắt và sửa trong đợt e2e mới: scroll race khi nhảy tới câu (rAF trước commit), panel Kiểm tra đáp án jump sai hàng nhóm ≥2, editor phẳng hiển thị "Câu 14" thay vì số fold, sidebar admin tràn ngang 375 (#424)

### Added
- Câu hỏi đề IELTS nhận 2 trường optional mới `explanation` (giải thích rich text sau khi nộp) và `answerSet` (khóa tập đáp án không thứ tự, IELTS "Choose TWO") trên `assignmentQuestionSchema` + interface `AssignmentQuestion` dùng chung cho assignment_prompt lẫn library_test_part — optional không default nên câu cũ giữ nguyên shape, dirty-check web không lệch; payload student vẫn chỉ gửi `{stem, opts, type, pin}` nên `explanation`/đáp án không bao giờ tới client học viên trước khi nộp (#420 PR1)
- `gradeQuiz` chấm các câu cùng `answerSet` như một tập không thứ tự bằng khớp hai phía cực đại (Kuhn, deterministic theo index tăng dần — cùng input luôn ra cùng verdict mỗi câu, trang review chấm lại khớp chấm lần đầu); câu không có `answerSet` chấm y như cũ; 12 test mới (8 grader + 4 schema) phủ hoán vị, alts giao nhau, đường tăng, tập trộn (#420 PR1)

### Docs
- Plan `plans/261022-1329-library-question-groups/` qua gate validate (30 claims) + red-team (16 findings, 15 apply) và 3 lần kongming counsel — chi tiết trong `## Red Team Review` của plan.md (#420)

## 2026-10-22

### Added
- E2E cho cổng quản trị (plan #413 phase 7): 3 spec Playwright mới — `admin-auth.spec.ts` (admin vào được shell; teacher/student bị chặn ở admin origin `login?error=NOT_ADMIN`; admin bị chặn ở web + cổng học viên; sign-up admin origin email ngoài `ADMIN_EMAILS` bị từ chối), `admin-library-reading.spec.ts` (tạo đề Reading 3 passage đa dạng dạng câu: tfng chip, headings có option bank, mcq → xuất bản → sửa header → hạ nháp → xóa) và `admin-library-listening.spec.ts` (4 section, upload fixture mp3 sinh trong test → `<audio>` GET 200 đúng Content-Type → xuất bản bị chặn khi thiếu audio → xóa test → API audio 404); helper seed admin qua API + khóa DB `role='admin'`, `email_verified=1` (#413)
- Docs đồng bộ cổng quản trị: boundary map + quy tắc "admin ngoài kernel tree" trong `docs/system-architecture.md`; runbook thêm origin `admin.<domain>`, binding `ADMIN_ORIGINS`/`ADMIN_EMAILS`, quy trình cấp admin đầu tiên, bucket `library-audio` và kiểm domain custom; `docs/codebase-summary.md` + `docs/project-roadmap.md` đánh dấu mini project admin (#413)
- Migration `0042_syllabus_class_pointer_reconcile`: UPDATE idempotent same-org chữa con trỏ lớp ↔ giáo trình lệch về đúng bản copy, không xoá dòng (#394)

### Changed
- Refactor tạo và gán syllabus (issue #394): tách bạch **Template** và **Giáo trình của lớp** ở API/service/web — template là `syllabus.class_id IS NULL`, giáo trình của lớp là bản copy có `class_id`; `syllabus.class_id` là nguồn sự thật duy nhất của quan hệ lớp ↔ giáo trình, `class.syllabus_id` chỉ còn là cột dẫn xuất ghi qua `apps/server/src/lib/syllabus-curriculum.ts`. Route mới theo ngữ cảnh `/api/syllabus-templates/...` và `/api/classes/:id/curriculum/...` (route `/api/syllabi/...` cũ đã gỡ hẳn ở phase 8, #401); nhập trùng trả **409** thay vì 500. Web dùng chung `TemplatePicker` có preview cho tạo lớp và gán sau, class detail đọc giáo trình qua hook `useClassCurriculum` (#394)

### Fixed
- Layout form trong Modal dính field: thân modal thêm `[&>form]:flex [&>form]:flex-col [&>form]:gap-4` tại `apps/web/src/components/ui/modal.tsx` để form con trực tiếp tự động nhận nhịp gap 14px (1rem gap-4); Field đổi từ `gap-1` sang `gap-2` (7px = 0.5rem) tạo phân cấp rõ ràng label→control (7px) < field→field (14px); bọc TemplatePicker tránh khoảng hở kép aria-live; dọn 9 wrapper trạng thái với `empty:hidden`, xoá margin thừa (`mb-3`) và class layout trùng; bổ sung test khoá hợp đồng `modal.test.tsx`, `field.test.tsx` và E2E `modal-form-spacing.spec.ts` đo DOM thực tế trên 3 viewports (#416)
- Thư viện đề cổng quản trị (apps/admin): so sánh snapshot giá trị đã gửi trước khi dọn draft part hoặc reset dirty header khi save thành công; nếu người dùng gõ thêm ký tự trong lúc mutation đang xử lý trên mạng, draft được giữ lại với dirty=true, không bị đè mất khi form remount và useBlocker tiếp tục cảnh báo rời trang (#418)
- Dashboard học viên (Tổng quan các lớp + khối "Buổi tới" ở chi tiết lớp): buổi hôm nay đã qua giờ kết thúc (ngày + giờ bắt đầu + thời lượng, giờ VN) không còn bị server trả làm "Buổi tới" — `loadNextSession` nhận `now`, bỏ qua buổi đã hết giờ và chọn buổi kế tiếp trong ngày (đồng bộ `isLessonEnded` client từ #393); nếu không còn buổi hợp lệ thì ẩn "Buổi tới". Phép tính end-time gom về helper chung `vietnamSessionEndMs` (`@teacher-os/api/vietnam-date`) dùng chung server + client, không đổi contract/API (#395)
- Harness `pnpm design:compare` chạy xanh lại từ đầu tới cuối (trước đó exit 1 ở bước seed với `no org yet, waiting for bootstrap`): seed đồng bộ trên sự kiện thật `GET /api/kernel` (observer + rescue goto khi client abort 15s) thay vì blind-poll DB ~21.75s; harness tự chọn **free port mỗi run** (API/WEB/STUDENT/DESIGN) — hết xung đột với worktree AI song song/dev stack từng khiến signup đi vào API của worktree khác; cleanup kill cả process group + SIGTERM/SIGHUP handler (hết orphan chiếm port), redact `token=` trong log dump, seed-fail in log stack (api/web/student); screen `t-attendance` bỏ click tab `Buổi học` đã bị #391 merge (chụp default Sessions & practice, không mutate check-in) (#397)
- Cặp ảnh `t-attendance` khớp trạng thái giữa design v2 và app: app chụp đúng **modal điểm danh** (trước đó chụp tab mặc định) qua `data-testid="session-attendance-open-{index}"` mới trên link mở modal — non-mutating, được guard đo zero-POST `/check-in` trong harness (`nonMutating` flag + FAIL nếu có POST); seed so sánh thêm học viên thứ 2 (Nguyễn Thu Hà) vào lớp chính để buổi nhóm render link và tắt nút commit check-in 1:1 từng bị mutate seed giữa các viewport; `capture.mjs` tự xoá `errors.log` khi run sạch, không còn FAIL ảo từ file stale (#403)

### Removed
- Route alias syllabus từ #394: `GET/POST /api/syllabi`, `/api/syllabi/:id/{modules,replace-content,remove}`, `/api/classes/:id/{import-syllabus,remove-curriculum}` gỡ hẳn — chỉ còn route ngữ cảnh `/api/syllabus-templates/...` và `/api/classes/:id/curriculum/...` (phase 8, #401)

### CI/Infra
- Biome gate local hết tự mutate: `pnpm check` giờ là `biome check .` (read-only — không còn sửa file ngoài phạm vi khi chạy), autofix chủ động tách sang `pnpm check:fix`; exclude `plans/reports/**/*.html` (artifact report sinh tự động) khỏi biome + migrate `rules.recommended` → `rules.preset` (hết deprecation `biome.json`); format-only `apps/e2e/devserver-watchdog.mjs` (formatter error chặn gate read-only). CI quality (biome/test/check-types/build) bật thêm cho push + PR vào `develop` — develop không còn merge lúc gate đỏ im lặng; contract test khóa cấu trúc trigger `[main, develop]` + root check non-mutating; AGENTS.md đồng bộ (local gate vẫn là gate chính, remedy develop-đỏ-lỗi-format = `pnpm check:fix`) (#409)

### Docs
- Dọn 3 comment còn trỏ route alias `/api/syllabi/...` đã gỡ (`contracts.ts` invoiceCreateSchema, `kernel.ts` POST /invoices, `student.ts` quizWriteGuard) sang route thay thế `POST /api/syllabus-templates`; comment quizWriteGuard trỏ precedent bodyLimit đúng file `syllabus.ts` (trước đó trỏ sai `kernel.ts`) (#406)

---

## 2026-10-21

### Added
- Hàng chờ chấm bài Writing/Speaking cho giáo viên (`/grading`, `GET /api/grading`) kèm mục điều hướng **Chấm bài** trong nhóm IELTS trên sidebar: hợp nhất cả bài giao theo lớp (`mode='assignment'`) và bài tự luyện (`mode='practice'`, nhãn `Luyện tập`), bộ lọc URL (`?q=&mode=&skill=&status=`) có đếm chip chéo nhóm và ô tìm kiếm debounce 300ms; đồng bộ nhãn bài tự luyện chưa chấm ở Lịch sử và catalog học viên về **Chờ chấm** (#383)

### Changed
- Trang chi tiết lớp của giáo viên (`/classes/$classId`) kéo về đúng bố cục **design v2**: header còn 2 action ("Giao bài tập" + "Sắp xếp buổi" — disabled khi lớp chưa có giáo trình), bỏ dòng lead (học phí chuyển hiển thị ở tab **Học viên** cùng nút `+ Thêm học viên vào lớp`/`Sửa` học phí), 4 thẻ stat thay 6, gộp tab **Buổi học + Bài tập** thành **Sessions & practice** (mặc định, lưới 2 cột: card buổi học với thanh điểm danh "đã điểm danh/vắng/chưa" + accordion bài đã giao) và tách tab **Giáo trình** riêng; giữ tab Từ vựng/Ghi chú; URL `?tab=sessions|assignments|roster` cũ vẫn mở đúng tab; dọn 6 chỗ class chết `text-foreground-2`/`bg-muted/40/30`; primitive `Button` tách `buttonVariants` dùng chung cho link (không đổi hành vi) (#391)
- Trang chi tiết lớp của học viên (`/classes/$classId`) đồng bộ theo **design v2** (`StudentClass.tsx`): thêm banner việc cần làm (`TodoBanner`) khi còn bài `class_assignment` chưa nộp, thẻ thông tin lớp `<dl>` 2→4 cột kèm thanh tổng hợp (`ClassInfoCard`), header `h1` `text-2xl md:text-3xl font-semibold` + `Badge` trạng thái + nút `Nhắn giáo viên`, sửa vòng `RingStat` sang token `stroke-muted`/`stroke-primary`, bổ sung primitive `Tabs`/`Badge`/`AvatarInitials` cho `apps/student`, chuyển hành trình buổi học sang timeline dọc 32px (`ClassLessonList`), danh sách bài tập sang bảng `ClassAssignmentTable`, giáo trình sang icon tròn `Check`/`CircleDashed` và bạn cùng lớp sang avatar tròn `size-8` (#389)
- Gộp luồng từ vựng của học viên (`apps/student`) về một đường dẫn canonical duy nhất **`/practice/vocabulary/*`** (hub đầy đủ, deck detail, session, courses, course detail); `/vocab` và `/vocab/*` cũ redirect (`replace: true`) sang path tương ứng và giữ nguyên query (`?course=`, `?mode=`, `?q=`); bỏ mục điều hướng riêng **Từ vựng** trên sidebar học viên, truy cập thống nhất qua **Luyện tập › Vocabulary** (#387)
- Redesign giao diện **v2** cho app giáo viên và app học viên: **light là theme mặc định** (dark là override, toggle giữ nguyên semantics), accent cam bỏ — **hành động chính = mực** theo bảng shadcn neutral oklch, font **Geist / Geist Mono Variable** self-host, thang chữ về rem mặc định Tailwind (base 14px). Shell đổi sang layout `sidebar-07` dùng chung hai app; thêm search toàn cục ⌘K (command palette) (#378)
- Trang mới/khoác mới theo v2: catalog Luyện tập (Practice) 5 kỹ năng, Lịch sử làm bài (History), Trang bạn học (Classmates); DataTable, Badge/TuitionBadge, PageHead, Modal, chip lọc theo token v2; trạng thái = chấm emerald/amber, quá hạn/lỗi = đỏ destructive; màn chấm bài giữ riêng cặp màu verdict (#378)
- Database: migration `0041_known_ink` (#378)

### Fixed
- Bài viết Writing chứa HTML (`<p>…</p>`, entity `&amp;`…) từ seed hoặc dữ liệu cũ không còn hiện thẻ HTML thô trên màn chấm giáo viên (`/grading/$attemptId`) và màn kết quả học viên (`/learn/quizzes/attempt/$attemptId`): server chuẩn hoá HTML sang plain text khi đọc kèm bản đồ offset hai chiều `rawStart`/`rawEnd` (`essayToPlain`, `toEssayView`), giữ nguyên lưu trữ offset raw trong DB và căn khớp vị trí highlight `mark[data-n]` + ghi chú inline `essay-inline-note` cũng như số từ `countWords` (#382)
- Tab **Hành trình học** ở trang chi tiết lớp học viên: buổi còn `status = upcoming` nhưng đã qua giờ kết thúc (ngày + giờ bắt đầu + thời lượng, giờ VN) vì giáo viên chưa check-in giờ hiện badge **Đã kết thúc** thay vì "Sắp tới", không bao giờ bị gán "Buổi tới" (client-side `isLessonEnded` + `findNextLessonId` nhận `now`); thẻ Tổng quan đồng bộ; dữ liệu `date` null/time lỗi giữ nguyên hiển thị cũ, không đổi API/DB (#393)

### Removed
- `VocabPracticeCatalog` (lưới deck rút gọn trùng lặp tại `/practice/vocabulary`), thay bằng hub từ vựng đầy đủ (#387)
- Toàn bộ alias token v1 (`text-meta`, `text-hot`, `bg-surface`, `neu*`, `font-display`, `accent-on/soft/hover/active`, `line*`, `chip`, spacing `--space-*/--gap-*`…) khỏi `globals.css` và markup — mọi UI giờ dùng trực tiếp utility shadcn v2 (#378)

---

## 2026-10-20

### Fixed
- Dashboard giáo viên: giờ học ở **Lịch hôm nay** / **Lịch sắp tới** dùng `text-lg tabular-nums` thay token 40px và cột giờ co theo nội dung (`auto` + `min-w-[5ch]`), hết tình trạng chữ `19:00` đè lên tên lớp; tên lớp dài xuống dòng trong cột của nó; tiêu đề section xuống `text-xl` đúng thứ bậc design; dòng meta chỉ nối phần có giá trị — lesson thiếu topic hết dấu `·` treo cuối (#373)

## 2026-10-10

### Changed
- Nút chuyển giao diện Sáng/Tối (topbar giáo viên, shell + các trang đăng nhập học viên) đổi từ pill chữ "Tối/Sáng" sang **switch icon**: núm tròn màu mực trượt 150ms mang icon mặt trăng (tối) / mặt trời (sáng), hai icon nền mờ hai đầu; semantics chuyển sang `role="switch"` + `aria-checked` để screen reader đọc được trạng thái. Logic lưu theme và đồng bộ giữa tab giữ nguyên (#356)

## 2026-10-09

### Changed
- Redesign giao diện app giáo viên (`apps/web`) và app học viên (`apps/student`) theo design mới: **dark là theme mặc định** với toggle Sáng/Tối lưu lựa chọn (không nháy khi reload nhờ script chống nháy), accent chuyển sang **cam**, font mới **Inter Tight + DM Mono** (self-host), tiêu đề lớn extrabold có kicker mono, card viền mảnh nền nổi, input nền chìm, trạng thái đơn sắc + cam — đỏ chỉ dành cho nút phá hủy (#349)
- Toàn bộ trang giáo viên (dashboard, lớp, học viên, lịch, giáo trình, hồ sơ, báo cáo, bài tập, đề thi, chấm bài, học phí) và app học viên (tổng quan, làm bài, kết quả, học phí, onboarding, đăng nhập) khoác ngôn ngữ thị giác mới; danh sách lớp đổi từ bảng sang lưới card; shell học viên đổi sang header một hàng (#349)

---

## 2026-10-08

### Added
- Hồ sơ học viên, tab "Học phí": thêm Tổng học phí / Đã đóng / Còn lại tính theo học phí các lớp đang học (cộng dồn nhiều lớp) và bảng theo lớp; trước đó chỉ liệt kê hóa đơn nên không biết học viên còn phải đóng bao nhiêu (#347)
- Trang chi tiết hóa đơn `/tuition/<id>`: click (hoặc Enter/Space) vào dòng hóa đơn ở Doanh thu hoặc tab "Học phí" của hồ sơ học viên để xem đầy đủ thông tin (mã, loại, hạn, phương thức, ghi chú, số tiền đã thu/còn lại, học viên/lớp), QR + link thanh toán và lịch sử giao dịch ngân hàng đã khớp; nút trong dòng vẫn hoạt động như cũ, filter kỳ `?ky=` được giữ khi quay lại danh sách (#345)
- API mới `GET /api/invoices/:id/transactions`: lịch sử giao dịch ngân hàng đã khớp của một hóa đơn (org-scoped, không trả payload raw/định danh nội bộ) (#345)

## 2026-10-07

### Added
- Chấm Writing: giáo viên bôi đen từ/cụm từ trong bài để highlight và ghi chú (lưu ngay, sửa/xoá trong danh sách dưới bài); học viên thấy highlight đánh số và ghi chú ở màn kết quả khi bài đã có điểm (#332)

### Changed
- Màn kết quả học viên: bài Writing đã chấm hiện 2 khung (bài viết bên trái | "Kết quả chấm của giáo viên" bên phải dính khi cuộn); ghi chú của giáo viên hiện ngay sau đoạn được highlight thay cho danh sách riêng dưới bài (#336)

### Fixed
- Trạng thái học phí hiển thị đúng số tiền còn lại khi hoá đơn được thanh toán một phần: tab Học viên trong lớp tính nợ theo ledger đã nhận (trước đó hiện nguyên số tiền gốc), /tuition và hồ sơ học viên kèm nhãn "còn Xđ" cạnh badge (#340)

### Removed
- Gỡ trang riêng `/payments` và mục sidebar "Nhận học phí" — liên kết tài khoản ngân hàng (SePay Bank Hub) chuyển vào trang Hồ sơ `/profile` (card "Nhận học phí qua chuyển khoản", sau card Google); đường vào qua avatar → Hồ sơ (#338)

## 2026-10-06

### Added
- Nhận học phí qua VietQR (#320): giáo viên liên kết tài khoản ngân hàng qua SePay Bank Hub tại trang riêng `/payments` (sidebar "Nhận học phí"); mỗi hoá đơn có mã chuyển khoản `TOS` + 8 ký tự và link công khai `/pay/<token>` kèm QR; tiền về tự cộng dồn qua IPN, đủ thì "Đã thu"; chuyển nhầm/không có mã vào hàng "Giao dịch chưa khớp" để gán hoặc bỏ qua; nút "Đối soát" kéo lại giao dịch 7 ngày của mọi tài khoản đã từng liên kết
- Portal học viên: khu "Học phí" trên trang chủ và trang chi tiết hoá đơn với QR (ẩn khi không còn nợ) (#320)

### Changed
- Tổng "Đã thu/Còn nợ" ở Học phí tính theo số tiền ledger đã nhận của hoá đơn chưa đóng; hoá đơn "Thu một phần" hiện badge riêng và cột số tiền dạng `đã nhận / tổng` (#320)

### Fixed
- Popup buổi học trên `/schedule` hiện đúng trạng thái từng học viên cho lớp legacy chưa có ngày: không còn chọn row theo UUID nhỏ nhất của cả khoá; chỉ học viên ở đúng buổi kế tiếp mới có Hủy/Sửa/Điểm danh và thao tác ghi vào đúng row đó; card lịch legacy hiện trạng thái đúng buổi trong tuần đang xem và ẩn ở tuần ngoài lịch lớp (#326)
- Không điểm danh được buổi chưa tới ngày: nút Điểm danh ẩn ở popup /schedule, và `POST /lessons/:id/check-in` + `POST /classes/:id/sessions/:date/check-in` trả 422 `future-session` (toast "Chưa tới ngày học — chưa thể điểm danh."); Hủy/Sửa buổi tương lai vẫn cho phép (#326)
- Backfill ngày cho dữ liệu legacy xếp theo trạng thái (completed → cancelled → còn lại) thay vì chỉ theo `createdAt`, CLI từ chối dump thiếu `status`, SQL kèm guard `status`, runbook Step B bổ sung truy vấn phát hiện dữ liệu đã backfill sai (#326)
- Test server của #320 gọi route `/api/kernel/settings` đã gỡ ở #324 → bootstrap org qua `/api/kernel` (#326)

---

## 2026-10-05

### Added
- Giáo viên xem và chấm bài Writing/Speaking học viên đã nộp từ tab Bài tập của lớp: trang chấm hiện đề + essay (số từ) hoặc phát file bài nói, chấm 4 tiêu chí IELTS (0–9, bước 0.5) với band tổng tự tính và nhận xét; sửa điểm được bất cứ lúc nào (#319)
- Màn kết quả học viên hiện band, điểm 4 tiêu chí và nhận xét của giáo viên ngay khi được chấm (#319)
- Tab Học viên ở chi tiết lớp: cột Học phí hiện badge trạng thái cùng nhãn-màu với trang Học phí (Chưa lập phiếu / Đã thu / Chưa thu + số tiền / Quá hạn + số tiền đỏ đậm); "Quá hạn" suy từ hạn đóng theo giờ VN, nhất quán giữa `/tuition`, hồ sơ học viên và roster (#325)
- Modal Tạo lớp cảnh báo realtime (không chặn submit) khi lịch đang chọn trùng thứ + giao giờ + giao khoảng ngày chạy với lớp đã tạo: liệt kê tối đa 3 lớp trùng (tên, thứ giao, giờ), tự ẩn khi đổi giờ/ngày hết trùng hoặc đang lưu; bỏ qua lớp legacy free-text/qua đêm và lớp đã hết buổi (window suy từ `skeletonOf`, không dùng cột `status` vacuous) (#315)

### Changed
- Trang Bài tập: bộ lọc "Phần thi" khi xem "Tất cả" kỹ năng giờ nhóm chip theo kỹ năng (Writing / Reading / Listening / Speaking) thay vì một hàng 12 phần thi trộn lẫn; chọn một kỹ năng vẫn chỉ hiện phần thi của kỹ năng đó
- Chip lọc kỹ năng/phần thi hiện badge số đề sẽ còn nếu bấm (đếm theo từ khoá đang gõ, có ở cả chế độ một kỹ năng); chip 0 đề vẫn full contrast, badge "0" báo trước ngõ cụt
- Bộ lọc trang Bài tập sống trong URL (`?q= &skill= &part=`): reload, back/forward và link chia sẻ giữ nguyên trạng thái lọc; ô tìm kiếm debounce 300ms lên URL để không rớt ký tự khi gõ
- Dưới `lg`: card bộ lọc gập mặc định thành hàng "Bộ lọc" kèm badge số filter đang áp dụng và đếm `n/m đề`; desktop luôn mở như cũ

### Fixed
- Tab Bài tập ở chi tiết học viên hiện bài đã giao qua flow Giao bài tập (gộp với bài chấm legacy, sắp theo hạn tăng dần) thay vì luôn trống (#318)
- Bộ chip lọc có ngữ cảnh nhóm cho screen reader (`role="group"` + `aria-label` "Kỹ năng" / "Phần thi — <kỹ năng>"); badge đếm ẩn với AT để accessible name chip ổn định cho voice control và e2e selector exact

### Removed
- Gỡ trang Cài đặt (`/settings`) và API `/api/kernel/settings` (GET/PUT/POST) cùng contract `workspaceSettings*` — chưa tính năng nào dùng workspace settings (chỉ chính trang này ghi/đọc); helper `getApiBaseUrl()` tách sang `lib/repos/api-base-url.ts` cho `invitations` dùng tiếp. Bảng DB `workspace_settings` giữ nguyên (không migration), khôi phục bằng revert (#321)

### CI/Infra
- Thêm suite Vitest cho `packages/api` (script `test` + `vitest.config.ts`): unit `grade-quiz` (alt separator `" / "`, pin NFC/NFD), `infer-question-types` (TFNG biên, 8 case), `word-count` (emoji/CJK/hyphen); mở rộng integration `student-quiz.test.ts` của server: IDOR cross-org qua `x-student-org-id`, start race (1×201 + 1×200 cùng attemptId, 1 row), answer value >500 ký tự, `q` âm/lẻ/ngoài range, `json_quote` round-trip, raw JSON key `"3.0"` regression (#313)

### Docs
- Scenario report 42 case cho quiz attempt lifecycle, coverage matrix trước/sau và QC UAT docs (`plans/261002-1409-scenario-test-cases/`, `plans/261002-0406-uat-squad-round/reports/qc-test-cases-ak-scenario-2026-10-02.md`) (#313)

## 2026-10-02

### Added
- Trang làm bài học viên có màn nộp bài Speaking: đề hiển thị đúng theo part (câu hỏi Part 1/3, cue card Part 2) kèm hướng dẫn của giáo viên và card "Hướng dẫn làm bài"; học viên kéo thả hoặc chọn 1 file audio/video (MP3, M4A, WAV, WEBM, OGG, MP4, MOV, tối đa 50 MB) có thanh tiến trình, nghe/xem lại, thay hoặc xoá file; nút "Nộp bài" chỉ mở khi đã có file (server cũng chặn); màn kết quả hiện "Bài nói của bạn" và nghe lại được thay cho score card 0/0 (#305)
- Portal học viên: card "Lớp học của tôi" hiện giáo viên (avatar, tên, email); bấm card lớp đã tham gia mở trang chi tiết lớp `/classes/:classId` gồm thông tin lớp, giáo viên (link email), danh sách buổi học của chính học viên (Đã học / Sắp tới / Vắng / Đã huỷ, đánh dấu buổi tới) và bài tập của lớp; endpoint `GET /api/student/classes/:classId` chỉ trả cho học viên đang học lớp đó. Mục "Trang chủ" ở sidebar thành link (#307)
- Trang làm bài học viên có ô nhập bài viết cho đề Writing: autosave như các dạng câu hỏi (reload có dialog tiếp tục), đếm từ trực tiếp với mục tiêu Task 1 (150) / Task 2 (250) — thiếu từ chỉ cảnh báo không chặn nộp; màn kết quả và trang soi bài hiện lại bài đã nộp kèm số từ thay cho score card 0/0 (#304)
- Answer-key grid cảnh báo các câu bị suy luận thành True/False/Not Given và có nút đặt dạng cho cả cụm câu chỉ bằng một lần bấm (#303)

### Changed
- Thanh điều hướng câu hỏi bỏ hàng tab nhóm "Questions X–Y", hiện toàn bộ số câu theo thứ tự và trải full chiều ngang màn hình; ở màn đọc chia đôi thanh nằm dưới cả hai pane, dưới `lg` giới hạn 30% chiều cao màn hình và cuộn khi đề dài (#303)

### Fixed
- Trang làm bài/soi bài và preview mô phỏng của giáo viên: câu True / False / Not Given nằm trong đề dạng điền chữ (note, sentence completion…) mà không khai dạng riêng và không có chỗ trống `____` giờ hiện đủ radio TRUE / FALSE / NOT GIVEN (hoặc YES / NO / NOT GIVEN) thay vì chỉ in đề bài không có chỗ trả lời; đề cũ và bài đang làm dở tự đúng, không cần migrate dữ liệu (#303)

### CI/Infra
- Bucket R2 private `media` bind vào Worker server (`MEDIA`) và migration 0032 thêm 5 cột `media_*` trên `quiz_attempt`; release đầu cần bật R2 trên tài khoản Cloudflare và cấp quyền "Workers R2 Storage: Edit" cho token deploy (xem runbook) (#305)
- Migration 0031 thêm cột `essay` (`text DEFAULT '' NOT NULL`) trên `quiz_attempt` cho bài Writing; cùng 0032 đều additive-only, runbook cập nhật bước backup D1 và bảng rollback-safety 0026–0032 (#304, #305)

## 2026-10-01

### Added
- Trang xác nhận email sau verify cho cả teacher và học viên: bấm link trong mail landing về `/verify-email` của đúng cổng (card trạng thái + gửi lại link khi hết hạn) thay vì response trần của API (#297)
- Quên mật khẩu qua email cho cả hai cổng (#292): teacher ("Forgot password?" trên login) và học viên ("Quên mật khẩu?") xin liên kết đặt lại tại `/forgot-password`; link trong mail (token 1 giờ, thu hồi mọi session khi đổi) đưa về `/reset-password` của đúng cổng đã xin; mail gửi nền qua `waitUntil` để response không phân biệt email có/không tài khoản, chỉ gửi khi role khớp cổng đích; token được che trong log HTTP server và xóa khỏi URL sau khi vào trang

### Changed
- Trang làm bài/soi bài: intro có các khối "Questions X–Y …" được tách và hiển thị instruction ngay trên đúng nhóm câu đó (kể cả đề cũ không khai dạng từng câu); intro không có marker giữ hiển thị như cũ (#301)

### Fixed
- Student đăng ký xong không nhận được mail kích hoạt tài khoản (#293): workflow deploy chỉ truyền 5 biến vào Alchemy nên worker luôn rơi về `MAILER_IMPL=log` (chỉ in mail ra console). Giờ `RESEND_API_KEY`, `MAILER_IMPL`, `MAIL_FROM` được truyền từ GitHub environment tương ứng

### CI/Infra
- `deploy.yml` và `deploy-staging.yml` truyền `RESEND_API_KEY` (secret), `MAILER_IMPL` và `MAIL_FROM` (variable) vào bước `alchemy deploy` (#293)

### Docs
- Runbook: cách đặt biến mail trên GitHub environment `production`/`staging` và cảnh báo `MAIL_FROM` thiếu `>` (#293)
- Plan quên mật khẩu qua email (#292)

## 2026-09-30

### Added
- Redesign trang làm bài quiz học viên theo cấu trúc đề thi thật (#286): đề reading chia 2 pane cạnh nhau ở viewport ≥ lg (bài đọc trái, bài làm phải, mỗi pane cuộn độc lập; màn hẹp xếp chồng 1 cột như cũ) áp cho cả take lẫn review screen; mỗi cụm câu hỏi có header `Questions X–Y` + nhãn dạng bài + instruction chuẩn IELTS đặt ngay phía trên cụm thay vì gom 1 khối ở đầu trang
- `type` per-question (optional, fallback `prompt.type`) trong contract authoring + payload student (#286): giáo viên trộn nhiều dạng câu trong 1 prompt qua select dạng bài từng hàng trong answer-key grid (widget/answer key thích ứng theo type câu); câu T/F/NG nhét trong prompt cloze giờ có pill lựa chọn (hết lỗi không có chỗ nhập đáp án)
- `QUIZ_TYPE_DISPLAY` + `quizTypeDisplay()` trong `packages/api/contracts` (#286): map type → label + instruction EN chuẩn IELTS dùng chung authoring/take/review, type lạ fallback không crash
- Option bank hiển thị khi type đề HOẶC bất kỳ câu bankable qua helper dùng chung `optionBankKindFor()` (#286) — cụm bankable trong prompt không-bankable không còn "choose from the option bank" mà thiếu bank

### Added
- Rich text cho luồng tạo bài tập: 7 field soạn nội dung (5 Textarea `PromptComposer`: prompt writing/passage/transcript/prompt speaking/note + intro `QuestionKeyEditor` + description `TestHeaderForm`) chuyển sang Tiptap v3 — toolbar In đậm/In nghiêng/Gạch chân/Danh sách/Liên kết, placeholder tiếng Việt, autosave draft giữ nguyên; `cuePoints` giữ plain text (semantics mỗi dòng 1 ý) (#280)
- `richTextField` trong `packages/api/src/rich-text.ts`: cap nội dung đo trên plain text đã strip thẻ + collapse whitespace, raw cap ×2.5 bảo vệ vận chuyển — contract zod `.strict()` và cột SQLite giữ nguyên shape string
- `RichTextBody` — render sink duy nhất đi qua DOMPurify (allowlist thẻ/attr chặt, hook ép `a` mở tab mới `rel="noopener noreferrer"`); hàng plain cũ tự phát hiện và render y hệt trước kia (pre-line/pre-wrap), không data migration
- Adapter `normalizeLegacyRichText` tại 3 cửa nạp editor (restore draft `/assignments/new`, slot draft test-builder, bank-edit `composerFromPrompt`) — escape + `\n`→`<br>`, chống mất xuống dòng vĩnh viễn khi sửa draft/hàng cũ
- E2E `rich-text-content.spec.ts`: bold persist qua save/reload, payload XSS (`<img onerror>`) lưu được nhưng vô hiệu khi render, multi-line giữ xuống dòng qua editor round-trip
- Luồng học viên làm bài + xem lại bài làm trên student portal (#283): route `/learn/quizzes/:assignmentId` (paper 1 cột + navigator footer + autosave debounce 600ms drain-before-submit + mirror localStorage resume), trang kết quả `/learn/quizzes/attempt/:attemptId` (Điểm + đúng/sai/bỏ qua) và trang soi chi tiết `.../detail` (verdict chip + Đáp án + Giải thích từ snapshot)
- Bảng `quiz_attempt` (migration 0030): snapshot đề lúc start (đề đổi sau khi giao không ảnh hưởng bài đang làm/chấm), answers JSON map autosave atomic `json_set`, unique `(assignmentId, studentId)` — 1 lượt/lượt giao; `class_assignment_target.submittedAt` được stamp khi nộp (đóng non-goal #208)
- 6 endpoint `/api/student/*` quiz/attempt trong `studentRoutes()` (requireStudent + CSRF Origin/Content-Type guard + body cap); grading pure fn server-side (normalize + alts " / "); payload take không chứa answer key — leak-check 3 lớp trong e2e `student-quiz-take-review.spec.ts`
- Renderer paper dùng chung dời về `@teacher-os/ui` (`ClozeStemText` respec interactive — width theo value học viên, không theo answer key; `PinOverlay` + optional answers/onAnswer; `OptionBankList`; `lib/cloze`, `lib/rich-text-sanitize`) — web chuyển import sạch, không shim
- Tab "Làm thử & Soi bài" trên preview giáo viên `/assignments/preview` (#285): đề auto-graded reading/listening (bank `?id=` lẫn draft sessionStorage) có segmented control 2 tab — giáo viên làm bài tương tác (cloze/radio/pin như học viên), nộp → review chấm client-side bằng `gradeQuiz` (score card + verdict chip + Đáp án + thay thế + Giải thích từ note), "Làm lại" reset; không lưu, không API, take render từ questions đã strip key (mirror leak contract server), state lift ở route nên đổi tab không mất bài làm, đổi đề tự reset qua `simKey`
- "Xem trước" đề đã lưu theo góc nhìn học viên (#282): nút "Xem trước" cho đề đang chọn ở `/assignments` điều hướng đến trang preview riêng `/assignments/preview?id=` hiển thị đúng như học viên nhìn thấy; e2e mở rộng `assignment-bank.spec.ts`

### Changed
- Quiz logic + renderer extract dùng chung: `gradeQuiz`/`quiz-parts` dời về `packages/api/src/lib/`, 6 quiz render component (quiz-paper/question-item/review-item/navigator/score-card/compact-list) dời về `@teacher-os/ui/components/quiz/` — pure move, cutover server/student sạch không shim (#285); `AttemptScoreCard` bỏ router Link student, nhận `action?: ReactNode` (route student tự compose Link giữ nguyên UX); `QuizNavigator.verdicts` unify number-key
- 11 gate "có nội dung" (`.trim()`) đổi sang `isEmptyRichText` — `<p></p>` bị coi là rỗng ở nút lưu, autosave skip, gate `ready` server 400 trên POST create; 3 superRefine gate (writing prompt, reading passage, speaking part1) tương tự
- Trần draft store 200KB → 512KB (HTML inflation ×2.5) + `console.warn` khi skip thay vì im lặng
- Word count passage/prompt đếm trên plain text trích từ HTML (`htmlToPlainText` chèn `\n` ranh giới block)
- Preview giáo viên/học viên + tab Lớp học render rich qua `RichTextBody`; chip "Chèn câu lệnh chuẩn" nhận diện hint đã có qua plain text (không confirm oan lần 2)

### Fixed
- Kernel snapshot `parseQuestions` + bridge `composerFromPrompt` giờ forward `type` per-question (#286): trước đó edit/Apply đề trộn dạng qua test-builder xoá âm thầm toàn bộ type đã soạn (data loss)
- PATCH `/api/assignments/prompts/:id` mirror validation của create cho per-question type: type câu phải thuộc catalog part, answer-choice kiểm theo type hiệu dụng của câu (#286)
- E2E full-test builder: đợi URL edit thật sau "Tạo bộ đề" — regex cũ `/tests/[^/]+` khớp cả `/tests/new` khiến "Xem trước" đua với navigate của submit đang treo (#280)

## 2026-09-28

### Added
- IELTS Full Test Builder: soạn bộ đề trọn vẹn (`/assignments/tests/new`) ghép nhiều part thành một đề — header (title/time limit/preset 4 kỹ năng/collection/group), outline số câu chạy liên tục, mỗi slot gán 1 part từ ngân hàng hoặc soạn mới ngay trong builder (composer khóa skill/part), autosave bản nháp riêng; entity `assignment_test` + `assignment_test_part` (unique theo slot, `qStartOverride` nullable) trong snapshot kernel
- Đánh số câu liên tục 1–40 qua `computeTestRanges` (`apps/web/src/lib/test-ranges.ts`) — nguồn số duy nhất cho outline/preview/soát đáp án; contract test source-parse cấm `qStartOf` (số tĩnh 1/14/27 của catalog part) trong code test-builder
- Full-test preview (`/assignments/tests/preview`): render trọn bộ đề đúng format đề thi (READING PASSAGE 1–3, Questions 1–40, time limit) bàn giao qua sessionStorage — không hiển thị đáp án
- Answers Checking trong builder: View All Answers (grid số câu tuyệt đối), paste key 40 dòng (`1. TRUE` / `1. Car / Cars`), Compare diff match/mismatch, Apply ghi đè answer/alts thẳng vào prompt gốc từng part (idempotent — chỉ câu thực sự khác)
- Extensibility 3 kỹ năng còn lại chỉ là config: slot layout render từ `ASSIGNMENT_TEST_PRESETS` trong `packages/api/src/contracts.ts` (Listening 4 section, Writing 2 task, Speaking 3 part) — unit test 4 preset khóa hành vi này
- E2E full-flow `assignment-test-create.spec.ts`: tự seed 2 part reading, soạn part thứ 3 inline, soát đáp án 2 mismatch → sửa → Apply, preview 1–40 không lộ key, reload giữ nguyên bộ đề + key đã ghi

### Changed
- Card lịch dạy trên `/dashboard` (section "Lịch hôm nay" & "Lịch sắp tới") hiển thị gọn: chỉ còn tên lớp + dòng meta `time · dur' · type · topic`; bỏ avatar chữ-cái-đầu của lớp và toàn bộ danh sách học viên trong card — mọi buổi học có trong data đều hiển thị card kể cả khi thiếu student record (#278)
- Nút "Điểm danh" nhanh không còn trên dashboard; check-in vẫn đầy đủ ở class detail (tab "Buổi học") và modal `/schedule` (#278)
- Time limit của bộ đề để trống được (null = không giới hạn, hợp cho Speaking/Writing) — khớp contract `timeLimitSeconds` nullable; dạng gõ sai vẫn chặn kèm thông báo hướng dẫn

### Removed
- Drift-guard `kernel-runtime.contract.test.ts` bỏ positive pin yêu cầu dashboard phải có flow check-in (`useDirectKernelAction`/`void run`/`disabled={busy…}`), thay bằng negative pin theo hướng UI mới (#278)

### CI/Infra
- Script dev của web/landing/student đổi tên thành `dev:bare`; root `dev:web`/`dev:landing`/`dev:student` chuyển sang chạy qua `pnpm --filter <app>`, `dev:server` giữ turbo filter

## 2026-09-25

### Added
- Cloze click-to-blank cho 8 dạng completion (sent, note, summary, flowchart, form, notes, sent4, flow): dán đoạn văn → bấm vào từ để tạo chỗ trống đánh số, đáp án tự sinh từ từ được chọn, popover sửa đáp án/nhận thêm (`alt1 / alt2`); chế độ "Cú pháp thô" cho power user theo cú pháp H5P `*đáp án/alt*` với escape `\*` (#271)
- Soạn đề Table completion bằng lưới r×c trực tiếp: thêm/xóa hàng/cột, bấm nút gạch dưới để biến ô thành chỗ trống (nội dung ô thành đáp án); preview học viên render từng câu thành hàng có nhãn "Hàng h — Cột c" (#271)
- Preview học viên (cả draft lẫn trang ngân hàng) render stem chứa marker `____` thành text trước + ô điền (rộng theo độ dài đáp án) + text sau, các câu completion ghép liên tiếp tái hiện đoạn văn; đề cũ không marker vẫn hiển thị nguyên văn (#271)
- Pure helpers cloze (`parseClozeRaw`, `segmentsToItems`, `splitStemByMarker`, `countBlanks`, grid math) + test unit 56 case: token hóa 20.000 ký tự < 50ms, cap render 5000 từ kèm gợi ý rút ngắn (#271)

### Changed
- Marker `____` (≥4 gạch dưới) trong stem là quy ước nội bộ: đúng 1 marker hợp lệ, 0 marker hợp lệ (đề cũ + stem tablecomp được miễn marker), ≥2 marker báo lỗi tại hàng và chặn lưu; cap stem 500 / answer 200 / alts 500 / 40 câu mirror vào canSave — chặn trước khi gặp 400 "invalid body" không kèm thông tin (#271)
- "Áp vào câu hỏi" của cloze/tablecomp kiểm tra cap TRƯỚC khi ghi items (segment > 500 ký tự / tổng blanks > 40 → chặn kèm thông báo tại chỗ) và luôn hỏi xác nhận khi sẽ ghi đè câu hỏi đã soạn (#271)

### Added
- Ngân hàng lựa chọn có cấu trúc (option bank) cho 5 dạng matching + listening map (headings, info, sentend, features, match2, map): panel soạn từng dòng tự gán nhãn A–H / i–viii, nút "điền đủ N mục", cap 8 mục (#271)
- Khóa đáp án dạng matching bằng chip chọn từ chính ngân hàng (chỉ nhãn có trong bank); riêng sentend chặn chọn trùng — mỗi nhãn dùng đúng một câu (#271)
- Xóa một dòng bank sẽ reset đáp án đã khóa từ vị trí đó trở xuống (nhãn là vị trí — tránh re-bind âm thầm chấm sai) (#271)
- Preview học viên (draft lẫn ngân hàng đề) render bank thành danh sách đánh nhãn; đề cũ không bank hiển thị fallback intro kèm cảnh báo "Thiếu ngân hàng lựa chọn" thay vì im lặng (#271)
- Validation đồng bộ 3 tầng (contract / composer / preview): bank 2–8 mục phủ đủ số câu, tối đa 8 câu cho dạng bankable, đáp án phải nằm trong bank, sentend đôi một khác nhau; cột DB `assignment_prompt.option_bank` (migration 0028 — deploy `db:migrate:deploy` TRƯỚC worker) (#271)

### Removed
- Xoá trang `/assignments/bank` (Ngân hàng bài tập): route, nút "Ngân hàng đề", breadcrumb "Ngân hàng" và mọi liên kết điều hướng tới nó (#267)
- Bỏ bảng tracking bài tập per-học viên cũ trên `/assignments` (dữ liệu mock `data.assignments` + `averageBand`); theo dõi tiến độ làm bài vẫn ở tab Bài tập của trang Lớp học, luồng chấm bài vẫn vào được từ trang chi tiết học viên (#267)

### Changed
- Trang `/assignments` giờ hiển thị duy nhất **danh sách bài tập đã tạo** (assignment prompts): filter kỹ năng/phần thi, search, preview aside và StatusTag Nháp/Sẵn sàng/Đã dùng N lớp — kế thừa toàn bộ UX của trang bank cũ (#267)
- Link sau khi tạo đề đổi thành "Xem danh sách bài tập" trỏ về `/assignments`; empty state mới hướng dẫn tạo bài tập đầu tiên (#267)

### Added
- Lưới khóa đáp án (answer-key grid) cho các dạng reading/listening đóng (tfng/ynng/mcq/roman/letter): mỗi câu một hàng với số câu thật theo phần thi, chip chọn đáp án, phím tắt (t/f/n/g, y/n, 1–8/a–h, Enter thêm câu, Backspace xóa hàng rỗng) — không còn gõ đáp án tay (#271)
- Dán key hàng loạt map theo số câu (`1. TRUE`, `3. câu trả lời / alt1 / alt2`), báo lỗi theo từng dòng khi số ngoài phạm vi/trùng/không đọc được, phần hợp lệ vẫn áp dụng (#271)
- Autosave bản nháp soạn đề vào localStorage (debounce 1s, TTL 7 ngày): banner "Đã phục hồi bản nháp" sau refresh; bản nháp preview (sessionStorage) luôn thắng banner; sửa bug `savePreviewDraft` bỏ sót transcript (#271)
- Chip "Chèn câu lệnh chuẩn" chèn giới hạn từ IELTS chuẩn theo dạng đề vào intro một chạm (#271)
- Ghim nhãn trên ảnh (image pins) cho diagram (Reading) và map (Listening): bấm lên ảnh đặt ghim đánh số theo câu (toạ độ %, không lệch khi đổi kích thước màn hình), bấm ghim để chọn câu, nút đặt lại ghim từng hàng; ảnh chết (URL hỏng) vẫn nhập key text kèm cảnh báo (#271)
- Chế độ raw `*đáp án/alt*` trong cloze editor cho power user (tương thích cú pháp H5P), parse trực tiếp ra chỗ trống (#271)

### Changed
- Lưu sẵn sàng giao của diagram (Reading) / map (Listening) giờ bắt buộc: đủ link ảnh https, mỗi câu có ghim trên ảnh và đáp án (skill-qualified — writing Task 1 "Bản đồ" không bị đòi ảnh/pin); câu hỏi thiếu ghim báo lỗi tại hàng khi lưu (#271)
- Preview học viên vẽ ghim đánh số tại đúng vị trí % trên ảnh kèm ô điền; đề cũ không ghim vẫn xem như cũ (#271)
- Object câu hỏi trong contract giờ `.strict()`: trường lạ trong `questions` bị từ chối 400 rõ ràng thay vì bị strip im lặng (#271)

### Changed
- Đổi kỹ năng/phần thi/dạng đề khi đang có nội dung soạn giờ hỏi xác nhận trước (kể cả nhánh đổi kỹ năng xóa sạch); trong cùng skill Listening, transcript được giữ lại khi đổi phần/dạng; intro/imageUrl vẫn reset như cũ (#271)
- Lỗi validation từng câu (thiếu nội dung/đáp án khi lưu "Sẵn sàng giao", vượt cap 500/200/500 ký tự, lựa chọn mcq quá dài) hiển thị tại đúng hàng câu thay vì popup toàn trang; bản nháp không bị báo đỏ hàng loạt (#271)
- Nút "Thêm câu" vô hiệu hóa khi đủ 40 câu (khớp giới hạn contract) kèm thông báo (#271)

## 2026-09-24

### Added
- Tự động provision học viên tại bridge middleware portal (`requireStudent` trong `apps/server/src/routes/student.ts`): lần đầu đăng nhập student portal với email đã xác thực (`emailVerified === true`) và chưa có hồ sơ học viên, hệ thống tự động sinh student row vào organization sớm nhất (#257)
- Expression unique index `student_email_uq` trên `lower(trim(email))` (migration 0023, dedupe non-destructive dữ liệu cũ) ngăn chặn trùng lặp email học viên kể cả khác biệt chữ hoa/thường hoặc khoảng trắng (#257)
- Helper direct DB seed `seedStudent()` phục vụ các bài kiểm thử E2E và server tests (#257)

### Removed
- Xoá hoàn toàn đường tạo học viên thủ công ở admin/teacher: xoá route `POST /api/students`, xoá Zod contract `studentCreateSchema` và type `StudentCreate` (#257)
- Gỡ bỏ command `add-student` và reducer case `add-student` trên web app (#257)
- Gỡ bỏ nút "+ Thêm học viên" trên trang danh sách học viên `/students` và form tạo học viên mới; chuyển đổi `AddStudentModal` thành `EnrollStudentModal` chỉ phục vụ xếp học viên có sẵn vào lớp (#257)

### Changed
- Modal thêm học viên ở lớp chỉ còn một chế độ duy nhất là chọn học viên có sẵn trong trung tâm để thêm vào lớp (#257)
- Empty state trang danh sách học viên hướng dẫn học viên tự xuất hiện khi đăng ký và đăng nhập student portal lần đầu (#257)

## 2026-09-23

### Added
- Vòng đời trạng thái enrollment (`invited` -> `active`) qua cột `enrollment.status` (migration 0022, default `active` backfill dữ liệu cũ) (#253)
- Endpoint `POST /api/enrollments/:enrollmentId/accept` kích hoạt enrollment chuyển sang `active` và sinh gói học cùng chuỗi buổi học CAS idempotent (#253)
- Endpoint `DELETE /api/enrollments/:enrollmentId` cho phép hủy lời mời chưa kích hoạt (chỉ áp dụng khi status là `invited`) (#253)
- Roster lớp: badge trạng thái "Đã mời" (warning) / "Đang học" (success) và 2 nút thao tác "Kích hoạt" và "Hủy lời mời" kèm modal xác nhận cho học viên invited (#253)
- Roster lớp & danh sách lớp: KPI sĩ số chỉ đếm học viên `active`, hiển thị phụ `· N chờ xác nhận` khi có học viên invited (#253)
- Trang học viên (danh sách và chi tiết): hiển thị badge "Đã mời" bên cạnh lớp học có enrollment invited (#253)

### Changed
- Thêm học viên vào lớp (cả qua tạo học viên mới kèm lớp và enroll học viên có sẵn) chỉ tạo enrollment ở trạng thái "Đã mời" (`invited`), chưa sinh gói học và buổi học (#253)
- Modal Thêm học viên có sẵn loại trừ cả học viên đang học và học viên đã được mời (#253)
- Modal Tạo hóa đơn và endpoint `POST /api/invoices` chặn lập hóa đơn cho enrollment `invited` (trả về 409) (#253)
- Gán bài tập trên lớp (`POST /classes/:id/assignments`) chặn gán bài tập cho học viên `invited` (trả về 400) (#253)
- Cảnh báo vận hành: Enrollment mới mặc định ở trạng thái Đã mời — chưa có buổi học/học phí cho đến khi được kích hoạt (nút Kích hoạt trên roster hoặc student portal sau này) (#253)

## 2026-09-22

### Added
- Cột `student.email` và chuẩn hóa SĐT chỉ nhận chữ số qua migration 0021 (#240)
- Trường Email bắt buộc và SĐT bắt buộc (strip ký tự lạ ngay khi gõ) trong form tạo học viên (#240)
- Trạng thái "Chưa có gói" ở danh sách học viên, chi tiết học viên, và trang học phí khi tạo học viên ngoài lớp (#240)
- Hiển thị Email học viên trong khối thông tin liên hệ ở trang chi tiết học viên (#240)

- Landing page tĩnh `apps/landing` (zero-framework theo thiết kế Open Design) deploy ở apex `teacheros.io.vn` (+www) qua `Cloudflare.Website.StaticSite`; apex không còn 301 về `app.<domain>`, web app giữ nguyên ở `app.<domain>` (#239)
- Modal tạo lớp: mỗi template giáo trình hiện `Tên · N kỹ năng`, và syllabus đang chọn hiện Tag kỹ năng ngay dưới dropdown (#229)
- Component `CurrencyInput` và util `format-currency.ts` hỗ trợ tự động nhóm hàng nghìn bằng dấu phẩy (`1,000,000`) ngay khi gõ cho mọi ô nhập tiền/phí (#230)
- Modal tạo lớp: chọn template giáo trình tự động bật các chip kỹ năng của lớp theo kỹ năng syllabus (#232)
- Modal tạo lớp: chọn template giáo trình tự động điền "Tổng số buổi" theo tổng số buổi của syllabus, tính cả buổi thi giữa kỳ/cuối kỳ (#235)
- Modal tạo lớp: hai mục Kỹ năng và Tổng số buổi hiển thị view-only khi giá trị đã lấy theo syllabus template (#236)

### Changed

- E2E chọn template giáo trình theo id trên URL `/syllabus/:id` vì label option đã đổi (#229)
- 4 modal (Sửa học phí lớp, Tạo lớp, Tạo hóa đơn, Thêm học viên) và trang Cài đặt chuyển sang dùng `CurrencyInput` và parse số nguyên VND an toàn qua `parseVndAmount` (#230)

- Form tạo học viên bỏ 3 input gói ("Số buổi gói", "Đơn giá", "Hình thức"); gói học khi tạo trong lớp tự động derive từ lớp (#240)
- Gói học khi tạo ngoài lớp không tạo bản ghi `session_package` và không bị đếm nhầm vào KPI gói sắp hết (#240)
- Tab "Hồ sơ" trong trang chi tiết học viên hiển thị card "Lớp học" liệt kê các lớp học viên tham gia thay vì card "Gói học" (#245)

### CI/Infra

- Tắt auto-deploy staging khi merge vào `develop`; deploy staging chuyển sang thủ công qua `workflow_dispatch` theo release runbook

## 2026-09-21

### Added

- Tạo bài tập IELTS 4 kỹ năng với prompt + answer key chấm tự động (#218)
- Trang tạo bài tập một cột + `/assignments/preview` xem trước dưới vai trò học viên, bàn giao draft qua sessionStorage (#213)
- Cột **Học phí** trên danh sách lớp + helper nợ học phí theo học viên và eid mapping (#216)
- Modal **Quản lý buổi** scope theo lớp trong thẻ Giáo trình; thẻ Giáo trình chỉ còn gán template + sắp xếp buổi (#221)
- Xóa syllabus template kèm confirm modal (#211)
- Tóm tắt lịch dạy tuần sắp tới trên dashboard (#212)
- Tạm ẩn cụm **Phụ huynh → Báo cáo** sau feature flag (#210)

### Fixed

- Syllabus: chỉ chặn keydown Enter/Space ở wrapper nút xóa template (#211)

### CI/Infra & khác

- CI/E2E chỉ chạy trên `main`, bỏ trigger `develop`
- Release version 0.0.5; pilot log, weekly self check-in và triage SLA kit (#68)
- Ổn định bộ E2E cho tuition-debt (#216), preview round-trip (#213), selectors khớp UI đã ship (#221/#218)

## 2026-09-19

### Added

- Trang **Ngân hàng đề bài** (assignment bank) + flow gán bài vào lớp (#208)

## 2026-09-18

### Added

- Trang soạn prompt `/assignments/new` (#202); kernel lưu bank prompt + endpoint `POST /prompts` (#202)
- Settings: lưu workspace config qua kernel (#179)
- E2E khóa end-to-end flow bank prompt (#202)

### Fixed

- Hàng loạt bản vá "UI trung thực" theo issue pilot (#110, #117, #118, #119, #120, #166, #168, #169, #170, #171, #172, #175, #176, #193, #194, #195, #197, #200, #203, #204): CSP cho dev localhost và Cloudflare Insights, `robots.txt` + redirect 301 apex/www, trạng thái Zalo OA trung thực, greeting theo giờ VN, deep-link tab settings qua `?tab=`, headcount đếm học viên thay vì row cũ, xếp thẻ lịch dưới header ngày, ngày động ở panel login, mã hóa đơn dễ đọc, style KPI nợ + filter chip tiếng Việt, badge gói + hover tên/email ở sidebar, empty state cho Assignments/notifications + fix popover bounds, a11y (aria, required, empty states), reset template selection khi tạo lớp, stack thẻ lịch (#200)

## 2026-09-17

### Added

- Badge version UI trên sidebar (#161)
- Lưới lịch tuần group theo buổi của lớp

### Fixed

- Bảo mật: redirect HTTP→HTTPS, HSTS và security headers (#108)
- 404 có UI branded và trả đúng HTTP 404 (#113)
- Lưu báo cáo tuần qua `POST /api/reports` + guard kết quả RETURNING trước body 201 (#173)
- Khôi phục submit auth sau khi validation fail (#165)
- KPI counters trên trang danh sách tính động từ dữ liệu (#106)
- Bỏ các field settings "giả edit" và nút xóa tài khoản chết (#167, #174)
- Bỏ mock data khỏi Reports và prefill báo cáo tuần (#107)
- Syllabus: giới hạn create payload, khóa số buổi import, giữ label đếm qua Field help (#145)

## 2026-09-16

### Added

- Buổi thi giữa kỳ/cuối kỳ: kind, highlight, import cột **Loại** (#154)
- Syllabus import v3 4 cột + preview dùng chung (phase 3), import ghi đè ở màn hình syllabus detail (phase 4), gỡ status buổi học khỏi màn hình syllabus (phase 2), status optional + endpoint replace-content (phase 1) (#152)

### Fixed

- Tint buổi thi bị biome gộp mất space — `cn()` + e2e computed-style guard (#154)

## 2026-09-15

### Added

- Parser import v2 5 cột, auto tên `Buổi {n}`, báo lỗi template cũ (phase 1/2) (#150)
- Preview bảng chi tiết trong modal import, nút gỡ file, khóa giữ-state (phase 2/2) (#150)

### Fixed

- Review fixes: luật 15 mirror API contract, cap render lỗi, khóa coverage spec goals (#150)

## 2026-09-14

### Added

- Import Excel/CSV trong AddSyllabusModal — tạo atomic modules + lessons (#144)

### Fixed

- E2E: scope click Writing vào dialog + exact "Buổi 3" (#144)

## 2026-08-31

### Added

- Nút Billing disable kèm badge coming-soon (#138)

### Fixed

- Enforce minimum gói học viên phía client và trong API contract (#115)
- Copy validation đăng nhập nói "required" (không còn copy sign-up), bỏ chặn client với mật khẩu ngắn (#114)

## 2026-08-30

### Added

- AddInvoiceModal gọi thật `POST /api/invoices` qua kernel bus (#61)
- Hiển thị hạn/ghi chú hóa đơn, KPI học phí tính từ dữ liệu thật (#135, #62)

## 2026-08-29

### Added

- Endpoint tạo hóa đơn với validation amount/due/enrollment (#60)

### Fixed

- Chặn lịch end-before-start và `sessionsTotal` = 0 khi tạo lớp (#105)
- Global search hiện feedback no-match thay vì im lặng (#109)
- Enroll học viên có sẵn từ class detail (#122)

## 2026-08-28

### Fixed

- Gỡ PWA service worker lỗi + biến auth failure thành lỗi lộ rõ (#125)
- Cookie namespace scope theo stage — cookie prod-zone không còn che session staging (#125)
- `/schedule` đúng tuần theo ngày + project buổi cho lớp 0 row, click lesson mang đúng ngày occurrence (#121)
- Persist gói học viên khi tạo không qua lớp (#104)
- Cap projection totals theo schema max; sửa import Playwright bị biome sắp lại làm gãy quality gate

## 2026-08-27

### Added

- Trang profile: upload avatar, đổi tên, liên kết Google (#94)
- Sidebar desktop thu gọn thành icon-rail 64px; logo sidebar link về `/` (#97, #100)
- Syllabus: xóa + sắp xếp lại modules/lessons (#101)
- Kiến trúc occurrence (phase 1-4): skeleton lesson-date + schema, API mutation theo identity + K3 policy, read-path v2 nhóm theo ngày, modal thao tác theo từng buổi
- CI tự deploy stage/prod lên Cloudflare khi push `main`

### Fixed

- Review fixes: empty-bucket edit 404 + tiêu chí trung thực, full-table dump, semantics modal duration/committed
- E2E dedupe success copy (route sở hữu toast duy nhất); CI thêm `--yes` cho alchemy deploy

## 2026-08-26

### Added

- Gộp tab Lịch + Giáo trình thành tab **Buổi học** trong class detail (#89)
- Điểm danh check-in tại chỗ trên tab Buổi học (#91)
- Tab lịch lớp hiển thị ngày theo trình tự thời gian + chủ đề syllabus

### Fixed

- Render một cây giáo trình duy nhất trong class detail (#81)

## 2026-08-25

### Added

- Import syllabus template vào giáo trình của từng lớp (#79)
- Lưu class type + skills khi tạo lớp (#78)

### Fixed

- Kiểm tra empty-curriculum theo display convention (`""` không phải `null`) (#79)

## 2026-08-22

### Added

- Package `apps/e2e`: Playwright + login smoke (#59)
- Spec class-operations + E2E CI workflow + contract test (#59)
- Auth DI `createAuth(input)` — better-auth thật dưới Node (#59)

### Fixed

- Bỏ phát sinh d.ts ở server — chế độ eager bị OOM trên CI runner (#59)

## 2026-08-21

### Added

- Lưới lịch tuần thật, điều hướng tuần qua URL, sửa buổi học (#56)
- Sinh lessons từ lịch lớp + endpoint edit
- Dashboard: buổi hôm nay và học viên rủi ro từ kernel
- Date picker chỉ chọn tương lai trong modal tạo lớp

### Fixed

- Dọn "chrome giả" ở lịch: badge GCal, nav no-op, ngày hardcode
- Giữ `CORS_ORIGIN` fail-loud khi deploy, default dev qua `ALCHEMY_DEV`

## 2026-08-20

### Added

- TanStack Query client + single-flight reauth + provider wiring; DataProvider đọc kernel snapshot qua `useQuery`
- Command bus refresh kernel snapshot qua QueryClient; mutation outcomes trung thực + retry-safe; load snapshot đầu tiên fail-safe
- Endpoint `/readyz` kiểm tra D1 sẵn sàng theo schema
- Infra: encode topology domain app/api + release runbook
- Modal tạo lớp: class type + lịch học có cấu trúc
- Redesign trang đăng nhập/đăng ký theo design đã duyệt (#39)

### Fixed

- Route reconcile 401 về re-auth thay vì trang unreachable
- Không pause kernel query (offlineFirst); migration `comment_bank` an toàn với dữ liệu sẵn có; bound mảng skills + chặn start==end phía server

## 2026-08-19

### Added

- Peel reads sang kernel repo: học viên (wave 1), syllabus (wave 2), lớp (wave 3)
- Wave 4: persist lịch buổi + check-in/cancel qua command bus
- Học phí: persist hóa đơn vào D1
- Wave 6: persist chấm bài assignments; Wave 7: persist dữ liệu báo cáo

### Fixed

- Reset điểm GradeModal mỗi lần mở; sửa trích dẫn evidence migration

## 2026-08-18

### Added

- Wave 0: persist class-centric domain kernel vào D1 (#19)

## 2026-08-16

### Added

- Google OAuth sign-in
- GitHub Actions quality gate
- Suite Vitest cho mock data-store reducer

### Fixed

- `defaultClassId` cho modal assign-syllabus ở class detail
- Enroll học viên mới vào lớp đang xem
- Fix findings code-review trước khi ship beta; đầy sidebar grid track hết chồng 32px trên desktop

### Khác

- Remap local ports về 8000/8001; chốt plan chuyển đổi open-design v1

## 2026-08-15

### Added

- Kick-off dự án: chuyển design open-design v1 sang React theo 8 phase — design tokens vào Tailwind v4 theme, app shell (sidebar/topbar/notifications), mock data store + UI kit, các màn hình core (dashboard, học viên, lịch, học phí, bài tập), teaching module (lớp, giáo trình), reports/settings + PWA branding
- Tài liệu plan chuyển đổi open-design v1 + red-team review

### Khác

- Baseline biome formatting (tabs) trên scaffold; dọn UI scaffold Better-T
