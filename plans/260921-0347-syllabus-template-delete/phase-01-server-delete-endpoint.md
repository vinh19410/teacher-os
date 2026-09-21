---
title: "Phase 1: server-delete-endpoint"
status: todo
---

# Phase 1 — Server endpoint xóa template

## Goal

Thêm endpoint `POST /api/syllabi/:id/remove` hard-delete một syllabus template kèm toàn bộ cây modules/lessons trong 1 atomic batch, không ảnh hưởng bất kỳ bản copy nào mà lớp đã import.

## Bối cảnh & căn cứ

Tất cả line number dưới đây đã được đọc và verify trực tiếp.

- **Deep-copy architecture** — lớp đã import độc lập runtime với template: helper `buildImportBatch` (`apps/server/src/routes/kernel.ts:239-303`) insert row `syllabus` mới với `classId = <lớp>` (kernel.ts:271) và `sourceTemplateId = template.id` (kernel.ts:272) cùng modules/lessons là UUID mới. `POST /classes/:id/import-syllabus` (kernel.ts:842-895) update `class.syllabusId` trỏ vào bản copy (kernel.ts:874-881); create-class với `templateId` cũng dùng cùng helper (kernel.ts:813-838). Vì vậy hard-delete template an toàn cho mọi lớp đã import.
- **Guard mirror**: import handler từ chối row không phải template bằng `!tpl || tpl.classId !== null` → 404 (kernel.ts:859-862). Endpoint xóa mirror ngược lại: từ chối row là bản copy của lớp.
- **Pattern batch xóa**: `POST /classes/:id/remove-curriculum` (kernel.ts:897-978) — org-scoped guard, batch: null pointer trước (FK NO ACTION) → delete lessons qua subquery modules → delete modules → delete syllabus, mọi statement kèm `eq(...orgId, ctx.orgId)`. Convention repo: "Delete explicit qua subquery — không dựa FK cascade (same rule as module-remove). One atomic batch." (kernel.ts:1565-1567).
- **Schema**:
  - `packages/db/src/schema/syllabus.ts:29-43` — `classId` NULL = template, class id = bản copy (unique index `syllabus_class_unique` WHERE class_id IS NOT NULL, dòng 47-49); `sourceTemplateId` là **logical FK only** (comment dòng 35-39: SQLite không thể ALTER TABLE ADD FK — khai báo Drizzle `.references(..., { onDelete: "set null" })` ở dòng 40-43 nhưng FK này KHÔNG tồn tại trong DB thật) → batch xóa phải tự UPDATE set null.
  - `packages/db/src/schema/class.ts:23` — `class.syllabusId` là real FK (không khai báo onDelete → NO ACTION) → nếu có class nào trỏ thẳng template (legacy anomaly, mô phỏng ở test matrix 9) thì delete syllabus sẽ bị chặn trừ khi null pointer trước.
- **Helpers có sẵn trong kernel.ts**: `unauthorized` (kernel.ts:148-150), `readBody` (kernel.ts:152-169), `findSyllabus(db, id, orgId)` (kernel.ts:191-197), imports schema từ `@teacher-os/api/contracts` (kernel.ts:5-28, `removeCurriculumSchema` ở dòng 20), imports table `classTable` (kernel.ts:37), `syllabus`/`syllabusModule`/`syllabusLesson` (kernel.ts:49-53), `and/eq/inArray` (kernel.ts:54).
- **Contracts pattern**: `removeCurriculumSchema = z.object({}).strict()` kèm comment + exported type (`packages/api/src/contracts.ts:109-111`); `importSyllabusSchema` ở dòng 104-107.
- **Test convention**: `apps/server/src/kernel.test.ts` — helpers `t.call` (108-129), `t.kernel(session)` (212-216), `t.createClass` (219-247), `t.createSyllabus` (249-267), `t.createModule` (269-281), `t.orgIdOf` (138-142), `t.db` (312). Describe "import syllabus + remove curriculum (issue #79)" (2611) có helper local `addLesson` (2618-2635) và `importSyllabus` (2637-2647), matrix 8 (2793-2818), matrix 9 với anomaly setup `t.db.update(classTable).set({ syllabusId: templateId })` (2820-2843, setup 2823-2826).
- **Lưu ý đánh số test**: số "matrix 10" và "matrix 11" đã bị chiếm — "matrix 5+10" (kernel.test.ts:2728) và "matrix 11" (kernel.test.ts:2878); số cao nhất đang dùng là matrix 14 (kernel.test.ts:2908). Test mới dùng **matrix 15** và **matrix 16**.

