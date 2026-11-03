---
title: "#540: Sửa bố cục chân side menu (nút đăng xuất rơi xuống hàng riêng)"
description: "Đặt nút trailing (Đăng xuất) cùng hàng với avatar/tên/email trong UserFooter của packages/ui, giữ rail thu gọn và drawer mobile không vỡ."
status: pending
priority: P2
effort: 1h
issue: 540
branch: fix/540-sidebar-footer-layout
tags: [frontend, ui, bug]
blockedBy: []
blocks: []
created: 2026-11-03
---

# Plan: #540 — Sửa bố cục chân side menu

## Outcome

Ở chân sidebar `apps/web`, nút "Đăng xuất" nằm **cùng hàng** với avatar + tên + email, sát mép phải, đúng design v2 (shadcn sidebar-07). Huy hiệu phiên bản vẫn nằm dưới hàng đó.

## Nguyên nhân (đã scout)

`packages/ui/src/components/app-shell/user-footer.tsx` render `{control}{user.trailing}` trong `<div ref={wrapRef} className="relative">` — block thường. `control` là `<a>/<button>` `flex w-full`, nên `trailing` (nút `size-8` do `apps/web/src/components/layout/app-shell.tsx` truyền) xuống dòng mới. Chỉ `apps/web` dùng `trailing`; student dùng `menu`.

## Hướng sửa

Biến wrapper thành flex row: `control` chiếm `flex-1 min-w-0` (để tên/email vẫn truncate), `trailing` là phần tử `shrink-0` cuối hàng. Menu popover (`absolute bottom-full`) giữ nguyên vì wrapper vẫn `relative`.

| Trạng thái | Hành vi |
|---|---|
| Desktop mở rộng / drawer mobile | Một hàng: `[avatar tên/email] [đăng xuất]` |
| Rail thu gọn (lg, 4rem) | Xếp dọc (`lg:flex-col`): avatar rồi nút đăng xuất, vì 64px không đủ chỗ cho hai phần tử cạnh nhau; nút vẫn dùng được |

## Non-goals

- Không đổi `ShellUser` API, nav, `TeamSwitcher`, `VersionBadge`, màu/token.
- Không đụng `apps/student` (không truyền `trailing`).

## Acceptance criteria

1. Ở 1440×900 và 375×812 (drawer): nút đăng xuất cùng hàng với avatar, tên dài truncate không đẩy nút ra ngoài.
2. Rail thu gọn: avatar và nút đăng xuất đều hiện, không tràn 64px.
3. Không có `trailing` (student): bố cục không đổi.
4. `aria-label="Đăng xuất"`, `sidebar-user-email`, `sidebar-avatar` còn nguyên; e2e liên quan xanh.
5. `pnpm exec biome check .`, `pnpm check-types`, `pnpm --filter web test`, `pnpm --filter @teacher-os/ui test` xanh.

## Phases

| # | Phase | Trạng thái |
|---|---|---|
| 1 | [Sửa UserFooter, test, verify UI](phase-01-user-footer-row-layout.md) | pending |

## Câu hỏi mở

- Rail thu gọn: xếp dọc avatar + nút đăng xuất (đề xuất) hay ẩn nút ở rail? Chọn xếp dọc để không mất chức năng; đổi nếu bạn muốn khác.
