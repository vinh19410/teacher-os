---
title: "Plan: fix class detail curriculum duplicate render"
date: 2026-08-26
summary: "Root-caused duplicate curriculum tree in class detail tab (PR #79/#80 kept SyllabusProgress + added editor); planned single-tree merge, issue #81"
---

# Plan: fix class detail curriculum duplicate render

## What happened
- User báo bug (kèm screenshot): tab "Giáo trình" trong class detail hiển thị trùng module ("Unit 1" x2) và buổi học ("Family (Collocations)", "Family (Listening)" x2).
- Scout + đọc code xác nhận nguyên nhân: `apps/web/src/routes/_auth/classes/$classId.tsx:175-259` render cùng object `sy.modules` hai lần — `<SyllabusProgress />` (read-only, line 178) + editor tree (lines 206-258). PR #79/#80 (commit 5dd3acf) thêm editor mà không bỏ progress view cũ. Cùng một nguồn data (`['kernel']` query) — bug thuần render.
- Phát hiện phụ: helpers `dotClass`/`statusBadge` bị nhân bản giữa `syllabus-progress.tsx` và `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx:43-58`.

## Decision
- Gộp thành MỘT cây: editor giữ CRUD, thêm status dot + badge mỗi lesson row, `{done}/{total} buổi` mỗi module header; giữ summary + progress bar; xóa `SyllabusProgress` (chỉ dùng ở đây); extract shared helpers `lesson-status.tsx` (DRY với template page).
- Kongming (--advice, same-model counsel trên host ZCode) GO cho approach; không thêm collapse feature (out of scope). E2E chỉ cần update comment line 15 — counts an toàn vì tab render độc lập theo state `tab`.
- Mode Fast; HOLD SCOPE; 2 phase (UI merge + verification gates).

## Next steps
- Cook plan `plans/260826-1030-fix-class-detail-curriculum-duplicate-render` (issue #81, label `ready to review`).
- Sau implement: e2e `class-operations.spec.ts` phải pass nguyên vẹn, grep "SyllabusProgress" = 0.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
