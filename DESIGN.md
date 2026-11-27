# DESIGN.md — Hệ thống thiết kế teacher-os

> Nguồn chân lý: `packages/ui/src/styles/globals.css` (tokens), `apps/web/src/components/ui/*` (components).
  Đọc file này trước khi làm UI; đổi token ở globals.css chứ không hard-code giá trị lệch scale.
  Nguồn tham chiếu thị giác: `vinh19410/teacheros-design-v2@7a53fc0` (Figma Make export, shadcn
  neutral oklch) — bản mẫu mock, không copy code/mock data.

## Bản chất thương hiệu (một dòng)

"Teacher-first workspace" — một ngày dạy học yên tĩnh trong một nơi: **sáng mặc định**, mực và
giấy trên nền trắng (shadcn neutral), hành động chính = mực đậm; màu chỉ dùng cho trạng thái
(emerald/amber/đỏ destructive) và biểu đồ.

## Theme (design v2)

- **Light là mặc định** (`:root`); `.dark` trên `<html>` là override. Toggle ở shell header,
  lưu `localStorage.theme` (`"light"` | `"dark"`), đồng bộ giữa tab qua sự kiện `storage`.
  Lần đầu mở (không có key) → light; người dùng v1 từng chọn được giữ nguyên lựa chọn.
- Toggle là **nút ghost icon** (`size-9 rounded-md`): đang tối hiện Sun (bấm → sáng), đang
  sáng hiện Moon. `ThemeToggle` dùng chung từ `@teacher-os/ui`, semantics giữ nguyên:
  `role="switch"` + `aria-checked` (đang tối) + `aria-label="Giao diện tối"` cố định.
- Chống nháy: script tĩnh `/theme-init.js` chạy đồng bộ trong `<head>` (CSP `script-src 'self'`
  — không inline script); chỉ thêm class khi storage ghi `"dark"`. `useTheme()` trong
  `@teacher-os/ui/hooks/use-theme` là nguồn duy nhất; light = không có class nào.

## Tokens (design v2 — shadcn neutral oklch)

- **Nền tảng (light):** `--background` trắng, `--foreground` mực `oklch(0.145 0 0)`,
  `--card` trắng + `rounded-xl border shadow-sm`, `--muted`/`--secondary`/`--accent`
  xám nhạt `0.97` (nền chìm: segmented, chip, hover), `--border` `0.922`, `--primary` = mực,
  `--primary-foreground` gần trắng. Dark: đảo theo bảng shadcn neutral (xem globals.css).
- **Chữ phụ:** `--muted-foreground` light `0.525` — **lệch có chủ đích** so với design `0.556`
  (đo 2.09:1 trên muted, trượt AA chữ thường); `0.525` đo 5.39:1 trên background,
  4.94:1 trên muted.
