---
phase: 1
title: "Hợp đồng API & endpoint thay nội dung"
status: todo
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Hợp đồng API & endpoint thay nội dung

## Goal

Server chấp nhận body thêm/sửa buổi học **không có trường status** (sửa thì preserve status hiện tại, thêm thì default `"upcoming"`), và cung cấp endpoint mới `POST /api/syllabi/:id/replace-content` thay toàn bộ cây module/buổi học của một syllabus trong một batch atomic.

## Context Links

- Scout report: `reports/scout-report.md` (mục 2, 3)
- Quyết định D2, D4 trong `plan.md`
- Route create hiện tại (pattern batch để mirror): `apps/server/src/routes/kernel.ts:1257-1310`
- Route module-remove (pattern delete explicit): `apps/server/src/routes/kernel.ts:1426`

## Files to Create / Modify

- Modify: `packages/api/src/contracts.ts` (`lessonUpsertSchema` dòng 188–194; thêm `syllabusReplaceContentSchema` sau `reorderLessonsSchema` dòng 213)
- Modify: `apps/server/src/routes/kernel.ts` (route add-lesson ~1473, route edit-lesson ~1570; thêm route replace-content sau route `POST /syllabi` kết thúc dòng 1310)
- Modify: `apps/server/src/kernel.test.ts` (thêm tests)

## Tasks & Steps

### Task 1.1 — `lessonUpsertSchema.status` thành optional
- Goal: hợp đồng zod cho thêm/sửa buổi học chấp nhận body thiếu `status`.
- Target files: `packages/api/src/contracts.ts` — field `status` dòng 192 của `lessonUpsertSchema`.
- Steps:
  1. Đổi `status: z.enum(["done", "current", "upcoming"]).default("upcoming")` thành `status: z.enum(["done", "current", "upcoming"]).optional()`.
  2. Thêm comment ngắn: optional = form mở từ màn hình syllabus không gửi status; route edit preserve giá trị existing, route add default `"upcoming"` khi vắng.
- Success criteria: type `LessonUpsert` có `status?: "done" | "current" | "upcoming"`.
- Verify: `pnpm check-types` exit 0. (Client hiện vẫn luôn gửi status nên chưa có thay đổi runtime ở bước này.)

### Task 1.2 — Route add-lesson & edit-lesson xử lý status vắng mặt
- Goal: thêm buổi không có status → `"upcoming"`; sửa buổi không có status → giữ nguyên status cũ.
- Target files: `apps/server/src/routes/kernel.ts` — route `POST /syllabi/:id/modules/:mid/lessons` (insert dòng ~1501) và route `POST /syllabi/:id/modules/:mid/lessons/:lid` (dòng 1570–1607).
- Steps:
  1. Route add-lesson: trong `db.insert(syllabusLesson).values({...})` đổi `status: input.status` thành `status: input.status ?? "upcoming"`.
  2. Route edit-lesson: trong SELECT hiện có (dòng 1579–1590, đang select `{ id: syllabusLesson.id }`) thêm `status: syllabusLesson.status`.
  3. Trong `.set({...})` của UPDATE (dòng 1595–1602) đổi `status: input.status` thành `status: input.status ?? lesson.status`.
- Success criteria: body `{title, objectives, materials}` sửa một buổi `done` → sau request status vẫn là `done`, title đổi.
- Verify: `pnpm --filter server exec vitest run src/kernel.test.ts` exit 0 (hành vi được test mới ở Task 1.4 khóa lại).

