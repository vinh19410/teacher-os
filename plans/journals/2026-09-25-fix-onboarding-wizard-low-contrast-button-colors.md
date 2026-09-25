---
title: Fix onboarding wizard low-contrast button colors
date: 2026-09-25
summary: "bg-accent in this design system resolves to accent-soft (pale surface), so white button text was illegible. Swapped to bg-accent-blue/text-accent-on per canonical pattern; fixed progress bar, check circles, selected-card borders."
---

# Fix onboarding wizard low-contrast button colors

## Vấn đề
Screenshot onboarding wizard (Bước 1/4) cho thấy nút "Tiếp tục →" gần như không đọc được: chữ trắng trên nền xanh rất nhạt. Dấu check tròn và các card được chọn cũng mờ.

## Nguyên nhân gốc
Trong `packages/ui/src/styles/globals.css`, shadcn semantic remapping maps:
- `--color-accent` (utility `bg-accent`) → `var(--accent-soft)` = color-mix(#0071e3, transparent 86%) — SURFACE màu nhạt, phải đi với chữ tối (`text-fg`)
- Xanh bão hòa #0071e3 nằm ở `--color-accent-blue` (và `--color-primary`), chữ trắng là `--color-accent-on`

Code onboarding (commit 4cb5c54) dùng `bg-accent text-white` → chữ trắng trên surface nhạt → tỷ lệ tương phản ~1.2:1.

## Sửa
- `apps/student/src/components/onboarding/onboarding-wizard.tsx`:
  - Nút "Tiếp tục" + "Hoàn thành": `bg-accent text-white hover:bg-accent/90` → `bg-accent-blue text-accent-on hover:bg-accent-hover` (tương phản 4.7:1, đạt WCAG AA)
  - Progress bar active: `bg-accent` → `bg-accent-blue`
- `apps/student/src/components/onboarding/onboarding-steps.tsx`:
  - Check circle + checkbox: `border-accent bg-accent text-white` → `border-accent-blue bg-accent-blue text-accent-on`
  - Border card được chọn: `border-accent/40` → `border-accent-blue/40` (khớp pattern `student-error-view.tsx` dùng `border-accent-blue/30 bg-accent-soft`)

## Kiểm chứng
- `pnpm vitest run` (apps/student): 46/46 pass
- `tsc --noEmit`: sạch
- `biome check`: sạch

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
