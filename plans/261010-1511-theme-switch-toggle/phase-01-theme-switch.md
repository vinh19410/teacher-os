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
- Hook: `packages/ui/src/hooks/use-theme.ts` trả `{ theme, setTheme, toggle }`, không đổi.
- Token: `--motion-fast` 150ms, `--ease-standard` (`packages/ui/src/styles/globals.css:84-86`);
  utility `neu-sm` (viền `var(--border)` — DESIGN.md gọi nhãn màu này là `--line` nhưng tên var
  thật trong CSS là `--border`, hover viền `--fg`).
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
  - Hai icon nền trong track **đặt absolute** (không in-flow — in-flow sẽ cụm về flex-start):
    `Sun` `absolute left-[8px] top-1/2 -translate-y-1/2`, `Moon` `absolute right-[8px] top-1/2
    -translate-y-1/2`, cả hai `size-3.5`, `aria-hidden`. Tâm icon (15px và 39px tính từ mép trong
    track) trùng đúng tâm quỹ đạo núm (sáng: 3+12=15px; tối: 3+24+12=39px) nên icon không lộ
    cạnh núm ở trạng thái nào.
  - Núm: `span` `aria-hidden`, `absolute left-[3px] inset-y-0 my-auto grid size-6 place-items-center
    rounded-full bg-fg text-bg` (`inset-y-0 my-auto` căn giữa dọc tường minh, không dùng
    translate-y để tránh đụng transform trượt),
    `transition-transform duration-[150ms] ease-[var(--ease-standard)] motion-reduce:transition-none`,
    `translate-x-6` khi tối (núm nằm phải), `translate-x-0` khi sáng. Bên trong núm render `Moon`
    khi tối, `Sun` khi sáng (`size-3.5`).
  - Kiểm tra hình học: track trong 54px (56 trừ viền 2px), núm 24px, lệch trái 3px, dịch 24px →
    khe phải 3px; tâm icon nền = tâm quỹ đạo núm (15px/39px). Chỉnh nếu đo thực tế lệch.
- [ ] **2. Docstring:** viết lại comment component: switch dark/light, `aria-checked` = đang tối,
  label cố định; bỏ câu "not aria-pressed — this is an action button".
- [ ] **3. Test** thêm vào `apps/web/src/lib/theme.test.tsx` — `describe("ThemeToggle")` mới với
  setup riêng (không kế thừa gì từ `describe("useTheme")`: `beforeEach` ở đó scoped trong describe
  và file test này không bật RTL auto-cleanup vì vitest config không có `globals: true`):
  - Import thêm `render`, `screen`, `fireEvent`, `cleanup` từ `@testing-library/react`.
  - `beforeEach` riêng làm CẢ HAI việc (copy block `theme.test.tsx:86-89`):
    `installStorage(memoryStorage())` và `document.documentElement.className = ""` (state theme
    đọc từ class trên `<html>`, không reset thì assert mặc định phụ thuộc thứ tự test).
  - `afterEach(cleanup)` để render lặp không tích DOM (`getByRole` nổ "multiple elements").
  - mặc định: `getByRole("switch", { name: "Giao diện tối" })` có `aria-checked="true"`, không có
    chữ "Tối"/"Sáng".
  - click → `aria-checked="false"`, `<html>` có class `light`,
    `storage.getItem(THEME_STORAGE_KEY) === "light"` (shim memory không hỗ trợ property access
    kiểu `localStorage.theme` — phải dùng `getItem`).
  - click lần nữa → `aria-checked="true"`, không còn class `light`.
  - Test `aria-checked` đổi theo click là proxy đủ cho AC "screen reader đọc được trạng thái".
- [ ] **4. DESIGN.md** mục Theme: thêm rằng toggle là switch `role="switch"` (núm mực mang icon
  mặt trời/mặt trăng, bật = tối), dùng chung `ThemeToggle` từ `@teacher-os/ui`.
- [ ] **5. Verify:**
  - `pnpm --filter web test`, `pnpm --filter student test`, `pnpm check`, `pnpm check-types`.
    Lưu ý `pnpm check` = `biome check --write` (fix-mode, tự sửa file): sau khi chạy,
    `git status` phải chỉ còn thay đổi của đúng 3 file trong bảng Files; auto-fix nào ngoài
    phạm vi thì revert.
  - Chạy dev stack, chụp topbar web và login student ở 1440×900, 768×1024, 375×812, cả hai theme;
    Tab tới switch, kiểm tra focus ring và Space/Enter đổi theme.
  - Full e2e trước merge: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e`.

## Validation

- Mọi lệnh ở bước 5 exit 0.
- Screenshot cho thấy núm đúng phía và đúng icon ở mỗi theme, topbar 375px không tràn.

## Rủi ro & rollback

- Rủi ro thấp (một component trình bày). Rollback: revert commit, call site không đổi.