## Yêu cầu

- [ ] `deleteSyllabusSchema = z.object({}).strict()` + export type `DeleteSyllabus` trong `packages/api/src/contracts.ts`, đặt cạnh `removeCurriculumSchema` (sau dòng 111)
- [ ] Endpoint `POST /syllabi/:id/remove` trong kernel.ts, cuối nhóm syllabi routes: guard `kernelCtx` → `readBody` → `findSyllabus` → 404 khi thiếu hoặc `classId !== null` → 1 atomic `db.batch` 5 statement (mọi statement org-scoped) → `{ ok: true }` 200
- [ ] Batch order: null class pointers → null sourceTemplateId của các copy → delete lessons (subquery modules) → delete modules → delete syllabus
- [ ] Test matrix 15: xóa template thành công; bản copy của lớp đã import sống sót nguyên vẹn cây; pointer lớp còn; `sourceTemplateId` copy thành null; import lại với templateId đã xóa → 404
- [ ] Test matrix 16: gọi endpoint với id bản copy của lớp → 404, copy vẫn còn
- [ ] Test anomaly: class trỏ thẳng template → endpoint vẫn xóa được template và null pointer
- [ ] Test org-scoping: template của org khác → 404
- [ ] `pnpm --filter server test` pass toàn bộ (cũ + mới)

## Files tạo/sửa

| Đường dẫn | Action | Mô tả | Phụ thuộc |
|-----------|--------|-------|-----------|
| `/Users/vinhtran/Documents/project/personal/teacher-os/packages/api/src/contracts.ts` | modify | Thêm `deleteSyllabusSchema` + type `DeleteSyllabus` sau `removeCurriculumSchema` (sau dòng 111) | Không |
| `/Users/vinhtran/Documents/project/personal/teacher-os/apps/server/src/routes/kernel.ts` | modify | Import schema mới vào import-block hiện có (kernel.ts:5-28); thêm endpoint cuối nhóm syllabi (sau endpoint bắt đầu ở dòng 1949) | contracts.ts |
| `/Users/vinhtran/Documents/project/personal/teacher-os/apps/server/src/kernel.test.ts` | modify | Thêm describe mới "delete syllabus template (xóa template giáo trình)" sau describe "import syllabus + remove curriculum (issue #79)" (kết thúc trước dòng 2933) | kernel.ts endpoint |

## Các bước triển khai

1. **contracts.ts** — thêm sau dòng 111 (ngay sau `removeCurriculumSchema` và type của nó):

   ```ts
   /** Xóa một syllabus template (hard delete cây module/lesson). Bản copy
    * của các lớp đã import không bị ảnh hưởng — deep-copy độc lập. */
   export const deleteSyllabusSchema = z.object({}).strict();
   export type DeleteSyllabus = z.infer<typeof deleteSyllabusSchema>;
   ```

2. **kernel.ts imports** — thêm `deleteSyllabusSchema` vào import-block từ `@teacher-os/api/contracts` (kernel.ts:5-28, giữ thứ tự alphabet như list hiện có — chèn sau dòng 9 `enrollStudentSchema` / trước `importSyllabusSchema` dòng 10 tùy alphabet: `deleteSyllabusSchema` đứng trước `enrollStudentSchema`).

