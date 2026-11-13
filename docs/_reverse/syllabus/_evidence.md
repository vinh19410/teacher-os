# Bằng chứng chi tiết — feature `syllabus`

Mọi dòng cite theo working tree `develop` @ `d6c0f6b5`. Path repo-relative đầy đủ.

## §1 Endpoints (chỉ liệt kê ở mức Nguồn — không sinh api-reference)

| # | Method + Path | Nguồn (path:line) | Ghi chú nghiệp vụ |
|---|---------------|-------------------|-------------------|
| 1 | POST `/api/syllabus-templates` | apps/server/src/routes/syllabus.ts:736 (đăng ký), :142-196 (handler) | Tạo template (+modules bulk), 201 `{id}` |
| 2 | POST `/api/syllabus-templates/:id/replace-content` | apps/server/src/routes/syllabus.ts:738-740, :201-277 | Replace toàn cây, 200 `{ok}` |
| 3 | POST `/api/syllabus-templates/:id/remove` | apps/server/src/routes/syllabus.ts:741-743, :283-339 | Xóa template, 200 `{ok}` |
| 4 | POST `/api/classes/:id/curriculum/import` | apps/server/src/routes/syllabus.ts:744-746, :341-622 | Copy vào lớp, 201 `{id}` |
| 5 | POST `/api/classes/:id/curriculum/remove` | apps/server/src/routes/syllabus.ts:747-749, :624-718 | Gỡ giáo trình, 200 `{ok}` |
| 6 | POST `{base}/modules` | apps/server/src/routes/syllabus-content-routes.ts:117-150 | base = `/syllabus-templates/:id` HOẶC `/classes/:id/curriculum` (mount 2 lần: apps/server/src/routes/syllabus.ts:754-777) |
| 7 | POST `{base}/modules/reorder` | apps/server/src/routes/syllabus-content-routes.ts:152-205 | |
| 8 | POST `{base}/modules/:mid` | apps/server/src/routes/syllabus-content-routes.ts:207-232 | |
| 9 | POST `{base}/modules/:mid/remove` | apps/server/src/routes/syllabus-content-routes.ts:234-280 | |
| 10 | POST `{base}/modules/:mid/lessons` | apps/server/src/routes/syllabus-content-routes.ts:282-357 | |
| 11 | POST `{base}/modules/:mid/lessons/reorder` | apps/server/src/routes/syllabus-content-routes.ts:359-416 | |
| 12 | POST `{base}/modules/:mid/lessons/:lid` | apps/server/src/routes/syllabus-content-routes.ts:418-506 | |
| 13 | POST `{base}/modules/:mid/lessons/:lid/remove` | apps/server/src/routes/syllabus-content-routes.ts:508-546 | |
| 14 | POST `/api/classes` (điểm chạm: tạo lớp kèm `templateId`) | apps/server/src/routes/kernel.ts:1641-1715 | Copy trong cùng batch, lớp insert CUỐI (:1676-1678) |
| 15 | POST/DELETE `/api/classes/:id/sessions*` (điểm chạm guard) | apps/server/src/routes/kernel.ts:2425-2433, :2651-2660 | 409 class-has-syllabus |
| 16 | GET snapshot (đọc: `syllabi` kèm `bankMaterials`) | apps/server/src/routes/snapshot.ts:314-326, :450-473, :591-625 | projection teacher-safe |
| 17 | Mount vị trí: `kernel.route("/", syllabusRoutes(deps))` | apps/server/src/routes/kernel.ts:3492 | CSRF Origin guard phủ (apps/server/src/routes/syllabus.ts:43-47) |

Client path mapping: apps/web/src/lib/repos/kernel.ts:83-105 (`add-syllabus`, `import-curriculum`, `remove-curriculum`), :211-260 (content + replace + delete-syllabus), :510-513 (`curriculumBase`).

## §2 Validation (schema zod + client-side)

