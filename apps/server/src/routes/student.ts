import {
	ACCOUNT_ERROR_CODES,
	type AssignmentQuestion,
	DAILY_STUDY_HOUR_OPTIONS,
	type EssayAnnotation,
	EXAM_INTERESTS,
	IELTS_TARGET_BANDS,
	LEARNING_GOAL_OPTIONS,
	type LearningGoalOption,
	QUIZ_ESSAY_BODY_MAX,
	QUIZ_MEDIA_MAX_BYTES,
	type QuizAttemptDetail,
	type QuizAttemptMedia,
	type QuizAttemptStatus,
	type QuizAttemptSummary,
	quizAnswerPatchSchema,
	quizAttemptActionSchema,
	quizEssayPatchSchema,
	STUDENT_ERROR_CODES,
	STUDENT_INVITATION_ERROR_CODES,
	type StudentClassDetail,
	type StudentMe,
	type StudentOrgItem,
	type StudentOverview,
	type StudentQuizDetail,
	studentOnboardingPayloadSchema,
	TOEIC_TARGET_SCORES,
} from "@teacher-os/api/contracts";
import { essayToPlain } from "@teacher-os/api/lib/essay-plain";
import { gradeQuiz } from "@teacher-os/api/lib/grade-quiz";
import { inferQuestionTypes } from "@teacher-os/api/lib/infer-question-types";
import {
	isAllowedQuizMediaType,
	normalizeMediaType,
	sanitizeMediaFileName,
} from "@teacher-os/api/lib/quiz-media";
import {
	assignment,
	assignmentPrompt,
	assignmentTest,
	assignmentTestPart,
	classAssignment,
	classAssignmentTarget,
	classTable,
	enrollment,
	invoice,
	lesson,
	notificationRecord,
	organization,
	quizAttempt,
	student,
	studentInvitation,
	user,
} from "@teacher-os/db/schema/index";
import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Db } from "../app";
import { mediaObjectResponse, toQuizAttemptMedia } from "../lib/media-response";
import { MediaSizeMismatchError, type MediaStore } from "../lib/media-store";
import {
	ensurePaymentRefs,
	loadPaymentInstructions,
} from "../lib/payment-instructions";
import {
	loadEssayAnnotations,
	toPlainAnnotation,
} from "../lib/quiz-annotation";
import { toQuizAttemptGrade } from "../lib/quiz-grade";
import type { SessionUser } from "../session";
import { provisionStudentForUser } from "../student-provisioning";
import { activateEnrollment } from "./enrollment-activation";
import { parsePin } from "./snapshot";
import {
	loadClassAssignmentItems,
	loadNextSession,
	loadOrgTeacher,
	orderStudentLessons,
	studentClassColumns,
	toStudentClass,
} from "./student-class";
import { registerVocabRoutes } from "./vocab";

export interface StudentRouteDeps {
	getDb(): Db;
	getSessionUser(headers: Headers): Promise<SessionUser | null>;
	corsOrigin?: string | string[];
	/** Xem `AppDeps.getMediaStore` — vắng mặt thì route media trả 503. */
	getMediaStore?(): MediaStore | undefined;
	/** Xem `AppDeps.runInBackground`. */
	runInBackground?(promise: Promise<unknown>): void;
}

export interface StudentContext {
	student: typeof student.$inferSelect;
	orgId: string;
	userId: string;
	sessionUser: SessionUser & { email: string };
}

export type StudentEnv = {
	Variables: {
		sessionUser: SessionUser & { email: string };
		studentCtx: StudentContext;
	};
};

/**
 * Guard học viên dùng chung cho mọi route /api/student: nạp dòng student theo
 * email session (tự provision khi email đã verify), chọn org theo header
 * `x-student-org-id` và đặt `studentCtx`. Không khớp → 403 NOT_LINKED /
 * EMAIL_UNVERIFIED.
 */
export function createStudentGuard(deps: StudentRouteDeps) {
	return async (c: Context<StudentEnv>, next: () => Promise<void>) => {
		const sessionUser = c.get("sessionUser");
		if (!sessionUser) {
			return c.json({ error: "unauthorized", code: "UNAUTHORIZED" }, 401);
		}
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
 * fallback style as snapshot.ts parseQuestions: corrupt rows → []). Export
 * cho route tự luyện (#378) — snapshot đề practice dùng CÙNG một bộ làm
 * sạch, không lập convention thứ hai. */
export function parseQuizQuestions(
	raw: string,
	rowId: string,
): AssignmentQuestion[] {
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
					type: typeof record.type === "string" ? record.type : null,
					pin: parsePin(record.pin),
				},
			];
		});
	} catch {
		console.warn(`[student] invalid quiz questions JSON for ${rowId}`);
		return [];
	}
}

/** answers JSON `{"<qIndex>":"<value>"}` → guarded record (corrupt → {}).
 * Export cho route tự luyện (#378) — cùng một bộ làm sạch. */
