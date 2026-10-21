import type { CreatedResponse } from "@teacher-os/api/contracts";
import {
	deleteSyllabusSchema,
	importSyllabusSchema,
	lessonRemoveSchema,
	lessonUpsertSchema,
	moduleRemoveSchema,
	moduleUpsertSchema,
	removeCurriculumSchema,
	reorderLessonsSchema,
	reorderModulesSchema,
	syllabusCreateSchema,
	syllabusReplaceContentSchema,
} from "@teacher-os/api/contracts";
import { classTable } from "@teacher-os/db/schema/class";
import {
	syllabus,
	syllabusLesson,
	syllabusModule,
} from "@teacher-os/db/schema/syllabus";
import { and, eq, inArray, max } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { z } from "zod";

import type { Db, KernelCtx } from "../app";
import {
	buildImportBatch,
	findModule,
	findSyllabus,
	hasDuplicateIds,
	MAX_IMPORT_NODES,
	sameIdSet,
	selectTemplateTree,
} from "../lib/syllabus-curriculum";
import { loadSnapshot } from "./snapshot";

type Env = { Variables: { kernelCtx: KernelCtx } };
type SyllabusContext = Context<Env>;

/**
 * Syllabus + curriculum router. Mounted INSIDE kernelRoutes via
 * kernel.route("/", ...) so the kernel router's Origin + JSON content-type
 * CSRF guard covers these routes too — never mount this standalone.
 */
