---
title: "Phase 3: API contract and server import"
status: todo
priority: P1
effort: "1d"
dependencies: [1, 2]
---

# Phase 3: API contract and server import

> Context: [reports/design-decisions.md](./reports/design-decisions.md) (D2 toàn bộ, D4 snapshot/contracts), [reports/scout-report.md](./reports/scout-report.md) (§1 routes + line evidence, §2 snapshot, §3 contracts, §6 tests, §7 scheduled-lesson tách biệt), [reports/research-report.md](./reports/research-report.md) (§4 db.batch recipe + limits, §5 edge cases).

## Overview

Thay thế luồng gán pointer bằng **import deep-copy** ở tầng API: `POST /api/classes/:id/import-syllabus` (body `{templateId}`) copy toàn bộ cây template vào lớp trong MỘT `db.batch`, reset mọi lesson status về `upcoming`; `POST /api/classes/:id/remove-curriculum` xóa cây copy + null pointer (thay semantics unassign `""`); `POST /api/classes` nhận `templateId` để create+import atomic. Endpoint `assign-syllabus` bị **xoá** (clean cutover, pre-prod — assumption 1). Contract thêm `classId`/`sourceTemplateId` vào `KernelSyllabusRow`; snapshot echo 2 field này. Module/lesson CRUD handler **không đổi** (D1: discriminator-agnostic — id+org check đã đủ).

## Requirements

- [x] Contracts (`packages/api/src/contracts.ts`): xoá `assignSyllabusSchema` (:89-108); thêm `importSyllabusSchema = z.object({ templateId: z.string().min(1) })`; `removeCurriculumSchema` (body rỗng); `classCreateSchema.syllabusId` → `templateId: z.string().default("")` (giữ default rỗng = tạo lớp trống).
- [x] `KernelSyllabusRow` (:256-294) thêm `classId: string | null`, `sourceTemplateId: string | null`. `KernelClassRow` không đổi.
- [x] Route import theo D2.1-2.5: verify class org; **pre-check `cls.syllabusId !== null` → 409 ngay (red-team G — không parse error string)**; template tồn tại + `class_id IS NULL` + cùng org (vi phạm → 404); pre-SELECT cây template; **size guard: modules + lessons > 500 → 422 "Template quá lớn để import" (red-team O)**; `crypto.randomUUID()` cho copy + mọi module + mọi lesson; preserve `position`; mọi status copy = `upcoming`; một `db.batch`; batch throw → SELECT re-check pointer: đã có giá trị → 409 (race backstop), chưa → 500 re-throw (không nuốt lỗi thật thành 409).
- [x] Response import: `{ id: copyId }` đúng shape `CreatedResponse` (red-team B — `postKernelCommand` chỉ đọc `json.id`, trường `syllabusId` bị drop tại transport; precedent POST /classes kernel.ts:335-337).
- [x] Route `POST /api/classes` (:299-339): input `templateId` — resolve template (org + `class_id IS NULL`), generate class id + copy tree, **thứ tự batch pinned (red-team I): [insert syllabus copy, ...modules, ...lessons, insert class CUỐI CÙNG với syllabusId=copyId]** — class.syllabus_id FK thật (class.ts:21, NO ACTION), insert class trước copy = batch abort 100% trên D1. Template không hợp lệ → 404 trước batch, không tạo class lửng.
- [x] Route `POST /api/classes/:id/remove-curriculum`: verify org; guard SELECT syllabus pointer `id = cls.syllabusId AND class_id = :id AND org_id = ctx.orgId` (red-team C — thiếu org = cross-org destruction qua legacy anomaly; mismatch → 409, bảo vệ template); **thứ tự batch: [update class.syllabusId = null (and eq(id) eq(orgId)) TRƯỚC, rồi delete lessons, delete modules, delete syllabus copy — mọi DELETE kèm org_id = ctx.orgId]** (red-team C: FK NO ACTION chặn delete parent khi pointer còn trỏ; đã verify libsql SQLITE_CONSTRAINT). Pointer rỗng → no-op 200.
- [x] Helper cleanup (red-team M): `findSyllabus` (:165-171) widen select full row (import cần classId + metadata); **xoá `resolveSyllabusId`** (:174-181) — sau cutover 0 caller.
- [x] `apps/server/src/routes/snapshot.ts` (:226-235): syllabi[] mapping thêm `classId`, `sourceTemplateId`.
- [x] Không đụng: module/lesson CRUD routes (:572-723), scheduled-lesson endpoints (:354-513), `POST /api/syllabi` (giữ nguyên — tạo template vì `class_id` default NULL).
- [x] Test `kernel.test.ts`: rewrite :1444 (assign/unassign) và :1474 (foreign-org assign) thành import/remove; **đổi `syllabusId: ""` → `templateId: ""` ở createClass helper :226, :371, :1996 (red-team M — zod strip lặng field chết)**; thêm suite mới theo matrix.

