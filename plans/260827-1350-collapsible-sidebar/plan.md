---
title: "collapsible-sidebar"
description: "Sidebar desktop thu gọn được thành icon-rail (64px) thay vì chỉ fixed 248px; persist qua localStorage; mobile drawer giữ nguyên hành vi."
status: completed
priority: P2
effort: "4-6h"
tags: [ui, layout, sidebar]
created: 2026-08-27
---

# collapsible-sidebar

## Overview

Sidebar desktop hiện là grid track cố định `248px` (`apps/web/src/components/layout/app-shell.tsx:68`) — người dùng muốn thu gọn được để nhường không gian cho nội dung. Plan này thêm **trạng thái collapsed (icon-rail ~64px) trên desktop (≥921px)**, kích hoạt bằng nút toggle trong Topbar, persist qua localStorage. Hành vi mobile drawer (<921px) **không đổi**: drawer luôn mở rộng 280px bất kể trạng thái collapsed.

Thiết kế đã được tư vấn (kongming, checkpoint #1): **GO** với 2 điều chỉnh bắt buộc — rail 64px kèm `app:px-2` khi collapsed (đủ chứa Avatar md 40px), và invariant mọi class theo trạng thái collapsed phải prefix `app:`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Sidebar desktop thu gọn còn icon-rail 64px và mở rộng lại 248px bằng một nút toggle | P1 |
| 2 | Trạng thái collapse persist qua reload (localStorage), private-mode safe | P1 |
| 3 | Accessibility đúng: accessible name của nav item giữ nguyên khi rail, active state nhận diện được | P1 |
| 4 | Mobile drawer (<921px) hành vi không đổi, không bị class collapsed rò rỉ vào | P1 |

## Design Decisions

| # | Quyết định | Lựa chọn | Lý do / Phương án bị loại |
|---|-----------|----------|---------------------------|
| D1 | Pattern collapse | Icon-rail 64px | Off-canvas desktop loại vì mất ngữ cảnh điều hướng + phải thêm overlay logic; width-0 + float handle loại vì vùng click nhỏ khó chú ý |
| D2 | Rail geometry | 64px track + aside `app:px-2` khi collapsed → content 48px ≥ Avatar md 40px (kongming điều chỉnh 1). Công thức ràng buộc: `rail_width − 2×aside_px ≥ 48px` | 72px + px-4 = content 40px sát quá, không dư room cho focus ring/border |
| D3 | State | `useSidebarCollapsed` hook ở AppShell: lazy-init từ localStorage key `teacher-os.sidebar.collapsed`, useEffect persist, try/catch toàn bộ (private-mode Safari throw). KHÔNG thêm zustand/jotai — codebase cố tình chỉ dùng useState; tiền lệ localStorage: `apps/web/src/routes/login.tsx:29,41` | State lib cho 1 boolean là overkill |
| D4 | Trigger | Một nút trong Topbar cạnh tiêu đề (`max-app:hidden`), icon panel-left, `aria-label` động. Mobile hamburger giữ nguyên | Vị trí chuẩn (VS Code/Linear/Notion); footer sidebar quá chật |
| D5 | Tooltip rail | Native `title` attribute (pattern sẵn có: logo, logout button). sr-only span giữ accessible name cho label nav khi collapsed | UI kit có sẵn `packages/ui/src/components/tooltip.tsx` nhưng title đơn giản hơn cho scope này; upgrade path sau này là thay 1-1 từng nav item, không đổi kiến trúc |
| D6 | Section labels khi rail | Chuyển thành `<hr>` divider | Text uppercase 10px không đọc nổi ở rail |
| D7 | Footer khi rail | Xếp dọc: Avatar (link `/profile`, giữ testid `sidebar-avatar`) rồi nút logout bên dưới | Ngang không đủ chỗ |
| D8 | Animation | `transition-[grid-template-columns] duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)]` trên grid container. Track 1 px→px cùng số track nên Chromium/Firefox interpolate mượt; Safari cũ snap — chấp nhận là fallback | Exit-criteria quyết định TRƯỚC: nếu dashboard jank khi transition (reflow 184px giữa chừng) → bỏ animation, giữ snap. Không cứu bằng will-change/FLIP |
| D9 | a11y semantics toggle | KHÔNG dùng `aria-expanded` (sidebar không hiện/ẩn, chỉ đổi kích thước); `aria-label` động ("Thu gọn thanh điều hướng" / "Mở rộng thanh điều hướng") là trung thực hơn | — |
| D10 | CSS invariant | **Mọi utility thay đổi theo collapsed BẮT BUỘC prefix `app:`** (kongming điều chỉnh 2). Plain `w-[64px]` không prefix sẽ thắng drawer mobile 280px | CSS specificity + thứ tự layer Tailwind v4 — đây là risk rò rỉ lớn nhất |
| D11 | Desktop/mobile tách bằng CSS variant, không JS branch | Rendering quyết bởi `app:`/`max-app:` variants; state `collapsed` chỉ là dữ liệu | Resize desktop↔mobile liền mạch, không cần matchMedia listener |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Phase 1: Collapse state + persistence](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Collapsed rail UI](./phase-02-collapsed-rail-ui.md) | Pending |
| 3 | [Phase 3: E2E coverage + gates](./phase-03-e2e-and-gates.md) | Pending |