| Luật | Nguồn (path:line) | Trích nguyên văn |
|------|-------------------|------------------|
| importSyllabusSchema: `templateId` min 1 | packages/api/src/contracts.ts:157-160 | `templateId: z.string().min(1)` |
| removeCurriculumSchema / deleteSyllabusSchema: object rỗng strict | packages/api/src/contracts.ts:163, :167 | `z.object({}).strict()` |
| Module content: title 1..500, description ≤10.000, lessons default [] | packages/api/src/contracts.ts:185-201 | `title: z.string().min(1).max(500)` |
| Lesson content: kind enum `["lesson","midterm","final"]` default lesson; status enum default upcoming | packages/api/src/contracts.ts:196-197 | `kind: z.enum(["lesson", "midterm", "final"]).default("lesson")` |
| Create: name min 1; type default ielts; skills mảng enum IELTS, không trùng, default [] | packages/api/src/contracts.ts:204-217 | `skills: z.array(z.enum(IELTS_SKILLS))...refine((skills) => new Set(skills).size === skills.length)` |
| Create cap 500 nodes (superRefine) | packages/api/src/contracts.ts:218-230 | `if (nodes > 500) { ... message: "Tổng số module và buổi học vượt giới hạn 500" }` |
| IELTS cần skill / Giao tiếp không skill | packages/api/src/contracts.ts:231-244 | `"Syllabus IELTS cần ít nhất một kỹ năng"` / `"Syllabus Giao tiếp không chọn kỹ năng"` |
| lessonUpsertSchema: materialIds ≤ 20, optional | packages/api/src/contracts.ts:258-272 | `materialIds: z.array(z.string().min(1)).max(MATERIAL_LINKS_MAX).optional()` |
| MATERIAL_LINKS_MAX = 20 (nguồn chung server+picker) | packages/api/src/contracts.ts:254-256 | `export const MATERIAL_LINKS_MAX = 20;` |
| Reorder: mảng id min 1 max 500, strict | packages/api/src/contracts.ts:280-292 | `moduleIds: z.array(z.string().min(1)).min(1).max(500)` |
| Replace-content: modules min 1 + cap 500 + strict | packages/api/src/contracts.ts:294-311 | `modules: z.array(syllabusModuleContentSchema).min(1)` |
| Client mirror giới hạn ở parser | apps/web/src/lib/syllabus-import.ts:14-18 | `const MODULE_TITLE_MAX = 500; const FIELD_TEXT_MAX = 10_000;` |
| Client cap file: 2 MB + chỉ csv/xlsx | apps/web/src/lib/syllabus-import.ts:13, :233-237 | `if (file.size > IMPORT_FILE_MAX_BYTES) ... "File vượt giới hạn 2 MB."` |
| Server cap node import | apps/server/src/lib/syllabus-curriculum.ts:118-119 | `export const MAX_IMPORT_NODES = 500;` |
| Body limit 2 MiB (413) | apps/server/src/routes/syllabus.ts:730-735 | `bodyLimit({ maxSize: 2 * 1024 * 1024, onError: ... "Dữ liệu syllabus vượt giới hạn 2 MiB." })` |
| Module id client không tin — phải thuộc syllabus + org | apps/server/src/lib/syllabus-curriculum.ts:88-106 | comment `findModule` + WHERE 3 điều kiện |
| Dedupe materialIds giữ thứ tự | apps/server/src/routes/syllabus-content-routes.ts:73 | `const ids = [...new Set(materialIds ?? [])];` |

## §3 Errors (throw-site + catalog — R2: quote cả hai)

Mã lỗi khóa `CURRICULUM_*` / `MANUAL_SESSIONS_EXIST` / `class-has-syllabus`:

- **CURRICULUM_ALREADY_EXISTS (409)** — throw-site #1 (heal FK race): apps/server/src/routes/syllabus.ts:417-423 — nguyên văn:
  ```json
  { "error": "Lớp đã có giáo trình", "code": "CURRICULUM_ALREADY_EXISTS" }
  ```
  throw-site #2 (nhánh existing thường): apps/server/src/routes/syllabus.ts:437-443 (cùng object); throw-site #3 (post-batch re-check): :568-575; throw-site #4 (foreign copy khác org): :581-589. Catalog hiển thị: apps/web/src/components/modals/import-syllabus-modal.tsx:23-24 — nguyên văn: `case "CURRICULUM_ALREADY_EXISTS": return "Lớp đã có giáo trình.";`
