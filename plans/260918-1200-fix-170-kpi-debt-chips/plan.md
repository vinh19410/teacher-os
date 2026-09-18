---
title: "Fix #170: KPI Còn nợ đỏ với 0đ + chip filter tiếng Anh trên list pages"
description: "Chuyển KPI Còn nợ trên /tuition sang neutral khi 0đ (chỉ danger khi > 0) và Việt hóa các chip filter (Viết/Nói/Trực tuyến/Trực tiếp) cùng tiêu đề trên list pages."
status: completed
priority: P2
effort: 30m
issue: 170
branch: vinh19410/issue-170-kpi-debt-chips
tags: [bugfix, frontend, tuition, students, classes, syllabus, localization, kpi]
blockedBy: []
blocks: []
created: 2026-09-18
---

# Fix #170: KPI "Còn nợ" đỏ với 0đ + chip filter tiếng Anh trên list pages

## Overview

Theo Dogfood QA (Issue #10 trong `dogfood-output/report.md`, GitHub Issue #170):
1. KPI "Còn nợ (VND)" trên trang `/tuition` (`apps/web/src/routes/_auth/tuition.tsx:51`) đang gán cứng class `[&>div:first-child]:text-danger`, khiến cho tài khoản không có nợ (0đ) vẫn hiển thị màu đỏ báo động giả.
2. Các trang danh sách (`/students`, `/classes`, `/syllabus`) đang hiển thị các chip filter và tiêu đề bằng tiếng Anh xen lẫn UI tiếng Việt:
   - `/students`: Chip filter `Writing`, `Speaking`
   - `/classes`: Chip filter `Online`, `Offline` và cột tiêu đề bảng `Syllabus`
   - `/syllabus`: Chip filter `Writing`, `Speaking`, `Reading`, `Listening` và `PageHead title="Syllabus"`

Mục tiêu:
1. Sửa KPI "Còn nợ (VND)" trên `/tuition` hiển thị neutral khi 0đ (hoặc <= 0), chỉ gán danger khi `outstanding > 0`.
2. Việt hóa chip filter trên `/students`: `Writing` → `Viết`, `Speaking` → `Nói`.
3. Việt hóa chip filter trên `/classes`: `Online` → `Trực tuyến`, `Offline` → `Trực tiếp`, và cột bảng `Syllabus` → `Giáo trình`.
4. Việt hóa chip filter trên `/syllabus`: `Writing` / `Speaking` / `Reading` / `Listening` → `Viết` / `Nói` / `Đọc` / `Nghe`, cùng tiêu đề `PageHead title="Giáo trình"`, đồng bộ `PAGE_TITLES` trong `app-shell.tsx`. Giữ nguyên sidebar `label: "Syllabus"` để bảo toàn e2e test contract.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | KPI "Còn nợ (VND)" hiển thị neutral khi 0đ, chỉ danger khi > 0đ | P2 |
| 2 | Việt hóa chip filter trên `/students` (Viết, Nói) và map đúng tag học viên | P2 |
| 3 | Việt hóa chip filter trên `/classes` (Trực tuyến, Trực tiếp) và cột Giáo trình | P2 |
| 4 | Việt hóa chip filter và tiêu đề trên `/syllabus` (Viết, Nói, Đọc, Nghe; Giáo trình) | P2 |
| 5 | Thêm contract / unit test khóa chặt hành vi, bảo đảm test suite và checks pass 100% | P2 |

## Key Decisions

- **KPI Còn nợ:** Dùng `className={outstanding > 0 ? "[&>div:first-child]:text-danger" : undefined}` trên `StatCard`. Khi `outstanding === 0`, `fmtVND(0)` là `"0đ"`, không có class text-danger nên thẻ số kế thừa màu chữ mặc định của Card (neutral).
- **Mapping chip filter học viên:** `FILTERS = ["Tất cả", "Sắp hết buổi", "Nợ học phí", "Viết", "Nói"]`. `FILTER_TAGS` ánh xạ nhãn tiếng Việt `Viết` tới `["IELTS Writing", "Writing", "Viết"]` và `Nói` tới `["IELTS Speaking", "Speaking", "Nói"]` để đảm bảo dù dữ liệu mang tag tiếng Anh hay tiếng Việt đều lọc chính xác.
- **Mapping chip filter lớp học:** `FILTERS = ["Tất cả", "Trực tuyến", "Trực tiếp", "Đang học"]`. Ánh xạ `MODE_MAP`: `"Trực tuyến" → "Online"`, `"Trực tiếp" → "Offline"` để so khớp với field `c.mode` trên wire.
- **Bảo toàn E2E Spec Contract:** Giữ sidebar navigation `label: "Syllabus"` và modal button `+ Tạo syllabus` để không làm gãy `syllabus-delete-reorder.spec.ts` (`page.getByText("Syllabus", { exact: true })`) và `createSyllabusTemplate` (`page.getByRole("button", { name: "+ Tạo syllabus" })`).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: KPI Debt & Filter Chips](./phase-01-kpi-debt-and-filter-chips.md) | Completed |

## Success Criteria

- [x] Khi `outstanding === 0`, `StatCard` "Còn nợ (VND)" không có class `text-danger`.
- [x] Khi `outstanding > 0`, `StatCard` "Còn nợ (VND)" có class `text-danger`.
- [x] `/students` có chip filter "Viết" và "Nói", lọc đúng học viên tương ứng.
- [x] `/classes` có chip filter "Trực tuyến" và "Trực tiếp", lọc đúng lớp tương ứng; header bảng hiển thị "Giáo trình".
- [x] `/syllabus` có chip filter "Viết", "Nói", "Đọc", "Nghe", lọc đúng template; header hiển thị "Giáo trình".
- [x] Tất cả contract test, unit test, `pnpm check`, `pnpm check-types` pass.
