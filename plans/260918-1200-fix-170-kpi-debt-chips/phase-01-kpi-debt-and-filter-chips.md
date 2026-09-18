---
title: "Phase 1: KPI Debt & Filter Chips"
description: "Cập nhật style KPI Còn nợ trong tuition.tsx và Việt hóa chip filter trên students, classes, syllabus."
status: completed
priority: P2
effort: 20m
plan: plans/260918-1200-fix-170-kpi-debt-chips/plan.md
---

# Phase 1: KPI Debt & Filter Chips

## Context

Các file cần sửa đổi:
- `apps/web/src/routes/_auth/tuition.tsx`
- `apps/web/src/routes/_auth/students/index.tsx`
- `apps/web/src/routes/_auth/classes/index.tsx`
- `apps/web/src/routes/_auth/syllabus/index.tsx`
- `apps/web/src/components/layout/app-shell.tsx`
- [x] Cập nhật `apps/web/src/routes/_auth/tuition.tsx`:
  - `StatCard` Còn nợ (VND): chỉ thêm `[&>div:first-child]:text-danger` khi `outstanding > 0`.
- [x] Cập nhật `apps/web/src/routes/_auth/students/index.tsx`:
  - `FILTERS = ["Tất cả", "Sắp hết buổi", "Nợ học phí", "Viết", "Nói"]`
  - Cập nhật ánh xạ `FILTER_TAGS` để hỗ trợ lọc theo "Viết" và "Nói".
- [x] Cập nhật `apps/web/src/routes/_auth/classes/index.tsx`:
  - `FILTERS = ["Tất cả", "Trực tuyến", "Trực tiếp", "Đang học"]`
  - Ánh xạ `MODE_MAP` để so sánh với `c.mode`.
  - Cập nhật header bảng từ `"Syllabus"` sang `"Giáo trình"`.
- [x] Cập nhật `apps/web/src/routes/_auth/syllabus/index.tsx`:
  - `FILTERS = ["Tất cả", "Viết", "Nói", "Đọc", "Nghe"]`
  - Ánh xạ `SKILL_MAP` để so sánh với `s.skills`.
  - Đổi `PageHead title` sang `"Giáo trình"`.
- [x] Cập nhật `apps/web/src/components/layout/app-shell.tsx`:
  - Đổi `PAGE_TITLES` cho `/_auth/syllabus` sang `"Giáo trình"`.
- [x] Thêm test trong `apps/web/src/lib/kernel-runtime.contract.test.ts`:
  - Khóa cấm tĩnh unconditional text-danger cho Còn nợ khi 0đ.
  - Khóa cấm chip filter tiếng Anh trên list pages.
- [x] Chạy kiểm thử:
  - `pnpm -F web test`
  - `pnpm check`
  - `pnpm check-types`
