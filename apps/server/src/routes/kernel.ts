import type { CreatedResponse } from "@teacher-os/api/contracts";
import {
	assignSyllabusSchema,
	classCreateSchema,
	classNotesSchema,
	invoiceMarkPaidSchema,
	lessonActionSchema,
	lessonEditSchema,
	lessonUpsertSchema,
	moduleUpsertSchema,
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
import { and, eq, max } from "drizzle-orm";
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
	 * Class row for write paths: assign/notes only need existence, while
	 * student-create also reads schedule + sessionsTotal to generate lessons
	 * (schedule is raw TEXT).
	 */
	async function findClass(db: Db, classId: string, orgId: string) {
		const [row] = await db
			.select({
				id: classTable.id,
				schedule: classTable.schedule,
				sessionsTotal: classTable.sessionsTotal,
			})
			.from(classTable)
			.where(and(eq(classTable.id, classId), eq(classTable.orgId, orgId)));
		return row;
	}

	async function findSyllabus(db: Db, syllabusId: string, orgId: string) {
		const [row] = await db
			.select({ id: syllabus.id })
			.from(syllabus)
			.where(and(eq(syllabus.id, syllabusId), eq(syllabus.orgId, orgId)));
		return row;
	}

	/** "" → null (unassigned); a foreign/missing syllabus → undefined (404). */
	async function resolveSyllabusId(
		db: Db,
		syllabusId: string,
		orgId: string,
	): Promise<string | null | undefined> {
		if (syllabusId === "") return null;
		return (await findSyllabus(db, syllabusId, orgId))?.id;
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

		const syllabusId = await resolveSyllabusId(db, input.syllabusId, ctx.orgId);
		if (syllabusId === undefined) {
			return c.json({ error: "syllabus not found" }, 404);
		}

		const classId = crypto.randomUUID();
		await db.insert(classTable).values({
			id: classId,
			orgId: ctx.orgId,
			name: input.name,
			level: input.level,
			type: input.type,
			skills: JSON.stringify(input.skills),
			mode: input.mode,
			syllabusId,
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
		return c.json({ id: classId } satisfies CreatedResponse, 201);
	});

	kernel.post("/classes/:id/assign-syllabus", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, assignSyllabusSchema);
		if (!body.ok) return body.response;
		const input = body.data;
		const db = deps.getDb();
		const classId = c.req.param("id");

		const cls = await findClass(db, classId, ctx.orgId);
		if (!cls) {
			return c.json({ error: "class not found" }, 404);
		}

		const syllabusId = await resolveSyllabusId(db, input.syllabusId, ctx.orgId);
		if (syllabusId === undefined) {
			return c.json({ error: "syllabus not found" }, 404);
		}

		await db
			.update(classTable)
			.set({ syllabusId })
			.where(and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)));
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
			skill: input.skill,
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
