import type { CreatedResponse } from "@teacher-os/api/contracts";
import {
	deleteSyllabusSchema,
	importSyllabusSchema,
	removeCurriculumSchema,
	syllabusCreateSchema,
	syllabusReplaceContentSchema,
} from "@teacher-os/api/contracts";
import { classTable } from "@teacher-os/db/schema/class";
import {
	syllabus,
	syllabusLesson,
	syllabusModule,
} from "@teacher-os/db/schema/syllabus";
import { and, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { z } from "zod";

import type { Db, KernelCtx } from "../app";
import {
	buildImportBatch,
	clearPointersTo,
	findClassCurriculum,
	findTemplate,
	MAX_IMPORT_NODES,
	selectTemplateTree,
	setClassCurriculumPointer,
} from "../lib/syllabus-curriculum";
import { mountContentRoutes } from "./syllabus-content-routes";

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

	//
	// Shared operation handlers (design D6, issue #394): one implementation
	// per operation, registered on the single context path (legacy aliases
	// removed in phase 8, issue #401). replace-content and remove always
	// resolve via findTemplate — a class copy is never editable/deletable
	// through them (404).
	//
	const createTemplateHandler = async (c: SyllabusContext) => {
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
	};

	// Replace toàn bộ cây module/lesson của một template (import ghi đè ở màn
	// hình detail, issue #152). Delete explicit qua subquery — không dựa FK
	// cascade (same rule as module-remove). One atomic batch.
	const replaceContentHandler = async (c: SyllabusContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, syllabusReplaceContentSchema);
		if (!body.ok) return body.response;
		const input = body.data;
		const db = deps.getDb();
		const id = c.req.param("id");
		if (id === undefined) return c.json({ error: "syllabus not found" }, 404);
		const sy = await findTemplate(db, id, ctx.orgId);
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
									eq(syllabusModule.syllabusId, sy.id),
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
						eq(syllabusModule.syllabusId, sy.id),
						eq(syllabusModule.orgId, ctx.orgId),
					),
				),
			db
				.update(syllabus)
				.set({ totalLessons: lessonCount })
				.where(and(eq(syllabus.id, sy.id), eq(syllabus.orgId, ctx.orgId))),
		];
		for (const [mi, m] of input.modules.entries()) {
			const moduleId = crypto.randomUUID();
			statements.push(
				db.insert(syllabusModule).values({
					id: moduleId,
					orgId: ctx.orgId,
					syllabusId: sy.id,
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
	};

	// Xóa template giáo trình (hard delete cả cây module/lesson). Bản copy của
	// các lớp đã import là deep-copy độc lập (buildImportBatch, issue #79) nên
	// không bị ảnh hưởng; chỉ cần detach provenance vì source_template_id là
	// logical FK only (SQLite không có FK thật để tự set null).
	const removeTemplateHandler = async (c: SyllabusContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, deleteSyllabusSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();
		const id = c.req.param("id");
		if (id === undefined) return c.json({ error: "syllabus not found" }, 404);

		// findTemplate: bản copy của lớp chỉ được xóa qua remove-curriculum
		// phía lớp; 404 che tồn tại (consistent với guard template của import).
		const sy = await findTemplate(db, id, ctx.orgId);
		if (!sy) return c.json({ error: "syllabus not found" }, 404);

		// FK order (NO ACTION trên class.syllabus_id): null pointer trước, rồi
		// detach provenance, rồi delete explicit child-first qua subquery —
		// không dựa FK cascade (same rule as remove-curriculum). Mọi statement
		// org-scoped.
		await db.batch([
			clearPointersTo(db, id, ctx.orgId),
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
	};

	const importCurriculumHandler = async (c: SyllabusContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, importSyllabusSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();
		const classId = c.req.param("id");
		if (classId === undefined) {
			return c.json({ error: "class not found" }, 404);
		}

		const cls = await findClassPointer(db, classId, ctx.orgId);
		if (!cls) {
			return c.json({ error: "class not found" }, 404);
		}
		// Deterministic duplicate check — never parse SQLite error strings.
		// The copy (found via class_id, the source of truth) decides, so a
		// stale/template pointer can never block a legitimate import.
		const existing = await findClassCurriculum(db, classId, ctx.orgId);
		if (existing) {
			return c.json({ error: "Lớp đã có giáo trình" }, 409);
		}

		const tpl = await findTemplate(db, body.data.templateId, ctx.orgId);
		if (!tpl) {
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
		statements.push(setClassCurriculumPointer(db, classId, ctx.orgId, copyId));
		try {
			await db.batch(statements);
		} catch {
			// Unique index race backstop (syllabus_class_unique): only a
			// concurrent import surfaces here as a copy — re-check via
			// class_id instead of swallowing real errors into a 409.
			const after = await findClassCurriculum(db, classId, ctx.orgId);
			if (after) {
				return c.json({ error: "Lớp đã có giáo trình" }, 409);
			}
			// syllabus_class_unique is org-global: a foreign-org copy holding
			// this class id must surface as 409, never a raw 500.
			const [foreign] = await db
				.select({ id: syllabus.id })
				.from(syllabus)
				.where(eq(syllabus.classId, classId));
			if (foreign) {
				return c.json({ error: "class already has a curriculum" }, 409);
			}
			throw new Error("import-syllabus batch failed");
		}
		return c.json({ id: copyId } satisfies CreatedResponse, 201);
	};

	const removeCurriculumHandler = async (c: SyllabusContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, removeCurriculumSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();
		const classId = c.req.param("id");
		if (classId === undefined) {
			return c.json({ error: "class not found" }, 404);
		}

		const cls = await findClassPointer(db, classId, ctx.orgId);
		if (!cls) {
			return c.json({ error: "class not found" }, 404);
		}
		// The copy decides (class_id is the source of truth), not the pointer:
		// no branch on `cls.syllabusId` — a stale/template/cross-org pointer
		// means "no curriculum" for this class.
		const copy = await findClassCurriculum(db, classId, ctx.orgId);
		if (!copy) {
			// Nothing to remove; heal any stale pointer to null (idempotent).
			// The pointed row (templates included) is never deleted here.
			await db.batch([setClassCurriculumPointer(db, classId, ctx.orgId, null)]);
			return c.json({ ok: true });
		}

		// FK order (NO ACTION): null the pointer FIRST, then delete
		// child-first (lessons → modules → syllabus), every DELETE org-scoped.
		await db.batch([
			setClassCurriculumPointer(db, classId, ctx.orgId, null),
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
	};

	//
	// Registration: mỗi operation một path ngữ cảnh duy nhất — alias cũ
	// (/syllabi, import-syllabus, remove-curriculum) đã gỡ ở phase 8 (#401).
	//
	routes.post(
		"/syllabus-templates",
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
	routes.post("/syllabus-templates", (c) => createTemplateHandler(c));

	routes.post("/syllabus-templates/:id/replace-content", (c) =>
		replaceContentHandler(c),
	);
	routes.post("/syllabus-templates/:id/remove", (c) =>
		removeTemplateHandler(c),
	);
	routes.post("/classes/:id/curriculum/import", (c) =>
		importCurriculumHandler(c),
	);
	routes.post("/classes/:id/curriculum/remove", (c) =>
		removeCurriculumHandler(c),
	);

	// Content routes (module/lesson) mounted once per scope (design D5):
	// template scope and class-curriculum scope. Handlers only use the
	// resolved syllabus id — never the raw :id param.
	mountContentRoutes(routes, {
		basePath: "/syllabus-templates/:id",
		resolve: async (c, db, orgId) => {
			const id = c.req.param("id");
			if (id === undefined) return undefined;
			return findTemplate(db, id, orgId);
		},
		deps,
		readBody,
		unauthorized,
	});
	mountContentRoutes(routes, {
		basePath: "/classes/:id/curriculum",
		resolve: async (c, db, orgId) => {
			const id = c.req.param("id");
			if (id === undefined) return undefined;
			const cls = await findClassPointer(db, id, orgId);
			if (!cls) return undefined;
			return findClassCurriculum(db, cls.id, orgId);
		},
		deps,
		readBody,
		unauthorized,
	});

	return routes;
}
