import type {
	CreatedResponse,
	OccurrenceMutationResponse,
} from "@teacher-os/api/contracts";
import {
	classAssignmentCreateSchema,
	classCreateSchema,
	classNotesSchema,
	classTuitionFeeUpdateSchema,
	deleteSyllabusSchema,
	enrollStudentSchema,
	importSyllabusSchema,
	invoiceCreateSchema,
	invoiceMarkPaidSchema,
	lessonActionSchema,
	lessonEditSchema,
	lessonRemoveSchema,
	lessonUpsertSchema,
	moduleRemoveSchema,
	moduleUpsertSchema,
	occurrenceEditSchema,
	removeCurriculumSchema,
	reorderLessonsSchema,
	reorderModulesSchema,
	studentCreateSchema,
	syllabusCreateSchema,
	syllabusReplaceContentSchema,
	workspaceSettingsSchema,
	workspaceSettingsUpdateSchema,
} from "@teacher-os/api/contracts";
import {
	parseStartDateStrict,
	parseStoredSchedule,
	skeletonOf,
} from "@teacher-os/api/skeleton";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";

import { assignmentPrompt } from "@teacher-os/db/schema/assignment-prompt";
import { classTable } from "@teacher-os/db/schema/class";
import {
	classAssignment,
	classAssignmentTarget,
} from "@teacher-os/db/schema/class-assignment";

import { enrollment } from "@teacher-os/db/schema/enrollment";
import { invoice } from "@teacher-os/db/schema/invoice";
import { lesson } from "@teacher-os/db/schema/lesson";
import { sessionPackage } from "@teacher-os/db/schema/session-package";
import { workspaceSettings } from "@teacher-os/db/schema/settings";
import { student } from "@teacher-os/db/schema/student";
import {
	syllabus,
	syllabusLesson,
	syllabusModule,
} from "@teacher-os/db/schema/syllabus";
import { and, asc, eq, inArray, max } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { z } from "zod";
import type { Db, KernelCtx } from "../app";
import { assignmentRoutes } from "./assignments";
import { commentBankRoutes, notifRoutes, reportRoutes } from "./reporting";
import { loadInvoices, loadSnapshot } from "./snapshot";

type Env = { Variables: { kernelCtx: KernelCtx } };
type KernelContext = Context<Env>;

function toMinutes(hhmm: string): number {
	// TIME_REGEX guarantees exactly two numeric parts.
	const [hours = 0, minutes = 0] = hhmm.split(":").map(Number);
	return hours * 60 + minutes;
}

/**
 * Expand a class's structured schedule into `sessionsTotal` upcoming lesson
 * rows for one enrollment (issue #55). Schedule/date parsing lives in
 * @teacher-os/api/skeleton — the same helpers the backfill uses, so a
 * generated row's date always matches what the backfill would have stamped.
 * Fails closed for legacy/invalid schedules (no rows at all, unchanged from
 * before #98). Rows carry weekday plus the occurrence identity `date`
 * (yyyy-mm-dd of the k-th occurrence of that weekday from startDate) so every
 * row is born dated when the class inputs are truthful; an invalid startDate
 * yields date:null rows and the class stays on the frozen legacy path. day is
 * 1-7 with 1 = Monday, the schedule JSON is 0-6 with 0 = Monday, hence the +1
 * — never JS getDay() (0 = Sunday). dur wraps midnight (23:00→00:30 = 90).
 */