3. **kernel.ts endpoint** — thêm cuối nhóm syllabi routes (sau endpoint `POST /syllabi/:id/modules/:mid/lessons/:lid/remove` bắt đầu ở kernel.ts:1949). Mirror cấu trúc guard của `replace-content` (kernel.ts:1568-1577) và batch của `remove-curriculum` (kernel.ts:941-976):

   ```ts
   // Xóa template giáo trình (hard delete cả cây module/lesson). Bản copy của
   // các lớp đã import là deep-copy độc lập (buildImportBatch, issue #79) nên
   // không bị ảnh hưởng; chỉ cần detach provenance vì source_template_id là
   // logical FK only (SQLite không có FK thật để tự set null).
   kernel.post("/syllabi/:id/remove", async (c) => {
   	const ctx = c.get("kernelCtx");
   	if (!ctx) return unauthorized(c);
   	const body = await readBody(c, deleteSyllabusSchema);
   	if (!body.ok) return body.response;
   	const db = deps.getDb();
   	const id = c.req.param("id");

   	const sy = await findSyllabus(db, id, ctx.orgId);
   	if (!sy) return c.json({ error: "syllabus not found" }, 404);
   	// Mirror guard import handler: bản copy của lớp chỉ được xóa qua
   	// remove-curriculum phía lớp; 404 che tồn tại (consistent kernel.ts:859-862).
   	if (sy.classId !== null) {
   		return c.json({ error: "syllabus not found" }, 404);
   	}

   	// FK order (NO ACTION trên class.syllabus_id): null pointer trước, rồi
   	// detach provenance, rồi delete explicit child-first qua subquery —
   	// không dựa FK cascade (same rule as remove-curriculum). Mọi statement
   	// org-scoped.
   	await db.batch([
   		db
   			.update(classTable)
   			.set({ syllabusId: null })
   			.where(
   				and(
   					eq(classTable.syllabusId, id),
   					eq(classTable.orgId, ctx.orgId),
   				),
   			),
   		db
   			.update(syllabus)
   			.set({ sourceTemplateId: null })
   			.where(
   				and(
   					eq(syllabus.sourceTemplateId, id),
   					eq(syllabus.orgId, ctx.orgId),
   				),
   			),
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
   		db
   			.delete(syllabusModule)
   			.where(
   				and(
   					eq(syllabusModule.syllabusId, id),
   					eq(syllabusModule.orgId, ctx.orgId),
   				),
   			),
   		db
   			.delete(syllabus)
   			.where(and(eq(syllabus.id, id), eq(syllabus.orgId, ctx.orgId))),
   	]);
   	return c.json({ ok: true });
   });
   ```

   (Lưu ý: không cần `try/catch` quanh batch — khác import (race unique index, kernel.ts:882-893), ở đây không có race nào cần reconcile; lỗi thật sẽ 500 như mọi endpoint khác.)

