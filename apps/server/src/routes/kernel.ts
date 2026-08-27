import type { CreatedResponse } from "@teacher-os/api/contracts";
import {
	classCreateSchema,
	classNotesSchema,
	importSyllabusSchema,
	invoiceMarkPaidSchema,
	lessonActionSchema,
	lessonEditSchema,
	lessonRemoveSchema,
	lessonUpsertSchema,
	moduleRemoveSchema,
	moduleUpsertSchema,
	removeCurriculumSchema,
	reorderLessonsSchema,
	reorderModulesSchema,
	studentCreateSchema,
	syllabusCreateSchema,
	TIME_REGEX,
} from "@teacher-os/api/contracts";
import { classTable } from "@teacher-os/db/schema/class";
import { enrollment } from "@teacher-os/db/schema/enrollment";
import { invoice } from "@teacher-os/db/schema/invoice";
import { lesson } from "@teacher-os/db/schema/lesson";
import { sessionPackage } from "@teacher-os/db/schema/session-package";
import { student } from "@teacher-os/db/schema/student";
import {
	syllabus,
	syllabusLesson,
	syllabusModule,
} from "@teacher-os/db/schema/syllabus";
import { and, asc, eq, inArray, max } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import type { Db, KernelCtx } from "../app";
import { assignmentRoutes } from "./assignments";
import { commentBankRoutes, notifRoutes, reportRoutes } from "./reporting";
import { loadInvoices, loadSnapshot } from "./snapshot";

type Env = { Variables: { kernelCtx: KernelCtx } };
type KernelContext = Context<Env>;

/** Parse the stored class schedule JSON; null for legacy free-text/invalid. */
function parseStoredSchedule(
	raw: string,
): { days: number[]; start: string; end: string } | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return null;
		const { days, start, end } = parsed as Record<string, unknown>;
		if (!Array.isArray(days) || days.length === 0) return null;
		const unique = [...new Set(days)];
		if (
			!unique.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) ||
			typeof start !== "string" ||
			typeof end !== "string" ||
			!TIME_REGEX.test(start) ||
			!TIME_REGEX.test(end) ||
			// Mirrors classCreateSchema's superRefine — a legacy row that
			// violates it must not generate zero-duration lessons.
			start === end
		) {
			return null;
		}
		return { days: unique.sort((a, b) => a - b), start, end };
	} catch {
		return null;
	}
}

function toMinutes(hhmm: string): number {
	// TIME_REGEX guarantees exactly two numeric parts.
	const [hours = 0, minutes = 0] = hhmm.split(":").map(Number);
	return hours * 60 + minutes;
}

/**
 * Expand a class's structured schedule into `sessionsTotal` upcoming lesson
 * rows for one enrollment (issue #55). Kernel-local parse — the web's
 * format-schedule helpers live in apps/web and are not importable here.
 * Fails closed to [] for legacy/invalid schedules so old classes keep
 * accepting students. Rows carry a weekday only: lesson.day is 1-7 with
 * 1 = Monday, the schedule JSON is 0-6 with 0 = Monday, hence the +1 —
 * never JS getDay() (0 = Sunday). dur wraps midnight (23:00→00:30 = 90).
 */
export function generateScheduleLessons(input: {
	schedule: string;
	sessionsTotal: number;
	orgId: string;
	classId: string;
	enrollmentId: string;
}): Array<Omit<typeof lesson.$inferInsert, "id" | "createdAt">> {
	const parsed = parseStoredSchedule(input.schedule);
	if (!parsed || input.sessionsTotal <= 0) return [];
	const dur = (toMinutes(parsed.end) - toMinutes(parsed.start) + 1440) % 1440;
	return Array.from({ length: input.sessionsTotal }, (_, i) => ({
		orgId: input.orgId,
		classId: input.classId,
		enrollmentId: input.enrollmentId,
		// days is non-empty; ?? only satisfies noUncheckedIndexedAccess.
		day: (parsed.days[i % parsed.days.length] ?? 0) + 1,
		time: parsed.start,
		dur,
		type: "1:1",
		status: "upcoming",
		topic: "",
		zoom: "",
	}));
}

