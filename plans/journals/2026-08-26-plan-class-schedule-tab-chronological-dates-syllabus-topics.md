---
title: "Plan: class schedule tab chronological dates + syllabus topics"
date: 2026-08-26
summary: "ak:plan fast --advice --github cho tab Lịch học class detail: derive ngày thật render-layer, gộp cột Ngày+Giờ, map chủ đề syllabus — issue #83"
---

# Plan: class schedule tab chronological dates + syllabus topics

## What happened
Tab Lịch học (class detail) nhóm buổi theo thứ (13 dòng T3 rồi 13 dòng T6), cột Ngày chỉ "T3", cột Chủ đề trống. Root cause đã xác minh bằng code: lesson row không có cột ngày (chỉ day 1-7), server sort asc(lesson.day) tại snapshot.ts:141, generator gán topic:"" (kernel.ts:82-105). Đã chạy /ak:plan --github --advice (auto Fast mode, HOLD SCOPE).

## Decision
Render-layer derive thuần web (0 schema/server/API change): pure helper apps/web/src/lib/class-sessions.ts sinh buổi chronological từ startDate + schedule.days, khớp lesson rows theo slot (day,time), số buổi = distinct slot count. Kongming GO-WITH-CHANGES: (1) driver là distinct slot count chứ không phải sessionsTotal (tránh buổi ma khi rows bị sửa/xóa), (2) parse startDate fail → null + UI fallback nguyên trạng, (3) không ghi syllabus title vào lesson.topic (field user-edit thật), (4) từ chối map theo row index vì generator cycle days[i%len] không align startDate. Map chủ đề: buổi k → syllabus lesson k (flatten theo position), precedence topic user-edit > syllabus > "—".

## Next steps
Plan tại plans/260826-1351-class-schedule-tab-chronological-dates-and-syllabus-topics (2 phase: P1 helper+tests, P2 rewire bảng $classId.tsx:339-373). Issue #83 đã tạo với label ready to review. Chờ user review plan hoặc /ak:cook. Lưu ý: set-active-plan.cjs bản opencode bị hỏng module (ck-config-utils.cjs) — chỉ set được ak plan use pointer.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