4. **kernel.test.ts** — thêm describe mới sau describe "import syllabus + remove curriculum (issue #79)" (kết thúc trước dòng 2933 — dòng `describe("lesson check-in/cancel (Wave 4)"...)`), mirror fixture style (beforeAll 2649-2660) và helper local:

   ```ts
   describe("delete syllabus template (xóa template giáo trình)", () => {
   	let t: Awaited<ReturnType<typeof createTestApp>>;
   	let session: TestSession;
   	// Helper local mirror của describe import (kernel.test.ts:2618-2647).
   	async function importSyllabus(
   		session: TestSession,
   		classId: string,
   		templateId: string,
   	) {
   		return t.call(`/api/classes/${classId}/import-syllabus`, {
   			session,
   			method: "POST",
   			body: { templateId },
   		});
   	}

   	beforeAll(async () => {
   		t = await createTestApp();
   		session = await t.insertUser("Cô Xóa Syllabus");
   	});

   	test("matrix 15: delete-syllabus xóa template, bản copy của lớp đã import sống sót nguyên vẹn", async () => {
   		const templateId = await t.createSyllabus(session, "Template sẽ xóa");
   		const moduleAId = await t.createModule(session, templateId, "Module A");
   		await t.createModule(session, templateId, "Module B");
   		// Thêm 1 lesson qua endpoint (mirror addLesson, kernel.test.ts:2618-2635).
   		const lessonRes = await t.call(
   			`/api/syllabi/${templateId}/modules/${moduleAId}/lessons`,
   			{ session, method: "POST", body: { title: "L1", objectives: "", materials: "" } },
   		);
   		expect(lessonRes.status).toBe(201);

   		// Lớp đã import trước khi xóa.
   		const classId = await t.createClass(session, "Lớp đã dùng template");
   		const copyRes = await importSyllabus(session, classId, templateId);
   		expect(copyRes.status).toBe(201);
   		const copyId = ((await copyRes.json()) as { id: string }).id;

   		const remove = await t.call(`/api/syllabi/${templateId}/remove`, {
   			session,
   			method: "POST",
   			body: {},
   		});
   		expect(remove.status).toBe(200);

   		const snapshot = await t.kernel(session);
   		// Template + cây biến mất.
   		expect(snapshot.syllabi.some((s) => s.id === templateId)).toBe(false);
   		// Bản copy của lớp sống sót nguyên vẹn cây (2 modules + 1 lesson).
   		const copy = snapshot.syllabi.find((s) => s.id === copyId);
   		expect(copy?.classId).toBe(classId);
   		expect(copy?.modules).toHaveLength(2);
   		expect(copy?.modules.flatMap((m) => m.lessons)).toHaveLength(1);
   		// Provenance detached (logical FK phải tự null).
   		expect(copy?.sourceTemplateId).toBeNull();
   		// Pointer của lớp vẫn trỏ vào copy.
   		expect(snapshot.classes.find((c) => c.id === classId)?.syllabusId).toBe(
   			copyId,
   		);
   		// Module gốc của template cũng biến mất (không còn row mồ côi).
   		// (Assert qua snapshot: mọi module thuộc copy đều có id mới — đã đảm bảo
   		// bởi import; row template-module bị delete khỏi DB.)

   		// Lớp mới không thể chọn template đã xóa.
   		const newClassId = await t.createClass(session, "Lớp mới sau xóa");
   		expect(
   			(await importSyllabus(session, newClassId, templateId)).status,
   		).toBe(404);
   	});

   	test("matrix 16: delete-syllabus từ chối bản copy của lớp (mirror guard import handler)", async () => {
   		const templateId = await t.createSyllabus(session, "Template giữ nguyên");
   		await t.createModule(session, templateId, "Module A");
   		const classId = await t.createClass(session, "Lớp copy bị nhắm");
   		const copyRes = await importSyllabus(session, classId, templateId);
   		const copyId = ((await copyRes.json()) as { id: string }).id;

   		const res = await t.call(`/api/syllabi/${copyId}/remove`, {
   			session,
   			method: "POST",
   			body: {},
   		});
   		expect(res.status).toBe(404);
   		// Copy vẫn còn nguyên.
   		const snapshot = await t.kernel(session);
   		expect(snapshot.syllabi.some((s) => s.id === copyId)).toBe(true);
   		expect(snapshot.syllabi.some((s) => s.id === templateId)).toBe(true);
   	});

   	test("anomaly: class trỏ thẳng template vẫn cho xóa template và null pointer", async () => {
   		const templateId = await t.createSyllabus(session, "Template bị trỏ thẳng");
   		const classId = await t.createClass(session, "Lớp pointer lệch");
   		// Legacy anomaly simulation — mirror matrix 9 setup (kernel.test.ts:2821-2826).
   		await t.db
   			.update(classTable)
   			.set({ syllabusId: templateId })
   			.where(eq(classTable.id, classId));

   		const res = await t.call(`/api/syllabi/${templateId}/remove`, {
   			session,
   			method: "POST",
   			body: {},
   		});
   		expect(res.status).toBe(200);
   		const snapshot = await t.kernel(session);
   		expect(snapshot.syllabi.some((s) => s.id === templateId)).toBe(false);
   		expect(
   			snapshot.classes.find((c) => c.id === classId)?.syllabusId,
   		).toBeNull();
   	});

   	test("org-scoping: template của org khác là 404", async () => {
   		const other = await t.insertUser("Cô Org Khác");
   		const foreignId = await t.createSyllabus(other, "Template người khác");
   		const res = await t.call(`/api/syllabi/${foreignId}/remove`, {
   			session,
   			method: "POST",
   			body: {},
   		});
   		expect(res.status).toBe(404);
   		const snapshot = await t.kernel(session);
   		expect(snapshot.syllabi.some((s) => s.id === foreignId)).toBe(false);
   	});
   });
   ```

   Lưu ý: describe mới cần các import đã có sẵn ở đầu file test (`classTable`, `eq` — đã được dùng ở matrix 9, dòng 2823-2826). `TestSession` type đã được dùng ở các describe khác.

