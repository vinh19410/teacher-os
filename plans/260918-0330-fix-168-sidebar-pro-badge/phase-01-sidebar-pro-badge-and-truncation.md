---
title: "Phase 1: Sidebar PRO Badge & Truncation"
description: "Cập nhật sidebar.tsx và thêm sidebar-user-card test để kiểm chứng badge động và tooltip title."
status: completed
priority: P2
effort: 20m
plan: plans/260918-0330-fix-168-sidebar-pro-badge/plan.md
---

# Phase 1: Sidebar PRO Badge & Truncation

## Context

File cần chỉnh sửa:
- `apps/web/src/components/layout/sidebar.tsx`
- Tạo mới: `apps/web/src/components/layout/sidebar.test.tsx`

## Tasks

- [x] Cập nhật `apps/web/src/components/layout/sidebar.tsx`:
  - Lấy `plan = extractUserPlan(user)` an toàn runtime
  - Ẩn badge nếu `plan` không tồn tại; nếu có render `<span data-testid="sidebar-user-plan" className="ml-1 shrink-0 rounded-full ...">{plan}</span>`
  - Thêm `title={displayName}` cho thẻ tên người dùng.
  - Thêm `title={user.email}` cho thẻ email người dùng.
  - Thêm `flex-1 min-w-0` cho thẻ `<Link to="/profile">` và container text để tận dụng không gian khả dụng.
  - Thêm `title={displayName ? `${displayName} (${user.email})` : "Hồ sơ cá nhân"}` và `aria-label="Hồ sơ cá nhân"` trên `<Link>`.
- [x] Viết test trong `apps/web/src/components/layout/sidebar.test.tsx`:
  - Test contract tĩnh của `sidebar.tsx`: không chứa badge PRO hardcode (`not.toMatch(/PRO/)`).
  - Test hiển thị badge động và tooltip title.
- [x] Chạy kiểm thử:
  - `pnpm -F web test`
  - `pnpm check`
  - `pnpm check-types`
