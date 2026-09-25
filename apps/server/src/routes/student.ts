import {
	ACCOUNT_ERROR_CODES,
	DAILY_STUDY_HOUR_OPTIONS,
	EXAM_INTERESTS,
	IELTS_TARGET_BANDS,
	LEARNING_GOAL_OPTIONS,
	type LearningGoalOption,
	STUDENT_ERROR_CODES,
	STUDENT_INVITATION_ERROR_CODES,
	type StudentMe,
	type StudentOrgItem,
	type StudentOverview,
	studentOnboardingPayloadSchema,
	TOEIC_TARGET_SCORES,
} from "@teacher-os/api/contracts";
import { formatSchedule } from "@teacher-os/api/format-schedule";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import {
	assignment,
	classAssignment,
	classAssignmentTarget,
	classTable,
	enrollment,
	lesson,
	organization,
	student,
	studentInvitation,
	user,
} from "@teacher-os/db/schema/index";
import { and, asc, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { Db } from "../app";
import type { SessionUser } from "../session";
import { provisionStudentForUser } from "../student-provisioning";

export interface StudentRouteDeps {
	getDb(): Db;
	getSessionUser(headers: Headers): Promise<SessionUser | null>;
	corsOrigin?: string | string[];
}

interface StudentContext {
	student: typeof student.$inferSelect;
	orgId: string;
	userId: string;
	sessionUser: SessionUser & { email: string };
}
function parseLearningGoals(raw: string | null): LearningGoalOption[] | null {
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return null;
		const valid = parsed.filter(
			(g): g is LearningGoalOption =>
				typeof g === "string" &&
				(LEARNING_GOAL_OPTIONS as readonly string[]).includes(g),
		);
		return valid.length === parsed.length ? valid : null;
	} catch {
		return null;
	}
}

function parseEnum<T extends string>(
	raw: string | null,
	allowed: readonly T[],
): T | null {
	return typeof raw === "string" && (allowed as readonly string[]).includes(raw)
		? (raw as T)
		: null;
}

function parseTargetScore(
	examInterest: string | null,
	raw: string | null,
): string | null {
	const allowed =
		examInterest === "toeic" ? TOEIC_TARGET_SCORES : IELTS_TARGET_BANDS;
	return parseEnum(raw, allowed);
}

function buildStudentMe(
	sessionUser: { userName: string; email: string },
	s: typeof student.$inferSelect,
): StudentMe {
	const examInterest = parseEnum(s.examInterest ?? null, EXAM_INTERESTS);
	return {
		user: { name: sessionUser.userName, email: sessionUser.email },
		student: {
			id: s.id,
			name: s.name,
			email: s.email,
			orgId: s.orgId,
			examInterest,
			targetScore: parseTargetScore(examInterest, s.targetScore ?? null),
			learningGoals: parseLearningGoals(s.learningGoals ?? null),
			learningGoalsNote: s.learningGoalsNote ?? null,
			dailyStudyHours: parseEnum(
				s.dailyStudyHours ?? null,
				DAILY_STUDY_HOUR_OPTIONS,
			),
			onboardingCompletedAt:
				s.onboardingCompletedAt instanceof Date
					? s.onboardingCompletedAt.toISOString()
					: typeof s.onboardingCompletedAt === "number"
						? new Date(s.onboardingCompletedAt).toISOString()
						: null,
		},
	};
}

type StudentEnv = {
	Variables: {
		sessionUser: SessionUser & { email: string };
		studentCtx: StudentContext;
	};
};

