---
title: Plan xóa syllabus template — hard-delete an toàn nhờ deep-copy
date: 2026-09-21
summary: "Lập kế hoạch xóa syllabus template (issue #211): hard-delete không cần migration vì bản copy của lớp độc lập runtime; 3 phases, validation 12/12 claims."
---

# Plan xóa syllabus template — hard-delete an toàn nhờ deep-copy

## What happened

Chạy `/ak:plan --github` cho yêu cầu "cho phép xóa syllabus, không ảnh hưởng lớp đã chọn, lớp mới không chọn được syllabus đã xóa".

- Scout phát hiện then chốt: khi lớp import template, server deep-copy toàn bộ cây (`buildImportBatch`, `apps/server/src/routes/kernel.ts:239-303`) và `class.syllabusId` trỏ vào bản copy — KHÔNG bao giờ trỏ vào template. Do đó hard-delete template an toàn tuyệt đối cho các lớp đã import; không cần soft-delete/migration.
- Hai bẫy dữ liệu được chốt xử lý trong 1 atomic `db.batch` org-scoped: (a) null các `class.syllabusId` trỏ thẳng template (real FK NO ACTION, legacy anomaly); (b) null `sourceTemplateId` của các bản copy — Drizzle khai báo `ON DELETE SET NULL` nhưng đây là logical FK only (SQLite không ALTER TABLE ADD FK) nên KHÔNG tự set null ở DB thật.
- Planner tự chỉnh 3 điểm so với brief: số matrix test thực tế đã đến 14 (dùng 15/16); `ui/modal.tsx` render inline không portal → phải stopPropagation cả keydown quanh nút xóa trong card-link; `data-store-reducer.ts` là fixture-only không cần thêm case.

## Decision

- Hard delete thay vì soft delete: bản copy độc lập runtime nên soft-delete chỉ thêm migration + filter mà không mang lại giá trị cho yêu cầu.
- Endpoint `POST /api/syllabi/:id/remove` trả 404 cho bản copy của lớp (mirror guard import handler, che tồn tại); bản copy chỉ xóa qua remove-curriculum phía lớp.
- Nút xóa chỉ đặt ở trang list `/syllabus` (HOLD SCOPE), không thêm ở trang detail.

## Next steps

- Plan: `plans/260921-0347-syllabus-template-delete/plan.md` (3 phases, ~5h), GitHub issue #211 (label `ready to review`).
- Validation gate: 12/12 claims verified, consistency sweep sạch, `ak plan validate` exit 0.
- Triển khai qua `/ak:cook plans/260921-0347-syllabus-template-delete/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