export function parseQuizAnswers(raw: string): Record<string, string> {
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

/** optionBank JSON string[] → guarded (corrupt/legacy → []). Export cho
 * route tự luyện (#378). */
export function parseQuizOptionBank(raw: string): string[] {
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

/**
 * Guard CSRF + shape JSON dùng chung cho mọi route GHI của quiz domain học
 * viên (RT#2): kiểm Origin trong allowlist, buộc Content-Type application/
 * json, cap body 4096 byte (route /essay #304 cap riêng 48KB). Chỉ PUT/
 * DELETE đúng route media bài nói (#305) được bỏ qua bước JSON + bodyLimit
 * — body raw stream đi thẳng vào R2, handler tự kiểm header + byte thật.
 * Factory dùng chung cho studentRoutes lẫn router tự luyện phase 10 (#378)
 * — router mount ngoài studentRoutes không được thừa hưởng guard.
 */
export function createQuizWriteGuard(allowedOrigins: string[]) {
	return async (
		c: Context<StudentEnv>,
		next: () => Promise<void>,
	): Promise<Response | void> => {
		const method = c.req.method;
		if (
			method === "POST" ||
			method === "PATCH" ||
			method === "PUT" ||
			method === "DELETE"
		) {
			const origin = c.req.header("Origin") ?? "";
			if (!allowedOrigins.includes(origin)) {
				return c.json({ error: "origin not allowed" }, 403);
			}
			if (
				(method === "PUT" || method === "DELETE") &&
				QUIZ_MEDIA_ROUTE_PATH.test(c.req.path)
			) {
				return next();
			}
			const contentType = c.req.header("Content-Type") ?? "";
			if (!contentType.toLowerCase().startsWith("application/json")) {
				return c.json({ error: "content-type must be application/json" }, 415);
			}
			// Cap đo TRÊN BYTE THẬT của body (chunked/malformed
			// Content-Length không lọt) — precedent POST /api/syllabus-templates (syllabus.ts).
			return bodyLimit({
				maxSize: c.req.path.endsWith("/essay") ? QUIZ_ESSAY_BODY_MAX : 4096,
				onError: (bc) => bc.json({ error: "payload too large" }, 413),
			})(c, next);
		}
		return next();
	};
}

const QUIZ_MEDIA_ROUTE_PATH = /^\/api\/student\/attempts\/[^/]+\/media$/;

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

	// CSRF defense cho POST inbox mark-read — cùng contract với /invitations/*.
	router.use("/inbox/*", async (c, next) => {
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

	// Org-Scoped Middleware for /me, /overview, etc. Factory để route cùng
	// domain ở file khác (student-classmates.ts) tái dùng đúng một logic xác
	// thực học viên + chọn org (x-student-org-id).
	const requireStudent = createStudentGuard(deps);

	router.use("/me", requireStudent);
	router.use("/overview", requireStudent);
	router.use("/classes/:classId", requireStudent);
	router.use("/onboarding", requireStudent);
	router.use("/enrollments/:enrollmentId/accept", requireStudent);

	// --- Student quiz take & review (#283) --------------------------------
	// RT#1: requireStudent là closure của studentRoutes() nên mọi endpoint
	// quiz/attempt PHẢI khai báo ngay trong router này (bootstrapMiddleware
	// bỏ qua /api/student — router mount riêng sẽ không có auth).
	router.use("/assignments/:assignmentId/quiz", requireStudent);
	router.use("/assignments/:assignmentId/quiz/*", requireStudent);
	router.use("/attempts/*", requireStudent);
	// #320: Hono use(path) chỉ khớp đúng path — đăng ký cả hai dạng.
	router.use("/invoices", requireStudent);
	router.use("/invoices/*", requireStudent);
	// TOS-21 D7: inbox học viên cần studentCtx (org + student id).
	router.use("/inbox", requireStudent);
	router.use("/inbox/*", requireStudent);

	// In-app inbox học viên (plan TOS-21 D7): 50 dòng mới nhất của chính học
	// viên trong org đang chọn; không trả recipient_email/reply_to_email/last_error.
	router.get("/inbox", async (c) => {
		const ctx = c.get("studentCtx");
		const db = deps.getDb();

		const rows = await db
			.select({
				id: notificationRecord.id,
				eventType: notificationRecord.eventType,
				title: notificationRecord.title,
				body: notificationRecord.body,
				linkPath: notificationRecord.linkPath,
				status: notificationRecord.status,
				readAt: notificationRecord.readAt,
				createdAt: notificationRecord.createdAt,
			})
			.from(notificationRecord)
			.where(
				and(
					eq(notificationRecord.orgId, ctx.orgId),
					eq(notificationRecord.studentId, ctx.student.id),
				),
			)
			.orderBy(desc(notificationRecord.createdAt), desc(notificationRecord.id))
			.limit(50);

		return c.json({
			items: rows.map((row) => ({
				id: row.id,
				eventType: row.eventType,
				title: row.title,
				body: row.body,
				linkPath: row.linkPath,
				status: row.status,
				readAt: row.readAt ? row.readAt.toISOString() : null,
				createdAt: row.createdAt.toISOString(),
			})),
			unread: rows.filter((row) => row.readAt === null).length,
		});
	});

	// Đánh dấu đã đọc: read_at là nguồn chân lý, status chỉ là projection
	// (queued giữ nguyên — deliver sau sẽ chuyển thẳng read khi thấy read_at).
	router.post("/inbox/:id/read", async (c) => {
		const ctx = c.get("studentCtx");
		const id = c.req.param("id");
		const db = deps.getDb();

		const [record] = await db
			.select()
			.from(notificationRecord)
			.where(
				and(
					eq(notificationRecord.id, id),
					eq(notificationRecord.orgId, ctx.orgId),
					eq(notificationRecord.studentId, ctx.student.id),
				),
			);

		if (!record) {
			return c.json({ error: "Không tìm thấy thông báo" }, 404);
		}

		if (record.readAt === null) {
			await db
				.update(notificationRecord)
				.set({
					readAt: new Date(),
					...(record.status === "sent" ? { status: "read" as const } : {}),
				})
				.where(eq(notificationRecord.id, id));
		}

		return c.json({ ok: true });
	});

	const quizWriteGuard = createQuizWriteGuard(allowedOrigins);
	router.use("/assignments/:assignmentId/quiz/*", quizWriteGuard);
	router.use("/attempts/*", quizWriteGuard);

	const ownedAttempt = (attemptId: string, studentId: string, orgId: string) =>
		and(
			eq(quizAttempt.id, attemptId),
			eq(quizAttempt.orgId, orgId),
			eq(quizAttempt.studentId, studentId),
		);

	/**
	 * Attempt của chính học viên + skill của đề (join class_assignment →
	 * assignment_prompt, cả hai có predicate orgId — chuẩn IDOR của quiz
	 * domain). Dùng chung cho essay (#304), media và submit (#305). Skill
	 * immutable trên PATCH prompt nên đọc một lần là đủ cho CAS sau đó.
	 * Attempt tự luyện (phase 10) KHÔNG có class_assignment — skill lấy từ
	 * `assignment_test` qua `test_id` (đề xoá/set null → skill rỗng, route
	 * gọi xử lý như attempt lạ).
	 */
	const loadOwnedAttemptWithSkill = async (
		attemptId: string,
		studentId: string,
		orgId: string,
	) => {
		const [row] = await deps
			.getDb()
			.select({
				status: quizAttempt.status,
				mode: quizAttempt.mode,
				testId: quizAttempt.testId,
				skill: assignmentPrompt.skill,
				testSkill: assignmentTest.skill,
				mediaKey: quizAttempt.mediaKey,
				mediaName: quizAttempt.mediaName,
				mediaType: quizAttempt.mediaType,
				mediaSize: quizAttempt.mediaSize,
				mediaUploadedAt: quizAttempt.mediaUploadedAt,
			})
			.from(quizAttempt)
			.leftJoin(
				classAssignment,
				and(
					eq(classAssignment.id, quizAttempt.assignmentId),
					eq(classAssignment.orgId, orgId),
				),
			)
			.leftJoin(
				assignmentPrompt,
				and(
					eq(assignmentPrompt.id, classAssignment.promptId),
					eq(assignmentPrompt.orgId, orgId),
				),
			)
			.leftJoin(
				assignmentTest,
				and(
					eq(assignmentTest.id, quizAttempt.testId),
					eq(assignmentTest.orgId, orgId),
				),
			)
			.where(ownedAttempt(attemptId, studentId, orgId));
		if (!row) return row;
		if (row.mode === "practice") {
			// Đề gốc bị xoá (test_id set null) → skill rỗng: caller gate speaking
			// theo skill nên attempt rơi về luồng tự chấm an toàn.
			return { ...row, skill: row.testSkill ?? "" };
		}
		return row;
	};

	/** Việc dọn dẹp sau response (xoá object R2 bù trừ) — không bao giờ làm
	 * fail request; lỗi chỉ log (precedent provisioning ở trên). */
	const inBackground = (label: string, work: () => Promise<unknown>) => {
		const promise = work().catch((error: unknown) => {
			console.error(`[student-media] ${label} failed`, { error });
		});
		if (deps.runInBackground) deps.runInBackground(promise);
	};

	const ATTEMPT_SUBMITTED = {
		error: "attempt already submitted",
		code: "ATTEMPT_SUBMITTED",
	} as const;
	const MEDIA_CONFLICT = {
		error: "media changed",
		code: "MEDIA_CONFLICT",
	} as const;

	router.get("/me", (c) => {
		const { student: s, sessionUser } = c.get("studentCtx");
		return c.json(buildStudentMe(sessionUser, s));
	});

	// #320: tuition invoices of THIS student in the CURRENT org only.
	router.get("/invoices", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const db = deps.getDb();
		const rows = await db
			.select({
				id: invoice.id,
				amount: invoice.amount,
				paidAmount: invoice.paidAmount,
				status: invoice.status,
				due: invoice.due,
				type: invoice.type,
			})
			.from(invoice)
			.where(and(eq(invoice.orgId, orgId), eq(invoice.studentId, s.id)))
			.orderBy(asc(invoice.createdAt), asc(invoice.id));
		return c.json(
			rows.map((row) => ({
				id: row.id,
				invoiceCode: `INV-${row.id.slice(-8).toUpperCase()}`,
				amount: row.amount,
				paidAmount: row.paidAmount,
				amountDue: Math.max(row.amount - row.paidAmount, 0),
				status: row.status,
				due: row.due,
				type: row.type,
			})),
		);
	});

	router.get("/invoices/:id/payment", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const db = deps.getDb();
		const [row] = await db
			.select()
			.from(invoice)
			.where(
				and(
					eq(invoice.id, c.req.param("id")),
					eq(invoice.orgId, orgId),
					eq(invoice.studentId, s.id),
				),
			)
			.limit(1);
		if (!row) return c.json({ error: "invoice not found" }, 404);
		const refs = await ensurePaymentRefs(db, row.id, orgId);
		if (!refs) return c.json({ error: "invoice not found" }, 404);
		const instructions = await loadPaymentInstructions({ db, invoice: refs });
		return c.json(instructions);
	});

	router.get("/overview", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const db = deps.getDb();
		const now = new Date();

		const [enrollmentRows, teacher] = await Promise.all([
			db
				.select(studentClassColumns)
				.from(enrollment)
				.innerJoin(classTable, eq(enrollment.classId, classTable.id))
				.where(and(eq(enrollment.orgId, orgId), eq(enrollment.studentId, s.id)))
				.orderBy(asc(classTable.createdAt), asc(classTable.id)),
			loadOrgTeacher(db, orgId),
		]);

		const classes = await Promise.all(
			enrollmentRows.map(async (cls) =>
				toStudentClass(
					cls,
					await loadNextSession(db, orgId, cls.id, now),
					teacher,
				),
			),
		);

		const classAssignmentItems = await loadClassAssignmentItems(
			db,
			orgId,
			s.id,
		);

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

	router.get("/classes/:classId", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const classId = c.req.param("classId");
		const db = deps.getDb();

		// IDOR guard: chỉ enrollment `active` của chính học viên trong org đang
		// chọn. Lớp org khác, lớp không ghi danh và enrollment `invited` đều 404.
		const [row] = await db
			.select({ ...studentClassColumns, startDate: classTable.startDate })
			.from(enrollment)
			.innerJoin(classTable, eq(enrollment.classId, classTable.id))
			.where(
				and(
					eq(enrollment.orgId, orgId),
					eq(enrollment.studentId, s.id),
					eq(enrollment.classId, classId),
					eq(enrollment.status, "active"),
				),
			)
			.limit(1);
		if (!row) return c.json({ error: "class not found" }, 404);

		const now = new Date();
		const [teacher, nextSession, lessons, assignments] = await Promise.all([
			loadOrgTeacher(db, orgId),
			loadNextSession(db, orgId, row.id, now),
			// Lọc theo enrollment (không theo lớp) để trạng thái riêng như
			// "vắng" là của chính học viên. `date` null theo cả lớp nên không
			// cần NULLS LAST; lớp legacy được sắp lại bởi orderStudentLessons.
			db
				.select({
					id: lesson.id,
					date: lesson.date,
					day: lesson.day,
					time: lesson.time,
					dur: lesson.dur,
					status: lesson.status,
					topic: lesson.topic,
				})
				.from(lesson)
				.where(
					and(
						eq(lesson.orgId, orgId),
						eq(lesson.enrollmentId, row.enrollmentId),
					),
				)
				.orderBy(
					asc(lesson.date),
					asc(lesson.day),
					asc(lesson.time),
					asc(lesson.id),
				),
			loadClassAssignmentItems(db, orgId, s.id, row.id),
		]);

		const response: StudentClassDetail = {
			class: {
				...toStudentClass(row, nextSession, teacher),
				startDate: row.startDate,
			},
			lessons: orderStudentLessons(lessons),
			assignments,
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

		const effectiveTypes = inferQuestionTypes(questions, prompt.type);

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
			cueTopic: prompt.cueTopic,
			cuePoints: prompt.cuePoints,
			audioName: prompt.audioName,
			imageUrl: prompt.imageUrl,
			optionBank: parseQuizOptionBank(prompt.optionBank),
			// Speaking (#305) không có đáp án — "Hướng dẫn thêm" là hướng dẫn
			// cho học viên. Skill khác giữ kín note tới sau khi nộp (RT#6).
			...(prompt.skill === "speaking" ? { note: prompt.note } : {}),
			questions: questions.map((question, index) => ({
				stem: question.stem,
				opts: question.opts,
				// Type hiệu dụng của câu: type riêng (đề trộn dạng) ?? type
				// prompt — payload student luôn có type cụ thể để client phân
				// cụm; snapshot cũ parse `type: null` cũng fallback về đây. Câu
				// không khai type trong đề điền chữ mà đáp án là T/F/NG (hoặc
				// Y/N/NG) được suy ra tfng/ynng để học viên có lựa chọn.
				type: effectiveTypes[index] ?? prompt.type,
				pin: question.pin ?? null,
			})),
			attempt: attempt
				? {
						id: attempt.id,
						status: attempt.status as QuizAttemptStatus,
						answers: parseQuizAnswers(attempt.answers),
						essay:
							prompt.skill === "writing"
								? essayToPlain(attempt.essay).text
								: attempt.essay,
						media: toQuizAttemptMedia(attempt),
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
	 * PATCH /api/student/attempts/:attemptId/essay — autosave bài viết
	 * Writing (#304). Tách khỏi PATCH /answer và map `answers` vì map đó
	 * gắn index câu hỏi, cap 500 ký tự và đi vào gradeQuiz, trong khi đề
	 * Writing luôn có `questions: []` (key `0` của essay không bao giờ đụng
	 * namespace answer thật). Chỉ đề Writing ghi được: skill đọc từ
	 * `assignment_prompt` qua join class_assignment (invariant "skill
	 * immutable trên PATCH prompt" — đã pin bởi test của route assignments).
	 * Body cap 48KB riêng cho route này (quizWriteGuard); UPDATE có điều
	 * kiện `status = 'in_progress'` (CAS, cùng precedent PATCH answer — D1
	 * không có transaction).
	 */
	router.patch("/attempts/:attemptId/essay", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const attemptId = c.req.param("attemptId");
		const db = deps.getDb();

		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		const parsed = quizEssayPatchSchema.safeParse(raw);
		if (!parsed.success) {
			return c.json({ error: "invalid body" }, 400);
		}

		const owner = ownedAttempt(attemptId, s.id, orgId);
		const attempt = await loadOwnedAttemptWithSkill(attemptId, s.id, orgId);
		if (!attempt) {
			return c.json({ error: "attempt not found" }, 404);
		}
		if (attempt.status === "submitted") {
			return c.json({ error: "attempt already submitted" }, 409);
		}
		if (attempt.skill !== "writing") {
			return c.json({ error: "essay not allowed" }, 400);
		}

		const updated = await db
			.update(quizAttempt)
			.set({ essay: parsed.data.text })
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
	 * PUT /api/student/attempts/:attemptId/media — tải lên file bài nói
	 * Speaking (#305), 1 file mỗi attempt. Raw body (không multipart) stream
	 * thẳng vào MediaStore; tên file qua header `X-File-Name`
	 * (encodeURIComponent). Kiểm rẻ trước (header), DB sau, R2 cuối. Mỗi lần
	 * upload sinh object key mới rồi ghi CAS theo key cũ (D1 không có
	 * transaction): DB không bao giờ trỏ vào object đang bị ghi đè; thua CAS
	 * thì object mới bị xoá bù, thắng thì object cũ bị xoá (best-effort, qua
	 * runInBackground). quizWriteGuard đã kiểm Origin và cố ý bỏ qua
	 * bodyLimit cho route này — cap 50MB đo trên byte thật trong store.
	 */
	router.put("/attempts/:attemptId/media", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const attemptId = c.req.param("attemptId");
		const store = deps.getMediaStore?.();
		if (!store) {
			return c.json({ error: "media storage unavailable" }, 503);
		}

		const lengthHeader = c.req.header("Content-Length");
		const size =
			lengthHeader !== undefined && /^\d+$/.test(lengthHeader)
				? Number(lengthHeader)
				: Number.NaN;
		if (!Number.isSafeInteger(size)) {
			return c.json({ error: "length required" }, 411);
		}
		if (size === 0) {
			return c.json({ error: "empty file" }, 400);
		}
		if (size > QUIZ_MEDIA_MAX_BYTES) {
			return c.json({ error: "payload too large" }, 413);
		}
		const contentType = normalizeMediaType(c.req.header("Content-Type") ?? "");
		if (!isAllowedQuizMediaType(contentType)) {
			return c.json({ error: "unsupported media type" }, 415);
		}
		let name: string | null = null;
		try {
			name = sanitizeMediaFileName(
				decodeURIComponent(c.req.header("X-File-Name") ?? ""),
			);
		} catch {
			name = null;
		}
		if (name === null) {
			return c.json({ error: "invalid file name" }, 400);
		}

		const attempt = await loadOwnedAttemptWithSkill(attemptId, s.id, orgId);
		if (!attempt) {
			return c.json({ error: "attempt not found" }, 404);
		}
		if (attempt.status === "submitted") {
			return c.json(ATTEMPT_SUBMITTED, 409);
		}
		if (attempt.skill !== "speaking") {
			return c.json({ error: "media not allowed" }, 400);
		}
		const body = c.req.raw.body;
		if (body === null) {
			return c.json({ error: "empty file" }, 400);
		}

		const oldKey = attempt.mediaKey;
		const newKey = `quiz-media/${orgId}/${attemptId}/${crypto.randomUUID()}`;
		const discardNew = () =>
			inBackground("discard new object", () => store.delete(newKey));
		try {
			await store.put(newKey, body, { contentType, size });
		} catch (error) {
			discardNew();
			if (error instanceof MediaSizeMismatchError) {
				return c.json({ error: "size mismatch" }, 400);
			}
			throw error;
		}

		const owner = ownedAttempt(attemptId, s.id, orgId);
		const uploadedAt = new Date();
		let updated: { id: string }[];
		try {
			updated = await deps
				.getDb()
				.update(quizAttempt)
				.set({
					mediaKey: newKey,
					mediaName: name,
					mediaType: contentType,
					mediaSize: size,
					mediaUploadedAt: uploadedAt,
				})
				.where(
					and(
						owner,
						eq(quizAttempt.status, "in_progress"),
						oldKey === null
							? isNull(quizAttempt.mediaKey)
							: eq(quizAttempt.mediaKey, oldKey),
					),
				)
				.returning({ id: quizAttempt.id });
		} catch (error) {
			discardNew();
			throw error;
		}

		if (updated.length === 0) {
			discardNew();
			const reread = await loadOwnedAttemptWithSkill(attemptId, s.id, orgId);
			if (!reread) {
				return c.json({ error: "attempt not found" }, 404);
			}
			if (reread.status === "submitted") {
				return c.json(ATTEMPT_SUBMITTED, 409);
			}
			return c.json(MEDIA_CONFLICT, 409);
		}

		if (oldKey !== null) {
			inBackground("delete replaced object", () => store.delete(oldKey));
		}
		const media: QuizAttemptMedia = {
			name,
			type: contentType,
			size,
			uploadedAt: uploadedAt.toISOString(),
		};
		return c.json({ media });
	});

	/**
	 * DELETE /api/student/attempts/:attemptId/media — gỡ file bài nói trước
	 * khi nộp (#305). Idempotent khi chưa có file; CAS theo key hiện tại như
	 * PUT, object bị xoá best-effort sau khi DB đã gỡ tham chiếu.
	 */
	router.delete("/attempts/:attemptId/media", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const attemptId = c.req.param("attemptId");
		const store = deps.getMediaStore?.();
		if (!store) {
			return c.json({ error: "media storage unavailable" }, 503);
		}
		const attempt = await loadOwnedAttemptWithSkill(attemptId, s.id, orgId);
		if (!attempt) {
			return c.json({ error: "attempt not found" }, 404);
		}
		if (attempt.status === "submitted") {
			return c.json(ATTEMPT_SUBMITTED, 409);
		}
		if (attempt.skill !== "speaking") {
			return c.json({ error: "media not allowed" }, 400);
		}
		const oldKey = attempt.mediaKey;
		if (oldKey === null) {
			return c.json({ ok: true });
		}

		const updated = await deps
			.getDb()
			.update(quizAttempt)
			.set({
				mediaKey: null,
				mediaName: null,
				mediaType: null,
				mediaSize: null,
				mediaUploadedAt: null,
			})
			.where(
				and(
					ownedAttempt(attemptId, s.id, orgId),
					eq(quizAttempt.status, "in_progress"),
					eq(quizAttempt.mediaKey, oldKey),
				),
			)
			.returning({ id: quizAttempt.id });
		if (updated.length === 0) {
			const reread = await loadOwnedAttemptWithSkill(attemptId, s.id, orgId);
			if (!reread) {
				return c.json({ error: "attempt not found" }, 404);
			}
			if (reread.status === "submitted") {
				return c.json(ATTEMPT_SUBMITTED, 409);
			}
			// DELETE song song (2 tab / double-click) đã gỡ file — trạng thái
			// mong muốn đã đạt, giữ idempotent thay vì báo conflict.
			if (reread.mediaKey === null) {
				return c.json({ ok: true });
			}
			return c.json(MEDIA_CONFLICT, 409);
		}
		inBackground("delete removed object", () => store.delete(oldKey));
		return c.json({ ok: true });
	});

	/**
	 * GET /api/student/attempts/:attemptId/media — phát lại file bài nói cho
	 * chủ attempt ở mọi trạng thái (#305). Content-Type lấy từ DB (đã kiểm
	 * allowlist lúc upload); `nosniff` + CSP sandbox để file giả MIME không
	 * chạy được như HTML. CORP `same-site` được set ở app.ts (secureHeaders
	 * global ghi đè header của handler).
	 */
	router.get("/attempts/:attemptId/media", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const attemptId = c.req.param("attemptId");
		const store = deps.getMediaStore?.();
		if (!store) {
			return c.json({ error: "media storage unavailable" }, 503);
		}
		const [attempt] = await deps
			.getDb()
			.select({
				mediaKey: quizAttempt.mediaKey,
				mediaName: quizAttempt.mediaName,
				mediaType: quizAttempt.mediaType,
			})
			.from(quizAttempt)
			.where(ownedAttempt(attemptId, s.id, orgId));
		if (!attempt || attempt.mediaKey === null) {
			return c.json({ error: "media not found" }, 404);
		}
		const object = await store.get(attempt.mediaKey);
		if (!object) {
			return c.json({ error: "media not found" }, 404);
		}
		return mediaObjectResponse(object, attempt);
	});

	/**
	 * POST /api/student/attempts/:attemptId/submit — flip-first idempotent
	 * (RT#5): CAS UPDATE status in_progress → submitted; thắng CAS mới chấm
	 * từ snapshot + ghi counts + stamp class_assignment_target.submittedAt
	 * trong MỘT db.batch. Thua CAS (double submit) → counts từ data đã
	 * freeze; nếu stamp submittedAt còn thiếu (batch hỏng sau flip ở request
	 * trước) → re-stamp idempotent để tự chữa.
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

		const owner = ownedAttempt(attemptId, s.id, orgId);

		// Đề Speaking (#305) chỉ nộp được khi đã có file: predicate nằm ngay
		// trong câu UPDATE flip nên atomic với DELETE media song song. Attempt
		// không tồn tại → skill undefined → giữ luồng cũ (404 ở re-read).
		const header = await loadOwnedAttemptWithSkill(attemptId, s.id, orgId);
		const requiresMedia = header?.skill === "speaking";

		const flipped = await db
			.update(quizAttempt)
			.set({ status: "submitted", submittedAt: new Date() })
			.where(
				and(
					owner,
					eq(quizAttempt.status, "in_progress"),
					requiresMedia ? isNotNull(quizAttempt.mediaKey) : undefined,
				),
			)
			.returning({ id: quizAttempt.id });

		const [attempt] = await db
			.select({
				status: quizAttempt.status,
				mediaKey: quizAttempt.mediaKey,
				mode: quizAttempt.mode,
				assignmentId: quizAttempt.assignmentId,
				questionsSnapshot: quizAttempt.questionsSnapshot,
				answers: quizAttempt.answers,
			})
			.from(quizAttempt)
			.where(owner);
		if (!attempt) {
			return c.json({ error: "attempt not found" }, 404);
		}
		// Thua flip mà attempt vẫn đang làm (chỉ xảy ra với predicate media):
		// trả lỗi TRƯỚC nhánh self-heal — nhánh đó stamp submittedAt của lượt
		// giao và chỉ đúng khi attempt thật sự đã submitted.
		if (flipped.length === 0 && attempt.status !== "submitted") {
			return attempt.mediaKey === null
				? c.json({ error: "media required", code: "MEDIA_REQUIRED" }, 400)
				: c.json(MEDIA_CONFLICT, 409);
		}

		const questions = parseQuizQuestions(attempt.questionsSnapshot, attemptId);
		const answers = parseQuizAnswers(attempt.answers);
		const grade = gradeQuiz(questions, answers);

		// Đóng non-goal #208: write-path đánh dấu đã nộp (ISO datetime).
		// Attempt tự luyện (phase 10) KHÔNG có class_assignment_target — chỉ ghi
		// correctCount, không đụng trạng thái nộp của lượt giao.
		const isPractice = attempt.mode === "practice";
		const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
			db
				.update(quizAttempt)
				.set({ correctCount: grade.correctCount })
				.where(owner),
		];
		if (!isPractice && attempt.assignmentId !== null) {
			statements.push(
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
			);
		}

		if (flipped.length > 0) {
			await db.batch(statements);
		} else if (isPractice) {
			// Double-submit practice: grade thuần từ data đã freeze — ghi lặp vô
			// hại, không có target stamp nào cần tự chữa.
			await db.batch(statements);
		} else {
			// Request trước có thể đã thắng flip nhưng db.batch hỏng ngay sau
			// đó (D1 transient) — stamp mất vĩnh viễn nếu không tự chữa. Grade
			// thuần từ data đã freeze nên ghi lặp vô hại.
			const assignmentId = attempt.assignmentId;
			if (assignmentId === null) {
				return c.json({ error: "attempt not found" }, 404);
			}
			const [target] = await db
				.select({ submittedAt: classAssignmentTarget.submittedAt })
				.from(classAssignmentTarget)
				.where(
					and(
						eq(classAssignmentTarget.orgId, orgId),
						eq(classAssignmentTarget.assignmentId, assignmentId),
						eq(classAssignmentTarget.studentId, s.id),
					),
				);
			if (target && target.submittedAt === null) {
				await db.batch(statements);
			}
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
		// Header đề: luồng assignment join class_assignment → prompt như cũ;
		// luồng tự luyện (phase 10) lấy title/skill từ assignment_test và
		// note/type/part từ prompt của part ĐẦU (position thấp nhất) — phần
		// chrome hiển thị của review. Đề đã xoá (test_id set null) → leftJoin
		// trả 1 row null → title/skill rỗng, attempt vẫn review được.
		const header = await (attempt.mode === "practice"
			? deps
					.getDb()
					.select({
						title: assignmentTest.title,
						note: assignmentPrompt.note,
						type: assignmentPrompt.type,
						skill: assignmentTest.skill,
						part: assignmentPrompt.part,
					})
					.from(assignmentTest)
					.leftJoin(
						assignmentTestPart,
						eq(assignmentTestPart.testId, assignmentTest.id),
					)
					.leftJoin(
						assignmentPrompt,
						and(
							eq(assignmentPrompt.id, assignmentTestPart.promptId),
							eq(assignmentPrompt.orgId, orgId),
						),
					)
					.where(
						and(
							// CHECK DB ép practice ⇒ test_id NOT NULL — `?? ""` chỉ
							// để thu hẹp kiểu, id "" không khớp row nào.
							eq(assignmentTest.id, attempt.testId ?? ""),
							eq(assignmentTest.orgId, orgId),
						),
					)
					.orderBy(asc(assignmentTestPart.position))
					.limit(1)
			: deps
					.getDb()
					.select({
						title: classAssignment.title,
						note: assignmentPrompt.note,
						type: assignmentPrompt.type,
						skill: assignmentPrompt.skill,
						part: assignmentPrompt.part,
					})
					.from(classAssignment)
					.innerJoin(
						assignmentPrompt,
						and(
							eq(assignmentPrompt.id, classAssignment.promptId),
							eq(assignmentPrompt.orgId, orgId),
						),
					)
					.where(
						and(
							// Attempt assignment luôn có lượt giao (CHECK DB) —
							// `?? ""` chỉ để thu hẹp kiểu.
							eq(classAssignment.id, attempt.assignmentId ?? ""),
							eq(classAssignment.orgId, orgId),
						),
					));
		return {
			attempt,
			questions,
			answers,
			grade,
			title: header[0]?.title ?? "",
			note: header[0]?.note ?? "",
			promptType: header[0]?.type ?? "",
			skill: header[0]?.skill ?? "",
			part: header[0]?.part ?? "",
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
		const { attempt, questions, answers, grade, title, skill, part } = loaded;
		const essayView = skill === "writing" ? essayToPlain(attempt.essay) : null;
		const summary: QuizAttemptSummary = {
			id: attempt.id,
			// Tự luyện không có lượt giao — chuỗi rỗng; client dùng cặp
			// practice/testId bên dưới để dựng điều hướng.
			assignmentId: attempt.assignmentId ?? "",
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
			// Bài Writing lộ kèm số từ ở summary (#304); đề khác luôn null.
			essay: essayView ? essayView.text : null,
			// Bài nói Speaking (#305) — summary rẽ nhánh theo skill.
			skill,
			media: skill === "speaking" ? toQuizAttemptMedia(attempt) : null,
		};
		// Tự luyện (phase 10): CHỈ thêm cặp key khi là attempt practice —
		// bundle cũ (strict) không vỡ với attempt assignment.
		if (attempt.mode === "practice") {
			summary.practice = true;
			if (attempt.testId) summary.testId = attempt.testId;
		}
		// Điểm giáo viên chấm: CHỈ thêm key khi đã chấm — bundle cũ (schema
		// strict) không vỡ ở attempt chưa chấm.
		const teacherGrade = toQuizAttemptGrade(attempt);
		if (!teacherGrade) return c.json(summary);
		summary.grade = teacherGrade;
		summary.part = part;
		// Highlight + ghi chú (#332): CHỈ thêm khi đã chấm + Writing + có
		// ít nhất 1 highlight — học viên không thấy highlight dở dang;
		// bundle cũ (strict) chỉ lỗi parse ở đúng attempt này.
		if (skill === "writing" && essayView) {
			const rawAnnotations = await loadEssayAnnotations(
				deps.getDb(),
				attempt.id,
				orgId,
			);
			const annotations = rawAnnotations
				.map((a) => toPlainAnnotation(essayView, a))
				.filter((a): a is EssayAnnotation => a !== null);
			if (annotations.length > 0) summary.annotations = annotations;
		}
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
		const {
			attempt,
			questions,
			answers,
			grade,
			title,
			note,
			promptType,
			skill,
		} = loaded;
		const effectiveTypes = inferQuestionTypes(questions, promptType);
		const detail: QuizAttemptDetail = {
			id: attempt.id,
			// Tự luyện không có lượt giao — chuỗi rỗng; cặp practice/testId bên
			// dưới là nguồn điều hướng của client.
			assignmentId: attempt.assignmentId ?? "",
			title,
			status: "submitted",
			correctCount: grade.correctCount,
			wrongCount: grade.wrongCount,
			skippedCount: grade.skippedCount,
			totalCount: grade.totalCount,
			startedAt: attempt.startedAt.toISOString(),
			submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : "",
			note,
			// Bài Writing lộ ở review-detail (#304); đề khác luôn null.
			essay: skill === "writing" ? essayToPlain(attempt.essay).text : null,
			skill,
			media: skill === "speaking" ? toQuizAttemptMedia(attempt) : null,
			questions: questions.map((question, index) => {
				const given = answers[String(index)];
				return {
					stem: question.stem,
					opts: question.opts,
					// Type hiệu dụng như take payload (gồm suy luận tfng/ynng) —
					// review screen phân cụm cùng cấu trúc bài làm.
					type: effectiveTypes[index] ?? promptType,
					pin: question.pin ?? null,
					key: question.answer,
					alts: question.alts,
					verdict: grade.verdicts[index] ?? "skipped",
					answer: given !== undefined && given.trim().length > 0 ? given : null,
				};
			}),
		};
		if (attempt.mode === "practice") {
			detail.practice = true;
			if (attempt.testId) detail.testId = attempt.testId;
		}
		return c.json(detail);
	});

	registerVocabRoutes(router, deps, requireStudent, allowedOrigins);

	return router;
}