### Task 1.3 — Schema + endpoint `replace-content`
- Goal: endpoint POST thay toàn bộ cây module/buổi của syllabus, atomic trong một `db.batch`.
- Target files: `packages/api/src/contracts.ts` (schema mới), `apps/server/src/routes/kernel.ts` (route mới đặt ngay sau route `POST /syllabi`, sau dòng 1310).
- Steps:
  1. Trong `contracts.ts`, thêm sau `reorderLessonsSchema`:
     ```ts
     /** Bulk replace nội dung syllabus (import ghi đè ở màn hình detail). */
     export const syllabusReplaceContentSchema = z
       .object({
         modules: z.array(syllabusModuleContentSchema).min(1),
       })
       .strict()
       .superRefine((input, ctx) => {
         const nodes =
           input.modules.length +
           input.modules.reduce((sum, m) => sum + m.lessons.length, 0);
         if (nodes > 500) {
           ctx.addIssue({
             code: "custom",
             path: ["modules"],
             message: "Tổng số module và buổi học vượt giới hạn 500",
           });
         }
       });
     export type SyllabusReplaceContent = z.infer<
       typeof syllabusReplaceContentSchema
     >;
     ```
  2. Thêm `syllabusReplaceContentSchema` vào import từ `@teacher-os/api/contracts` ở đầu `kernel.ts`; nếu `inArray` chưa có trong import `drizzle-orm` thì thêm.
  3. Thêm route (mirror pattern create dòng 1265–1308 cho phần insert; mirror pattern module-remove ~dòng 1455–1472 cho phần delete — **delete explicit qua subquery, không dựa FK cascade**):
     ```ts
     kernel.post("/syllabi/:id/replace-content", async (c) => {
       const ctx = c.get("kernelCtx");
       if (!ctx) return unauthorized(c);
       const body = await readBody(c, syllabusReplaceContentSchema);
       if (!body.ok) return body.response;
       const input = body.data;
       const db = deps.getDb();
       const id = c.req.param("id");
       const sy = await findSyllabus(db, id, ctx.orgId);
       if (!sy) return c.json({ error: "syllabus not found" }, 404);
       const lessonCount = input.modules.reduce(
         (sum, m) => sum + m.lessons.length,
         0,
       );
       const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
         db.delete(syllabusLesson).where(
           and(
             eq(syllabusLesson.orgId, ctx.orgId),
             inArray(
               syllabusLesson.moduleId,
               db
                 .select({ id: syllabusModule.id })
                 .from(syllabusModule)
                 .where(
                   and(
                     eq(syllabusModule.syllabusId, id),
                     eq(syllabusModule.orgId, ctx.orgId),
                   ),
                 ),
             ),
           ),
         ),
         db.delete(syllabusModule).where(
           and(
             eq(syllabusModule.syllabusId, id),
             eq(syllabusModule.orgId, ctx.orgId),
           ),
         ),
         db
           .update(syllabus)
           .set({ totalLessons: lessonCount })
           .where(and(eq(syllabus.id, id), eq(syllabus.orgId, ctx.orgId))),
       ];
       for (const [mi, m] of input.modules.entries()) {
         const moduleId = crypto.randomUUID();
         statements.push(
           db.insert(syllabusModule).values({
             id: moduleId,
             orgId: ctx.orgId,
             syllabusId: id,
             title: m.title,
             description: m.description,
             position: mi,
           }),
         );
         for (const [li, l] of m.lessons.entries()) {
           statements.push(
             db.insert(syllabusLesson).values({
               id: crypto.randomUUID(),
               orgId: ctx.orgId,
               moduleId,
               title: l.title,
               objectives: l.objectives,
               materials: l.materials,
               status: l.status,
               position: li,
             }),
           );
         }
       }
       await db.batch(statements);
       return c.json({ ok: true });
     });
     ```
- Success criteria: POST thay cây thành công trả `{ok:true}`; syllabus không tồn tại/sai org trả 404; body `{modules: []}` hoặc tổng nodes > 500 trả 400.
- Verify: Task 1.4 (chưa có UI gọi — khóa bằng test).

### Task 1.4 — Server tests khóa hành vi mới
- Goal: mọi hành vi mới của Phase 1 có test regression.
- Target files: `apps/server/src/kernel.test.ts` (thêm describe mới cạnh `"syllabus create with imported content"` dòng 531; dùng lại helper `createTestApp`, `t.call`, `insertUser` như describe đó).
- Steps:
  1. Test **edit preserve**: tạo syllabus qua `POST /api/syllabi` kèm `modules` chứa 1 lesson `status:"done"`; gọi edit-lesson body `{title:"B1 mới", objectives:"", materials:""}` (không status); GET `/api/syllabi` → lesson vẫn `status:"done"`, title là "B1 mới".
  2. Test **edit với status** (không regression đường cũ): body kèm `status:"current"` → GET trả `status:"current"`.
  3. Test **add default**: `POST .../modules/:mid/lessons` body không status → lesson mới `status:"upcoming"`.
  4. Test **replace thay cây**: tạo syllabus 2 module (M1 có 2 lessons, M2 rỗng) → POST `replace-content` với 1 module "Mới" 2 lessons → GET `/api/syllabi`: chỉ còn đúng module "Mới" với 2 lessons đúng thứ tự, titles đúng; **assert `totalLessons === 2` trên row trả về** (field có trong `KernelSyllabusRow`, contracts.ts:436 — khóa statement UPDATE totalLessons).
  5. Test **replace 404**: id uuid ngẫu nhiên → status 404.
  6. Test **replace 400**: `{modules: []}` → status 400.
  7. Test **replace cross-org là 404 và cây chủ sở hữu không đổi** (mirror pattern "foreign syllabus is 404" kernel.test.ts:1242): tạo app/org thứ hai + session riêng, POST replace-content vào syllabus của org đầu → 404; GET `/api/syllabi` bằng session org đầu → cây nguyên vẹn.
- Success criteria: cả 7 test pass, tên test mô tả đúng hành vi.
- Verify: `pnpm --filter server exec vitest run src/kernel.test.ts` exit 0, output chứa tên các test mới.

## Verification (regression gate toàn phase)

Chạy lần lượt, cả bốn phải đạt:
1. `pnpm --filter server test` → exit 0
2. `pnpm --filter web test` → exit 0 (web chưa đổi ở phase này — không được phá)
3. `pnpm check-types` → exit 0
4. `pnpm check` → exit 0 (biome tự format trước khi thoát)

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