export function syllabusRoutes(deps: { getDb(): Db }) {
	const routes = new Hono<Env>();

	function unauthorized(c: SyllabusContext) {
		return c.json({ error: "unauthorized" }, 401);
	}

	async function readBody<S extends z.ZodType>(
		c: SyllabusContext,
		schema: S,
	): Promise<
		{ ok: true; data: z.infer<S> } | { ok: false; response: Response }
	> {
		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return { ok: false, response: c.json({ error: "invalid json" }, 400) };
		}
		const parsed = schema.safeParse(raw);
		if (!parsed.success) {
			return { ok: false, response: c.json({ error: "invalid body" }, 400) };
		}
		return { ok: true, data: parsed.data };
	}

	/** Class row for write paths: only existence + the syllabus pointer. */
	async function findClassPointer(db: Db, classId: string, orgId: string) {
		const [row] = await db
			.select({ id: classTable.id, syllabusId: classTable.syllabusId })
			.from(classTable)
			.where(and(eq(classTable.id, classId), eq(classTable.orgId, orgId)));
		return row;
	}

	routes.post("/classes/:id/import-syllabus", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, importSyllabusSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();
		const classId = c.req.param("id");

		const cls = await findClassPointer(db, classId, ctx.orgId);
		if (!cls) {
			return c.json({ error: "class not found" }, 404);
		}
		// Deterministic duplicate check — never parse SQLite error strings.
		if (cls.syllabusId !== null) {
			return c.json({ error: "Lớp đã có giáo trình" }, 409);
		}

		const tpl = await findSyllabus(db, body.data.templateId, ctx.orgId);
		if (!tpl || tpl.classId !== null) {
			return c.json({ error: "syllabus not found" }, 404);
		}
		const tree = await selectTemplateTree(db, tpl.id, ctx.orgId);
		if (tree.modules.length + tree.lessons.length > MAX_IMPORT_NODES) {
			return c.json({ error: "Template quá lớn để import" }, 422);
		}

		const { copyId, statements } = buildImportBatch(db, {
			template: tpl,
			...tree,
			classId,
			orgId: ctx.orgId,
		});
		statements.push(
			db
				.update(classTable)
				.set({ syllabusId: copyId })
				.where(
					and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)),
				),
		);
		try {
			await db.batch(statements);
		} catch {
			// Unique index race backstop: only a concurrent import surfaces
			// here as a set pointer — re-check instead of swallowing real
			// errors into a 409.
			const after = await findClassPointer(db, classId, ctx.orgId);
			if (after?.syllabusId != null) {
				return c.json({ error: "Lớp đã có giáo trình" }, 409);
			}
			throw new Error("import-syllabus batch failed");
		}
		return c.json({ id: copyId } satisfies CreatedResponse, 201);
	});

	routes.post("/classes/:id/remove-curriculum", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, removeCurriculumSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();
		const classId = c.req.param("id");

		const cls = await findClassPointer(db, classId, ctx.orgId);
		if (!cls) {
			return c.json({ error: "class not found" }, 404);
		}
		// Pointer empty → nothing to remove (idempotent no-op).
		if (cls.syllabusId === null) {
			return c.json({ ok: true });
		}
		// Org + ownership guard: the pointed row must be THIS class's copy.
		// A template pointer (class_id NULL) or a foreign anomaly is refused —
		// templates are never deleted through this endpoint.
		const [copy] = await db
			.select({ id: syllabus.id })
			.from(syllabus)
			.where(
				and(
					eq(syllabus.id, cls.syllabusId),
					eq(syllabus.classId, classId),
					eq(syllabus.orgId, ctx.orgId),
				),
			);
		if (!copy) {
			// Legacy anomaly: the pointer targets a template, a foreign-org
			// row, or a deleted row. Cleanup = null this class's pointer only;
			// the pointed row (templates included) is never deleted here.
			await db
				.update(classTable)
				.set({ syllabusId: null })
				.where(
					and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)),
				);
			return c.json({ ok: true });
		}

		// FK order (NO ACTION): null the pointer FIRST, then delete
		// child-first (lessons → modules → syllabus), every DELETE org-scoped.
		await db.batch([
			db
				.update(classTable)
				.set({ syllabusId: null })
				.where(
					and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)),
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
									eq(syllabusModule.syllabusId, copy.id),
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
						eq(syllabusModule.syllabusId, copy.id),
						eq(syllabusModule.orgId, ctx.orgId),
					),
				),
			db
				.delete(syllabus)
				.where(and(eq(syllabus.id, copy.id), eq(syllabus.orgId, ctx.orgId))),
		]);
		return c.json({ ok: true });
	});
	routes.get("/syllabi", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const snapshot = await loadSnapshot(deps.getDb(), ctx.orgId);
		return c.json(snapshot.syllabi);
	});

	routes.post(
		"/syllabi",
		async (c, next) => {
			if (!c.get("kernelCtx")) return unauthorized(c);
			return next();
		},
		bodyLimit({
			maxSize: 2 * 1024 * 1024,
			onError: (c) =>
				c.json({ error: "Dữ liệu syllabus vượt giới hạn 2 MiB." }, 413),
		}),
	);

	routes.post("/syllabi", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, syllabusCreateSchema);
		if (!body.ok) return body.response;
		const input = body.data;
		const db = deps.getDb();

		const syllabusId = crypto.randomUUID();
		// One atomic batch: syllabus + imported modules/lessons (issue #144).
		// Tuple type is required by db.batch (drizzle); same shape as
		// buildImportBatch (issue #79).
		const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
			db.insert(syllabus).values({
				id: syllabusId,
				orgId: ctx.orgId,
				name: input.name,
				level: input.level,
				type: input.type,
				skills: JSON.stringify(input.skills),
				description: input.description,
				totalLessons: input.totalLessons,
			}),
		];
		for (const [mi, m] of (input.modules ?? []).entries()) {
			const moduleId = crypto.randomUUID();
			statements.push(
				db.insert(syllabusModule).values({
					id: moduleId,
					orgId: ctx.orgId,
					syllabusId,
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
						kind: l.kind,
						status: l.status,
						position: li,
					}),
				);
			}
		}
		await db.batch(statements);
		return c.json({ id: syllabusId } satisfies CreatedResponse, 201);
	});

	// Replace toàn bộ cây module/lesson của một syllabus (import ghi đè ở màn
	// hình detail, issue #152). Delete explicit qua subquery — không dựa FK
	// cascade (same rule as module-remove). One atomic batch.
	routes.post("/syllabi/:id/replace-content", async (c) => {
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
			db
				.delete(syllabusModule)
				.where(
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
						kind: l.kind,
						status: l.status,
						position: li,
					}),
				);
			}
		}
		await db.batch(statements);
		return c.json({ ok: true });
	});

	routes.post("/syllabi/:id/modules", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, moduleUpsertSchema);
		if (!body.ok) return body.response;
		const input = body.data;
		const db = deps.getDb();
		const syllabusId = c.req.param("id");

		const sy = await findSyllabus(db, syllabusId, ctx.orgId);
		if (!sy) {
			return c.json({ error: "syllabus not found" }, 404);
		}

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

	routes.post("/syllabi/:id/modules/reorder", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, reorderModulesSchema);
		if (!body.ok) return body.response;
		const { moduleIds } = body.data;
		if (hasDuplicateIds(moduleIds)) {
			return c.json({ error: "duplicate ids" }, 400);
		}
		const db = deps.getDb();
		const id = c.req.param("id");
		const sy = await findSyllabus(db, id, ctx.orgId);
		if (!sy) {
			return c.json({ error: "syllabus not found" }, 404);
		}
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

	routes.post("/syllabi/:id/modules/:mid", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, moduleUpsertSchema);
		if (!body.ok) return body.response;
		const input = body.data;
		const db = deps.getDb();
		const { id, mid } = c.req.param();

		const mod = await findModule(db, mid, id, ctx.orgId);
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

	routes.post("/syllabi/:id/modules/:mid/remove", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, moduleRemoveSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();
		const { id, mid } = c.req.param();
		const sy = await findSyllabus(db, id, ctx.orgId);
		if (!sy) {
			return c.json({ error: "syllabus not found" }, 404);
		}
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

	routes.post("/syllabi/:id/modules/:mid/lessons", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, lessonUpsertSchema);
		if (!body.ok) return body.response;
		const input = body.data;
		const db = deps.getDb();
		const { id, mid } = c.req.param();

		const mod = await findModule(db, mid, id, ctx.orgId);
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

		const lessonId = crypto.randomUUID();
		await db.insert(syllabusLesson).values({
			id: lessonId,
			orgId: ctx.orgId,
			moduleId: mid,
			title: input.title,
			objectives: input.objectives,
			materials: input.materials,
			kind: input.kind ?? "lesson",
			status: input.status ?? "upcoming",
			position: (last?.max ?? -1) + 1,
		});
		return c.json({ id: lessonId } satisfies CreatedResponse, 201);
	});

	routes.post("/syllabi/:id/modules/:mid/lessons/reorder", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, reorderLessonsSchema);
		if (!body.ok) return body.response;
		const { lessonIds } = body.data;
		if (hasDuplicateIds(lessonIds)) {
			return c.json({ error: "duplicate ids" }, 400);
		}
		const db = deps.getDb();
		const { id, mid } = c.req.param();
		const sy = await findSyllabus(db, id, ctx.orgId);
		if (!sy) {
			return c.json({ error: "syllabus not found" }, 404);
		}
		const mod = await findModule(db, mid, id, ctx.orgId);
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

	routes.post("/syllabi/:id/modules/:mid/lessons/:lid", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, lessonUpsertSchema);
		if (!body.ok) return body.response;
		const input = body.data;
		const db = deps.getDb();
		const { id, mid, lid } = c.req.param();

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
					eq(syllabusModule.syllabusId, id),
					eq(syllabusLesson.orgId, ctx.orgId),
				),
			);
		if (!lesson) {
			return c.json({ error: "lesson not found" }, 404);
		}

		await db
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
		return c.json({ ok: true });
	});

	routes.post("/syllabi/:id/modules/:mid/lessons/:lid/remove", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, lessonRemoveSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();
		const { id, mid, lid } = c.req.param();
		const sy = await findSyllabus(db, id, ctx.orgId);
		if (!sy) {
			return c.json({ error: "syllabus not found" }, 404);
		}
		const mod = await findModule(db, mid, id, ctx.orgId);
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

	// Xóa template giáo trình (hard delete cả cây module/lesson). Bản copy của
	// các lớp đã import là deep-copy độc lập (buildImportBatch, issue #79) nên
	// không bị ảnh hưởng; chỉ cần detach provenance vì source_template_id là
	// logical FK only (SQLite không có FK thật để tự set null).
	routes.post("/syllabi/:id/remove", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, deleteSyllabusSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();
		const id = c.req.param("id");

		const sy = await findSyllabus(db, id, ctx.orgId);
		if (!sy) return c.json({ error: "syllabus not found" }, 404);
		// Mirror guard import handler: bản copy của lớp chỉ được xóa qua
		// remove-curriculum phía lớp; 404 che tồn tại (consistent với guard
		// template của import handler phía trên).
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
					and(eq(classTable.syllabusId, id), eq(classTable.orgId, ctx.orgId)),
				),
			db
				.update(syllabus)
				.set({ sourceTemplateId: null })
				.where(
					and(eq(syllabus.sourceTemplateId, id), eq(syllabus.orgId, ctx.orgId)),
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
	return routes;
}
