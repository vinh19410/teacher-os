# Plan #655 — Pick tài liệu từ ngân hàng/upload ngay khi tạo buổi học

Issue: https://github.com/vinh19410/teacher-os/issues/655
Brief đã confirm (ak-atoz gate 1): Objective / Done means / Out of scope / Constraints — xem body issue.

## Kiến trúc

- Bảng mới `syllabus_lesson_material` (packages/db/src/schema/material.ts):
  `orgId` (FK organization, cascade) · `syllabusLessonId` (FK syllabus_lesson, cascade) ·
  `materialId` (FK material, **NO ACTION** — chặn xoá tài liệu đang dùng) · `position` ·
  `createdAt`; PK `(syllabusLessonId, materialId)`; index `materialId`, `orgId`.
- Migration `0068_*.sql` qua `pnpm --filter db db:generate` (tiền lệ 0066_class_materials).
- Contracts (packages/api):
  - `lessonUpsertSchema` + `addManualSessionSchema` thêm optional
    `materialIds: z.array(z.string().min(1)).max(20)`.
  - View lesson (syllabus tree) thêm `bankMaterials: MaterialRef[]`
    (`{id,title,kind,url?,mimeType?,originalName?}` — KHÔNG có objectKey/createdBy).
    Tên field `bankMaterials` để tránh đụng `materials` (text tự do, giữ nguyên).
- Server (apps/server):
  - `syllabus-content-routes.ts` create/update lesson: validate ids org-scoped, replace-all
    links trong cùng batch (delete + insert theo position index).
  - `kernel.ts` `POST /classes/:id/sessions`: nhận `materialIds`, validate, insert
    `lesson_material` cùng batch với `class_session` + `lesson`.
  - `buildImportBatch` (lib/syllabus-curriculum.ts): nhận thêm links của template,
    copy với remap lessonId (map `lessonIds` có sẵn), giữ materialId.
  - `selectTemplateTree`: đọc thêm links. `syllabus.ts` tree view: trả `bankMaterials`.
  - Delete guard `materials.ts`: usage count = `lesson_material` + `syllabus_lesson_material`;
    message 409 nêu cả hai số.
  - Helper dùng chung `resolveCurriculumMaterials(classId, dateISO)` (lib mới): buổi N ↔ bài N
    **cùng mapping function với topic hiện hành** (tái dùng, không viết mapping mới); hợp với
    `lesson_material`, dedupe theo materialId (ưu tiên direct).
- Web (apps/web):
  - Tách `MaterialPicker` từ `session-materials-modal.tsx` thành
    `components/materials/material-picker.tsx` (controlled multi-select + upload vào ngân hàng
    thư mục gốc); `SessionMaterialsModal` refactor dùng component chung (test cũ phải còn xanh).
  - Nhúng mục "Tài liệu" vào `AddClassSessionModal`, `AddLessonModal`, `EditLessonModal`
    (preload `bankMaterials` khi edit; submit gửi `materialIds`).
  - Trang syllabus: chip đếm tài liệu ngân hàng ở dòng bài học.
  - repos/materials.ts: type + hàm client mới.
- Student: `/api/student` materials của buổi = hợp (qua helper P2); UI student hiển thị
  như tài liệu thường, không lộ field teacher-only.

## Đường nhánh (fan-out, file ownership rời nhau)

| Piece | Owns | Depends |
|---|---|---|
| P1 foundation | packages/db (schema + migration), packages/api contracts | — |
| P2 server | apps/server (routes + lib resolve + import copy) | P1 |
| P3 web | apps/web (picker, 3 modal, syllabus chips, repos) | P1 (type) |
| P4 student | apps/server/src/routes/student-materials.ts + apps/student UI | P2 helper |
| P5 e2e + ảnh | apps/e2e spec mới + plans/reports ảnh | P2+P3 |

Review độc lập bắt buộc ở sub-session mới trước khi PR (playbook REVIEW.md + DESIGN.md).

## Verification

`pnpm check` · `pnpm check-types` · test server/web/student liên quan · e2e spec luồng chính
(port override 8100/8101/8103/8104/8105) · `pnpm design:compare` · ảnh 3 viewport vào POT.
