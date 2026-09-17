# Scout Report — Syllabus status removal + detail-screen import

Ngày: 2026-09-15 · Phạm vi: syllabus feature across `apps/web`, `apps/server`, `packages/api`, `packages/db`, `apps/e2e`.

## 1. Màn hình syllabus (frontend)

- List: `apps/web/src/routes/_auth/syllabus/index.tsx` — mount `AddSyllabusModal` (dòng 105). **Không dùng status.**
- Detail: `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx` — `SyllabusDetail` dòng 66. Buổi học render dòng 223–265: dot màu `lessonDotClassFor(l.status)` (229) + `LessonStatusBadge` (241). StatCards "đã dạy"/"đang học" dòng 136–149; biến `done`/`current` dòng 94–95; Card "Buổi hiện tại" dòng 151–161; `mDone` mỗi module dòng 184, hiển thị 217. Bảng "Lớp đang dùng template này" (279–319) có cột "Trạng thái" nhưng là **status của lớp** (`c.status` active/paused) — không phải status buổi học, được giữ nguyên.
- Create popup: `apps/web/src/components/modals/add-syllabus-modal.tsx` — KHÔNG có field status syllabus; chứa UI import Excel/CSV inline (file input 225–231, `onFileChange` 68, preview `PREVIEW_HEADERS` 5 cột dòng 36, bảng 252–319, Tag status 310, lỗi 320–343, nút gỡ file 157–170, guard `parsing`/`importBlocked` 96–103).
- Edit/Create buổi học: `edit-lesson-modal.tsx` (Select status 96–105, payload kèm status 61) và `add-lesson-modal.tsx` (Select 95–104, payload 50) — **dùng chung cho cả syllabus detail và class detail**.
- Class detail curriculum: `apps/web/src/components/class-detail/curriculum-management-section.tsx` — cùng renderer (dot 206, badge 218, `mDone` 166–168, tiến độ % 77–80) và cùng 2 modal (351–363). Đây là nơi status ĐƯỢC PHÉP thay đổi theo yêu cầu.
- Helpers: `apps/web/src/components/syllabus/lesson-status.tsx` — `lessonDotClass` 4, `lessonDotClassFor` 11, `LessonStatusBadge` 15.

## 2. Import Excel/CSV (issue #150, v2)

- Parser client-side thuần: `apps/web/src/lib/syllabus-import.ts` — `STATUS_MAP` 19–27, `mapStatus` 57–71, `normalizeRow` 5 cột 38–54, `rowsToModules` 74–197 (reject template v1 6 cột qua col2 "buổi học" 85–100; `hasLessonContent` 151–152 gồm cả cột status; push lesson kèm status 173–178), `parseSyllabusFile` 203, `buildSampleCsv` 5 cột 248–255, caps 500 nodes/2MB (11–12).
- Endpoint: **chỉ create** `POST /api/syllabi` (`apps/server/src/routes/kernel.ts:1257`), insert batch syllabus+modules+lessons, ghi `status: l.status` dòng 1302. **Không tồn tại PUT/PATCH syllabus hay replace-content.**
- Transport client: `apps/web/src/lib/repos/kernel.ts` — `kernelCommand` map action→POST (case `add-syllabus` 80–92, `edit-lesson` 170–179 liệt kê 4 field); `postKernelCommand` **hardcode method POST** (317–343) → endpoint mới bắt buộc POST action-style.
- KernelAction union: `apps/web/src/lib/data-actions.ts` — `add-lesson` 126–136, `edit-lesson` 137–148 (payload `status` bắt buộc).

## 3. Backend syllabus

- Schema Drizzle/SQLite: `packages/db/src/schema/syllabus.ts` — `syllabus` 12 (không có cột status; `classId` 34, `sourceTemplateId` 40), `syllabusModule` 53, `syllabusLesson` 80 với `status` 93 default "upcoming". FK module→syllabus, lesson→module đều `onDelete: cascade` (62, 89).
- Zod: `packages/api/src/contracts.ts` — `syllabusModuleContentSchema` 122–136 (lesson `status` enum default "upcoming" 131), `syllabusCreateSchema` 138–180 (superRefine cap 500 nodes + luật skills), `lessonUpsertSchema` 188–194 (`status` default "upcoming" 192), reorder schemas 202–213.
- Routes: add-lesson `kernel.ts:1473` (insert `status: input.status` 1501), edit-lesson `kernel.ts:1570` (update set `status: input.status` 1601; SELECT chỉ cột id 1579–1590), module-remove `kernel.ts:1426` (**delete lessons explicit bằng subquery rồi delete module** — không dựa FK cascade), lesson-remove 1609.
- Helpers: `findSyllabus`, `findModule` trong kernel.ts; `readBody(c, schema)`; envelope `{id}`/`{ok:true}`; `db.batch([first, ...rest])` pattern.
- Snapshot: `KernelSyllabusLessonRow.status` (contracts 409–414) — mapper `apps/web/src/lib/repos/syllabus.ts:43` cast status. **Giữ nguyên** (class copy vẫn cần).
- Lớp học đổi status ở BẢNG KHÁC `lesson` (upcoming/completed/cancelled, check-in/cancel) — tách bạch với `syllabus_lesson.status` (invariant 5, comment schema 76–79).

## 4. Tests

- Web vitest: `apps/web/src/lib/syllabus-import.test.ts` (15 luật parser), `src/lib/repos/syllabus.test.ts`.
- Server vitest: `apps/server/src/kernel.test.ts` — describe "syllabus create with imported content" 531 (gửi `status` rõ, assert persist).
- E2E Playwright: `apps/e2e/specs/syllabus-excel-csv-import.spec.ts` (3 test: preview CSV/XLSX — assert "2 module · 3 buổi học", ordinal cột #, giữ-state, nút gỡ file; comment dòng 43–44 dựa vào card "Buổi hiện tại"); fixtures `apps/e2e/fixtures/syllabus-import.sample.csv|.xlsx` — **xlsx là binary committed, không có script regen trong repo**, e2e không có dep ghi xlsx.
- Lệnh: `pnpm --filter server test`, `pnpm --filter web test`, `pnpm check-types`, `pnpm check` (biome), `pnpm --filter e2e e2e`.

## 5. Layout

pnpm workspace + Turborepo: `apps/{web,server,e2e}`, `packages/{api,auth,config,db,env,infra,ui}`. Web: React + Vite + TanStack Router/Query + kernel store (`data-store-reducer`, `use-kernel-form-submit`, `use-direct-kernel-action`). Server: Hono (Workers). UI tự viết `apps/web/src/components/ui/*`.

## Risks / Notes

- "Edit syllabus" hiện không có modal riêng ở cấp syllabus — "create/edit syllabus" trong yêu cầu = form tạo syllabus + form thêm/sửa buổi học mở từ màn hình syllabus.
- Gỡ status khỏi parser làm format file đổi 5→4 cột: fixtures e2e phải đổi; cần reject file v2 cũ có cột "Trạng thái" (mirror cách reject v1 hiện có).
- `lessonUpsertSchema` đang `.default("upcoming")` — muốn "edit từ màn hình syllabus không gửi status mà không reset status bản copy lớp" thì status phải `.optional()` + route edit preserve giá trị existing.
- Replace-content phải POST (transport client chỉ POST); delete theo pattern module-remove (explicit subquery, orgId filter mọi where).