- **CURRICULUM_TEMPLATE_TOO_LARGE (422)** — throw-site: apps/server/src/routes/syllabus.ts:451-457 — nguyên văn: `{ "error": "Template quá lớn để import", "code": "CURRICULUM_TEMPLATE_TOO_LARGE" }`. Catalog: apps/web/src/components/modals/import-syllabus-modal.tsx:21-22 — `return "Template quá lớn để import.";`
- **MANUAL_SESSIONS_EXIST (409, reason "has-manual-sessions")** — throw-site #1: apps/server/src/routes/syllabus.ts:477-487; #2 (race post-batch): :600-609 — nguyên văn:
  ```json
  { "error": "Lớp đã có buổi học thủ công. Vui lòng xóa các buổi chưa học trước khi nhập giáo trình.", "reason": "has-manual-sessions", "code": "MANUAL_SESSIONS_EXIST" }
  ```
  Catalog: apps/web/src/components/modals/import-syllabus-modal.tsx:15-16 — `case "MANUAL_SESSIONS_EXIST": return "Lớp đã có buổi học thủ công. Vui lòng xóa các buổi chưa học trước khi nhập giáo trình.";`
- **CURRICULUM_TOO_MANY_LESSONS (422, reason "too-many-lessons")** — throw-site: apps/server/src/routes/syllabus.ts:492-500 — nguyên văn: `{ "error": "Template vượt quá giới hạn 52 buổi học của lớp.", "reason": "too-many-lessons", "code": "CURRICULUM_TOO_MANY_LESSONS" }`. Catalog: apps/web/src/components/modals/import-syllabus-modal.tsx:19-20.
- **CURRICULUM_EMPTY_TEMPLATE (422, reason "empty-template")** — throw-site: apps/server/src/routes/syllabus.ts:502-516 — nguyên văn: `{ "error": "Template chưa có bài học nào. Vui lòng thêm ít nhất 1 bài học trước khi nhập vào lớp trống.", "reason": "empty-template", "code": "CURRICULUM_EMPTY_TEMPLATE" }`. Catalog: apps/web/src/components/modals/import-syllabus-modal.tsx:17-18.
- **CURRICULUM_MATERIAL_NOT_FOUND / `material-not-found` (422)** — throw-site validate: apps/server/src/routes/syllabus-content-routes.ts:76-86 (`{ error: "material-not-found", materialId: missing }` — id đầu tiên trong thứ tự gửi lên); throw-site FK-guard sau batch: apps/server/src/routes/syllabus-content-routes.ts:99-114; throw-site import: apps/server/src/routes/syllabus.ts:557-566 (`code: "CURRICULUM_MATERIAL_NOT_FOUND"`); throw-site buổi manual: apps/server/src/routes/kernel.ts:2502-2508. Catalog: apps/web/src/components/modals/import-syllabus-modal.tsx:25-26 — `return "Một số tài liệu gắn trong template không còn tồn tại trong ngân hàng tài liệu.";`
- **class-has-syllabus (409)** — add: apps/server/src/routes/kernel.ts:2426-2432 — nguyên văn: `{ "error": "cannot add manual session to class with syllabus", "reason": "class-has-syllabus" }`; delete: :2652-2658 — `"cannot delete session from class with syllabus"`. Không có catalog UI riêng (điểm chạm feature classes).
- **Batch-fail nội bộ** — apps/server/src/routes/syllabus.ts:611 — `throw new Error("import-syllabus batch failed");` (chỉ sau khi loại trừ hết các nguyên nhân nghiệp vụ).
- **Rollback-able heuristic** — apps/server/src/routes/holidays.ts:445-448 — nguyên văn: `return /UNIQUE|NOT NULL|FOREIGN KEY/i.test(message);` (dùng ở apps/server/src/routes/syllabus.ts:415, :545).

## §4 Rules + hằng số

