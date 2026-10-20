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

## Tokens (design v2 — shadcn neutral oklch; alias tên v1 xóa ở phase 12)

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
  pill/chip/avatar. Lưu ý: `rounded-2xl+` vẫn là 980px pill cho markup legacy — dùng
  `rounded-full` trong code mới; dọn ở phase 12.
- **Focus ring:** `--focus-ring` = `0 0 0 2px var(--background), 0 0 0 4px var(--ring)`; input
  v2 dùng `focus-visible:ring-[3px] ring-ring/50`.
- **Motion:** 150ms state change, ease `cubic-bezier(0.28,0,0.22,1)`; chỉ animate
  color/border/transform; không entrance choreography.

## Utilities nền (alias v1 — giá trị v2; xóa ở phase 12)

- `.neu` — card v2: nền `--card`, viền `--border`, radius `--radius+4px`, shadow-sm.
- `.neu-sm` — control outline v2: trong suốt, viền `--input`, hover nền `--accent` xám.
- `.neu-in` — nền chìm v2: `--muted`. Input dùng `inputCls` v2 (border + ring focus).
- `mark.anno` — highlight bài viết chấm: nền `--chart-1` 18% + gạch sóng `--chart-1`.
- `::selection` — nền `--primary`, chữ `--primary-foreground`. `input[type=range]` — accent
  `--primary`.

## Quy tắc component

- **Selection = nền chìm + chữ cam:** tab/chip đang chọn `neu-in text-hot` (trong segmented:
  `neu-sm text-hot` trên container `neu-in`); nav item active có dấu ■ cam `aria-hidden` trước
  nhãn. Khác thiết kế cũ ("selection = đen đặc") — quy tắc cũ đã BỎ.
- **Nút chính = mực:** `Button primary` = `bg-fg text-bg`, hover chuyển `bg-hot text-accent-on`.
  `secondary` = `neu-sm`. `danger` = viền + chữ `--destructive` (đỏ, chỉ phá hủy).
- **PageHead:** `kicker` (mono cam, thông tin số lượng/ngữ cảnh ngắn) + tiêu đề extrabold lớn +
  `action` (nút chính, căn đáy phải). Câu giải thích dài mới dùng `lead`.
- **Card:** `Card` mặc định = `neu` (nền nổi + viền); `variant="white"` = nền trang + viền
  (phân tầng thấp hơn). `StatCard` có `sub?` và `hot?` (hot = nền ink, số cam — số cần chú ý).
- **Badge/Tag:** mono 10px uppercase tracking-widest. success = `bg-chip`, accent = viền ink,
  warn = **viền đứt** meta, danger = **cam đặc** `bg-hot`, muted = `neu-in`. Tag có `hot?`
  (thi cuối kỳ, đã mời).
- **Chip lọc (`ChipFilter`/`ChipMulti`):** `neu-sm rounded-md`, chọn = nền chìm + chữ cam;
  badge đếm `font-mono text-[10px]` (`aria-hidden` để accessible name chỉ là label); chip 0 kết quả
  vẫn full contrast, vẫn bấm được; nhóm chip liên quan phải có `role="group"` + `aria-label`.
- **Bộ lọc hai cấp (skill → part):** khi "Tất cả", nhóm part theo skill với nhãn mono uppercase;
  khi chọn 1 skill chỉ hiện part của skill đó. Filter sống trong URL.
- **DataTable:** bọc trong `neu rounded-md`; header mono 11px uppercase `tracking-[0.15em]
  text-meta`; hàng `border-t border-line`; hàng clickable hover **chữ cam** (không tô nền).
- **Modal:** overlay `bg-black/60 backdrop-blur-sm` (lệch có chủ đích so design `bg-hot/80` —
  quá gắt), panel `neu rounded-md`, tiêu đề extrabold, nút đóng ✕ mono hover cam.
- **Minh họa:** 3 SVG nét vẽ trong `@teacher-os/ui/components/illustrations` (TeacherDesk —
  login giáo viên, MorningSpot — dashboard, StudentSpot — student) stroke/fill qua token,
  `decorative` → `aria-hidden`.
- **QR:** luôn đặt trên nền trắng (máy quét cần tương phản) — điểm trắng duy nhất được phép.
- **Bài viết đọc hiểu:** passage weight thường `leading-[1.85]`, KHÔNG dùng weight 800 của
  `.font-serif` design (khó đọc đoạn dài) — lệch có chủ đích.
- **Quiz runtime "Đã lưu"/"Lỗi":** cùng màu cam như mọi trạng thái — phân biệt bằng chữ;
  đây là hệ quả có chủ đích của ngôn ngữ đơn sắc + cam (không có màu thứ hai cho trạng thái).
- **Soi bài (review quiz):** khối câu có viền trái 3px + nền soft theo verdict
  (`--verdict-*`); skipped = viền đứt `--meta`, không thêm màu; đáp án đã chọn KHÔNG dùng
  `text-hot` ở review — tô theo verdict, hàng đáp án đúng có viền xanh + nhãn "Đáp án đúng";
  chip verdict kèm icon ✓/✗ đặt cạnh số câu. Take mode không có class verdict nào.

## Voice

- Tiếng Việt, gọi thẳng danh từ nghiệp vụ IELTS (Kỹ năng, Phần thi, Band, Cue card).
- Nhãn nút = động từ + danh từ ("Tạo bài tập", "Xóa bộ lọc"). Số liệu = số thật, đếm được.
- Empty state nói thứ gì thuộc về đó + hành động đầu tiên.

## Don't

- Không thêm màu thứ hai cho trạng thái: đơn sắc + cam; đỏ chỉ `--destructive` cho hành động phá
  hủy — **trừ cặp verdict của màn soi bài** (`--verdict-correct`/`--verdict-wrong`, xem Tokens);
  đỏ verdict không thay cho `--destructive`.
- Không dùng accent làm nền chip selection (nền cam chỉ cho badge quá hạn/kind thi/CTA hover).
- Không hard-code hex — trừ nền trắng QR và SVG logo (whitelist phase-07 sweep).
- Không render bức tường chip phẳng trộn nhiều taxonomy — luôn nhóm có nhãn.
- Không điều hướng URL trên mỗi phím gõ (debounce ~300ms rồi mới đẩy query lên URL).
- Không badge đếm trong accessible name (vỡ voice control + e2e `name` exact).
- Không chữ nhỏ dùng màu dưới 4.5:1 — đo bằng script contrast trước khi chốt token mới.
