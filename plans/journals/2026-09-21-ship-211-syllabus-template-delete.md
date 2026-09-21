---
title: Ship #211 — xóa syllabus template (beta develop)
date: 2026-09-21
summary: "Endpoint POST /api/syllabi/:id/remove hard-delete org-scoped + nút Xóa confirm modal trên /syllabus; deep-copy #79 giữ bản copy lớp nguyên vẹn; review fix keydown Escape/Tab"
---

# Ship #211 — xóa syllabus template (beta develop)

## What happened
- Issue #211 (plan `plans/260921-0347-syllabus-template-delete/`) ship beta qua vibe pipeline: reuse plan đã validate, cook 2 phase, review, PR vào `develop`.
- Phase 1 (server): `deleteSyllabusSchema` (contracts) + `POST /api/syllabi/:id/remove` cuối nhóm route syllabi trong kernel.ts — guard `kernelCtx`/`readBody`, `findSyllabus` org-scoped, 404 khi row là bản copy của lớp (`classId !== null`, mirror guard import handler), 1 atomic `db.batch` 5 statement mọi statement org-scoped: null `class.syllabusId` trỏ thẳng (anomaly legacy) → null `sourceTemplateId` của các copy (logical FK only, SQLite không có FK thật) → delete lessons (subquery modules) → delete modules → delete syllabus.
- Phase 2 (web): action `delete-syllabus` trong `KernelAction` + case mapping body `{}` (CSRF-safe `.strict()`); component `DeleteSyllabusButton` (danger + confirm modal 2 vế semantics: lớp đã dùng KHÔNG bị ảnh hưởng / lớp mới không chọn được / không hoàn tác); tích hợp footer card `/syllabus`.
- Phase 3: `pnpm --filter server test` 245 pass (4 mới: matrix 15/16, anomaly, org-scoping), `pnpm --filter web test` 642 pass (mapping test mới), `pnpm test` + `pnpm check-types` + `pnpm check` xanh toàn repo.
- Fix kèm: bỏ import `fmtDate` unused ở `class-assignments-tab.tsx` (breakage `pnpm check` còn sót từ #208).

## Decision
- Hard-delete, không soft-delete/migration: kiến trúc deep-copy (`buildImportBatch`, #79) khiến `class.syllabusId` luôn trỏ bản copy riêng của lớp — template xóa được an toàn tuyệt đối; `sourceTemplateId` detach null trong batch để tránh mồ côi provenance (badge "Đang dùng" join theo cột này).
- Review finding (Important, đã fix): wrapper quanh nút xóa stopPropagation VÔ ĐIỀU KIỆN trên keydown sẽ chặn Escape (close) và Tab (focus trap) tới document listener của Modal — sửa thành chỉ chặn Space/Enter, đúng convention `session-attendance-modal` / `class-schedule-table`.
- Không bump version/changelog: convention repo chỉ bump ở commit release.

## Next steps
- PR vào `develop` (beta stage); sau merge theo dõi CI develop.
- Stable stage (develop → main) thuộc chu kỳ release riêng.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