## Architecture

Copy thuật toán backfill (phase 2) nhưng bằng TS: pre-SELECT tree → sinh UUID deterministic trước → một batch. D1 `db.batch` = transaction thật, statements chạy tuần tự — chỉ đường atomic multi-table trên D1 (manual BEGIN/COMMIT không hoạt động). Size check: ~71 statements/class với ≤12 params mỗi statement — cách xa giới hạn (100 params/statement, 100KB SQL, 30s batch); template khổng lồ chặn bằng size guard 422 thay vì brick batch. Duplicate-import: pre-check pointer trả 409 deterministic; unique index chỉ là race backstop (red-team G).
Recipe handler (sketch):
```ts
// POST /api/classes/:id/import-syllabus — thay assign-syllabus (kernel.ts:341-369)
const cls = await findClass(id, orgId);                 // 404 ngoài org
if (cls.syllabusId !== null) return c.json({ error: "Lớp đã có giáo trình" }, 409); // pre-check (red-team G)
const tpl = await findSyllabus(templateId, orgId);      // 404 ngoài org — full row (red-team M)
if (tpl.classId !== null) return 404;                   // không phải template
const modules = await selectModules(tpl.id);            // order position
const lessons = await selectLessons(tpl.id);            // join module, order position
if (modules.length + lessons.length > 500) return 422;  // size guard (red-team O)
const copyId = crypto.randomUUID();
const moduleIds = new Map(modules.map(m => [m.id, crypto.randomUUID()]));
const lessonIds = new Map(lessons.map(l => [l.id, crypto.randomUUID()]));
await db.batch([
  db.insert(syllabus).values({ id: copyId, orgId, ...tplMeta, classId: id, sourceTemplateId: tpl.id }),
  ...modules.map(m => db.insert(syllabusModule).values({
    id: moduleIds.get(m.id)!, orgId, syllabusId: copyId,
    title: m.title, description: m.description, position: m.position })),
  ...lessons.map(l => db.insert(syllabusLesson).values({
    id: lessonIds.get(l.id)!, orgId, moduleId: moduleIds.get(l.moduleId)!,
    title: l.title, objectives: l.objectives, materials: l.materials,
    status: "upcoming", position: l.position })),        // reset — D2.3
  db.update(classTable).set({ syllabusId: copyId })
    .where(and(eq(classTable.id, id), eq(classTable.orgId, orgId))), // org trong WHERE (red-team C)
]);                                                      // batch throw → re-check pointer: có → 409 (race backstop), không → 500
```

## Related Code Files

- `packages/api/src/contracts.ts:89-108` (assignSyllabusSchema/classCreateSchema), `:256-294` (KernelSyllabusRow).
- `apps/server/src/routes/kernel.ts:165-205` (helpers findSyllabus/findModule), `:299-369` (POST classes + assign-syllabus), `:534-570` (syllabi routes).
- `apps/server/src/routes/snapshot.ts:64-136` (loadSnapshot), `:226-235` (syllabi mapping).
- `apps/server/src/kernel.test.ts:1444-1474` (assign tests bị thay).

## Implementation Steps

1. Contracts: sửa schema + row type như Requirements; xoá hẳn `assignSyllabusSchema` (clean cutover).
2. Snapshot: thêm 2 field vào mapping syllabi.
3. Kernel route import mới + helper copy (nếu gọn, extract `buildImportBatch(tpl, classId, orgId)` để `POST /api/classes` tái dùng — tránh 2 bản copy algorithm).
4. Route remove-curriculum + xoá route assign-syllabus.
5. `POST /api/classes`: nhận `templateId`, resolve, batch create+import.
6. Map lỗi duplicate: pre-check pointer ở đầu handler (deterministic 409); batch throw → SELECT re-check pointer — đã có giá trị → 409, chưa → 500 re-throw (KHÔNG catch-all 409 nuốt lỗi thật; KHÔNG string-match message SQLite — red-team G; precedent `onConflictDoNothing` + SELECT fallback: `apps/server/src/routes/reporting/index.ts:69-84`).

## File Inventory

| File | Action | Size | Test impact |
|------|--------|------|-------------|
| `packages/api/src/contracts.ts` | modify | M | typecheck workspace; kernel.test dùng schema mới |
| `apps/server/src/routes/kernel.ts` | modify | L | kernel.test.ts rewrite + suite import/remove |
| `apps/server/src/routes/snapshot.ts` | modify | S | snapshot echo test (thêm 2 field) |
| `apps/server/src/kernel.test.ts` | modify | L | :1444/:1474 rewrite; thêm ~10 case import/remove/create |