- **Ranh giới input:** `--input` light `0.556` / dark `0.708` — **lệch có chủ đích** so với
  design (`0.922` ≈ 1.6:1) để đạt ≥3:1 (WCAG 1.4.11, DoD #6); đo 4.73:1 / 7.63:1.
- **Trạng thái v2 (thay ngôn ngữ đơn sắc + cam của v1):** `--success` emerald (light
  `0.508 0.118 165.612` = 5.37:1, dark `0.765 0.177 163.223`), `--warn` amber (5.05:1),
  `--danger`/quá hạn = `--destructive` đỏ (4.76:1). Chấm màu (dot) kèm nhãn chữ muted.
- **Ngoại lệ chấm điểm (giữ nguyên từ v1):** `--verdict-correct` / `--verdict-wrong` **chỉ**
  cho màn soi bài/chấm quiz, luôn kèm icon ✓/✗. Contrast đo trên nền mới: correct 7.13
  (light) / 11.36 (dark), wrong 6.47 / 7.16 — ≥4.5:1.
- **Vai trò cam v1 đã bỏ:** `--accent` v2 là nền hover xám; `text-hot` → `--primary` (mực);
  `accent-on` → `--primary-foreground`; `accent-soft` → `--accent` (xám); hover cam cũ
  `accent-hover/active` → nền accent xám / primary 75%. Mọi chỗ ý là "cam" đã đổi sang
  `primary`/`chart-1` cùng commit phase 2 (revenue-chart legend, checkbox class tab).
- **Type:** **Be Vietnam Pro** (`@fontsource/be-vietnam-pro`, weights 400–800 normal & italic) +
  **Geist Mono Variable** self-host (`@fontsource-variable/geist-mono`, CSP `font-src 'self'`).
  Gốc `html` để mặc định (1rem = 16px, không ép 14px); thang chữ = rem mặc định Tailwind
  (không override px như v1). Tiêu đề trang: `text-2xl md:text-3xl font-semibold tracking-tight`;
  số liệu `tabular-nums`. Input `text-base md:text-sm` (16px mobile — tránh iOS zoom khi focus).
- **Radius:** `--radius: 0.625rem`; sm/md/lg/xl derive từ đó (xl = card); `rounded-full` cho
  pill/chip/avatar (`--radius-pill` chỉ còn cho vài chip/tag legacy).
- **Focus ring:** `--focus-ring` = `0 0 0 2px var(--background), 0 0 0 4px var(--ring)`; input
  v2 dùng `focus-visible:ring-[3px] ring-ring/50`.
- **Motion:** 150ms state change, ease `cubic-bezier(0.28,0,0.22,1)`; chỉ animate
  color/border/transform; không entrance choreography.

## Utilities nền

- Card = `rounded-xl border bg-card shadow-sm`; control outline = `rounded-md border border-input
  bg-transparent` (hover nền `--accent` xám); nền chìm = `rounded-md bg-muted`. Input dùng
  `inputCls` v2 (border + ring focus).
- `mark.anno` — highlight bài viết chấm: nền `--chart-1` 18% + gạch sóng `--chart-1`.
- `::selection` — nền `--primary`, chữ `--primary-foreground`. `input[type=range]` — accent
  `--primary`.

## Quy tắc component

- **Selection:** trong segmented (`Tabs`), item chọn `bg-background shadow-sm` trên container `bg-muted rounded-md`;
  chip lựa chọn độc lập (`ChipMulti`, band chip onboarding) khi chọn dùng nền đặc `border-primary bg-primary text-primary-foreground`;
  thẻ/hàng lựa chọn (`OptionButton`, `LearningGoalsStep`, `EnrollStudentModal` `role="option"`) khi chọn dùng `border-primary bg-muted text-foreground ring-1 ring-primary` kèm chỉ báo check (`<Check aria-hidden="true" />`);
  nav item active dùng nền `bg-sidebar-accent` của shell `sidebar-07`.
- **Nút chính = mực:** `Button primary` = `bg-primary text-primary-foreground` (mực), hover
    đậm nhạt theo token. `secondary` = `bg-secondary`/outline. `danger` = `bg-destructive`
    (đỏ, chỉ phá hủy).
- **PageHead v2:** tiêu đề `text-2xl md:text-3xl font-semibold tracking-tight`; dòng phụ
  `text-muted-foreground` (`kicker` map vào đây, không còn mono cam uppercase). `action` căn
  đáy phải; giải thích dài dùng `lead`.
- **Card:** `Card` mặc định = `rounded-xl border bg-card shadow-sm`. `StatCard` có `sub?`;
  số liệu `tabular-nums`.
- **Badge/TuitionBadge v2:** Badge theo variant shadcn (`default`/`secondary`/`outline`/
  `destructive`) với chấm màu `bg-current`; trạng thái học phí tô bằng `--success`/`--warn`/
  `--destructive` qua `tuitionDot`, chữ muted. Hết mono 10px uppercase.
- **Chip lọc (`ChipFilter`) và chip chọn nhiều (`ChipMulti`):** chưa chọn dùng `rounded-md border border-input bg-background text-foreground hover:bg-accent dark:bg-input/30 dark:hover:bg-input/50`,
  đã chọn dùng `border-primary bg-primary text-primary-foreground`; `ChipFilter` giữ badge đếm `tabular-nums` (`text-primary-foreground/80` khi chọn, `text-muted-foreground` khi chưa chọn, `aria-hidden` để accessible name chỉ
  là label); chip 0 kết quả vẫn full contrast, vẫn bấm được; nhóm chip liên quan phải có
  `role="group"` + `aria-label`.
- **Bộ lọc hai cấp (skill → part):** khi "Tất cả", nhóm part theo skill với nhãn muted;
  khi chọn 1 skill chỉ hiện part của skill đó. Filter sống trong URL.
- **DataTable v2:** bọc trong `rounded-md border bg-card`; header `text-muted-foreground`
  font-medium; hàng `border-t border-border`; hàng clickable hover nền `bg-muted` (không đổi
  màu chữ).
- **Modal:** overlay `bg-black/50`, panel `rounded-lg border bg-card`, tiêu đề semibold,
  nút đóng ✕ muted hover `bg-accent`.
- **Chọn ngày & giờ (`DatePickerInput` / `TimeInput24h`):** `@teacher-os/ui/components/date-picker-input` dùng `<input type="text" inputMode="numeric">` cố định `dd/mm/yyyy` và `HH:mm` 24h (không dùng `<input type="date"|"time">` gốc để tránh đảo `mm/dd` hoặc 12h AM/PM theo locale trình duyệt và nhảy con trỏ khi gõ), kèm popover lịch tháng `@base-ui/react/popover` (`T2..CN`, `z-[110]`, ngày tháng kế `text-muted-foreground` ≥ 4.5:1) và nhóm `<fieldset>` gợi ý mốc giờ.
- **Shell:** layout dùng chung `sidebar-07` (shadcn) — sidebar `--sidebar` dark inset, content
  tràn sáng; search toàn cục ⌘K (Command palette, `cmdk`) mở từ header.
- **Minh họa:** 3 SVG nét vẽ trong `@teacher-os/ui/components/illustrations` (TeacherDesk —
  login giáo viên, MorningSpot — dashboard, StudentSpot — student) stroke/fill qua token,
  `decorative` → `aria-hidden`.
- **QR:** luôn đặt trên nền trắng (máy quét cần tương phản) — điểm trắng duy nhất được phép.
- **Bài viết đọc hiểu:** passage weight thường `leading-[1.85]`, KHÔNG dùng weight 800 (khó
  đọc đoạn dài) — lệch có chủ đích.
- **Trạng thái:** chấm emerald (`--success`) / amber (`--warn`); quá hạn/lỗi = `--destructive`
  (đỏ) — phân biệt bằng chấm + chữ, không thêm màu thứ tư.
- **Soi bài (review quiz):** khối câu có viền trái 3px + nền soft theo verdict
  (`--verdict-*`); skipped = viền đứt `--border`, không thêm màu; đáp án đã chọn KHÔNG dùng
  `text-primary` ở review — tô theo verdict, hàng đáp án đúng có viền xanh + nhãn "Đáp án đúng";
  chip verdict kèm icon ✓/✗ đặt cạnh số câu. Take mode không có class verdict nào.
- **Chi tiết lớp học viên (`/classes/$classId`, #389, #998, #1010, #1013, #1023, #1026, #1027):** giữ nguyên khung shell phía trên `<Tabs>` theo design v2 (`StudentClass.tsx`:
  banner việc cần làm, header + badge trạng thái + nút nhắn giáo viên, thẻ thông tin `<dl>` gọn tối đa 4 mục (`Lịch`, `Hình thức`, `Giáo viên`, `Khai giảng`) không còn thanh footer tổng hợp,
  4 vòng ring `stroke-muted`/`stroke-primary`, segmented `Tabs` gồm 3 mục `Hành trình học` | `Bài tập` | `Tài liệu chung`, ẩn tab `Bạn cùng lớp`).
  Từ #1010, đồng bộ state tab/bộ lọc/tìm kiếm lên URL qua `validateSearch` (bỏ giá trị mặc định, `resetScroll: false`) và redesign 3 tab theo `open-design/student-classes.html` bằng token design v2 (Light + Dark):
  - **Hành trình học (`ClassLessonList`):** mở đầu bằng thẻ `JourneyNextStopHero` (đếm ngược tới giờ học, nút `Chuẩn bị bài`, `ZoomJoinButton` mở trước 30 phút luôn bấm được — ẩn khi lớp tạm dừng; thẻ hoàn thành khi qua hết buổi), thanh lọc `Tất cả | Đã đi qua | Phía trước` + nút `Vị trí hiện tại` (2 pha), và đường ray dọc 32px co/mở (solid tới pivot `Buổi tới` mở sẵn mặc định, dashed về sau; node `midterm`/`final`, tone `--warn` cho buổi vắng, nút `Xem recording` mở `RecordingPlayerModal` kèm hạn lưu 90 ngày `Lưu đến` / `Recording đã hết hạn (90 ngày)` cho bản ghi R2, giữ nguyên nhóm Module giáo trình #998 và sibling `session-link-<date>` tới `/classes/$classId/sessions/$date`; trong chi tiết mỗi buổi hiển thị bài tập về nhà gắn buổi kèm hạn nộp và link 1-click `<Link to="/learn/quizzes/$assignmentId">` để làm/xem trực tiếp).
  - **Bài tập (`ClassAssignmentsTab`, giữ nguyên `ClassAssignmentTable` cho `SessionDetailView`):** chỉ hiển thị danh sách bài thuộc **bộ đề tự học** (`classStudyPackId != null`, tách khỏi homework gắn buổi ở `Hành trình học` và bài giao tay tự do ở `/assignments`) kèm 3 biến thể empty state `Chưa có bộ đề tự học`; hiển thị toàn bộ mọi ngày kèm `Dự kiến:` và **không chặn làm trước** ngày mở (nhãn `Có thể làm trước`, `· Làm sớm` khi nộp trước ngày dự kiến, badge `Bộ đề đã huỷ` nếu bộ đề bị huỷ); dải 3 trạng thái `assignments-todo-strip` (`N bài cần làm` + `Làm bài này`, `Bạn đã xong bài hôm nay` + `Làm bài này`, `Bạn đã hoàn thành hết bài tập`), bộ lọc pill `aria-pressed` `Tất cả | Chưa làm | Đã nộp | Đã chấm` (sync `af`, badge đếm `aria-hidden="true"`), 4 nhóm (`Cần làm hôm nay & quá hạn`, `Lịch sắp tới · Có thể làm trước`, `Đã nộp`, `Đã chấm` mặc định gập) với link 1-click tới `/learn/quizzes/$assignmentId` và chi tiết mở rộng thật (bảng 4 tiêu chí IELTS khi `scores != null`, nhánh chốt trả bài khi `gradedAt != null && scores == null`, thông báo đã nộp/chờ chấm khi `submittedAt != null`). `TodoBanner` chỉ đếm bài homework giao tay và bài bộ đề đến hạn từ hôm nay trở về trước (`due <= todayISO`), giữ `RingStat` "Bài tập" tính trên tổng số bài của lớp.
  - **Tài liệu chung (`ClassMaterialsTab`):** ô tìm kiếm tiếng Việt không dấu (debounce 300ms lên URL `mq`, nút xóa chỉ hiện khi có query), bộ lọc loại `Tất cả | Tài liệu | Audio – Video | Liên kết`, nhóm theo `kind` thật, nút `Xem trước` PDF/ảnh on-demand (`StudentClassMaterialPreviewButton` tái dùng portal `StudentPreviewDialog`, bảo toàn self-heal 403 org và thu hồi blob khi đóng/logout), giữ nguyên inline `<audio>`/`<video>` và link tải nguyên bản.
  Mỗi buổi có ngày (trừ `holiday`) vẫn mở trang chi tiết `/classes/$classId/sessions/$date` (#998) gồm mục tiêu giáo trình, **Bài giảng** (hỗ trợ cắt trang PDF kèm badge `Trang X–Y` & xem trước), **Bài tập của buổi** và điều hướng `Buổi trước` / `Buổi tiếp theo`. **Lệch có chủ đích so với design v2 (và không bịa dữ liệu server chưa trả):**
  gỡ thanh footer tổng hợp ở đáy `ClassInfoCard` (thời lượng tháng, khung giờ lặp, dòng `"Buổi tới: ..."`, #1013) để tránh trùng với mục **Lịch** trong `<dl>` và khối **Buổi tiếp theo** ở tab **Hành trình học** (chấp nhận không lặp khung giờ/buổi tới trên lớp không lịch định kỳ hoặc các tab phụ); gỡ thêm 2 mục dư thừa **Khoá** (`cls.level`) và **Số buổi đã học** (`{held}/{totalSessions} buổi`) khỏi `ClassInfoCard` (#1023) vì vòng `RingStat` đầu tiên ("Buổi học" / "Buổi đã diễn ra") đã hiển thị tiến độ buổi ngay bên dưới (chấp nhận `cls.level` hiển thị trên `ClassCard` ở `/` và `/classes` thay vì lặp ở trang chi tiết lớp); gỡ toàn bộ thẻ `JourneySummitCard` (`"Đích đến của bạn"`, bộ đếm chặng đã vượt, thanh tiến độ hành trình, #1027) khỏi đầu tab **Hành trình học** vì tiến độ buổi đã có ở vòng `RingStat` (`Buổi học`) phía trên `<Tabs>` và các chặng nằm trong `"Lộ trình chinh phục"` (chấp nhận không hiển thị riêng tên giáo trình và ngày về đích dự kiến ở đầu tab); giữ đích Back link `/` ("Trang chủ") và `TodoBanner` phía trên; giữ quy tắc mở phòng Zoom trước 30 phút; không dựng đề bài mẫu `BRIEF`, file PDF đề bài giả, modal nộp bài giả, nhãn `Ghim`/`Mới`/`Đăng dd/mm`, số trang/thời lượng media giả, hay điểm band cột mốc giả; bỏ phòng học, học phí theo lớp, "Tham gia từ buổi", "Target band" bạn cùng lớp (quyền riêng #378); Ring "Band trung bình" hiện `"—"` khi endpoint lớp trả `scores: null`.

## Voice

- Tiếng Việt, gọi thẳng danh từ nghiệp vụ IELTS (Kỹ năng, Phần thi, Band, Cue card).
- Nhãn nút = động từ + danh từ ("Tạo bài tập", "Xóa bộ lọc"). Số liệu = số thật, đếm được.
- Empty state nói thứ gì thuộc về đó + hành động đầu tiên.

## Don't

- Không thêm màu thứ hai cho trạng thái: emerald/amber cho trạng thái thường, đỏ chỉ
  `--destructive` cho hành động phá hủy/quá hạn — **trừ cặp verdict của màn soi bài**
  (`--verdict-correct`/`--verdict-wrong`, xem Tokens); đỏ verdict không thay cho
  `--destructive`.
- Không dùng `--accent` (xám hover) hay `border-transparent` + `bg-muted`/`bg-secondary` đơn độc làm trạng thái chọn (trên nền sáng `oklch(0.97)` chỉ đạt ~1.06:1) — chip chọn độc lập dùng `border-primary bg-primary text-primary-foreground`, thẻ/hàng chọn dùng `bg-muted` kèm `border-primary ring-1 ring-primary` + icon check.
- Không hard-code hex — trừ nền trắng QR và SVG logo (whitelist phase-07 sweep).
- Không render bức tường chip phẳng trộn nhiều taxonomy — luôn nhóm có nhãn.
- Không điều hướng URL trên mỗi phím gõ (debounce ~300ms rồi mới đẩy query lên URL).
- Không badge đếm trong accessible name (vỡ voice control + e2e `name` exact).
- Không chữ nhỏ dùng màu dưới 4.5:1 — đo bằng script contrast trước khi chốt token mới.

## Lệch có chủ đích so với design v2 — trang chi tiết lớp teacher (#391)

Nguồn đối chiếu: `teacheros-design-v2@7a53fc0` `TeacherClass.tsx`. Các lệch dưới đây là quyết định
có chủ đích (dữ liệu thật > hình dáng design), không phải sót quét:

- **Thẻ stat 3 = "Bài trong syllabus"** thay vì "Attendance rate": tổng điểm danh hợp lệ cho cả lớp
  không tổng hợp được từ dữ liệu hiện có mà không bịa; không dựng số 89% kiểu design.
- **Thanh điểm danh 3 phân đoạn** "đã điểm danh / vắng / chưa" thay vì 3 màu present/late/absent của
  design: `OccurrenceStatus` có `absent` (row dated v2) nên vắng đếm là ĐÃ điểm danh (phân đoạn đỏ
  riêng), còn "late" không có dữ liệu nên không dựng (lệch có chủ đích duy nhất là bỏ late).
- **Header giữ kicker `loại · lịch · hình thức`, không có `lead`**: học phí chuyển hiển thị ở tab
  Học viên (design đặt học phí trong bảng Students; app cần thấy phí cả khi chưa có học viên).
- **Nút hành động chính trên header lớp (`Sắp xếp buổi` / `+ Thêm buổi học`)**: khi lớp đã gắn bản sao
  giáo trình (`sy` tồn tại) thì hiển thị **"Sắp xếp buổi"** mở modal Quản lý buổi (#221); khi lớp chưa gắn
  giáo trình và đang ở chế độ thủ công hoặc chưa phát sinh dòng `lesson` thật (`isManual || lessons.length === 0`)
  thì hiển thị **"+ Thêm buổi học"** mở modal thêm buổi thủ công (#649); khi lớp `auto` đã có dòng `lesson`
  thật nhưng không gắn giáo trình thì ẩn cả hai nút để tránh dẫn vào thao tác `409`, đồng thời gỡ bỏ nhánh
  empty state cũ của #521 trong `ClassSessionsManageModal` (#670).
- **Nhãn nút giữ tiếng Việt**: "Điều chỉnh" (Edit session), "Chấm bài" (Grade), "Điểm danh →" /
  "Sửa điểm danh →" (Take/Edit attendance →). Link attendance chỉ hiện trên card **đã qua ngày hoặc
  đã học** — design hiển thị trên mọi card, nhưng buổi tương lai mở modal chỉ được view rỗng nên
  không đặt affordance thừa; buổi tương lai thao tác qua "Điều chỉnh".
- **Bỏ cột "Attendance" bảng Học viên; "Current band" hiển thị "Band mục tiêu"**: chuyên cần không có
  data tin được (chốt red-team); `Student` chỉ có `targetBand` — dùng nhãn "Band mục tiêu" thay vì bịa
  band hiện tại. Bảng giữ 5 cột: Học viên / Đăng ký / Band mục tiêu / Học phí / Thao tác.
- **Không có thanh kỹ năng Flashcard/Quiz theo học viên** trong accordion bài đã giao: server chưa
  trả dữ liệu per-skill; mở ra chỉ hiển thị trạng thái nộp + chấm.
- **Không dựng filler roster** (học viên tên giả trong design) — app chỉ hiển thị học viên thật.
- **Giữ tab Từ vựng + Ghi chú** thêm ngoài 3 tab design: tính năng thật, không có chỗ khác trong
  design để đặt; tab Giáo trình thay "Syllabus".
- **Không tách `SyllabusTree` dùng chung** (design nhúng cây ở tab Syllabus): theo #221, cây giáo trình
  nằm trong modal Quản lý buổi, sửa nội dung không nằm ở trang lớp; tab Giáo trình chỉ còn card
  gán/gỡ template.
- **Card buổi học render đủ N buổi**, không cắt 6 như design: số buổi thật là dữ liệu chấm điểm
  danh, cắt làm sai đếm.
- **Nhãn tab đầu tiên Việt hóa thành "Buổi học & luyện tập" và ngày mở lớp định dạng `Từ dd/mm/yyyy` (#520)**: đồng nhất tiếng Việt cho dải 5 tab của trang chi tiết lớp (giữ nguyên `id: "sessions-practice"` trên URL) và format `cls.startDate` qua `fmtDue` trên thẻ stat học viên.

## Lệch có chủ đích so với design v2 — trang soạn đề admin (Quiz Builder) (#424)

Nguồn đối chiếu: bố cục soạn đề Selfomy (quiz builder hai cột). Các lệch dưới đây là quyết định
có chủ đích theo token hệ có sẵn, không phải sót quét:

- **Phân cấp part → nhóm → câu bằng thụt lề + kiểu badge** (`Nhóm câu 1`, `Câu 4`, viền thẻ
  lồng nhau) thay vì tông tím/xanh dương/xanh lá riêng của Selfomy: hệ thống chỉ có một primary;
  không đưa màu thương hiệu nước ngoài vào token.
- **Badge đếm trên tab là `aria-hidden`** — accessible name của tab chỉ là nhãn ("Câu hỏi"),
  không kèm số; giữ voice control và e2e `name` exact ổn định (khớp quy tắc Don't về badge đếm).
- **Chip trạng thái câu thu gọn dùng `--success`/`--warn`** ("Có đáp án" / "Thiếu đáp án",
  chấm màu `bg-success`/`bg-warn`) — tái dùng cặp trạng thái thường có sẵn, đỏ vẫn chỉ dành cho
  hành động phá hủy.

## Lệch có chủ đích so với design mẫu — trang ngân hàng bài tập (/teacher/assignments) (#1043)

Nguồn đối chiếu: [open-design/assignments.html](open-design/assignments.html). Các điểm dưới đây là quyết định có chủ đích theo dữ liệu thật và hợp đồng giao diện của hệ thống:

- **Khung ứng dụng & token ngữ nghĩa Light/Dark:** Giữ nguyên `AppShell` (`sidebar-07`, `max-w-7xl`), topbar, ⌘K và bảng màu neutral trong `packages/ui/src/styles/globals.css` (không chỉnh sidebar/topbar, không hard-code hex; quick-action trên hàng dùng `hover:bg-foreground/10` để nổi trên nền hàng đang chọn `bg-muted`).
- **Tỷ lệ cột & ngưỡng tách panel (`1360px`):** Inner container `1440px` của `AppShell` rộng `1110px`, nên panel xem trước giữ `w-[360px] 2xl:w-[392px]` và bảng `@container` dùng `minmax(0,1fr) 128px 48px 136px 80px` để tiêu đề không bị ép vỡ chữ. Ở `< 1360px`, panel mở thành slide-over drawer (`role="dialog"`, `aria-modal="true"`) có focus trap `Tab` và trả focus về hàng kích hoạt khi đóng hoặc xóa nháp.
- **Tách `Band` khỏi tờ đề học viên (`#847`):** `Band` hiển thị ở bảng ngân hàng, metadata mobile, bộ sắp xếp và `.preview-head` (chrome giáo viên), nhưng bị loại khỏi `PromptStudentPaper` (tab `Đề phía học viên`) cùng toàn bộ đáp án bí mật/transcript.
- **Bộ lọc & nhãn trạng thái theo dữ liệu thật (`#979`):** Đổi nhãn `"Đã dùng N lớp"` sang `"Đã giao N lớp"` đếm theo `classId` duy nhất (`status = 'draft'` luôn ưu tiên hiển thị `Bản nháp`); tab `Lịch sử giao` đọc từ `data.classAssignments` (tổng hợp `Đã nộp x/y`, trạng thái hạn theo giờ VN), không dựng dữ liệu chi tiết từng học viên hay thời lượng audio giả; dải kỹ năng dùng `<fieldset aria-label="Kỹ năng">` và badge đếm `aria-hidden="true"`.
- **Modal `<Modal>` thay `<dialog>` & xóa nháp nguyên tử (`#983`):** Modal `Giao đề cho lớp` dùng `@/components/ui/modal` (`z-100`) thay `<dialog>.showModal()` để calendar popover của `DatePickerInput` (`z-[110]`) không bị Top Layer che; `Xóa nháp` dùng hộp thoại xác nhận gọi `DELETE /api/assignments/prompts/:id` (chỉ xóa nháp chưa tham chiếu, không làm nút Hoàn tác giả phía client) và nút `Xem trước` giữ cho cả `ready` lẫn `draft`.
- **Phạm vi ngân hàng đề:** Mục `"Đề thi nhiều phần"` trong menu tạo dẫn sang `/assignments/tests/new`, không trộn danh sách `assignmentTests` vào bảng `/assignments`.
