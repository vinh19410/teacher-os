---
phase: 1
title: "Nền tảng: token dark/light, font self-host, theme toggle"
status: pending
priority: P1
effort: "5h"
dependencies: []
---

# Phase 1: Nền tảng — token dark/light, font self-host, theme toggle

## Goal

Đổi giá trị token trong `globals.css` sang palette design mới (dark mặc định, `.light`
override), self-host Inter Tight + DM Mono, thêm theme toggle có lưu lựa chọn và không nháy.
Giữ nguyên **tên** token để toàn bộ UI hiện có đổi màu theo mà không sửa từng component.

## Files to Create / Modify

- Modify: `packages/ui/src/styles/globals.css` — giá trị token, `.light` block, font, radius,
  type scale, focus ring, utility `neu`/`neu-sm`/`neu-in`, `mark.anno`, `::selection`.
- Modify: `packages/ui/package.json` — thêm `@fontsource-variable/inter-tight`, `@fontsource/dm-mono`
  (qua `catalog:` nếu repo đặt version ở `pnpm-workspace.yaml`).
- Create: `packages/ui/src/lib/theme.ts` — `readTheme()`, `applyTheme(t)`, `THEME_STORAGE_KEY = "theme"`.
- Create: `packages/ui/src/hooks/use-theme.ts` — `useTheme()` → `{ theme, setTheme, toggle }`, đồng bộ
  giữa tab qua sự kiện `storage`.
- Create: `packages/ui/src/components/theme-toggle.tsx` — nút pill `neu-sm`, chấm tròn (cam khi dark,
  ink khi light), nhãn mono `TỐI` / `SÁNG`; `aria-label="Chuyển sang giao diện sáng|tối"`,
  `aria-pressed` không dùng (là nút hành động, nhãn đổi theo trạng thái).
- Create: `packages/ui/src/lib/theme.test.ts` (hoặc trong `apps/web/src/lib/` nếu `packages/ui`
  không có runner vitest — kiểm `packages/ui/package.json` trước; hiện chỉ có `check-types`).
- Create: `apps/web/public/theme-init.js`, `apps/student/public/theme-init.js` — IIFE ~5 dòng:
  đọc `localStorage.theme`; nếu `"light"` → `documentElement.classList.add("light")`, ngược lại
  `add("dark")`; bọc `try/catch` (Safari private mode).
- Modify: `apps/web/index.html`, `apps/student/index.html` — `<script src="/theme-init.js"></script>`
  **đồng bộ** trong `<head>` (không `defer`/`module`), thêm `<meta name="color-scheme" content="dark light">`.
- Modify: `packages/ui/src/components/sonner.tsx` — bỏ `next-themes`, dùng `useTheme()` nội bộ.
- Modify: `apps/web/src/routes/__root.tsx:43`, `apps/student/src/routes/__root.tsx:40` — bỏ
  `theme="light"` và `richColors` (rich colors = xanh/đỏ, trái quyết định đơn sắc).
- Kiểm: `apps/web/src/security-headers.ts` — `/theme-init.js` cùng origin nên `script-src 'self'`
  đã cho phép; **không** sửa CSP. Kiểm student worker có cache/serve `public/` (student chưa
  có thư mục `public/`; xác nhận Vite + worker serve file tĩnh như web).

## Token mapping

Giữ tên; đổi giá trị. Dark nằm ở `:root, .dark`; light ở `.light`.

| Token | Dark | Light | Ghi chú |
|---|---|---|---|
| `--bg` | `#0a0a0a` | `#ffffff` | design `base` |
| `--surface` | `#1a1a1a` | `#f2f2f2` | design `sunk` (input, segmented, chip nền) |
| `--surface-warm` | `#111111` | `#ffffff` | design `raise` (card `neu`) |
| `--fg` | `#f2f2f2` | `#0a0a0a` | design `ink` |
| `--fg-2` | `#e6e6e6` | `#262626` | |
| `--muted`, `--meta` | `#8c8c8c` | `#6b6b6b` | design `mute` (đo: 5.89 / 5.33) |
| `--border` | `#262626` | `#e4e4e4` | design `line` — viền card |
| `--border-soft` | `#161616` | `#f4f4f4` | design `faint` |
| `--line-strong` (mới) | chọn giá trị đạt ≥3:1 trên `--surface` | tương tự | ranh giới input/checkbox (WCAG 1.4.11); đo bằng script contrast trước khi chốt |
| `--chip` (mới) | `#2e2e2e` | `#e9e9e9` | badge "đã đóng", cột chart thường |
| `--accent` | `#ff5b1f` | `#c93d0b` | light lệch design `#e8490f` vì 3.90 < 4.5 |
| `--accent-on` | `#0a0a0a` | `#ffffff` | |
| `--accent-hover`/`-active` | `color-mix` từ `--accent` | tương tự | |
| `--success` | `= --fg-2` (design `ok`) | `= --fg-2` | đơn sắc |
| `--warn` | `= --meta` (design `warn` xám) | `= --meta` | đơn sắc |
| `--danger` | `= --accent` | `= --accent` | trạng thái quá hạn/lỗi → cam |
| `--destructive` (mới) | `#f87171` (7.16 trên nền) | `#dc2626` (4.83) | chỉ hành động phá hủy |
| `--*-soft` | giữ công thức `color-mix`, tự đổi theo base | | |
| `--focus-ring` | `0 0 0 2px var(--bg), 0 0 0 4px var(--accent)` | | ring cam có offset, thấy trên cả 2 nền |

