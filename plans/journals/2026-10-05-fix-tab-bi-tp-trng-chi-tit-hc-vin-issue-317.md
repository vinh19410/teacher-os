---
title: Fix tab Bài tập trống ở chi tiết học viên (issue 317)
date: 2026-10-05
summary: "Implement plan 261005-0640 via ak:vibe --ship --beta. Selector studentAssignmentRows (pure, merge classAssignments[].targets + legacy grading, sort due ISO tăng dần + due rỗng/không-ISO xuống cuối, inline map skill strict) + test 11 case; wire tab students/$studentId render 2 nhánh kind (class: plain text + subtitle tên lớp + StatusTag; grading: link trang chấm giữ hành vi cũ trừ sort/fmtDue). Gates: pnpm check, check-types, web test 1221 pass. Verify UI: e2e-boot shim API 8100 + web 8101 + student 8103 (không cần .env); fixture dựng qua UI; submit portal → reload teacher → Đã nộp; empty state OK; screenshot 3 viewport trong plan dir. Red-team pre-cook: 8 findings applied (real-time claim, sort due legacy, dead-branch tests, fixture tái lập, skillOf fallback, legacy frozen note, grading-row behavior wording, validation scope)."
---

# Fix tab Bài tập trống ở chi tiết học viên (issue 317)

Implement plan 261005-0640 via ak:vibe --ship --beta. Selector studentAssignmentRows (pure, merge classAssignments[].targets + legacy grading, sort due ISO tăng dần + due rỗng/không-ISO xuống cuối, inline map skill strict) + test 11 case; wire tab students/$studentId render 2 nhánh kind (class: plain text + subtitle tên lớp + StatusTag; grading: link trang chấm giữ hành vi cũ trừ sort/fmtDue). Gates: pnpm check, check-types, web test 1221 pass. Verify UI: e2e-boot shim API 8100 + web 8101 + student 8103 (không cần .env); fixture dựng qua UI; submit portal → reload teacher → Đã nộp; empty state OK; screenshot 3 viewport trong plan dir. Red-team pre-cook: 8 findings applied (real-time claim, sort due legacy, dead-branch tests, fixture tái lập, skillOf fallback, legacy frozen note, grading-row behavior wording, validation scope).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