Tổng effort dự kiến: ~4-6h.

## Related Code Files

- Create: `apps/web/src/lib/sidebar-prefs.ts` (pure read/write localStorage), `apps/web/src/lib/sidebar-prefs.test.ts`
- Modify: `apps/web/src/components/layout/app-shell.tsx` (hook + grid track động)
- Modify: `apps/web/src/components/layout/sidebar.tsx` (render rail mode)
- Modify: `apps/web/src/components/layout/topbar.tsx` (toggle button desktop)
- Create: `apps/e2e/specs/sidebar-collapse.spec.ts`
- Reference (không sửa): `packages/ui/src/styles/globals.css:219` (breakpoint `app:` = 921px), `apps/web/src/components/ui/avatar.tsx` (md = 40px; `<img>` chỉ render khi user có ảnh), `packages/ui/src/components/tooltip.tsx` (upgrade path)

## Out of Scope

- Keyboard shortcut Cmd+B (không được yêu cầu)
- Hover-expand rail
- Trang settings chọn chế độ sidebar
- shadcn/Radix Tooltip component (D5 — nâng cấp tương lai từng nav item)
- Đổi width rail khác 64px hay đổi default expanded

## Success Criteria

- [ ] Desktop ≥921px: click toggle → grid track 248px→64px, sidebar thành icon-rail không vỡ layout (avatar/logout không tràn); click lần nữa → trở lại 248px y như cũ
- [ ] Reload trang giữ nguyên trạng thái collapsed; localStorage lỗi (private mode) thì degrade về memory-only, app không crash
- [ ] Collapsed: mọi nav item vẫn reachable, accessible name đầy đủ (sr-only), icon current-page vẫn có bg accent; section header → divider; logo chỉ còn ô "T", giữ nguyên `pt-8`
- [ ] Mobile <921px với localStorage `collapsed=true`: drawer vẫn 280px full-label (e2e kiểm chứng), hamburger/scrim/Escape hành vi không đổi
- [ ] E2E cũ (`login.smoke.spec.ts`, `profile.spec.ts`) pass không sửa; toàn bộ gates xanh: biome check + typecheck + build + vitest + playwright

## Risks

| Risk | Khả năng | Ảnh hưởng | Giảm thiểu / Tín hiệu cảnh báo / Phản ứng định trước |
|------|----------|-----------|------------------------------------------------------|
| Class collapsed không prefix `app:` thắng drawer mobile do specificity | Trung | Drawer mobile vỡ (vi phạm goal 4) | Invariant D10 trong code review + e2e case P3-i Kiểm tín hiệu: e2e viewport <921 phát hiện drawer ≠280px → search tất cả class collapsed, bổ sung prefix |
| Transition grid gây jank reflow trên trang nặng (dashboard week-grid, co 184px giữa chừng) | Trung | Rung lắc khi toggle | D8 exit-criteria: thử thủ công dashboard → nếu jank, bỏ transition giữ snap (quyết định xong từ đầu, không tranh luận giữa chừng) |
| Safari cũ không animate grid-template-columns | Cao (trên Safari cũ) | Thẩm mỹ snap thay vì mượt | Chấp nhận là fallback hợp lệ (D8); target e2e là Chromium |
| Footer rail tràn nếu đổi Avatar size/ngữ cảnh sau này | Thấp | Vỡ UI rail | Ghi công thức D2 vào comment; e2e boundingBox assert optional |
| Persistence thay đổi phá e2e cũ (mặc định phải expanded) | Thấp | Specs cũ đỏ | Default `collapsed=false` là bất biến (kongming warning); mỗi Playwright context có localStorage sạch nên không nhiễm chéo |
| Transition vi phạm `prefers-reduced-motion` | Thấp | a11y (goal 3 tuyên bố P1) | Bọc transition bằng `motion-reduce:transition-none` hoặc áp D8 bỏ hẳn transition |

## Advisory Notes (kongming)

- Checkpoint #1 (sau solution design): GO — điều chỉnh rail geometry (D2) và CSS invariant (D10) đã lồng vào thiết kế; xác nhận route-change effect & Escape chỉ đụng `sidebarOpen` nên không giao thoa với `collapsed`.
- Checkpoint #2 (sau khi plan hoàn thành, trước publish GitHub): Conditional GO với 4 fix bắt buộc, **đã áp dụng toàn bộ**: (F1) mọi snippet phase-02 prefix `app:` đúng invariant D10; (F2) ghi tường minh giữ base `px-4` cho mobile drawer, chỉ append `app:px-2`; (F3) e2e case iv bỏ assertion `sidebar-avatar` vì `<img>` chỉ render khi user có ảnh (`apps/web/src/components/ui/avatar.tsx:52-64`); (F4) sửa đường dẫn avatar, gate tên đúng `pnpm check-types`, cảnh báo root `pnpm check` là auto-fix `--write`. Bổ sung risk `prefers-reduced-motion` và cơ chế seed localStorage e2e phải dùng `page.addInitScript`. Xem chi tiết counsel: [reports/advisory-kongming-checkpoint-2.md](./reports/advisory-kongming-checkpoint-2.md).

## Open Questions

None