export function studentRoutes(deps: StudentRouteDeps) {
	const router = new Hono<StudentEnv>();
	const allowedOrigins = Array.isArray(deps.corsOrigin)
		? deps.corsOrigin
		: typeof deps.corsOrigin === "string"
			? [deps.corsOrigin]
			: [];

	// Cookies are SameSite=None, so CSRF defense is an explicit Origin check
	// (same contract as kernel.ts). POST bodies are JSON-only and size-capped.
	router.use("/onboarding", async (c, next) => {
		if (c.req.method === "POST") {
			const origin = c.req.header("Origin") ?? "";
			if (!allowedOrigins.includes(origin)) {
				return c.json({ error: "origin not allowed" }, 403);
			}
			const contentType = c.req.header("Content-Type") ?? "";
			if (!contentType.toLowerCase().startsWith("application/json")) {
				return c.json({ error: "content-type must be application/json" }, 415);
			}
			const contentLength = Number(c.req.header("Content-Length") ?? "0");
			if (contentLength > 4096) {
				return c.json({ error: "payload too large" }, 413);
			}
		}
		return next();
	});

	router.use("*", async (c, next) => {
		const session = await deps.getSessionUser(c.req.raw.headers);
		if (!session) {
			return c.json({ error: "unauthorized" }, 401);
		}

		// Account-role gate (plan #260): a teacher-role session must never
		// reach the student portal.
		if (session.role !== "student") {
			return c.json(
				{
					error: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
					code: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
				},
				403,
			);
		}

		const email = session.email?.trim();
		if (!email) {
			return c.json(
				{
					error: STUDENT_ERROR_CODES.NOT_LINKED,
					code: STUDENT_ERROR_CODES.NOT_LINKED,
				},
				403,
			);
		}

		if (session.emailVerified !== true) {
			return c.json(
				{
					error: STUDENT_ERROR_CODES.EMAIL_UNVERIFIED,
					code: STUDENT_ERROR_CODES.EMAIL_UNVERIFIED,
				},
				403,
			);
		}

		c.set("sessionUser", {
			...session,
			email,
		});

		return next();
	});

	// Notification & Multi-Org Routes (accessible even with 0 student records)
	router.get("/notifications", async (c) => {
		const sessionUser = c.get("sessionUser");
		const db = deps.getDb();
		const normalizedEmail = sessionUser.email.toLowerCase();

		const rows = await db
			.select({
				id: studentInvitation.id,
				orgId: studentInvitation.orgId,
				orgName: organization.name,
				inviterUserId: studentInvitation.inviterUserId,
				inviterName: user.name,
				email: studentInvitation.email,
				status: studentInvitation.status,
				createdAt: studentInvitation.createdAt,
				updatedAt: studentInvitation.updatedAt,
			})
			.from(studentInvitation)
			.innerJoin(organization, eq(studentInvitation.orgId, organization.id))
			.innerJoin(user, eq(studentInvitation.inviterUserId, user.id))
			.where(
				and(
					sql`lower(trim(${studentInvitation.email})) = ${normalizedEmail}`,
					eq(studentInvitation.status, "pending"),
				),
			)
			.orderBy(desc(studentInvitation.createdAt));

		return c.json(rows);
	});

	router.post("/invitations/:id/accept", async (c) => {
		const sessionUser = c.get("sessionUser");
		const id = c.req.param("id");
		const db = deps.getDb();
		const normalizedEmail = sessionUser.email.toLowerCase();

		const [invitation] = await db
			.select()
			.from(studentInvitation)
			.where(
				and(
					eq(studentInvitation.id, id),
					sql`lower(trim(${studentInvitation.email})) = ${normalizedEmail}`,
					eq(studentInvitation.status, "pending"),
				),
			);

		if (!invitation) {
			return c.json(
				{
					error: "Lời mời không tồn tại hoặc đã được xử lý",
					code: STUDENT_INVITATION_ERROR_CODES.INVITATION_NOT_FOUND,
				},
				404,
			);
		}

		const now = new Date();
		await db
			.update(studentInvitation)
			.set({ status: "accepted", updatedAt: now })
			.where(eq(studentInvitation.id, id));

		// Check if student record already exists in target org
		const [existingStudent] = await db
			.select({ id: student.id })
			.from(student)
			.where(
				and(
					eq(student.orgId, invitation.orgId),
					sql`lower(trim(${student.email})) = ${normalizedEmail}`,
				),
			);

		if (!existingStudent) {
			await db.insert(student).values({
				id: crypto.randomUUID(),
				orgId: invitation.orgId,
				name:
					sessionUser.userName || normalizedEmail.split("@")[0] || "Học viên",
				email: normalizedEmail,
				phone: "",
				zalo: "",
				parentName: "",
				parentPhone: "",
				createdAt: now,
			});
		}

		return c.json({ ok: true, orgId: invitation.orgId });
	});

	router.post("/invitations/:id/reject", async (c) => {
		const sessionUser = c.get("sessionUser");
		const id = c.req.param("id");
		const db = deps.getDb();
		const normalizedEmail = sessionUser.email.toLowerCase();

		const [invitation] = await db
			.select()
			.from(studentInvitation)
			.where(
				and(
					eq(studentInvitation.id, id),
					sql`lower(trim(${studentInvitation.email})) = ${normalizedEmail}`,
					eq(studentInvitation.status, "pending"),
				),
			);

		if (!invitation) {
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
			.set({ status: "rejected", updatedAt: new Date() })
			.where(eq(studentInvitation.id, id));

		return c.json({ ok: true });
	});

	router.get("/orgs", async (c) => {
		const sessionUser = c.get("sessionUser");
		const db = deps.getDb();
		const normalizedEmail = sessionUser.email.toLowerCase();
		const requestedOrgId = c.req.header("x-student-org-id");

		const studentRows = await db
			.select({
				studentId: student.id,
				orgId: student.orgId,
				orgName: organization.name,
				createdAt: student.createdAt,
			})
			.from(student)
			.innerJoin(organization, eq(student.orgId, organization.id))
			.where(sql`lower(trim(${student.email})) = ${normalizedEmail}`)
			.orderBy(desc(student.createdAt), desc(student.id));

		if (studentRows.length === 0) {
			return c.json([]);
		}

		// Determine active orgId: requestedOrgId if matches, else studentRows[0].orgId
		const defaultOrgId = studentRows[0]?.orgId ?? "";
		const activeOrgId =
			requestedOrgId && studentRows.some((r) => r.orgId === requestedOrgId)
				? requestedOrgId
				: defaultOrgId;
		const orgs: StudentOrgItem[] = studentRows.map((r) => ({
			id: r.orgId,
			name: r.orgName,
			isCurrent: r.orgId === activeOrgId,
		}));

		return c.json(orgs);
	});

	// Org-Scoped Middleware for /me, /overview, etc.
	const requireStudent = async (
		c: Context<StudentEnv>,
		next: () => Promise<void>,
	) => {
		const sessionUser = c.get("sessionUser");
		const db = deps.getDb();
		const normalizedEmail = sessionUser.email.toLowerCase();

		let rows = await db
			.select()
			.from(student)
			.where(sql`lower(trim(${student.email})) = ${normalizedEmail}`)
			.orderBy(desc(student.createdAt), asc(student.id));

		if (rows.length === 0) {
			if (sessionUser.emailVerified === true) {
				try {
					await provisionStudentForUser(db, {
						name: sessionUser.userName,
						email: sessionUser.email,
					});
					rows = await db
						.select()
						.from(student)
						.where(sql`lower(trim(${student.email})) = ${normalizedEmail}`)
						.orderBy(desc(student.createdAt), asc(student.id));
				} catch (err) {
					console.error("Failed to provision student for user", {
						userId: sessionUser.userId,
						error: err,
					});
				}
			}

			if (rows.length === 0) {
				const code =
					sessionUser.emailVerified === true
						? STUDENT_ERROR_CODES.NOT_LINKED
						: STUDENT_ERROR_CODES.EMAIL_UNVERIFIED;
				return c.json(
					{
						error: code,
						code,
					},
					403,
				);
			}
		}

		const requestedOrgId = c.req.header("x-student-org-id");
		let matchedStudent = rows[0];

		if (requestedOrgId) {
			const found = rows.find((r) => r.orgId === requestedOrgId);
			if (found) {
				matchedStudent = found;
			}
		}

		if (!matchedStudent) {
			return c.json(
				{
					error: STUDENT_ERROR_CODES.NOT_LINKED,
					code: STUDENT_ERROR_CODES.NOT_LINKED,
				},
				403,
			);
		}

		c.set("studentCtx", {
			student: matchedStudent,
			orgId: matchedStudent.orgId,
			userId: sessionUser.userId,
			sessionUser,
		});

		return next();
	};

	router.use("/me", requireStudent);
	router.use("/overview", requireStudent);
	router.use("/onboarding", requireStudent);

	router.get("/me", (c) => {
		const { student: s, sessionUser } = c.get("studentCtx");
		return c.json(buildStudentMe(sessionUser, s));
	});

	router.get("/overview", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const db = deps.getDb();
		const todayISO = vietnamTodayISO();

		const enrollmentRows = await db
			.select({
				id: classTable.id,
				name: classTable.name,
				level: classTable.level,
				mode: classTable.mode,
				schedule: classTable.schedule,
				sessionsDone: classTable.sessionsDone,
				sessionsTotal: classTable.sessionsTotal,
				status: classTable.status,
			})
			.from(enrollment)
			.innerJoin(classTable, eq(enrollment.classId, classTable.id))
			.where(and(eq(enrollment.orgId, orgId), eq(enrollment.studentId, s.id)))
			.orderBy(asc(classTable.createdAt), asc(classTable.id));

		const classes = await Promise.all(
			enrollmentRows.map(async (cls) => {
				const nextSessions = await db
					.select({
						date: lesson.date,
						time: lesson.time,
						topic: lesson.topic,
					})
					.from(lesson)
					.where(
						and(
							eq(lesson.orgId, orgId),
							eq(lesson.classId, cls.id),
							isNotNull(lesson.date),
							gte(lesson.date, todayISO),
						),
					)
					.orderBy(asc(lesson.date), asc(lesson.day), asc(lesson.time))
					.limit(1);

				const first = nextSessions[0];
				const nextSession =
					first?.date != null
						? { date: first.date, time: first.time, topic: first.topic }
						: null;

				return {
					id: cls.id,
					name: cls.name,
					level: cls.level,
					mode: cls.mode,
					schedule: formatSchedule(cls.schedule),
					sessionsDone: cls.sessionsDone,
					sessionsTotal: cls.sessionsTotal,
					status: cls.status,
					nextSession,
				};
			}),
		);

		const targetRows = await db
			.select({
				id: classAssignment.id,
				title: classAssignment.title,
				classId: classAssignment.classId,
				className: classTable.name,
				due: classAssignment.due,
				submittedAt: classAssignmentTarget.submittedAt,
			})
			.from(classAssignmentTarget)
			.innerJoin(
				classAssignment,
				eq(classAssignmentTarget.assignmentId, classAssignment.id),
			)
			.leftJoin(classTable, eq(classAssignment.classId, classTable.id))
			.where(
				and(
					eq(classAssignmentTarget.orgId, orgId),
					eq(classAssignmentTarget.studentId, s.id),
				),
			)
			.orderBy(desc(classAssignment.createdAt));

		const classAssignmentItems = targetRows.map((row) => ({
			id: row.id,
			title: row.title,
			source: "class_assignment" as const,
			classId: row.classId,
			className: row.className ?? null,
			due: row.due,
			submittedAt: row.submittedAt ?? null,
			scores: null,
		}));

		const gradingRows = await db
			.select({
				id: assignment.id,
				title: assignment.title,
				due: assignment.due,
				scores: assignment.scores,
			})
			.from(assignment)
			.where(and(eq(assignment.orgId, orgId), eq(assignment.studentId, s.id)))
			.orderBy(desc(assignment.createdAt));

		const gradingItems = gradingRows.map((row) => ({
			id: row.id,
			title: row.title,
			source: "grading" as const,
			classId: null,
			className: null,
			due: row.due ?? "",
			submittedAt: null,
			scores: row.scores ?? null,
		}));

		const response: StudentOverview = {
			student: {
				id: s.id,
				name: s.name,
			},
			classes,
			assignments: [...classAssignmentItems, ...gradingItems],
		};

		return c.json(response);
	});

	router.post("/onboarding", async (c) => {
		const { student: s, sessionUser } = c.get("studentCtx");
		const db = deps.getDb();

		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		const parsed = studentOnboardingPayloadSchema.safeParse(raw);
		if (!parsed.success) {
			return c.json({ error: "invalid body" }, 400);
		}

		const {
			examInterest,
			targetScore,
			learningGoals,
			learningGoalsNote,
			dailyStudyHours,
		} = parsed.data;
		await db
			.update(student)
			.set({
				examInterest,
				targetScore,
				learningGoals: JSON.stringify([...learningGoals]),
				learningGoalsNote: learningGoalsNote?.length ? learningGoalsNote : null,
				dailyStudyHours,
				onboardingCompletedAt: new Date(),
			})
			.where(eq(student.id, s.id));

		const [updated] = await db
			.select()
			.from(student)
			.where(eq(student.id, s.id))
			.limit(1);
		if (!updated) {
			return c.json({ error: STUDENT_ERROR_CODES.NOT_LINKED }, 403);
		}
		return c.json(buildStudentMe(sessionUser, updated), 200);
	});

	return router;
}
