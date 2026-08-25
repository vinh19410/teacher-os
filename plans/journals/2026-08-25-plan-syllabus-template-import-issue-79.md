# 2026-08-25 — Plan: syllabus template import per-class curriculum (issue #79)

## What
Lập plan refactor syllabus → template dùng chung (`class_id` discriminator) + class import deep copy + per-class curriculum editing. Mode deep, flags `--github --advice`. 6 phases: DB schema/migration 0009 (structural + idempotent backfill, land 1 commit), API import/remove/templateId, web data layer, web UI template gallery + class editor, acceptance.

## Decisions
- Copy-on-import thuần (Moodle/Classroom), KHÔNG reference+override (Canvas Blueprint over-engineered cho solo teacher). Không sync/re-import v1.
- Same-table discriminator `class_id NULL = template` + unique index — tái dùng toàn bộ CRUD route.
- Runtime import reset status `upcoming`; backfill preserve status class cũ + reset template gốc.
- Validation user: Gỡ = xóa cây copy; xoá nút "Đổi syllabus" (không replace v1).

## Process
- Scout (domain inventory) + researcher (external patterns, 18 nguồn) → planner → 4 hostile reviewers (15 findings, tất cả accepted) → validation interview 3 câu → consistency sweeps (0 unresolved).
- Kongming `--advice` miss: codex proxy 502 — ghi nhận trong plan, red-team bù.
- Red-team bắt được các lỗi thật: db:migrate:deploy bất khả thi (d1-http), bẫy alchemy ledger-skip 2-phase migration (chính là sự cố 0008 sáng nay), response `{syllabusId}` bị transport drop, FK order remove-curriculum, backfill thiếu org-join.

## Artifacts
- Plan: `plans/260825-1915-syllabus-template-import-per-class-curriculum/`
- Issue: https://github.com/vinh19410/teacher-os/issues/79 (label `ready to review`)
- Next: `/ak:cook plans/260825-1915-syllabus-template-import-per-class-curriculum/plan.md`
