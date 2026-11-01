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
- **Type:** **Geist Variable** + **Geist Mono Variable** self-host (`@fontsource-variable`,
  CSP `font-src 'self'`). `html { font-size: 14px }`; thang chữ = rem mặc định Tailwind
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
- **Chip lọc (`ChipFilter`) và chip chọn nhiều (`ChipMulti`):** `ChipMulti` chưa chọn dùng `rounded-md border border-input bg-background text-foreground dark:bg-input/30`,
  đã chọn dùng `border-primary bg-primary text-primary-foreground`; `ChipFilter` giữ badge đếm `font-mono text-[10px]` (`aria-hidden` để accessible name chỉ
  là label); chip 0 kết quả vẫn full contrast, vẫn bấm được; nhóm chip liên quan phải có
  `role="group"` + `aria-label`.
- **Bộ lọc hai cấp (skill → part):** khi "Tất cả", nhóm part theo skill với nhãn muted;
  khi chọn 1 skill chỉ hiện part của skill đó. Filter sống trong URL.
- **DataTable v2:** bọc trong `rounded-md border bg-card`; header `text-muted-foreground`
  font-medium; hàng `border-t border-border`; hàng clickable hover nền `bg-muted` (không đổi
  màu chữ).
- **Modal:** overlay `bg-black/50`, panel `rounded-lg border bg-card`, tiêu đề semibold,
  nút đóng ✕ muted hover `bg-accent`.
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
- **Chi tiết lớp học viên (`/classes/$classId`, #389):** khớp khung design v2 (`StudentClass.tsx`:
  banner việc cần làm, header + badge trạng thái + nút nhắn giáo viên, thẻ thông tin `<dl>` + footer,
  4 vòng ring `stroke-muted`/`stroke-primary`, segmented `Tabs`, timeline buổi học 32px, bảng bài tập,
  giáo trình icon tròn, avatar bạn cùng lớp `size-8 rounded-full`). **Lệch có chủ đích vì không bịa
  dữ liệu server chưa trả:** giữ đích Back link `/` ("Trang chủ"); bỏ dòng bài về nhà theo buổi,
  phòng học, học phí theo lớp, "Tham gia từ buổi", cột Skill của bài tập, nhóm module và nhãn
  Mid/Final test trong giáo trình, "Target band" của bạn cùng lớp (quyền riêng #378), nút "Join online
  class" (chưa có link lớp online); Ring "Band trung bình" hiện `"—"` khi endpoint lớp trả `scores: null`.

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
- **"Add session" = nút primary "Sắp xếp buổi"** mở modal Quản lý buổi: kernel không có action
  add-session theo ngày riêng; thêm buổi = thêm bài vào module giáo trình (#221).
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
