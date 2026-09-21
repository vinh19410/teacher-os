---
title: "Plan: tạm ẩn cụm Phụ huynh Báo cáo (hoãn phát triển)"
date: 2026-09-21
summary: "Lập plan 2 phase ẩn toàn bộ điểm vào UI cụm Phụ huynh — Báo cáo bằng flag tĩnh, giữ nguyên backend/DB; issue #210"
---

# Plan: tạm ẩn cụm Phụ huynh Báo cáo (hoãn phát triển)

## What happened

- User yêu cầu tạm ẩn/hoãn cụm "Phụ huynh Báo cáo" cho phần phát triển sau (`ak-plan --github`, auto-detect → fast mode, HOLD SCOPE).
- Scout + verify trực tiếp toàn bộ điểm chạm: sidebar.tsx:145-167, reports.tsx:13-15, $studentId.tsx:116/272-278, app-shell.tsx:24, settings.tsx:169/288-297, routes-matcher.ts:9, reports.test.tsx, settings.test.tsx.
- Plan `plans/260921-0347-hide-parent-reports-cluster/` (plan.md + 2 phase, 22 task, ~3h, P2) — validate exit 0, validation gate tier Light 14/14 claim VERIFIED (sửa 1 lệch số dòng 13→14 ở $studentId.tsx).
- Tạo GitHub issue #210 với label "ready to review".

## Decision

- Flag hằng số `PARENT_REPORTS_ENABLED = false` trong module mới `apps/web/src/lib/features.ts` (repo chưa có feature flag; env-flag là overkill).
- `/reports` chặn bằng `beforeLoad` throw `redirect({ to: "/dashboard" })` — component trang + unit test giữ nguyên để bật lại dễ.
- GIỮ `routes-matcher.ts` nguyên vẹn: SW phải cho `/reports` qua để client redirect chạy; `routes-matcher.test.ts:20` cũng đang assert `/reports` hợp lệ.
- KHÔNG đụng backend/DB; comment_bank (grade-modal dùng cho chấm bài) và chuông notif không thuộc cụm này.

## Next steps

- Triển khai qua `/ak:cook plans/260921-0347-hide-parent-reports-cluster/plan.md` (branch `vinh19410/issue-210-hide-parent-reports`).
- Bật lại sau này: flip flag + khôi phục 2 kỳ vọng test (xem "Hướng dẫn bật lại" trong plan.md).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
