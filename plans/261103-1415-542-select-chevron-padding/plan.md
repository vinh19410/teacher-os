---
title: "#542: Mũi tên dropdown dính sát mép phải"
description: "Chuẩn hoá chevron của Select ở primitive web-kit với padding phải nhất quán, chuyển các select thô và student về cùng một cách."
status: pending
priority: P2
effort: 1.5h
issue: 542
branch: fix/542-select-chevron-padding
tags: [frontend, ui, bug]
blockedBy: []
blocks: []
created: 2026-11-03
---

# Plan: #542 — Mũi tên dropdown dính sát mép phải

## Outcome

Mọi dropdown có mũi tên xuống cách mép phải ô một khoảng đồng nhất (~12px, như `px-3`), không đè lên chữ, đúng ở light/dark và 3 viewport.

## Nguyên nhân (đã scout)

- `Select` trong `packages/ui/src/components/web-kit/field.tsx` là `<select>` native với `inputCls` (`px-3`), không `appearance-none`: trình duyệt tự vẽ mũi tên sát mép. Dùng ở ~30 chỗ (web, admin).
- 2 `<select>` thô cùng lỗi: `apps/web/src/routes/_auth/leads/index.tsx` (`#lead-status`) và `apps/web/src/components/modals/invoice-payment-modal.tsx`.
- `apps/student/src/components/practice/practice-filters.tsx` đã tự bọc `<label relative>` + `ChevronDown` overlay (`right-2.5`): đúng nhưng lệch quy ước.
- Lưu ý: người lập plan không xem được ảnh đính kèm; kết luận dựa trên code. Cần đối chiếu screenshot khi verify.

## Hướng sửa

Sửa tại primitive để không phải đụng từng call site và không đổi layout (callers truyền `className` như `h-8 min-w-[220px]` vào chính `<select>`):

- Thêm `appearance-none pr-9` cho `Select`, vẽ chevron bằng `background-image` (SVG lucide chevron-down) đặt `right 0.75rem center`, `size 1rem`, không dùng wrapper.
- Màu chevron theo token `muted-foreground` cho light và dark: khai báo class `select-chevron` trong `packages/ui/src/styles/globals.css` với biến `--select-chevron` đổi theo `.dark`.
- Không dùng wrapper + icon overlay vì sẽ phá `className` width/flex của các call site hiện có.

## Non-goals

- Không thay `<select>` native bằng Radix/shadcn Select (đổi hành vi, a11y, e2e selector).
- Không đổi kích thước, màu viền, API của `Select`.
- Không đụng chevron của accordion/collapsible/nav (không phải dropdown).

## Acceptance criteria

1. Mọi `Select` hiển thị mũi tên cách mép phải ~12px; chữ dài không đè mũi tên.
2. 2 select thô dùng `Select` (hoặc cùng class), student dùng cùng class và bỏ overlay riêng.
3. Light/dark đều thấy rõ; trạng thái `disabled` và `focus-visible` không lệch.
4. Biome, check-types, test, e2e pass; 3 viewport + screenshot trong PR.

Chi tiết: [phase-01-select-chevron-primitive.md](phase-01-select-chevron-primitive.md)
