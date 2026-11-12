# Nguồn truy vết — feature `syllabus`

Repo: `/root/projects/teacher-os`, working tree `develop` @ `d6c0f6b5`. Encoding: toàn bộ nguồn UTF-8, đọc OK (không file nào lỗi encoding).

| ID | Path (repo-relative) | Phạm vi dòng | Loại | Confidence | Encoding OK? | Phần feature |
|----|----------------------|--------------|------|------------|--------------|--------------|
| S1 | apps/server/src/routes/syllabus.ts | 1-781 | route server (template + import/remove curriculum) | ✅ | OK | Nghiệp vụ chính |
| S2 | apps/server/src/routes/syllabus-content-routes.ts | 1-548 | route server (module/lesson CRUD, #655) | ✅ | OK | Nghiệp vụ chính |
| S3 | apps/server/src/lib/syllabus-curriculum.ts | 1-290 | lib (deep-copy, pointer, tree, material ids) | ✅ | OK | Nghiệp vụ chính |
| S4 | packages/db/src/schema/syllabus.ts | 1-110 | schema DB | ✅ | OK | Nghiệp vụ chính |
| S5 | packages/db/src/schema/material.ts | 130-165 | schema DB (syllabus_lesson_material) | ✅ | OK | Nghiệp vụ chính |
| S6 | packages/api/src/contracts.ts | 140-314 (đoạn syllabus) | contract zod + hằng số | ✅ | OK | Nghiệp vụ chính |
| S7 | apps/web/src/routes/_auth/syllabus/index.tsx | 1-151 | UI web (danh sách) | ✅ | OK | Nghiệp vụ chính |
| S8 | apps/web/src/routes/_auth/syllabus/$syllabusId.tsx | 1-473 | UI web (chi tiết template editor) | ✅ | OK | Nghiệp vụ chính |
| S9 | apps/web/src/lib/syllabus-import.ts | 1-311 | lib client (parse Excel/CSV v4) | ✅ | OK | Nghiệp vụ chính |
| S10 | apps/web/src/lib/repos/syllabus.ts | 1-117 | read repo (map + split template/copy) | ✅ | OK | Nghiệp vụ chính |
| S11 | apps/web/src/lib/repos/use-syllabus.ts | 1-88 | read hooks | ✅ | OK | Nghiệp vụ chính |
| S12 | apps/web/src/lib/repos/kernel.ts | 83-105, 211-260, 510-513 | command bus (path mapping) | ✅ | OK | Hạ tầng |
| S13 | apps/web/src/lib/data-actions.ts | 1-345 | kiểu action client | ✅ | OK | Hạ tầng |
| S14 | apps/web/src/components/modals/add-syllabus-modal.tsx | 1-272 | UI modal tạo template | ✅ | OK | Nghiệp vụ chính |
| S15 | apps/web/src/components/modals/import-syllabus-modal.tsx | 1-148 | UI modal nhập vào lớp (catalog lỗi) | ✅ | OK | Nghiệp vụ chính |
| S16 | apps/web/src/components/syllabus/delete-syllabus-button.tsx | 1-78 | UI nút xóa template | ✅ | OK | Nghiệp vụ chính |
| S17 | apps/web/src/components/syllabus/template-picker.tsx | 1-106 | UI chọn template (D8) | ✅ | OK | Nghiệp vụ chính |
| S18 | apps/web/src/components/syllabus/syllabus-mutations.tsx | 1-196 | UI reorder + confirm xóa | ✅ | OK | Nghiệp vụ chính |
| S19 | apps/web/src/components/syllabus/import-preview.tsx | 1-~130 | UI preview import | ✅ | OK | Nghiệp vụ chính |
| S20 | apps/web/src/components/syllabus/lesson-kind.tsx | 1-38 | UI badge Loại buổi (#154) | ✅ | OK | Nghiệp vụ chính |
| S21 | apps/web/src/components/syllabus/lesson-status.tsx | 1-26 | UI badge trạng thái | ✅ | OK | Nghiệp vụ chính |
| S22 | apps/web/src/components/syllabus/lesson-bank-materials-badge.tsx | 1-17 | UI badge đếm tài liệu | ✅ | OK | Nghiệp vụ chính |
| S23 | apps/web/src/components/modals/add-lesson-modal.tsx | 17-69 (đoạn kind/status) | UI modal thêm buổi | ✅ | OK | Nghiệp vụ chính |
| S24 | apps/web/src/components/class-detail/curriculum-management-section.tsx | 1-121 | UI tab Giáo trình của lớp (điểm chạm) | ✅ | OK | Điểm chạm classes |
| S25 | apps/server/src/routes/kernel.ts | 1641-1715, 2425-2433, 2651-2660, 3492 | route kernel (tạo lớp kèm template, guard buổi, mount) | ✅ | OK | Điểm chạm classes |
| S26 | apps/server/src/routes/snapshot.ts | 314-326, 450-473, 591-625 | read-side snapshot | ✅ | OK | Hạ tầng |
| S27 | apps/server/src/lib/class-mode.ts | 1-36 | lib (isManualClass) | ✅ | OK | Điểm chạm classes |
| S28 | apps/server/src/lib/session-curriculum-materials.ts | 1-175 | lib (buổi N ↔ bài N, #655) | ✅ | OK | Điểm chạm classes |
| S29 | apps/server/src/routes/enrollment-activation.ts | 281-290 | lib backfill học viên | ✅ | OK | Điểm chạm enrollment |
| S30 | apps/server/src/routes/holidays.ts | 445-448 | helper isRollbackableConstraintError | ✅ | OK | Hạ tầng |
| S31 | packages/db/src/migrations/0001_opposite_loki.sql | 8, 17, 66-104 | migration (bảng gốc + FK class.syllabus_id) | ✅ | OK | Nghiệp vụ chính |
| S32 | packages/db/src/migrations/0009_syllabus_template_discriminator.sql | 1-41 | migration (#79 template/copy) | ✅ | OK | Nghiệp vụ chính |
| S33 | packages/db/src/migrations/0008_syllabus_type_skills.sql | 1-7 | migration (type + skills) | ✅ | OK | Nghiệp vụ chính |
| S34 | packages/db/src/migrations/0014_chunky_marvel_boy.sql | 1 | migration (cột kind, #154) | ✅ | OK | Nghiệp vụ chính |
| S35 | packages/db/src/migrations/0068_salty_impossible_man.sql | 1-14 | migration (bảng syllabus_lesson_material, #655) | ✅ | OK | Nghiệp vụ chính |
| S36 | apps/e2e/specs/syllabus-excel-csv-import.spec.ts | 1-186 | e2e (import CSV/XLSX, legacy, giữ state) | ✅ active | OK | Kiểm chứng |
| S37 | apps/e2e/specs/syllabus-class-curriculum.spec.ts | 1-~380 | e2e (#394 tạo lớp kèm template, gán sau, 409) | ✅ active | OK | Kiểm chứng |
| S38 | apps/e2e/specs/syllabus-delete-reorder.spec.ts | 1-125 | e2e (reorder + xóa module) | ✅ active | OK | Kiểm chứng |
| S39 | apps/e2e/specs/syllabus-detail-import-overwrite.spec.ts | 1-147 | e2e (ghi đè, copy không có nút ghi đè) | ✅ active | OK | Kiểm chứng |
| S40 | apps/e2e/specs/syllabus-test-session-mark.spec.ts | 1-213 | e2e (buổi thi #154, guard kind từ lớp) | ✅ active | OK | Kiểm chứng |
| S41 | apps/server/src/syllabus-material-links.test.ts | 1-642 | unit server (#655 7 test) | ✅ active | OK | Kiểm chứng |
| S42 | apps/server/src/manual-sessions.test.ts | 109-1450+ | unit server (#649, #670 — test 670-1..670-6) | ✅ active | OK | Kiểm chứng |
| S43 | apps/server/src/syllabus-template-migration.test.ts | 126-360 | unit migration 0009 | ✅ active | OK | Kiểm chứng |
| S44 | apps/server/src/syllabus-pointer-reconcile-migration.test.ts | 122-123 | unit migration 0042 | ✅ active | OK | Kiểm chứng |
| S45 | apps/web/src/lib/syllabus-import.test.ts | 1-733 | unit parser (28 test) | ✅ active | OK | Kiểm chứng |
| S46 | apps/web/src/lib/repos/syllabus.test.ts | 73-190 | unit map/split | ✅ active | OK | Kiểm chứng |
| S47 | apps/web/src/routes/_auth/syllabus/index.test.tsx | 62-171 | unit UI danh sách | ✅ active | OK | Kiểm chứng |
| S48 | apps/web/src/routes/_auth/syllabus/$syllabusId.test.tsx | 81-187 | unit UI chi tiết | ✅ active | OK | Kiểm chứng |
| S49 | apps/web/src/components/syllabus/template-picker.test.tsx | 75-121 | unit TemplatePicker | ✅ active | OK | Kiểm chứng |
| S50 | apps/web/src/components/modals/syllabus-content-modals.test.tsx | 108-411 | unit modals nội dung | ✅ active | OK | Kiểm chứng |
| S51 | apps/web/src/components/modals/import-syllabus-modal.test.tsx | 42-168 | unit modal nhập (map lỗi #670) | ✅ active | OK | Kiểm chứng |
| S52 | apps/web/src/lib/use-direct-kernel-action.ts | 1-58 | client busy-guard / outcome-unknown | ✅ | OK | Hạ tầng |

Ghi chú: không dùng test nào ở trạng thái `.skip`/`.todo`/`.only` (đã grep toàn bộ file test syllabus — xem `_evidence.md` §7.4). Số test nêu trên là số lệnh `test(`/`it(` đếm bằng grep.