| Hằng / luật | Giá trị | Nguồn (path:line) |
|-------------|---------|-------------------|
| MAX_IMPORT_NODES | 500 | apps/server/src/lib/syllabus-curriculum.ts:119 |
| IMPORT_MAX_NODES (client) | 500 | apps/web/src/lib/syllabus-import.ts:12 |
| IMPORT_FILE_MAX_BYTES | 2 × 1024 × 1024 | apps/web/src/lib/syllabus-import.ts:13 |
| Body limit server | 2 MiB → 413 | apps/server/src/routes/syllabus.ts:730-735 |
| Trần buổi import lớp trống | 52 | apps/server/src/routes/syllabus.ts:492-500 |
| MATERIAL_LINKS_MAX | 20 | packages/api/src/contracts.ts:256 |
| Reorder cap | 500 (min 1) | packages/api/src/contracts.ts:281-292; guard apps/server/src/routes/syllabus-content-routes.ts:176-178, :387-389 |
| Preview lỗi hiển thị | 100 lỗi đầu + gộp phần còn | apps/web/src/components/syllabus/import-preview.tsx:53-60 |
| Position module/buổi mới | max+1 (bắt đầu 0) | apps/server/src/routes/syllabus-content-routes.ts:130-148, :302-331 |
| Position links | 0..n-1 theo thứ tự gửi | apps/server/src/routes/syllabus-content-routes.ts:344-353 |
| Reset status khi copy | luôn "upcoming" | apps/server/src/lib/syllabus-curriculum.ts:184-198 |
| Copy createdAt | giữ `template.createdAt` (không phải now) | apps/server/src/lib/syllabus-curriculum.ts:169 |
| Orphan link bỏ qua khi copy | không nổ batch | apps/server/src/lib/syllabus-curriculum.ts:200-212 |
| Heal count hợp lệ khi heal | 1..52 | apps/server/src/routes/syllabus.ts:396 |
| Vocab status v2 (phát hiện file cũ) | "đã dạy, đang học, sắp tới, done, current, upcoming" | apps/web/src/lib/syllabus-import.ts:51-58 |
| Mapping Loại | ""/buổi học/lesson→lesson; giữa kỳ/midterm→midterm; cuối kỳ/final→final | apps/web/src/lib/syllabus-import.ts:61-67 |
| Kind lạ → normalize "lesson" (UI) | fallback | apps/web/src/lib/repos/syllabus.ts:25-32; apps/web/src/components/syllabus/lesson-kind.tsx:13-16 |
| Status lạ → style upcoming | fallback | apps/web/src/components/syllabus/lesson-status.tsx:14-16 |
| isManualClass | không copy VÀ (manual HOẶC đã có class_session) | apps/server/src/lib/class-mode.ts:17-36 |
| Buổi N ↔ bài N | sort distinct date, bỏ nhóm holiday | apps/server/src/lib/session-curriculum-materials.ts:53-75 |
| Số buổi import vào lớp | lessons>0 ? lessons : cls.sessionsTotal | apps/server/src/routes/syllabus.ts:518-519 |

## §5 Entities (schema thật)

