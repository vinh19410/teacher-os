---
feature: materials
type: reverse-source-map
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# reverse-sources — materials

Bảng tài nguyên S. Range kiểm bằng đếm dòng thực tế (awk END NR), không dùng wc -l
trực tiếp (file có ký tự đa byte).

| S-id | Path | Loại | Range | Confidence | Encoding | Ghi chú |
|---|---|---|---|---|---|---|
| S1 | apps/server/src/routes/materials.ts | server code | 1-1389 | ✅ | ts | 14 endpoint (folders CRUD, materials CRUD, file serve, session materials 4 đường) + gate RBAC + guard nghỉ-lễ |
| S2 | packages/db/src/schema/material.ts | db schema | 1-164 | ✅ | ts | 4 bảng: material_folder, material, lesson_material, syllabus_lesson_material + CHECK kind_shape |
| S3 | apps/web/src/routes/_auth/materials/index.tsx | client route | 1-665 | ✅ | tsx | trang Tài liệu: URL filters, debounce 300ms, FolderPanel, 5 dialog mount |
| S4 | packages/api/src/material-contracts.ts | api contract | 1-510 | ✅ | ts | Zod strict + MATERIAL_MIME (10 loại) + matchesMaterialMagic + MATERIAL_ERROR_CODES (16 mã) |
| S5 | apps/web/src/lib/repos/materials.ts | client lib | 1-490 | ✅ | ts | fetch/mutation + MaterialRequestError + materialErrorMessage (mỗi mã 1 câu) + prepareMaterialUpload + useCanWriteMaterials |
| S6 | apps/web/src/components/materials/material-dialogs.tsx | client component | 1-574 | ✅ | tsx | FolderDialog (create/rename/move), LinkDialog, UploadDialog, EditMaterialDialog, DeleteDialog + useMaterialWrite |
| S7 | apps/web/src/components/materials/material-item.tsx | client component | 1-156 | ✅ | tsx | MaterialItem + MaterialOpenActions (Mở/Phát/Tải xuống) + materialMeta |
| S8 | apps/web/src/components/materials/material-picker.tsx | client component | 1-363 | ✅ | tsx | MaterialBankBrowser + MaterialPicker (chips, cap 20, upload về gốc) — dùng chung #655 |
| S9 | apps/web/src/components/materials/folder-select.tsx | client component | 1-55 | ✅ | tsx | Select cây thụt lề, exclude subtree khi di chuyển |
| S10 | apps/web/src/lib/material-folders.ts | client lib | 1-105 | ✅ | ts | flattenFolderTree (chống vòng), folderSubtreeIds, folderPath |
| S11 | apps/server/src/lib/material-file-response.ts | server lib | 1-112 | ✅ | ts | Range 206/416, STRICT_CSP, INLINE_MEDIA_CSP, disposition inline/attachment |
| S12 | apps/server/src/lib/media-store.ts | server lib | 1-74 | ✅ | ts | interface MediaStore + enforceDeclaredSize + MediaSizeMismatchError |
| S13 | apps/server/src/lib/r2-media-store.ts | server lib | 1-48 | ✅ | ts | adapter R2: FixedLengthStream, get range, delete |
| S14 | apps/server/src/lib/peek-stream.ts | server lib | 1-149 | ✅ | ts | peekStream 64 byte đầu, thuần Web Streams, backpressure |
| S15 | apps/server/src/lib/session-curriculum-materials.ts | server lib | 1-174 | ✅ | ts | resolveCurriculumMaterials: buổi N ↔ bài N theo index lịch hiện hành |
| S16 | apps/server/src/routes/student-materials.ts | server code | 1-222 | ✅ | ts | 2 GET học viên: guard enrollment active + projection an toàn + file qua giáo trình |
| S17 | packages/auth/src/role.ts | auth lib | 1-177 | ✅ | ts | MATERIAL_WRITE_ROLES / MATERIAL_READ_ROLES (+ta), canWrite/canRead #646 |
| S18 | apps/server/src/routes/kernel.ts | server code | 1-3523 | ✅ | ts | mount `kernel.route("/", materialRoutes(deps))` :3494 (sau middleware CSRF :185-206) |
| S19 | apps/server/src/app.ts | server code | 1-481 | ✅ | ts | deps getMaterialsStore + runInBackground; mount `app.route("/api/student", studentMaterialRoutes(deps))` :446 |
| S20 | apps/server/src/index.ts | server code | 1-177 | ✅ | ts | getMaterialsStore: binding MATERIALS → createR2MediaStore (:125-129) |
| S21 | packages/infra/alchemy.run.ts | infra | 1-428 | ✅ | ts | bucket R2 `materials` (:195-196), bind MATERIALS (:209) |
| S22 | packages/db/src/migrations/0066_class_materials.sql | migration | 1-54 | ✅ | sql | tạo lesson_material + material + material_folder + index + CHECK (hand-edited comment :1-4) |
| S23 | packages/db/src/migrations/0068_salty_impossible_man.sql | migration | 1-14 | ✅ | sql | tạo syllabus_lesson_material + 2 index |
| S24 | apps/server/src/routes/materials.test.ts | test | 1-2590 | ✅ | ts | 35 test (2 describe + 2 describe con #645/#662): gate, folder, upload, holiday, student, magic #676, #655 |
| S25 | apps/web/src/routes/_auth/materials/index.test.tsx | test | 1-449 | ✅ | tsx | 15 it: URL filters, debounce, đếm, chặn trước upload, câu lỗi, ta chỉ-đọc, thư mục vòng #646 |
| S26 | packages/api/src/material-contracts.test.ts | test | 1-466 | ✅ | ts | 15 test hợp đồng thuần (schema, MIME, magic, URL) |
| S27 | apps/server/src/lib/material-file-response.test.ts | test | 1-184 | ✅ | ts | 5 test phục vụ file |
| S28 | apps/server/src/lib/session-curriculum-materials.test.ts | test | 1-417 | ✅ | ts | 9 test mapping buổi N ↔ bài N |
| S29 | apps/web/src/components/class-detail/session-materials-modal.tsx | client component | 1-283 | ✅ | tsx | modal buổi học: list/pick, attach/detach/upload mutations, curriculum read-only |
| S30 | apps/web/src/components/materials/material-picker.test.tsx | test | 1-204 | ✅ | tsx | 5 test picker |
| S31 | apps/web/src/components/class-detail/session-materials-modal.test.tsx | test | 1-217 | ✅ | tsx | 5 test modal buổi |
| S32 | apps/student/src/components/class/lesson-materials.tsx | client component | 1-221 | ✅ | tsx | UI học viên đọc-only (+test :1-171, 7 test) — boundary feature học viên |
| S33 | apps/web/src/components/layout/sidebar.tsx | client component | 1-214 | ✅ | tsx | mục "Tài liệu" nhóm "Giảng dạy" :72-78; active-key :197 |
| S34 | apps/web/src/routes-matcher.ts | client lib | 1-154 | ✅ | ts | "/materials": true :35 (service worker allowlist) |
| S35 | apps/server/src/routes/snapshot.ts | server code | 1-873 | ✅ | ts | bản chụp kernel đọc links giáo trình :451-477 (thuộc feature Syllabus — boundary) |
| S36 | apps/e2e/specs/material-bank.spec.ts | e2e | 1-121 | ✅ | ts | 1 test vòng đời: thư mục → liên kết → gắn buổi → gỡ → xóa |
| S37 | apps/e2e/specs/materials-at-session-create.spec.ts | e2e | 1-150 | ✅ | ts | 2 test tạo buổi kèm tài liệu (manual + template) |
| S38 | apps/e2e/specs/material-upload-student.spec.ts | e2e | 1-600 | ✅ | ts | 1 test #647: upload thật + CORS + Phát media + học viên đa-org |
| S39 | apps/e2e/specs/655-screenshots.spec.ts | e2e | 1-151 | ✅ | ts | 1 test bộ ảnh 3 viewport pick tài liệu |
| S40 | .github/workflows/audit-663.yml | ci workflow | 1-46 | ✅ | yml | audit mồ côi workflow_dispatch read-only |
| S41 | packages/db/src/audit/orphan-materials.ts | tooling | 1-745 | ✅ | ts | script đếm liên kết mồ côi (#663) — vận hành, không thuộc runtime |
| S42 | apps/server/src/routes/syllabus-content-routes.ts | server code | 1-547 | ✅ | ts | boundary: ghi syllabus_lesson_material từ feature Syllabus |
| S43 | packages/api/src/contracts.ts | api contract | 1-4799 | ✅ | ts | boundary: MATERIAL_LINKS_MAX = 20 + materialIds schema (:256,271,1764) |

Nguồn kế hoạch (plan reverse) chỉ liệt kê S1-S3; S4-S43 phát hiện khi điều tra
(grep "material" toàn repo apps/server, apps/web, packages) và đều được đọc trực
tiếp để xác nhận liên quan thật.
