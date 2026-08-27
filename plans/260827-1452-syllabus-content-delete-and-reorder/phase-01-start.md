---
phase: 1
title: "Contracts & server endpoints xóa/reorder"
status: pending
priority: P1
effort: "4-6h"
dependencies: []
---

# Phase 1: Contracts & server endpoints xóa/reorder

## Overview

Thêm zod schemas vào `packages/api/src/contracts.ts` và 4 POST endpoints mới trong `apps/server/src/routes/kernel.ts`: xóa module, xóa buổi học, reorder module theo syllabus, reorder buổi học theo module. Không migration — `position` đã có sẵn.

## Requirements

- Functional: xóa được module (kèm toàn bộ lessons) và lesson riêng lẻ; đổi thứ tự toàn bộ sibling list của một parent trong 1 request.
- Non-functional: org-guard trên mọi mutation; payload reorder sai tập bị từ chối; write-only POST convention giữ nguyên.

## Architecture

Kernel command bus: POST → zod parse → findSyllabus/findModule (404 nếu lệch org/parent) → `db.batch` → trả `{ ok: true }`. Snapshot mới **không** nằm trong POST body — client GET `/api/kernel` sau 2xx (`postKernelCommand` chỉ đọc `json.id`, kernel.ts:225-228). Precedent edit-module: `c.json({ ok: true })` (kernel.ts:855-856).

Endpoints (verb-sub-path):

```
POST /api/syllabi/:id/modules/:mid/remove              body {} strict
POST /api/syllabi/:id/modules/:mid/lessons/:lid/remove body {} strict
POST /api/syllabi/:id/modules/reorder                  body { moduleIds: string[] }
POST /api/syllabi/:id/modules/:mid/lessons/reorder     body { lessonIds: string[] }
```

Canonical schema (chốt duy nhất, mọi phase khác phải trích nguyên văn). `MAX_IMPORT_NODES = 500` (`kernel.ts:195-196`):

```ts
export const reorderModulesSchema = z.object({
  moduleIds: z.array(z.string().min(1)).min(1).max(500),
}).strict();
export const reorderLessonsSchema = z.object({
  lessonIds: z.array(z.string().min(1)).min(1).max(500),
}).strict();
```

Mount order (Hono first-registered-wins): `POST /syllabi/:id/modules/reorder` TRƯỚC `/modules/:mid` (~kernel.ts:838) VÀ `POST /syllabi/:id/modules/:mid/lessons/reorder` TRƯỚC `/modules/:mid/lessons/:lid` (~kernel.ts:899).

## Related Code Files

- Modify: `packages/api/src/contracts.ts` — `moduleRemoveSchema`, `lessonRemoveSchema` (strict rỗng, mẫu `removeCurriculumSchema` :93), `reorderModulesSchema`/`reorderLessonsSchema` đúng canonical block; không đổi row types
- Modify: `apps/server/src/routes/kernel.ts` — 4 routes; `findModule` :176-193. **Cấm** copy join edit-lesson :908-919 cho delete-lesson (chỉ bind `lesson.orgId`).
- Modify: `apps/server/src/kernel.test.ts` — happy + error paths bên dưới. CSRF pattern sẵn `:680-710`. Cross-org describe `:926-1013` phải thêm 4 path mới.

## Implementation Steps

1. Thêm 4 zod schemas (canonical + `.max(500)`).
2. Mọi route: `if (!ctx) return unauthorized(c)` rồi findSyllabus (`id+orgId`) → 404. Không nới CSRF middleware kernel.ts:114-116.
3. Xóa module: `findModule(mid, syllabusId, orgId)` → 404. Child-first giống `remove-curriculum` (`kernel.ts:579-594`): `DELETE lessons WHERE orgId AND moduleId IN (SELECT id FROM modules WHERE syllabusId AND orgId AND id=mid)` rồi `DELETE module WHERE id + syllabusId + orgId`. Không `DELETE lessons WHERE moduleId+orgId` rồi `DELETE module WHERE id+orgId` (thiếu syllabusId; CASCADE trên `syllabus.ts:87-89` sẽ wipe lesson foreign-org nếu FK on).
4. Xóa lesson: `findModule` rồi bind `lesson.id+moduleId+orgId`. DELETE WHERE `id + moduleId + orgId`.
5. Reorder modules: load siblings `syllabusId+orgId`. Duplicate/empty/over-max trong payload → **400**. SET ≠ DB (thiếu/thừa/id lạ, kể cả id cùng org khác parent) → **409** `{ error: "set-mismatch" }`. Sibling count > 500 → **422**. Sau validate: `db.batch(moduleIds.map((id,i) => UPDATE position=i WHERE id AND syllabusId AND orgId))`.
6. Reorder lessons: tương tự, scope `moduleId`; WRITE WHERE `id + moduleId + orgId`.
7. Vitest:
   - happy path mỗi endpoint; GET snapshot sau POST (không assert POST body)
   - 401 unauthenticated
   - Origin missing/foreign → 403; form content-type → 415 (4 routes)
   - extra body key → 400
   - org B gọi 4 path của org A → **404**, owner snapshot nguyên (mở rộng `describe("cross-org syllabus writes")`)
   - hai syllabus/module cùng cardinality, payload id parent kia → **409**, victim position không đổi
   - xóa module 2 lessons → snapshot 0 orphan lesson
   - lesson foreign-org cùng `moduleId` (insert FK-off) sống sót sau delete module
   - delete module trên template không đụng class-copy trees (D4 lock)

## Success Criteria

- [x] 4 endpoints curl/httpie smoke với session **và** `-H Origin: $CORS_ORIGIN`
- [x] Test phủ error paths ở bước 7, suite xanh

## Risk Assessment

- Reorder validation lỏng → cross-parent injection. Mitigation: SET so với siblings **của parent**, WRITE WHERE lặp parent, test same-cardinality.
- PRAGMA foreign_keys tắt ở libsql test (`packages/db/src/index.ts` không bật). Mitigation: child-first subquery + orphan test; không tin CASCADE schema.
- 409 set-mismatch recyle toast duplicate-guard. Mitigation: body `{ error: "set-mismatch" }`; Phase 2 nhánh toast riêng.
<!-- Updated: Validation Session 1 / Red Team Session 2 -->
