# Scout Report — Syllabus Excel/CSV Import

Scout date: 2026-09-14 · Repo: teacher-os @ develop · Mode: Explore agent sweep

## 1. Data model (packages/db)

`packages/db/src/schema/syllabus.ts` — 3 bảng:

- `syllabus` (dòng 12–51): `id` (text PK), `orgId` FK, `name`, `level` (default ""), `type` (default "ielts"), `skills` (JSON array string, default "[]"), `description` (default ""), `totalLessons` (int, default 0), `createdAt`, `classId` (NULL = template, có giá trị = bản sao của lớp), `sourceTemplateId`. Unique index `syllabus_class_unique` trên `classId` WHERE NOT NULL.
- `syllabusModule` (dòng 53–74): `id`, `orgId`, `syllabusId` FK cascade, `title` (notNull), `description` (default ""), `position` (int, default 0), `createdAt`.
- `syllabusLesson` (dòng 80–103): `id`, `orgId`, `moduleId` FK cascade, `title` (notNull), `objectives` (default ""), `materials` (default ""), `status` (default "upcoming"), `position` (default 0), `createdAt`. Không có cột duration/homework.

Lưu ý: `lesson` trong `schema/lesson.ts` là bài dạy theo lớp (delivered session), khác entity với `syllabus_lesson` — không đụng vào.

Types hiển thị (web): `apps/web/src/lib/mock-data.ts` dòng 118–145 — `SyllabusLessonStatus = "done" | "current" | "upcoming"`, `SyllabusLesson {id, title, objectives, materials, status}`, `SyllabusModule {id, title, description?, lessons}`, `Syllabus {id, name, level, type, classId, sourceTemplateId, skills, totalLessons, description, modules}`.

## 2. Contracts (packages/api)

`packages/api/src/contracts.ts`:

