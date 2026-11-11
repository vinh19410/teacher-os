import type { CreatedResponse } from "@teacher-os/api/contracts";
import {
	deleteSyllabusSchema,
	importSyllabusSchema,
	removeCurriculumSchema,
	syllabusCreateSchema,
	syllabusReplaceContentSchema,
} from "@teacher-os/api/contracts";
import { classTable } from "@teacher-os/db/schema/class";
import { classSession } from "@teacher-os/db/schema/class-session";
import { enrollment } from "@teacher-os/db/schema/enrollment";
import { lesson } from "@teacher-os/db/schema/lesson";
import { sessionPackage } from "@teacher-os/db/schema/session-package";
import {
	syllabus,
	syllabusLesson,
	syllabusModule,
} from "@teacher-os/db/schema/syllabus";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { z } from "zod";

import type { Db, KernelCtx } from "../app";
import {
	buildImportBatch,
	clearPointersTo,
	findClassCurriculum,
	findExistingMaterialIds,
	findTemplate,
	MAX_IMPORT_NODES,
	selectTemplateTree,
	setClassCurriculumPointer,
} from "../lib/syllabus-curriculum";
import { materializeScheduleForEnrollment } from "./enrollment-activation";
import { isRollbackableConstraintError } from "./holidays";
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

	/** Class row for curriculum write paths (#670 includes schedulingMode + sessionsTotal). */
	async function findClassRow(db: Db, classId: string, orgId: string) {
		const [row] = await db
			.select({
				id: classTable.id,
				syllabusId: classTable.syllabusId,
				schedulingMode: classTable.schedulingMode,
				sessionsTotal: classTable.sessionsTotal,
			})
			.from(classTable)
			.where(and(eq(classTable.id, classId), eq(classTable.orgId, orgId)));
		return row;
	}

	/**
	 * Sinh bù lịch học + gói buổi cho các active enrollment đang kẹt ở 0 dòng lesson
	 * và package.total = 0 (hoặc chưa có package) sau khi lớp chuyển sang `auto` (#670).
	 * Chạy tuần tự từng học viên để không vượt trần một `db.batch` của D1 và để học viên
	 * thứ 2 nhìn thấy dòng shift I6 vừa sinh bởi học viên thứ 1.
	 */
	async function backfillStuckEnrollments(
		db: Db,
		orgId: string,
		classId: string,
	): Promise<number> {
		const stuck = await db
			.select({
				id: enrollment.id,
				studentId: enrollment.studentId,
			})
			.from(enrollment)
			.leftJoin(
				sessionPackage,
				and(
					eq(sessionPackage.enrollmentId, enrollment.id),
					eq(sessionPackage.orgId, enrollment.orgId),
				),
			)
			.where(
				and(
					eq(enrollment.orgId, orgId),
					eq(enrollment.classId, classId),
					eq(enrollment.status, "active"),
					sql`NOT EXISTS (SELECT 1 FROM ${lesson} WHERE ${lesson.orgId} = ${orgId} AND ${lesson.enrollmentId} = ${enrollment.id})`,
					sql`(${sessionPackage.id} IS NULL OR ${sessionPackage.total} = 0)`,
				),
			);
		for (const row of stuck) {
			await materializeScheduleForEnrollment(db, {
				orgId,
				enrollmentId: row.id,
				studentId: row.studentId,
				classId,
				mode: "backfill",
			});
		}
		return stuck.length;
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

		const cls = await findClassRow(db, classId, ctx.orgId);
		if (!cls) {
			return c.json({ error: "class not found" }, 404);
		}
		// Validate template existence + org ownership BEFORE `existing` self-heal
		// so foreign/deleted templateIds always 404 without side effects.
		const tpl = await findTemplate(db, body.data.templateId, ctx.orgId);
		if (!tpl) {
			return c.json({ error: "syllabus not found" }, 404);
		}

		// Deterministic duplicate check — the copy (via class_id) is source of truth.
		// #670 self-heal: if a previous import committed the copy tree then timed out
		// mid-backfill (or left a pre-#670 manual/0-session class with a copy), heal
		// the stuck state idempotently and return 201; otherwise return 409.
		const existing = await findClassCurriculum(db, classId, ctx.orgId);
		if (existing) {
			if (cls.schedulingMode === "manual" && cls.sessionsTotal === 0) {
				const [existingCs, existingLesson] = await Promise.all([
					db
						.select({ id: classSession.id })
						.from(classSession)
						.where(
							and(
								eq(classSession.orgId, ctx.orgId),
								eq(classSession.classId, classId),
							),
						)
						.limit(1),
					db
						.select({ id: lesson.id })
						.from(lesson)
						.where(
							and(eq(lesson.orgId, ctx.orgId), eq(lesson.classId, classId)),
						)
						.limit(1),
				]);
				if (existingCs.length === 0 && existingLesson.length === 0) {
					const existingTree = await selectTemplateTree(
						db,
						existing.id,
						ctx.orgId,
					);
					const existingCount = existingTree.lessons.length;
					if (existingCount >= 1 && existingCount <= 52) {
						await db
							.update(classTable)
							.set({
								syllabusId: existing.id,
								sessionsTotal: existingCount,
								schedulingMode: sql`CASE WHEN EXISTS (SELECT 1 FROM ${classSession} WHERE ${classSession.classId} = ${classId} AND ${classSession.orgId} = ${ctx.orgId}) THEN ${classTable.schedulingMode} ELSE 'auto' END`,
							})
							.where(
								and(
									eq(classTable.id, classId),
									eq(classTable.orgId, ctx.orgId),
								),
							);
						await backfillStuckEnrollments(db, ctx.orgId, classId);
						return c.json({ id: existing.id } satisfies CreatedResponse, 201);
					}
				}
			}
			if (cls.schedulingMode === "auto" && cls.sessionsTotal > 0) {
				const healed = await backfillStuckEnrollments(db, ctx.orgId, classId);
				if (healed > 0) {
					return c.json({ id: existing.id } satisfies CreatedResponse, 201);
				}
			}
			return c.json(
				{
					error: "Lớp đã có giáo trình",
					code: "CURRICULUM_ALREADY_EXISTS",
				},
				409,
			);
		}

		const tree = await selectTemplateTree(db, tpl.id, ctx.orgId);
		if (
			tree.modules.length + tree.lessons.length + tree.links.length >
			MAX_IMPORT_NODES
		) {
			return c.json(
				{
					error: "Template quá lớn để import",
					code: "CURRICULUM_TEMPLATE_TOO_LARGE",
				},
				422,
			);
		}

		const [existingCs, existingLesson] = await Promise.all([
			db
				.select({ id: classSession.id })
				.from(classSession)
				.where(
					and(
						eq(classSession.orgId, ctx.orgId),
						eq(classSession.classId, classId),
					),
				)
				.limit(1),
			db
				.select({ id: lesson.id })
				.from(lesson)
				.where(and(eq(lesson.orgId, ctx.orgId), eq(lesson.classId, classId)))
				.limit(1),
		]);
		if (existingCs.length > 0) {
			return c.json(
				{
					error:
						"Lớp đã có buổi học thủ công. Vui lòng xóa các buổi chưa học trước khi nhập giáo trình.",
					reason: "has-manual-sessions",
					code: "MANUAL_SESSIONS_EXIST",
				},
				409,
			);
		}

		const lessonCount = tree.lessons.length;
		const hasLesson = existingLesson.length > 0;
		if (!hasLesson) {
			if (lessonCount > 52) {
				return c.json(
					{
						error: "Template vượt quá giới hạn 52 buổi học của lớp.",
						reason: "too-many-lessons",
						code: "CURRICULUM_TOO_MANY_LESSONS",
					},
					422,
				);
			}
			if (
				cls.schedulingMode === "manual" &&
				cls.sessionsTotal === 0 &&
				lessonCount === 0
			) {
				return c.json(
					{
						error:
							"Template chưa có bài học nào. Vui lòng thêm ít nhất 1 bài học trước khi nhập vào lớp trống.",
						reason: "empty-template",
						code: "CURRICULUM_EMPTY_TEMPLATE",
					},
					422,
				);
			}
		}
		const candidateSessionsTotal =
			lessonCount > 0 ? lessonCount : cls.sessionsTotal;

		const { copyId, statements } = buildImportBatch(db, {
			template: tpl,
			...tree,
			classId,
			orgId: ctx.orgId,
		});
		statements.push(
			db
				.update(classTable)
				.set({
					syllabusId: copyId,
					sessionsTotal: sql`CASE WHEN EXISTS (SELECT 1 FROM ${lesson} WHERE ${lesson.orgId} = ${ctx.orgId} AND ${lesson.classId} = ${classId}) THEN ${classTable.sessionsTotal} ELSE ${candidateSessionsTotal} END`,
					schedulingMode: sql`CASE WHEN EXISTS (SELECT 1 FROM ${classSession} WHERE ${classSession.classId} = ${classId} AND ${classSession.orgId} = ${ctx.orgId}) THEN NULL ELSE 'auto' END`,
				})
				.where(
					and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)),
				),
		);
		try {
			await db.batch(statements);
		} catch (err: unknown) {
			const after = await findClassCurriculum(db, classId, ctx.orgId);
			// Lost ACK after D1 committed our own copy: proceed to backfill + 201.
			if (!after || after.id !== copyId) {
				if (!isRollbackableConstraintError(err)) {
					throw err;
				}
				const message = err instanceof Error ? err.message : String(err);
				if (/FOREIGN KEY/i.test(message) && tree.links.length > 0) {
					const materialIds = [...new Set(tree.links.map((l) => l.materialId))];
					const existingMats = await findExistingMaterialIds(
						db,
						ctx.orgId,
						materialIds,
					);
					const missing = materialIds.find((id) => !existingMats.has(id));
					if (missing !== undefined) {
						return c.json(
							{
								error: "material-not-found",
								materialId: missing,
								code: "CURRICULUM_MATERIAL_NOT_FOUND",
							},
							422,
						);
					}
				}
				if (after) {
					return c.json(
						{
							error: "Lớp đã có giáo trình",
							code: "CURRICULUM_ALREADY_EXISTS",
						},
						409,
					);
				}
				const [foreign] = await db
					.select({ id: syllabus.id })
					.from(syllabus)
					.where(eq(syllabus.classId, classId));
				if (foreign) {
					return c.json(
						{
							error: "Lớp đã có giáo trình",
							code: "CURRICULUM_ALREADY_EXISTS",
						},
						409,
					);
				}
				const [raceCs] = await db
					.select({ id: classSession.id })
					.from(classSession)
					.where(
						and(
							eq(classSession.orgId, ctx.orgId),
							eq(classSession.classId, classId),
						),
					)
					.limit(1);
				if (raceCs) {
					return c.json(
						{
							error:
								"Lớp đã có buổi học thủ công. Vui lòng xóa các buổi chưa học trước khi nhập giáo trình.",
							reason: "has-manual-sessions",
							code: "MANUAL_SESSIONS_EXIST",
						},
						409,
					);
				}
				throw new Error("import-syllabus batch failed");
			}
		}

		const effectiveTotal = hasLesson
			? cls.sessionsTotal
			: candidateSessionsTotal;
		if (effectiveTotal > 0) {
			await backfillStuckEnrollments(db, ctx.orgId, classId);
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

		const cls = await findClassRow(db, classId, ctx.orgId);
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

		const hasRealSessionsSql = sql`EXISTS (SELECT 1 FROM ${lesson} WHERE ${lesson.orgId} = ${ctx.orgId} AND ${lesson.classId} = ${classId}) OR EXISTS (SELECT 1 FROM ${classSession} WHERE ${classSession.orgId} = ${ctx.orgId} AND ${classSession.classId} = ${classId})`;

		// FK order (NO ACTION): null the pointer (and reset manual/0 when the class
		// has 0 real sessions) FIRST, sync session_package.total to 0 when 0 real
		// sessions, then delete child-first (lessons → modules → syllabus).
		await db.batch([
			db
				.update(classTable)
				.set({
					syllabusId: null,
					schedulingMode: sql`CASE WHEN ${hasRealSessionsSql} THEN ${classTable.schedulingMode} ELSE 'manual' END`,
					sessionsTotal: sql`CASE WHEN ${hasRealSessionsSql} THEN ${classTable.sessionsTotal} ELSE 0 END`,
				})
				.where(
					and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)),
				),
			db
				.update(sessionPackage)
				.set({
					total: sql`CASE WHEN ${hasRealSessionsSql} THEN ${sessionPackage.total} ELSE 0 END`,
				})
				.where(
					and(
						eq(sessionPackage.orgId, ctx.orgId),
						inArray(
							sessionPackage.enrollmentId,
							db
								.select({ id: enrollment.id })
								.from(enrollment)
								.where(
									and(
										eq(enrollment.orgId, ctx.orgId),
										eq(enrollment.classId, classId),
									),
								),
						),
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
			const cls = await findClassRow(db, id, orgId);
			if (!cls) return undefined;
			return findClassCurriculum(db, cls.id, orgId);
		},
		deps,
		readBody,
		unauthorized,
	});

	return routes;
}
