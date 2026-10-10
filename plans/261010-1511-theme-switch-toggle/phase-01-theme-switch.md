---
phase: 1
title: "Switch component + test + docs"
status: pending
priority: P3
effort: 1h
dependencies: []
---

# Phase 01 — Switch component + test + docs

## Context

- Component: `packages/ui/src/components/theme-toggle.tsx` (một file, 7 call site không cần sửa).
- Hook: `packages/ui/src/hooks/use-theme.ts` trả `{ theme, toggle }`, không đổi.
- Token: `--motion-fast` 150ms, `--ease-standard` (`packages/ui/src/styles/globals.css:84-86`);
  utility `neu-sm` (viền `--line`, hover viền `--fg`).
- Mẫu focus ring: `focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none`
  (`apps/web/src/components/layout/topbar.tsx`).
- Mẫu test hook theme + memory localStorage: `apps/web/src/lib/theme.test.tsx`.

## Files

| File | Thao tác |
|---|---|
| `packages/ui/src/components/theme-toggle.tsx` | Sửa |
| `apps/web/src/lib/theme.test.tsx` | Sửa (thêm `describe("ThemeToggle")`) |
| `DESIGN.md` | Sửa (mục Theme, một câu) |

## Steps

- [ ] **1. Markup switch** trong `theme-toggle.tsx`:
  - `<button type="button" role="switch" aria-checked={dark} aria-label="Giao diện tối" onClick={toggle}>`.
  - Track: `neu-sm relative inline-flex h-8 w-14 shrink-0 items-center rounded-full text-meta`
    + focus ring như mẫu + `className` truyền vào.
  - Hai icon nền trong track: `Sun` ở nửa trái, `Moon` ở nửa phải, `size-3.5`, `aria-hidden`.
  - Núm: `span` `aria-hidden`, `absolute left-[3px] grid size-6 place-items-center rounded-full bg-fg text-bg`,
    `transition-transform duration-[150ms] ease-[var(--ease-standard)] motion-reduce:transition-none`,
    `translate-x-6` khi tối (núm nằm phải), `translate-x-0` khi sáng. Bên trong núm render `Moon`
    khi tối, `Sun` khi sáng (`size-3.5`).
  - Kiểm tra hình học: track trong 54px (56 trừ viền 2px), núm 24px, lệch trái 3px, dịch 24px →
    khe phải 3px. Chỉnh nếu đo thực tế lệch.
- [ ] **2. Docstring:** viết lại comment component: switch dark/light, `aria-checked` = đang tối,
  label cố định; bỏ câu "not aria-pressed — this is an action button".
- [ ] **3. Test** thêm vào `apps/web/src/lib/theme.test.tsx` (dùng `render`, `screen`, `fireEvent`
  từ `@testing-library/react`, tái dùng `beforeEach` memory storage sẵn có):
  - mặc định: `getByRole("switch", { name: "Giao diện tối" })` có `aria-checked="true"`, không có
    chữ "Tối"/"Sáng".
  - click → `aria-checked="false"`, `<html>` có class `light`, `localStorage.theme === "light"`.
  - click lần nữa → `aria-checked="true"`, không còn class `light`.
- [ ] **4. DESIGN.md** mục Theme: thêm rằng toggle là switch `role="switch"` (núm mực mang icon
  mặt trời/mặt trăng, bật = tối), dùng chung `ThemeToggle` từ `@teacher-os/ui`.
- [ ] **5. Verify:**
  - `pnpm --filter web test`, `pnpm --filter student test`, `pnpm check`, `pnpm check-types`.
  - Chạy dev stack, chụp topbar web và login student ở 1440×900, 768×1024, 375×812, cả hai theme;
    Tab tới switch, kiểm tra focus ring và Space/Enter đổi theme.
  - Full e2e trước merge: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e`.

## Validation

- Mọi lệnh ở bước 5 exit 0.
- Screenshot cho thấy núm đúng phía và đúng icon ở mỗi theme, topbar 375px không tràn.

## Rủi ro & rollback

- Rủi ro thấp (một component trình bày). Rollback: revert commit, call site không đổi.
