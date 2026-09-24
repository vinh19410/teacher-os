import {
	ACCOUNT_ERROR_CODES,
	STUDENT_ERROR_CODES,
	type StudentMe,
	type StudentOverview,
} from "@teacher-os/api/contracts";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import {
	assignment,
	classAssignment,
	classAssignmentTarget,
	classTable,
	enrollment,
	lesson,
	student,
} from "@teacher-os/db/schema/index";
import { and, asc, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../app";
import type { SessionUser } from "../session";
import { provisionStudentForUser } from "../student-provisioning";

export interface StudentRouteDeps {
	getDb(): Db;
	getSessionUser(headers: Headers): Promise<SessionUser | null>;
}

interface StudentContext {
	student: typeof student.$inferSelect;
	orgId: string;
	userId: string;
	sessionUser: SessionUser & { email: string };
}

type StudentEnv = {
	Variables: {
		studentCtx: StudentContext;
	};
};

export function studentRoutes(deps: StudentRouteDeps) {
	const router = new Hono<StudentEnv>();

	router.use("*", async (c, next) => {
		const session = await deps.getSessionUser(c.req.raw.headers);
		if (!session) {
			return c.json({ error: "unauthorized" }, 401);
		}

		// Account-role gate (plan #260): a teacher-role session must never
		// reach the email match/provision step, even with a matching student
		// profile (the shared cookie zone makes stale teacher sessions land
		// here without any portal sign-in).
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

		const db = deps.getDb();
		const normalizedEmail = email.toLowerCase();
		let rows = await db
			.select()
			.from(student)
			.where(sql`lower(trim(${student.email})) = ${normalizedEmail}`)
			.orderBy(asc(student.createdAt), asc(student.id));

		if (rows.length === 0) {
			if (session.emailVerified === true) {
				try {
					await provisionStudentForUser(db, {
						name: session.userName,
						email,
					});
					rows = await db
						.select()
						.from(student)
						.where(sql`lower(trim(${student.email})) = ${normalizedEmail}`)
						.orderBy(asc(student.createdAt), asc(student.id));
				} catch (err) {
					console.error("Failed to provision student for user", {
						userId: session.userId,
						error: err,
					});
				}
			}

			if (rows.length === 0) {
				return c.json(
					{
						error: STUDENT_ERROR_CODES.NOT_LINKED,
						code: STUDENT_ERROR_CODES.NOT_LINKED,
					},
					403,
				);
			}
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

		if (rows.length > 1) {
			return c.json(
				{
					error: STUDENT_ERROR_CODES.AMBIGUOUS,
					code: STUDENT_ERROR_CODES.AMBIGUOUS,
				},
				403,
			);
		}

		const matchedStudent = rows[0];
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
			userId: session.userId,
			sessionUser: {
				...session,
				email,
			},
		});

		return next();
	});

	router.get("/me", (c) => {
		const { student: s, sessionUser } = c.get("studentCtx");
		const response: StudentMe = {
			user: {
				name: sessionUser.userName,
				email: sessionUser.email,
			},
			student: {
				id: s.id,
				name: s.name,
				email: s.email,
				orgId: s.orgId,
			},
		};
		return c.json(response);
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
					schedule: cls.schedule,
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

	return router;
}
