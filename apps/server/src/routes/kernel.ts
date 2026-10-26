import type {
	CreatedResponse,
	InvoiceTransactionItem,
	OccurrenceMutationResponse,
} from "@teacher-os/api/contracts";
import {
	classAssignmentCreateSchema,
	classCreateSchema,
	classNotesSchema,
	classTuitionFeeUpdateSchema,
	enrollStudentSchema,
	invoiceCreateSchema,
	invoiceMarkPaidSchema,
	lessonActionSchema,
	lessonEditSchema,
	lessonStatusForAttendance,
	occurrenceEditSchema,
	STUDENT_INVITATION_ERROR_CODES,
	sessionAttendanceSaveSchema,
	studentInviteSchema,
} from "@teacher-os/api/contracts";
import {
	generatePaymentCode,
	generatePayToken,
} from "@teacher-os/api/lib/payment-code";
import {
	isoToLessonWeekday,
	parseStartDateStrict,
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
import { holidaySessionShift } from "@teacher-os/db/schema/organization-holiday";
import { paymentTransaction } from "@teacher-os/db/schema/payment-transaction";
import { student } from "@teacher-os/db/schema/student";
import { studentInvitation } from "@teacher-os/db/schema/student-invitation";
import type {
	syllabus,
	syllabusLesson,
	syllabusModule,
} from "@teacher-os/db/schema/syllabus";
import { and, desc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import type { Db, KernelCtx } from "../app";
import type { MediaStore } from "../lib/media-store";
import {
	ensurePaymentRefs,
	loadPaymentInstructions,
} from "../lib/payment-instructions";
import {
	buildImportBatch,
	findSyllabus,
	MAX_IMPORT_NODES,
	selectTemplateTree,
} from "../lib/syllabus-curriculum";
import { assignmentRoutes } from "./assignments";
import { bankLinkRoutes } from "./bank-link";
import { dailyAttendanceRoutes } from "./daily-attendance";
import {
	dashboardReminderRoutes,
	resolveReminderScope,
} from "./dashboard-reminders";
import { activateEnrollment } from "./enrollment-activation";
import { gradingRoutes } from "./grading";
import { holidayRoutes, isRollbackableConstraintError } from "./holidays";
import { paymentTransactionRoutes } from "./payment-transactions";
import { commentBankRoutes, notifRoutes, reportRoutes } from "./reporting";
import { loadInvoices, loadSnapshot } from "./snapshot";
import { syllabusRoutes } from "./syllabus";
import { vocabLibraryRoutes } from "./vocab-library";
import { vocabTeacherRoutes } from "./vocab-teacher";

// Re-export để giữ import path cũ của test (kernel.test.ts) sau khi helper
// chuyển sang enrollment-activation.ts.
export { generateScheduleLessons } from "./enrollment-activation";

type Env = { Variables: { kernelCtx: KernelCtx } };
type KernelContext = Context<Env>;

export function kernelRoutes(deps: {
	getDb(): Db;
	getMediaStore?(): MediaStore | undefined;
	corsOrigin?: string | string[];
	corsOrigins?: string | string[];
}) {
	const kernel = new Hono<Env>();
	const allowedOrigins = Array.isArray(deps.corsOrigins)
		? deps.corsOrigins
		: typeof deps.corsOrigins === "string"
			? [deps.corsOrigins]
			: Array.isArray(deps.corsOrigin)
				? deps.corsOrigin
				: typeof deps.corsOrigin === "string"
					? [deps.corsOrigin]
					: [];

	// Cookies are SameSite=None, so CSRF defense is an explicit Origin check:
	// cross-site writes (POST/PUT/PATCH/DELETE, or non-browser calls without
	// the right Origin) fail closed.
	// POST bodies are JSON-only; form posts die on content-type before parsing.
	kernel.use("*", async (c, next) => {
		if (["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)) {
			const origin = c.req.header("Origin") ?? "";
			if (!allowedOrigins.includes(origin)) {
				return c.json({ error: "origin not allowed" }, 403);
			}
			if (c.req.method === "POST") {
				const contentType = c.req.header("Content-Type") ?? "";
				if (!contentType.toLowerCase().startsWith("application/json")) {
					return c.json(
						{ error: "content-type must be application/json" },
						415,
					);
				}
			}
		}
		return next();
	});

	function unauthorized(c: KernelContext) {
		return c.json({ error: "unauthorized" }, 401);
	}

	/**
	 * Check-in on a session whose date is after today (VN) is refused. 422, not
	 * 409: the web client maps 409 to a "heal stale snapshot" copy. `error`
	 * carries the machine code too because the client reads `error ?? reason`.
	 */
	function futureSession(c: KernelContext) {
		return c.json({ error: "future-session", reason: "future-session" }, 422);
	}

	async function readBody<S extends z.ZodType>(
		c: KernelContext,
		schema: S,
	): Promise<
		{ ok: true; data: z.infer<S> } | { ok: false; response: Response }
	> {
		const contentType = c.req.header("Content-Type") ?? "";
		if (!contentType.toLowerCase().startsWith("application/json")) {
			return {
				ok: false,
				response: c.json(
					{ error: "content-type must be application/json" },
					415,
				),
			};
		}
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
				mode: classTable.mode,
				tuitionFee: classTable.tuitionFee,
			})
			.from(classTable)
			.where(and(eq(classTable.id, classId), eq(classTable.orgId, orgId)));
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

	kernel.get("/students", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const snapshot = await loadSnapshot(deps.getDb(), ctx.orgId);
		return c.json(snapshot.students);
	});

	kernel.post("/students/invite", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, studentInviteSchema);
		if (!body.ok) return body.response;
		const normalizedEmail = body.data.email.trim().toLowerCase();
		const db = deps.getDb();

		// Check if already student in this org
		const [existingStudent] = await db
			.select({ id: student.id })
			.from(student)
			.where(
				and(
					eq(student.orgId, ctx.orgId),
					sql`lower(trim(${student.email})) = ${normalizedEmail}`,
				),
			)
			.limit(1);

		if (existingStudent) {
			return c.json(
				{
					error: "Học viên này đã ở trong tổ chức của bạn",
					code: STUDENT_INVITATION_ERROR_CODES.ALREADY_IN_ORG,
				},
				409,
			);
		}

		// Check if pending invite already exists in this org
		const [existingInvite] = await db
			.select({ id: studentInvitation.id })
			.from(studentInvitation)
			.where(
				and(
					eq(studentInvitation.orgId, ctx.orgId),
					sql`lower(trim(${studentInvitation.email})) = ${normalizedEmail}`,
					eq(studentInvitation.status, "pending"),
				),
			)
			.limit(1);

		if (existingInvite) {
			return c.json(
				{
					error: "Lời mời đang chờ học viên phản hồi",
					code: STUDENT_INVITATION_ERROR_CODES.INVITATION_ALREADY_PENDING,
				},
				409,
			);
		}

		const id = crypto.randomUUID();
		const now = new Date();
		await db.insert(studentInvitation).values({
			id,
			orgId: ctx.orgId,
			inviterUserId: ctx.userId,
			email: normalizedEmail,
			status: "pending",
			createdAt: now,
			updatedAt: now,
		});

		const [created] = await db
			.select()
			.from(studentInvitation)
			.where(eq(studentInvitation.id, id));

		return c.json(created, 201);
	});

	kernel.get("/students/invitations", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const db = deps.getDb();
		const rows = await db
			.select()
			.from(studentInvitation)
			.where(eq(studentInvitation.orgId, ctx.orgId))
			.orderBy(desc(studentInvitation.createdAt));

		return c.json(rows);
	});

	kernel.delete("/students/invitations/:id", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const id = c.req.param("id");
		const db = deps.getDb();

		const [existing] = await db
			.select()
			.from(studentInvitation)
			.where(
				and(
					eq(studentInvitation.id, id),
					eq(studentInvitation.orgId, ctx.orgId),
					eq(studentInvitation.status, "pending"),
				),
			);

		if (!existing) {
			return c.json(
				{
					error: "Lời mời không tồn tại hoặc đã được xử lý",
					code: STUDENT_INVITATION_ERROR_CODES.INVITATION_NOT_FOUND,
				},
				404,
			);
		}

		await db
			.update(studentInvitation)
			.set({ status: "canceled", updatedAt: new Date() })
			.where(eq(studentInvitation.id, id));

		return c.json({ ok: true });
	});

	// Issue #122 / Issue #257: enroll an EXISTING student into a class —
	// this is the ONLY way teachers attach students to classes.
	// Students originate from student portal provisioning on first portal login.
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
		await db.insert(enrollment).values({
			id: enrollmentId,
			orgId: ctx.orgId,
			classId: cls.id,
			studentId: input.studentId,
			status: "invited",
		});
		return c.json({ id: enrollmentId } satisfies CreatedResponse, 201);
	});

	/**
	 * POST /api/enrollments/:enrollmentId/accept
	 *
	 * Kích hoạt enrollment: chuyển 'invited' -> 'active' và sinh sessionPackage + lessons.
	 * 1 endpoint, 2 caller: nút "Kích hoạt" của teacher trên roster admin và nút
	 * "Tham gia lớp" của student portal (POST /api/student/enrollments/:id/accept).
	 * Logic dùng chung (idempotent, CAS) nằm ở enrollment-activation.ts.
	 */
	kernel.post("/enrollments/:enrollmentId/accept", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const db = deps.getDb();
		const enrollmentId = c.req.param("enrollmentId");

		const result = await activateEnrollment(db, ctx.orgId, enrollmentId);
		if (result.ok) {
			return c.json({ ok: true });
		}
		return c.json(
			{
				error:
					result.error === "class" ? "class not found" : "enrollment not found",
			},
			404,
		);
	});

	/**
	 * DELETE /api/enrollments/:enrollmentId
	 *
	 * Hủy lời mời tham gia lớp (D5).
	 * Vùng an toàn: CHỈ cho phép khi status = 'invited' (chưa có package/lesson/invoice).
	 * Trả 409 nếu status = 'active'.
	 * Trả 404 nếu không tìm thấy trong org.
	 */
	kernel.delete("/enrollments/:enrollmentId", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const db = deps.getDb();
		const enrollmentId = c.req.param("enrollmentId");

		const [row] = await db
			.select({ id: enrollment.id, status: enrollment.status })
			.from(enrollment)
			.where(
				and(eq(enrollment.id, enrollmentId), eq(enrollment.orgId, ctx.orgId)),
			);
		if (!row) {
			return c.json({ error: "enrollment not found" }, 404);
		}
		if (row.status !== "invited") {
			return c.json({ error: "cannot delete active enrollment" }, 409);
		}

		await db
			.delete(enrollment)
			.where(
				and(eq(enrollment.id, enrollmentId), eq(enrollment.orgId, ctx.orgId)),
			);
		return c.json({ ok: true });
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
				and(
					eq(enrollment.classId, classId),
					eq(enrollment.orgId, ctx.orgId),
					eq(enrollment.status, "active"),
				),
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

	// isoToLessonWeekday sống ở @teacher-os/api/skeleton (TOS-11 M5) — route
	// holidays và activation cùng dùng một nguồn, không giữ bản mirror.

	/**
	 * C2 (TOS-11): nhóm buổi có dòng `holiday` bị khóa sửa/dời — bảng
	 * `holiday_session_shift` là nguồn sự thật cho cặp gốc→bù; moveDate nhóm
	 * này làm `originalDate`/`makeupDate` lệch, vỡ nhãn "Đã dời sang" và D6.
	 */
	async function holidayBucketLocked(
		db: Db,
		orgId: string,
		classId: string,
		dateISO: string,
	): Promise<boolean> {
		const rows = await db
			.select({ id: lesson.id })
			.from(lesson)
			.where(
				and(
					eq(lesson.orgId, orgId),
					eq(lesson.classId, classId),
					eq(lesson.date, dateISO),
					eq(lesson.status, "holiday"),
				),
			)
			.limit(1);
		return rows.length > 0;
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
					// C2 (TOS-11): dòng `holiday` không bao giờ bị ghi đè qua occurrenceUpdate.
					ne(lesson.status, "holiday"),
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
		// Undated legacy rows carry no date to compare — the web UI gates them.
		const today = vietnamTodayISO();
		const checkingIn = nextStatus === "completed";
		if (checkingIn && row.date !== null && row.date > today) {
			return futureSession(c);
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
					// Re-assert the date guard in the write itself: the row may have
					// been moved between the pre-read and this UPDATE.
					checkingIn
						? or(isNull(lesson.date), lte(lesson.date, today))
						: undefined,
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
			// C2 (TOS-11): bucket có dòng `holiday` bị khóa sửa.
			if (await holidayBucketLocked(db, ctx.orgId, pre.classId, pre.date)) {
				return c.json(
					{ error: "holiday occurrence is locked", reason: "holiday-locked" },
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
		// C2 (TOS-11): bucket có dòng `holiday` bị khóa sửa/dời — nhãn "Đã dời
		// sang" và D6 đọc `holiday_session_shift` theo ngày gốc/ngày bù.
		if (await holidayBucketLocked(db, ctx.orgId, classId, dateISO)) {
			return c.json(
				{ error: "holiday occurrence is locked", reason: "holiday-locked" },
				409,
			);
		}
		try {
			let rows: Array<{ id: string }>;
			if (moveDateISO && moveDateISO !== dateISO) {
				// C2: dời lesson và kéo `holiday_session_shift.makeupDate` trong
				// CÙNG một db.batch nguyên tử để không bao giờ lệch trạng thái.
				try {
					const [updatedRows] = await db.batch([
						occurrenceUpdate(db, classId, dateISO, ctx.orgId, set, false),
						db
							.update(holidaySessionShift)
							.set({ makeupDate: moveDateISO })
							.where(
								and(
									eq(holidaySessionShift.orgId, ctx.orgId),
									eq(holidaySessionShift.classId, classId),
									eq(holidaySessionShift.makeupDate, dateISO),
								),
							),
					]);
					rows = updatedRows;
				} catch (shiftCause) {
					if (isRollbackableConstraintError(shiftCause)) {
						return c.json(
							{
								error: "destination date occupied",
								reason: "date-occupied",
							},
							409,
						);
					}
					throw shiftCause;
				}
			} else {
				rows = await occurrenceUpdate(
					db,
					classId,
					dateISO,
					ctx.orgId,
					set,
					false,
				);
			}
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
		if (nextStatus === "completed" && dateISO > vietnamTodayISO()) {
			return futureSession(c);
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

	kernel.put("/classes/:id/sessions/:date/attendance", async (c) => {
		const parsed = await parseOccurrenceContext(c);
		if (!parsed.ok) return parsed.response;
		const { ctx, db, classId, dateISO } = parsed;
		const body = await readBody(c, sessionAttendanceSaveSchema);
		if (!body.ok) return body.response;

		const scope = resolveReminderScope();
		if (scope.kind === "assigned" && !scope.classIds.includes(classId)) {
			return c.json({ error: "class not found", reason: "not-found" }, 404);
		}
		const cls = await findClass(db, classId, ctx.orgId);
		if (!cls) {
			return c.json({ error: "class not found", reason: "not-found" }, 404);
		}

		const today = vietnamTodayISO();
		if (dateISO > today) {
			return futureSession(c);
		}

		const rosterRows = await db
			.select({ id: lesson.id })
			.from(lesson)
			.innerJoin(
				enrollment,
				and(
					eq(lesson.enrollmentId, enrollment.id),
					eq(enrollment.classId, lesson.classId),
					eq(enrollment.orgId, ctx.orgId),
					eq(enrollment.status, "active"),
				),
			)
			.where(
				and(
					eq(lesson.orgId, ctx.orgId),
					eq(lesson.classId, classId),
					eq(lesson.date, dateISO),
					// TOS-11: buổi `holiday` (Nghỉ lễ — Đã dời lịch) không diễn ra,
					// không nằm trong roster điểm danh.
					ne(lesson.status, "cancelled"),
					ne(lesson.status, "holiday"),
				),
			);
		if (rosterRows.length === 0) {
			return c.json(
				{ error: "occurrence not found", reason: "not-found" },
				404,
			);
		}

		const { entries } = body.data;
		const rosterIdSet = new Set(rosterRows.map((r) => r.id));
		const sentIdSet = new Set(entries.map((e) => e.lessonId));

		for (const sentId of sentIdSet) {
			if (!rosterIdSet.has(sentId)) {
				return c.json(
					{ error: "unknown lesson", reason: "unknown-lesson" },
					422,
				);
			}
		}

		const missing = rosterRows
			.map((r) => r.id)
			.filter((id) => !sentIdSet.has(id));
		if (missing.length > 0) {
			return c.json(
				{
					error: "incomplete roster",
					reason: "incomplete-roster",
					missing,
				},
				422,
			);
		}

		// D1 không có .transaction() tương tác; ghi bằng một db.batch nguyên tử
		// kèm roster-snapshot guard trong WHERE. Nếu roster đổi giữa lúc đọc và
		// ghi (ví dụ kích hoạt enrollment muộn thêm dòng upcoming), guard count
		// lệch cho mọi câu lệnh -> toàn batch cập nhật 0 dòng -> trả 409.
		const rosterCountGuard = sql`(SELECT count(*) FROM ${lesson} INNER JOIN ${enrollment} ON ${lesson.enrollmentId} = ${enrollment.id} AND ${enrollment.classId} = ${lesson.classId} WHERE ${lesson.orgId} = ${ctx.orgId} AND ${lesson.classId} = ${classId} AND ${lesson.date} = ${dateISO} AND ${lesson.status} != 'cancelled' AND ${lesson.status} != 'holiday' AND ${enrollment.status} = 'active') = ${entries.length}`;

		const statements = entries.map((entry) =>
			db
				.update(lesson)
				.set({
					status: lessonStatusForAttendance(entry.attendance),
					attendance: entry.attendance,
					attendanceNote: entry.note,
				})
				.where(
					and(
						eq(lesson.id, entry.lessonId),
						eq(lesson.orgId, ctx.orgId),
						eq(lesson.classId, classId),
						eq(lesson.date, dateISO),
						ne(lesson.status, "cancelled"),
						// TOS-11: dòng `holiday` không bao giờ nhận điểm danh.
						ne(lesson.status, "holiday"),
						lte(lesson.date, today),
						inArray(
							lesson.enrollmentId,
							db
								.select({ id: enrollment.id })
								.from(enrollment)
								.where(
									and(
										eq(enrollment.classId, classId),
										eq(enrollment.orgId, ctx.orgId),
										eq(enrollment.status, "active"),
									),
								),
						),
						rosterCountGuard,
					),
				)
				.returning({ id: lesson.id }),
		);
		const [first, ...rest] = statements;
		if (!first) {
			return c.json({ error: "invalid body" }, 400);
		}
		const results = await db.batch([first, ...rest]);
		const updated = results.reduce((acc, rows) => acc + rows.length, 0);
		if (updated !== entries.length) {
			return c.json({ error: "roster changed", reason: "roster-changed" }, 409);
		}

		return c.json({ updated, recorded: true });
	});

	// Issue #60 — creation is non-idempotent, consistent with POST /api/syllabus-templates.
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
			.select({
				studentId: enrollment.studentId,
				status: enrollment.status,
			})
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
		if (enrollmentRow.status !== "active") {
			return c.json({ error: "Học viên chưa đồng ý tham gia lớp" }, 409);
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
			// #320: every new invoice gets its transfer code + public pay token.
			paymentCode: generatePaymentCode(),
			payToken: generatePayToken(),
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

	// #320: rotate the public pay token (old links die — the modal confirms).
	kernel.post("/invoices/:id/rotate-pay-token", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const db = deps.getDb();
		const [updated] = await db
			.update(invoice)
			.set({ payToken: generatePayToken() })
			.where(
				and(eq(invoice.id, c.req.param("id")), eq(invoice.orgId, ctx.orgId)),
			)
			.returning({ payToken: invoice.payToken });
		if (!updated) return c.json({ error: "invoice not found" }, 404);
		return c.json({ payToken: updated.payToken });
	});

	// #320: transfer instructions for one invoice (teacher view, org-scoped).
	kernel.get("/invoices/:id/payment", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const db = deps.getDb();
		const row = await ensurePaymentRefs(db, c.req.param("id"), ctx.orgId);
		if (!row) return c.json({ error: "invoice not found" }, 404);
		const instructions = await loadPaymentInstructions({ db, invoice: row });
		return c.json({ ...instructions, payToken: row.payToken });
	});

	// #345: matched bank transactions for one invoice (teacher detail page,
	// org-scoped; raw/provider payloads stay server-side per #320 retention).
	kernel.get("/invoices/:id/transactions", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const db = deps.getDb();
		const invoiceId = c.req.param("id");
		const [inv] = await db
			.select({ id: invoice.id })
			.from(invoice)
			.where(and(eq(invoice.id, invoiceId), eq(invoice.orgId, ctx.orgId)));
		if (!inv) return c.json({ error: "invoice not found" }, 404);
		const rows = await db
			.select()
			.from(paymentTransaction)
			.where(
				and(
					eq(paymentTransaction.orgId, ctx.orgId),
					eq(paymentTransaction.invoiceId, invoiceId),
					eq(paymentTransaction.matchStatus, "matched"),
				),
			)
			.orderBy(desc(paymentTransaction.createdAt), desc(paymentTransaction.id))
			.limit(100);
		return c.json(
			rows.map((tx) => ({
				id: tx.id,
				amount: tx.amount,
				content: tx.content,
				referenceCode: tx.referenceCode,
				transactionDate: tx.transactionDate,
				createdAt: tx.createdAt.toISOString(),
			})) satisfies InvoiceTransactionItem[],
		);
	});

	// Mounted after the Origin/content-type middleware above, so the
	// sub-router's POSTs are CSRF-guarded exactly like the kernel writes.
	kernel.route("/", syllabusRoutes(deps));
	kernel.route("/assignments", assignmentRoutes(deps));
	kernel.route("/reports", reportRoutes(deps));
	kernel.route("/notifs", notifRoutes(deps));
	kernel.route("/comment-bank", commentBankRoutes(deps));
	kernel.route("/bank-link", bankLinkRoutes(deps));
	kernel.route("/payment-transactions", paymentTransactionRoutes(deps));
	kernel.route("/grading", gradingRoutes(deps));
	// TOS-6 (#439): bộ đếm 3 thẻ "Việc cần làm hôm nay" — GET /api/dashboard/reminders.
	kernel.route("/dashboard", dashboardReminderRoutes(deps));
	// TOS-7 (#440): danh sách ca điểm danh theo ngày — GET /api/attendance/daily.
	kernel.route("/attendance", dailyAttendanceRoutes(deps));
	kernel.route("/holidays", holidayRoutes(deps));
	// #359: duy nhất /api/kernel/vocab/* — web kernelCommand gọi đúng path này;
	// mount /vocab trùng (/api/vocab/*) đã bỏ để không mở surface thừa.
	kernel.route("/kernel/vocab", vocabTeacherRoutes(deps));
	// #361: catalog thư viện từ vựng read-global cho mọi org đã đăng nhập (vẫn 401 khi chưa đăng nhập),
	// POST /clone kiểm tra org-guard trên classId.
	kernel.route("/kernel/vocab-library", vocabLibraryRoutes(deps));

	return kernel;
}