- **syllabus** — packages/db/src/schema/syllabus.ts:12-51. Cột: id PK, org_id FK→organization cascade, name NOT NULL, level default "", type default "ielts", skills JSON string default "[]", description default "", total_lessons int default 0, created_at, **class_id text NULL** (phân biệt template/copy, unique partial `syllabus_class_unique` WHERE class_id IS NOT NULL — :47-49), **source_template_id** logical FK→syllabus.id ON DELETE set null (:36-43).
- **syllabus_module** — packages/db/src/schema/syllabus.ts:53-74: id PK, org_id cascade, syllabus_id FK→syllabus cascade NOT NULL, title NOT NULL, description default "", position int default 0, created_at; index org + syllabus.
- **syllabus_lesson** — packages/db/src/schema/syllabus.ts:80-109: id PK, org_id cascade, module_id FK→syllabus_module cascade NOT NULL, title NOT NULL, objectives default "", materials default "", kind default "lesson" (#154), status default "upcoming", position default 0, created_at; comment invariant 5 (:76-79).
- **syllabus_lesson_material** — packages/db/src/schema/material.ts:139-164: org_id cascade, syllabus_lesson_id FK→syllabus_lesson cascade NOT NULL, material_id FK→material **NO ACTION** NOT NULL, position default 0, created_at; PK kép (syllabus_lesson_id, material_id) (:156-160).
- **class** (điểm chạm) — packages/db/src/schema/class.ts:23 (`syllabusId` FK→syllabus, NO ACTION per migration 0001 opposite_loki.sql:17), :25 sessionsTotal, :30 schedulingMode default "auto".
- Migration liên quan: 0008 (type + skills JSON — packages/db/src/migrations/0008_syllabus_type_skills.sql:1-7), 0009 (discriminator + backfill copy — 0009_syllabus_template_discriminator.sql:1-41), 0014 (kind — 0014_chunky_marvel_boy.sql:1), 0042 (reconcile pointer — 0042_syllabus_class_pointer_reconcile.sql:5-12), 0068 (bảng links — 0068_salty_impossible_man.sql:1-14).

## §6 Cross-repo hops (biên giới feature)

1. **syllabus → classes (tạo lớp kèm template):** apps/server/src/routes/kernel.ts:1641-1715 — resolve template TRƯỚC khi ghi (:1649-1673), copy insert trước / class insert sau vì FK NO ACTION (:1676-1678), `schedulingMode` server suy ra `auto` khi có template (:1682-1687), pointer gán trong cùng batch (:1697).
2. **syllabus → classes (guard buổi thủ công):** apps/server/src/routes/kernel.ts:2425-2433 (add), :2651-2660 (delete); predicate `isManualClass` apps/server/src/lib/class-mode.ts:17-36 (copy tồn tại → KHÔNG bao giờ manual).
3. **syllabus → classes (tài liệu buổi dạy):** apps/server/src/lib/session-curriculum-materials.ts:124-174 — resolve bài theo index buổi, projection teacher-safe; gọi từ route sessions của classes.
4. **syllabus → enrollment (backfill):** apps/server/src/routes/syllabus.ts:88-133 — truy enrollment active kẹt (NOT EXISTS lesson + package 0/NULL), gọi `materializeScheduleForEnrollment` mode "backfill" (apps/server/src/routes/enrollment-activation.ts:281-290).
5. **syllabus → materials (links #655):** validate org-scoped apps/server/src/lib/syllabus-curriculum.ts:278-289; FK NO ACTION chặn xóa tài liệu đang gắn packages/db/src/schema/material.ts:148-150; snapshot chiếu `bankMaterials` apps/server/src/routes/snapshot.ts:450-473, :591-625.
6. **web → classes UI:** tab Giáo trình apps/web/src/components/class-detail/curriculum-management-section.tsx:28-120 — nhập/gỡ từ màn lớp, nội dung sửa buổi trên copy qua "Quản lý buổi" (comment :17-27).

## §7 Gaps — negative search

1. **Không có route cập nhật metadata template** — pattern: `grep -n "patch\\|\\.put(" apps/server/src/routes/syllabus.ts apps/server/src/routes/syllabus-content-routes.ts` → 0 kết quả; chỉ POST. Scope: 2 route file + kernel mount. Kết luận: sửa metadata template không tồn tại (Gap-1/OQ-2). 🟡
2. **Không có soft delete** — pattern: `grep -n "deleted\\|deleted_at\\|archived" packages/db/src/schema/syllabus.ts` → 0 kết quả. Scope: schema file. Kết luận: hard delete duy nhất. 🟡 (Gap-4)
3. **Không có test skip/todo/only** — pattern: `grep -rn "\\.skip\\|\\.todo\\|test\\.only\\|describe\\.only\\|it\\.only" apps/e2e/specs/syllabus-*.spec.ts apps/server/src/syllabus-*.test.ts apps/server/src/manual-sessions.test.ts apps/web/src/lib/syllabus-import.test.ts apps/web/src/lib/repos/syllabus.test.ts apps/web/src/routes/_auth/syllabus/*.test.tsx apps/web/src/components/syllabus/*.test.tsx apps/web/src/components/modals/import-syllabus-modal.test.tsx apps/web/src/components/modals/syllabus-content-modals.test.tsx` → 0 kết quả (exit 1). Kết luận: mọi test trích dẫn đều active (R1). ✅
4. **Không có route syllabus nào cho student portal** — pattern: `grep -rn "syllabus" apps/server/src/routes/student.ts` → syllabus chỉ xuất hiện kiểu import schema; không handler trả cây giáo trình cho học viên (đọc lại apps/server/src/routes/student.ts các đoạn grep — chỉ trỏ tới import type ở lần quét `-l`). Kết luận: học sinh không thấy giáo trình. 🔵
5. **Không có ACL theo giáo viên trên template** — pattern: `grep -n "createdBy\\|owner\\|userId" packages/db/src/schema/syllabus.ts` → 0 kết quả (chỉ org_id). Kết luận: quyền mức org. 🟡 (OQ-4)
