import type { CreatedResponse } from "@teacher-os/api/contracts";
import {
	lessonRemoveSchema,
	lessonUpsertSchema,
	moduleRemoveSchema,
	moduleUpsertSchema,
	reorderLessonsSchema,
	reorderModulesSchema,
} from "@teacher-os/api/contracts";
import { syllabusLessonMaterial } from "@teacher-os/db/schema/material";
import { syllabusLesson, syllabusModule } from "@teacher-os/db/schema/syllabus";
import { and, eq, inArray, max } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Context, Hono } from "hono";
import type { z } from "zod";

import type { Db, KernelCtx } from "../app";
import {
	findExistingMaterialIds,
	findModule,
	hasDuplicateIds,
	MAX_IMPORT_NODES,
	sameIdSet,
} from "../lib/syllabus-curriculum";

type Env = { Variables: { kernelCtx: KernelCtx } };
type SyllabusContext = Context<Env>;
type ReadBody = <S extends z.ZodType>(
	c: SyllabusContext,
	schema: S,
) => Promise<
	{ ok: true; data: z.infer<S> } | { ok: false; response: Response }
>;

/**
 * One set of module/lesson content handlers shared by every syllabus scope
 * (design D5, issue #394): mounted under `/syllabus-templates/:id` and
 * `/classes/:id/curriculum` (legacy `/syllabi/:id` alias removed in
 * phase 8, issue #401).
 * `resolve` returns the org-filtered syllabus the prefix stands for —
 * handlers only ever use `sy.id` and never read the URL's syllabus `:id`
 * param, so a class-scoped prefix cannot leak its class id in as a syllabus
 * id.
 */
