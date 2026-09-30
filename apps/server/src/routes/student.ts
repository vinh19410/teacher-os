import {
	ACCOUNT_ERROR_CODES,
	type AssignmentQuestion,
	DAILY_STUDY_HOUR_OPTIONS,
	type EnrollmentStatus,
	EXAM_INTERESTS,
	IELTS_TARGET_BANDS,
	LEARNING_GOAL_OPTIONS,
	type LearningGoalOption,
	type QuizAttemptDetail,
	type QuizAttemptStatus,
	type QuizAttemptSummary,
	quizAnswerPatchSchema,
	quizAttemptActionSchema,
	STUDENT_ERROR_CODES,
	STUDENT_INVITATION_ERROR_CODES,
	type StudentMe,
	type StudentOrgItem,
	type StudentOverview,
	type StudentQuizDetail,
	studentOnboardingPayloadSchema,
	TOEIC_TARGET_SCORES,
} from "@teacher-os/api/contracts";
import { formatSchedule } from "@teacher-os/api/format-schedule";
import { gradeQuiz } from "@teacher-os/api/lib/grade-quiz";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import {
	assignment,
	assignmentPrompt,
	classAssignment,
	classAssignmentTarget,
	classTable,
	enrollment,
	lesson,
	organization,
	quizAttempt,
	student,
	studentInvitation,
	user,
} from "@teacher-os/db/schema/index";
import { and, asc, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Db } from "../app";
import type { SessionUser } from "../session";
import { provisionStudentForUser } from "../student-provisioning";
import { activateEnrollment } from "./enrollment-activation";
import { parsePin } from "./snapshot";

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

/** Snapshot/prompt questions JSON → guarded AssignmentQuestion[] (same
 * fallback style as snapshot.ts parseQuestions: corrupt rows → []). */
function parseQuizQuestions(raw: string, rowId: string): AssignmentQuestion[] {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			console.warn(`[student] invalid quiz questions JSON for ${rowId}`);
			return [];
		}
		return parsed.flatMap((item) => {
			if (!item || typeof item !== "object") return [];
			const record = item as Record<string, unknown>;
			return [
				{
					stem: typeof record.stem === "string" ? record.stem : "",
					opts: Array.isArray(record.opts)
						? record.opts.filter(
								(option): option is string => typeof option === "string",
							)
						: null,
					answer: typeof record.answer === "string" ? record.answer : "",
					alts: typeof record.alts === "string" ? record.alts : "",
					pin: parsePin(record.pin),
				},
			];
		});
	} catch {
		console.warn(`[student] invalid quiz questions JSON for ${rowId}`);
		return [];
	}
}

/** answers JSON `{"<qIndex>":"<value>"}` → guarded record (corrupt → {}). */
function parseQuizAnswers(raw: string): Record<string, string> {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {};
		}
		const answers: Record<string, string> = {};
		for (const [key, value] of Object.entries(parsed)) {
			if (typeof value === "string") answers[key] = value;
		}
		return answers;
	} catch {
		return {};
	}
}

