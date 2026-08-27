---
phase: 2
title: "Collapsed rail UI"
status: completed       # pending | in-progress | completed
priority: P1
effort: "~2-3h"
dependencies: [1]
---

# Phase 2: Collapsed rail UI

## Overview

Render chế độ thu gọn: grid track động 248px↔64px, sidebar icon-rail (logo chỉ còn ô "T", nav item icon + sr-only label, section header → divider, footer xếp dọc), nút toggle trong Topbar.

## Requirements

- Functional: toggle desktop ≥921px đổi track; rail giữ đầy đủ điều hướng; trigger chỉ hiện desktop.
- Non-functional: **invariant — mọi class thay đổi theo `collapsed` BẮT BUỘC prefix `app:`** (kongming điều chỉnh 2); giữ nguyên `pt-8` trên aside; mobile drawer hành vi không đổi.

## Architecture

### Grid (app-shell.tsx dòng 68)

```tsx
<div
	className={
		"app grid min-h-svh grid-cols-1 transition-[grid-template-columns] duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)] " +
		(collapsed ? "app:grid-cols-[64px_1fr]" : "app:grid-cols-[248px_1fr]")
	}
>
```

Track 1 px→px cùng số track → Chromium/Firefox interpolate mượt; Safari cũ snap là fallback chấp nhận. **Exit-criteria đã quyết định trước:** nếu dashboard jank khi transition thủ công → bỏ `transition-[grid-template-columns] duration-[220ms] ease-...` khỏi className, giữ snap, không cứu bằng will-change/FLIP.

### Sidebar rail mode

Điều khiển thuần bằng CSS variant (kongming: state chỉ là dữ liệu, `app:`/`max-app:` quyết rendering — resize liền mạch không cần matchMedia):

- Aside (`sidebar.tsx` dòng 213): **giữ nguyên `px-4` trong chuỗi base** (nó phục vụ cả mobile drawer ≤920px — tuyệt đối không nâng lên nhánh desktop-only), khi collapsed chỉ **append thêm `app:px-2`** override phần ngang trên desktop. Công thức geometry ràng buộc: `rail_width − 2×aside_px ≥ 48px` (Avatar md = 40px, dư room cho focus ring). Giữ nguyên `pt-8 pb-5`, `app:sticky app:h-svh app:w-full`.
- Logo block: ô vuông "T" giữ nguyên; chữ "Teacher OS" bọc trong wrapper nhận class `${collapsed ? "app:hidden" : ""}` — quy tắc bắt buộc: **mọi chuỗi class nhánh collapsed đều bắt đầu bằng `app:`** nên về mặt CSS không thể nào ăn vào drawer mobile (<921px, nơi drawer render bản không-ẩn).
- Nav item Link: khi collapsed append `app:justify-center app:px-0` (KHÔNG viết plain `justify-center px-0`); label span bọc lại: `${collapsed ? "app:sr-only" : undefined}` (accessible name còn nguyên); giữ `title={item.label}` trên Link cho hover; icon class `[&>svg]:h-[18px] [&>svg]:w-[18px]` giữ nguyên.
- Section header label div: khi collapsed render `<hr className="border-line-soft border-t my-2 mx-auto w-6" />` thay thế (divider tĩnh, an toàn mọi viewport).
- Footer: khi collapsed xếp dọc avatar-link + logout button (`flex-col items-center gap-2` — layout container này là desktop-only branch, thuộc aside hiển thị dạng fixed-full-width trên mobile nên không leak); ẩn visual tên/email/badge PRO bằng `app:hidden`, email element giữ render (`app:sr-only`) để testid `sidebar-user-email` còn trong DOM ở cả hai trạng thái.

### Topbar trigger (topbar.tsx)

```tsx
<button
	type="button"
	onClick={onToggleCollapse}
	aria-label={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
	title="Thu gọn/mở rộng thanh điều hướng"
	className="grid h-9 w-9 place-items-center rounded-sm border border-line-soft border-solid bg-bg text-fg-2 transition-colors duration-[150ms] hover:border-line hover:bg-surface focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none max-app:hidden"
>
	{/* icon panel-left: rect bo + đường dọc ngăn trái */}
</button>
```

Đặt trước title trong header flex (cạnh hamburger mobile vị trí đối xứng). KHÔNG `aria-expanded` (sidebar không hiện/ẩn — kongming D9). Props Topbar thêm `collapsed: boolean; onToggleCollapse: () => void`.

## Related Code Files

- Modify: `apps/web/src/components/layout/app-shell.tsx`
- Modify: `apps/web/src/components/layout/sidebar.tsx`
- Modify: `apps/web/src/components/layout/topbar.tsx`

## Implementation Steps

1. Đổi grid track className theo `collapsed` + thêm transition utilities (D8).
2. Sửa Sidebar: nhận prop mới `collapsed` (tách biệt prop `open` cũ — không đụng semantics drawer); rail rendering như kiến trúc trên, NHỚ: mỗi class phụ thuộc collapsed đều viết dạng `app:`-prefixed trong template string (`${collapsed ? "app:hidden" : ""}`).
3. Sửa Topbar: nút toggle desktop + props.
4. Kiểm tra thủ công: toggle trên dashboard/students/schedule; resize 920↔921 với localStorage `collapsed=true`; kiểm tra drawer mobile vẫn 280px full-label; testid `sidebar-avatar`/`sidebar-user-email` còn trong DOM cả 2 trạng thái.

## Success Criteria

- [x] Desktop toggle: track 248↔64px, footer rail không tràn (avatar/logout nằm gọn), logo chỉ ô "T" với `pt-8` nguyên vẹn
- [x] Rail: active page nhận diện được (bg accent trên icon), mọi nav item click đúng route, accessible name đầy đủ
- [x] Mobile <921px: UI y hệt trước thay đổi bất kể `collapsed` localStorage (không class nào non-`app:` lọt)
- [x] Biome + typecheck + build xanh

## Risk Assessment

| Risk | Tín hiệu cảnh báo | Phản ứng định trước |
|------|-------------------|---------------------|
| Class non-`app:` lọt vào nhánh collapsed | Drawer mobile <280px hoặc mất label khi resize | Grep lại toàn bộ `${collapsed ?` trong sidebar.tsx/app-shell.tsx — mọi giá trị chuỗi phải bắt đầu `app:` |
| Transition jank dashboard | Rung khi toggle trang week-grid | Bỏ transition, giữ snap (D8 exit-criteria) |
| `prefers-reduced-motion` bị vi phạm bởi transition 220ms | User đặt reduced-motion vẫn thấy animate | Bọc transition utilities trong media query tôn trọng reduced-motion (Tailwind v4: `motion-reduce:transition-none`) — hoặc áp luôn D8 bỏ transition; một dòng, đừng mở rộng |
| Footer rail dọc tràn chiều cao màn thấp → scroll trong rail | Avatar/logout cần scroll mới thấy trên viewport ngắn (<640px chiều cao) | aside đã có `overflow-y-auto` nên không vỡ layout; chấp nhận scroll làm degenerate case, không tối ưu thêm |
| Specs cũ profile.spec.ts đỏ do name/email bị ẩn visual | Vitest/playwright fail Phase 3 | Chỉ hide visual (không remove DOM) cho các phần có testid; nếu spec assert visibility text thì cập nhật spec nằm ở Phase 3 đúng thẩm quyền |
