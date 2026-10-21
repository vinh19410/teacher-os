# Changelog

Nhật ký thay đổi của **teacher-os**, group theo **ngày** (mới nhất lên đầu) thay vì theo version.

Quy ước khi cập nhật:

- Mỗi ngày làm việc tạo một mục `## YYYY-MM-DD`, các thay đổi trong ngày chia theo nhóm: `### Added` (tính năng mới), `### Changed` (thay đổi/sửa hành vi hiện có), `### Fixed` (sửa lỗi), `### Removed`, `### CI/Infra`, `### Docs`.
- Ghi kèm số issue/PR ở cuối dòng nếu có, ví dụ `(#216)`.
- Merge commit, commit format/style thuần và commit docs(plan) nhỏ không cần liệt kê — chỉ ghi ý nghĩa thay đổi cho người dùng/dev.

---

## 2026-10-22

### Added
- Migration `0042_syllabus_class_pointer_reconcile`: UPDATE idempotent same-org chữa con trỏ lớp ↔ giáo trình lệch về đúng bản copy, không xoá dòng (#394)

### Changed
- Refactor tạo và gán syllabus (issue #394): tách bạch **Template** và **Giáo trình của lớp** ở API/service/web — template là `syllabus.class_id IS NULL`, giáo trình của lớp là bản copy có `class_id`; `syllabus.class_id` là nguồn sự thật duy nhất của quan hệ lớp ↔ giáo trình, `class.syllabus_id` chỉ còn là cột dẫn xuất ghi qua `apps/server/src/lib/syllabus-curriculum.ts`. Route mới theo ngữ cảnh `/api/syllabus-templates/...` và `/api/classes/:id/curriculum/...` (route `/api/syllabi/...` cũ giữ làm alias một release); nhập trùng trả **409** thay vì 500. Web dùng chung `TemplatePicker` có preview cho tạo lớp và gán sau, class detail đọc giáo trình qua hook `useClassCurriculum` (#394)

### Fixed
- Dashboard học viên (Tổng quan các lớp + khối "Buổi tới" ở chi tiết lớp): buổi hôm nay đã qua giờ kết thúc (ngày + giờ bắt đầu + thời lượng, giờ VN) không còn bị server trả làm "Buổi tới" — `loadNextSession` nhận `now`, bỏ qua buổi đã hết giờ và chọn buổi kế tiếp trong ngày (đồng bộ `isLessonEnded` client từ #393); nếu không còn buổi hợp lệ thì ẩn "Buổi tới". Phép tính end-time gom về helper chung `vietnamSessionEndMs` (`@teacher-os/api/vietnam-date`) dùng chung server + client, không đổi contract/API (#395)
- Harness `pnpm design:compare` chạy xanh lại từ đầu tới cuối (trước đó exit 1 ở bước seed với `no org yet, waiting for bootstrap`): seed đồng bộ trên sự kiện thật `GET /api/kernel` (observer + rescue goto khi client abort 15s) thay vì blind-poll DB ~21.75s; harness tự chọn **free port mỗi run** (API/WEB/STUDENT/DESIGN) — hết xung đột với worktree AI song song/dev stack từng khiến signup đi vào API của worktree khác; cleanup kill cả process group + SIGTERM/SIGHUP handler (hết orphan chiếm port), redact `token=` trong log dump, seed-fail in log stack (api/web/student); screen `t-attendance` bỏ click tab `Buổi học` đã bị #391 merge (chụp default Sessions & practice, không mutate check-in) (#397)

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