5. Chạy `pnpm --filter server test` và sửa cho đến khi xanh.

## Todo

- [ ] Thêm `deleteSyllabusSchema` + `DeleteSyllabus` vào contracts.ts
- [ ] Thêm import schema vào kernel.ts import-block
- [ ] Thêm endpoint `POST /syllabi/:id/remove` vào kernel.ts
- [ ] Thêm describe test mới (matrix 15, 16, anomaly, org-scoping) vào kernel.test.ts
- [ ] `pnpm --filter server test` pass

## Verification

```bash
pnpm --filter server test
```

Mong đợi: toàn bộ test cũ pass + 4 test mới trong describe "delete syllabus template" pass:
- matrix 15: template biến mất, copy sống nguyên, `sourceTemplateId` null, pointer lớp giữ nguyên, import lại 404
- matrix 16: xóa copyId → 404, copy + template còn nguyên
- anomaly: xóa template bị trỏ thẳng → 200, pointer lớp thành null
- org-scoping: template org khác → 404, không bị xóa

Kiểu dữ liệu (chạy nếu nghi ngờ type): `pnpm --filter server check-types` (`tsc -b`, apps/server/package.json:12).

## Rủi ro & mitigations

| Rủi ro | Khả năng | Tác động | Mitigation |
|--------|----------|----------|------------|
| FK NO ACTION trên `class.syllabus_id` (class.ts:23) chặn batch delete khi có anomaly pointer | Thấp (chỉ legacy data) | Batch abort 500 | Statement (a) null pointer trong CÙNG batch, chạy TRƯỚC delete — anomaly được dọn sạch |
| `source_template_id` không được null → copy giữ id trỏ vào row đã xóa ("mồ côi provenance") | Chắc chắn nếu quên statement (b) | Dữ liệu tham chiếu chết, badge "Đang dùng" sai (data-provider.tsx:139-144 join theo sourceTemplateId) | Statement (b) UPDATE set null trong batch — đã có test matrix 15 assert |
| Gọi xóa 2 lần (double-click / retry) | Trung bình | Lần 2 trả 404 — khác idempotent 200 của remove-curriculum | Chấp nhận 404: sau lần 1 template biến khỏi UI (snapshot refresh) nên không còn đường click; 404 cũng là semantic đúng ("không còn tồn tại") |
| Test D1 batch limit: template quá lớn làm batch vượt giới hạn | Thấp | Endpoint 500 | Template cũng bị giới hạn 500 nodes khi import (MAX_IMPORT_NODES, kernel.ts:230) — cây tồn tại trong thực tế luôn ≤ 500 nodes; không cần guard thêm |
| Race: lớp đang import template đúng lúc template bị xóa | Rất thấp | Import fail 404 (template đã biến) hoặc thành công trên cây vừa đọc — cả hai đều an toàn về dữ liệu | Không cần xử lý: import đọc template trước khi batch; kết quả cuối cùng luôn nhất quán (copy tồn tại hoặc 404) |

## Security

- **Auth**: guard `kernelCtx` đầu endpoint (mirror mọi endpoint kernel, kernel.ts:843-844) — request không có session trả 401.
- **Org-scoping**: `findSyllabus(db, id, ctx.orgId)` lọc theo org (kernel.ts:191-197) — template org khác → 404 như không tồn tại; mọi statement trong batch kèm `eq(...orgId, ctx.orgId)`.
- **Che tồn tại bản copy**: `classId !== null` → 404 (không tiết lộ row thuộc lớp nào) — consistent với import handler (kernel.ts:859-862).
- **CSRF-safe**: body rỗng `z.object({}).strict()` — không có field nào để forged request gán payload; convention giống check-in/cancel/remove-curriculum (kernel.ts:100-106 comment).
