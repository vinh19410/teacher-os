---
title: "Plan ngân hàng bài tập & giao bài trên lớp (#208)"
date: 2026-09-18
summary: "Hoàn tất plan 4 phase cho /assignments/bank + tab Bài tập trên class detail theo thiết kế mới; red-team 3 persona, 14 findings áp dụng, 0 blocker"
---

# Plan ngân hàng bài tập & giao bài trên lớp (#208)

## What happened
- Chạy `/ak:plan --github` cho 2 surface thiết kế mới (Open Design project f2f4d498): `assignment-bank.html` (16:06) → trang `/assignments/bank`, và `class-detail-assign-2.html` (v2 chuẩn) → tab Bài tập 3 view list/assign/success trên `/classes/$classId`.
- Research song song: 1 agent phân tích 3 mockup HTML (copy chuẩn, trạng thái derived, JS behavior), 1 agent scout codebase (nền #202 đã merge PR #205, class detail, patterns kernel command → snapshot → UI, test/E2E patterns).
- Scaffold plan qua `ak plan create` + `add-phase`; plan dir `plans/260918-0921-assignment-bank-and-class-assign/` (4 phases, 18h).
- Kiến trúc chốt: 2 bảng mới `class_assignment` + `class_assignment_target` (không đụng bảng assignment grading); `POST /api/classes/:id/assignments` trực tiếp trong kernel.ts theo precedent enroll; snapshot collection `classAssignments` targets nhúng; due ISO + min-today theo ngày VN (UTC+7).

## Decision
- Submit-states nộp bài là display-only derived từ `submittedAt` + `due` (design không có UI đánh dấu nộp — write-path là plan tương lai).
- Stat row: giữ 4 stat cũ + thêm 2 stat động của v2 (bài đang mở, đã nộp trên bài mở) → 6 card; lệch layout ghi issue #208 xác nhận.
- Search của bank là filter trong trang (state.query của mock), không phải global search — hiện thực trong filter card.
- "Đã dùng N lớp" = distinct classId, khóa bằng E2E assert sau reassign.
- Red-team: spawn `code-reviewer` lỗi `[reasoning-level-missing]` (tiền lệ #202) — chạy lại 3 persona bằng `general-purpose`; 16 findings, accept 14 (1 Critical: `createdAt` prompt không có trên wire — phase 1 phải thêm ISO string cho cả contract lẫn projection/mapper/UI), reject 2 (trùng/ngoài scope). Áp dụng xong + whole-plan sweep + `ak plan validate` [OK].

## Next steps
- Xác nhận trên issue #208 (v2 chuẩn + các lệch có ý thức) rồi cook: `/ak:cook plans/260918-0921-assignment-bank-and-class-assign/plan.md`.
- Deploy chú ý thứ tự server-trước-web (snapshot shape guard) — đã ghi R4 phase 1.
- AgentWiki publish skipped (journal giữ local theo mặc định).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