/** optionBank JSON string[] → guarded (corrupt/legacy → []). */
function parseQuizOptionBank(raw: string): string[] {
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter((item): item is string => typeof item === "string")
			: [];
	} catch {
		return [];
	}
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

	// CSRF defense cho POST accept enrollment — cùng contract với /onboarding.
	router.use("/enrollments/*", async (c, next) => {
		if (c.req.method === "POST") {
			const origin = c.req.header("Origin") ?? "";
			if (!allowedOrigins.includes(origin)) {
				return c.json({ error: "origin not allowed" }, 403);
			}
			const contentType = c.req.header("Content-Type") ?? "";
			if (!contentType.toLowerCase().startsWith("application/json")) {
				return c.json({ error: "content-type must be application/json" }, 415);
			}
		}
		return next();
	});

	// CSRF defense cho POST invitations (accept/reject) — cùng contract với
	// /enrollments/*; các handler này không đọc body nên chặn simple-request
	// cross-site (form/text/plain) bằng Origin + Content-Type check.
	router.use("/invitations/*", async (c, next) => {
		if (c.req.method === "POST") {
			const origin = c.req.header("Origin") ?? "";
			if (!allowedOrigins.includes(origin)) {
				return c.json({ error: "origin not allowed" }, 403);
			}
			const contentType = c.req.header("Content-Type") ?? "";
			if (!contentType.toLowerCase().startsWith("application/json")) {
				return c.json({ error: "content-type must be application/json" }, 415);
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
	router.use("/enrollments/:enrollmentId/accept", requireStudent);

	// --- Student quiz take & review (#283) --------------------------------
	// RT#1: requireStudent là closure của studentRoutes() nên mọi endpoint
	// quiz/attempt PHẢI khai báo ngay trong router này (bootstrapMiddleware
	// bỏ qua /api/student — router mount riêng sẽ không có auth).
	router.use("/assignments/:assignmentId/quiz", requireStudent);
	router.use("/assignments/:assignmentId/quiz/*", requireStudent);
	router.use("/attempts/*", requireStudent);

	// CSRF cho POST/PATCH mới (RT#2, mirror guard /onboarding). Đăng ký SAU
	// session gate `use("*")` nên request không có session vẫn 401 trước khi
	// chạm CSRF; body cap 4096 bytes như onboarding (RT#16).
	const quizWriteGuard = async (
		c: Context<StudentEnv>,
		next: () => Promise<void>,
	) => {
		if (c.req.method === "POST" || c.req.method === "PATCH") {
			const origin = c.req.header("Origin") ?? "";
			if (!allowedOrigins.includes(origin)) {
				return c.json({ error: "origin not allowed" }, 403);
			}
			const contentType = c.req.header("Content-Type") ?? "";
			if (!contentType.toLowerCase().startsWith("application/json")) {
				return c.json({ error: "content-type must be application/json" }, 415);
			}
			// Cap đo TRÊN BYTE THẬT của body (chunked/malformed
			// Content-Length không lọt) — precedent kernel.ts /syllabi.
			return bodyLimit({
				maxSize: 4096,
				onError: (bc) => bc.json({ error: "payload too large" }, 413),
			})(c, next);
		}
		return next();
	};
	router.use("/assignments/:assignmentId/quiz/*", quizWriteGuard);
	router.use("/attempts/*", quizWriteGuard);

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
				enrollmentId: enrollment.id,
				enrollmentStatus: enrollment.status,
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
					enrollmentId: cls.enrollmentId,
					// DB lưu text; lifecycle chỉ ghi 'invited' | 'active' (schema enrollment).
					enrollmentStatus: cls.enrollmentStatus as EnrollmentStatus,
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

	/**
	 * POST /api/student/enrollments/:enrollmentId/accept
	 *
	 * Học viên xác nhận tham gia lớp: enrollment 'invited' -> 'active' (sinh
	 * sessionPackage + lessons). Logic dùng chung với nút "Kích hoạt" của
	 * teacher nằm ở enrollment-activation.ts (idempotent, CAS).
	 * Scope: enrollment phải thuộc về chính học viên này trong org đang chọn —
	 * student không thể kích hoạt enrollment của học viên khác.
	 */
	router.post("/enrollments/:enrollmentId/accept", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const db = deps.getDb();
		const enrollmentId = c.req.param("enrollmentId");

		const [owned] = await db
			.select({ studentId: enrollment.studentId })
			.from(enrollment)
			.where(and(eq(enrollment.id, enrollmentId), eq(enrollment.orgId, orgId)));
		if (!owned || owned.studentId !== s.id) {
			return c.json({ error: "enrollment not found" }, 404);
		}

		const result = await activateEnrollment(db, orgId, enrollmentId);
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
	 * GET /api/student/assignments/:assignmentId/quiz — đề sạch cho take.
	 * Ownership: student phải là target của lượt giao (inner join target,
	 * org predicate) — không phải target → 404. Questions lấy từ snapshot
	 * khi attempt tồn tại (RT#3); answer/alts/note không bao giờ xuống wire
	 * (RT#6).
	 */
	router.get("/assignments/:assignmentId/quiz", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const assignmentId = c.req.param("assignmentId");
		const db = deps.getDb();

		const [row] = await db
			.select({
				title: classAssignment.title,
				due: classAssignment.due,
				promptId: classAssignment.promptId,
			})
			.from(classAssignment)
			.innerJoin(
				classAssignmentTarget,
				and(
					eq(classAssignmentTarget.assignmentId, classAssignment.id),
					eq(classAssignmentTarget.orgId, orgId),
					eq(classAssignmentTarget.studentId, s.id),
				),
			)
			.where(
				and(
					eq(classAssignment.id, assignmentId),
					eq(classAssignment.orgId, orgId),
				),
			);
		if (!row) {
			return c.json({ error: "assignment not found" }, 404);
		}

		const [prompt] = await db
			.select()
			.from(assignmentPrompt)
			.where(
				and(
					eq(assignmentPrompt.id, row.promptId),
					eq(assignmentPrompt.orgId, orgId),
				),
			);
		if (!prompt) {
			return c.json({ error: "assignment not found" }, 404);
		}

		const [attempt] = await db
			.select()
			.from(quizAttempt)
			.where(
				and(
					eq(quizAttempt.assignmentId, assignmentId),
					eq(quizAttempt.orgId, orgId),
					eq(quizAttempt.studentId, s.id),
				),
			);

		const questions = parseQuizQuestions(
			attempt ? attempt.questionsSnapshot : prompt.questions,
			attempt?.id ?? row.promptId,
		);

		const detail: StudentQuizDetail = {
			assignmentId,
			title: row.title,
			due: row.due,
			skill: prompt.skill,
			part: prompt.part,
			type: prompt.type,
			band: prompt.band,
			intro: prompt.intro,
			prompt: prompt.prompt,
			passage: prompt.passage,
			transcript: prompt.transcript,
			cueTopic: prompt.cueTopic,
			cuePoints: prompt.cuePoints,
			audioName: prompt.audioName,
			imageUrl: prompt.imageUrl,
			optionBank: parseQuizOptionBank(prompt.optionBank),
			questions: questions.map((question) => ({
				stem: question.stem,
				opts: question.opts,
				pin: question.pin ?? null,
			})),
			attempt: attempt
				? {
						id: attempt.id,
						status: attempt.status as QuizAttemptStatus,
						answers: parseQuizAnswers(attempt.answers),
					}
				: null,
		};
		return c.json(detail);
	});

	/**
	 * POST /api/student/assignments/:assignmentId/quiz/start — snapshot đề
	 * (đầy đủ key) vào attempt lúc start. Idempotent resume: đã có attempt
	 * in_progress → trả lại cùng attemptId; unique-race → re-read (backstop
	 * enrollment-activation.ts:206-209). 409 nếu đã submit (không retake v1).
	 */
	router.post("/assignments/:assignmentId/quiz/start", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const assignmentId = c.req.param("assignmentId");
		const db = deps.getDb();

		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		if (!quizAttemptActionSchema.safeParse(raw).success) {
			return c.json({ error: "invalid body" }, 400);
		}

		const [target] = await db
			.select({ promptId: classAssignment.promptId })
			.from(classAssignment)
			.innerJoin(
				classAssignmentTarget,
				and(
					eq(classAssignmentTarget.assignmentId, classAssignment.id),
					eq(classAssignmentTarget.orgId, orgId),
					eq(classAssignmentTarget.studentId, s.id),
				),
			)
			.where(
				and(
					eq(classAssignment.id, assignmentId),
					eq(classAssignment.orgId, orgId),
				),
			);
		if (!target) {
			return c.json({ error: "assignment not found" }, 404);
		}

		const attemptFilter = and(
			eq(quizAttempt.assignmentId, assignmentId),
			eq(quizAttempt.orgId, orgId),
			eq(quizAttempt.studentId, s.id),
		);
		const [existing] = await db.select().from(quizAttempt).where(attemptFilter);
		if (existing) {
			if (existing.status === "submitted") {
				return c.json({ error: "attempt already submitted" }, 409);
			}
			return c.json({ attemptId: existing.id }, 200);
		}

		const [prompt] = await db
			.select({ questions: assignmentPrompt.questions })
			.from(assignmentPrompt)
			.where(
				and(
					eq(assignmentPrompt.id, target.promptId),
					eq(assignmentPrompt.orgId, orgId),
				),
			);
		if (!prompt) {
			return c.json({ error: "assignment not found" }, 404);
		}

		const attemptId = crypto.randomUUID();
		try {
			await db.insert(quizAttempt).values({
				id: attemptId,
				orgId,
				assignmentId,
				studentId: s.id,
				questionsSnapshot: JSON.stringify(
					parseQuizQuestions(prompt.questions, target.promptId),
				),
				answers: "{}",
				startedAt: new Date(),
			});
			return c.json({ attemptId }, 201);
		} catch (err) {
			// Unique (assignmentId, studentId) race — request đồng thời khác
			// đã insert: re-read và resume attempt đó.
			const [raced] = await db.select().from(quizAttempt).where(attemptFilter);
			if (raced) {
				if (raced.status === "submitted") {
					return c.json({ error: "attempt already submitted" }, 409);
				}
				return c.json({ attemptId: raced.id }, 200);
			}
			throw err;
		}
	});

	/**
	 * PATCH /api/student/attempts/:attemptId/answer — autosave 1 câu.
	 * Atomic json_set (D1 không có transaction — KHÔNG read-modify-write):
	 * ownership = WHERE predicate org+student (IDOR guard, RT#4); path dạng
	 * '$."<q>"' string key nhất quán với JSON lưu. 0 rows → phân biệt 404/409
	 * qua status read sau đó.
	 */
	router.patch("/attempts/:attemptId/answer", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const attemptId = c.req.param("attemptId");
		const db = deps.getDb();

		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		const parsed = quizAnswerPatchSchema.safeParse(raw);
		if (!parsed.success) {
			return c.json({ error: "invalid body" }, 400);
		}
		const { q, value } = parsed.data;

		const owner = and(
			eq(quizAttempt.id, attemptId),
			eq(quizAttempt.orgId, orgId),
			eq(quizAttempt.studentId, s.id),
		);
		const [attempt] = await db
			.select({
				status: quizAttempt.status,
				questionsSnapshot: quizAttempt.questionsSnapshot,
			})
			.from(quizAttempt)
			.where(owner);
		if (!attempt) {
			return c.json({ error: "attempt not found" }, 404);
		}
		if (attempt.status === "submitted") {
			return c.json({ error: "attempt already submitted" }, 409);
		}

		const questions = parseQuizQuestions(attempt.questionsSnapshot, attemptId);
		if (q >= questions.length) {
			return c.json({ error: "question index out of range" }, 400);
		}

		const updated = await db
			.update(quizAttempt)
			.set({
				// q binds as TEXT: a number param renders "3.0" in SQLite string
				// concat and would corrupt the JSON key.
				answers: sql`json_set(${quizAttempt.answers}, '$."' || ${String(q)} || '"', json_quote(${value}))`,
			})
			.where(and(owner, eq(quizAttempt.status, "in_progress")))
			.returning({ id: quizAttempt.id });

		if (updated.length === 0) {
			// Submit xảy ra giữa read và write — phân biệt qua status read.
			const [reread] = await db
				.select({ status: quizAttempt.status })
				.from(quizAttempt)
				.where(owner);
			if (!reread) {
				return c.json({ error: "attempt not found" }, 404);
			}
			return c.json({ error: "attempt already submitted" }, 409);
		}
		return c.json({ ok: true });
	});

	/**
	 * POST /api/student/attempts/:attemptId/submit — flip-first idempotent
	 * (RT#5): CAS UPDATE status in_progress → submitted; thắng CAS mới chấm
	 * từ snapshot + ghi counts + stamp class_assignment_target.submittedAt
	 * trong MỘT db.batch. Thua CAS (double submit) → counts từ data đã
	 * freeze, không ghi gì, không re-stamp.
	 */
	router.post("/attempts/:attemptId/submit", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const attemptId = c.req.param("attemptId");
		const db = deps.getDb();

		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		if (!quizAttemptActionSchema.safeParse(raw).success) {
			return c.json({ error: "invalid body" }, 400);
		}

		const owner = and(
			eq(quizAttempt.id, attemptId),
			eq(quizAttempt.orgId, orgId),
			eq(quizAttempt.studentId, s.id),
		);

		const flipped = await db
			.update(quizAttempt)
			.set({ status: "submitted", submittedAt: new Date() })
			.where(and(owner, eq(quizAttempt.status, "in_progress")))
			.returning({ id: quizAttempt.id });

		const [attempt] = await db
			.select({
				assignmentId: quizAttempt.assignmentId,
				questionsSnapshot: quizAttempt.questionsSnapshot,
				answers: quizAttempt.answers,
			})
			.from(quizAttempt)
			.where(owner);
		if (!attempt) {
			return c.json({ error: "attempt not found" }, 404);
		}

		const questions = parseQuizQuestions(attempt.questionsSnapshot, attemptId);
		const answers = parseQuizAnswers(attempt.answers);
		const grade = gradeQuiz(questions, answers);

		if (flipped.length > 0) {
			// Đóng non-goal #208: write-path đánh dấu đã nộp (ISO datetime).
			const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
				db
					.update(quizAttempt)
					.set({ correctCount: grade.correctCount })
					.where(owner),
				db
					.update(classAssignmentTarget)
					.set({ submittedAt: new Date().toISOString() })
					.where(
						and(
							eq(classAssignmentTarget.orgId, orgId),
							eq(classAssignmentTarget.assignmentId, attempt.assignmentId),
							eq(classAssignmentTarget.studentId, s.id),
						),
					),
			];
			await db.batch(statements);
		}

		return c.json({
			correctCount: grade.correctCount,
			totalCount: grade.totalCount,
			wrongCount: grade.wrongCount,
			skippedCount: grade.skippedCount,
		});
	});

	/**
	 * Loader chung cho summary/detail: ownership predicate + gate 409 khi
	 * in_progress (RT#6) + grade từ snapshot (RT#3). Title/note từ snapshot
	 * của lượt giao + prompt hiện tại.
	 */
	const loadAttemptForReview = async (
		attemptId: string,
		s: typeof student.$inferSelect,
		orgId: string,
	) => {
		const db = deps.getDb();
		const owner = and(
			eq(quizAttempt.id, attemptId),
			eq(quizAttempt.orgId, orgId),
			eq(quizAttempt.studentId, s.id),
		);
		const [attempt] = await db.select().from(quizAttempt).where(owner);
		if (!attempt) return { error: 404 } as const;
		if (attempt.status !== "submitted") return { error: 409 } as const;

		const questions = parseQuizQuestions(attempt.questionsSnapshot, attempt.id);
		const answers = parseQuizAnswers(attempt.answers);
		const grade = gradeQuiz(questions, answers);
		const [header] = await db
			.select({
				title: classAssignment.title,
				note: assignmentPrompt.note,
			})
			.from(classAssignment)
			.innerJoin(
				assignmentPrompt,
				eq(assignmentPrompt.id, classAssignment.promptId),
			)
			.where(
				and(
					eq(classAssignment.id, attempt.assignmentId),
					eq(classAssignment.orgId, orgId),
				),
			);
		return {
			attempt,
			questions,
			answers,
			grade,
			title: header?.title ?? "",
			note: header?.note ?? "",
		};
	};

	/** GET /api/student/attempts/:attemptId — summary sau nộp (409 in_progress). */
	router.get("/attempts/:attemptId", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const loaded = await loadAttemptForReview(
			c.req.param("attemptId"),
			s,
			orgId,
		);
		if ("error" in loaded) {
			return loaded.error === 404
				? c.json({ error: "attempt not found" }, 404)
				: c.json({ error: "attempt not yet submitted" }, 409);
		}
		const { attempt, questions, answers, grade, title } = loaded;
		const summary: QuizAttemptSummary = {
			id: attempt.id,
			assignmentId: attempt.assignmentId,
			title,
			status: "submitted",
			correctCount: grade.correctCount,
			wrongCount: grade.wrongCount,
			skippedCount: grade.skippedCount,
			totalCount: grade.totalCount,
			startedAt: attempt.startedAt.toISOString(),
			submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : "",
			items: questions.map((question, index) => {
				const given = answers[String(index)];
				return {
					verdict: grade.verdicts[index] ?? "skipped",
					key: question.answer,
					answer: given !== undefined && given.trim().length > 0 ? given : null,
				};
			}),
		};
		return c.json(summary);
	});

	/**
	 * GET /api/student/attempts/:attemptId/detail — review đầy đủ sau nộp:
	 * paper từ snapshot + key/alts/verdict/đáp án học viên + note đề
	 * (409 in_progress).
	 */
	router.get("/attempts/:attemptId/detail", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const loaded = await loadAttemptForReview(
			c.req.param("attemptId"),
			s,
			orgId,
		);
		if ("error" in loaded) {
			return loaded.error === 404
				? c.json({ error: "attempt not found" }, 404)
				: c.json({ error: "attempt not yet submitted" }, 409);
		}
		const { attempt, questions, answers, grade, title, note } = loaded;
		const detail: QuizAttemptDetail = {
			id: attempt.id,
			assignmentId: attempt.assignmentId,
			title,
			status: "submitted",
			correctCount: grade.correctCount,
			wrongCount: grade.wrongCount,
			skippedCount: grade.skippedCount,
			totalCount: grade.totalCount,
			startedAt: attempt.startedAt.toISOString(),
			submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : "",
			note,
			questions: questions.map((question, index) => {
				const given = answers[String(index)];
				return {
					stem: question.stem,
					opts: question.opts,
					pin: question.pin ?? null,
					key: question.answer,
					alts: question.alts,
					verdict: grade.verdicts[index] ?? "skipped",
					answer: given !== undefined && given.trim().length > 0 ? given : null,
				};
			}),
		};
		return c.json(detail);
	});

	return router;
}