export function generateScheduleLessons(input: {
	schedule: string;
	startDate: string;
	sessionsTotal: number;
	orgId: string;
	classId: string;
	enrollmentId: string;
}): Array<Omit<typeof lesson.$inferInsert, "id" | "createdAt">> {
	const parsed = parseStoredSchedule(input.schedule);
	if (!parsed || input.sessionsTotal <= 0) return [];
	const startISO = parseStartDateStrict(input.startDate);
	// Skeleton keys are lesson weekdays 1-7; parsed.days are 0-6 Mon-first.
	const skeleton =
		parsed && startISO
			? skeletonOf(parsed, startISO, input.sessionsTotal)
			: null;
	const dur = (toMinutes(parsed.end) - toMinutes(parsed.start) + 1440) % 1440;
	const ordinalByDay = new Map<number, number>();
	return Array.from({ length: input.sessionsTotal }, (_, i) => {
		const day = (parsed.days[i % parsed.days.length] ?? 0) + 1;
		let date: string | null = null;
		if (skeleton) {
			const ordinal = ordinalByDay.get(day) ?? 0;
			date = skeleton.get(day)?.[ordinal] ?? null;
			ordinalByDay.set(day, ordinal + 1);
		}
		return {
			orgId: input.orgId,
			classId: input.classId,
			enrollmentId: input.enrollmentId,
			// days is non-empty; ?? only satisfies noUncheckedIndexedAccess.
			day,
			time: parsed.start,
			dur,
			type: "1:1",
			status: "upcoming",
			topic: "",
			zoom: "",
			date,
		};
	});
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
	 * student-create also reads schedule + sessionsTotal + startDate to
	 * generate dated lessons (issue #98: the skeleton needs startISO) and
	 * curriculum writes read the syllabus pointer.
	 */
	async function findClass(db: Db, classId: string, orgId: string) {
		const [row] = await db
			.select({
				id: classTable.id,
				schedule: classTable.schedule,
				sessionsTotal: classTable.sessionsTotal,
				startDate: classTable.startDate,
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
					// kind là nội dung giáo trình — copy giữ nguyên (status
					// là tiến độ per-lớp, reset upcoming ở dưới).
					kind: l.kind,
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
				date: lesson.date,
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

	kernel.get("/kernel/settings", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const db = deps.getDb();
		const [row] = await db
			.select()
			.from(workspaceSettings)
			.where(eq(workspaceSettings.orgId, ctx.orgId))
			.limit(1);
		if (!row) {
			return c.json(workspaceSettingsSchema.parse({}));
		}
		return c.json({
			defaultUnitPrice: row.defaultUnitPrice,
			tplReminder: row.tplReminder,
			tplDebt: row.tplDebt,
			tplReport: row.tplReport,
			absenceNoticeHours: row.absenceNoticeHours,
			unexcusedDeduct: row.unexcusedDeduct,
			maxAbsencesBeforeAlert: row.maxAbsencesBeforeAlert,
			reminderSchedule: row.reminderSchedule,
			overdueDebtReminder: row.overdueDebtReminder,
			packageEndReminder: row.packageEndReminder,
			preferredChannel: row.preferredChannel,
		});
	});

	const saveSettings = async (c: KernelContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, workspaceSettingsUpdateSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();
		const [existing] = await db
			.select()
			.from(workspaceSettings)
			.where(eq(workspaceSettings.orgId, ctx.orgId))
			.limit(1);

		const defaults = workspaceSettingsSchema.parse({});

		if (existing) {
			await db
				.update(workspaceSettings)
				.set({
					...(body.data.defaultUnitPrice !== undefined && {
						defaultUnitPrice: body.data.defaultUnitPrice,
					}),
					...(body.data.tplReminder !== undefined && {
						tplReminder: body.data.tplReminder,
					}),
					...(body.data.tplDebt !== undefined && {
						tplDebt: body.data.tplDebt,
					}),
					...(body.data.tplReport !== undefined && {
						tplReport: body.data.tplReport,
					}),
					...(body.data.absenceNoticeHours !== undefined && {
						absenceNoticeHours: body.data.absenceNoticeHours,
					}),
					...(body.data.unexcusedDeduct !== undefined && {
						unexcusedDeduct: body.data.unexcusedDeduct,
					}),
					...(body.data.maxAbsencesBeforeAlert !== undefined && {
						maxAbsencesBeforeAlert: body.data.maxAbsencesBeforeAlert,
					}),
					...(body.data.reminderSchedule !== undefined && {
						reminderSchedule: body.data.reminderSchedule,
					}),
					...(body.data.overdueDebtReminder !== undefined && {
						overdueDebtReminder: body.data.overdueDebtReminder,
					}),
					...(body.data.packageEndReminder !== undefined && {
						packageEndReminder: body.data.packageEndReminder,
					}),
					...(body.data.preferredChannel !== undefined && {
						preferredChannel: body.data.preferredChannel,
					}),
					updatedAt: new Date(),
				})
				.where(eq(workspaceSettings.orgId, ctx.orgId));
		} else {
			await db.insert(workspaceSettings).values({
				orgId: ctx.orgId,
				defaultUnitPrice:
					body.data.defaultUnitPrice ?? defaults.defaultUnitPrice,
				tplReminder: body.data.tplReminder ?? defaults.tplReminder,
				tplDebt: body.data.tplDebt ?? defaults.tplDebt,
				tplReport: body.data.tplReport ?? defaults.tplReport,
				absenceNoticeHours:
					body.data.absenceNoticeHours ?? defaults.absenceNoticeHours,
				unexcusedDeduct: body.data.unexcusedDeduct ?? defaults.unexcusedDeduct,
				maxAbsencesBeforeAlert:
					body.data.maxAbsencesBeforeAlert ?? defaults.maxAbsencesBeforeAlert,
				reminderSchedule:
					body.data.reminderSchedule ?? defaults.reminderSchedule,
				overdueDebtReminder:
					body.data.overdueDebtReminder ?? defaults.overdueDebtReminder,
				packageEndReminder:
					body.data.packageEndReminder ?? defaults.packageEndReminder,
				preferredChannel:
					body.data.preferredChannel ?? defaults.preferredChannel,
				updatedAt: new Date(),
			});
		}

		const [updated] = await db
			.select()
			.from(workspaceSettings)
			.where(eq(workspaceSettings.orgId, ctx.orgId))
			.limit(1);
		if (!updated) {
			return c.json(defaults);
		}

		return c.json({
			defaultUnitPrice: updated.defaultUnitPrice,
			tplReminder: updated.tplReminder,
			tplDebt: updated.tplDebt,
			tplReport: updated.tplReport,
			absenceNoticeHours: updated.absenceNoticeHours,
			unexcusedDeduct: updated.unexcusedDeduct,
			maxAbsencesBeforeAlert: updated.maxAbsencesBeforeAlert,
			reminderSchedule: updated.reminderSchedule,
			overdueDebtReminder: updated.overdueDebtReminder,
			packageEndReminder: updated.packageEndReminder,
			preferredChannel: updated.preferredChannel,
		});
	};

	kernel.put("/kernel/settings", saveSettings);
	kernel.post("/kernel/settings", saveSettings);

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
			| {
					id: string;
					schedule: string;
					sessionsTotal: number;
					startDate: string;
			  }
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
		// Shared package fields — both branches must stay field-identical or a
		// classless student silently loses whatever the class branch gains
		// (the exact #104 failure mode).
		const packageValues = {
			orgId: ctx.orgId,
			studentId,
			total: input.total,
			price: input.price,
			mode: input.mode,
			start: formatDayMonth(new Date()),
			expiry: "",
			status: "active",
		};
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
					...packageValues,
					enrollmentId,
				}),
			);
			for (const row of generateScheduleLessons({
				schedule: cls.schedule,
				startDate: cls.startDate,
				sessionsTotal: cls.sessionsTotal,
				orgId: ctx.orgId,
				classId: cls.id,
				enrollmentId,
			})) {
				statements.push(
					db.insert(lesson).values({ id: crypto.randomUUID(), ...row }),
				);
			}
		} else {
			// Issue #104: a student created without a class still owns the gói —
			// it parks on the student with a null enrollmentId (no attach-to-
			// class flow exists yet) so total/price/mode are never dropped.
			statements.push(
				db.insert(sessionPackage).values({
					id: crypto.randomUUID(),
					...packageValues,
					enrollmentId: null,
				}),
			);
		}
		await db.batch(statements);
		return c.json({ id: studentId } satisfies CreatedResponse, 201);
	});

	// Issue #122: enroll an EXISTING student into a class — same batch shape
	// as the class branch of POST /students, minus the student insert.
	kernel.post("/classes/:id/enroll", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, enrollStudentSchema);
		if (!body.ok) return body.response;
		const input = body.data;
		const db = deps.getDb();
		const classId = c.req.param("id");

		const cls = await findClass(db, classId, ctx.orgId);
		if (!cls) {
			return c.json({ error: "class not found" }, 404);
		}
		const [existingStudent] = await db
			.select({ id: student.id })
			.from(student)
			.where(
				and(eq(student.id, input.studentId), eq(student.orgId, ctx.orgId)),
			);
		if (!existingStudent) {
			return c.json({ error: "student not found" }, 404);
		}
		const [dupe] = await db
			.select({ id: enrollment.id })
			.from(enrollment)
			.where(
				and(
					eq(enrollment.classId, classId),
					eq(enrollment.studentId, input.studentId),
				),
			);
		if (dupe) {
			return c.json({ error: "student already enrolled" }, 409);
		}

		const enrollmentId = crypto.randomUUID();
		const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
			db.insert(enrollment).values({
				id: enrollmentId,
				orgId: ctx.orgId,
				classId: cls.id,
				studentId: input.studentId,
			}),
			// Package values must stay field-identical with POST /students —
			// an enrolled-existing student owns the same active-package shape.
			db.insert(sessionPackage).values({
				id: crypto.randomUUID(),
				orgId: ctx.orgId,
				studentId: input.studentId,
				total: input.total,
				price: input.price,
				mode: input.mode,
				start: formatDayMonth(new Date()),
				expiry: "",
				status: "active",
				enrollmentId,
			}),
		];
		for (const row of generateScheduleLessons({
			schedule: cls.schedule,
			startDate: cls.startDate,
			sessionsTotal: cls.sessionsTotal,
			orgId: ctx.orgId,
			classId: cls.id,
			enrollmentId,
		})) {
			statements.push(
				db.insert(lesson).values({ id: crypto.randomUUID(), ...row }),
			);
		}
		await db.batch(statements);
		return c.json({ id: enrollmentId } satisfies CreatedResponse, 201);
	});

	// #208: giao một đề ngân hàng cho lớp — header + N targets trong MỘT
	// db.batch (atomic; precedent mọi mutation đa statement). Server tự đọc
	// prompt (snapshot title, kiểm org + ready) và kiểm studentIds ⊆
	// enrollment — không tin client. Cap 200 lượt/lớp chống phình snapshot.
	kernel.post("/classes/:id/assignments", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, classAssignmentCreateSchema);
		if (!body.ok) return body.response;
		const input = body.data;
		const db = deps.getDb();
		const classId = c.req.param("id");

		const cls = await findClass(db, classId, ctx.orgId);
		if (!cls) {
			return c.json({ error: "class not found" }, 404);
		}
		const [prompt] = await db
			.select({
				id: assignmentPrompt.id,
				title: assignmentPrompt.title,
				status: assignmentPrompt.status,
			})
			.from(assignmentPrompt)
			.where(
				and(
					eq(assignmentPrompt.id, input.promptId),
					eq(assignmentPrompt.orgId, ctx.orgId),
				),
			);
		if (!prompt) {
			return c.json({ error: "prompt not found" }, 404);
		}
		if (prompt.status !== "ready") {
			return c.json({ error: "prompt not ready" }, 400);
		}
		if (!parseStartDateStrict(input.due) || input.due < vietnamTodayISO()) {
			return c.json({ error: "invalid due date", reason: "invalid-date" }, 400);
		}
		if (new Set(input.studentIds).size !== input.studentIds.length) {
			return c.json({ error: "duplicate student ids" }, 400);
		}
		const rosterRows = await db
			.select({ studentId: enrollment.studentId })
			.from(enrollment)
			.where(
				and(eq(enrollment.classId, classId), eq(enrollment.orgId, ctx.orgId)),
			);
		const roster = new Set(rosterRows.map((row) => row.studentId));
		if (input.studentIds.some((sid) => !roster.has(sid))) {
			return c.json({ error: "student not enrolled" }, 400);
		}
		const existing = await db
			.select({ id: classAssignment.id })
			.from(classAssignment)
			.where(
				and(
					eq(classAssignment.classId, classId),
					eq(classAssignment.orgId, ctx.orgId),
				),
			);
		if (existing.length >= 200) {
			return c.json({ error: "assignment limit reached" }, 400);
		}

		const assignmentId = crypto.randomUUID();
		const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
			db.insert(classAssignment).values({
				id: assignmentId,
				orgId: ctx.orgId,
				classId,
				promptId: prompt.id,
				title: prompt.title,
				due: input.due,
				note: input.note,
			}),
			...input.studentIds.map((studentId) =>
				db.insert(classAssignmentTarget).values({
					id: crypto.randomUUID(),
					orgId: ctx.orgId,
					assignmentId,
					studentId,
					submittedAt: null,
				}),
			),
		];
		await db.batch(statements);
		return c.json({ id: assignmentId } satisfies CreatedResponse, 201);
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
			tuitionFee: input.tuitionFee ?? null,
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

	kernel.post("/classes/:id/tuition-fee", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, classTuitionFeeUpdateSchema);
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
			.set({ tuitionFee: input.tuitionFee })
			.where(and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)));
		return c.json({ ok: true });
	});

	/** yyyy-mm-dd (UTC-anchored) → lesson weekday 1-7, Monday = 1. */
	function isoToLessonWeekday(iso: string): number {
		const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
		return weekday === 0 ? 7 : weekday;
	}

	function invalidDateResponse(c: KernelContext) {
		return c.json({ error: "invalid date", reason: "invalid-date" }, 400);
	}

	/**
	 * Advisory pre-read for one occurrence bucket (#98 K5/RT5). Rows are
	 * pairing-checked like every other write (invariant 2): the lesson's
	 * enrollment must live in the same class. `total` distinguishes an
	 * empty bucket (404) from a fully settled one (200 `{updated:0}`).
	 */
	async function bucketCounts(
		db: Db,
		classId: string,
		dateISO: string,
		orgId: string,
	): Promise<{ total: number; upcoming: number }> {
		const rows = await db
			.select({ status: lesson.status })
			.from(lesson)
			.innerJoin(
				enrollment,
				and(
					eq(lesson.enrollmentId, enrollment.id),
					eq(enrollment.classId, lesson.classId),
				),
			)
			.where(
				and(
					eq(lesson.orgId, orgId),
					eq(lesson.classId, classId),
					eq(lesson.date, dateISO),
				),
			);
		return {
			total: rows.length,
			upcoming: rows.filter((r) => r.status === "upcoming").length,
		};
	}

	/**
	 * Occurrence mutations address the bucket by identity `(class_id, date)`
	 * in ONE guarded statement — org predicate + pairing subquery ride in the
	 * WHERE so even a TOCTOU window cannot cross tenants or classes (#98 RT7).
	 */
	function occurrenceUpdate(
		db: Db,
		classId: string,
		dateISO: string,
		orgId: string,
		set: Partial<typeof lesson.$inferInsert>,
		statusFilter: boolean,
	) {
		return db
			.update(lesson)
			.set(set)
			.where(
				and(
					eq(lesson.orgId, orgId),
					eq(lesson.classId, classId),
					eq(lesson.date, dateISO),
					inArray(
						lesson.enrollmentId,
						db
							.select({ id: enrollment.id })
							.from(enrollment)
							.where(eq(enrollment.classId, classId)),
					),
					...(statusFilter ? [eq(lesson.status, "upcoming" as const)] : []),
				),
			)
			.returning({ id: lesson.id });
	}

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
	 * Lesson edit (issue #55 / #98 K3). Split by dated-identity:
	 *
	 * - Dated row → OCCURRENCE-AWARE policy: a `day` that differs from the
	 *   bucket's calendar weekday is refused with 409
	 *   `{reason:"use-occurrence-endpoint"}` (moving an occurrence is the new
	 *   endpoint's job — day-change would break date↔weekday). The remaining
	 *   fields apply bucket-wide last-write-wins to EVERY row of
	 *   `(class_id, date)` including settled rows (move/edit-wholly is one
	 *   physical session, plan Behavior Changes 4/6); the old per-row
	 *   conditional guard cannot survive multi-value buckets.
	 * - Undated row → byte-for-byte legacy: upcoming-only full-replace with
	 *   optimistic concurrency (the field guards in the WHERE clause).
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

		if (pre.date !== null) {
			const bucketWeekday = isoToLessonWeekday(pre.date);
			if (body.data.day !== bucketWeekday) {
				return c.json(
					{
						error: "day change requires the occurrence endpoint",
						reason: "use-occurrence-endpoint",
					},
					409,
				);
			}
			await occurrenceUpdate(
				db,
				pre.classId,
				pre.date,
				ctx.orgId,
				{
					day: bucketWeekday,
					time: body.data.time,
					dur: body.data.dur,
					topic: body.data.topic,
					zoom: body.data.zoom,
				},
				false,
			);
			return c.json({ ok: true });
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

	/**
	 * Occurrence mutations (issue #98). Identity-addressed: `:date` must be a
	 * real calendar day. Edit applies to the WHOLE bucket regardless of
	 * status (move-wholly); check-in/cancel keep the upcoming-only matrix.
	 * The COUNT pre-reads are advisory (`{updated, skipped}` is informational,
	 * never transactional — RT5).
	 */
	async function parseOccurrenceContext(c: KernelContext): Promise<
		| { ok: false; response: Response }
		| {
				ok: true;
				ctx: KernelCtx;
				db: Db;
				classId: string;
				dateISO: string;
		  }
	> {
		const kernelCtx = c.get("kernelCtx");
		if (!kernelCtx) return { ok: false, response: unauthorized(c) };
		const classId = c.req.param("id") ?? "";
		const dateISO = parseStartDateStrict(c.req.param("date") ?? "");
		if (!dateISO) {
			return { ok: false, response: invalidDateResponse(c) };
		}
		return { ok: true, ctx: kernelCtx, db: deps.getDb(), classId, dateISO };
	}

	kernel.post("/classes/:id/sessions/:date/edit", async (c) => {
		const parsed = await parseOccurrenceContext(c);
		if (!parsed.ok) return parsed.response;
		const { ctx, db, classId, dateISO } = parsed;
		const body = await readBody(c, occurrenceEditSchema);
		if (!body.ok) return body.response;

		const cls = await findClass(db, classId, ctx.orgId);
		if (!cls) {
			return c.json({ error: "class not found", reason: "not-found" }, 404);
		}

		let moveDateISO: string | null = null;
		if (body.data.moveDate !== undefined) {
			moveDateISO = parseStartDateStrict(body.data.moveDate);
			if (!moveDateISO) return invalidDateResponse(c);
		}

		// Collision pre-check (reduces races, does not eliminate them — RT6):
		// the destination bucket must be empty unless it IS this bucket.
		if (moveDateISO && moveDateISO !== dateISO) {
			const dest = await bucketCounts(db, classId, moveDateISO, ctx.orgId);
			if (dest.total > 0) {
				return c.json(
					{ error: "destination date occupied", reason: "date-occupied" },
					409,
				);
			}
		}

		const set: Partial<typeof lesson.$inferInsert> = {};
		if (body.data.topic !== undefined) set.topic = body.data.topic;
		if (body.data.time !== undefined) set.time = body.data.time;
		if (body.data.dur !== undefined) set.dur = body.data.dur;
		if (body.data.zoom !== undefined) set.zoom = body.data.zoom;
		if (moveDateISO) {
			set.date = moveDateISO;
			set.day = isoToLessonWeekday(moveDateISO);
		}

		const before = await bucketCounts(db, classId, dateISO, ctx.orgId);
		// Identity addressing an EMPTY bucket is a stale client (moved/deleted
		// under another tab) — never a silent success (#98 review F2).
		if (before.total === 0) {
			return c.json(
				{ error: "occurrence not found", reason: "not-found" },
				404,
			);
		}
		try {
			const rows = await occurrenceUpdate(
				db,
				classId,
				dateISO,
				ctx.orgId,
				set,
				false,
			);
			// Unique-index race backstop (never parse SQLite error strings —
			// re-check state instead): if the destination shows occupancy now,
			// a concurrent move won and this write lost cleanly.
			if (moveDateISO && rows.length === 0 && moveDateISO !== dateISO) {
				const after = await bucketCounts(db, classId, moveDateISO, ctx.orgId);
				if (after.total > 0) {
					return c.json(
						{ error: "destination date occupied", reason: "date-occupied" },
						409,
					);
				}
			}
			return c.json({
				updated: rows.length,
				skipped: Math.max(0, before.total - rows.length),
			} satisfies OccurrenceMutationResponse);
		} catch (cause) {
			if (moveDateISO && moveDateISO !== dateISO) {
				const after = await bucketCounts(db, classId, moveDateISO, ctx.orgId);
				if (after.total > 0) {
					return c.json(
						{ error: "destination date occupied", reason: "date-occupied" },
						409,
					);
				}
			}
			throw new Error("occurrence edit failed", { cause });
		}
	});

	async function occurrenceStatusAction(
		c: KernelContext,
		nextStatus: "completed" | "cancelled",
		classId: string,
		dateISO: string,
		orgId: string,
		db: Db,
	): Promise<Response> {
		const counts = await bucketCounts(db, classId, dateISO, orgId);
		// Bucket trống vs settled-toàn-bộ phải phân biệt được (K5/R9).
		if (counts.total === 0) {
			return c.json(
				{ error: "occurrence not found", reason: "not-found" },
				404,
			);
		}
		const rows = await occurrenceUpdate(
			db,
			classId,
			dateISO,
			orgId,
			{ status: nextStatus },
			true,
		);
		// Skipped = bucket rows this action did NOT touch — i.e. the ones
		// already settled. Advisory number, not transactional truth (RT5).
		return c.json({
			updated: rows.length,
			skipped: Math.max(0, counts.total - rows.length),
		} satisfies OccurrenceMutationResponse);
	}

	kernel.post("/classes/:id/sessions/:date/check-in", async (c) => {
		const parsed = await parseOccurrenceContext(c);
		if (!parsed.ok) return parsed.response;
		const { ctx, db, classId, dateISO } = parsed;
		const body = await readBody(c, lessonActionSchema);
		if (!body.ok) return body.response;
		const cls = await findClass(db, classId, ctx.orgId);
		if (!cls) {
			return c.json({ error: "class not found", reason: "not-found" }, 404);
		}
		return occurrenceStatusAction(
			c,
			"completed",
			classId,
			dateISO,
			ctx.orgId,
			db,
		);
	});

	kernel.post("/classes/:id/sessions/:date/cancel", async (c) => {
		const parsed = await parseOccurrenceContext(c);
		if (!parsed.ok) return parsed.response;
		const { ctx, db, classId, dateISO } = parsed;
		const body = await readBody(c, lessonActionSchema);
		if (!body.ok) return body.response;
		const cls = await findClass(db, classId, ctx.orgId);
		if (!cls) {
			return c.json({ error: "class not found", reason: "not-found" }, 404);
		}
		return occurrenceStatusAction(
			c,
			"cancelled",
			classId,
			dateISO,
			ctx.orgId,
			db,
		);
	});

	// Issue #60 — creation is non-idempotent, consistent with POST /syllabi.
	kernel.post("/invoices", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, invoiceCreateSchema);
		if (!body.ok) return body.response;
		const input = body.data;
		const db = deps.getDb();

		// Both lookups are tenant-predicated so unknown and foreign ids stay
		// indistinguishable. The student re-check keeps the new row visible to
		// snapshot reads, which innerJoin student on the same org.
		const [enrollmentRow] = await db
			.select({ studentId: enrollment.studentId })
			.from(enrollment)
			.where(
				and(
					eq(enrollment.id, input.enrollmentId),
					eq(enrollment.orgId, ctx.orgId),
				),
			);
		if (!enrollmentRow) {
			return c.json({ error: "enrollment not found" }, 404);
		}
		const [enrolledStudent] = await db
			.select({ id: student.id })
			.from(student)
			.where(
				and(
					eq(student.id, enrollmentRow.studentId),
					eq(student.orgId, ctx.orgId),
				),
			);
		if (!enrolledStudent) {
			return c.json({ error: "enrollment not found" }, 404);
		}

		// Regex alone accepts 2026-02-30; roundtrip-guard against the real calendar.
		const due = parseStartDateStrict(input.due);
		if (!due) return c.json({ error: "invalid body" }, 400);

		const invoiceId = crypto.randomUUID();
		await db.insert(invoice).values({
			id: invoiceId,
			orgId: ctx.orgId,
			studentId: enrollmentRow.studentId,
			enrollmentId: input.enrollmentId,
			amount: input.amount,
			due,
			note: input.note,
		});
		return c.json({ id: invoiceId } satisfies CreatedResponse, 201);
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

	kernel.post(
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

	kernel.post("/syllabi", async (c) => {
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
			kind: input.kind ?? "lesson",
			status: input.status ?? "upcoming",
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
