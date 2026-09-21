---
title: "Plan: stack schedule cards below day header"
date: 2026-09-18
summary: "Lập kế hoạch layout xếp card buổi dạy dưới nhãn thứ/ngày trên /schedule — plan 260918-0647, issue #200"
---

# Plan: stack schedule cards below day header

## What happened
- User yêu cầu card buổi dạy trên màn Lịch dạy (/schedule) nằm bên dưới nhãn thứ/ngày thay vì ngang hàng (ảnh chụp mobile ≤920px).
- Scout nhanh: apps/web/src/routes/_auth/schedule.tsx:176 — day-col là flex ngang (header trái, card phải); các override max-app:* mã hoá variant mobile; breakpoint app=921px (packages/ui globals.css:219).
- E2e impact: 3 spec chọn .lesson-block theo class+text, không phụ thuộc vị trí → an toàn.
- ak:plan --github, mode fast: scaffold plans/260918-0647-stack-schedule-cards-below-day-header (plan.md + phase-01-stack-day-column.md), ak plan validate OK, 5/5 claims verified.
- Tạo GitHub issue #200 (label ready to review), cập nhật frontmatter issue: 200.

## Decision
- Fix 1 điểm: day-col flex → flex flex-col; dọn toàn bộ max-app:* ngang; giữ tín hiệu today bằng text-accent-blue; giữ class hook week-cal/day-col/lesson-block cho e2e.
- Giữ grid max-app:grid-cols-1 cho mobile — chỉ nội bộ mỗi ngày xếp dọc.
- Subagent planner/scout lỗi môi trường (reasoning-level-missing) → tự thực hiện scout + drafting trực tiếp, chất lượng bằng chứng giữ nguyên.

## Next steps
- /ak:cook plans/260918-0647-stack-schedule-cards-below-day-header/plan.md
- Gate: pnpm --filter web check-types && pnpm --filter web test; e2e 3 spec schedule.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
