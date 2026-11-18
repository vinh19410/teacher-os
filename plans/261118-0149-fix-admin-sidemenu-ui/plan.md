---
title: "Fix UI Sidemenu Admin Shell"
description: "Sửa lỗi tràn ngang và căn giữa sai ở sidemenu AdminShell (apps/admin)"
status: completed
priority: P1
effort: "1h"
tags: [admin, ui, bugfix, responsive]
created: 2026-11-18
---

# Fix UI Sidemenu Admin Shell

## Overview

Khắc phục lỗi bố cục sidemenu trong `apps/admin/src/components/layout/admin-shell.tsx`: nhãn `"Cô Mỹ Dạy Tiếng Anh · Quản trị"` bị tràn ra ngoài cả hai mép sidebar (`md:w-60`), khiến icon bị cắt bên trái và chữ `"Quản trị"` đè lên chữ `"Admin"` ở header; đồng thời khối `<nav>` bị căn giữa thay vì kéo hết chiều ngang sidebar.

## Root Cause (Proved via `/ak-debug`)

1. `<aside aria-label="Điều hướng quản trị">` dùng `items-center` ở base class mà không override `md:items-stretch` khi chuyển sang `md:flex-col`, khiến toàn bộ con bị căn giữa ngang và thiếu `md:shrink-0`.
2. Khối thương hiệu `<div className="flex items-center gap-2 px-2 py-3 font-medium">` thiếu `min-w-0` và `w-full` nên tự giãn theo độ rộng nội tại của `"Cô Mỹ Dạy Tiếng Anh · Quản trị"` (~280px > 240px), làm `truncate` không có tác dụng và tràn đều sang hai bên.
3. `<nav className="flex flex-row gap-1 md:grid">` thiếu `md:w-full`, nên mục `"Thư viện đề"` nằm co cụm giữa sidebar thay vì trải full-width.
4. Trên mobile (<768px), `<aside>` thiếu wrapping an toàn cho nhãn dài và `<header>` thiếu `gap-3` / `min-w-0` / `shrink-0` trên nút `"Đăng xuất"`, dễ ép chữ sát nút ở viewport 320px/375px.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Sidemenu desktop/tablet (`md:` ≥768px) không tràn, không cắt icon, không đè header | P1 |
| 2 | Hiển thị đầy đủ `"Cô Mỹ Dạy Tiếng Anh · Quản trị"` và nav `"Thư viện đề"` full-width theo token `sidebar` | P1 |
| 3 | Responsive sạch ở 1440×900, 768×1024, 375×812 và 320×568 (light + dark), giữ nguyên hook E2E | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: TDD Fix AdminShell & Visual Verification](./phase-01-start.md) | Pending |

## Success Criteria

- [x] Unit test `apps/admin/src/components/layout/admin-shell.test.tsx` (TDD red → green, `renderToStaticMarkup` trong `environment: "node"`) kiểm tra đầy đủ cấu trúc/class layout, fallback tên/email header, active state, và hợp đồng selector E2E (`complementary` `"Điều hướng quản trị"`, link `"Thư viện đề"`, brand `"Cô Mỹ Dạy Tiếng Anh · Quản trị"`).
- [x] Kiểm tra trên trình duyệt thật (Playwright Chromium, seed tài khoản `admin@e2e.local` không PII) tại 1440×900, 768×1024, 375×812 và 320×568 (cả light mặc định và dark via `localStorage.theme = "dark"`): không tràn ngang (`scrollWidth <= clientWidth`), icon không bị cắt (`rect.left >= 0`), brand nằm gọn trong `<aside aria-label="Điều hướng quản trị">` (`brandRect.right <= asideRect.right`), không đè `<header>` (`aside.right <= header.left` ở ≥768px; `aside.bottom <= header.top` ở <768px), tên admin không đè nút `"Đăng xuất"`, nav trải đủ chiều ngang trên desktop.
- [x] `pnpm --filter admin test`, `pnpm exec biome check .`, `pnpm check-types`, và `pnpm --filter e2e e2e specs/admin-auth.spec.ts` (port override 8100–8105) đều pass.

## Red Team Review

### Session — 2026-11-18
**Findings:** 10 reported across 2 lenses (deduplicated to 5 distinct findings: 4 High, 1 Medium) — 5 accepted (with scope guard on ThemeToggle), 0 rejected.
**Severity breakdown:** 0 Critical, 4 High, 1 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `flex-1 min-w-0` phá vỡ `flex-wrap` trên mobile 320px/375px | High | Accept | Phase 1 |
| 2 | `renderToStaticMarkup` không chứng minh box-model + thiếu mock `useRouteContext`/`Outlet`/`activeProps` | High | Accept | Phase 1 |
| 3 | Dark mode / `ThemeToggle` và class `data-[active]:font-medium` cho `bg-sidebar-accent` | High | Accept (scope-guarded: không thêm `ThemeToggle` mới vào header, giữ `data-[active]:font-medium` và test dark via `localStorage.theme`) | Phase 1 |
| 4 | Điều kiện `aside.right <= main.left` sai ở mobile + POT PII + xung đột port E2E | High | Accept | Phase 1 |
| 5 | `<header>` thiếu `gap-*` và `shrink-0` trên nút `"Đăng xuất"` ở 320px | Medium | Accept | Phase 1 |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`
- Decision deltas checked: 5
- Reconciled stale references: 5 (cập nhật cả `plan.md` và `phase-01-start.md` cho `basis-60`, mock `useRouteContext`, bounding-box theo breakpoint, `<header>` `gap-3`/`shrink-0`, giữ `data-[active]:font-medium`, seed `admin@e2e.local` cho POT)
- Unresolved contradictions: 0

## Validation Log

### Verification Results
- **Tier:** Light (1 phase)
- **Claims checked:** 7 (tất cả file path, symbol, token, config vitest, lệnh test/e2e)
- **Verified:** 7 | **Failed:** 0 | **Unverified:** 0
- **Notes:** `apps/admin/src/components/layout/admin-shell.test.tsx` là file test mới tạo trong Phase 1.

<!-- slug: fix-admin-sidemenu-ui -->
