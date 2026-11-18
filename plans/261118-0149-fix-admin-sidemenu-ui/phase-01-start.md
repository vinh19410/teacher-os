---
title: "Phase 1: TDD Fix AdminShell & Visual Verification"
status: todo
---

# Phase 1: TDD Fix AdminShell & Visual Verification

## Overview

Áp dụng sửa lỗi CSS/layout cho `AdminShell` theo chuẩn `DESIGN.md` và `REVIEW.md` bằng quy trình TDD, giữ nguyên toàn bộ selector/semantics mà `apps/e2e/specs/admin-auth.spec.ts` đang kiểm tra.

## Files Affected

- `apps/admin/src/components/layout/admin-shell.tsx` (chỉnh sửa)
- `apps/admin/src/components/layout/admin-shell.test.tsx` (tạo mới — unit test TDD)

## Requirements

<!-- Updated: Validation Session 1 - Reconciled mobile flex-wrap basis, header gap/shrink-0, and active nav font-medium -->
- [x] `<aside aria-label="Điều hướng quản trị">` dùng `flex w-full shrink-0 flex-row flex-wrap items-center justify-between gap-2 border-b border-sidebar-border bg-sidebar px-3 py-2 text-sidebar-foreground md:w-64 md:flex-col md:flex-nowrap md:items-stretch md:justify-start md:gap-1 md:border-r md:border-b-0 md:p-3` (khớp bề rộng 16rem của `sidebar-07` trong `DESIGN.md`, hỗ trợ cả light và dark mode).
- [x] Khối thương hiệu dùng `flex min-w-0 flex-1 basis-60 items-center gap-2.5 px-2 py-1.5 font-medium md:w-full md:flex-none md:basis-auto md:py-2.5`: trên mobile (320px/375px), `basis-60` (240px) buộc `flex-wrap` đẩy `<nav>` xuống hàng 2 gọn gàng thay vì bóp chữ thành cột 112px; chữ `"Cô Mỹ Dạy Tiếng Anh · Quản trị"` dùng `min-w-0 flex-1 text-sm leading-tight` để bọc tối đa 2 dòng gọn gàng mà không cắt mất `"Quản trị"` và không tràn khỏi sidebar.
- [x] `<nav>` dùng `flex shrink-0 flex-row gap-1 md:grid md:w-full` với icon `size-4 shrink-0` và trạng thái active/hover khớp `nav-group.tsx`: `hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active]:bg-sidebar-accent data-[active]:font-medium data-[active]:text-sidebar-accent-foreground`.
- [x] Header `<header>` dùng `flex h-14 items-center justify-between gap-3 border-b px-4 md:px-6`, tên/email admin dùng `min-w-0 truncate font-medium text-sm`, và nút `"Đăng xuất"` dùng `shrink-0` để không bị chồng hoặc đẩy ra khỏi viewport 320px/375px. Không thêm `ThemeToggle` mới ngoài phạm vi lỗi sidemenu.
- [x] Giữ nguyên text `"Cô Mỹ Dạy Tiếng Anh · Quản trị"` trong một phần tử đơn, `aria-label="Điều hướng quản trị"` trên `<aside>`, và link `"Thư viện đề"` để tương thích 100% với `apps/e2e/specs/admin-auth.spec.ts`.

## Test Matrix (TDD)

1. `admin-shell.test.tsx` (`environment: "node"`, `renderToStaticMarkup` theo pattern `auth-forms.test.tsx`):
   - Mock `@tanstack/react-router` gồm `useRouteContext` (trả `{ admin }`), `Outlet`, và `Link` (tách `activeProps` ra khỏi `...rest` để tránh warning DOM, gắn `data-active="true"` khi giả lập active). Mock `@/lib/auth-client` (`signOut`).
   - Assert `<aside aria-label="Điều hướng quản trị">` có `md:items-stretch`, `md:shrink-0`, `md:w-64`, `bg-sidebar`.
   - Assert brand wrapper có `min-w-0`, `basis-60`, `md:w-full`; text `"Cô Mỹ Dạy Tiếng Anh · Quản trị"` có `min-w-0 flex-1`.
   - Assert `<nav>` có `md:w-full` và render link `"Thư viện đề"` tới `/library/tests` với `data-[active]:bg-sidebar-accent` và `data-[active]:font-medium`.
   - Assert `<header>` có `gap-3`, hiển thị `admin.name` (và fallback sang `admin.email` khi `name` rỗng) với `min-w-0 truncate`, cùng nút `"Đăng xuất"` có `shrink-0`.
2. Browser & E2E verification (Playwright Chromium thật):
   - Seed tài khoản `admin@e2e.local` (không dùng PII thật) qua `boot:api` + đăng nhập admin trên `/login`, mở trang danh sách và trang chi tiết đề (`$testId.tsx`), dùng selector cụ thể `aside[aria-label="Điều hướng quản trị"]`.
   - Kiểm tra bounding-box ở `1440×900`, `768×1024`, `375×812`, `320×568` (light mặc định + dark via `localStorage.theme = "dark"` + reload):
     - `document.documentElement.scrollWidth <= document.documentElement.clientWidth`
     - `brandRect.left >= asideRect.left && brandRect.right <= asideRect.right` và `iconRect.left >= 0`
     - Desktop (`>=768px`): `asideRect.right <= headerRect.left` và `asideRect.right <= mainRect.left`; Mobile (`<768px`): `asideRect.bottom <= headerRect.top`
     - Header: `adminNameRect.right <= signOutRect.left` và `signOutRect.right <= viewportWidth`
   - Dọn sạch toàn bộ process tạm trên cổng `8100–8105` trước khi chạy `pnpm --filter e2e e2e specs/admin-auth.spec.ts` (với port override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105`).

## Implementation Steps

1. Viết `apps/admin/src/components/layout/admin-shell.test.tsx` (RED — chạy `pnpm --filter admin test` xác nhận fail trên code cũ).
2. Cập nhật `apps/admin/src/components/layout/admin-shell.tsx` (GREEN — chạy `pnpm --filter admin test` xác nhận pass).
3. Chạy `pnpm exec biome check .` và `pnpm check-types`.
4. Chạy script Playwright xác minh bounding-box + chụp screenshot light/dark 3 viewport vào `plans/reports/`, dọn sạch server tạm, rồi chạy `pnpm --filter e2e e2e specs/admin-auth.spec.ts`.

## Todo

- [x] Viết test TDD `admin-shell.test.tsx` và xác nhận fail trước khi sửa
- [x] Sửa `admin-shell.tsx` và xác nhận unit test pass
- [x] Chạy `biome check`, `check-types`, test workspace
- [x] Chụp screenshot xác minh UI & chạy E2E `admin-auth.spec.ts`

## Success Criteria

- Toàn bộ unit tests, typecheck, biome check, `admin-auth.spec.ts` E2E pass và không còn hiện tượng tràn/cắt/đè UI trên sidemenu admin ở bất kỳ viewport nào.
