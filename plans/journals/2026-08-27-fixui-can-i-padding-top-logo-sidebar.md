---
title: "fix(ui): can đối padding top logo sidebar"
date: 2026-08-27
summary: Tăng padding-top sidebar từ 20px lên 32px để logo không còn bị sát mép trên
---

# fix(ui): can đối padding top logo sidebar

## What happened
- Người dùng report phần top sidebar (khối logo T / Teacher OS) bị sát mép trên.
- Root cause: `apps/web/src/components/layout/sidebar.tsx` — `<aside>` dùng `px-4 py-5` (chỉ 20px padding-top), hàng logo không có pt riêng; sidebar là `sticky/fixed top-0` nên không có chrome nào đệm phía trên.
- Fix: đổi `py-5` → `pt-8 pb-5` trên `<aside>` — tăng padding-top lên 32px, giữ nguyên padding ngang (px-4) và bottom (pb-5) để không ảnh hưởng chiều rộng nav item.

## Decision
- Sửa ở cấp container (`<aside>`) thay vì thêm pt vào hàng logo: giữ semantic "padding của panel", áp dụng nhất quán cho cả desktop sidebar lẫn mobile drawer.
- Chọn 32px (pt-8) theo thước spacing bội của 4 đang dùng trong app (nav item py-2, section label pt-4 pb-2).

## Next steps
- Không cần thêm test (thay đổi thuần presentational, e2e chỉ assert testid).
- Verify bằng lint/typecheck web workspace: pass.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
