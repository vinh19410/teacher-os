---
title: "fix: sidebar shell đè nội dung 32px trên desktop"
date: 2026-08-16
summary: "Sidebar giữ w-[280px] của drawer mobile trong grid track 248px → thêm app:w-full, gỡ app:static chết"
---

# fix: sidebar shell đè nội dung 32px trên desktop

## What happened
Trên desktop (≥921px, breakpoint `app:`), sidebar của app shell đè lên mép trái topbar + nội dung trên **mọi màn hình `_auth`**. Nguyên nhân gốc: `app-shell.tsx:66` reserve track `app:grid-cols-[248px_1fr]` nhưng `<aside>` trong `sidebar.tsx` giữ base `w-[280px]` (width drawer mobile) **không có override `app:w-*`** → sticky aside (z-100) tràn 32px sang cột nội dung, che topbar (z-20). Có từ commit 24d593b (phase 4). Kèm theo: `app:sticky` (dòng base) mâu thuẫn `app:static` (nhánh đóng) — static chết do thứ tự phát CSS của Tailwind.

## Decision
- Thêm `app:w-full` vào class base của `<aside>`: desktop width = 100% track 248px, grid template thành nguồn thật duy nhất cho width sidebar (thay vì hardcode 248px ở chỗ thứ hai). Mobile (<921px) giữ nguyên drawer 280px.
- Xóa `app:static` mâu thuẫn (zero rendered delta — sticky đã thắng từ trước).
- Không chọn `app:w-[248px]` vì nhân bản magic number, tái tạo cùng lớp bug khi đổi template.

## Verification
- CSS phát hành (vite build): `.app\:w-full{width:100%}` trong `@media (width>=921px)` đứng sau base `.w-\[280px\]`; `.app\:static` biến mất.
- `tsc --noEmit`, `vite build`, `biome check` (layout dir) pass. Code-reviewer PASS 4/4, không regression (drawer mobile, resize, stacking z, sticky).
- Browser E2E không chạy được: IAB webview không attach sau 3 lần thử ("browser guest not attached") — chấp nhận vì geometry hoàn toàn do CSS xác định.
- Repo không có test framework nào → không thêm regression test (out of scope cho fix 3 dòng class).

## Next steps (follow-up từ review, pre-existing, không chặn)
- Dùng token đang chết `--sidebar-w: 248px` (globals.css:90) cho grid template: `app:grid-cols-[var(--sidebar-w)_1fr]`.
- Dọn cặp mâu thuẫn `app:border-solid` vs `app:border-none` (sidebar.tsx).
- Drawer mobile thiếu height (chỉ có `app:h-svh`) → viewport ngang sẽ không với được nav đáy.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
