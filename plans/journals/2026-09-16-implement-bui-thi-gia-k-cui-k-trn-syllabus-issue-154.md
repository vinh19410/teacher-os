---
title: "Implement buổi thi giữa kỳ/cuối kỳ trên syllabus (issue #154)"
date: 2026-09-16
---

# Implement buổi thi giữa kỳ/cuối kỳ trên syllabus (issue #154)

Triển khai plan 260916-0729 theo 3 phase TDD. Phase 1: cột kind (lesson|midterm|final) xuyên migration 0014 → contracts → 5 write path kernel.ts → snapshot; copy template→lớp giữ kind, status vẫn reset upcoming. Phase 2: modal showKind (spread có điều kiện — màn hình lớp KHÔNG gửi key kind), mirror data-actions/reducer, highlight row bg-warn-soft/50 + LessonKindBadge qua isTestSessionKind (kiểm tra dương — red-team #2), mapSyllabi normalize kind lạ. Phase 3: parser import v4 5 cột theo hợp đồng forensic trong plan.md, SAMPLE_ROWS chung cho buildSampleCsv + script regen fixture, giữ fixture legacy v3 làm regression, e2e guard kind từ màn hình lớp. Bài học: (1) e2e hardcode localhost:8000/8001 — tách origins.ts + env port override để chạy song song với dev server workerd; (2) title div chứa badge làm getByText exact:true trượt — dùng match không exact; (3) zod non-strict strip unknown key chứ không 400 (red-team #7). Gates: check-types + server 211 + web 438 + e2e 52 passed/1 skipped.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
