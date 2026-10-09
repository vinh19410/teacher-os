# DESIGN.md — Hệ thống thiết kế teacher-os

> Nguồn chân lý: `packages/ui/src/styles/globals.css` (tokens), `apps/web/src/components/ui/*` (components).
  Đọc file này trước khi làm UI; đổi token ở globals.css chứ không hard-code giá trị lệch scale.
  Nguồn tham chiếu thị giác: `vinh19410/teacheros-design@fcf60a5` (Figma Make export) — bản mẫu
  mock, không copy code.

## Bản chất thương hiệu (một dòng)

"Teacher-first workspace" — một ngày dạy học yên tĩnh trong một nơi: tối mặc định, mực và
giấy trên nền đen, **một accent cam duy nhất** cho hành động và trạng thái cần chú ý.

## Theme

- **Dark là mặc định** (`:root`); `.light` trên `<html>` là override. Toggle ở topbar teacher +
  student và trang login, lưu `localStorage.theme` (`"dark"` | `"light"`), đồng bộ giữa tab qua
  sự kiện `storage`.
- Chống nháy: script tĩnh `/theme-init.js` chạy đồng bộ trong `<head>` (CSP `script-src 'self'`
  — không inline script). `useTheme()` trong `@teacher-os/ui/hooks/use-theme` là nguồn duy nhất.
- Light accent là `#c93d0b`, **không phải** `#e8490f` của design: giá trị design đo 3.90 contrast
  trên trắng (trượt AA chữ thường), `#c93d0b` đạt 5.05. Lệch có chủ đích.

## Tokens (giữ TÊN, đổi GIÁ TRỊ — xem bảng đủ trong globals.css)

- **Màu (dark):** `--bg #0a0a0a`, `--surface #1a1a1a` (nền chìm: input, segmented, chip),
  `--surface-warm #111111` (nền nổi: card `neu`), `--fg #f2f2f2`, `--meta #8c8c8c`,
  `--line #262626` (viền card), `--line-strong #6b6b6b` (ranh giới input ≥3:1, WCAG 1.4.11),
  `--chip #2e2e2e` (badge xám, cột chart thường), `--accent #ff5b1f` (cam, light `#c93d0b`).
- **Trạng thái đơn sắc + cam:** `--success` = `--fg-2`, `--warn` = `--meta`, `--danger` = `--accent`
  (quá hạn/lỗi = cam đặc). **Đỏ `--destructive` chỉ cho hành động phá hủy** (xóa, hủy vĩnh viễn,
  hủy liên kết) — không bao giờ dùng đỏ cho trạng thái.
- **Type:** Inter Tight Variable (display + body), **DM Mono** cho kicker/nhãn/đếm/số liệu
  (`--font-mono`). `--text-base` 15px. Tiêu đề lớn: `font-display font-extrabold`,
  `leading-[0.95]`, `tracking-[-0.045em]`; kicker mono 11px uppercase `tracking-[0.2em] text-hot`.
- **Radius:** sm 4 / md 6 / lg 8 / xl 8; pill 980 chỉ cho chip/tag/toggle/avatar/progress track.
- **Focus ring:** `--focus-ring` = ring cam 2px offset nền (`0 0 0 2px var(--bg), 0 0 0 4px var(--accent)`)
  — thấy rõ cả 2 theme; input thêm `focus-visible:ring-2 ring-hot/40`.
- **Motion:** 150ms state change, ease `cubic-bezier(0.28,0,0.22,1)`; chỉ animate
  color/border/transform; không entrance choreography.

## Utilities nền (lớp `utilities` trong globals.css)

- `.neu` — card: nền `--surface-warm`, viền 1px `--line`, radius 4px.
- `.neu-sm` — control viền mảnh: trong suốt, viền `--line`, hover viền `--fg`.
- `.neu-in` — nền chìm không viền (segmented container, badge xám, dot chưa tới).
  Input KHÔNG dùng `.neu-in` trần: cần ranh giới ≥3:1 → `bg-surface` + `border-line-strong`.
- `mark.anno` — highlight bài viết chấm: nền cam 22% + gạch dưới cam 2px.
- `::selection` — nền cam, chữ `--accent-on`. `input[type=range]` — `accent-color: var(--accent)`.

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

## Voice

- Tiếng Việt, gọi thẳng danh từ nghiệp vụ IELTS (Kỹ năng, Phần thi, Band, Cue card).
- Nhãn nút = động từ + danh từ ("Tạo bài tập", "Xóa bộ lọc"). Số liệu = số thật, đếm được.
- Empty state nói thứ gì thuộc về đó + hành động đầu tiên.

## Don't

- Không thêm màu thứ hai cho trạng thái: đơn sắc + cam; đỏ chỉ `--destructive` cho hành động phá hủy.
- Không dùng accent làm nền chip selection (nền cam chỉ cho badge quá hạn/kind thi/CTA hover).
- Không hard-code hex — trừ nền trắng QR và SVG logo (whitelist phase-07 sweep).
- Không render bức tường chip phẳng trộn nhiều taxonomy — luôn nhóm có nhãn.
- Không điều hướng URL trên mỗi phím gõ (debounce ~300ms rồi mới đẩy query lên URL).
- Không badge đếm trong accessible name (vỡ voice control + e2e `name` exact).
- Không chữ nhỏ dùng màu dưới 4.5:1 — đo bằng script contrast trước khi chốt token mới.
