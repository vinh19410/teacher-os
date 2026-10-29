---
title: "Plan apps/admin: CRUD bộ đề IELTS Reading & Listening (#413)"
date: 2026-10-22
summary: "Lập plan 7 phase thêm apps/admin với role admin, thư viện đề toàn hệ thống và audio R2."
---

# Plan apps/admin: CRUD bộ đề IELTS Reading & Listening (#413)

## What happened
Scout monorepo (auth theo role/origin, schema assignment_test/prompt, infra topology) rồi lập plan `plans/261022-1025-admin-app-ielts-library/` (7 phase) và issue #413.

## Decision
- Role `admin` mới + origin `admin.<domain>` (dev 8004, e2e 8104); sign-up chỉ qua `ADMIN_EMAILS`, `requireAdmin` kiểm lại role + allowlist + emailVerified mỗi request.
- Thư viện đề toàn hệ thống, bảng riêng `library_test`/`library_test_part` (một cấp, không orgId).
- Audio Listening upload lên R2 bucket mới `library-audio`, cap 50MB.

## Risks
Phase 4 (trích editor từ apps/web sang packages/ui) là refactor lớn nhất; dừng và hỏi lại user nếu có coupling ẩn. `user.create.before` hiện gán role theo origin nên phải chặn sign-up admin ngoài allowlist.

## Next steps
Duyệt plan, rồi `/ak:cook` theo từng phase.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
