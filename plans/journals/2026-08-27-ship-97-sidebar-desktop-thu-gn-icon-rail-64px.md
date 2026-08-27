---
title: "Ship #97 — sidebar desktop thu gọn icon-rail 64px"
date: 2026-08-27
summary: "Collapsible sidebar 248↔64px: toggle Topbar, localStorage teacher-os.sidebar.collapsed try/catch, transition 220ms motion-reduce; invariant D10 mọi class collapsed prefix app: chống rò vào drawer <921px; kongming ×2 (GO D2 geometry + Conditional-GO F1–F4); phát hiện biome check --write trim edge-whitespace trong className literal → concat sinh dead tokens 'pb-5fixed'/'hiddenmx-auto', là latent bug khiến drawer mobile trên develop mất fixed/pb-5 → mọi conditional assembly qua cn(); review bắt footer stacking sai DOM level (D7 no-op, overflow rail) + hr leak; e2e hardened ±2px, footer geometry, hr hidden, role-based click; gates: vitest 315, biome clean, check-types, build, Playwright 12 pass/1 skip OAuth; quirk: stop alchemy worker chiếm port 8000/8001."
---

# Ship #97 — sidebar desktop thu gọn icon-rail 64px

Branch `feat/97-collapsible-sidebar-icon-rail`, beta → `develop`, issue [vinh19410/teacher-os#97](https://github.com/vinh19410/teacher-os/issues/97), plan `plans/260827-1350-collapsible-sidebar/plan.md`. Sidebar desktop giờ thu gọn 248px ↔ icon-rail 64px: toggle trong Topbar (`data-testid="sidebar-toggle"`, aria-label động "Thu gọn/Mở rộng thanh điều hướng"), state `useSidebarCollapsed` lazy-init từ localStorage key `teacher-os.sidebar.collapsed` bọc try/catch toàn bộ (private-mode safe), grid track animate `transition-[grid-template-columns] duration-[220ms]` kèm `motion-reduce:transition-none`. Thiết kế đi qua 2 checkpoint kongming: #1 GO với điều chỉnh geometry D2 (`rail 64 − 2×app:px-2 ≥ Avatar md 40px`) và invariant **D10 — mọi utility đổi theo collapsed BẮT BUỘC prefix `app:`**; #2 Conditional GO với 4 fix F1–F4 đã áp hết trước khi implement.

## What happened

Cái khó chịu nhất của task nằm ở tooling, không phải feature: `biome check --write` **trim edge whitespace bên trong JSX className string literal**. Concat kiểu `"pb-5" + (cond ? " fixed …" : "")` lặng lẽ thành `"pb-5fixed"` — không lỗi compile, không lỗi runtime, chỉ là token chết mà Tailwind bỏ qua im lặng. Tệ hơn: đây là **latent bug có sẵn trên develop** — `<aside>` của mobile drawer đã mất `fixed` và `pb-5` từ trước vì cùng kiểu concat (feature commit a3d8308 sửa kèm). Gần như "pb-5hiddenmx-auto" trên paper nhìn giống mã nguồn hợp lệ. Một formatter "hữu ích" vừa âm thầm phá classname của cả app suốt mấy tuần.

## Root cause + Decision

Đã loại concat chuỗi, chuẩn hoá: **mọi className điều kiện đi qua `cn()`** — separator space do lib đảm nhiệm, formatter không còn gì để cắn. Đây là rule cứng từ nay, không phải preference style.

Code review bắt thêm 2 lỗi design thật:
1. **Footer rail xếp chồng sai DOM level**: `app:flex-col/app:items-center/app:gap-2` đang nằm trên wrapper ngoài thay vì footer row thực sự chứa avatar link + logout button → D7 thành no-op, avatar/logout tràn ra khỏi track 64px (commit 725be26).
2. **hr divider leak**: divider section header chưa bảo đảm hidden dưới 921px → sửa thành base `hidden` + `app:block` khi collapsed, đúng chữ D10.

E2E hoá cứng lại đồng loạt: width assert đổi từ `toBeCloseTo` sang poll `Math.abs(width−expect) ≤ 2px` (+/-2px tolerance để sống chung với transition 220ms), thêm geometry assert footer (logout nằm trong track, stacked dưới avatar), assert `hr` hidden trong drawer, click nav chuyển sang role-based `getByRole("link", { name: "Học viên" })` dựa trên sr-only accessible name thay vì `getByText`.

## Verification

Gates tương đương CI: vitest **315 pass**, `biome check .` exit 0 (read-only — root `pnpm check` là `--write`, không bao giờ làm gate), `pnpm check-types`, build, Playwright **12 passed / 1 skipped** (OAuth env-gated). Quirk môi trường: một alchemy dev worker cũ vẫn giữ port **8000/8001** — phải kill trước khi e2e webServer lên nổi được; ai gặp "port in use" ở máy mình thì kiểm tra trước hết thay vì nghi spec.

## Lessons learned

1. **Formatter + className literal là bẫy silent-failure kinh điển**: lỗi không nổ ở đâu cả, UI chỉ "tự nhiên xấu đi". `cn()` là bắt buộc trong mọi JSX có class điều kiện.
2. **Latent CSS bug không tự thú** — nếu không tình cờ đụng vào khi implement #97, drawer mobile vẫn ngồi thiếu `fixed` trên develop. E2e assert geometry số học chứ đừng tin mắt.
3. **Invariant D10 trả tiền đúng lúc**: nhờ quy tắc "mọi class collapsed phải `app:`" viết rõ trong plan, review bắt được hr leak trong vài phút thay vì tranh luận cảm tính.
4. Kongming guard checkpoint giữ vai trò thật: D2 geometry nên avatar md 40px không bao giờ phải co giật tay trong rail.

## Next steps

- Mở PR vào `develop`, close #97 sau merge. Journal file này cố tình **không stage/không commit**.
- Follow-up đề xuất: sweep các chỗ còn concat className trên develop xem có latent dead-token nào khác không (owner: dev chọn nhận task #97+1).
- Ai tăng Playwright workers lên song song: xem ghi chú workers:1 trong journal #94 trước khi làm.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