export function kernelRoutes(deps: { getDb(): Db; corsOrigin: string }) {
	const kernel = new Hono<Env>();

	// Cookies are SameSite=None, so CSRF defense is an explicit Origin check:
	// cross-site POSTs (or non-browser calls without the right Origin) fail closed.
	// POST bodies are JSON-only; form posts die on content-type before parsing.
	kernel.use("*", async (c, next) => {
		if (c.req.method === "POST") {
			if (c.req.header("Origin") !== deps.corsOrigin) {
				return c.json({ error: "origin not allowed" }, 403);
			}
			const contentType = c.req.header("Content-Type") ?? "";
			if (!contentType.toLowerCase().startsWith("application/json")) {
				return c.json({ error: "content-type must be application/json" }, 415);
			}
		}
		return next();
	});

	function unauthorized(c: KernelContext) {
		return c.json({ error: "unauthorized" }, 401);
	}

	async function readBody<S extends z.ZodType>(
		c: KernelContext,
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
	/**
	 * Class row for write paths: notes only needs existence, while
	 * student-create also reads schedule + sessionsTotal to generate lessons
	 * (schedule is raw TEXT) and curriculum writes read the syllabus pointer.
	 */
	async function findClass(db: Db, classId: string, orgId: string) {
		const [row] = await db
			.select({
				id: classTable.id,
				schedule: classTable.schedule,
				sessionsTotal: classTable.sessionsTotal,
				syllabusId: classTable.syllabusId,
			})
			.from(classTable)
			.where(and(eq(classTable.id, classId), eq(classTable.orgId, orgId)));
		return row;
	}

	/** Full row — import needs classId (template check) + metadata to copy. */
	async function findSyllabus(db: Db, syllabusId: string, orgId: string) {
		const [row] = await db
			.select()
			.from(syllabus)
			.where(and(eq(syllabus.id, syllabusId), eq(syllabus.orgId, orgId)));
		return row;
	}

	/** Module must belong to the given syllabus AND the org — client ids are never trusted. */
	async function findModule(
		db: Db,
		moduleId: string,
		syllabusId: string,
		orgId: string,
	) {
		const [row] = await db
			.select({ id: syllabusModule.id })
			.from(syllabusModule)
			.where(
				and(
					eq(syllabusModule.id, moduleId),
					eq(syllabusModule.syllabusId, syllabusId),
					eq(syllabusModule.orgId, orgId),
				),
			);
		return row;
	}

	function hasDuplicateIds(ids: string[]): boolean {
		return new Set(ids).size !== ids.length;
	}

	function sameIdSet(payload: string[], dbIds: string[]): boolean {
		if (payload.length !== dbIds.length) return false;
		const dbSet = new Set(dbIds);
		return payload.every((id) => dbSet.has(id));
	}

	/** Import size guard: modules + lessons above this would brick one D1 batch. */
	const MAX_IMPORT_NODES = 500;

	/**
	 * Deep-copy batch of a template tree into a class copy (issue #79).
	 * All ids are generated before the batch so the copy is wired with fresh
	 * UUIDs; every lesson status resets to `upcoming` (status is per-class
	 * progress, not template content); positions are preserved. Callers own
	 * the org + template checks and the class pointer statement.
	 */
	function buildImportBatch(
		db: Db,
		input: {
			template: typeof syllabus.$inferSelect;
			modules: (typeof syllabusModule.$inferSelect)[];
			lessons: (typeof syllabusLesson.$inferSelect)[];
			classId: string;
			orgId: string;
		},
	): {
		copyId: string;
		statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
	} {
		const { template, classId, orgId } = input;
		const copyId = crypto.randomUUID();
		const moduleIds = new Map(
			input.modules.map((m) => [m.id, crypto.randomUUID()]),
		);
		const lessonIds = new Map(
			input.lessons.map((l) => [l.id, crypto.randomUUID()]),
		);
		const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
			db.insert(syllabus).values({
				id: copyId,
				orgId,
				name: template.name,
				level: template.level,
				type: template.type,
				skills: template.skills,
				description: template.description,
				totalLessons: template.totalLessons,
				createdAt: template.createdAt,
				classId,
				sourceTemplateId: template.id,
			}),
			...input.modules.map((m) =>
				db.insert(syllabusModule).values({
					id: moduleIds.get(m.id) as string,
					orgId,
					syllabusId: copyId,
					title: m.title,
					description: m.description,
					position: m.position,
					createdAt: m.createdAt,
				}),
			),
			...input.lessons.map((l) =>
				db.insert(syllabusLesson).values({
					id: lessonIds.get(l.id) as string,
					orgId,
					moduleId: moduleIds.get(l.moduleId) as string,
					title: l.title,
					objectives: l.objectives,
					materials: l.materials,
					status: "upcoming",
					position: l.position,
					createdAt: l.createdAt,
				}),
			),
		];
		return { copyId, statements };
	}

	/** Pre-read of a template's module/lesson tree, ordered by position. */
	async function selectTemplateTree(db: Db, templateId: string, orgId: string) {
		const modules = await db
			.select()
			.from(syllabusModule)
			.where(
				and(
					eq(syllabusModule.syllabusId, templateId),
					eq(syllabusModule.orgId, orgId),
				),
			)
			.orderBy(asc(syllabusModule.position));
		const lessons = modules.length
			? await db
					.select()
					.from(syllabusLesson)
					.where(
						and(
							eq(syllabusLesson.orgId, orgId),
							inArray(
								syllabusLesson.moduleId,
								modules.map((m) => m.id),
							),
						),
					)
					.orderBy(asc(syllabusLesson.position))
			: [];
		return { modules, lessons };
	}

	/**
	 * Lesson joined with its enrollment so lesson writes can enforce the
	 * class↔enrollment pairing (invariant 2): a lesson claiming class A while
	 * its enrollment sits in class B is a conflict, never a valid check-in.
	 * The five mutable fields ride along for edit, whose conditional WHERE
	 * re-checks them against this pre-read.
	 */
	async function findLessonAction(db: Db, lessonId: string, orgId: string) {
		const [row] = await db
			.select({
				id: lesson.id,
				status: lesson.status,
				classId: lesson.classId,
				enrollmentClassId: enrollment.classId,
				day: lesson.day,
				time: lesson.time,
				dur: lesson.dur,
				topic: lesson.topic,
				zoom: lesson.zoom,
			})
			.from(lesson)
			.innerJoin(enrollment, eq(lesson.enrollmentId, enrollment.id))
			.where(and(eq(lesson.id, lessonId), eq(lesson.orgId, orgId)));
		return row;
	}

	kernel.get("/kernel", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		return c.json(await loadSnapshot(deps.getDb(), ctx.orgId));
	});

	kernel.get("/students", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const snapshot = await loadSnapshot(deps.getDb(), ctx.orgId);
		return c.json(snapshot.students);
	});

	kernel.post("/students", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, studentCreateSchema);
		if (!body.ok) return body.response;
		const input = body.data;
		const db = deps.getDb();

		let cls:
			| { id: string; schedule: string; sessionsTotal: number }
			| undefined;
		if (input.classId) {
			cls = await findClass(db, input.classId, ctx.orgId);
			if (!cls) {
				return c.json({ error: "class not found" }, 404);
			}
		}

		const studentId = crypto.randomUUID();
		const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
			db.insert(student).values({
				id: studentId,
				orgId: ctx.orgId,
				name: input.name,
				phone: input.phone,
				zalo: input.phone.replace(/\s/g, ""),
				parentName: input.parentName,
				parentPhone: "",
			}),
		];
		if (cls) {
			// Schedule-driven lessons (issue #55) join the same batch — an
			// enrollment can never exist without its generated lesson series.
			const enrollmentId = crypto.randomUUID();
			statements.push(
				db.insert(enrollment).values({
					id: enrollmentId,
					orgId: ctx.orgId,
					classId: cls.id,
					studentId,
				}),
				db.insert(sessionPackage).values({
					id: crypto.randomUUID(),
					orgId: ctx.orgId,
					enrollmentId,
					total: input.total,
					price: input.price,
					mode: input.mode,
					start: formatDayMonth(new Date()),
					expiry: "",
					status: "active",
				}),
			);
			for (const row of generateScheduleLessons({
				schedule: cls.schedule,
				sessionsTotal: cls.sessionsTotal,
				orgId: ctx.orgId,
				classId: cls.id,
				enrollmentId,
			})) {
				statements.push(
					db.insert(lesson).values({ id: crypto.randomUUID(), ...row }),
				);
			}
		}
		await db.batch(statements);
		return c.json({ id: studentId } satisfies CreatedResponse, 201);
	});

	kernel.get("/classes", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const snapshot = await loadSnapshot(deps.getDb(), ctx.orgId);
		return c.json(snapshot.classes);
	});

	kernel.get("/invoices", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		return c.json(await loadInvoices(deps.getDb(), ctx.orgId));
	});

	kernel.post("/classes", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, classCreateSchema);
		if (!body.ok) return body.response;
		const input = body.data;
		const db = deps.getDb();

		// Resolve the template (org + class_id IS NULL) BEFORE any write — a
		// bad template must not leave a half-created class behind.
		let template:
			| {
					template: typeof syllabus.$inferSelect;
					modules: (typeof syllabusModule.$inferSelect)[];
					lessons: (typeof syllabusLesson.$inferSelect)[];
			  }
			| undefined;
		if (input.templateId !== "") {
			const tpl = await findSyllabus(db, input.templateId, ctx.orgId);
			if (!tpl || tpl.classId !== null) {
				return c.json({ error: "syllabus not found" }, 404);
			}
			const tree = await selectTemplateTree(db, tpl.id, ctx.orgId);
			if (tree.modules.length + tree.lessons.length > MAX_IMPORT_NODES) {
				return c.json({ error: "Template quá lớn để import" }, 422);
			}
			template = { template: tpl, ...tree };
		}

		const classId = crypto.randomUUID();
		// Batch order is pinned (issue #79): syllabus copy + modules + lessons
		// first, the class row LAST — class.syllabus_id is a real FK (NO
		// ACTION), so inserting the class before its copy aborts the batch.
		const imported = template
			? buildImportBatch(db, { ...template, classId, orgId: ctx.orgId })
			: undefined;
		const classInsert = db.insert(classTable).values({
			id: classId,
			orgId: ctx.orgId,
			name: input.name,
			level: input.level,
			type: input.type,
			skills: JSON.stringify(input.skills),
			mode: input.mode,
			syllabusId: imported?.copyId ?? null,
			schedule: JSON.stringify({
				...input.schedule,
				days: [...new Set(input.schedule.days)].sort((a, b) => a - b),
			}),
			sessionsTotal: input.sessionsTotal,
			sessionsDone: 0,
			status: "active",
			startDate: input.startDate,
			notes: "",
		});
		const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = imported
			? [...imported.statements, classInsert]
			: [classInsert];
		await db.batch(statements);
		return c.json({ id: classId } satisfies CreatedResponse, 201);
	});

	kernel.post("/classes/:id/import-syllabus", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, importSyllabusSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();
		const classId = c.req.param("id");

		const cls = await findClass(db, classId, ctx.orgId);
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
			const after = await findClass(db, classId, ctx.orgId);
			if (after?.syllabusId != null) {
				return c.json({ error: "Lớp đã có giáo trình" }, 409);
			}
			throw new Error("import-syllabus batch failed");
		}
		return c.json({ id: copyId } satisfies CreatedResponse, 201);
	});

	kernel.post("/classes/:id/remove-curriculum", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, removeCurriculumSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();
		const classId = c.req.param("id");

		const cls = await findClass(db, classId, ctx.orgId);
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

	kernel.post("/classes/:id/notes", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, classNotesSchema);
		if (!body.ok) return body.response;
		const input = body.data;
		const db = deps.getDb();
		const classId = c.req.param("id");

		const cls = await findClass(db, classId, ctx.orgId);
		if (!cls) {
			return c.json({ error: "class not found" }, 404);
		}

		await db
			.update(classTable)
			.set({ notes: input.notes })
			.where(and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)));
		return c.json({ ok: true });
	});

	/**
	 * Wave 4 lesson status actions. Status transitions are fixed — check-in
	 * upcoming→completed, cancel upcoming→cancelled, anything else 409 — and
	 * the body must be exactly `{}` so a client can never forge a status.
	 * Only the lesson row is written; package/class counters stay derived.
	 */
	async function lessonStatusAction(
		c: KernelContext,
		lessonId: string,
		nextStatus: "completed" | "cancelled",
	) {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, lessonActionSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();

		const row = await findLessonAction(db, lessonId, ctx.orgId);
		if (!row) {
			return c.json({ error: "lesson not found" }, 404);
		}
		if (row.enrollmentClassId !== row.classId) {
			return c.json({ error: "lesson enrollment mismatch" }, 409);
		}
		if (row.status !== "upcoming") {
			return c.json({ error: "lesson is not upcoming" }, 409);
		}

		// Conditional write: the status guard must also live in the WHERE
		// clause so two concurrent POSTs (two tabs) cannot both pass the
		// pre-read and race past the transition matrix.
		const updated = await db
			.update(lesson)
			.set({ status: nextStatus })
			.where(
				and(
					eq(lesson.id, lessonId),
					eq(lesson.orgId, ctx.orgId),
					eq(lesson.status, "upcoming"),
				),
			)
			.returning({ id: lesson.id });
		if (updated.length === 0) {
			return c.json({ error: "lesson is not upcoming" }, 409);
		}
		return c.json({ ok: true });
	}

	kernel.post("/lessons/:id/check-in", (c) =>
		lessonStatusAction(c, c.req.param("id"), "completed"),
	);

	kernel.post("/lessons/:id/cancel", (c) =>
		lessonStatusAction(c, c.req.param("id"), "cancelled"),
	);

	/**
	 * Lesson edit (issue #55) — upcoming-only, full-replace of the five
	 * mutable fields; status/type stay server-owned via the strict schema.
	 * Same guard shape as lessonStatusAction plus optimistic concurrency:
	 * editing does not write the guard column itself, so the pre-read field
	 * values must also live in the WHERE clause — otherwise two concurrent
	 * edits both match `status='upcoming'` and the loser vanishes silently.
	 */
	kernel.post("/lessons/:id/edit", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, lessonEditSchema);
		if (!body.ok) return body.response;
		const lessonId = c.req.param("id");
		const db = deps.getDb();

		const pre = await findLessonAction(db, lessonId, ctx.orgId);
		if (!pre) {
			return c.json({ error: "lesson not found" }, 404);
		}
		if (pre.enrollmentClassId !== pre.classId) {
			return c.json({ error: "lesson enrollment mismatch" }, 409);
		}
		if (pre.status !== "upcoming") {
			return c.json({ error: "lesson is not upcoming" }, 409);
		}

		const updated = await db
			.update(lesson)
			.set({
				day: body.data.day,
				time: body.data.time,
				dur: body.data.dur,
				topic: body.data.topic,
				zoom: body.data.zoom,
			})
			.where(
				and(
					eq(lesson.id, lessonId),
					eq(lesson.orgId, ctx.orgId),
					eq(lesson.status, "upcoming"),
					eq(lesson.day, pre.day),
					eq(lesson.time, pre.time),
					eq(lesson.dur, pre.dur),
					eq(lesson.topic, pre.topic),
					eq(lesson.zoom, pre.zoom),
				),
			)
			.returning({ id: lesson.id });
		if (updated.length === 0) {
			return c.json({ error: "lesson changed or is not upcoming" }, 409);
		}
		return c.json({ ok: true });
	});

	kernel.post("/invoices/:id/mark-paid", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, invoiceMarkPaidSchema);
		if (!body.ok) return body.response;

		// Paid replay intentionally overwrites the method (compatibility lock).
		// The tenant predicate makes unknown and foreign ids indistinguishable.
		const [updatedInvoice] = await deps
			.getDb()
			.update(invoice)
			.set({ status: "paid", method: body.data.method })
			.where(
				and(eq(invoice.id, c.req.param("id")), eq(invoice.orgId, ctx.orgId)),
			)
			.returning({ id: invoice.id });
		if (!updatedInvoice) {
			return c.json({ error: "invoice not found" }, 404);
		}
		return c.json({ ok: true });
	});

	kernel.get("/syllabi", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const snapshot = await loadSnapshot(deps.getDb(), ctx.orgId);
		return c.json(snapshot.syllabi);
	});

	kernel.post("/syllabi", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, syllabusCreateSchema);
		if (!body.ok) return body.response;
		const input = body.data;
		const db = deps.getDb();

		const syllabusId = crypto.randomUUID();
		await db.insert(syllabus).values({
			id: syllabusId,
			orgId: ctx.orgId,
			name: input.name,
			level: input.level,
			type: input.type,
			skills: JSON.stringify(input.skills),
			description: input.description,
			totalLessons: input.totalLessons,
		});
		return c.json({ id: syllabusId } satisfies CreatedResponse, 201);
	});

	kernel.post("/syllabi/:id/modules", async (c) => {
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

	kernel.post("/syllabi/:id/modules/reorder", async (c) => {
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

	kernel.post("/syllabi/:id/modules/:mid", async (c) => {
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

	kernel.post("/syllabi/:id/modules/:mid/remove", async (c) => {
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

	kernel.post("/syllabi/:id/modules/:mid/lessons", async (c) => {
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
			status: input.status,
			position: (last?.max ?? -1) + 1,
		});
		return c.json({ id: lessonId } satisfies CreatedResponse, 201);
	});

	kernel.post("/syllabi/:id/modules/:mid/lessons/reorder", async (c) => {
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

	kernel.post("/syllabi/:id/modules/:mid/lessons/:lid", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, lessonUpsertSchema);
		if (!body.ok) return body.response;
		const input = body.data;
		const db = deps.getDb();
		const { id, mid, lid } = c.req.param();

		const [lesson] = await db
			.select({ id: syllabusLesson.id })
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
				status: input.status,
			})
			.where(
				and(eq(syllabusLesson.id, lid), eq(syllabusLesson.orgId, ctx.orgId)),
			);
		return c.json({ ok: true });
	});

	kernel.post("/syllabi/:id/modules/:mid/lessons/:lid/remove", async (c) => {
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

	// Mounted after the Origin/content-type middleware above, so the
	// sub-router's POSTs are CSRF-guarded exactly like the kernel writes.
	kernel.route("/assignments", assignmentRoutes(deps));
	kernel.route("/reports", reportRoutes(deps));
	kernel.route("/notifs", notifRoutes(deps));
	kernel.route("/comment-bank", commentBankRoutes(deps));

	return kernel;
}

// dd/MM in Vietnam time — Workers run in UTC, so local getters drift a day
// before 07:00 Asia/Ho_Chi_Minh.
function formatDayMonth(date: Date): string {
	return new Intl.DateTimeFormat("en-GB", {
		timeZone: "Asia/Ho_Chi_Minh",
		day: "2-digit",
		month: "2-digit",
	}).format(date);
}
