---
phase: 2
title: "Token neutral, Geist self-host, light mặc định"
status: completed
priority: P1
effort: "5h"
dependencies: [1]
---

# Phase 2: Token neutral, Geist self-host, light mặc định

## Goal

Đổi nền tảng thị giác sang design v2 (shadcn neutral oklch, Geist, radius 0.625rem, light
mặc định + `.dark`) sao cho toàn bộ app đổi theo mà chưa phải sửa từng màn.

## Files to Create / Modify

- Modify: `packages/ui/src/styles/globals.css` — `:root` = bảng light v2 (`--background`,
  `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`,
  `--destructive`, `--border`, `--input`, `--ring`, `--chart-1/2`, `--sidebar*`, `--radius:
  0.625rem`), `.dark` = bảng dark v2; `@theme inline` map `--color-*`, `--radius-sm..xl`,
  `--font-sans: 'Geist Variable'`, `--font-mono: 'Geist Mono Variable'`; `html { font-size: 14px }`.
  Alias token v1 (`--bg`, `--surface`, `--surface-warm`, `--fg`, `--meta`, `--line`,
  `--line-strong`, `--chip`, `--accent`/`hot`, `--success`, `--warn`, `--danger`) **trỏ sang
  token v2** (vd `--fg → --foreground`, `--meta → --muted-foreground`, `--line → --border`,
  `--hot → --primary`, `--danger → --destructive`) để markup cũ không vỡ; đánh dấu
  `/* v1 alias — xóa ở phase 12 */`. Utilities `.neu/.neu-sm/.neu-in` đổi thành card/outline/muted
  kiểu v2. Giữ `--verdict-*` (đo lại contrast trên nền mới), `mark.anno` theo v2
  (`--chart-1` 18% + gạch sóng).
- Modify: `packages/ui/package.json` — bỏ `@fontsource-variable/inter-tight`, `@fontsource/dm-mono`;
  thêm `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`.
- Modify: `apps/web/public/theme-init.js`, `apps/student/public/theme-init.js` — mặc định
  `light`; chỉ thêm `dark` khi `localStorage.theme === "dark"`; catch → light.
- Modify: `packages/ui/src/lib/theme.ts`, `packages/ui/src/hooks/use-theme.ts` — snapshot đọc
  class `dark` (không còn `.light`), server snapshot `light`.
- Modify: `packages/ui/src/components/theme-toggle.tsx` — nút ghost icon `size-9` Sun/Moon như
  v2, giữ `role="switch"`/`aria-checked` (đang tối) + `aria-label="Giao diện tối"` (e2e/a11y).
- Modify: `packages/ui/src/components/sonner.tsx` — theme theo `useTheme()` (đã có), kiểm lại.
- Modify: test liên quan theme (`packages/ui` + `apps/*` grep `"light"`/`theme-init`).

## Tasks & Steps

1. Port nguyên bảng oklch từ `.cache/design-v2/src/index.css` (light + dark).
2. Viết alias v1 → v2; grep các utility v1 (`text-hot`, `bg-surface`, `neu`, `font-display`,
   `font-extrabold`…) để ghi số chỗ vào ghi chú phase 12.
3. Đổi font + `font-size: 14px`; xác nhận CSP: không request ngoài origin.
4. Đảo mặc định theme ở 4 nơi (2 `theme-init.js`, `theme.ts`, `use-theme.ts`) + test.
5. Đo contrast (script contrast hiện có trong repo nếu có, không thì Playwright + công thức WCAG)
   cho: muted-foreground/background, muted-foreground/muted, destructive/background,
   verdict-correct/wrong trên card ở cả 2 theme; ghi số đo vào `DESIGN.md` nháp (phase 12 chốt).
6. Chụp nhanh `t-dashboard`, `t-test-builder`, `t-grading` (`--label new`) để bắt vỡ layout do
   font 14px/radius trước phase 3.

## Verification

- `pnpm --filter @teacher-os/ui check-types && pnpm check && pnpm check-types`
- `pnpm --filter web test && pnpm --filter student test`
- Mở web/student với localStorage trống → `<html>` không có class `dark`; toggle → có `dark`;
  reload giữ. Network tab: font từ `/assets/*.woff2`.