## Test Scenario Matrix

| # | Scenario (invariant khóa) | Priority |
|---|---------------------------|----------|
| 1 | Import copy đủ cây: syllabus + modules + lessons, id mới toàn bộ, FK wiring đúng (module.syllabusId = copyId, lesson.moduleId = module id mới) | Critical |
| 2 | Import reset mọi lesson status → `upcoming` kể cả template có done/current | Critical |
| 3 | `position` module/lesson preserve nguyên thứ tự template | Critical |
| 4 | Import trùng (lớp đã có curriculum) → 409 "Lớp đã có giáo trình", cây cũ không đổi | Critical |
| 5 | Import template ngoài org → 404; import syllabus là copy của lớp khác (`class_id NOT NULL`) → 404 | Critical |
| 6 | Metadata syllabus copy nguyên vẹn (name/type/skills/totalLessons), `source_template_id` = template id | High |
| 7 | `POST /api/classes` + `templateId`: class + cây + pointer một transaction; template sai → 404, không class lửng | High |
| 8 | `remove-curriculum`: xóa cây copy (đếm module/lesson = 0 sau), pointer null; lần 2 → no-op | Critical |
| 9 | `remove-curriculum` khi pointer là template (`class_id NULL`) → 409, template còn nguyên | High |
| 10 | Cross-org isolation giữ nguyên: org B không import/xem/được count template org A (scout :956-1005 pattern) | Critical |
| 11 | Snapshot echo `classId`/`sourceTemplateId`; template cũ có `classId: null` | High |
| 12 | `POST /api/syllabi` vẫn tạo row `class_id NULL` (template) | High |
| 13 | Module/lesson CRUD trên copy hoạt động yêu cầu cũ (không regression :796-:1005) | High |
| 14 | Endpoint cũ `assign-syllabus` → 404 (đã xoá) | Medium |

## Success Criteria

- [x] `pnpm --filter server test` pass với matrix 1-14.
- [x] `pnpm check-types` pass (contracts đổi kéo web compile lỗi nếu còn reference cũ — phase 4 dọn; phase này chấp nhận server-side sạch, hoặc fix tạm các chỗ web reference nếu block compile toàn workspace — ưu tiên làm phase 4 ngay sau).
- [x] Grep `packages/api` + `apps/server` không còn `assign-syllabus`/`assignSyllabusSchema`.

## Risk Assessment

| Web chưa kịp đổi → `pnpm check-types` toàn workspace đỏ giữa phase 3-4 | Chấp nhận trong branch; phase 4 là việc kế tiếp ngay. Không giữ endpoint cũ làm compat (D2 clean cutover) |
| Thiếu `class_id IS NULL` check → import từ copy của lớp khác | Scenario 5 khóa; check đặt ngay sau findSyllabus |
| Race import đồng thời → 2 batch chèn nhau | Pre-check 409 deterministic; unique index chặn row thứ 2 làm backstop |
| Cascade delete phụ thuộc PRAGMA foreign_keys | remove-curriculum update pointer-null TRƯỚC, delete child-first tường minh (lessons → modules → syllabus), mọi DELETE kèm org_id — không dựa cascade (red-team C) |
| `totalLessons` copy từ template lệch thực tế | Web recompute từ cây (research §5 — không hand-maintain); copy giá trị template, chấp nhận |
| Race remove-curriculum với add-module song song → module mồ côi (insert qua guard rồi cây bị xóa) | Cửa sổ hẹp, pilot đơn người dùng — CHẤP NHẬN có chủ đích (red-team H): signal = module treo lơ lửng trong snapshot (module_id không resolve); response nếu xuất hiện = xoá tay row mồ côi + sau này thêm guard tồn tại syllabus trong WHERE insert nếu cần |
| Snapshot phình O(classes × tree) sau N import — mỗi write refetch toàn rừng | ĐO payload snapshot trước/sau ở phase 6 (red-team J); pilot (<10 lớp × ~70 row) chấp nhận; vượt ngưỡng đã ghi → replan fetch cây theo classId, không sửa lén trong cook |
## Dependency Map

- **Input:** Phase 1 (schema `classId`/`sourceTemplateId`), Phase 2 (backfill semantics đối chiếu: runtime reset vs migration preserve).
- **Output → Phase 4:** contract `importSyllabusSchema`/`templateId`/row fields + response `{id: copyId}` quyết định shape action/repo web.
