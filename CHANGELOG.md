# Changelog

Nhật ký thay đổi của **teacher-os**, group theo **ngày** (mới nhất lên đầu) thay vì theo version.

Quy ước khi cập nhật:

- Mỗi ngày làm việc tạo một mục `## YYYY-MM-DD`, các thay đổi trong ngày chia theo nhóm: `### Added` (tính năng mới), `### Changed` (thay đổi/sửa hành vi hiện có), `### Fixed` (sửa lỗi), `### Removed`, `### CI/Infra`, `### Docs`.
- Ghi kèm số issue/PR ở cuối dòng nếu có, ví dụ `(#216)`.
- Merge commit, commit format/style thuần và commit docs(plan) nhỏ không cần liệt kê — chỉ ghi ý nghĩa thay đổi cho người dùng/dev.

---

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