- `syllabusCreateSchema` (117–146): `{name min(1), type enum CLASS_TYPES default "ielts", level default "", skills array enum IELTS_SKILLS unique default [], description default "", totalLessons int min(0) default 0}` + superRefine (ielts cần ≥1 skill; communication không skill).
- `moduleUpsertSchema` (148–152): `{title min(1), description default ""}`.
- `lessonUpsertSchema` (154–160): `{title min(1), objectives default "", materials default "", status enum ["done","current","upcoming"] default "upcoming"}`.
- `reorderModulesSchema`/`reorderLessonsSchema` (168–179): arrays min(1).max(500), comment "Cap matches MAX_IMPORT_NODES".
- `importSyllabusSchema` (104–107) là import template vào lớp (issue #79), KHÔNG phải file upload.
- Snapshot rows: `KernelSyllabusLessonRow` (375), `KernelSyllabusModuleRow` (383, có `lessons: []`), `KernelSyllabusRow` (390, có `modules: []`), `KernelSnapshot.syllabi` (490), `CreatedResponse {id}` (501).

## 3. Create flow end-to-end (kernel action bus)

- Action union: `apps/web/src/lib/data-actions.ts` (~170 dòng). Syllabus actions: `add-syllabus` (88–98), `import-syllabus` (101–104), `remove-curriculum` (107–109), `add-module` (111–114), `edit-module` (117–120), `add-lesson` (122–131), `edit-lesson` (133–143), `delete-module` (145–148), `delete-lesson` (150–154), `reorder-modules` (156–159), `reorder-lessons` (161–165). Tổng 25 action.
- Client transport: `apps/web/src/lib/repos/kernel.ts`:
  - `kernelCommand(action)` (35–199): map action → POST path + JSON body. `add-syllabus` → `POST /api/syllabi`, body build tường minh 6 field name/type/level/skills/description/totalLessons (80–91, client id bị drop — test "add-syllabus drops the client id" trong kernel.test.ts).
  - `postKernelCommand` (316–342): fetch POST JSON, header `content-type: application/json`, `AbortSignal.timeout(15000)`. Chỉ hỗ trợ JSON, không có đường FormData.
  - `createKernelCommandBus` (471–558): bus tuần tự, mỗi write xong refetch snapshot; `KernelCommandResult` = `refreshed | committed | definite-failure | outcome-unknown` (245–254).
  - Wiring: `apps/web/src/lib/data-provider.tsx` (87–103), baseUrl từ `env.VITE_SERVER_URL`.
- Reducer fixture: `apps/web/src/lib/data-store-reducer.ts` — `add-syllabus` (186–202), `add-module` (203–222), `add-lesson` (242–267), `recomputeTotalLessons` (14–19). Comment dòng 37: "Historical fixture reducer; runtime state lives in DataProvider". Thêm action mới phải sửa union + reducer + kernelCommand.
- Server: `apps/server/src/routes/kernel.ts` (1634 dòng, `kernelRoutes(deps)` từ dòng 116):
  - Origin/CSRF + content-type guard (122–133): mọi POST phải `Origin === corsOrigin` VÀ `Content-Type: application/json`, không thì 415 — "POST bodies are JSON-only; form posts die on content-type before parsing".
  - `readBody<S extends z.ZodType>` (139–156): JSON parse + `schema.safeParse`, lỗi → 400 `{error: "invalid body"}`.
  - Helpers: `findSyllabus` (178), `findModule` (187), `hasDuplicateIds` (206), `sameIdSet` (210), `MAX_IMPORT_NODES = 500` (217).
  - Handlers: `GET /syllabi` (1250), `POST /syllabi` (1257, trả 201 `{id}`), `POST /syllabi/:id/modules` (1279, position = max+1), reorder (1315, db.batch), edit module (1370), remove module (1393), add lesson (1440), reorder lessons (1478), edit lesson (1537), remove lesson (1576).
  - Deep-copy batch pattern: `copyTemplateTree` (219–286) — `db.batch([...])` insert hàng loạt modules + lessons.

## 4. UI syllabus create + detail

- List route: `apps/web/src/routes/_auth/syllabus/index.tsx` — nút "+ Tạo syllabus" (41) mở `AddSyllabusModal` (105–111, `onCreated` navigate sang detail).
- `AddSyllabusModal` (`apps/web/src/components/modals/add-syllabus-modal.tsx`): fields name/type/level/skills/description/totalLessons; dispatch `add-syllabus` qua `useKernelFormSubmit()`; chỉ đóng khi `result.kind === "refreshed"`.
- Detail route: `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx` — render modules (183–277), "+ Thêm module" (165–171), "+ Thêm buổi học" (266–272).
- Module fields: `title`*, `description`. Lesson fields: `title`*, `objectives`, `materials`, `status` (Select "Sắp tới/Đang học/Đã dạy") — `add-lesson-modal.tsx` (20–104).
- Submit hook chung: `apps/web/src/lib/use-kernel-form-submit.ts` (`run`, `reconcile`, `submitBlocked`).

## 5. File-upload / parse hiện trạng

- KHÔNG có xlsx/papaparse/sheetjs/exceljs/csv trong bất kỳ package.json hay pnpm-lock.yaml.
- KHÔNG có FormData/multipart ở server hay web.
- Precedent file input: `apps/web/src/components/profile/avatar-section.tsx` (77–84: `<input type="file" className="hidden">` + ref.click()), parse client-side qua `fileToAvatarDataUrl` trong `apps/web/src/lib/avatar-image.ts` + `validateAvatarFile`, toast `sonner`.
- `packages/ui/src/components/`: không có dropzone/file-input component.

## 6. Server framework

- `apps/server/src/app.ts` — `buildApp(deps)` (84–106): logger → cors → bootstrapMiddleware (`/api/*`, gắn `kernelCtx {orgId, userId}`) → `app.route("/api", kernelRoutes(deps))`.
- Hono `^4.12.32`. DB: Drizzle qua D1 (`DrizzleD1Database`). Validation: zod từ `@teacher-os/api/contracts` qua `readBody`.
- `db.batch([...])` là cách insert/update hàng loạt D1.

## 7. Test conventions

- Web: `vitest run` (`apps/web/vitest.config.ts`, include `src/**/*.test.ts`). Colocated `*.test.ts` (unit) và `*.contract.test.ts`. Ví dụ: `apps/web/src/lib/repos/kernel.test.ts` (mapping test), `apps/web/src/lib/data-store-reducer.test.ts`.
- Server: vitest (`apps/server/vitest.config.ts`, node env). Boot app thật bằng `buildApp` + libsql in-memory + drizzle migrator (`apps/server/src/kernel.test.ts` 45–60) — test qua HTTP handler chain với session fake.
- E2E: Playwright (`apps/e2e/playwright.config.ts`): testDir `./specs`, workers 1, chromium, timezone Asia/Ho_Chi_Minh, 2 webServer (API :8000 `boot:api`, vite :8001). Spec mẫu: `apps/e2e/specs/syllabus-delete-reorder.spec.ts` — seed qua `page.request.post` với header `Origin` + JSON, UI copy tiếng Việt.

## 8. Conventions (docs)

- `docs/code-standards.md`: contracts → `packages/api/src/contracts.ts`; schema → `packages/db/src/schema/`; kernel routes → `apps/server/src/routes/kernel.ts`; transport → `apps/web/src/lib/repos/kernel.ts`. "Treat packages/api as the shared contract surface; change the server and web together when a contract changes" (39). "Keep POST writes JSON-only and org-scoped" (40) — parse file ở client rồi gửi JSON là phù hợp convention.
- Validation: root scripts `check` (biome), `test` (turbo run test), `check-types`.
- UI copy 100% tiếng Việt; zod messages tiếng Việt.
- Git: branch `feat/<issue>-<slug>`; Conventional Commits kèm issue (`feat(web): ... (issue #N)`); PR vào main.
- Plans: `plans/<YYMMDD-HHmm>-<slug>/`.

## Risks

- Guard POST JSON-only + Origin (kernel.ts 122–133) chặn multipart — thiết kế phải parse client-side rồi gửi JSON.
- `MAX_IMPORT_NODES = 500` cap cứng cho batch D1 — bulk import phải tôn trọng.
- Thêm field payload mới phải sync 4 nơi: contracts zod → server route → `data-actions.ts` union → `repos/kernel.ts kernelCommand` (+ reducer fixture `data-store-reducer.ts`).
- `syllabus_lesson` không có duration/homework — cột Excel chứa các trường ngoài schema sẽ bị bỏ (không migration trong scope này).
