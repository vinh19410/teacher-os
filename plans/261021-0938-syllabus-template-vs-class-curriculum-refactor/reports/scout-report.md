# Scout report: tạo và gán syllabus (2026-10-21)

Mọi mục dưới đây đã được đọc trực tiếp trong code ở `origin/develop` (`e279a4f`). Số dòng có thể lệch vài dòng sau phase 2.

## Schema

- `packages/db/src/schema/syllabus.ts`: `syllabus` có `classId` (NULL = template) và `sourceTemplateId` (self-FK `set null`), unique partial index `syllabus_class_unique` trên `class_id`. `syllabus_lesson` có `kind` (nội dung) và `status` (tiến độ) trong cùng một dòng.
- `packages/db/src/schema/class.ts:23`: `class.syllabus_id` là FK thật tới `syllabus.id` (NO ACTION).
- Migration mới nhất là `0041_known_ink.sql`; migration `0009` (discriminator và backfill) cố ý để nguyên con trỏ mồ côi và khác org (xem `apps/server/src/syllabus-template-migration.test.ts`, seed lớp c4 và c5).
- `0041` ghi rõ bẫy D1: `DROP TABLE` cascade qua FK dù có `PRAGMA foreign_keys=OFF`. Vì vậy plan này không rebuild bảng nào.

## Server (`apps/server/src/routes/kernel.ts`, 2116 dòng)

| Vùng | Dòng | Nội dung |
|---|---|---|
| Helper | 189-331 | `findSyllabus`, `findModule`, `hasDuplicateIds`, `sameIdSet`, `MAX_IMPORT_NODES`, `buildImportBatch`, `selectTemplateTree` |
| Tạo lớp | 712-773 | `POST /classes` nhận `templateId`, batch: copy trước, insert class sau cùng |
| Import | 775-828 | `POST /classes/:id/import-syllabus`; 409 khi `cls.syllabusId !== null` |
| Gỡ | 830-911 | `POST /classes/:id/remove-curriculum`; có nhánh con trỏ lệch (849-870) |
| Nội dung | 1527-2097 | `GET /syllabi`, `POST /syllabi` (+ bodyLimit 2 MiB), `replace-content`, CRUD module và lesson, reorder, `POST /syllabi/:id/remove` |

- Mẫu sub-router có sẵn: `assignmentRoutes(deps)` mount bằng `kernel.route(...)` (dòng 2101), nên được bảo vệ bởi middleware Origin và content-type của `kernel.use("*")`. `readBody` và `unauthorized` được viết lại cục bộ trong mỗi router (6 file).
- `hasDuplicateIds` và `sameIdSet` chỉ được dùng ở hai handler reorder (dòng 1727, 1749, 1891, 1917).
- Handler lesson upsert (1944-1987) giữ `kind` và `status` hiện có khi body không gửi.
- `POST /syllabi/:id/remove` (2033-2097) từ chối bản copy của lớp (404) và đặt `source_template_id = NULL` cho các copy. Đây là lý do `source_template_id` có thể null trên dữ liệu thật.
- Con trỏ `class.syllabus_id` chỉ được đọc bởi `snapshot.ts:474` (đưa vào snapshot) và bởi web. Không route student nào dùng syllabus.
- Snapshot (`snapshot.ts:259-271`) tải toàn bộ syllabus, module, lesson của org.

## Contract (`packages/api/src/contracts.ts`)

`importSyllabusSchema` (92), `removeCurriculumSchema` (98), `deleteSyllabusSchema` (102), `syllabusCreateSchema` (139), `moduleUpsertSchema` và `lessonUpsertSchema` (183-198), `reorder*Schema` (206-221), `syllabusReplaceContentSchema` (223), `KernelSyllabusRow` (1229) với `classId` và `sourceTemplateId`.

## Web

- Command bus: `apps/web/src/lib/repos/kernel.ts` ánh xạ action sang path (dòng 72-228); kiểu action ở `apps/web/src/lib/data-actions.ts` (110-215). Các action module/lesson mang `syllabusId`.
- `apps/web/src/lib/repos/syllabus.ts` ánh xạ snapshot sang `Syllabus`; `use-syllabus.ts:24` lọc `templates` theo `classId === null`.
- Điểm rẽ nhánh theo `classId`: `use-syllabus.ts`, `data-provider.tsx:151-157` (`classesForSyllabus`), `routes/_auth/syllabus/$syllabusId.tsx:156,177`, `components/class-detail/curriculum-management-section.tsx:40,64,79`, `components/class-detail/class-sessions-manage-modal.tsx:~48,67`, `routes/_auth/classes/$classId.tsx:151,327`, `routes/_auth/classes/index.tsx:78`.
- `useSyllabusMutations` (`components/syllabus/syllabus-mutations.tsx`) nhận `isClassCopy` làm cờ để đổi câu chữ xác nhận.
- `ClassTemplatePicker` đã tồn tại trong `components/modals/add-class-modal.tsx:58-107` (select kèm dòng "— Lớp trống —" và danh sách kỹ năng); `components/modals/import-syllabus-modal.tsx` là một select riêng. Hai nơi lặp lại logic chọn template.
- Chỉnh nội dung bản copy của lớp nằm ở `class-detail/class-sessions-manage-modal.tsx`; chỉnh template nằm ở `routes/_auth/syllabus/$syllabusId.tsx` (469 dòng).

## Test và hạ tầng

- `apps/server/src/kernel.test.ts` (6570 dòng, khoảng 200 nhắc tới syllabus) dùng `createTestApp()` cục bộ và `t.call("/api/...", { session, method, body })`. Các khối liên quan: "syllabus create with imported content" (576), "import syllabus + remove curriculum (issue #79)" (2743), "delete syllabus template" (3065), "cross-org syllabus writes" (1857).
- Test migration mẫu: `apps/server/src/syllabus-template-migration.test.ts` (áp migration tuần tự bằng libsql in-memory, seed dữ liệu giống pilot).
- E2E liên quan: `apps/e2e/specs/syllabus-*.spec.ts` (4 file).
- Lệnh kiểm: `pnpm check`, `pnpm check-types`, `pnpm --filter server test`, `pnpm --filter web test`, `pnpm --filter e2e e2e` (port override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103`), `pnpm design:compare`.
- Prod D1: `teacher-os-db`; runbook `docs/production-release-runbook.md` yêu cầu Time Travel bookmark trước migration và diễn tập staging.

## Chưa xác minh

- Dữ liệu prod (số lớp có con trỏ mồ côi hoặc khác org, số copy có `source_template_id` null): cần user chạy truy vấn ở phase 1.
- Nội dung chi tiết handler module/lesson ở dòng 1685-1930 mới đọc ở mức đầu và cuối; phase 2 và 4 bắt đầu bằng việc đọc đầy đủ trước khi di chuyển.