export function mountContentRoutes(
	router: Hono<Env>,
	opts: {
		basePath: string;
		resolve: (
			c: SyllabusContext,
			db: Db,
			orgId: string,
		) => Promise<{ id: string } | undefined>;
		deps: { getDb(): Db };
		readBody: ReadBody;
		unauthorized: (c: SyllabusContext) => Response;
	},
) {
	const { basePath, resolve, deps, readBody, unauthorized } = opts;
	const { getDb } = deps;

	/**
	 * #655: dedupe + validate materialIds org-scoped (một câu select inArray
	 * duy nhất). Id lạ → 422 `{error:"material-not-found", materialId}` — id
	 * đầu tiên trong thứ tự gửi lên. Vắng mặt (undefined) coi như rỗng.
	 */
	async function resolveMaterialIds(
		c: SyllabusContext,
		db: Db,
		orgId: string,
		materialIds: string[] | undefined,
	): Promise<{ ok: true; ids: string[] } | { ok: false; response: Response }> {
		const ids = [...new Set(materialIds ?? [])];
		if (ids.length === 0) return { ok: true, ids };
		const existing = await findExistingMaterialIds(db, orgId, ids);
		const missing = ids.find((id) => !existing.has(id));
		if (missing !== undefined) {
			return {
				ok: false,
				response: c.json(
					{ error: "material-not-found", materialId: missing },
					422,
				),
			};
		}
		return { ok: true, ids };
	}

	/** Batch có ghi links `syllabus_lesson_material` (#655): tài liệu bị xoá
	 * giữa lúc validate và lúc batch làm FK NO ACTION lỗi — re-check rồi trả
	 * 422 nghiệp vụ thay vì 500 (pattern attach route `materials.ts`). */
	async function writeLessonBatchWithMaterialGuard(
		c: SyllabusContext,
		db: Db,
		orgId: string,
		materialIds: string[],
		statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
	): Promise<Response | null> {
		try {
			await db.batch(statements);
			return null;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (!/FOREIGN KEY/i.test(message)) throw err;
			const existing = await findExistingMaterialIds(db, orgId, materialIds);
			const missing = materialIds.find((id) => !existing.has(id));
			if (missing !== undefined) {
				return c.json(
					{ error: "material-not-found", materialId: missing },
					422,
				);
			}
			throw err;
		}
	}

	router.post(`${basePath}/modules`, async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, moduleUpsertSchema);
		if (!body.ok) return body.response;
		const input = body.data;
		const db = getDb();
		const sy = await resolve(c, db, ctx.orgId);
		if (!sy) {
			return c.json({ error: "syllabus not found" }, 404);
		}
		const syllabusId = sy.id;

		const [last] = await db
			.select({ max: max(syllabusModule.position) })
			.from(syllabusModule)
			.where(
				and(
					eq(syllabusModule.syllabusId, syllabusId),
					eq(syllabusModule.orgId, ctx.orgId),
				),
			);

		const moduleId = crypto.randomUUID();
		await db.insert(syllabusModule).values({
			id: moduleId,
			orgId: ctx.orgId,
			syllabusId,
			title: input.title,
			description: input.description,
			position: (last?.max ?? -1) + 1,
		});
		return c.json({ id: moduleId } satisfies CreatedResponse, 201);
	});

	router.post(`${basePath}/modules/reorder`, async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, reorderModulesSchema);
		if (!body.ok) return body.response;
		const { moduleIds } = body.data;
		if (hasDuplicateIds(moduleIds)) {
			return c.json({ error: "duplicate ids" }, 400);
		}
		const db = getDb();
		const sy = await resolve(c, db, ctx.orgId);
		if (!sy) {
			return c.json({ error: "syllabus not found" }, 404);
		}
		const id = sy.id;
		const siblings = await db
			.select({ id: syllabusModule.id })
			.from(syllabusModule)
			.where(
				and(
					eq(syllabusModule.syllabusId, id),
					eq(syllabusModule.orgId, ctx.orgId),
				),
			);
		if (siblings.length > MAX_IMPORT_NODES) {
			return c.json({ error: "too many modules to reorder" }, 422);
		}
		if (
			!sameIdSet(
				moduleIds,
				siblings.map((row) => row.id),
			)
		) {
			return c.json({ error: "set-mismatch" }, 409);
		}
		const statements = moduleIds.map((moduleId, position) =>
			db
				.update(syllabusModule)
				.set({ position })
				.where(
					and(
						eq(syllabusModule.id, moduleId),
						eq(syllabusModule.syllabusId, id),
						eq(syllabusModule.orgId, ctx.orgId),
					),
				),
		);
		const [first, ...rest] = statements;
		if (!first) {
			return c.json({ error: "set-mismatch" }, 409);
		}
		await db.batch([first, ...rest]);
		return c.json({ ok: true });
	});

	router.post(`${basePath}/modules/:mid`, async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, moduleUpsertSchema);
		if (!body.ok) return body.response;
		const input = body.data;
		const db = getDb();
		const { mid } = c.req.param();

		const sy = await resolve(c, db, ctx.orgId);
		if (!sy) {
			return c.json({ error: "syllabus not found" }, 404);
		}
		const mod = await findModule(db, mid, sy.id, ctx.orgId);
		if (!mod) {
			return c.json({ error: "module not found" }, 404);
		}

		await db
			.update(syllabusModule)
			.set({ title: input.title, description: input.description })
			.where(
				and(eq(syllabusModule.id, mid), eq(syllabusModule.orgId, ctx.orgId)),
			);
		return c.json({ ok: true });
	});

	router.post(`${basePath}/modules/:mid/remove`, async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, moduleRemoveSchema);
		if (!body.ok) return body.response;
		const db = getDb();
		const { mid } = c.req.param();
		const sy = await resolve(c, db, ctx.orgId);
		if (!sy) {
			return c.json({ error: "syllabus not found" }, 404);
		}
		const id = sy.id;
		const mod = await findModule(db, mid, id, ctx.orgId);
		if (!mod) {
			return c.json({ error: "module not found" }, 404);
		}
		await db.batch([
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
									eq(syllabusModule.id, mid),
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
						eq(syllabusModule.id, mid),
						eq(syllabusModule.syllabusId, id),
						eq(syllabusModule.orgId, ctx.orgId),
					),
				),
		]);
		return c.json({ ok: true });
	});

	router.post(`${basePath}/modules/:mid/lessons`, async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, lessonUpsertSchema);
		if (!body.ok) return body.response;
		const input = body.data;
		const db = getDb();
		const { mid } = c.req.param();

		const sy = await resolve(c, db, ctx.orgId);
		if (!sy) {
			// Lesson upserts report at the lesson level (contract giữ từ
			// kernel.ts cũ): syllabus không tìm thấy vẫn là lesson not found.
			return c.json({ error: "lesson not found" }, 404);
		}
		const mod = await findModule(db, mid, sy.id, ctx.orgId);
		if (!mod) {
			return c.json({ error: "module not found" }, 404);
		}

		const [last] = await db
			.select({ max: max(syllabusLesson.position) })
			.from(syllabusLesson)
			.where(
				and(
					eq(syllabusLesson.moduleId, mid),
					eq(syllabusLesson.orgId, ctx.orgId),
				),
			);

		const materials = await resolveMaterialIds(
			c,
			db,
			ctx.orgId,
			input.materialIds,
		);
		if (!materials.ok) return materials.response;

		const lessonId = crypto.randomUUID();
		const lessonValues = {
			id: lessonId,
			orgId: ctx.orgId,
			moduleId: mid,
			title: input.title,
			objectives: input.objectives,
			materials: input.materials,
			kind: input.kind ?? "lesson",
			status: input.status ?? "upcoming",
			position: (last?.max ?? -1) + 1,
		};
		if (materials.ids.length === 0) {
			await db.insert(syllabusLesson).values(lessonValues);
			return c.json({ id: lessonId } satisfies CreatedResponse, 201);
		}
		// #655: bài học + links tài liệu ngân hàng trong cùng một batch nguyên
		// tử — position 0..n-1 theo thứ tự gửi lên.
		const guard = await writeLessonBatchWithMaterialGuard(
			c,
			db,
			ctx.orgId,
			materials.ids,
			[
				db.insert(syllabusLesson).values(lessonValues),
				...materials.ids.map((materialId, position) =>
					db.insert(syllabusLessonMaterial).values({
						orgId: ctx.orgId,
						syllabusLessonId: lessonId,
						materialId,
						position,
					}),
				),
			],
		);
		if (guard) return guard;
		return c.json({ id: lessonId } satisfies CreatedResponse, 201);
	});

	router.post(`${basePath}/modules/:mid/lessons/reorder`, async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, reorderLessonsSchema);
		if (!body.ok) return body.response;
		const { lessonIds } = body.data;
		if (hasDuplicateIds(lessonIds)) {
			return c.json({ error: "duplicate ids" }, 400);
		}
		const db = getDb();
		const { mid } = c.req.param();
		const sy = await resolve(c, db, ctx.orgId);
		if (!sy) {
			return c.json({ error: "syllabus not found" }, 404);
		}
		const mod = await findModule(db, mid, sy.id, ctx.orgId);
		if (!mod) {
			return c.json({ error: "module not found" }, 404);
		}
		const siblings = await db
			.select({ id: syllabusLesson.id })
			.from(syllabusLesson)
			.where(
				and(
					eq(syllabusLesson.moduleId, mid),
					eq(syllabusLesson.orgId, ctx.orgId),
				),
			);
		if (siblings.length > MAX_IMPORT_NODES) {
			return c.json({ error: "too many lessons to reorder" }, 422);
		}
		if (
			!sameIdSet(
				lessonIds,
				siblings.map((row) => row.id),
			)
		) {
			return c.json({ error: "set-mismatch" }, 409);
		}
		const statements = lessonIds.map((lessonId, position) =>
			db
				.update(syllabusLesson)
				.set({ position })
				.where(
					and(
						eq(syllabusLesson.id, lessonId),
						eq(syllabusLesson.moduleId, mid),
						eq(syllabusLesson.orgId, ctx.orgId),
					),
				),
		);
		const [first, ...rest] = statements;
		if (!first) {
			return c.json({ error: "set-mismatch" }, 409);
		}
		await db.batch([first, ...rest]);
		return c.json({ ok: true });
	});

	router.post(`${basePath}/modules/:mid/lessons/:lid`, async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, lessonUpsertSchema);
		if (!body.ok) return body.response;
		const input = body.data;
		const db = getDb();
		const { mid, lid } = c.req.param();

		const sy = await resolve(c, db, ctx.orgId);
		if (!sy) {
			// Contract giữ từ kernel.ts cũ: lesson upsert báo lỗi ở mức lesson.
			return c.json({ error: "lesson not found" }, 404);
		}
		const [lesson] = await db
			.select({
				id: syllabusLesson.id,
				kind: syllabusLesson.kind,
				status: syllabusLesson.status,
			})
			.from(syllabusLesson)
			.innerJoin(syllabusModule, eq(syllabusLesson.moduleId, syllabusModule.id))
			.where(
				and(
					eq(syllabusLesson.id, lid),
					eq(syllabusLesson.moduleId, mid),
					eq(syllabusModule.syllabusId, sy.id),
					eq(syllabusLesson.orgId, ctx.orgId),
				),
			);
		if (!lesson) {
			return c.json({ error: "lesson not found" }, 404);
		}

		const lessonUpdate = db
			.update(syllabusLesson)
			.set({
				title: input.title,
				objectives: input.objectives,
				materials: input.materials,
				// Body không có kind/status (form lớp) → giữ nguyên giá trị hiện tại.
				kind: input.kind ?? lesson.kind,
				status: input.status ?? lesson.status,
			})
			.where(
				and(eq(syllabusLesson.id, lid), eq(syllabusLesson.orgId, ctx.orgId)),
			);

		// #655: body CÓ materialIds → replace-all links (delete theo lessonId +
		// insert lại, cùng batch với update bài học); VẮNG → không đụng links.
		if (input.materialIds === undefined) {
			await lessonUpdate;
			return c.json({ ok: true });
		}
		const materials = await resolveMaterialIds(
			c,
			db,
			ctx.orgId,
			input.materialIds,
		);
		if (!materials.ok) return materials.response;
		const guard = await writeLessonBatchWithMaterialGuard(
			c,
			db,
			ctx.orgId,
			materials.ids,
			[
				lessonUpdate,
				db
					.delete(syllabusLessonMaterial)
					.where(
						and(
							eq(syllabusLessonMaterial.orgId, ctx.orgId),
							eq(syllabusLessonMaterial.syllabusLessonId, lid),
						),
					),
				...materials.ids.map((materialId, position) =>
					db.insert(syllabusLessonMaterial).values({
						orgId: ctx.orgId,
						syllabusLessonId: lid,
						materialId,
						position,
					}),
				),
			],
		);
		if (guard) return guard;
		return c.json({ ok: true });
	});

	router.post(`${basePath}/modules/:mid/lessons/:lid/remove`, async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, lessonRemoveSchema);
		if (!body.ok) return body.response;
		const db = getDb();
		const { mid, lid } = c.req.param();
		const sy = await resolve(c, db, ctx.orgId);
		if (!sy) {
			return c.json({ error: "syllabus not found" }, 404);
		}
		const mod = await findModule(db, mid, sy.id, ctx.orgId);
		if (!mod) {
			return c.json({ error: "module not found" }, 404);
		}
		const [row] = await db
			.select({ id: syllabusLesson.id })
			.from(syllabusLesson)
			.where(
				and(
					eq(syllabusLesson.id, lid),
					eq(syllabusLesson.moduleId, mid),
					eq(syllabusLesson.orgId, ctx.orgId),
				),
			);
		if (!row) {
			return c.json({ error: "lesson not found" }, 404);
		}
		await db
			.delete(syllabusLesson)
			.where(
				and(
					eq(syllabusLesson.id, lid),
					eq(syllabusLesson.moduleId, mid),
					eq(syllabusLesson.orgId, ctx.orgId),
				),
			);
		return c.json({ ok: true });
	});
}
