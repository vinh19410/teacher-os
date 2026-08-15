---
phase: 7
title: "Reports, settings and cleanup"
status: pending
priority: P2
effort: "4h"
dependencies: [6]
---

# Phase 7: Reports, settings and cleanup

## Overview
Implement the final two views (Reports with send log, Settings with 4 tabs) and remove all conversion scaffolding (scratch routes, unused deps) plus fix PWA branding to the light design.

## Requirements
- Functional — Reports (`/reports`): "Báo cáo đã gửi" table (student, chu kỳ, số buổi, status badge Đã đọc/Đã gửi/Nháp, sent time, "Phụ huynh xem" read time or "Chưa mở"); "+ Tạo báo cáo tuần" modal (student select, chu kỳ default "19–25/08", content textarea prefilled with export template, Gửi qua Zalo OA/Email select, Lưu nháp / Gửi báo cáo footers); "Nhật ký gửi tin nhắn" log list (5 entries with date mono, title, desc, channel).
- Functional — Settings (`/settings`): 4 tabs —
  - Tài khoản: teacher info card (Họ tên, Email disabled, SĐT/Zalo, Múi giờ select Asia/Ho_Chi_Minh) + Gói dịch vụ card (Pro badge Đang dùng, 99.000đ/tháng, feature line, đơn giá default input, Quản lý thanh toán button)
  - Mẫu tin Zalo: 3 template textareas (nhắc lịch T−24h, nhắc nợ quá hạn 3 ngày, báo cáo tuần) with `{{placeholder}}` tokens verbatim
  - Quy tắc: 2 cards — vắng học (3 selects/inputs) + nhắc nhở (4 selects)
  - Dữ liệu: export card with 2 secondary buttons (Xuất CSV, Xuất toàn bộ JSON) + danger Xóa tài khoản button
- Functional: modal buttons and settings controls can be local state only (no persistence in export) — matching export behavior exactly (static forms). **Demo-data labeling (red-team):** the Settings export buttons ("Xuất CSV", "Xuất toàn bộ JSON") and the danger zone carry helper text clarifying they operate on demo data — they must not launder seed data as durable records.
- Cleanup: ~~delete `/dev/kit` scratch route~~ (dropped in Phase 3 red-team edit — the route is never created); verify no unused files/imports; PWA manifest `theme_color` → `#ffffff` (light) and meta theme-color; root route meta title → "Teacher OS · Quản lý lớp gia sư 1:1".
- Non-functional: settings tab state resets on navigation (matches export).

## Architecture
```
apps/web/src/routes/_auth/reports.tsx    # + components/modals/create-report-modal.tsx
apps/web/src/routes/_auth/settings.tsx   # 4 tab panels local state
```
Reports log entries are static seed data (export hardcodes them). Settings forms hold values in component state; save buttons are no-ops visually (export has no persistence) — but inputs must be controlled and editable.

## Related Code Files
- Create: `apps/web/src/routes/_auth/reports.tsx`
- Create: `apps/web/src/routes/_auth/settings.tsx`
- Create: `apps/web/src/components/modals/create-report-modal.tsx`
- Modify: `apps/web/vite.config.ts` (PWA manifest theme_color, name "Teacher OS", description)
- Modify: `apps/web/src/routes/__root.tsx` (meta title/description)
- Reference: export lines 471–545 (reports/settings markup), 1032–1054 (renderReports), 1282–1297 (create-report modal)

## Implementation Steps
1. Reports list table + status badge mapping + read-time column.
2. Create-report modal with prefilled textarea content (multi-line, verbatim from export including line breaks).
3. Send log list (5 hardcoded entries from export `log` array).
4. Settings 4 tabs: forms as controlled inputs; disabled email styling `opacity:.6`.
5. Cleanup pass: delete scratch route; `pnpm run check` fix-all; grep for leftover TODO/dead imports.
6. PWA + meta updates; regenerate nothing (assets optional — logo.png stays).

## Success Criteria
- [x] Reports table shows 4 reports with correct badges and "Chưa mở" for r3/r4
- [x] Create-report modal opens from both reports page and student detail (export opens it from both places — student detail button reuses same modal component)
- [x] Settings tabs switch correctly; all form values editable; template placeholders `{{student_name}}` etc. intact
- [x] Danger button styled red-bordered as export
- [x] `/dev/kit` gone (never created per Phase 3); manifest theme_color white; tab title correct
- [x] Biome + type-check + build pass

<!-- Updated: Red Team - demo labeling on exports, /dev/kit dropped -->

## Risk Assessment
Low. Static screens. Only trap: the create-report modal is triggered from two contexts (reports page, student detail) with the student preselected when opened from a student — pass `defaultStudentId` prop; export preselects nothing (select defaults to first option) so preselect is a no-op unless wired; keep parity with export (no preselect) to avoid scope creep.
