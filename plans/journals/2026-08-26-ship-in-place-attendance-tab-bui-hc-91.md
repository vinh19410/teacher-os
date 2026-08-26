---
title: "Ship in-place attendance tab Buổi học (#91)"
date: 2026-08-26
summary: "Implement + ship CTA điểm danh tuần tự trên tab Buổi học; sequential head, 1 enrollmentLessonId/sid/click, modal roster cho lớp nhóm"
---

# Ship in-place attendance tab Buổi học (#91)

## What happened
Implement trọn plan `260826-1854-in-place-attendance-on-bui-hc-tab` (issue #91) trên branch `feat/91-in-place-attendance-buoi-hoc-tab`:

- P1: `ClassSessionLesson` Pick +`id`; helpers `sessionIsEligibleDate` (so chuỗi ISO), `firstUpcomingLessonId` (id-localeCompare trên slot bag, không index-bind), `isSequentialHead` private, `sessionAttendanceState`. Extract `ClassScheduleTable` khỏi route (474 → 223 dòng, contract <500 giữ).
- P2: CTA cột Trạng thái — 1:1 one-click; lớp nhóm mở `SessionAttendanceModal` (live session re-resolve theo modalIndex). a11y: bỏ `<tr>` click, expand chỉ qua chevron. Hook đơn instance trên route, `run/isPending/busy` qua props. `Button` nhận ref (React 19).
- P3: Playwright `timezoneId Asia/Ho_Chi_Minh`; assert 0 CTA lớp start-tomorrow; e2e mới seed lớp start-today qua `POST :8000/api/classes` (Origin :8001), 1 click → "Đã học"×1 persist sau reload; contract runtime khóa wiring table/modal.

## Decision
- Slot bag + prefix heuristic: CTA chỉ sequential head, đúng 1 POST enrollment lesson id / click; không fan-out, không bulk, không mark-absent.
- E2E local defer sang CI vì port 8000/8001 bị alchemy dev của user chiếm — không kill process user.
- Kongming (advice mode) GO ở cả 3 checkpoint; code-review PASS-WITH-MINORS, 2 minors (fallbackDisplay future-safety, font-medium header) đã fix.

## Evidence
web 280/280, server 126/126, infra 11/11, auth 16/16, biome 0 error, tsc sạch, e2e typecheck sạch.

## Next steps
PR tới develop → CI (gồm e2e) → review-pr → merge. Merge-tabs P3 phải bỏ dropdown/fan-out (#87 đã comment).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