**Đổi tên utility `accent-blue` → `hot`** (tên của design). Accent không còn xanh, giữ tên
`accent-blue` sẽ gây hiểu nhầm cho mọi phase sau. Codemod cơ học trên 68 file:
`grep -rlE "accent-blue" apps/web/src apps/student/src packages/ui/src apps/e2e/specs | xargs sed -i '' 's/accent-blue/hot/g'`,
đổi `--color-accent-blue` → `--color-hot` trong `@theme inline`. Đã kiểm: chưa có utility
`*-hot` nào trong repo nên không đụng độ. Các tên trung tính (`accent-soft`, `accent-on`,
`accent-hover`, `accent-active`) giữ nguyên. Commit riêng (`refactor(ui): rename accent-blue
utility to hot`) để diff đổi màu dễ review.

shadcn semantic block: `--destructive` (shadcn) trỏ `--destructive` mới thay vì `--danger`;
`--primary` vẫn `--accent`; `--popover`/`--card` = `--surface-warm`. Thêm `--color-chip`,
`--color-line-strong`, `--color-destructive` vào `@theme inline`.

Typography/scale:
- `--font-display`, `--font-body`: `"Inter Tight Variable", "Inter Tight", system-ui, sans-serif`;
  `--font-mono`: `"DM Mono", ui-monospace, monospace`.
- `--text-base` 17px → 15px (design `html { font-size: 15px }`); scale còn lại giữ để không đổi
  rem; kiểm lại `--text-sm` 14px / `--text-xs` 12px vẫn hợp lý.
- Radius: `--radius-sm` 4px, `--radius-md` 6px, `--radius-lg` 8px, `--radius-xl` 8px, pill giữ 980px;
  `--radius` (shadcn) 6px.
- `--tracking-display` −0.045em, `--leading-tight` 0.95 (dùng cho tiêu đề lớn).
- `color-scheme: dark` ở `:root`, `light` ở `.light`; `::selection` nền cam chữ `--accent-on`.

Utility mới trong `@layer utilities` (tên theo design để phase sau dùng thẳng):
`.neu` (nền `--surface-warm`, viền `--border`, radius 4px), `.neu-sm` (trong suốt, viền
`--border`, hover viền `--fg`), `.neu-in` (nền `--surface`, không viền), `mark.anno`
(nền cam 22%, gạch dưới cam 2px).

## Tasks & Steps

1. Chạy script contrast (node one-liner như trong plan.md) cho mọi cặp mới: fg/bg, meta/bg,
   meta/surface, accent/bg, accent-on/accent, destructive/bg, line-strong/surface — cả 2 theme.
   Ghi bảng kết quả vào phần "Kết quả đo" cuối phase này.
2. Cài font: `pnpm --filter @teacher-os/ui add @fontsource-variable/inter-tight @fontsource/dm-mono`;
   import trong `globals.css` (`@import "@fontsource-variable/inter-tight";`,
   `@import "@fontsource/dm-mono/400.css"; …/500.css`) **trước** `@import "tailwindcss"`. Kiểm
   Vite bundle file `.woff2` vào `dist/assets` (cùng origin → qua `font-src 'self'`).
3. Codemod `accent-blue` → `hot` (lệnh ở mục Token mapping), chạy `pnpm check-types` +
   `pnpm --filter web test`, commit riêng trước khi đổi giá trị màu.
4. Viết lại `:root` theo bảng; thêm `.light`; giữ comment giải thích quy ước tên token, cập
   nhật dòng "frozen verbatim from open-design/v1" thành nguồn mới (`teacheros-design@fcf60a5`).
5. Thêm utility `neu*`, `mark.anno`, `::selection`, `color-scheme`.
6. `theme.ts` + `use-theme.ts` + `theme-toggle.tsx`; `sonner.tsx` dùng hook mới. Gỡ
   `next-themes` khỏi `packages/ui/package.json` nếu không còn import nào.
7. `theme-init.js` cho 2 app + sửa 2 `index.html`; xác nhận build copy `public/` (web có sẵn,
   student tạo mới) và worker serve được `/theme-init.js` (curl khi `pnpm dev:student`).
8. Gắn tạm `ThemeToggle` vào chỗ dễ thấy để tự kiểm (phase 3/6 sẽ đặt vị trí cuối cùng) —
   hoặc kiểm bằng `localStorage.theme = "light"` + reload.
9. Mở nhanh `/dashboard`, `/assignments/new`, `/grading/$id` ở 1440 và 375 cả 2 theme để
   bắt vỡ layout do đổi `--text-base`/radius trước khi sang phase 2.

## Verification

- Unit test `theme`: mặc định không có storage → `dark`; `setTheme("light")` ghi storage +
  class `light` trên `<html>`, gỡ `dark`; storage hỏng/throw → vẫn `dark`.
- `pnpm check && pnpm check-types && pnpm --filter web test && pnpm --filter student test`.
- Thủ công: reload với DevTools CPU 6× throttle ở theme light → không thấy khung hình tối/sáng
  sai; console không có lỗi CSP; Network: font từ origin app.

## Rollback

Revert commit phase 1 (chỉ đụng globals.css, packages/ui, 2 index.html, 2 root, 2 file public).

## Kết quả đo

_(điền khi thực thi bước 1)_
