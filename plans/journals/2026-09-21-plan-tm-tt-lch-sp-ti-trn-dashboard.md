---
title: Plan tóm tắt lịch sắp tới trên /dashboard
date: 2026-09-21
summary: "Plan fast-mode: selector upcomingLessonsThisWeek date-aware + section display-only Lịch sắp tới, 1 phase / 3 file, validate pass"
---

# Plan tóm tắt lịch sắp tới trên /dashboard

## What happened
- Yêu cầu: /dashboard ngoài "Lịch hôm nay" cần thêm tóm tắt lịch sắp tới. Chạy ak-plan fast mode (auto-detect: task nhỏ, scope rõ), HOLD SCOPE.
- Scout phát hiện: `lessonsToday` (apps/web/src/lib/dashboard-from-kernel.ts) lọc theo `day` thuần, không xét `date`; week-grid.ts đã có `todayISOVietnam`/`startOfWeekMonday`/`weekDates` UTC-anchored; schedule-week.ts xác định dòng có `date` chỉ thuộc tuần của nó.
- Scaffold qua `ak plan create` → plans/260921-0404-dashboard-upcoming-schedule-summary; planner subagent điền plan.md + phase-01-upcoming-selector-ui.md.

## Decision
- Phạm vi "phần còn lại của tuần hiện tại" (mai → Chủ nhật) thay vì cửa sổ 7 ngày: khớp model Mon=1..7 của `lesson.day`, boundary Chủ nhật tự nhiên, tái dùng week-grid.
- Selector mới `upcomingLessonsThisWeek` date-aware (legacy: day > hôm nay; dated: date ∈ tuần còn lại theo giờ VN), KHÔNG đổi `lessonsToday` (tránh regression khối hôm nay).
- Section display-only, không nút Điểm danh (check-in chỉ dành buổi hôm nay); không dedupe 1:2 như week grid — hiển thị từng row như khối hôm nay.

## Next steps
- Handoff phase 1 cho /ak:cook (3 file modify: dashboard-from-kernel.ts + test, dashboard.tsx).
- Gate: pnpm --filter web test, rồi pnpm check && pnpm check-types && pnpm test từ repo root.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
